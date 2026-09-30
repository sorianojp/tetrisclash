<?php

namespace App\Support;

use App\Models\PracticeRun;
use App\Models\Replay;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * Saving a finished practice run: logged for the weekly boards, kept as the player's record
 * for that mode if it beats it, its replay kept if it's a new all-time or weekly best, and
 * checked for achievements.
 */
final class PracticeResults
{
    /**
     * Validate a submitted result: a known mode, a believable value, maybe a replay.
     *
     * @return array{mode: string, value: int, replay: string|null}
     */
    public static function validate(Request $request): array
    {
        $mode = $request->validate([
            'mode' => ['required', 'string', 'in:'.implode(',', array_keys(User::PRACTICE_RECORDS))],
        ])['mode'];
        $record = User::PRACTICE_RECORDS[$mode];

        $validated = $request->validate([
            'value' => ['required', 'integer', 'min:'.$record['min'], 'max:'.$record['max']],
            'replay' => ['sometimes', 'nullable', 'string', 'max:'.ReplayData::MAX_UPLOAD_BYTES],
        ]);

        return ['mode' => $mode, 'value' => (int) $validated['value'], 'replay' => $validated['replay'] ?? null];
    }

    public static function record(User $user, string $mode, int $value, ?string $replay): void
    {
        $record = User::PRACTICE_RECORDS[$mode];
        $beats = fn (?int $best) => $best === null || ($record['lowerIsBetter'] ? $value < $best : $value > $best);

        $weekRuns = $user->practiceRuns()->where('mode', $mode)->where('created_at', '>=', PracticeLeaderboards::weekStart());
        $weeklyBest = $record['lowerIsBetter'] ? $weekRuns->min('value') : $weekRuns->max('value');

        $run = $user->practiceRuns()->create(['mode' => $mode, 'value' => $value]);

        $improved = $beats($user->{$record['column']});

        if ($improved) {
            $user->forceFill([$record['column'] => $value])->save();
        }

        if (($improved || $beats($weeklyBest === null ? null : (int) $weeklyBest)) && $replay !== null) {
            self::keepReplay($user, $run, $replay);
        }

        PracticeLeaderboards::forget();
        Achievements::afterPracticeRun($user, $mode, $value);
    }

    /**
     * Store a best run's replay, and drop that player's older replays in the mode, except the
     * one behind their all-time best: only the bests on the boards need theirs.
     */
    private static function keepReplay(User $user, PracticeRun $run, string $upload): void
    {
        $parsed = ReplayData::parse($upload);

        if ($parsed === null) {
            return;
        }

        Replay::query()->create([
            'user_id' => $user->id,
            'practice_run_id' => $run->id,
            'duration_ms' => $parsed['durationMs'],
            'data' => $parsed['data'],
        ]);

        $allTimeRunId = PracticeRun::query()
            ->where('user_id', $user->id)
            ->where('mode', $run->mode)
            ->where('value', $user->{User::PRACTICE_RECORDS[$run->mode]['column']})
            ->whereHas('replay')
            ->max('id');

        Replay::query()
            ->whereIn('practice_run_id', PracticeRun::query()->select('id')->where('user_id', $user->id)->where('mode', $run->mode))
            ->whereNotIn('practice_run_id', array_filter([$run->id, $allTimeRunId]))
            ->delete();
    }
}
