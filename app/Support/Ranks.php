<?php

namespace App\Support;

/**
 * Ranks: XP from ranked duels levels a player from Rank 1 up to Rank 110, with a title per band.
 * Rank and title are always derived from total XP, so the curve and titles can change freely.
 */
final class Ranks
{
    public const MAX_RANK = 110;

    /**
     * Titles keyed by the first rank that carries them.
     *
     * @var array<int, string>
     */
    private const TITLES = [
        // Blocks
        1 => 'Pebble',
        6 => 'Brick',
        11 => 'Stacker',
        16 => 'Line Breaker',
        21 => 'Block Smith',
        // Builders
        26 => 'Combo Crafter',
        31 => 'Well Digger',
        36 => 'Spin Adept',
        41 => 'Tower Keeper',
        46 => 'Quad Striker',
        // Fighters
        51 => 'Garbage Crusher',
        56 => 'Skyline Architect',
        61 => 'Board Breaker',
        66 => 'Storm Stacker',
        71 => 'Gravity Bender',
        // Forces
        76 => 'Well Warden',
        81 => 'Titan',
        86 => 'Tempest',
        91 => 'Void Walker',
        96 => 'Nova',
        // Cosmic
        101 => 'Eclipse',
        106 => 'Ascendant',
        110 => 'Clash Sovereign',
    ];

    /**
     * Title groups keyed by the first rank in each.
     *
     * @var array<int, string>
     */
    private const GROUPS = [
        1 => 'Blocks',
        26 => 'Builders',
        51 => 'Fighters',
        76 => 'Forces',
        101 => 'Cosmic',
    ];

    public const XP_WIN = 100;

    public const XP_DRAW = 60;

    public const XP_LOSS = 40;

    public const XP_PER_KO = 10;

    /**
     * XP a player earns from a finished duel. Quitting (forfeit or disconnect) earns nothing.
     */
    public static function xpForDuel(string $outcome, int $kos, bool $quit): int
    {
        if ($quit) {
            return 0;
        }

        return match ($outcome) {
            'win' => self::XP_WIN,
            'draw' => self::XP_DRAW,
            default => self::XP_LOSS,
        } + $kos * self::XP_PER_KO;
    }

    /**
     * Total XP needed to reach a rank: each step from rank L to L+1 costs 40 + 12L.
     */
    public static function xpToReach(int $rank): int
    {
        $steps = max(0, $rank - 1);

        return 40 * $steps + 6 * $steps * ($steps + 1);
    }

    public static function rankFor(int $xp): int
    {
        $rank = 1;

        while ($rank < self::MAX_RANK && $xp >= self::xpToReach($rank + 1)) {
            $rank++;
        }

        return $rank;
    }

    public static function titleFor(int $rank): string
    {
        $title = self::TITLES[1];

        foreach (self::TITLES as $from => $name) {
            if ($rank >= $from) {
                $title = $name;
            }
        }

        return $title;
    }

    /**
     * Every title band from Rank 1 to the top, with its group and the XP it starts at.
     *
     * @return list<array{from: int, to: int, title: string, group: string, xp: int}>
     */
    public static function ladder(): array
    {
        $starts = array_keys(self::TITLES);
        $ladder = [];

        foreach ($starts as $i => $from) {
            $group = self::GROUPS[1];

            foreach (self::GROUPS as $groupFrom => $name) {
                if ($from >= $groupFrom) {
                    $group = $name;
                }
            }

            $ladder[] = [
                'from' => $from,
                'to' => isset($starts[$i + 1]) ? $starts[$i + 1] - 1 : self::MAX_RANK,
                'title' => self::TITLES[$from],
                'group' => $group,
                'xp' => self::xpToReach($from),
            ];
        }

        return $ladder;
    }

    /**
     * @return array{rank: int, title: string, xp: int, xpIntoRank: int, xpForNext: int|null}
     */
    public static function progress(int $xp): array
    {
        $rank = self::rankFor($xp);
        $floor = self::xpToReach($rank);

        return [
            'rank' => $rank,
            'title' => self::titleFor($rank),
            'xp' => $xp,
            'xpIntoRank' => $xp - $floor,
            'xpForNext' => $rank < self::MAX_RANK ? self::xpToReach($rank + 1) - $floor : null,
        ];
    }
}
