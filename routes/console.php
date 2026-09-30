<?php

use App\Models\Duel;
use App\Models\Tournament;
use App\Models\User;
use App\Support\Bots;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('duels:sweep', function () {
    // Duels settle on their players' heartbeats; this settles the ones nobody is reporting on
    // (both players gone, or time up with no one left to say so), which also moves brackets on.
    Duel::query()
        ->whereNull('finished_at')
        ->where('starts_at', '<=', now())
        ->get()
        ->each(fn (Duel $duel) => $duel->sweep());

    // Bracket matches wait while a player is busy in another duel.
    Tournament::query()
        ->where('status', Tournament::STATUS_RUNNING)
        ->get()
        ->each(fn (Tournament $tournament) => $tournament->startReadyMatches());
})->purpose('Settle abandoned or timed-out duels and start waiting tournament matches');

Schedule::command('duels:sweep')->everyMinute();

Artisan::command('bots:install', function () {
    $created = Bots::install();
    $this->info("Bots ready ({$created} new).");
})->purpose('Create the bot accounts (safe to run again)');

Artisan::command('bots:tick', function () {
    if (! Bots::enabled()) {
        return;
    }

    Bots::refreshPresence();
    Bots::pairUp();
    Bots::fillTournaments();
})->purpose('Keep bots online on their schedules, pair them up now and then, and fill waiting tournaments');

Schedule::command('bots:tick')->everyMinute();

Artisan::command('user:make-admin {email} {--revoke : Take admin away instead}', function (string $email) {
    $user = User::query()->where('email', $email)->first();

    if ($user === null) {
        $this->error("No user with the email {$email}.");

        return 1;
    }

    $user->forceFill(['is_admin' => ! $this->option('revoke')])->save();
    $this->info($user->is_admin ? "{$user->name} is now an admin." : "{$user->name} is no longer an admin.");

    return 0;
})->purpose('Grant (or with --revoke, remove) admin access; it can only be changed here, never from the app');
