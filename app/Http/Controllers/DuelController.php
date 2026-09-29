<?php

namespace App\Http\Controllers;

use App\Models\Duel;
use App\Models\Tournament;
use App\Models\TournamentMatch;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
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
            'tournament' => self::tournamentOf($duel),
        ]);
    }

    /**
     * The bracket a duel belongs to, if it's a tournament match.
     *
     * @return array{id: int, name: string, round: string}|null
     */
    private static function tournamentOf(Duel $duel): ?array
    {
        $match = TournamentMatch::query()->with('tournament:id,name')->where('duel_id', $duel->id)->first();

        return $match === null ? null : [
            'id' => $match->tournament_id,
            'name' => $match->tournament->name,
            'round' => Tournament::roundName($match->round),
        ];
    }

    /**
     * Spectate a duel: both boards, live. Its players are sent to their own view.
     */
    public function watch(Request $request, Duel $duel): Response|RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($duel->hasPlayer($user) && ! $duel->isFinished()) {
            return redirect()->route('duels.show', $duel);
        }

        $players = User::query()->whereKey([$duel->player_one_id, $duel->player_two_id])->get()->keyBy('id');

        $profile = fn (User $player) => [
            'id' => $player->id,
            'name' => $player->name,
            'rating' => $player->rating,
            'rank' => $player->rankProgress(),
        ];

        return Inertia::render('watch', [
            'duel' => $duel->toClient(),
            'players' => [$profile($players[$duel->player_one_id]), $profile($players[$duel->player_two_id])],
            'startsAt' => $duel->starts_at->getTimestampMs(),
            'endsAt' => $duel->ends_at->getTimestampMs(),
            'serverNow' => now()->getTimestampMs(),
            'kosToWin' => Duel::KOS_TO_WIN,
            'raceLines' => Duel::RACE_LINES,
            'tournament' => self::tournamentOf($duel),
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
