<?php

use App\Http\Controllers\DuelController;
use App\Http\Controllers\LobbyController;
use App\Http\Controllers\MatchmakingController;
use Illuminate\Support\Facades\Route;

Route::inertia('/', 'welcome')->name('home');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('dashboard', [LobbyController::class, 'index'])->name('dashboard');
    Route::get('practice', [LobbyController::class, 'practice'])->name('practice');
    Route::post('practice/records', [LobbyController::class, 'storeRecord'])->name('practice.records');

    Route::post('matchmaking', [MatchmakingController::class, 'store'])->name('matchmaking.join');
    Route::delete('matchmaking', [MatchmakingController::class, 'destroy'])->name('matchmaking.leave');

    Route::get('duels/{duel}', [DuelController::class, 'show'])->name('duels.show');
    Route::post('duels/{duel}/ko', [DuelController::class, 'knockOut'])->name('duels.ko');
    Route::post('duels/{duel}/heartbeat', [DuelController::class, 'heartbeat'])->name('duels.heartbeat');
    Route::post('duels/{duel}/forfeit', [DuelController::class, 'forfeit'])->name('duels.forfeit');
});

require __DIR__.'/settings.php';
