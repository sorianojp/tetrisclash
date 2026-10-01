<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Duel;
use App\Models\PracticeRun;
use App\Models\Tournament;
use App\Models\User;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    /**
     * The game at a glance: players, activity today, and the latest sign-ups.
     */
    public function __invoke(): Response
    {
        $humans = fn () => User::query()->whereNull('bot_key');

        return Inertia::render('admin/dashboard', [
            'stats' => [
                'players' => $humans()->count(),
                'newToday' => $humans()->where('created_at', '>=', today())->count(),
                'newThisWeek' => $humans()->where('created_at', '>=', today()->subDays(6))->count(),
                'onlinePlayers' => User::query()->online()->whereNull('bot_key')->count(),
                'onlineBots' => User::query()->online()->bots()->count(),
                'banned' => User::query()->whereNotNull('banned_at')->count(),
                'duelsToday' => Duel::query()->where('created_at', '>=', today())->count(),
                'liveDuels' => Duel::query()->whereNull('finished_at')->count(),
                'openTournaments' => Tournament::query()->where('status', Tournament::STATUS_OPEN)->count(),
                'runningTournaments' => Tournament::query()->where('status', Tournament::STATUS_RUNNING)->count(),
                'practiceRunsToday' => PracticeRun::query()->where('created_at', '>=', today())->count(),
            ],
            'recentSignups' => $humans()
                ->latest('id')
                ->limit(8)
                ->get(['id', 'name', 'email', 'email_verified_at', 'banned_at', 'created_at'])
                ->map(fn (User $user) => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'verified' => $user->email_verified_at !== null,
                    'banned' => $user->isBanned(),
                    'joined' => $user->created_at?->diffForHumans(),
                ]),
        ]);
    }
}
