<?php

namespace App\Support;

use App\Models\User;

/**
 * Cosmetic piece themes and board skins, unlocked by rank. The colours live with the
 * renderer (resources/js/tetris/themes.ts); this is the list and what each one costs.
 */
final class Themes
{
    public const DEFAULT_PIECES = 'classic';

    public const DEFAULT_BOARD = 'midnight';

    /**
     * @var array<string, array{name: string, rank: int}>
     */
    public const PIECES = [
        'classic' => ['name' => 'Classic', 'rank' => 1],
        'pastel' => ['name' => 'Pastel', 'rank' => 5],
        'neon' => ['name' => 'Neon', 'rank' => 15],
        'retro' => ['name' => 'Retro', 'rank' => 30],
        'mono' => ['name' => 'Monochrome', 'rank' => 45],
        'gold' => ['name' => 'Gilded', 'rank' => 75],
        'cosmic' => ['name' => 'Cosmic', 'rank' => 101],
    ];

    /**
     * @var array<string, array{name: string, rank: int}>
     */
    public const BOARDS = [
        'midnight' => ['name' => 'Midnight', 'rank' => 1],
        'ocean' => ['name' => 'Deep Ocean', 'rank' => 10],
        'forest' => ['name' => 'Forest', 'rank' => 20],
        'sunset' => ['name' => 'Sunset', 'rank' => 35],
        'void' => ['name' => 'Void', 'rank' => 60],
        'aurora' => ['name' => 'Aurora', 'rank' => 90],
    ];

    /**
     * The options in one category, with whether this player has unlocked each.
     *
     * @param  array<string, array{name: string, rank: int}>  $options
     * @return list<array{id: string, name: string, rank: int, unlocked: bool}>
     */
    public static function optionsFor(User $user, array $options): array
    {
        $rank = Ranks::rankFor($user->xp);
        $list = [];

        foreach ($options as $id => $option) {
            $list[] = ['id' => $id, ...$option, 'unlocked' => $rank >= $option['rank']];
        }

        return $list;
    }

    /**
     * Ids in a category this player's rank has unlocked.
     *
     * @param  array<string, array{name: string, rank: int}>  $options
     * @return list<string>
     */
    public static function unlocked(User $user, array $options): array
    {
        $rank = Ranks::rankFor($user->xp);

        return array_keys(array_filter($options, fn (array $option) => $rank >= $option['rank']));
    }
}
