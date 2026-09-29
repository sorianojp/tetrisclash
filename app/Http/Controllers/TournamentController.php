<?php

namespace App\Http\Controllers;

use App\Models\Duel;
use App\Models\Tournament;
use App\Models\TournamentMatch;
use App\Models\TournamentPlayer;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class TournamentController extends Controller
{
    /**
     * Tournaments taking sign-ups, in progress, and recently won.
     */
    public function index(Request $request): Response
    {
        /** @var User $user */
        $user = $request->user();

        $summary = fn (Tournament $tournament) => [
            'id' => $tournament->id,
            'name' => $tournament->name,
            'mode' => $tournament->mode,
            'players' => $tournament->getAttribute('players_count'),
            'winner' => $tournament->winner?->name,
            'finishedAt' => $tournament->finished_at?->diffForHumans(),
        ];

        $list = fn (string $status, int $limit) => Tournament::query()
            ->where('status', $status)
            ->withCount('players')
            ->with('winner:id,name')
            ->latest($status === Tournament::STATUS_FINISHED ? 'finished_at' : 'id')
            ->limit($limit)
            ->get()
            ->map($summary);

        return Inertia::render('tournaments/index', [
            'open' => $list(Tournament::STATUS_OPEN, 20),
            'running' => $list(Tournament::STATUS_RUNNING, 20),
            'finished' => $list(Tournament::STATUS_FINISHED, 10),
            'currentId' => Tournament::activeFor($user)?->id,
            'size' => Tournament::SIZE,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();

        $mode = $request->validate([
            'mode' => ['required', Rule::in(Duel::MODES)],
        ])['mode'];

        return to_route('tournaments.show', Tournament::openBy($user, $mode));
    }

    /**
     * The bracket, kept fresh by polling.
     */
    public function show(Request $request, Tournament $tournament): Response
    {
        /** @var User $user */
        $user = $request->user();

        $entries = $tournament->players()->with('user:id,name,xp')->get();
        $profiles = $entries->mapWithKeys(fn (TournamentPlayer $entry) => [$entry->user_id => [
            'id' => $entry->user_id,
            'name' => $entry->user->name,
            'rank' => $entry->user->rankProgress(),
            'seed' => $entry->seed,
            'eliminated' => $entry->eliminated_at !== null,
        ]]);

        $matches = $tournament->matches()->with('duel:id,finished_at,player_one_kos,player_two_kos,player_one_lines,player_two_lines')
            ->orderBy('round')->orderBy('position')->get();

        return Inertia::render('tournaments/show', [
            'tournament' => [
                'id' => $tournament->id,
                'name' => $tournament->name,
                'mode' => $tournament->mode,
                'status' => $tournament->status,
                'winnerId' => $tournament->winner_id,
                'size' => Tournament::SIZE,
            ],
            'players' => $profiles->values(),
            'rounds' => $matches->groupBy('round')->map(fn ($round, $number) => [
                'name' => Tournament::roundName((int) $number),
                'matches' => $round->map(fn (TournamentMatch $match) => [
                    'id' => $match->id,
                    'players' => [$profiles->get($match->player_one_id), $profiles->get($match->player_two_id)],
                    'score' => $match->duel ? ($tournament->mode === Duel::MODE_RACE
                        ? [$match->duel->player_one_lines, $match->duel->player_two_lines]
                        : [$match->duel->player_one_kos, $match->duel->player_two_kos]) : null,
                    'winnerId' => $match->winner_id,
                    'duelId' => $match->duel_id,
                    'live' => $match->duel !== null && $match->duel->finished_at === null,
                ])->values(),
            ])->values(),
            'joined' => $profiles->has($user->id),
            'currentId' => Tournament::activeFor($user)?->id,
        ]);
    }

    public function join(Request $request, Tournament $tournament): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $tournament->join($user);

        return to_route('tournaments.show', $tournament);
    }

    public function leave(Request $request, Tournament $tournament): RedirectResponse
    {
        /** @var User $user */
        $user = $request->user();
        $tournament->leave($user);

        return to_route('tournaments.index');
    }
}
