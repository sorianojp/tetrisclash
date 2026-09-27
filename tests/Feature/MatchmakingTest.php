<?php

use App\Events\DuelFound;
use App\Models\Duel;
use App\Models\User;
use Illuminate\Support\Facades\Event;

beforeEach(fn () => Event::fake([DuelFound::class]));

test('a lone player is queued', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->postJson(route('matchmaking.join'))
        ->assertOk()
        ->assertJson(['queued' => true]);

    expect($user->fresh()->queued_at)->not->toBeNull();
    Event::assertNotDispatched(DuelFound::class);
});

test('two queued players are matched into a duel', function () {
    $first = User::factory()->create(['queued_at' => now()]);
    $second = User::factory()->create();

    $response = $this->actingAs($second)->postJson(route('matchmaking.join'))->assertOk();

    $duel = Duel::firstOrFail();
    $response->assertJson(['duelId' => $duel->id]);

    expect($duel->player_one_id)->toBe($first->id)
        ->and($duel->player_two_id)->toBe($second->id)
        ->and($first->fresh()->queued_at)->toBeNull()
        ->and($second->fresh()->queued_at)->toBeNull();

    Event::assertDispatched(DuelFound::class, fn (DuelFound $event) => $event->duel->is($duel));
});

test('stale queue entries are not matched', function () {
    User::factory()->create(['queued_at' => now()->subMinute()]);
    $user = User::factory()->create();

    $this->actingAs($user)->postJson(route('matchmaking.join'))->assertJson(['queued' => true]);

    expect(Duel::count())->toBe(0);
});

test('players in an unfinished duel are sent back to it', function () {
    $duel = Duel::factory()->create();
    User::factory()->create(['queued_at' => now()]);

    $this->actingAs($duel->playerOne)
        ->postJson(route('matchmaking.join'))
        ->assertJson(['duelId' => $duel->id]);

    expect(Duel::count())->toBe(1);
});

test('players can leave the queue', function () {
    $user = User::factory()->create(['queued_at' => now()]);

    $this->actingAs($user)->deleteJson(route('matchmaking.leave'))->assertNoContent();

    expect($user->fresh()->queued_at)->toBeNull();
});
