<?php

namespace App\Support;

use App\Models\Duel;
use App\Models\PracticeRun;
use App\Models\Tournament;
use App\Models\User;

/**
 * What admins do to players: suspend them, and take down practice results that shouldn't be
 * on the boards. Signing a banned player out happens on their next request
 * (App\Http\Middleware\EnsureNotBanned).
 */
final class Moderation
{
    /**
     * Suspend a player: they leave the queue, forfeit a match in progress, drop out of a
     * tournament that hasn't started, and disappear from the boards and the online list.
     * (A bracket match they're still waiting on is lost when they don't show up.)
     */
    public static function ban(User $user, ?string $reason): void
    {
        $user->forceFill([
            'banned_at' => now(),
            'ban_reason' => $reason,
            'queued_at' => null,
            'searching_since' => null,
        ])->save();

        Duel::activeFor($user)?->forfeit($user);

        $tournament = Tournament::activeFor($user);

        if ($tournament?->status === Tournament::STATUS_OPEN) {
            $tournament->leave($user);
        }

        PracticeLeaderboards::forget();
    }

    public static function unban(User $user): void
    {
        $user->forceFill(['banned_at' => null, 'ban_reason' => null])->save();

        PracticeLeaderboards::forget();
    }

    /**
     * Wipe a player's record in one practice mode, with every run (and replay) behind it.
     */
    public static function resetRecord(User $user, string $mode): void
    {
        $user->forceFill([User::PRACTICE_RECORDS[$mode]['column'] => null])->save();
        $user->practiceRuns()->where('mode', $mode)->delete();

        PracticeLeaderboards::forget();
    }

    /**
     * Remove one run. If it was the player's record, the record falls back to their best
     * remaining run in that mode (or none).
     */
    public static function deleteRun(PracticeRun $run): void
    {
        $user = $run->user;
        $record = User::PRACTICE_RECORDS[$run->mode];

        $run->delete();

        if ($user->{$record['column']} === $run->value) {
            $remaining = $user->practiceRuns()->where('mode', $run->mode);
            $best = $record['lowerIsBetter'] ? $remaining->min('value') : $remaining->max('value');

            $user->forceFill([$record['column'] => $best === null ? null : (int) $best])->save();
        }

        PracticeLeaderboards::forget();
    }
}
