<?php

use App\Models\User;
use App\Support\Ranks;
use Inertia\Testing\AssertableInertia as Assert;

test('guests can read the about page', function () {
    $this->get(route('about'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('about')
            ->where('rules.kosToWin', 3)
            ->where('xp.win', Ranks::XP_WIN)
            ->where('ranks.0.title', 'Pebble')
            ->where('ranks.0.group', 'Blocks'));
});

test('signed in players can read the about page', function () {
    $this->actingAs(User::factory()->create())->get(route('about'))->assertOk();
});
