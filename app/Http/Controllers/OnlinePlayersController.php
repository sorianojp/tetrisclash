<?php

namespace App\Http\Controllers;

use App\Models\Duel;
use App\Models\User;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Who's online: open app tabs ping every 30 seconds (see User::markSeen), and this lists
 * those players a page at a time, closest rating first.
 */
class OnlinePlayersController extends Controller
{
    public const PER_PAGE = 25;

    /** The count is asked for on every ping, so it's cached briefly. */
    public const COUNT_CACHE_SECONDS = 10;

    public function index(Request $request): Response
    {
        /** @var User $user */
        $user = $request->user();
        $user->markSeen();

        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:50'],
            'available' => ['nullable', 'boolean'],
        ]);
        $search = trim($filters['search'] ?? '');
        $availableOnly = (bool) ($filters['available'] ?? false);

        $players = User::query()
            ->online()
            ->whereKeyNot($user->id)
            ->when($search !== '', fn ($query) => $query->where('name', 'like', '%'.addcslashes($search, '%_\\').'%'))
            ->when($availableOnly, fn ($query) => $query
                ->where('accepts_invites', true)
                ->whereNotExists(fn (Builder $duels) => $duels
                    ->from('duels')
                    ->whereNull('finished_at')
                    ->where(fn (Builder $players) => $players
                        ->whereColumn('duels.player_one_id', 'users.id')
                        ->orWhereColumn('duels.player_two_id', 'users.id'))))
            // Rating gap, written so it never goes negative: `rating` is unsigned in MySQL,
            // where `rating - ?` fails outright for anyone rated below the viewer.
            ->orderByRaw('CASE WHEN rating >= ? THEN rating - ? ELSE ? - rating END', array_fill(0, 3, $user->rating))
            ->orderBy('name')
            ->paginate(self::PER_PAGE, ['id', 'name', 'rating', 'xp', 'accepts_invites', 'autopilot'])
            ->withQueryString();

        $inMatch = self::playersInMatch($players->getCollection()->pluck('id'));

        return Inertia::render('online', [
            'players' => $players->through(fn (User $player) => [
                'id' => $player->id,
                'name' => $player->name,
                'rating' => $player->rating,
                'rank' => $player->rankProgress(),
                'acceptsInvites' => $player->accepts_invites,
                'autopilot' => $player->isAutopilot(),
                'inMatch' => $inMatch->has($player->id),
                'duelId' => $inMatch->get($player->id),
            ]),
            'filters' => ['search' => $search, 'available' => $availableOnly],
            'onlineCount' => self::onlineCount(),
            'canInvite' => MatchmakingController::activeDuelFor($user) === null,
        ]);
    }

    /**
     * "Still here" ping from an open app tab. Answers with how many players are online.
     */
    public function ping(Request $request): JsonResponse
    {
        $request->user()->markSeen();

        return response()->json(['online' => self::onlineCount()]);
    }

    public static function onlineCount(): int
    {
        return Cache::remember('online-count', self::COUNT_CACHE_SECONDS, fn () => User::query()->online()->count());
    }

    /**
     * The unfinished duel each of these players is in, keyed by player id.
     *
     * @param  Collection<int, int>  $ids
     * @return Collection<int, int>
     */
    private static function playersInMatch(Collection $ids): Collection
    {
        if ($ids->isEmpty()) {
            return collect();
        }

        $duels = Duel::query()
            ->whereNull('finished_at')
            ->where(fn ($query) => $query->whereIn('player_one_id', $ids)->orWhereIn('player_two_id', $ids))
            ->get(['id', 'player_one_id', 'player_two_id']);

        $byPlayer = collect();

        foreach ($duels as $duel) {
            $byPlayer[$duel->player_one_id] = $duel->id;
            $byPlayer[$duel->player_two_id] = $duel->id;
        }

        return $byPlayer->only($ids->all());
    }
}
