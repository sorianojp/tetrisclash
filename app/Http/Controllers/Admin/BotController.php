<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Bots;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class BotController extends Controller
{
    public function index(): Response
    {
        $busy = Bots::busyBotIds();

        return Inertia::render('admin/bots', [
            'enabled' => Bots::enabled(),
            'bots' => User::query()->bots()->orderBy('bot_key')->get()->map(fn (User $bot) => [
                'id' => $bot->id,
                'key' => $bot->bot_key,
                'name' => $bot->name,
                'rating' => $bot->rating,
                'wins' => $bot->wins,
                'losses' => $bot->losses,
                'rank' => $bot->rankProgress(),
                'online' => Bots::isOnline($bot),
                'busy' => $busy->contains($bot->id),
                'paused' => $bot->bot_paused_at !== null,
                'scheduled' => Bots::scheduledOnline((string) $bot->bot_key),
                'lastSeen' => $bot->last_seen_at?->diffForHumans(),
            ]),
        ]);
    }

    /**
     * Pause a bot (it finishes what it's in, then stays offline) or let it play again.
     */
    public function update(Request $request, User $bot): RedirectResponse
    {
        $paused = (bool) $request->validate([
            'paused' => ['required', 'boolean'],
        ])['paused'];

        $bot->forceFill(['bot_paused_at' => $paused ? now() : null])->save();

        Inertia::flash('toast', ['type' => 'success', 'message' => $paused
            ? __(':name is paused.', ['name' => $bot->name])
            : __(':name is back.', ['name' => $bot->name])]);

        return back();
    }
}
