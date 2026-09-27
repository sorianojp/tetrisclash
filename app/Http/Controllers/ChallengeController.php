<?php

namespace App\Http\Controllers;

use App\Events\DuelFound;
use App\Models\Challenge;
use App\Models\Duel;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Friend challenges: share a link, and whoever opens it can start an unranked duel with you.
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

        $challenger = $challenge->challenger;

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
            'isChallenger' => $challenger->is($user),
            'serverNow' => now()->getTimestampMs(),
        ]);
    }

    public function accept(Request $request, Challenge $challenge): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        $duel = DB::transaction(function () use ($user, $challenge) {
            $challenge = Challenge::query()->lockForUpdate()->findOrFail($challenge->id);

            abort_if($challenge->challenger_id === $user->id, 403, 'You cannot accept your own challenge.');

            if ($challenge->isAccepted() || $challenge->isExpired()) {
                return null;
            }

            $challenger = User::query()->findOrFail($challenge->challenger_id);

            if (MatchmakingController::activeDuelFor($user) || MatchmakingController::activeDuelFor($challenger)) {
                return null;
            }

            User::query()->whereKey([$user->id, $challenger->id])->update(['queued_at' => null, 'searching_since' => null]);

            $duel = Duel::start($challenger, $user, $challenge->mode, ranked: false);
            $challenge->update(['duel_id' => $duel->id]);

            return $duel;
        });

        if ($duel === null) {
            Inertia::flash('toast', ['type' => 'error', 'message' => __('This challenge can no longer be accepted.')]);

            return to_route('challenges.show', $challenge);
        }

        DuelFound::dispatch($duel);

        return to_route('duels.show', $duel);
    }

    public function destroy(Request $request, Challenge $challenge): RedirectResponse
    {
        abort_unless($challenge->challenger_id === $request->user()?->id, 403);

        if (! $challenge->isAccepted()) {
            $challenge->delete();
        }

        return to_route('dashboard');
    }
}
