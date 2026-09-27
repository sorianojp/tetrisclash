<?php

namespace App\Http\Controllers;

use App\Models\Duel;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DuelController extends Controller
{
    public function show(Request $request, Duel $duel): Response
    {
        $user = $this->player($request, $duel);
        $opponent = User::query()->findOrFail($duel->opponentIdOf($user));

        $profile = fn (User $player) => [
            'id' => $player->id,
            'name' => $player->name,
            'rating' => $player->rating,
            'rank' => $player->rankProgress(),
        ];

        return Inertia::render('duel', [
            'duel' => $duel->toClient(),
            'me' => $profile($user),
            'opponent' => $profile($opponent),
            'seed' => $duel->seed,
            'startsAt' => $duel->starts_at->getTimestampMs(),
            'endsAt' => $duel->ends_at->getTimestampMs(),
            'serverNow' => now()->getTimestampMs(),
            'kosToWin' => Duel::KOS_TO_WIN,
            'raceLines' => Duel::RACE_LINES,
        ]);
    }

    /**
     * The current player topped out.
     */
    public function knockOut(Request $request, Duel $duel): JsonResponse
    {
        $duel->recordKnockOut($this->player($request, $duel), $this->linesSent($request));

        return response()->json($duel->toClient());
    }

    /**
     * Periodic "still here" ping carrying the player's attack total (and lines cleared, for races).
     */
    public function heartbeat(Request $request, Duel $duel): JsonResponse
    {
        $lines = (int) ($request->validate([
            'lines' => ['sometimes', 'integer', 'min:0', 'max:1000'],
        ])['lines'] ?? 0);

        $duel->heartbeat($this->player($request, $duel), $this->linesSent($request), $lines);

        return response()->json($duel->toClient());
    }

    public function forfeit(Request $request, Duel $duel): JsonResponse
    {
        $duel->forfeit($this->player($request, $duel));

        return response()->json($duel->toClient());
    }

    private function player(Request $request, Duel $duel): User
    {
        /** @var User $user */
        $user = $request->user();

        abort_unless($duel->hasPlayer($user), 403);

        return $user;
    }

    private function linesSent(Request $request): int
    {
        $validated = $request->validate([
            'lines_sent' => ['sometimes', 'integer', 'min:0', 'max:1000'],
        ]);

        return (int) ($validated['lines_sent'] ?? 0);
    }
}
