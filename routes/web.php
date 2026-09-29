<?php

use App\Http\Controllers\AboutController;
use App\Http\Controllers\AchievementController;
use App\Http\Controllers\ChallengeController;
use App\Http\Controllers\DuelController;
use App\Http\Controllers\InviteController;
use App\Http\Controllers\LobbyController;
use App\Http\Controllers\MatchmakingController;
use App\Http\Controllers\OnlinePlayersController;
use App\Http\Controllers\PlayerController;
use App\Http\Controllers\ReplayController;
use App\Http\Controllers\TournamentController;
use Illuminate\Support\Facades\Route;

Route::inertia('/', 'welcome')->name('home');
Route::get('about', AboutController::class)->name('about');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('dashboard', [LobbyController::class, 'index'])->name('dashboard');
    Route::get('practice', [LobbyController::class, 'practice'])->name('practice');
    Route::post('practice/records', [LobbyController::class, 'storeRecord'])->middleware('throttle:30,1')->name('practice.records');

    Route::post('matchmaking', [MatchmakingController::class, 'store'])->name('matchmaking.join');
    Route::delete('matchmaking', [MatchmakingController::class, 'destroy'])->name('matchmaking.leave');

    Route::get('duels/{duel}', [DuelController::class, 'show'])->name('duels.show');
    Route::post('duels/{duel}/ko', [DuelController::class, 'knockOut'])->name('duels.ko');
    Route::post('duels/{duel}/heartbeat', [DuelController::class, 'heartbeat'])->name('duels.heartbeat');
    Route::post('duels/{duel}/forfeit', [DuelController::class, 'forfeit'])->name('duels.forfeit');
    Route::get('duels/{duel}/watch', [DuelController::class, 'watch'])->name('duels.watch');
    Route::get('duels/{duel}/replay', [ReplayController::class, 'showDuel'])->name('duels.replay');
    Route::post('duels/{duel}/replay', [ReplayController::class, 'storeDuel'])->middleware('throttle:10,1')->name('duels.replay.store');
    Route::get('practice/runs/{run}/replay', [ReplayController::class, 'showRun'])->name('practice.replay');

    Route::post('challenges', [ChallengeController::class, 'store'])->middleware('throttle:20,1')->name('challenges.store');
    Route::get('challenges/{challenge}', [ChallengeController::class, 'show'])->name('challenges.show');
    Route::post('challenges/{challenge}/accept', [ChallengeController::class, 'accept'])->name('challenges.accept');
    Route::post('challenges/{challenge}/decline', [ChallengeController::class, 'decline'])->name('challenges.decline');
    Route::delete('challenges/{challenge}', [ChallengeController::class, 'destroy'])->name('challenges.destroy');

    Route::get('online', [OnlinePlayersController::class, 'index'])->name('online.index');
    Route::post('online/ping', [OnlinePlayersController::class, 'ping'])->middleware('throttle:30,1')->name('online.ping');

    Route::post('players/{player}/invite', [InviteController::class, 'store'])->middleware('throttle:20,1')->name('players.invite');
    Route::patch('invites/preference', [InviteController::class, 'preference'])->name('invites.preference');

    Route::get('players/{player}', [PlayerController::class, 'show'])->name('players.show');

    Route::get('tournaments', [TournamentController::class, 'index'])->name('tournaments.index');
    Route::post('tournaments', [TournamentController::class, 'store'])->middleware('throttle:10,1')->name('tournaments.store');
    Route::get('tournaments/{tournament}', [TournamentController::class, 'show'])->name('tournaments.show');
    Route::post('tournaments/{tournament}/join', [TournamentController::class, 'join'])->name('tournaments.join');
    Route::delete('tournaments/{tournament}/join', [TournamentController::class, 'leave'])->name('tournaments.leave');

    Route::post('achievements', [AchievementController::class, 'store'])->middleware('throttle:30,1')->name('achievements.store');
});

require __DIR__.'/settings.php';
