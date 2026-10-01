<?php

namespace App\Support;

use App\Events\DuelFound;
use App\Models\Duel;
use App\Models\Tournament;
use App\Models\TournamentPlayer;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Computer players that keep the game lively while it's small. To other players they're
 * ordinary accounts: they keep their own hours, play ranked matches (with real rating and XP),
 * answer invites and join tournaments. The bot runner (bots/runner.ts) plays their games over
 * the same realtime channels a person uses; this class decides when and against whom.
 */
final class Bots
{
    /**
     * The 50 bots. Style drives how the runner plays:
     * pps: pieces per second; mistakes: chance of a sloppy placement; hold: uses hold;
     * well: saves a column for Tetrises; chatty: how often it emotes; invites: chance it
     * accepts an invite. Hours are UTC windows [from, to); attendance is the % of days
     * it shows up at all.
     *
     * @var array<string, array{name: string, pps: float, mistakes: float, hold: bool, well: bool, chatty: float, invites: float, hours: list<array{int, int}>, attendance: int}>
     */
    public const ROSTER = [
        'b01' => ['name' => 'blockhead_91', 'pps' => 0.8, 'mistakes' => 0.22, 'hold' => false, 'well' => false, 'chatty' => 0.5, 'invites' => 0.8, 'hours' => [[0, 4], [12, 15]], 'attendance' => 80],
        'b02' => ['name' => 'Mira', 'pps' => 1.3, 'mistakes' => 0.10, 'hold' => true, 'well' => false, 'chatty' => 0.7, 'invites' => 0.7, 'hours' => [[1, 6], [18, 21]], 'attendance' => 85],
        'b03' => ['name' => 'tspin_tony', 'pps' => 1.9, 'mistakes' => 0.06, 'hold' => true, 'well' => true, 'chatty' => 0.3, 'invites' => 0.6, 'hours' => [[2, 7], [14, 17]], 'attendance' => 75],
        'b04' => ['name' => 'NovaStack', 'pps' => 2.2, 'mistakes' => 0.04, 'hold' => true, 'well' => true, 'chatty' => 0.2, 'invites' => 0.5, 'hours' => [[3, 8], [20, 23]], 'attendance' => 70],
        'b05' => ['name' => 'quietquad', 'pps' => 1.5, 'mistakes' => 0.08, 'hold' => true, 'well' => true, 'chatty' => 0.05, 'invites' => 0.6, 'hours' => [[4, 9], [16, 19]], 'attendance' => 80],
        'b06' => ['name' => 'jun.k', 'pps' => 1.1, 'mistakes' => 0.14, 'hold' => false, 'well' => false, 'chatty' => 0.6, 'invites' => 0.9, 'hours' => [[5, 10], [22, 24]], 'attendance' => 90],
        'b07' => ['name' => 'PixelMoth', 'pps' => 0.9, 'mistakes' => 0.18, 'hold' => false, 'well' => false, 'chatty' => 0.8, 'invites' => 0.85, 'hours' => [[6, 11], [0, 2]], 'attendance' => 75],
        'b08' => ['name' => 'rowan_plays', 'pps' => 1.7, 'mistakes' => 0.07, 'hold' => true, 'well' => false, 'chatty' => 0.4, 'invites' => 0.7, 'hours' => [[7, 12], [19, 22]], 'attendance' => 85],
        'b09' => ['name' => 'linelord', 'pps' => 2.0, 'mistakes' => 0.05, 'hold' => true, 'well' => true, 'chatty' => 0.35, 'invites' => 0.5, 'hours' => [[8, 13], [23, 24], [0, 1]], 'attendance' => 70],
        'b10' => ['name' => 'sofi_b', 'pps' => 1.2, 'mistakes' => 0.12, 'hold' => true, 'well' => false, 'chatty' => 0.75, 'invites' => 0.8, 'hours' => [[9, 14], [2, 4]], 'attendance' => 85],
        'b11' => ['name' => 'Kestrel', 'pps' => 2.4, 'mistakes' => 0.03, 'hold' => true, 'well' => true, 'chatty' => 0.15, 'invites' => 0.4, 'hours' => [[10, 15]], 'attendance' => 65],
        'b12' => ['name' => 'drop_zone', 'pps' => 1.4, 'mistakes' => 0.10, 'hold' => false, 'well' => true, 'chatty' => 0.45, 'invites' => 0.75, 'hours' => [[11, 16], [4, 6]], 'attendance' => 80],
        'b13' => ['name' => 'Hana22', 'pps' => 1.0, 'mistakes' => 0.16, 'hold' => true, 'well' => false, 'chatty' => 0.65, 'invites' => 0.9, 'hours' => [[12, 17], [6, 8]], 'attendance' => 90],
        'b14' => ['name' => 'MrWellington', 'pps' => 1.6, 'mistakes' => 0.09, 'hold' => true, 'well' => true, 'chatty' => 0.5, 'invites' => 0.6, 'hours' => [[13, 18], [8, 10]], 'attendance' => 75],
        'b15' => ['name' => 'tetrakid', 'pps' => 0.7, 'mistakes' => 0.25, 'hold' => false, 'well' => false, 'chatty' => 0.9, 'invites' => 0.95, 'hours' => [[14, 19], [10, 12]], 'attendance' => 85],
        'b16' => ['name' => 'ember.x', 'pps' => 1.8, 'mistakes' => 0.06, 'hold' => true, 'well' => false, 'chatty' => 0.3, 'invites' => 0.55, 'hours' => [[15, 20], [1, 3]], 'attendance' => 80],
        'b17' => ['name' => 'Obi_Block', 'pps' => 1.25, 'mistakes' => 0.11, 'hold' => true, 'well' => false, 'chatty' => 0.55, 'invites' => 0.8, 'hours' => [[16, 21], [3, 5]], 'attendance' => 85],
        'b18' => ['name' => 'lazy_L', 'pps' => 0.85, 'mistakes' => 0.2, 'hold' => false, 'well' => false, 'chatty' => 0.7, 'invites' => 0.9, 'hours' => [[17, 22], [5, 7]], 'attendance' => 80],
        'b19' => ['name' => 'Vex', 'pps' => 2.1, 'mistakes' => 0.05, 'hold' => true, 'well' => true, 'chatty' => 0.1, 'invites' => 0.45, 'hours' => [[18, 23], [7, 9]], 'attendance' => 70],
        'b20' => ['name' => 'cloudnine_cc', 'pps' => 1.35, 'mistakes' => 0.1, 'hold' => true, 'well' => false, 'chatty' => 0.6, 'invites' => 0.75, 'hours' => [[19, 24], [9, 11]], 'attendance' => 85],
        'b21' => ['name' => 'kuya_stack', 'pps' => 1.15, 'mistakes' => 0.13, 'hold' => true, 'well' => false, 'chatty' => 0.7, 'invites' => 0.85, 'hours' => [[10, 14], [22, 24]], 'attendance' => 85],
        'b22' => ['name' => 'zigzag.zoe', 'pps' => 1.45, 'mistakes' => 0.09, 'hold' => true, 'well' => false, 'chatty' => 0.55, 'invites' => 0.75, 'hours' => [[0, 3], [13, 16]], 'attendance' => 80],
        'b23' => ['name' => 'HoldMyPiece', 'pps' => 1.7, 'mistakes' => 0.07, 'hold' => true, 'well' => true, 'chatty' => 0.4, 'invites' => 0.6, 'hours' => [[11, 15], [1, 3]], 'attendance' => 75],
        'b24' => ['name' => 'marisol.m', 'pps' => 0.95, 'mistakes' => 0.17, 'hold' => false, 'well' => false, 'chatty' => 0.8, 'invites' => 0.9, 'hours' => [[12, 16], [23, 24]], 'attendance' => 85],
        'b25' => ['name' => 'gravityfalls', 'pps' => 1.3, 'mistakes' => 0.11, 'hold' => true, 'well' => false, 'chatty' => 0.35, 'invites' => 0.7, 'hours' => [[2, 6], [17, 19]], 'attendance' => 80],
        'b26' => ['name' => 'IceTee', 'pps' => 2.0, 'mistakes' => 0.05, 'hold' => true, 'well' => true, 'chatty' => 0.2, 'invites' => 0.5, 'hours' => [[13, 17], [4, 6]], 'attendance' => 70],
        'b27' => ['name' => 'pogi_plays', 'pps' => 0.8, 'mistakes' => 0.21, 'hold' => false, 'well' => false, 'chatty' => 0.85, 'invites' => 0.95, 'hours' => [[10, 13], [15, 17]], 'attendance' => 90],
        'b28' => ['name' => 'sevenbag', 'pps' => 2.3, 'mistakes' => 0.04, 'hold' => true, 'well' => true, 'chatty' => 0.1, 'invites' => 0.4, 'hours' => [[20, 24], [6, 8]], 'attendance' => 65],
        'b29' => ['name' => 'luna_lines', 'pps' => 1.1, 'mistakes' => 0.14, 'hold' => true, 'well' => false, 'chatty' => 0.65, 'invites' => 0.85, 'hours' => [[14, 18], [2, 4]], 'attendance' => 85],
        'b30' => ['name' => 'deadcell', 'pps' => 1.55, 'mistakes' => 0.08, 'hold' => true, 'well' => true, 'chatty' => 0.25, 'invites' => 0.6, 'hours' => [[21, 24], [0, 2], [8, 10]], 'attendance' => 75],
        'b31' => ['name' => 'Tala', 'pps' => 1.25, 'mistakes' => 0.12, 'hold' => true, 'well' => false, 'chatty' => 0.6, 'invites' => 0.8, 'hours' => [[11, 14], [19, 21]], 'attendance' => 85],
        'b32' => ['name' => 'sz_hater', 'pps' => 1.65, 'mistakes' => 0.07, 'hold' => true, 'well' => true, 'chatty' => 0.45, 'invites' => 0.65, 'hours' => [[3, 7], [15, 17]], 'attendance' => 80],
        'b33' => ['name' => 'mochi.drop', 'pps' => 0.9, 'mistakes' => 0.19, 'hold' => false, 'well' => false, 'chatty' => 0.75, 'invites' => 0.9, 'hours' => [[9, 12], [16, 18]], 'attendance' => 85],
        'b34' => ['name' => 'Quadrant', 'pps' => 2.15, 'mistakes' => 0.05, 'hold' => true, 'well' => true, 'chatty' => 0.15, 'invites' => 0.45, 'hours' => [[5, 9], [18, 20]], 'attendance' => 70],
        'b35' => ['name' => 'benj_tz', 'pps' => 1.35, 'mistakes' => 0.1, 'hold' => true, 'well' => false, 'chatty' => 0.5, 'invites' => 0.75, 'hours' => [[12, 15], [0, 2]], 'attendance' => 80],
        'b36' => ['name' => 'stackpanic', 'pps' => 0.75, 'mistakes' => 0.24, 'hold' => false, 'well' => false, 'chatty' => 0.9, 'invites' => 0.95, 'hours' => [[6, 9], [13, 15]], 'attendance' => 85],
        'b37' => ['name' => 'Aiko_R', 'pps' => 1.6, 'mistakes' => 0.08, 'hold' => true, 'well' => false, 'chatty' => 0.4, 'invites' => 0.65, 'hours' => [[8, 11], [22, 24]], 'attendance' => 80],
        'b38' => ['name' => 'perfect_clear', 'pps' => 2.05, 'mistakes' => 0.05, 'hold' => true, 'well' => true, 'chatty' => 0.3, 'invites' => 0.5, 'hours' => [[14, 17], [3, 5]], 'attendance' => 70],
        'b39' => ['name' => 'nightowl_ph', 'pps' => 1.2, 'mistakes' => 0.12, 'hold' => true, 'well' => false, 'chatty' => 0.6, 'invites' => 0.8, 'hours' => [[15, 19]], 'attendance' => 85],
        'b40' => ['name' => 'Brickwell', 'pps' => 1.4, 'mistakes' => 0.1, 'hold' => false, 'well' => true, 'chatty' => 0.45, 'invites' => 0.7, 'hours' => [[16, 20], [7, 9]], 'attendance' => 80],
        'b41' => ['name' => 'jaybee', 'pps' => 1.05, 'mistakes' => 0.15, 'hold' => true, 'well' => false, 'chatty' => 0.7, 'invites' => 0.85, 'hours' => [[10, 12], [20, 23]], 'attendance' => 85],
        'b42' => ['name' => 'combo_kate', 'pps' => 1.75, 'mistakes' => 0.06, 'hold' => true, 'well' => false, 'chatty' => 0.65, 'invites' => 0.6, 'hours' => [[1, 4], [11, 13]], 'attendance' => 75],
        'b43' => ['name' => 'T_rex', 'pps' => 0.85, 'mistakes' => 0.2, 'hold' => false, 'well' => false, 'chatty' => 0.8, 'invites' => 0.9, 'hours' => [[4, 8], [17, 19]], 'attendance' => 80],
        'b44' => ['name' => 'Sakura.lines', 'pps' => 1.5, 'mistakes' => 0.09, 'hold' => true, 'well' => true, 'chatty' => 0.5, 'invites' => 0.7, 'hours' => [[7, 10], [21, 23]], 'attendance' => 80],
        'b45' => ['name' => 'garbage_man', 'pps' => 1.9, 'mistakes' => 0.06, 'hold' => true, 'well' => true, 'chatty' => 0.55, 'invites' => 0.55, 'hours' => [[18, 22], [9, 11]], 'attendance' => 75],
        'b46' => ['name' => 'rina_k', 'pps' => 1.15, 'mistakes' => 0.13, 'hold' => true, 'well' => false, 'chatty' => 0.6, 'invites' => 0.85, 'hours' => [[13, 16], [5, 7]], 'attendance' => 85],
        'b47' => ['name' => 'lowkey_L', 'pps' => 1.3, 'mistakes' => 0.11, 'hold' => false, 'well' => false, 'chatty' => 0.2, 'invites' => 0.75, 'hours' => [[19, 23], [11, 12]], 'attendance' => 80],
        'b48' => ['name' => 'Ozzy', 'pps' => 2.25, 'mistakes' => 0.04, 'hold' => true, 'well' => true, 'chatty' => 0.25, 'invites' => 0.4, 'hours' => [[0, 4], [12, 14]], 'attendance' => 65],
        'b49' => ['name' => 'blipblop', 'pps' => 0.7, 'mistakes' => 0.26, 'hold' => false, 'well' => false, 'chatty' => 0.95, 'invites' => 0.95, 'hours' => [[8, 10], [14, 16], [23, 24]], 'attendance' => 85],
        'b50' => ['name' => 'miguel.dev', 'pps' => 1.6, 'mistakes' => 0.08, 'hold' => true, 'well' => false, 'chatty' => 0.35, 'invites' => 0.65, 'hours' => [[11, 13], [2, 5]], 'attendance' => 80],
    ];

    /** Bots in a match or tournament stay online; others are refreshed by the minute. */
    private const PRESENCE_MINUTES = 2;

    public static function enabled(): bool
    {
        return (bool) config('game.bots.enabled');
    }

    public static function maxRating(): int
    {
        return (int) config('game.bots.max_rating');
    }

    /**
     * Create the bot accounts that don't exist yet (and keep names in sync). They start like
     * any new player; their records build up from real matches.
     */
    public static function install(): int
    {
        $created = 0;

        foreach (self::ROSTER as $key => $bot) {
            $user = User::query()->where('bot_key', $key)->first();

            if ($user === null) {
                $user = new User;
                $user->forceFill([
                    'bot_key' => $key,
                    'email' => "{$key}@bots.invalid",
                    'password' => Hash::make(Str::random(40)),
                    'email_verified_at' => now(),
                    // Spread sign-up dates out a little, like real players.
                    'created_at' => now()->subHours(random_int(1, 96)),
                ]);
                $created++;
            }

            $user->name = $bot['name'];
            $user->save();
        }

        return $created;
    }

    /**
     * How a bot plays, for the runner.
     *
     * @return array{pps: float, mistakes: float, hold: bool, well: bool, chatty: float, invites: float}
     */
    public static function style(User $bot): array
    {
        $style = self::ROSTER[$bot->bot_key] ?? self::ROSTER['b01'];
        unset($style['name'], $style['hours'], $style['attendance']);

        return $style;
    }

    /**
     * Whether a bot keeps its hours right now: inside one of its windows, on a day it plays.
     */
    public static function scheduledOnline(string $key, ?CarbonImmutable $at = null): bool
    {
        $bot = self::ROSTER[$key] ?? null;
        $at ??= CarbonImmutable::now('UTC');

        if ($bot === null || crc32($key.$at->toDateString()) % 100 >= $bot['attendance']) {
            return false;
        }

        foreach ($bot['hours'] as [$from, $to]) {
            if ($at->hour >= $from && $at->hour < $to) {
                return true;
            }
        }

        return false;
    }

    /**
     * Mark scheduled and busy bots as online; the rest drift offline on their own.
     */
    public static function refreshPresence(): void
    {
        $busy = self::busyBotIds();
        $online = User::query()->bots()->get(['id', 'bot_key', 'bot_paused_at'])
            ->filter(fn (User $bot) => $busy->contains($bot->id)
                || ($bot->bot_paused_at === null && self::scheduledOnline((string) $bot->bot_key)))
            ->modelKeys();

        User::query()->whereKey($online)->update(['last_seen_at' => now()]);
    }

    /**
     * A bot for a player who's waited long enough in the queue: an idle one close in rating,
     * preferring bots that are online. Null when bots are off or it's too soon.
     */
    public static function opponentFor(User $player, int $waitedSeconds): ?User
    {
        if (! self::enabled() || $waitedSeconds < (int) config('game.bots.match_after_seconds')) {
            return null;
        }

        $bot = self::idleBots()
            ->sortBy([
                fn (User $a, User $b) => self::isOnline($b) <=> self::isOnline($a),
                fn (User $a, User $b) => abs($a->rating - $player->rating) <=> abs($b->rating - $player->rating),
            ])
            ->first();

        $bot?->forceFill(['last_seen_at' => now()])->save();

        return $bot;
    }

    /**
     * Now and then, start a ranked match between two idle online bots, so bots build real
     * records and there's something live to watch.
     */
    public static function pairUp(): ?Duel
    {
        $busy = Duel::query()->whereNull('finished_at')
            ->whereHas('playerOne', fn ($query) => $query->bots())
            ->whereHas('playerTwo', fn ($query) => $query->bots())
            ->count();

        if (! self::enabled() || $busy >= (int) config('game.bots.max_bot_matches') || random_int(1, 100) > (int) config('game.bots.pair_chance')) {
            return null;
        }

        $pair = self::idleBots()->filter(fn (User $bot) => self::isOnline($bot))->shuffle()->take(2)->values();

        if ($pair->count() < 2) {
            return null;
        }

        $duel = Duel::start($pair[0], $pair[1], random_int(1, 100) <= 80 ? Duel::MODE_BATTLE : Duel::MODE_RACE);
        DuelFound::dispatch($duel);

        return $duel;
    }

    /**
     * Seat an idle online bot in each tournament where nobody has signed up for a while. One
     * seat per interval, so a bracket fills gradually, the way people trickle in. Only
     * tournaments someone real is waiting in.
     */
    public static function fillTournaments(): void
    {
        if (! self::enabled()) {
            return;
        }

        $waited = now()->subSeconds((int) config('game.bots.tournament_fill_after_seconds'));

        Tournament::query()
            ->where('status', Tournament::STATUS_OPEN)
            ->whereHas('players.user', fn ($query) => $query->whereNull('bot_key'))
            ->whereDoesntHave('players', fn ($query) => $query->where('created_at', '>', $waited))
            ->get()
            ->each(function (Tournament $tournament) {
                $bot = self::idleBots()->filter(fn (User $bot) => self::isOnline($bot))->shuffle()->first();

                if ($bot !== null) {
                    $tournament->join($bot);
                }
            });
    }

    /**
     * Bots that are online and free: they pass the time with practice runs.
     *
     * @return Collection<int, User>
     */
    public static function idleOnline(): Collection
    {
        return self::idleBots()->filter(fn (User $bot) => self::isOnline($bot))->values();
    }

    /**
     * Free bots an admin hasn't paused.
     *
     * @return Collection<int, User>
     */
    private static function idleBots(): Collection
    {
        return User::query()->bots()->whereNull('bot_paused_at')->whereKeyNot(self::busyBotIds()->all())->get();
    }

    /**
     * Bots in an unfinished duel or still in a tournament, found in two queries (this runs
     * every second for the bot runner).
     *
     * @return Collection<int, int>
     */
    public static function busyBotIds(): Collection
    {
        $bots = User::query()->bots()->select('id');

        $inDuels = Duel::query()
            ->whereNull('finished_at')
            ->where(fn ($query) => $query->whereIn('player_one_id', $bots)->orWhereIn('player_two_id', $bots))
            ->get(['player_one_id', 'player_two_id'])
            ->flatMap(fn (Duel $duel) => [$duel->player_one_id, $duel->player_two_id]);

        $inTournaments = TournamentPlayer::query()
            ->whereIn('user_id', $bots)
            ->whereNull('eliminated_at')
            ->whereHas('tournament', fn ($query) => $query->whereIn('status', [Tournament::STATUS_OPEN, Tournament::STATUS_RUNNING]))
            ->pluck('user_id');

        return $inDuels->merge($inTournaments)->unique()->values();
    }

    public static function isOnline(User $bot): bool
    {
        return $bot->last_seen_at !== null && $bot->last_seen_at->gte(now()->subMinutes(self::PRESENCE_MINUTES));
    }
}
