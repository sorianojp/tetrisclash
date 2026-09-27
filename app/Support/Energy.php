<?php

namespace App\Support;

use Carbon\CarbonImmutable;

/**
 * Ranked-match energy. Refills are calculated on read from the stored amount and the time it
 * was stored, so there's no scheduled job: a player's energy is always exact, whenever asked.
 */
final class Energy
{
    public static function max(): int
    {
        return max(1, (int) config('game.energy.max'));
    }

    public static function intervalSeconds(): int
    {
        return max(1, (int) config('game.energy.regen_minutes')) * 60;
    }

    /**
     * Energy right now, and when the point currently refilling started (null when full).
     * A null stored amount means the player has never spent any: full.
     *
     * @return array{current: int, refillingSince: CarbonImmutable|null}
     */
    public static function at(?int $stored, ?CarbonImmutable $storedAt): array
    {
        $max = self::max();

        if ($stored === null || $storedAt === null) {
            return ['current' => $max, 'refillingSince' => null];
        }

        $interval = self::intervalSeconds();
        $refilled = intdiv(max(0, (int) $storedAt->diffInSeconds(now())), $interval);
        $current = min($max, $stored + $refilled);

        return [
            'current' => $current,
            'refillingSince' => $current >= $max ? null : $storedAt->addSeconds($refilled * $interval),
        ];
    }
}
