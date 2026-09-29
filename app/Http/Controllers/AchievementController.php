<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Support\Achievements;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class AchievementController extends Controller
{
    /**
     * Unlock a skill achievement the game client saw happen (a Tetris, a T-spin…).
     */
    public function store(Request $request): Response
    {
        /** @var User $user */
        $user = $request->user();

        $key = $request->validate([
            'key' => ['required', 'string', 'in:'.implode(',', Achievements::REPORTED_BY_CLIENT)],
        ])['key'];

        Achievements::award($user, $key);

        return response()->noContent();
    }
}
