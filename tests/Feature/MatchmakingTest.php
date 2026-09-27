<?php

use App\Events\DuelFound;
use App\Http\Controllers\MatchmakingController;
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

test('players far apart in rating are not matched straight away', function () {
    User::factory()->create(['queued_at' => now(), 'searching_since' => now(), 'rating' => 1400]);
    $user = User::factory()->create(['rating' => 1000]);

    $this->actingAs($user)
        ->postJson(route('matchmaking.join'))
        ->assertJson(['queued' => true, 'range' => MatchmakingController::RATING_RANGE_START]);

    expect(Duel::count())->toBe(0);
});

test('the rating range widens until anyone is accepted', function () {
    expect(MatchmakingController::ratingRange(0))->toBe(100)
        ->and(MatchmakingController::ratingRange(10))->toBe(350)
        ->and(MatchmakingController::ratingRange(MatchmakingController::ANY_OPPONENT_AFTER_SECONDS))->toBeNull();
});

test('a long wait lets far apart players meet', function () {
    $veteran = User::factory()->create([
        'queued_at' => now(),
        'searching_since' => now()->subSeconds(MatchmakingController::ANY_OPPONENT_AFTER_SECONDS + 1),
        'rating' => 1400,
    ]);
    $user = User::factory()->create(['rating' => 1000]);

    $this->actingAs($user)->postJson(route('matchmaking.join'))->assertJsonStructure(['duelId']);

    expect(Duel::firstOrFail()->player_one_id)->toBe($veteran->id);
});

test('the closest rating is preferred', function () {
    User::factory()->create(['queued_at' => now(), 'searching_since' => now()->subSeconds(5), 'rating' => 1090]);
    $close = User::factory()->create(['queued_at' => now(), 'searching_since' => now(), 'rating' => 1010]);
    $user = User::factory()->create(['rating' => 1000]);

    $this->actingAs($user)->postJson(route('matchmaking.join'));

    expect(Duel::firstOrFail()->player_one_id)->toBe($close->id);
});

test('a search keeps its start time across queue refreshes', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->postJson(route('matchmaking.join'));
    $startedAt = $user->fresh()->searching_since;

    $this->travel(8)->seconds();
    $this->actingAs($user->fresh())
        ->postJson(route('matchmaking.join'))
        ->assertJson(['range' => MatchmakingController::ratingRange(8)]);

    expect($user->fresh()->searching_since->equalTo($startedAt))->toBeTrue();
});
