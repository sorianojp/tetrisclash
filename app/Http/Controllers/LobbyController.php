<?php

namespace App\Http\Controllers;

use App\Models\Duel;
use App\Models\User;
use App\Support\PracticeLeaderboards;
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
     * for that mode if it beats it.
     */
    public function storeRecord(Request $request): Response
    {
        /** @var User $user */
        $user = $request->user();

        $mode = $request->validate([
            'mode' => ['required', 'string', 'in:'.implode(',', array_keys(User::PRACTICE_RECORDS))],
        ])['mode'];
        $record = User::PRACTICE_RECORDS[$mode];

        $value = (int) $request->validate([
            'value' => ['required', 'integer', 'min:'.$record['min'], 'max:'.$record['max']],
        ])['value'];

        $user->practiceRuns()->create(['mode' => $mode, 'value' => $value]);

        $best = $user->{$record['column']};
        $improved = $best === null || ($record['lowerIsBetter'] ? $value < $best : $value > $best);

        if ($improved) {
            $user->forceFill([$record['column'] => $value])->save();
        }

        return response()->noContent();
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
