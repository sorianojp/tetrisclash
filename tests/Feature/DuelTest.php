<?php

use App\Events\DuelUpdated;
use App\Models\Duel;
use App\Models\User;
use Illuminate\Support\Facades\Event;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(fn () => Event::fake([DuelUpdated::class]));

test('players can open their duel', function () {
    $duel = Duel::factory()->create();

    $this->actingAs($duel->playerOne)
        ->get(route('duels.show', $duel))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('duel')
            ->where('me.id', $duel->player_one_id)
            ->where('opponent.id', $duel->player_two_id)
            ->where('seed', $duel->seed));
});

test('other users cannot open or act on a duel', function () {
    $duel = Duel::factory()->create();
    $stranger = User::factory()->create();

    $this->actingAs($stranger)->get(route('duels.show', $duel))->assertForbidden();
    $this->actingAs($stranger)->postJson(route('duels.ko', $duel))->assertForbidden();
    $this->actingAs($stranger)->postJson(route('duels.forfeit', $duel))->assertForbidden();
});

test('topping out gives the opponent a KO', function () {
    $duel = Duel::factory()->create();

    $this->actingAs($duel->playerOne)
        ->postJson(route('duels.ko', $duel), ['lines_sent' => 7])
        ->assertOk()
        ->assertJsonPath("kos.{$duel->player_two_id}", 1)
        ->assertJsonPath('finished', false);

    expect($duel->fresh()->player_one_lines_sent)->toBe(7);
    Event::assertDispatched(DuelUpdated::class);
});

test('three KOs win the duel and move ratings', function () {
    $duel = Duel::factory()->create(['player_two_kos' => 2]);

    $this->actingAs($duel->playerOne)
        ->postJson(route('duels.ko', $duel))
        ->assertJsonPath('finished', true)
        ->assertJsonPath('winnerId', $duel->player_two_id)
        ->assertJsonPath('finishReason', 'knockout')
        ->assertJsonPath('ratingChange', 16);

    expect($duel->playerTwo->fresh())
        ->rating->toBe(1016)
        ->wins->toBe(1)
        ->and($duel->playerOne->fresh())
        ->rating->toBe(984)
        ->losses->toBe(1);
});

test('a finished duel ignores further KOs', function () {
    $duel = Duel::factory()->create(['player_two_kos' => 2]);

    $this->actingAs($duel->playerOne)->postJson(route('duels.ko', $duel));
    $this->actingAs($duel->playerOne)->postJson(route('duels.ko', $duel));

    expect($duel->fresh()->player_two_kos)->toBe(3)
        ->and($duel->playerTwo->fresh()->wins)->toBe(1);
});

test('when time runs out the player with more KOs wins', function () {
    $duel = Duel::factory()->expired()->create(['player_one_kos' => 1]);

    $this->actingAs($duel->playerTwo)->postJson(route('duels.heartbeat', $duel), ['lines_sent' => 30]);
    $this->actingAs($duel->playerOne)
        ->postJson(route('duels.heartbeat', $duel), ['lines_sent' => 5])
        ->assertJsonPath('finished', true)
        ->assertJsonPath('winnerId', $duel->player_one_id)
        ->assertJsonPath('finishReason', 'time');
});

test('when time runs out with equal KOs, lines sent breaks the tie', function () {
    $duel = Duel::factory()->expired()->create();

    $this->actingAs($duel->playerOne)
        ->postJson(route('duels.heartbeat', $duel), ['lines_sent' => 12])
        ->assertJsonPath('finished', false);

    $this->actingAs($duel->playerTwo)
        ->postJson(route('duels.heartbeat', $duel), ['lines_sent' => 20])
        ->assertJsonPath('finished', true)
        ->assertJsonPath('winnerId', $duel->player_two_id);
});

test('a player whose opponent stopped responding wins by disconnect', function () {
    $duel = Duel::factory()->create([
        'player_two_seen_at' => now()->subSeconds(Duel::DISCONNECT_SECONDS + 5),
    ]);

    $this->actingAs($duel->playerOne)
        ->postJson(route('duels.heartbeat', $duel))
        ->assertJsonPath('winnerId', $duel->player_one_id)
        ->assertJsonPath('finishReason', 'disconnect');
});

test('forfeiting hands the win to the opponent', function () {
    $duel = Duel::factory()->create();

    $this->actingAs($duel->playerTwo)
        ->postJson(route('duels.forfeit', $duel))
        ->assertJsonPath('winnerId', $duel->player_one_id)
        ->assertJsonPath('finishReason', 'forfeit');
});

test('settling a duel awards xp to both players', function () {
    $duel = Duel::factory()->create(['player_one_kos' => 1, 'player_two_kos' => 2]);

    $this->actingAs($duel->playerOne)
        ->postJson(route('duels.ko', $duel))
        ->assertJsonPath("xp.{$duel->player_two_id}", 130)
        ->assertJsonPath("xp.{$duel->player_one_id}", 50);

    expect($duel->playerTwo->fresh()->xp)->toBe(130)
        ->and($duel->playerOne->fresh()->xp)->toBe(50);
});

test('forfeiting earns no xp', function () {
    $duel = Duel::factory()->create(['player_one_kos' => 1]);

    $this->actingAs($duel->playerOne)->postJson(route('duels.forfeit', $duel));

    expect($duel->playerOne->fresh()->xp)->toBe(0)
        ->and($duel->playerTwo->fresh()->xp)->toBe(100);
});

test('the duel page shows both players ranks', function () {
    $duel = Duel::factory()->create();
    $duel->playerTwo->forceFill(['xp' => 5000])->save();

    $this->actingAs($duel->playerOne)
        ->get(route('duels.show', $duel))
        ->assertInertia(fn (Assert $page) => $page
            ->where('me.rank.rank', 1)
            ->where('me.rank.title', 'Pebble')
            ->where('opponent.rank.title', 'Combo Crafter'));
});
