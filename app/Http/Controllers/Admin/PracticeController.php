<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\PracticeRun;
use App\Models\User;
use App\Support\Moderation;
use App\Support\PracticeLeaderboards;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Leaderboard clean-up: the best records and this week's best runs in a mode, where a
 * suspicious result can be taken down.
 */
class PracticeController extends Controller
{
    public const SIZE = 25;

    public function index(Request $request): Response
    {
        $mode = $request->validate([
            'mode' => ['nullable', Rule::in(array_keys(User::PRACTICE_RECORDS))],
        ])['mode'] ?? 'sprint';
        $record = User::PRACTICE_RECORDS[$mode];
        $direction = $record['lowerIsBetter'] ? 'asc' : 'desc';

        $runRow = fn (PracticeRun $run) => [
            'id' => $run->id,
            'value' => $run->value,
            'player' => ['id' => $run->user->id, 'name' => $run->user->name, 'banned' => $run->user->isBanned()],
            'hasReplay' => (bool) $run->getAttribute('replay_exists'),
            'createdAt' => $run->created_at?->diffForHumans(),
        ];

        $runs = fn () => PracticeRun::query()
            ->where('mode', $mode)
            ->with('user:id,name,banned_at')
            ->withExists('replay');

        return Inertia::render('admin/practice', [
            'mode' => $mode,
            'records' => User::query()
                ->whereNotNull($record['column'])
                ->orderBy($record['column'], $direction)
                ->orderBy('id')
                ->limit(self::SIZE)
                ->get(['id', 'name', 'banned_at', $record['column']])
                ->map(fn (User $user) => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'banned' => $user->isBanned(),
                    'value' => (int) $user->{$record['column']},
                ]),
            'weeklyRuns' => $runs()
                ->where('created_at', '>=', PracticeLeaderboards::weekStart())
                ->orderBy('value', $direction)
                ->orderBy('id')
                ->limit(self::SIZE)
                ->get()
                ->map($runRow),
            'recentRuns' => $runs()->latest('id')->limit(self::SIZE)->get()->map($runRow),
        ]);
    }

    public function destroy(PracticeRun $run): RedirectResponse
    {
        Moderation::deleteRun($run);

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Run deleted.')]);

        return back();
    }
}
