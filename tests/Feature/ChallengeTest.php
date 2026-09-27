<?php

use App\Events\DuelFound;
use App\Models\Challenge;
use App\Models\Duel;
use App\Models\User;
use Illuminate\Support\Facades\Event;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(fn () => Event::fake([DuelFound::class]));

test('players can open a challenge link', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)->post(route('challenges.store'), ['mode' => 'race']);

    $challenge = Challenge::firstOrFail();
    $response->assertRedirect(route('challenges.show', $challenge));

    expect($challenge->challenger_id)->toBe($user->id)
        ->and($challenge->mode)->toBe('race');
});

test('opening a new challenge replaces the old one', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->post(route('challenges.store'), ['mode' => 'battle']);
    $this->actingAs($user)->post(route('challenges.store'), ['mode' => 'race']);

    expect(Challenge::count())->toBe(1)
        ->and(Challenge::first()->mode)->toBe('race');
});

test('challenges need a known mode', function () {
    $this->actingAs(User::factory()->create())
        ->post(route('challenges.store'), ['mode' => 'marathon'])
        ->assertSessionHasErrors('mode');
});

test('a friend sees the challenge', function () {
    $challenge = Challenge::factory()->create();

    $this->actingAs(User::factory()->create())
        ->get(route('challenges.show', $challenge))
        ->assertInertia(fn (Assert $page) => $page
            ->component('challenge')
            ->where('challenge.status', 'open')
            ->where('challenger.id', $challenge->challenger_id)
            ->where('isChallenger', false));
});

test('accepting starts an unranked duel for both players', function () {
    $challenge = Challenge::factory()->create(['mode' => 'race']);
    $friend = User::factory()->create();

    $response = $this->actingAs($friend)->post(route('challenges.accept', $challenge));

    $duel = Duel::firstOrFail();
    $response->assertRedirect(route('duels.show', $duel));

    expect($duel->player_one_id)->toBe($challenge->challenger_id)
        ->and($duel->player_two_id)->toBe($friend->id)
        ->and($duel->mode)->toBe('race')
        ->and($duel->ranked)->toBeFalse()
        ->and($challenge->fresh()->duel_id)->toBe($duel->id);

    Event::assertDispatched(DuelFound::class);
});

test('the challenger is sent into the duel once it is accepted', function () {
    $challenge = Challenge::factory()->create();
    $this->actingAs(User::factory()->create())->post(route('challenges.accept', $challenge));

    $this->actingAs($challenge->challenger)
        ->get(route('challenges.show', $challenge))
        ->assertRedirect(route('duels.show', Duel::firstOrFail()));
});

test('players cannot accept their own challenge', function () {
    $challenge = Challenge::factory()->create();

    $this->actingAs($challenge->challenger)
        ->post(route('challenges.accept', $challenge))
        ->assertForbidden();
});

test('expired or used challenges cannot be accepted', function () {
    $expired = Challenge::factory()->expired()->create();
    $used = Challenge::factory()->create(['duel_id' => Duel::factory()->create()->id]);

    $this->actingAs(User::factory()->create())
        ->post(route('challenges.accept', $expired))
        ->assertRedirect(route('challenges.show', $expired));
    $this->actingAs(User::factory()->create())->post(route('challenges.accept', $used));

    expect(Duel::count())->toBe(1);
});

test('players already in a duel cannot accept', function () {
    $busy = Duel::factory()->create()->playerOne;
    $challenge = Challenge::factory()->create();

    $this->actingAs($busy)->post(route('challenges.accept', $challenge));

    expect(Duel::count())->toBe(1);
});

test('only the challenger can cancel', function () {
    $challenge = Challenge::factory()->create();

    $this->actingAs(User::factory()->create())
        ->delete(route('challenges.destroy', $challenge))
        ->assertForbidden();
    $this->actingAs($challenge->challenger)
        ->delete(route('challenges.destroy', $challenge))
        ->assertRedirect(route('dashboard'));

    expect(Challenge::count())->toBe(0);
});
