<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Duel;
use App\Models\TournamentMatch;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class DuelController extends Controller
{
    /**
     * Duels in progress (a stuck one can be ended) and the latest finished ones.
     */
    public function index(): Response
    {
        $row = fn (Duel $duel) => [
            'id' => $duel->id,
            'mode' => $duel->mode,
            'ranked' => $duel->ranked,
            'players' => [
                ['id' => $duel->player_one_id, 'name' => $duel->playerOne->name],
                ['id' => $duel->player_two_id, 'name' => $duel->playerTwo->name],
            ],
            'score' => $duel->isRace()
                ? [$duel->player_one_lines, $duel->player_two_lines]
                : [$duel->player_one_kos, $duel->player_two_kos],
            'winnerId' => $duel->winner_id,
            'reason' => $duel->finish_reason,
            'inTournament' => (bool) $duel->getAttribute('in_tournament'),
            'hasReplay' => (bool) $duel->getAttribute('replays_exists'),
            'startedAt' => $duel->starts_at->diffForHumans(),
            'finishedAt' => $duel->finished_at?->diffForHumans(),
        ];

        $duels = fn () => Duel::query()
            ->with(['playerOne:id,name', 'playerTwo:id,name'])
            ->withExists('replays')
            ->addSelect(['in_tournament' => TournamentMatch::query()->selectRaw('1')->whereColumn('duel_id', 'duels.id')->limit(1)]);

        return Inertia::render('admin/duels', [
            'live' => $duels()->whereNull('finished_at')->latest('id')->get()->map($row),
            'recent' => $duels()->whereNotNull('finished_at')->latest('finished_at')->limit(25)->get()->map($row),
        ]);
    }

    /**
     * End a duel with no winner and no rating change.
     */
    public function cancel(Duel $duel): RedirectResponse
    {
        $duel->cancel();

        Inertia::flash('toast', ['type' => 'success', 'message' => __('Duel ended.')]);

        return back();
    }
}
