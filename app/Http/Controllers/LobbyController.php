<?php

namespace App\Http\Controllers;

use App\Models\Duel;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Collection;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class LobbyController extends Controller
{
    public function index(Request $request): InertiaResponse
    {
        /** @var User $user */
        $user = $request->user();

        $recent = Duel::query()
            ->with(['playerOne:id,name', 'playerTwo:id,name'])
            ->whereNotNull('finished_at')
            ->where(fn ($query) => $query->where('player_one_id', $user->id)->orWhere('player_two_id', $user->id))
            ->latest('finished_at')
            ->limit(8)
            ->get()
            ->map(function (Duel $duel) use ($user) {
                $isOne = $duel->player_one_id === $user->id;

                return [
                    'id' => $duel->id,
                    'opponent' => ($isOne ? $duel->playerTwo : $duel->playerOne)->name,
                    'result' => match ($duel->winner_id) {
                        null => 'draw',
                        $user->id => 'win',
                        default => 'loss',
                    },
                    'myKos' => $isOne ? $duel->player_one_kos : $duel->player_two_kos,
                    'theirKos' => $isOne ? $duel->player_two_kos : $duel->player_one_kos,
                    'reason' => $duel->finish_reason,
                    'ratingChange' => $duel->rating_change,
                    'finishedAt' => $duel->finished_at?->diffForHumans(),
                ];
            });

        return Inertia::render('lobby', [
            'stats' => [
                'rating' => $user->rating,
                'wins' => $user->wins,
                'losses' => $user->losses,
                'bestSprintMs' => $user->best_sprint_ms,
                'rank' => $user->rankProgress(),
            ],
            'leaderboard' => $this->leaderboard(),
            'recentDuels' => $recent,
            'activeDuelId' => MatchmakingController::activeDuelFor($user)?->id,
        ]);
    }

    public function practice(Request $request): InertiaResponse
    {
        /** @var User $user */
        $user = $request->user();

        return Inertia::render('practice', [
            'records' => collect(self::RECORDS)->map(fn (array $record) => $user->{$record['column']}),
        ]);
    }

    /**
     * Practice modes with a personal best: where it's stored, whether a lower value is better,
     * and the range a legitimate result can fall in.
     *
     * @var array<string, array{column: string, lowerIsBetter: bool, min: int, max: int}>
     */
    private const RECORDS = [
        'sprint' => ['column' => 'best_sprint_ms', 'lowerIsBetter' => true, 'min' => 1000, 'max' => 3600000],
        'dig' => ['column' => 'best_dig_ms', 'lowerIsBetter' => true, 'min' => 1000, 'max' => 3600000],
        'ultra' => ['column' => 'best_ultra_score', 'lowerIsBetter' => false, 'min' => 0, 'max' => 10000000],
        'survival' => ['column' => 'best_survival_ms', 'lowerIsBetter' => false, 'min' => 0, 'max' => 86400000],
    ];

    /**
     * Save a practice result if it beats the player's record for that mode.
     */
    public function storeRecord(Request $request): Response
    {
        /** @var User $user */
        $user = $request->user();

        $mode = $request->validate([
            'mode' => ['required', 'string', 'in:'.implode(',', array_keys(self::RECORDS))],
        ])['mode'];
        $record = self::RECORDS[$mode];

        $value = (int) $request->validate([
            'value' => ['required', 'integer', 'min:'.$record['min'], 'max:'.$record['max']],
        ])['value'];

        $best = $user->{$record['column']};
        $improved = $best === null || ($record['lowerIsBetter'] ? $value < $best : $value > $best);

        if ($improved) {
            $user->forceFill([$record['column'] => $value])->save();
        }

        return response()->noContent();
    }

    /**
     * @return Collection<int, array{id: int, name: string, rating: int, wins: int, losses: int, rank: array{rank: int, title: string, xp: int, xpIntoRank: int, xpForNext: int|null}}>
     */
    private function leaderboard(): Collection
    {
        return User::query()
            ->where(fn ($query) => $query->where('wins', '>', 0)->orWhere('losses', '>', 0))
            ->orderByDesc('rating')
            ->limit(10)
            ->get(['id', 'name', 'rating', 'wins', 'losses', 'xp'])
            ->map(fn (User $player) => [
                'id' => $player->id,
                'name' => $player->name,
                'rating' => $player->rating,
                'wins' => $player->wins,
                'losses' => $player->losses,
                'rank' => $player->rankProgress(),
            ]);
    }
}
