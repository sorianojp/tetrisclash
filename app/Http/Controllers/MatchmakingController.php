<?php

namespace App\Http\Controllers;

use App\Events\DuelFound;
use App\Models\Duel;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

class MatchmakingController extends Controller
{
    /**
     * Players must re-join the queue at least this often to stay matchable,
     * so abandoned tabs drop out on their own.
     */
    public const QUEUE_TTL_SECONDS = 20;

    /**
     * Join (or refresh a spot in) the matchmaking queue.
     */
    public function store(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($active = self::activeDuelFor($user)) {
            return response()->json(['duelId' => $active->id]);
        }

        $duel = DB::transaction(function () use ($user) {
            $opponent = User::query()
                ->whereKeyNot($user->id)
                ->where('queued_at', '>=', now()->subSeconds(self::QUEUE_TTL_SECONDS))
                ->orderBy('queued_at')
                ->lockForUpdate()
                ->first();

            if ($opponent === null) {
                $user->forceFill(['queued_at' => now()])->save();

                return null;
            }

            User::query()->whereKey([$user->id, $opponent->id])->update(['queued_at' => null]);

            return Duel::start($opponent, $user);
        });

        if ($duel === null) {
            return response()->json(['queued' => true]);
        }

        DuelFound::dispatch($duel);

        return response()->json(['duelId' => $duel->id]);
    }

    /**
     * Leave the matchmaking queue.
     */
    public function destroy(Request $request): Response
    {
        /** @var User $user */
        $user = $request->user();
        $user->forceFill(['queued_at' => null])->save();

        return response()->noContent();
    }

    public static function activeDuelFor(User $user): ?Duel
    {
        return Duel::query()
            ->whereNull('finished_at')
            ->where(fn ($query) => $query->where('player_one_id', $user->id)->orWhere('player_two_id', $user->id))
            ->latest('id')
            ->first();
    }
}
