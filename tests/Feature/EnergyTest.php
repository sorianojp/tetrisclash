<?php

use App\Events\DuelFound;
use App\Models\Challenge;
use App\Models\Duel;
use App\Models\User;
use App\Support\Energy;
use Illuminate\Support\Facades\Event;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    Event::fake([DuelFound::class]);
    config(['game.energy.max' => 5, 'game.energy.regen_minutes' => 20]);
});

function queued(array $attributes = []): User
{
    return User::factory()->create(['queued_at' => now(), 'searching_since' => now(), ...$attributes]);
}

test('players start with full energy', function () {
    $user = User::factory()->create();

    expect($user->currentEnergy())->toBe(5)
        ->and($user->energyStatus())->toMatchArray(['current' => 5, 'max' => 5, 'nextAt' => null]);
});

test('a ranked match costs both players one energy', function () {
    $waiting = queued();
    $me = User::factory()->create();

    $this->actingAs($me)->postJson(route('matchmaking.join'))->assertJsonStructure(['duelId']);

    expect($me->fresh()->currentEnergy())->toBe(4)
        ->and($waiting->fresh()->currentEnergy())->toBe(4);
});

test('players without energy cannot join the ranked queue', function () {
    $me = User::factory()->create(['energy' => 0, 'energy_updated_at' => now()]);

    $this->actingAs($me)->postJson(route('matchmaking.join'))
        ->assertJson(['outOfEnergy' => true, 'energy' => ['current' => 0]]);

    expect($me->fresh()->queued_at)->toBeNull();
});

test('queued players who ran out of energy are not matched', function () {
    queued(['energy' => 0, 'energy_updated_at' => now()]);
    $me = User::factory()->create();

    $this->actingAs($me)->postJson(route('matchmaking.join'))->assertJson(['queued' => true]);

    expect(Duel::count())->toBe(0);
});

test('energy refills one point per interval, up to the maximum', function () {
    $this->freezeSecond();
    $user = User::factory()->create(['energy' => 1, 'energy_updated_at' => now()]);

    $this->travel(19)->minutes();
    expect($user->currentEnergy())->toBe(1);

    $this->travel(1)->minutes();
    expect($user->currentEnergy())->toBe(2);

    $this->travel(10)->hours();
    expect($user->currentEnergy())->toBe(5)
        ->and($user->energyStatus()['nextAt'])->toBeNull();
});

test('spending keeps the progress toward the next point', function () {
    $this->freezeSecond();
    $user = User::factory()->create(['energy' => 3, 'energy_updated_at' => now()]);

    $this->travel(15)->minutes();
    $user->spendEnergy();

    // 2 left, and the next point still arrives 20 minutes after the original clock started.
    expect($user->currentEnergy())->toBe(2)
        ->and($user->energyStatus()['nextAt'])->toBe(now()->addMinutes(5)->getTimestampMs());
});

test('spending from full starts the refill clock', function () {
    $this->freezeSecond();
    $user = User::factory()->create();

    $user->spendEnergy();

    expect($user->energyStatus())->toMatchArray([
        'current' => 4,
        'nextAt' => now()->addSeconds(Energy::intervalSeconds())->getTimestampMs(),
    ]);
});

test('friendly matches are free', function () {
    $challenge = Challenge::factory()->create();
    $friend = User::factory()->create(['energy' => 0, 'energy_updated_at' => now()]);

    $this->actingAs($friend)->post(route('challenges.accept', $challenge));

    expect(Duel::firstOrFail()->ranked)->toBeFalse()
        ->and($friend->fresh()->currentEnergy())->toBe(0)
        ->and($challenge->challenger->fresh()->currentEnergy())->toBe(5);
});

test('the lobby shows the player energy', function () {
    $this->actingAs(User::factory()->create(['energy' => 2, 'energy_updated_at' => now()]))
        ->get(route('dashboard'))
        ->assertInertia(fn (Assert $page) => $page
            ->where('energy.current', 2)
            ->where('energy.max', 5)
            ->has('serverNow'));
});
