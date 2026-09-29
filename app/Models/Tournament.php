<?php

namespace App\Models;

use App\Events\TournamentMatchReady;
use App\Support\Achievements;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * An 8-player single-elimination bracket of friendly duels (no rating, energy or XP). It
 * opens for sign-ups, starts the moment the eighth player joins, and runs itself: each
 * finished duel sends its winner to the next round, whose match starts as soon as both
 * players are free.
 *
 * @property int $id
 * @property string $name
 * @property string $mode
 * @property string $status
 * @property int|null $created_by
 * @property int|null $winner_id
 * @property CarbonImmutable|null $started_at
 * @property CarbonImmutable|null $finished_at
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 * @property-read User|null $winner
 * @property-read User|null $creator
 */
#[Fillable(['name', 'mode', 'status', 'created_by', 'winner_id', 'started_at', 'finished_at'])]
class Tournament extends Model
{
    public const SIZE = 8;

    public const ROUNDS = 3;

    public const STATUS_OPEN = 'open';

    public const STATUS_RUNNING = 'running';

    public const STATUS_FINISHED = 'finished';

    /** A longer lead-in than a queued match: players may be on another page when it starts. */
    public const MATCH_COUNTDOWN_SECONDS = 20;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    /**
     * @return HasMany<TournamentPlayer, $this>
     */
    public function players(): HasMany
    {
        return $this->hasMany(TournamentPlayer::class);
    }

    /**
     * @return HasMany<TournamentMatch, $this>
     */
    public function matches(): HasMany
    {
        return $this->hasMany(TournamentMatch::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function winner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'winner_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public static function roundName(int $round): string
    {
        return match (self::ROUNDS - $round) {
            0 => 'Final',
            1 => 'Semifinal',
            default => 'Quarterfinal',
        };
    }

    /**
     * The open or running tournament a player is still in (not knocked out), if any.
     */
    public static function activeFor(User $user): ?self
    {
        return self::query()
            ->whereIn('status', [self::STATUS_OPEN, self::STATUS_RUNNING])
            ->whereHas('players', fn ($query) => $query->where('user_id', $user->id)->whereNull('eliminated_at'))
            ->first();
    }

    /**
     * Open a new tournament with its creator signed up.
     */
    public static function openBy(User $creator, string $mode): self
    {
        self::ensureFree($creator);

        return DB::transaction(function () use ($creator, $mode) {
            $number = self::query()->where('mode', $mode)->count() + 1;
            $tournament = self::create([
                'name' => ($mode === Duel::MODE_RACE ? 'Race' : 'Battle')." Cup #{$number}",
                'mode' => $mode,
                'status' => self::STATUS_OPEN,
                'created_by' => $creator->id,
            ]);
            $tournament->players()->create(['user_id' => $creator->id]);

            return $tournament;
        });
    }

    /**
     * Sign a player up. The eighth sign-up starts the tournament.
     */
    public function join(User $user): void
    {
        self::ensureFree($user);

        $started = DB::transaction(function () use ($user) {
            $tournament = self::query()->lockForUpdate()->findOrFail($this->id);

            $signedUp = $tournament->players()->count();

            if ($tournament->status !== self::STATUS_OPEN || $signedUp >= self::SIZE) {
                throw ValidationException::withMessages(['tournament' => __('This tournament is already full.')]);
            }

            $tournament->players()->create(['user_id' => $user->id]);

            if ($signedUp + 1 < self::SIZE) {
                return false;
            }

            $tournament->seedBracket();

            return true;
        });

        $this->refresh();

        if ($started) {
            $this->startReadyMatches();
        }
    }

    /**
     * Drop out before it starts. An empty tournament is removed.
     */
    public function leave(User $user): void
    {
        DB::transaction(function () use ($user) {
            $tournament = self::query()->lockForUpdate()->findOrFail($this->id);

            if ($tournament->status !== self::STATUS_OPEN) {
                throw ValidationException::withMessages(['tournament' => __('The tournament has already started.')]);
            }

            $tournament->players()->where('user_id', $user->id)->delete();

            if ($tournament->players()->doesntExist()) {
                $tournament->delete();
            }
        });
    }

    /**
     * Once a tournament duel settles: its winner advances (a draw goes to the higher seed),
     * the loser is out, and any match that's now ready begins.
     */
    public static function duelFinished(Duel $duel): void
    {
        $match = TournamentMatch::query()->where('duel_id', $duel->id)->first();

        if ($match === null) {
            // Players freed up by a regular duel may have a bracket match waiting.
            self::startWaitingMatchesFor([$duel->player_one_id, $duel->player_two_id]);

            return;
        }

        $tournament = DB::transaction(function () use ($match, $duel) {
            $tournament = self::query()->lockForUpdate()->findOrFail($match->tournament_id);
            $match = TournamentMatch::query()->lockForUpdate()->findOrFail($match->id);

            if ($match->winner_id === null) {
                $tournament->advance($match, $duel->winner_id ?? $tournament->higherSeed($match));
            }

            return $tournament;
        });

        $tournament->startReadyMatches();
        self::startWaitingMatchesFor([$duel->player_one_id, $duel->player_two_id]);
    }

    /**
     * Start every match whose two players are known and not busy in another duel.
     */
    public function startReadyMatches(): void
    {
        $ready = $this->matches()->whereNull('duel_id')->whereNull('winner_id')
            ->whereNotNull('player_one_id')->whereNotNull('player_two_id')->get(['id']);

        foreach ($ready as $candidate) {
            $duel = DB::transaction(function () use ($candidate) {
                $match = TournamentMatch::query()->lockForUpdate()->findOrFail($candidate->id);
                $players = User::query()->whereKey([$match->player_one_id, $match->player_two_id])->get()->keyBy('id');

                if (! $match->isReady() || $players->count() < 2
                    || $players->contains(fn (User $player) => Duel::activeFor($player) !== null)) {
                    return null;
                }

                $duel = Duel::start(
                    $players[$match->player_one_id],
                    $players[$match->player_two_id],
                    $this->mode,
                    ranked: false,
                    countdownSeconds: self::MATCH_COUNTDOWN_SECONDS,
                );
                $match->update(['duel_id' => $duel->id]);

                return $duel;
            });

            if ($duel !== null) {
                TournamentMatchReady::dispatch($duel, $this);
            }
        }
    }

    /**
     * @param  list<int>  $userIds
     */
    public static function startWaitingMatchesFor(array $userIds): void
    {
        self::query()
            ->where('status', self::STATUS_RUNNING)
            ->whereHas('matches', fn ($query) => $query->whereNull('duel_id')->whereNull('winner_id')
                ->where(fn ($query) => $query->whereIn('player_one_id', $userIds)->orWhereIn('player_two_id', $userIds)))
            ->get()
            ->each(fn (self $tournament) => $tournament->startReadyMatches());
    }

    /**
     * Draw random seeds and lay out the whole bracket; round 1 is filled in.
     */
    private function seedBracket(): void
    {
        $players = $this->players()->get()->shuffle()->values();

        foreach ($players as $i => $player) {
            $player->update(['seed' => $i + 1]);
        }

        for ($round = 1; $round <= self::ROUNDS; $round++) {
            $matches = self::SIZE >> $round;

            for ($position = 0; $position < $matches; $position++) {
                $this->matches()->create([
                    'round' => $round,
                    'position' => $position,
                    'player_one_id' => $round === 1 ? $players[$position * 2]->user_id : null,
                    'player_two_id' => $round === 1 ? $players[$position * 2 + 1]->user_id : null,
                ]);
            }
        }

        $this->update(['status' => self::STATUS_RUNNING, 'started_at' => now()]);
    }

    private function advance(TournamentMatch $match, int $winnerId): void
    {
        $loserId = $winnerId === $match->player_one_id ? $match->player_two_id : $match->player_one_id;

        $match->update(['winner_id' => $winnerId]);
        $this->players()->where('user_id', $loserId)->update(['eliminated_at' => now()]);

        if ($match->round === self::ROUNDS) {
            $this->update(['status' => self::STATUS_FINISHED, 'winner_id' => $winnerId, 'finished_at' => now()]);
            Achievements::award(User::query()->findOrFail($winnerId), 'champion');

            return;
        }

        $this->matches()
            ->where('round', $match->round + 1)
            ->where('position', intdiv($match->position, 2))
            ->update([$match->position % 2 === 0 ? 'player_one_id' : 'player_two_id' => $winnerId]);
    }

    /**
     * The better-seeded (lower number) of a match's two players.
     */
    private function higherSeed(TournamentMatch $match): int
    {
        $seeds = $this->players()->whereIn('user_id', [$match->player_one_id, $match->player_two_id])->pluck('seed', 'user_id');

        return ($seeds[$match->player_one_id] ?? PHP_INT_MAX) <= ($seeds[$match->player_two_id] ?? PHP_INT_MAX)
            ? (int) $match->player_one_id
            : (int) $match->player_two_id;
    }

    /**
     * A player can be in one tournament at a time.
     */
    private static function ensureFree(User $user): void
    {
        if (self::activeFor($user) !== null) {
            throw ValidationException::withMessages(['tournament' => __("You're already in a tournament.")]);
        }
    }
}
