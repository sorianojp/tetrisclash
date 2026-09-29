<?php

namespace App\Http\Controllers;

use App\Models\Duel;
use App\Models\PracticeRun;
use App\Models\Replay;
use App\Models\User;
use App\Support\Achievements;
use App\Support\PracticeLeaderboards;
use App\Support\ReplayData;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class LobbyController extends Controller
{
    public function index(Request $request): InertiaResponse
    {
        /** @var User $user */
        $user = $request->user();
        $user->markSeen();

        return Inertia::render('lobby', [
            'stats' => [
                'rating' => $user->rating,
                'wins' => $user->wins,
                'losses' => $user->losses,
                'rank' => $user->rankProgress(),
            ],
            'records' => $user->practiceRecords(),
            'leaderboard' => $this->leaderboard(),
            'practiceLeaderboards' => PracticeLeaderboards::all($user),
            'recentDuels' => Duel::recentFor($user),
            'activeDuelId' => MatchmakingController::activeDuelFor($user)?->id,
            'onlineCount' => OnlinePlayersController::onlineCount(),
            'energy' => $user->energyStatus(),
            'serverNow' => now()->getTimestampMs(),
        ]);
    }

    public function practice(Request $request): InertiaResponse
    {
        /** @var User $user */
        $user = $request->user();

        return Inertia::render('practice', [
            'records' => $user->practiceRecords(),
            'leaderboards' => PracticeLeaderboards::all($user),
        ]);
    }

    /**
     * Log a practice result for the weekly boards, and save it as the player's record
     * for that mode if it beats it. A result that sets a new all-time or weekly best
     * keeps its replay, when the client sent one.
     */
    public function storeRecord(Request $request): Response
    {
        /** @var User $user */
        $user = $request->user();

        $mode = $request->validate([
            'mode' => ['required', 'string', 'in:'.implode(',', array_keys(User::PRACTICE_RECORDS))],
        ])['mode'];
        $record = User::PRACTICE_RECORDS[$mode];

        $validated = $request->validate([
            'value' => ['required', 'integer', 'min:'.$record['min'], 'max:'.$record['max']],
            'replay' => ['sometimes', 'nullable', 'string', 'max:'.ReplayData::MAX_UPLOAD_BYTES],
        ]);
        $value = (int) $validated['value'];
        $beats = fn (?int $best) => $best === null || ($record['lowerIsBetter'] ? $value < $best : $value > $best);

        $weekRuns = $user->practiceRuns()->where('mode', $mode)->where('created_at', '>=', PracticeLeaderboards::weekStart());
        $weeklyBest = $record['lowerIsBetter'] ? $weekRuns->min('value') : $weekRuns->max('value');

        $run = $user->practiceRuns()->create(['mode' => $mode, 'value' => $value]);

        $improved = $beats($user->{$record['column']});

        if ($improved) {
            $user->forceFill([$record['column'] => $value])->save();
        }

        if (($improved || $beats($weeklyBest === null ? null : (int) $weeklyBest)) && isset($validated['replay'])) {
            $this->keepReplay($user, $run, $validated['replay']);
        }

        Achievements::afterPracticeRun($user, $mode, $value);

        return response()->noContent();
    }

    /**
     * Store a best run's replay, and drop that player's older replays in the mode, except the
     * one behind their all-time best: only the bests on the boards need theirs.
     */
    private function keepReplay(User $user, PracticeRun $run, string $upload): void
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

    /**
     * @return Collection<int, array{id: int, name: string, rating: int, wins: int, losses: int, rank: array{rank: int, title: string, xp: int, xpIntoRank: int, xpForNext: int|null}}>
     */
    private function leaderboard(): Collection
    {
        return User::query()
            ->where(fn ($query) => $query->where('wins', '>', 0)->orWhere('losses', '>', 0))
            ->orderByDesc('rating')
            ->limit(10)
            ->get(['id', 'name', 'rating', 'wins', 'losses', 'xp'])
            ->map(fn (User $player) => [
                'id' => $player->id,
                'name' => $player->name,
                'rating' => $player->rating,
                'wins' => $player->wins,
                'losses' => $player->losses,
                'rank' => $player->rankProgress(),
            ]);
    }
}
