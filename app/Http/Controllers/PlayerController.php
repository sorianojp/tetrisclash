<?php

namespace App\Http\Controllers;

use App\Models\Duel;
use App\Models\User;
use Inertia\Inertia;
use Inertia\Response;

class PlayerController extends Controller
{
    /**
     * A player's public profile: rank, ranked record, practice bests and match history.
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
            'recentDuels' => Duel::recentFor($player, 15),
        ]);
    }
}
