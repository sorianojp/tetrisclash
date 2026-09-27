<?php

use App\Models\User;
use Inertia\Testing\AssertableInertia;

test('guests are redirected to the login page', function () {
    $response = $this->get(route('dashboard'));
    $response->assertRedirect(route('login'));
});

test('authenticated users can visit the dashboard', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $response = $this->get(route('dashboard'));
    $response->assertOk();
});

test('the lobby shows the player stats', function () {
    $user = User::factory()->create(['rating' => 1100, 'wins' => 3]);

    $this->actingAs($user)
        ->get(route('dashboard'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('lobby')
            ->where('stats.rating', 1100)
            ->where('stats.wins', 3)
            ->where('stats.rank.rank', 1)
            ->where('stats.rank.title', 'Pebble'));
});

test('sprint records only improve', function () {
    $user = User::factory()->create(['best_sprint_ms' => 60000]);

    $this->actingAs($user)->postJson(route('practice.records'), ['mode' => 'sprint', 'value' => 70000])->assertNoContent();
    expect($user->fresh()->best_sprint_ms)->toBe(60000);

    $this->actingAs($user)->postJson(route('practice.records'), ['mode' => 'sprint', 'value' => 55000])->assertNoContent();
    expect($user->fresh()->best_sprint_ms)->toBe(55000);
});

test('ultra and survival records keep the highest value', function () {
    $user = User::factory()->create(['best_ultra_score' => 20000, 'best_survival_ms' => 90000]);

    $this->actingAs($user)->postJson(route('practice.records'), ['mode' => 'ultra', 'value' => 15000])->assertNoContent();
    $this->actingAs($user)->postJson(route('practice.records'), ['mode' => 'survival', 'value' => 120000])->assertNoContent();

    $user->refresh();
    expect($user->best_ultra_score)->toBe(20000)
        ->and($user->best_survival_ms)->toBe(120000);
});

test('zen records keep the highest score', function () {
    $user = User::factory()->create(['best_zen_score' => 50000]);

    $this->actingAs($user)->postJson(route('practice.records'), ['mode' => 'zen', 'value' => 30000])->assertNoContent();
    expect($user->fresh()->best_zen_score)->toBe(50000);

    $this->actingAs($user)->postJson(route('practice.records'), ['mode' => 'zen', 'value' => 1250000])->assertNoContent();
    expect($user->fresh()->best_zen_score)->toBe(1250000);
});

test('the first dig time is saved', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->postJson(route('practice.records'), ['mode' => 'dig', 'value' => 42000])->assertNoContent();

    expect($user->fresh()->best_dig_ms)->toBe(42000);
});

test('records reject unknown modes and out-of-range values', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->postJson(route('practice.records'), ['mode' => 'marathon', 'value' => 5000])->assertJsonValidationErrors('mode');
    $this->actingAs($user)->postJson(route('practice.records'), ['mode' => 'sprint', 'value' => 10])->assertJsonValidationErrors('value');
});

test('the practice page lists every record', function () {
    $user = User::factory()->create(['best_sprint_ms' => 60000, 'best_ultra_score' => 12345]);

    $this->actingAs($user)
        ->get(route('practice'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->component('practice')
            ->where('records.sprint', 60000)
            ->where('records.ultra', 12345)
            ->where('records.dig', null)
            ->where('records.survival', null));
});

test('practice records faster than humanly possible are rejected', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->postJson(route('practice.records'), ['mode' => 'sprint', 'value' => 9000])
        ->assertJsonValidationErrors('value');

    expect($user->fresh()->best_sprint_ms)->toBeNull();
});

test('the lobby includes practice records', function () {
    $user = User::factory()->create(['best_dig_ms' => 30000]);

    $this->actingAs($user)
        ->get(route('dashboard'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('records.dig', 30000)
            ->where('records.sprint', null));
});
