<?php

namespace App\Http\Controllers;

use App\Events\DuelFound;
use App\Models\Duel;
use App\Models\User;
use Carbon\CarbonInterface;
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

    /** Allowed rating gap when a search starts; it widens the longer a player waits. */
    public const RATING_RANGE_START = 100;

    public const RATING_RANGE_GROWTH_PER_SECOND = 25;

    /** After this long, a searching player will accept any opponent. */
    public const ANY_OPPONENT_AFTER_SECONDS = 20;

    /**
     * The rating gap a player accepts after searching for this long (null = anyone).
     */
    public static function ratingRange(int $waitedSeconds): ?int
    {
        if ($waitedSeconds >= self::ANY_OPPONENT_AFTER_SECONDS) {
            return null;
        }

        return self::RATING_RANGE_START + $waitedSeconds * self::RATING_RANGE_GROWTH_PER_SECOND;
    }

    /**
     * Join (or refresh a spot in) the matchmaking queue. Players are paired with the closest
     * rating that either side's widening range accepts.
     */
    public function store(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($active = self::activeDuelFor($user)) {
            return response()->json(['duelId' => $active->id]);
        }

        $stillQueued = $user->queued_at?->gte(now()->subSeconds(self::QUEUE_TTL_SECONDS));
        $searchingSince = $stillQueued && $user->searching_since ? $user->searching_since : now();
        $myRange = self::ratingRange(self::secondsSince($searchingSince));

        $duel = DB::transaction(function () use ($user, $searchingSince, $myRange) {
            $opponent = User::query()
                ->whereKeyNot($user->id)
                ->where('queued_at', '>=', now()->subSeconds(self::QUEUE_TTL_SECONDS))
                ->lockForUpdate()
                ->get()
                ->filter(function (User $candidate) use ($user, $myRange) {
                    $theirRange = self::ratingRange(self::secondsSince($candidate->searching_since ?? $candidate->queued_at));
                    $range = $myRange === null || $theirRange === null ? null : max($myRange, $theirRange);

                    return $range === null || abs($candidate->rating - $user->rating) <= $range;
                })
                ->sortBy([
                    fn (User $a, User $b) => abs($a->rating - $user->rating) <=> abs($b->rating - $user->rating),
                    fn (User $a, User $b) => ($a->searching_since ?? $a->queued_at) <=> ($b->searching_since ?? $b->queued_at),
                ])
                ->first();

            if ($opponent === null) {
                $user->forceFill(['queued_at' => now(), 'searching_since' => $searchingSince])->save();

                return null;
            }

            User::query()->whereKey([$user->id, $opponent->id])->update(['queued_at' => null, 'searching_since' => null]);

            return Duel::start($opponent, $user);
        });

        if ($duel === null) {
            return response()->json(['queued' => true, 'range' => $myRange]);
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
        $user->forceFill(['queued_at' => null, 'searching_since' => null])->save();

        return response()->noContent();
    }

    private static function secondsSince(?CarbonInterface $time): int
    {
        return $time === null ? 0 : (int) max(0, $time->diffInSeconds(now()));
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
