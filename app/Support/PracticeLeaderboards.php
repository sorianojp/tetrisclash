<?php

namespace App\Support;

use App\Models\PracticeRun;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Per-mode practice leaderboards: all-time (each player's personal best) and weekly
 * (each player's best run since Monday 00:00 UTC). Tied players share a position,
 * which is one more than the number of players strictly ahead of them.
 *
 * @phpstan-type Entry array{id: int, name: string, value: int, position: int, rank: array{rank: int, title: string, xp: int, xpIntoRank: int, xpForNext: int|null}, replayId: int|null}
 * @phpstan-type Board array{entries: list<Entry>, you: array{position: int, value: int}|null}
 * @phpstan-type PracticeRecord array{column: string, lowerIsBetter: bool, min: int, max: int}
 */
final class PracticeLeaderboards
{
    public const SIZE = 10;

    /**
     * Every mode's all-time and weekly boards, plus where the viewer stands on each.
     *
     * @return array<string, array{allTime: Board, weekly: Board}>
     */
    public static function all(User $viewer): array
    {
        $boards = [];

        foreach (User::PRACTICE_RECORDS as $mode => $record) {
            $boards[$mode] = [
                'allTime' => self::allTime($mode, $record, $viewer),
                'weekly' => self::weekly($mode, $record, $viewer),
            ];
        }

        return $boards;
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

    /**
     * @param  PracticeRecord  $record
     * @return Board
     */
    private static function allTime(string $mode, array $record, User $viewer): array
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

        $best = $viewer->{$column};

        return [
            'entries' => self::entries($top, self::replayRuns($mode, $top)),
            'you' => $best === null ? null : [
                'position' => self::allTimePosition($record, $best),
                'value' => $best,
            ],
        ];
    }

    /**
     * @param  PracticeRecord  $record
     * @return Board
     */
    private static function weekly(string $mode, array $record, User $viewer): array
    {
        $bests = self::weeklyBests($mode, $record);

        $rows = DB::query()
            ->fromSub($bests, 'bests')
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

        $best = self::weeklyBests($mode, $record)->where('user_id', $viewer->id)->value('best');

        return [
            'entries' => self::entries($top, self::replayRuns($mode, $top, self::weekStart())),
            'you' => $best === null ? null : [
                'position' => DB::query()
                    ->fromSub(self::weeklyBests($mode, $record), 'bests')
                    ->where('best', $record['lowerIsBetter'] ? '<' : '>', $best)
                    ->count() + 1,
                'value' => (int) $best,
            ],
        ];
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
