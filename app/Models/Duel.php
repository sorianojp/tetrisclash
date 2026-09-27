<?php

namespace App\Models;

use App\Events\DuelUpdated;
use App\Support\Ranks;
use Carbon\CarbonImmutable;
use Database\Factories\DuelFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * A 1v1 match: a Battle (send garbage, score KOs) or a Race (first to clear 40 lines).
 * Only ranked duels move rating, win/loss records and XP.
 *
 * @property int $id
 * @property int $player_one_id
 * @property int $player_two_id
 * @property int $seed
 * @property int $player_one_kos
 * @property int $player_two_kos
 * @property int $player_one_lines_sent
 * @property int $player_two_lines_sent
 * @property CarbonImmutable|null $player_one_seen_at
 * @property CarbonImmutable|null $player_two_seen_at
 * @property CarbonImmutable $starts_at
 * @property CarbonImmutable $ends_at
 * @property int|null $winner_id
 * @property string|null $finish_reason
 * @property int|null $rating_change
 * @property int|null $player_one_xp
 * @property int|null $player_two_xp
 * @property CarbonImmutable|null $finished_at
 * @property string $mode
 * @property bool $ranked
 * @property int $player_one_lines
 * @property int $player_two_lines
 * @property-read User $playerOne
 * @property-read User $playerTwo
 */
#[Fillable([
    'player_one_id', 'player_two_id', 'seed',
    'player_one_kos', 'player_two_kos',
    'player_one_lines_sent', 'player_two_lines_sent',
    'player_one_seen_at', 'player_two_seen_at',
    'starts_at', 'ends_at', 'winner_id', 'finish_reason', 'rating_change', 'player_one_xp', 'player_two_xp', 'finished_at',
    'mode', 'ranked', 'player_one_lines', 'player_two_lines',
])]
class Duel extends Model
{
    /** @use HasFactory<DuelFactory> */
    use HasFactory;

    public const MODE_BATTLE = 'battle';

    public const MODE_RACE = 'race';

    public const MODES = [self::MODE_BATTLE, self::MODE_RACE];

    /** KOs needed to win a battle before the timer runs out. */
    public const KOS_TO_WIN = 3;

    public const DURATION_SECONDS = 120;

    /** Lines needed to win a race. */
    public const RACE_LINES = 40;

    public const RACE_DURATION_SECONDS = 180;

    /**
     * Plausibility caps on what clients report, relative to time played. Anything above is
     * clamped: generous for real play, but it stops a tampered client from claiming 999 lines.
     */
    public const MAX_ATTACK_PER_SECOND = 4;

    public const MAX_LINES_PER_SECOND = 3;

    public const REPORT_ALLOWANCE = 10;

    /** Time before play: a 5s "YOU vs OPPONENT" intro, then a 3s countdown on the board. */
    public const COUNTDOWN_SECONDS = 8;

    /** Elo K-factor: the most rating one ranked duel can move. */
    public const RATING_K = 32;

    /** A player that hasn't sent a heartbeat for this long is considered gone. */
    public const DISCONNECT_SECONDS = 15;

    /** How long to wait for final stats after time runs out before settling anyway. */
    public const SETTLE_GRACE_SECONDS = 5;

    /**
     * @var array<string, mixed>
     */
    protected $attributes = [
        'mode' => self::MODE_BATTLE,
        'ranked' => true,
        'player_one_lines' => 0,
        'player_two_lines' => 0,
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'ranked' => 'boolean',
            'player_one_seen_at' => 'datetime',
            'player_two_seen_at' => 'datetime',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    /**
     * Pair two players into a new duel that starts after a short countdown.
     */
    public static function start(User $one, User $two, string $mode = self::MODE_BATTLE, bool $ranked = true): self
    {
        $startsAt = now()->addSeconds(self::COUNTDOWN_SECONDS);
        $duration = $mode === self::MODE_RACE ? self::RACE_DURATION_SECONDS : self::DURATION_SECONDS;

        return self::create([
            'player_one_id' => $one->id,
            'player_two_id' => $two->id,
            'seed' => random_int(1, 2_147_483_646),
            'mode' => $mode,
            'ranked' => $ranked,
            'player_one_seen_at' => now(),
            'player_two_seen_at' => now(),
            'starts_at' => $startsAt,
            'ends_at' => $startsAt->copy()->addSeconds($duration),
        ]);
    }

    public function isRace(): bool
    {
        return $this->mode === self::MODE_RACE;
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function playerOne(): BelongsTo
    {
        return $this->belongsTo(User::class, 'player_one_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function playerTwo(): BelongsTo
    {
        return $this->belongsTo(User::class, 'player_two_id');
    }

    public function hasPlayer(User $user): bool
    {
        return in_array($user->id, [$this->player_one_id, $this->player_two_id], true);
    }

    public function isFinished(): bool
    {
        return $this->finished_at !== null;
    }

    public function opponentIdOf(User $user): int
    {
        return $user->id === $this->player_one_id ? $this->player_two_id : $this->player_one_id;
    }

    /**
     * Column prefix ("player_one" / "player_two") for the given player.
     */
    private function side(User|int $user): string
    {
        $id = $user instanceof User ? $user->id : $user;

        return $id === $this->player_one_id ? 'player_one' : 'player_two';
    }

    /**
     * The given player topped out, so their opponent scores a KO. (Races have no KOs:
     * a topped-out racer just loses time.)
     */
    public function recordKnockOut(User $victim, int $linesSent): void
    {
        if ($this->isRace()) {
            return;
        }

        $this->mutate(function (Duel $duel) use ($victim, $linesSent) {
            $duel->touchPlayer($victim, $linesSent);

            $winnerId = $duel->opponentIdOf($victim);
            $column = $duel->side($winnerId).'_kos';
            $duel->{$column}++;

            if ($duel->{$column} >= self::KOS_TO_WIN) {
                $duel->settle($winnerId, 'knockout');
            }
        });
    }

    /**
     * Record that the player is still connected, and settle the duel when a racer
     * finishes, time is up, or the opponent has vanished.
     */
    public function heartbeat(User $user, int $linesSent, int $lines = 0): void
    {
        $this->mutate(function (Duel $duel) use ($user, $linesSent, $lines) {
            $duel->touchPlayer($user, $linesSent, $lines);

            if ($duel->isRace() && $duel->{$duel->side($user).'_lines'} >= self::RACE_LINES) {
                $duel->settle($user->id, 'finish');

                return;
            }

            /** @var CarbonImmutable|null $opponentSeen */
            $opponentSeen = $duel->{$duel->side($duel->opponentIdOf($user)).'_seen_at'};

            if ($opponentSeen === null || $opponentSeen->lt(now()->subSeconds(self::DISCONNECT_SECONDS))) {
                $duel->settle($user->id, 'disconnect');

                return;
            }

            if (now()->lt($duel->ends_at)) {
                return;
            }

            // Wait until both players have reported their final stats, or the grace period ends.
            $bothReported = $duel->player_one_seen_at?->gte($duel->ends_at)
                && $duel->player_two_seen_at?->gte($duel->ends_at);

            if ($bothReported || now()->gte($duel->ends_at->copy()->addSeconds(self::SETTLE_GRACE_SECONDS))) {
                $duel->settle($duel->timeUpWinnerId(), 'time');
            }
        });
    }

    public function forfeit(User $user): void
    {
        $this->mutate(fn (Duel $duel) => $duel->settle($duel->opponentIdOf($user), 'forfeit'));
    }

    /**
     * When time runs out: in a battle most KOs wins, then most lines sent; in a race most
     * lines cleared wins. A full tie is a draw.
     */
    private function timeUpWinnerId(): ?int
    {
        $score = fn (string $side) => $this->isRace()
            ? [$this->{$side.'_lines'}]
            : [$this->{$side.'_kos'}, $this->{$side.'_lines_sent'}];

        return match ($score('player_one') <=> $score('player_two')) {
            1 => $this->player_one_id,
            -1 => $this->player_two_id,
            default => null,
        };
    }

    /**
     * Mark the player as seen and record their reported totals, clamped to what is
     * physically possible for the time played so far. Totals never go backwards.
     */
    private function touchPlayer(User $user, int $linesSent, int $lines = 0): void
    {
        $side = $this->side($user);
        $played = max(0, (int) $this->starts_at->diffInSeconds(now()));

        $this->{$side.'_seen_at'} = now();
        $this->{$side.'_lines_sent'} = max(
            $this->{$side.'_lines_sent'},
            min($linesSent, self::REPORT_ALLOWANCE + $played * self::MAX_ATTACK_PER_SECOND),
        );
        $this->{$side.'_lines'} = max(
            $this->{$side.'_lines'},
            min($lines, $played * self::MAX_LINES_PER_SECOND),
        );
    }

    /**
     * Apply a change to a locked, fresh copy of the duel and broadcast the result.
     *
     * @param  callable(Duel): void  $change
     */
    private function mutate(callable $change): void
    {
        $duel = DB::transaction(function () use ($change) {
            $duel = self::query()->lockForUpdate()->findOrFail($this->id);

            if (! $duel->isFinished()) {
                $change($duel);
                $duel->save();
            }

            return $duel;
        });

        $this->setRawAttributes($duel->getAttributes(), true);

        if ($duel->wasChanged(['player_one_kos', 'player_two_kos', 'finished_at'])) {
            DuelUpdated::dispatch($duel);
        }
    }

    /**
     * Finish the duel. Ranked duels also apply an Elo rating change, win/loss records and XP.
     */
    private function settle(?int $winnerId, string $reason): void
    {
        $this->winner_id = $winnerId;
        $this->finish_reason = $reason;
        $this->finished_at = now();

        if (! $this->ranked) {
            return;
        }

        $one = User::query()->lockForUpdate()->findOrFail($this->player_one_id);
        $two = User::query()->lockForUpdate()->findOrFail($this->player_two_id);

        $expectedOne = 1 / (1 + 10 ** (($two->rating - $one->rating) / 400));
        $actualOne = match ($winnerId) {
            $one->id => 1.0,
            $two->id => 0.0,
            default => 0.5,
        };
        $change = (int) round(self::RATING_K * ($actualOne - $expectedOne));

        $one->rating = max(0, $one->rating + $change);
        $two->rating = max(0, $two->rating - $change);

        if ($winnerId !== null) {
            [$winner, $loser] = $winnerId === $one->id ? [$one, $two] : [$two, $one];
            $winner->wins++;
            $loser->losses++;
        }

        foreach (['player_one' => $one, 'player_two' => $two] as $side => $player) {
            $outcome = match ($winnerId) {
                null => 'draw',
                $player->id => 'win',
                default => 'loss',
            };
            $quit = $outcome === 'loss' && in_array($reason, ['forfeit', 'disconnect'], true);
            $xp = Ranks::xpForDuel($outcome, $this->{$side.'_kos'}, $quit);

            $this->{$side.'_xp'} = $xp;
            $player->xp += $xp;
        }

        $one->save();
        $two->save();

        $this->rating_change = abs($change);
    }

    /**
     * A player's latest finished duels, from their point of view.
     *
     * @return Collection<int, array{id: int, mode: string, ranked: bool, opponentId: int, opponent: string, result: 'win'|'loss'|'draw', myKos: int, theirKos: int, myLines: int, theirLines: int, reason: string|null, ratingChange: int|null, finishedAt: string|null}>
     */
    public static function recentFor(User $user, int $limit = 8): Collection
    {
        return self::query()
            ->with(['playerOne:id,name', 'playerTwo:id,name'])
            ->whereNotNull('finished_at')
            ->where(fn ($query) => $query->where('player_one_id', $user->id)->orWhere('player_two_id', $user->id))
            ->latest('finished_at')
            ->limit($limit)
            ->get()
            ->map(function (Duel $duel) use ($user) {
                $isOne = $duel->player_one_id === $user->id;
                $opponent = $isOne ? $duel->playerTwo : $duel->playerOne;

                return [
                    'id' => $duel->id,
                    'mode' => $duel->mode,
                    'ranked' => $duel->ranked,
                    'opponentId' => $opponent->id,
                    'opponent' => $opponent->name,
                    'result' => match ($duel->winner_id) {
                        null => 'draw',
                        $user->id => 'win',
                        default => 'loss',
                    },
                    'myKos' => $isOne ? $duel->player_one_kos : $duel->player_two_kos,
                    'theirKos' => $isOne ? $duel->player_two_kos : $duel->player_one_kos,
                    'myLines' => $isOne ? $duel->player_one_lines : $duel->player_two_lines,
                    'theirLines' => $isOne ? $duel->player_two_lines : $duel->player_one_lines,
                    'reason' => $duel->finish_reason,
                    'ratingChange' => $duel->rating_change,
                    'finishedAt' => $duel->finished_at?->diffForHumans(),
                ];
            });
    }

    /**
     * The live duel state as sent to the browser.
     *
     * @return array{id: int, mode: string, ranked: bool, kos: array<int, int>, lines: array<int, int>, winnerId: int|null, finishReason: string|null, ratingChange: int|null, xp: array<int, int|null>, finished: bool}
     */
    public function toClient(): array
    {
        return [
            'id' => $this->id,
            'mode' => $this->mode,
            'ranked' => $this->ranked,
            'kos' => [
                $this->player_one_id => $this->player_one_kos,
                $this->player_two_id => $this->player_two_kos,
            ],
            'lines' => [
                $this->player_one_id => $this->player_one_lines,
                $this->player_two_id => $this->player_two_lines,
            ],
            'winnerId' => $this->winner_id,
            'finishReason' => $this->finish_reason,
            'ratingChange' => $this->rating_change,
            'xp' => [
                $this->player_one_id => $this->player_one_xp,
                $this->player_two_id => $this->player_two_xp,
            ],
            'finished' => $this->isFinished(),
        ];
    }
}
