<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Tournament;
use App\Models\TournamentMatch;
use App\Models\TournamentPlayer;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class TournamentController extends Controller
{
    /**
     * Open and running tournaments with who's in them and which matches are undecided.
     */
    public function index(): Response
    {
        $tournaments = Tournament::query()
            ->whereIn('status', [Tournament::STATUS_OPEN, Tournament::STATUS_RUNNING])
            ->with(['players.user:id,name', 'matches.duel:id,finished_at', 'creator:id,name'])
            ->latest('id')
            ->get();

        return Inertia::render('admin/tournaments', [
            'tournaments' => $tournaments->map(function (Tournament $tournament) {
                $names = $tournament->players->mapWithKeys(fn (TournamentPlayer $entry) => [$entry->user_id => $entry->user->name]);
                $player = fn (?int $id) => $id === null ? null : ['id' => $id, 'name' => $names->get($id, '?')];

                return [
                    'id' => $tournament->id,
                    'name' => $tournament->name,
                    'mode' => $tournament->mode,
                    'status' => $tournament->status,
                    'creator' => $tournament->creator?->name,
                    'createdAt' => $tournament->created_at?->diffForHumans(),
                    'players' => $tournament->players->map(fn (TournamentPlayer $entry) => [
                        'id' => $entry->user_id,
                        'name' => $entry->user->name,
                        'eliminated' => $entry->eliminated_at !== null,
                    ])->values(),
                    'pendingMatches' => $tournament->matches
                        ->whereNull('winner_id')
                        ->sortBy(['round', 'position'])
                        ->map(fn (TournamentMatch $match) => [
                            'id' => $match->id,
                            'round' => Tournament::roundName($match->round),
                            'players' => [$player($match->player_one_id), $player($match->player_two_id)],
                            'duelId' => $match->duel_id,
                            'live' => $match->duel !== null && $match->duel->finished_at === null,
                        ])->values(),
                ];
            }),
            'size' => Tournament::SIZE,
        ]);
    }

    public function destroy(Tournament $tournament): RedirectResponse
    {
        $tournament->cancel();

        return $this->done(__(':name was cancelled.', ['name' => $tournament->name]));
    }

    /**
     * Take a player out of a tournament that hasn't started.
     */
    public function removePlayer(Tournament $tournament, User $user): RedirectResponse
    {
        if ($tournament->status !== Tournament::STATUS_OPEN) {
            throw ValidationException::withMessages(['tournament' => __('Players can only be removed before it starts. Decide their match instead.')]);
        }

        $tournament->leave($user);

        return $this->done(__(':name was removed.', ['name' => $user->name]));
    }

    /**
     * Decide a stuck match for one of its players.
     */
    public function advance(Request $request, Tournament $tournament, TournamentMatch $match): RedirectResponse
    {
        $winnerId = (int) $request->validate([
            'winner_id' => ['required', 'integer'],
        ])['winner_id'];

        $tournament->forceAdvance($match, $winnerId);

        return $this->done(__('Match decided.'));
    }

    private function done(string $message): RedirectResponse
    {
        Inertia::flash('toast', ['type' => 'success', 'message' => $message]);

        return back();
    }
}
