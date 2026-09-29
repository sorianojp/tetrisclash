<?php

namespace App\Support;

use App\Events\AchievementUnlocked;
use App\Models\Achievement;
use App\Models\Duel;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Achievements: one-time unlocks for milestones. Match, rank and practice achievements are
 * checked on the server when a duel settles or a practice result is saved. Skill achievements
 * (a Tetris, a T-spin…) happen inside the game, which runs in the browser, so the client
 * reports those; they're cosmetic, so that's trusted.
 */
final class Achievements
{
    public const GROUP_MATCHES = 'Matches';

    public const GROUP_PRACTICE = 'Practice';

    public const GROUP_SKILL = 'Skill';

    /**
     * Every achievement, in display order.
     *
     * @var array<string, array{title: string, description: string, group: string}>
     */
    public const ALL = [
        'first_win' => ['title' => 'First Blood', 'description' => 'Win a ranked match.', 'group' => self::GROUP_MATCHES],
        'wins_10' => ['title' => 'Contender', 'description' => 'Win 10 ranked matches.', 'group' => self::GROUP_MATCHES],
        'wins_50' => ['title' => 'Veteran', 'description' => 'Win 50 ranked matches.', 'group' => self::GROUP_MATCHES],
        'duels_100' => ['title' => 'Centurion', 'description' => 'Play 100 matches.', 'group' => self::GROUP_MATCHES],
        'flawless' => ['title' => 'Flawless', 'description' => 'Win a battle 3–0 on KOs.', 'group' => self::GROUP_MATCHES],
        'race_win' => ['title' => 'Speed Demon', 'description' => 'Win a race.', 'group' => self::GROUP_MATCHES],
        'rank_10' => ['title' => 'Climbing', 'description' => 'Reach rank 10.', 'group' => self::GROUP_MATCHES],
        'rank_25' => ['title' => 'Established', 'description' => 'Reach rank 25.', 'group' => self::GROUP_MATCHES],
        'rank_50' => ['title' => 'Elite', 'description' => 'Reach rank 50.', 'group' => self::GROUP_MATCHES],
        'champion' => ['title' => 'Champion', 'description' => 'Win a tournament.', 'group' => self::GROUP_MATCHES],

        'sprint_60' => ['title' => 'Sub-Minute', 'description' => 'Finish 40 Lines in under 1:00.', 'group' => self::GROUP_PRACTICE],
        'sprint_30' => ['title' => 'Blitz', 'description' => 'Finish 40 Lines in under 0:30.', 'group' => self::GROUP_PRACTICE],
        'dig_30' => ['title' => 'Excavator', 'description' => 'Finish Dig in under 0:30.', 'group' => self::GROUP_PRACTICE],
        'ultra_50k' => ['title' => 'High Roller', 'description' => 'Score 50,000 in Ultra.', 'group' => self::GROUP_PRACTICE],
        'survival_180' => ['title' => 'Survivor', 'description' => 'Last 3 minutes in Survival.', 'group' => self::GROUP_PRACTICE],
        'zen_250k' => ['title' => 'Inner Peace', 'description' => 'Score 250,000 in one Zen game.', 'group' => self::GROUP_PRACTICE],

        'tetris' => ['title' => 'Tetris!', 'description' => 'Clear 4 lines at once.', 'group' => self::GROUP_SKILL],
        'tspin' => ['title' => 'Spin Doctor', 'description' => 'Clear lines with a T-spin.', 'group' => self::GROUP_SKILL],
        'back_to_back' => ['title' => 'Back-to-Back', 'description' => 'Chain two Tetrises or T-spins.', 'group' => self::GROUP_SKILL],
        'combo_10' => ['title' => 'Combo King', 'description' => 'Reach a 10-combo.', 'group' => self::GROUP_SKILL],
        'perfect_clear' => ['title' => 'Spotless', 'description' => 'Clear the whole board.', 'group' => self::GROUP_SKILL],
    ];

    /**
     * Practice thresholds: mode => [achievement => value to beat (at most, for timed modes)].
     *
     * @var array<string, array<string, int>>
     */
    private const PRACTICE = [
        'sprint' => ['sprint_60' => 60000, 'sprint_30' => 30000],
        'dig' => ['dig_30' => 30000],
        'ultra' => ['ultra_50k' => 50000],
        'survival' => ['survival_180' => 180000],
        'zen' => ['zen_250k' => 250000],
    ];

    private const RANKS = ['rank_10' => 10, 'rank_25' => 25, 'rank_50' => 50];

    /** The ones the game client reports. */
    public const REPORTED_BY_CLIENT = ['tetris', 'tspin', 'back_to_back', 'combo_10', 'perfect_clear'];

    /**
     * Unlock achievements for a player, announcing each one that's new.
     */
    public static function award(User $user, string ...$keys): void
    {
        foreach ($keys as $key) {
            $inserted = DB::table('achievements')->insertOrIgnore([
                'user_id' => $user->id,
                'key' => $key,
                'created_at' => now(),
            ]);

            if ($inserted > 0) {
                AchievementUnlocked::dispatch($user->id, $key);
            }
        }
    }

    /**
     * Check both players once a duel has settled.
     */
    public static function afterDuel(Duel $duel): void
    {
        $playedCounts = Duel::query()
            ->whereNotNull('finished_at')
            ->where(fn ($query) => $query->whereIn('player_one_id', [$duel->player_one_id, $duel->player_two_id])
                ->orWhereIn('player_two_id', [$duel->player_one_id, $duel->player_two_id]))
            ->get(['player_one_id', 'player_two_id'])
            ->flatMap(fn (Duel $played) => [$played->player_one_id, $played->player_two_id])
            ->countBy();

        foreach (User::query()->whereKey([$duel->player_one_id, $duel->player_two_id])->get() as $player) {
            $won = $duel->winner_id === $player->id;
            $keys = [];

            if ($won && $duel->ranked) {
                $keys[] = 'first_win';
            }

            if ($player->wins >= 10) {
                $keys[] = 'wins_10';
            }

            if ($player->wins >= 50) {
                $keys[] = 'wins_50';
            }

            if ($playedCounts->get($player->id, 0) >= 100) {
                $keys[] = 'duels_100';
            }

            $isOne = $duel->player_one_id === $player->id;
            $theirKos = $isOne ? $duel->player_two_kos : $duel->player_one_kos;

            if ($won && ! $duel->isRace() && $duel->finish_reason === 'knockout' && $theirKos === 0) {
                $keys[] = 'flawless';
            }

            if ($won && $duel->isRace() && $duel->finish_reason === 'finish') {
                $keys[] = 'race_win';
            }

            $rank = Ranks::rankFor($player->xp);

            foreach (self::RANKS as $key => $needed) {
                if ($rank >= $needed) {
                    $keys[] = $key;
                }
            }

            self::award($player, ...$keys);
        }
    }

    /**
     * Check a saved practice result against that mode's thresholds.
     */
    public static function afterPracticeRun(User $user, string $mode, int $value): void
    {
        $lowerIsBetter = User::PRACTICE_RECORDS[$mode]['lowerIsBetter'];
        $keys = [];

        foreach (self::PRACTICE[$mode] ?? [] as $key => $threshold) {
            if ($lowerIsBetter ? $value < $threshold : $value >= $threshold) {
                $keys[] = $key;
            }
        }

        self::award($user, ...$keys);
    }

    /**
     * Every achievement with whether (and when) this player unlocked it.
     *
     * @return list<array{key: string, title: string, description: string, group: string, unlockedAt: string|null}>
     */
    public static function forPlayer(User $player): array
    {
        $unlocked = Achievement::query()
            ->where('user_id', $player->id)
            ->pluck('created_at', 'key');

        $list = [];

        foreach (self::ALL as $key => $achievement) {
            $list[] = [
                'key' => $key,
                ...$achievement,
                'unlockedAt' => $unlocked->get($key)?->toFormattedDateString(),
            ];
        }

        return $list;
    }
}
