<?php

use App\Http\Controllers\AboutController;
use App\Http\Controllers\AchievementController;
use App\Http\Controllers\Admin\BotController as AdminBotController;
use App\Http\Controllers\Admin\DashboardController as AdminDashboardController;
use App\Http\Controllers\Admin\DuelController as AdminDuelController;
use App\Http\Controllers\Admin\PracticeController as AdminPracticeController;
use App\Http\Controllers\Admin\TournamentController as AdminTournamentController;
use App\Http\Controllers\Admin\UserController as AdminUserController;
use App\Http\Controllers\ChallengeController;
use App\Http\Controllers\DuelController;
use App\Http\Controllers\Internal\BotRunnerController;
use App\Http\Controllers\InviteController;
use App\Http\Controllers\LobbyController;
use App\Http\Controllers\MatchmakingController;
use App\Http\Controllers\OnlinePlayersController;
use App\Http\Controllers\PlayerController;
use App\Http\Controllers\ReplayController;
use App\Http\Controllers\SitemapController;
use App\Http\Controllers\TournamentController;
use App\Http\Middleware\AuthenticateBotRunner;
use App\Models\User;
use Illuminate\Support\Facades\Route;

Route::inertia('/', 'welcome')->name('home');
Route::get('about', AboutController::class)->name('about');
Route::get('sitemap.xml', SitemapController::class)->name('sitemap');

// Open to guests, so shared links work for anyone (and show a proper preview): people can try
// practice before signing up, see who challenged them, and watch a replay.
Route::get('practice', [LobbyController::class, 'practice'])->name('practice');
Route::get('challenges/{challenge}', [ChallengeController::class, 'show'])->name('challenges.show');
Route::get('duels/{duel}/replay', [ReplayController::class, 'showDuel'])->name('duels.replay');
Route::get('practice/runs/{run}/replay', [ReplayController::class, 'showRun'])->name('practice.replay');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('dashboard', [LobbyController::class, 'index'])->name('dashboard');
    Route::post('practice/records', [LobbyController::class, 'storeRecord'])->middleware('throttle:30,1')->name('practice.records');

    Route::post('matchmaking', [MatchmakingController::class, 'store'])->name('matchmaking.join');
    Route::delete('matchmaking', [MatchmakingController::class, 'destroy'])->name('matchmaking.leave');

    Route::get('duels/{duel}', [DuelController::class, 'show'])->name('duels.show');
    Route::post('duels/{duel}/ko', [DuelController::class, 'knockOut'])->name('duels.ko');
    Route::post('duels/{duel}/heartbeat', [DuelController::class, 'heartbeat'])->name('duels.heartbeat');
    Route::post('duels/{duel}/forfeit', [DuelController::class, 'forfeit'])->name('duels.forfeit');
    Route::get('duels/{duel}/watch', [DuelController::class, 'watch'])->name('duels.watch');
    Route::post('duels/{duel}/replay', [ReplayController::class, 'storeDuel'])->middleware('throttle:10,1')->name('duels.replay.store');

    Route::post('challenges', [ChallengeController::class, 'store'])->middleware('throttle:20,1')->name('challenges.store');
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

// Admin tools. Admin is granted from the console: php artisan user:make-admin {email}
Route::middleware(['auth', 'verified', 'admin'])->prefix('admin')->name('admin.')->group(function () {
    Route::get('/', AdminDashboardController::class)->name('dashboard');

    Route::get('users', [AdminUserController::class, 'index'])->name('users.index');
    Route::get('users/{user}', [AdminUserController::class, 'show'])->name('users.show');
    Route::post('users/{user}/ban', [AdminUserController::class, 'ban'])->name('users.ban');
    Route::delete('users/{user}/ban', [AdminUserController::class, 'unban'])->name('users.unban');
    Route::patch('users/{user}/stats', [AdminUserController::class, 'updateStats'])->name('users.stats');
    Route::patch('users/{user}/energy', [AdminUserController::class, 'updateEnergy'])->name('users.energy');
    Route::post('users/{user}/achievements', [AdminUserController::class, 'grantAchievement'])->name('users.achievements.store');
    Route::delete('users/{user}/achievements/{key}', [AdminUserController::class, 'revokeAchievement'])->name('users.achievements.destroy');
    Route::delete('users/{user}/records/{mode}', [AdminUserController::class, 'resetRecord'])->name('users.records.destroy');

    Route::get('practice', [AdminPracticeController::class, 'index'])->name('practice.index');
    Route::delete('practice/runs/{run}', [AdminPracticeController::class, 'destroy'])->name('practice.runs.destroy');

    Route::get('tournaments', [AdminTournamentController::class, 'index'])->name('tournaments.index');
    Route::delete('tournaments/{tournament}', [AdminTournamentController::class, 'destroy'])->name('tournaments.destroy');
    Route::delete('tournaments/{tournament}/players/{user}', [AdminTournamentController::class, 'removePlayer'])->name('tournaments.players.destroy');
    Route::post('tournaments/{tournament}/matches/{match}/advance', [AdminTournamentController::class, 'advance'])->name('tournaments.matches.advance');

    Route::get('duels', [AdminDuelController::class, 'index'])->name('duels.index');
    Route::post('duels/{duel}/cancel', [AdminDuelController::class, 'cancel'])->name('duels.cancel');

    Route::get('bots', [AdminBotController::class, 'index'])->name('bots.index');
    Route::patch('bots/{bot}', [AdminBotController::class, 'update'])->name('bots.update');
});

// The bot runner (bots/runner.ts) acts for bot accounts here, authenticated by its token.
Route::bind('bot', fn (string $id) => User::query()->bots()->findOrFail($id));

Route::prefix('internal/bots')->middleware(AuthenticateBotRunner::class)->name('internal.bots.')->group(function () {
    Route::get('work', [BotRunnerController::class, 'work'])->name('work');
    Route::post('{bot}/auth', [BotRunnerController::class, 'auth'])->name('auth');
    Route::post('{bot}/duels/{duel}/heartbeat', [BotRunnerController::class, 'heartbeat'])->name('heartbeat');
    Route::post('{bot}/duels/{duel}/ko', [BotRunnerController::class, 'knockOut'])->name('ko');
    Route::post('{bot}/duels/{duel}/replay', [BotRunnerController::class, 'replay'])->name('replay');
    Route::post('{bot}/seen', [BotRunnerController::class, 'seen'])->name('seen');
    Route::post('{bot}/practice', [BotRunnerController::class, 'practice'])->name('practice');
    Route::post('{bot}/achievements', [BotRunnerController::class, 'achievement'])->name('achievements');
    Route::post('{bot}/invites/{challenge}/accept', [BotRunnerController::class, 'acceptInvite'])->name('invites.accept');
    Route::post('{bot}/invites/{challenge}/decline', [BotRunnerController::class, 'declineInvite'])->name('invites.decline');
});

require __DIR__.'/settings.php';
