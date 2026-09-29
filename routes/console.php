<?php

use App\Models\Duel;
use App\Models\Tournament;
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
