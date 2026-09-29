<?php

namespace App\Http\Controllers;

use App\Models\Duel;
use App\Models\User;
use App\Support\PracticeLeaderboards;
use Inertia\Inertia;
use Inertia\Response;

class PlayerController extends Controller
{
    /**
     * A player's public profile: rank, ranked record, practice bests (with leaderboard placings) and match history.
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
            ],
            'records' => $player->practiceRecords(),
            'placements' => PracticeLeaderboards::placements($player),
            'recentDuels' => Duel::recentFor($player, 15),
        ]);
    }
}
