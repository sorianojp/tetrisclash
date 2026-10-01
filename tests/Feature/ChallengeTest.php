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

test('guests can open a challenge link, and come back to it after signing in', function () {
    $challenge = Challenge::factory()->create(['mode' => 'race']);
    $name = $challenge->challenger->name;

    $this->get(route('challenges.show', $challenge))
        ->assertOk()
        ->assertSee('<meta property="og:title" content="'.e("{$name} challenges you to a 1v1 race!").'">', false)
        ->assertInertia(fn (Assert $page) => $page
            ->component('challenge')
            ->where('challenger.id', $challenge->challenger_id)
            ->where('isChallenger', false));

    $friend = User::factory()->create();

    $this->post(route('login.store'), ['email' => $friend->email, 'password' => 'password'])
        ->assertRedirect(route('challenges.show', $challenge));
});

test('guests have to sign in to accept a challenge', function () {
    $challenge = Challenge::factory()->create();

    $this->post(route('challenges.accept', $challenge))->assertRedirect(route('login'));

    expect(Duel::count())->toBe(0);
});

test('invites stay private from guests', function () {
    $challenge = Challenge::open(User::factory()->create(), 'battle', User::factory()->create());

    $this->get(route('challenges.show', $challenge))->assertRedirect(route('login'));
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
