<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Energy
    |--------------------------------------------------------------------------
    |
    | Each ranked match costs one energy point; points refill one at a time on
    | a timer, up to the maximum. Friendly matches and practice are free.
    | Run `php artisan config:cache` after changing these in production.
    |
    */

    'energy' => [
        'max' => (int) env('ENERGY_MAX', 5),
        'regen_minutes' => (int) env('ENERGY_REGEN_MINUTES', 20),
    ],

    /*
    |--------------------------------------------------------------------------
    | Bots
    |--------------------------------------------------------------------------
    |
    | Computer players that fill in while the player base is small. They look
    | and play like people: they come online on their own schedules, take
    | ranked matches when the queue has no human for a while, answer invites
    | and fill tournament seats. The bot runner (npm run bots) plays their
    | games; it authenticates to the app with BOT_RUNNER_TOKEN. Turn bots off
    | with BOTS_ENABLED=false.
    |
    */

    'bots' => [
        'enabled' => (bool) env('BOTS_ENABLED', false),
        'runner_token' => env('BOT_RUNNER_TOKEN'),
        // Queue wait before a searching player is matched with a bot.
        'match_after_seconds' => (int) env('BOTS_MATCH_AFTER_SECONDS', 20),
        // Bots never climb above this rating, so real players can always top the ladder.
        'max_rating' => (int) env('BOTS_MAX_RATING', 1350),
        // How long an open tournament waits for people before bots take the empty seats.
        'tournament_fill_after_seconds' => (int) env('BOTS_TOURNAMENT_FILL_AFTER_SECONDS', 120),
        // Bots also play each other now and then: the chance each minute (percent) that a
        // new bot match starts, and how many can run at once.
        'pair_chance' => (int) env('BOTS_PAIR_CHANCE', 40),
        'max_bot_matches' => (int) env('BOTS_MAX_BOT_MATCHES', 2),
    ],

];
