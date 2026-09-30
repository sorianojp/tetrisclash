<?php

namespace App\Http\Controllers\Internal;

use App\Http\Controllers\Controller;
use App\Models\Challenge;
use App\Models\Duel;
use App\Models\Replay;
use App\Models\User;
use App\Support\Achievements;
use App\Support\Bots;
use App\Support\PracticeResults;
use App\Support\ReplayData;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Broadcast;

/**
 * The bot runner's side door: what the bots should be doing, and the same actions a player's
 * browser takes (join channels, heartbeat, report KOs, upload replays, answer invites), taken
 * on a bot's behalf.
 */
class BotRunnerController extends Controller
{
    /**
     * Duels bots are playing, invites waiting on a bot's answer, and bots free to practice.
     */
    public function work(): JsonResponse
    {
        $bots = User::query()->bots()->get()->keyBy('id');

        $duels = Duel::query()
            ->whereNull('finished_at')
            ->where(fn ($query) => $query->whereIn('player_one_id', $bots->keys())->orWhereIn('player_two_id', $bots->keys()))
            ->get()
            ->flatMap(fn (Duel $duel) => collect([$duel->player_one_id, $duel->player_two_id])
                ->filter(fn (int $id) => $bots->has($id))
                ->map(fn (int $id) => [
                    'duelId' => $duel->id,
                    'botId' => $id,
                    'seed' => $duel->seed,
                    'mode' => $duel->mode,
                    'startsAt' => $duel->starts_at->getTimestampMs(),
                    'endsAt' => $duel->ends_at->getTimestampMs(),
                    'playerIds' => [$duel->player_one_id, $duel->player_two_id],
                    'style' => Bots::style($bots[$id]),
                ]))
            ->values();

        $invites = Challenge::query()
            ->whereIn('invitee_id', $bots->keys())
            ->whereNull('duel_id')
            ->where('expires_at', '>', now())
            ->get()
            ->map(fn (Challenge $invite) => [
                'code' => $invite->code,
                'botId' => $invite->invitee_id,
                'expiresAt' => $invite->expires_at->getTimestampMs(),
                'style' => Bots::style($bots[$invite->invitee_id]),
            ]);

        $idle = Bots::enabled()
            ? Bots::idleOnline()->map(fn (User $bot) => ['botId' => $bot->id, 'style' => Bots::style($bot)])->values()
            : [];

        return response()->json([
            'enabled' => Bots::enabled(),
            'serverNow' => now()->getTimestampMs(),
            'duels' => $duels,
            'invites' => $invites,
            'idle' => $idle,
        ]);
    }

    /**
     * Sign a channel subscription for a bot, exactly as /broadcasting/auth does for a player.
     */
    public function auth(Request $request, User $bot): mixed
    {
        $request->setUserResolver(fn () => $bot);

        return Broadcast::auth($request);
    }

    public function heartbeat(Request $request, User $bot, Duel $duel): JsonResponse
    {
        abort_unless($duel->hasPlayer($bot), 403);

        $validated = $request->validate([
            'lines_sent' => ['required', 'integer', 'min:0', 'max:1000'],
            'lines' => ['required', 'integer', 'min:0', 'max:1000'],
        ]);

        $duel->heartbeat($bot, (int) $validated['lines_sent'], (int) $validated['lines']);

        return response()->json($duel->toClient());
    }

    public function knockOut(Request $request, User $bot, Duel $duel): JsonResponse
    {
        abort_unless($duel->hasPlayer($bot), 403);

        $linesSent = (int) $request->validate([
            'lines_sent' => ['required', 'integer', 'min:0', 'max:1000'],
        ])['lines_sent'];

        $duel->recordKnockOut($bot, $linesSent);

        return response()->json($duel->toClient());
    }

    public function replay(Request $request, User $bot, Duel $duel): Response
    {
        abort_unless($duel->hasPlayer($bot) && $duel->isFinished(), 403);

        $upload = $request->validate([
            'data' => ['required', 'string', 'max:'.ReplayData::MAX_UPLOAD_BYTES],
        ])['data'];

        abort_unless(Replay::storeDuelSide($duel, $bot, $upload), 422);

        return response()->noContent();
    }

    /**
     * "Still here" while a bot is busy practicing, like a player's open tab pinging.
     */
    public function seen(User $bot): Response
    {
        $bot->markSeen();

        return response()->noContent();
    }

    /**
     * A bot finished a practice run: saved exactly like a player's.
     */
    public function practice(Request $request, User $bot): Response
    {
        ['mode' => $mode, 'value' => $value, 'replay' => $replay] = PracticeResults::validate($request);
        PracticeResults::record($bot, $mode, $value, $replay);
        $bot->markSeen();

        return response()->noContent();
    }

    /**
     * A skill achievement the bot's game saw happen (a Tetris, a T-spin…).
     */
    public function achievement(Request $request, User $bot): Response
    {
        $key = $request->validate([
            'key' => ['required', 'string', 'in:'.implode(',', Achievements::REPORTED_BY_CLIENT)],
        ])['key'];

        Achievements::award($bot, $key);

        return response()->noContent();
    }

    public function acceptInvite(User $bot, Challenge $challenge): JsonResponse
    {
        abort_unless($challenge->invitee_id === $bot->id, 403);

        return response()->json(['duelId' => $challenge->accept($bot)?->id]);
    }

    public function declineInvite(User $bot, Challenge $challenge): Response
    {
        abort_unless($challenge->invitee_id === $bot->id, 403);

        $challenge->decline();

        return response()->noContent();
    }
}
