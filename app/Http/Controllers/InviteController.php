<?php

namespace App\Http\Controllers;

use App\Events\InviteReceived;
use App\Models\Challenge;
use App\Models\Duel;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

/**
 * Invites: challenge a player from the online list directly, instead of sharing a link.
 */
class InviteController extends Controller
{
    public function store(Request $request, User $player): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        $mode = $request->validate([
            'mode' => ['required', Rule::in(Duel::MODES)],
        ])['mode'];

        abort_if($player->is($user), 403, 'You cannot invite yourself.');

        if ($active = MatchmakingController::activeDuelFor($user)) {
            return to_route('duels.show', $active);
        }

        $problem = match (true) {
            ! $player->accepts_invites, $player->isBanned(), $player->bot_paused_at !== null => __(':name isn\'t accepting invites right now.', ['name' => $player->name]),
            MatchmakingController::activeDuelFor($player) !== null => __(':name is in a match right now.', ['name' => $player->name]),
            default => null,
        };

        if ($problem !== null) {
            Inertia::flash('toast', ['type' => 'error', 'message' => $problem]);

            return back();
        }

        $challenge = Challenge::open($user, $mode, $player);
        InviteReceived::dispatch($challenge);

        return to_route('challenges.show', $challenge);
    }

    /**
     * Turn incoming invites on or off.
     */
    public function preference(Request $request): RedirectResponse
    {
        $accepts = $request->validate([
            'accepts_invites' => ['required', 'boolean'],
        ])['accepts_invites'];

        $request->user()->forceFill(['accepts_invites' => $accepts])->save();

        return back();
    }
}
