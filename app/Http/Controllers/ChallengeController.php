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

    /**
     * Anyone with the link can see a challenge, so a friend without an account sees who's
     * challenging them (and so does the link preview). Signing up brings them back here.
     */
    public function show(Request $request, Challenge $challenge): Response|RedirectResponse
    {
        /** @var User|null $user */
        $user = $request->user();

        // An invite is private to its two players.
        if ($challenge->isInvite() && $user === null) {
            return redirect()->guest(route('login'));
        }

        abort_if($challenge->isInvite() && ! in_array($user?->id, [$challenge->challenger_id, $challenge->invitee_id], true), 404);

        // Once accepted, both players belong in the duel (the challenger may have missed the broadcast).
        if ($user !== null && $challenge->duel_id !== null) {
            $duel = Duel::query()->find($challenge->duel_id);

            if ($duel && $duel->hasPlayer($user) && ! $duel->isFinished()) {
                return to_route('duels.show', $duel);
            }
        }

        if ($user === null) {
            // Log in or sign up, then land back here to accept.
            $request->session()->put('url.intended', $request->fullUrl());
        }

        $challenger = $challenge->challenger;
        $invitee = $challenge->invitee;
        $modeName = $challenge->mode === Duel::MODE_RACE ? 'race' : 'battle';

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
            'isChallenger' => $user !== null && $challenger->is($user),
            'serverNow' => now()->getTimestampMs(),
        ])->withViewData(['meta' => [
            'title' => "{$challenger->name} challenges you to a 1v1 {$modeName}!",
            'description' => ($challenge->mode === Duel::MODE_RACE
                ? 'First to clear '.Duel::RACE_LINES.' lines wins.'
                : 'Send garbage and score '.Duel::KOS_TO_WIN.' KOs to win.')
                ." Accept {$challenger->name}'s challenge on ".config('app.name').', free in your browser.',
        ]]);
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
