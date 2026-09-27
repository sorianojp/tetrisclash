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

];
