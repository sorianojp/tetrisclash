<?php

use App\Models\Duel;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

test('anyone signed in can view a player profile', function () {
    $player = User::factory()->create(['rating' => 1120, 'wins' => 4, 'losses' => 1, 'best_sprint_ms' => 61000]);
    $duel = Duel::factory()->create([
        'player_one_id' => $player->id,
        'winner_id' => $player->id,
        'finish_reason' => 'knockout',
        'finished_at' => now(),
    ]);

    $this->actingAs(User::factory()->create())
        ->get(route('players.show', $player))
        ->assertInertia(fn (Assert $page) => $page
            ->component('player')
            ->where('player.name', $player->name)
            ->where('player.rating', 1120)
            ->where('player.rank.title', 'Pebble')
            ->where('records.sprint', 61000)
            ->where('recentDuels.0.id', $duel->id)
            ->where('recentDuels.0.result', 'win')
            ->where('recentDuels.0.mode', 'battle')
            ->missing('player.email'));
});

test('guests cannot view profiles', function () {
    $this->get(route('players.show', User::factory()->create()))->assertRedirect(route('login'));
});

test('profiles show all-time leaderboard placements', function () {
    User::factory()->create(['best_sprint_ms' => 30000]);
    $player = User::factory()->create(['best_sprint_ms' => 45000]);

    $this->actingAs(User::factory()->create())
        ->get(route('players.show', $player))
        ->assertInertia(fn (Assert $page) => $page
            ->where('placements.sprint', 2)
            ->where('placements.ultra', null));
});
