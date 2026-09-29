<?php

use App\Models\PracticeRun;
use App\Models\User;
use Carbon\CarbonImmutable;
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

test('practice leaderboards rank personal bests in each mode\'s direction', function () {
    $fast = User::factory()->create(['best_sprint_ms' => 40000, 'best_ultra_score' => 10000]);
    $slow = User::factory()->create(['best_sprint_ms' => 80000, 'best_ultra_score' => 90000]);
    User::factory()->create();

    $this->actingAs($slow)
        ->get(route('practice'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->has('leaderboards.sprint.allTime.entries', 2)
            ->where('leaderboards.sprint.allTime.entries.0.id', $fast->id)
            ->where('leaderboards.sprint.allTime.entries.0.value', 40000)
            ->where('leaderboards.sprint.allTime.you', ['position' => 2, 'value' => 80000])
            ->where('leaderboards.ultra.allTime.entries.0.id', $slow->id)
            ->where('leaderboards.ultra.allTime.you.position', 1)
            ->has('leaderboards.dig.allTime.entries', 0)
            ->where('leaderboards.dig.allTime.you', null));
});

test('practice leaderboards show the top ten and the viewer\'s position beyond it', function () {
    User::factory()->count(12)->sequence(fn ($sequence) => ['best_zen_score' => 100000 - $sequence->index])->create();
    $viewer = User::factory()->create(['best_zen_score' => 5]);

    $this->actingAs($viewer)
        ->get(route('dashboard'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->has('practiceLeaderboards.zen.allTime.entries', 10)
            ->where('practiceLeaderboards.zen.allTime.entries.0.value', 100000)
            ->where('practiceLeaderboards.zen.allTime.you', ['position' => 13, 'value' => 5]));
});

test('tied players share a leaderboard position', function () {
    User::factory()->create(['best_ultra_score' => 5000]);
    User::factory()->count(2)->create(['best_ultra_score' => 3000]);
    $viewer = User::factory()->create(['best_ultra_score' => 1000]);

    $this->actingAs($viewer)
        ->get(route('practice'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->where('leaderboards.ultra.allTime.entries.0.position', 1)
            ->where('leaderboards.ultra.allTime.entries.1.position', 2)
            ->where('leaderboards.ultra.allTime.entries.2.position', 2)
            ->where('leaderboards.ultra.allTime.entries.3.position', 4));
});

test('every counted practice run is logged, not just new records', function () {
    $user = User::factory()->create(['best_sprint_ms' => 50000]);

    $this->actingAs($user)->postJson(route('practice.records'), ['mode' => 'sprint', 'value' => 70000])->assertNoContent();

    expect($user->practiceRuns()->where('mode', 'sprint')->pluck('value')->all())->toBe([70000])
        ->and($user->fresh()->best_sprint_ms)->toBe(50000);
});

test('weekly boards rank each player\'s best run since monday', function () {
    $this->travelTo(CarbonImmutable::parse('2026-09-30 12:00', 'UTC')); // a Wednesday

    [$alice, $bob, $viewer] = User::factory()->count(3)->create();
    PracticeRun::factory()->for($alice)->create(['mode' => 'sprint', 'value' => 60000]);
    PracticeRun::factory()->for($alice)->create(['mode' => 'sprint', 'value' => 45000]);
    PracticeRun::factory()->for($bob)->create(['mode' => 'sprint', 'value' => 50000]);
    // Last week's faster run doesn't count.
    PracticeRun::factory()->for($viewer)->create(['mode' => 'sprint', 'value' => 20000, 'created_at' => '2026-09-27 23:59']);
    PracticeRun::factory()->for($viewer)->create(['mode' => 'sprint', 'value' => 55000]);

    $this->actingAs($viewer)
        ->get(route('practice'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->has('leaderboards.sprint.weekly.entries', 3)
            ->where('leaderboards.sprint.weekly.entries.0.id', $alice->id)
            ->where('leaderboards.sprint.weekly.entries.0.value', 45000)
            ->where('leaderboards.sprint.weekly.entries.1.id', $bob->id)
            ->where('leaderboards.sprint.weekly.you', ['position' => 3, 'value' => 55000])
            ->has('leaderboards.ultra.weekly.entries', 0));

    // Next Monday the board starts over.
    $this->travelTo(CarbonImmutable::parse('2026-10-05 00:00', 'UTC'));

    $this->actingAs($viewer)
        ->get(route('practice'))
        ->assertInertia(fn (AssertableInertia $page) => $page
            ->has('leaderboards.sprint.weekly.entries', 0)
            ->where('leaderboards.sprint.weekly.you', null));
});
