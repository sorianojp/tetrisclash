<?php

namespace App\Http\Controllers;

use App\Models\Challenge;
use App\Models\Duel;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response as HttpResponse;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Friend challenges: share a link, and whoever opens it can start an unranked duel with you.
 * Invites (see InviteController) are challenges only the invited player can accept.
 */
class ChallengeController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        $mode = $request->validate([
            'mode' => ['required', Rule::in(Duel::MODES)],
        ])['mode'];

        if ($active = MatchmakingController::activeDuelFor($user)) {
            return to_route('duels.show', $active);
        }

        $challenge = Challenge::open($user, $mode);

        return to_route('challenges.show', $challenge);
    }

    public function show(Request $request, Challenge $challenge): Response|RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        // Once accepted, both players belong in the duel (the challenger may have missed the broadcast).
        if ($challenge->duel_id !== null) {
            $duel = Duel::query()->find($challenge->duel_id);

            if ($duel && $duel->hasPlayer($user) && ! $duel->isFinished()) {
                return to_route('duels.show', $duel);
            }
        }

        // An invite is private to its two players.
        abort_if($challenge->isInvite() && ! in_array($user->id, [$challenge->challenger_id, $challenge->invitee_id], true), 404);

        $challenger = $challenge->challenger;
        $invitee = $challenge->invitee;

        return Inertia::render('challenge', [
            'challenge' => [
                'code' => $challenge->code,
                'mode' => $challenge->mode,
                'status' => match (true) {
                    $challenge->isAccepted() => 'accepted',
                    $challenge->isExpired() => 'expired',
                    default => 'open',
                },
                'expiresAt' => $challenge->expires_at->getTimestampMs(),
                'url' => route('challenges.show', $challenge),
            ],
            'challenger' => [
                'id' => $challenger->id,
                'name' => $challenger->name,
                'rating' => $challenger->rating,
                'rank' => $challenger->rankProgress(),
            ],
            'invitee' => $invitee ? ['id' => $invitee->id, 'name' => $invitee->name] : null,
            'isChallenger' => $challenger->is($user),
            'serverNow' => now()->getTimestampMs(),
        ]);
    }

    public function accept(Request $request, Challenge $challenge): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        $duel = $challenge->accept($user);

        if ($duel === null) {
            Inertia::flash('toast', ['type' => 'error', 'message' => __('This challenge can no longer be accepted.')]);

            return to_route('challenges.show', $challenge);
        }

        return to_route('duels.show', $duel);
    }

    /**
     * The invited player turns the invite down.
     */
    public function decline(Request $request, Challenge $challenge): HttpResponse
    {
        abort_unless($challenge->isInvite() && $challenge->invitee_id === $request->user()?->id, 403);

        $challenge->decline();

        return response()->noContent();
    }

    public function destroy(Request $request, Challenge $challenge): RedirectResponse
    {
        abort_unless($challenge->challenger_id === $request->user()?->id, 403);

        if (! $challenge->isAccepted()) {
            $challenge->withdraw();
        }

        return to_route('dashboard');
    }
}
