<?php

use App\Models\User;
use App\Support\Ranks;
use Inertia\Testing\AssertableInertia as Assert;

test('the themes page shows what the player has unlocked', function () {
    $user = User::factory()->create(['xp' => Ranks::xpToReach(10)]);

    $this->actingAs($user)
        ->get(route('themes.edit'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('settings/themes')
            ->where('pieces.0', ['id' => 'classic', 'name' => 'Classic', 'rank' => 1, 'unlocked' => true])
            ->where('pieces.1.unlocked', true)
            ->where('pieces.2.unlocked', false)
            ->where('boards.1.unlocked', true));
});

test('players can switch to an unlocked theme', function () {
    $user = User::factory()->create(['xp' => Ranks::xpToReach(10)]);

    $this->actingAs($user)
        ->patch(route('themes.update'), ['piece_theme' => 'pastel', 'board_skin' => 'ocean'])
        ->assertSessionHasNoErrors();

    expect($user->fresh())
        ->piece_theme->toBe('pastel')
        ->board_skin->toBe('ocean');
});

test('locked themes are rejected', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->patch(route('themes.update'), ['piece_theme' => 'cosmic'])
        ->assertSessionHasErrors('piece_theme');

    expect($user->fresh()->piece_theme)->toBe('classic');
});
