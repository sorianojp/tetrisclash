<?php

use App\Events\DuelFound;
use App\Events\InviteClosed;
use App\Events\InviteReceived;
use App\Models\Challenge;
use App\Models\Duel;
use App\Models\User;
use Illuminate\Support\Facades\Event;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(fn () => Event::fake([DuelFound::class, InviteReceived::class, InviteClosed::class]));

test('players can invite another player', function () {
    $this->freezeSecond();
    [$me, $friend] = User::factory()->count(2)->create();

    $response = $this->actingAs($me)->post(route('players.invite', $friend), ['mode' => 'race']);

    $challenge = Challenge::firstOrFail();
    $response->assertRedirect(route('challenges.show', $challenge));

    expect($challenge->invitee_id)->toBe($friend->id)
        ->and($challenge->mode)->toBe('race')
        ->and($challenge->expires_at->equalTo(now()->addSeconds(Challenge::INVITE_LIFETIME_SECONDS)))->toBeTrue();

    Event::assertDispatched(InviteReceived::class, fn (InviteReceived $event) => $event->challenge->is($challenge)
        && $event->broadcastWith()['challenger']['name'] === $me->name);
});

test('players who turned invites off cannot be invited', function () {
    $me = User::factory()->create();
    $busy = User::factory()->create(['accepts_invites' => false]);

    $this->actingAs($me)->post(route('players.invite', $busy), ['mode' => 'battle']);

    expect(Challenge::count())->toBe(0);
    Event::assertNotDispatched(InviteReceived::class);
});

test('players in a match cannot be invited', function () {
    [$me, $player, $opponent] = User::factory()->count(3)->create();
    Duel::start($player, $opponent);

    $this->actingAs($me)->post(route('players.invite', $player), ['mode' => 'battle']);

    expect(Challenge::count())->toBe(0);
    Event::assertNotDispatched(InviteReceived::class);
});

test('players cannot invite themselves', function () {
    $me = User::factory()->create();

    $this->actingAs($me)->post(route('players.invite', $me), ['mode' => 'battle'])->assertForbidden();
});

test('only the invited player can accept an invite', function () {
    [$me, $friend, $stranger] = User::factory()->count(3)->create();
    $challenge = Challenge::open($me, 'battle', $friend);

    $this->actingAs($stranger)->post(route('challenges.accept', $challenge))->assertForbidden();

    $this->actingAs($friend)->post(route('challenges.accept', $challenge))
        ->assertRedirect(route('duels.show', Duel::firstOrFail()));
});

test('invites are private to their two players', function () {
    [$me, $friend, $stranger] = User::factory()->count(3)->create();
    $challenge = Challenge::open($me, 'battle', $friend);

    $this->actingAs($stranger)->get(route('challenges.show', $challenge))->assertNotFound();

    $this->actingAs($me)->get(route('challenges.show', $challenge))
        ->assertInertia(fn (Assert $page) => $page
            ->where('invitee.name', $friend->name)
            ->where('isChallenger', true));
});

test('declining removes the invite and tells the challenger', function () {
    [$me, $friend] = User::factory()->count(2)->create();
    $challenge = Challenge::open($me, 'battle', $friend);

    $this->actingAs($friend)->post(route('challenges.decline', $challenge))->assertNoContent();

    expect(Challenge::count())->toBe(0);
    Event::assertDispatched(InviteClosed::class, fn (InviteClosed $event) => $event->recipientId === $me->id
        && $event->reason === InviteClosed::DECLINED);
});

test('only the invited player can decline', function () {
    [$me, $friend] = User::factory()->count(2)->create();
    $challenge = Challenge::open($me, 'battle', $friend);

    $this->actingAs($me)->post(route('challenges.decline', $challenge))->assertForbidden();

    expect(Challenge::count())->toBe(1);
});

test('cancelling or replacing an invite clears it for the invitee', function () {
    [$me, $friend, $other] = User::factory()->count(3)->create();
    $first = Challenge::open($me, 'battle', $friend);

    $second = Challenge::open($me, 'race', $other);
    $this->actingAs($me)->delete(route('challenges.destroy', $second));

    expect(Challenge::count())->toBe(0);
    Event::assertDispatched(InviteClosed::class, fn (InviteClosed $event) => $event->recipientId === $friend->id
        && $event->code === $first->code && $event->reason === InviteClosed::CANCELLED);
    Event::assertDispatched(InviteClosed::class, fn (InviteClosed $event) => $event->recipientId === $other->id
        && $event->code === $second->code);
});

test('players can turn invites off and back on', function () {
    $me = User::factory()->create();

    $this->actingAs($me)->patch(route('invites.preference'), ['accepts_invites' => false]);
    expect($me->fresh()->accepts_invites)->toBeFalse();

    $this->actingAs($me)->patch(route('invites.preference'), ['accepts_invites' => true]);
    expect($me->fresh()->accepts_invites)->toBeTrue();
});

test('the online list shows invite and match status', function () {
    [$me, $opponent] = User::factory()->count(2)->create();

    expect($me->onlineProfile())->toMatchArray(['id' => $me->id, 'acceptsInvites' => true, 'inMatch' => false]);

    Duel::start($me, $opponent);
    $me->forceFill(['accepts_invites' => false])->save();

    expect($me->onlineProfile())->toMatchArray(['acceptsInvites' => false, 'inMatch' => true]);
});
