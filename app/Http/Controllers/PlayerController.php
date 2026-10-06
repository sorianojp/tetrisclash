<?php

namespace App\Http\Controllers;

use App\Models\Duel;
use App\Models\User;
use App\Support\Achievements;
use App\Support\PracticeLeaderboards;
use Inertia\Inertia;
use Inertia\Response;

class PlayerController extends Controller
{
    /**
     * A player's public profile: rank, ranked record, practice bests (with leaderboard placings), achievements and match history.
     */
    public function show(User $player): Response
    {
        return Inertia::render('player', [
            'player' => [
                'id' => $player->id,
                'name' => $player->name,
                'joinedAt' => $player->created_at?->toFormattedDateString(),
                'rating' => $player->rating,
                'wins' => $player->wins,
                'losses' => $player->losses,
                'rank' => $player->rankProgress(),
                'autopilot' => $player->isAutopilot(),
            ],
            'records' => $player->practiceRecords(),
            'placements' => PracticeLeaderboards::placements($player),
            'achievements' => Achievements::forPlayer($player),
            'recentDuels' => Duel::recentFor($player, 15),
            'liveDuelId' => MatchmakingController::activeDuelFor($player)?->id,
        ]);
    }
}
