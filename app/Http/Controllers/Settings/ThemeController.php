<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Themes;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class ThemeController extends Controller
{
    /**
     * Show the piece themes and board skins, locked and unlocked.
     */
    public function edit(Request $request): Response
    {
        /** @var User $user */
        $user = $request->user();

        return Inertia::render('settings/themes', [
            'pieces' => Themes::optionsFor($user, Themes::PIECES),
            'boards' => Themes::optionsFor($user, Themes::BOARDS),
            'rank' => $user->rankProgress(),
        ]);
    }

    /**
     * Switch to themes the player's rank has unlocked.
     */
    public function update(Request $request): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'piece_theme' => ['sometimes', 'string', Rule::in(Themes::unlocked($user, Themes::PIECES))],
            'board_skin' => ['sometimes', 'string', Rule::in(Themes::unlocked($user, Themes::BOARDS))],
        ], [
            'in' => 'Reach a higher rank to unlock that one.',
        ]);

        $user->forceFill($validated)->save();

        return back();
    }
}
