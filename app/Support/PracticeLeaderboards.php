<?php

namespace App\Support;

use App\Models\PracticeRun;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Per-mode practice leaderboards: all-time (each player's personal best) and weekly
 * (each player's best run since Monday 00:00 UTC). Tied players share a position,
 * which is one more than the number of players strictly ahead of them. The top lists are
 * cached for a few seconds and dropped whenever a result is saved.
 *
 * @phpstan-type Entry array{id: int, name: string, value: int, position: int, rank: array{rank: int, title: string, xp: int, xpIntoRank: int, xpForNext: int|null}, replayId: int|null}
 * @phpstan-type Board array{entries: list<Entry>, you: array{position: int, value: int}|null}
 * @phpstan-type PracticeRecord array{column: string, lowerIsBetter: bool, min: int, max: int}
 */
final class PracticeLeaderboards
{
    public const SIZE = 10;

    /** The top-10 lists are shared by everyone, so they're cached briefly. */
    public const CACHE_SECONDS = 30;

    /**
     * Every mode's all-time and weekly boards, plus where the viewer stands on each.
     *
     * @return array<string, array{allTime: Board, weekly: Board}>
     */
    public static function all(User $viewer): array
    {
        /** @var array<string, array{allTime: list<Entry>, weekly: list<Entry>}> $tops */
        $tops = Cache::remember(self::cacheKey(), self::CACHE_SECONDS, fn () => self::tops());

        // The viewer's weekly bests in every mode, in one query.
        $weekly = PracticeRun::query()
            ->where('user_id', $viewer->id)
            ->where('created_at', '>=', self::weekStart())
            ->groupBy('mode')
            ->selectRaw('mode, MIN(value) as low, MAX(value) as high')
            ->get()
            ->keyBy('mode');

        $boards = [];

        foreach (User::PRACTICE_RECORDS as $mode => $record) {
            $allTimeBest = $viewer->{$record['column']};
            $week = $weekly->get($mode);
            $weeklyBest = $week === null ? null : (int) $week->getAttribute($record['lowerIsBetter'] ? 'low' : 'high');

            $boards[$mode] = [
                'allTime' => [
                    'entries' => $tops[$mode]['allTime'],
                    'you' => $allTimeBest === null ? null : [
                        'position' => self::allTimePosition($record, $allTimeBest),
                        'value' => $allTimeBest,
                    ],
                ],
                'weekly' => [
                    'entries' => $tops[$mode]['weekly'],
                    'you' => $weeklyBest === null ? null : [
                        'position' => DB::query()
                            ->fromSub(self::weeklyBests($mode, $record), 'bests')
                            ->where('best', $record['lowerIsBetter'] ? '<' : '>', $weeklyBest)
                            ->count() + 1,
                        'value' => $weeklyBest,
                    ],
                ],
            ];
        }

        return $boards;
    }

    /**
     * Drop the cached top lists, so a new result shows up right away.
     */
    public static function forget(): void
    {
        Cache::forget(self::cacheKey());
    }

    /**
     * A player's all-time position in each mode (null without a record).
     *
     * @return array<string, int|null>
     */
    public static function placements(User $player): array
    {
        return array_map(
            fn (array $record) => $player->{$record['column']} === null
                ? null
                : self::allTimePosition($record, $player->{$record['column']}),
            User::PRACTICE_RECORDS,
        );
    }

    /**
     * When the current weekly boards started.
     */
    public static function weekStart(): CarbonImmutable
    {
        return CarbonImmutable::now()->startOfWeek();
    }

    /** Keyed by week, so the weekly boards start fresh the moment Monday comes. */
    private static function cacheKey(): string
    {
        return 'practice-leaderboards:'.self::weekStart()->toDateString();
    }

    /**
     * Every mode's top lists.
     *
     * @return array<string, array{allTime: list<Entry>, weekly: list<Entry>}>
     */
    private static function tops(): array
    {
        $tops = [];

        foreach (User::PRACTICE_RECORDS as $mode => $record) {
            $tops[$mode] = ['allTime' => self::allTimeTop($mode, $record), 'weekly' => self::weeklyTop($mode, $record)];
        }

        return $tops;
    }

    /**
     * @param  PracticeRecord  $record
     * @return list<Entry>
     */
    private static function allTimeTop(string $mode, array $record): array
    {
        $column = $record['column'];

        $top = User::query()
            ->whereNotNull($column)
            ->orderBy($column, $record['lowerIsBetter'] ? 'asc' : 'desc')
            ->orderBy('id')
            ->limit(self::SIZE)
            ->get(['id', 'name', 'xp', $column])
            ->map(fn (User $player) => ['player' => $player, 'value' => (int) $player->{$column}])
            ->values()
            ->all();

        return self::entries($top, self::replayRuns($mode, $top));
    }

    /**
     * @param  PracticeRecord  $record
     * @return list<Entry>
     */
    private static function weeklyTop(string $mode, array $record): array
    {
        $rows = DB::query()
            ->fromSub(self::weeklyBests($mode, $record), 'bests')
            ->orderBy('best', $record['lowerIsBetter'] ? 'asc' : 'desc')
            ->orderBy('user_id')
            ->limit(self::SIZE)
            ->get();

        $players = User::query()
            ->whereIn('id', $rows->pluck('user_id'))
            ->get(['id', 'name', 'xp'])
            ->keyBy('id');

        $top = [];

        foreach ($rows as $row) {
            // Skip a player deleted between the two queries.
            $player = $players->get($row->user_id);

            if ($player !== null) {
                $top[] = ['player' => $player, 'value' => (int) $row->best];
            }
        }

        return self::entries($top, self::replayRuns($mode, $top, self::weekStart()));
    }

    /**
     * Each player's best run in a mode this week, as (user_id, best) rows.
     *
     * @param  PracticeRecord  $record
     * @return Builder<PracticeRun>
     */
    private static function weeklyBests(string $mode, array $record): Builder
    {
        $aggregate = $record['lowerIsBetter'] ? 'MIN' : 'MAX';

        return PracticeRun::query()
            ->where('mode', $mode)
            ->where('created_at', '>=', self::weekStart())
            ->groupBy('user_id')
            ->selectRaw("user_id, {$aggregate}(value) as best");
    }

    /**
     * @param  PracticeRecord  $record
     */
    private static function allTimePosition(array $record, int $value): int
    {
        return User::query()
            ->where($record['column'], $record['lowerIsBetter'] ? '<' : '>', $value)
            ->count() + 1;
    }

    /**
     * Runs with a replay behind the listed results, keyed "user:value".
     *
     * @param  array<int, array{player: User, value: int}>  $top
     * @return array<string, int>
     */
    private static function replayRuns(string $mode, array $top, ?CarbonImmutable $since = null): array
    {
        if ($top === []) {
            return [];
        }

        return PracticeRun::query()
            ->where('mode', $mode)
            ->whereIn('user_id', array_map(fn (array $row) => $row['player']->id, $top))
            ->when($since, fn ($query) => $query->where('created_at', '>=', $since))
            ->whereHas('replay')
            ->orderBy('id')
            ->get(['id', 'user_id', 'value'])
            ->mapWithKeys(fn (PracticeRun $run) => ["{$run->user_id}:{$run->value}" => $run->id])
            ->all();
    }

    /**
     * Number a sorted top list, giving tied values the same position.
     *
     * @param  array<int, array{player: User, value: int}>  $top  sorted best first
     * @param  array<string, int>  $replays  run ids with replays, keyed "user:value"
     * @return list<Entry>
     */
    private static function entries(array $top, array $replays): array
    {
        $entries = [];
        $position = 0;
        $previous = null;

        foreach (array_values($top) as $i => ['player' => $player, 'value' => $value]) {
            if ($value !== $previous) {
                $position = $i + 1;
                $previous = $value;
            }

            $entries[] = [
                'id' => $player->id,
                'name' => $player->name,
                'value' => $value,
                'position' => $position,
                'rank' => $player->rankProgress(),
                'replayId' => $replays["{$player->id}:{$value}"] ?? null,
            ];
        }

        return $entries;
    }
}
