<?php

namespace App\Support;

use App\Models\User;

/**
 * Per-mode practice leaderboards built from each player's personal best.
 */
final class PracticeLeaderboards
{
    public const SIZE = 10;

    /**
     * Every mode's board, plus where the viewer stands on it.
     *
     * @return array<string, array{entries: list<array{id: int, name: string, value: int, rank: array{rank: int, title: string, xp: int, xpIntoRank: int, xpForNext: int|null}}>, you: array{position: int, value: int}|null}>
     */
    public static function all(User $viewer): array
    {
        return array_map(
            fn (array $record) => self::board($record, $viewer),
            User::PRACTICE_RECORDS,
        );
    }

    /**
     * @param  array{column: string, lowerIsBetter: bool, min: int, max: int}  $record
     * @return array{entries: list<array{id: int, name: string, value: int, rank: array{rank: int, title: string, xp: int, xpIntoRank: int, xpForNext: int|null}}>, you: array{position: int, value: int}|null}
     */
    private static function board(array $record, User $viewer): array
    {
        $column = $record['column'];
        $direction = $record['lowerIsBetter'] ? 'asc' : 'desc';

        $entries = User::query()
            ->whereNotNull($column)
            ->orderBy($column, $direction)
            ->orderBy('id')
            ->limit(self::SIZE)
            ->get(['id', 'name', 'xp', $column])
            ->map(fn (User $player) => [
                'id' => $player->id,
                'name' => $player->name,
                'value' => $player->{$column},
                'rank' => $player->rankProgress(),
            ])
            ->values()
            ->all();

        $best = $viewer->{$column};

        // Ties share a position: it's one more than the number of strictly better bests.
        $you = $best === null ? null : [
            'position' => User::query()
                ->where($column, $record['lowerIsBetter'] ? '<' : '>', $best)
                ->count() + 1,
            'value' => $best,
        ];

        return ['entries' => $entries, 'you' => $you];
    }
}
