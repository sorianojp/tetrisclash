<?php

namespace App\Http\Controllers;

use App\Models\Duel;
use App\Models\PracticeRun;
use App\Models\Replay;
use App\Models\User;
use App\Support\ReplayData;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class ReplayController extends Controller
{
    /**
     * A player uploads their side of a finished duel. The first upload sticks.
     */
    public function storeDuel(Request $request, Duel $duel): Response
    {
        /** @var User $user */
        $user = $request->user();

        abort_unless($duel->hasPlayer($user), 403);
        abort_unless($duel->isFinished(), 409);

        $parsed = ReplayData::parse($request->validate([
            'data' => ['required', 'string', 'max:'.ReplayData::MAX_UPLOAD_BYTES],
        ])['data']);

        abort_if($parsed === null, 422, 'That replay could not be read.');

        Replay::query()->firstOrCreate(
            ['duel_id' => $duel->id, 'user_id' => $user->id],
            ['duration_ms' => $parsed['durationMs'], 'data' => $parsed['data']],
        );

        return response()->noContent();
    }

    /**
     * Both boards of a finished duel, side by side. A side the player never uploaded
     * (they closed the tab) plays as empty.
     */
    public function showDuel(Duel $duel): InertiaResponse
    {
        abort_unless($duel->isFinished(), 404);

        $replays = Replay::query()->where('duel_id', $duel->id)->get()->keyBy('user_id');
        $players = User::query()->whereKey([$duel->player_one_id, $duel->player_two_id])->get()->keyBy('id');

        $timeline = fn (int $id) => [
            'player' => self::profile($players[$id]),
            'data' => $replays->get($id)?->data,
            'durationMs' => $replays->get($id)->duration_ms ?? 0,
        ];

        return Inertia::render('replay', [
            'kind' => 'duel',
            'duel' => $duel->toClient(),
            'run' => null,
            'timelines' => [$timeline($duel->player_one_id), $timeline($duel->player_two_id)],
        ]);
    }

    /**
     * A recorded practice run (personal and weekly bests keep theirs).
     */
    public function showRun(PracticeRun $run): InertiaResponse
    {
        $replay = Replay::query()->where('practice_run_id', $run->id)->firstOrFail();

        return Inertia::render('replay', [
            'kind' => 'practice',
            'duel' => null,
            'run' => ['mode' => $run->mode, 'value' => $run->value, 'playedAt' => $run->created_at?->toFormattedDateString()],
            'timelines' => [[
                'player' => self::profile($run->user),
                'data' => $replay->data,
                'durationMs' => $replay->duration_ms,
            ]],
        ]);
    }

    /**
     * @return array{id: int, name: string, rank: array{rank: int, title: string, xp: int, xpIntoRank: int, xpForNext: int|null}}
     */
    private static function profile(User $player): array
    {
        return ['id' => $player->id, 'name' => $player->name, 'rank' => $player->rankProgress()];
    }
}
