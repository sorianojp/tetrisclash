<?php

use App\Http\Controllers\OnlinePlayersController;
use App\Models\Duel;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(fn () => Cache::flush());

function onlineUser(array $attributes = []): User
{
    return User::factory()->create(['last_seen_at' => now(), ...$attributes]);
}

test('pinging marks the player online and returns the count', function () {
    $me = User::factory()->create();
    onlineUser();

    $this->actingAs($me)->postJson(route('online.ping'))->assertOk()->assertJson(['online' => 2]);

    expect($me->fresh()->last_seen_at)->not->toBeNull();
});

test('players drop off the list once they stop pinging', function () {
    $me = onlineUser();
    $recent = onlineUser(['name' => 'Recent']);
    onlineUser(['name' => 'Gone', 'last_seen_at' => now()->subSeconds(User::ONLINE_WINDOW_SECONDS + 1)]);
    onlineUser(['name' => 'Unverified', 'email_verified_at' => null]);

    $this->actingAs($me)->get(route('online.index'))
        ->assertInertia(fn (Assert $page) => $page
            ->component('online')
            ->has('players.data', 1)
            ->where('players.data.0.id', $recent->id)
            ->where('onlineCount', 2));
});

test('the list shows who is in a match or has invites off', function () {
    $me = onlineUser();
    $busy = onlineUser(['name' => 'Busy']);
    onlineUser(['name' => 'Quiet', 'accepts_invites' => false]);
    Duel::start($busy, User::factory()->create());

    $this->actingAs($me)->get(route('online.index'))
        ->assertInertia(fn (Assert $page) => $page
            ->where('players.data', fn ($players) => collect($players)->keyBy('name')->pipe(fn ($byName) => $byName['Busy']['inMatch'] === true
                && $byName['Quiet']['acceptsInvites'] === false
                && $byName['Quiet']['inMatch'] === false)));

    $this->actingAs($me)->get(route('online.index', ['available' => 1]))
        ->assertInertia(fn (Assert $page) => $page->has('players.data', 0));
});

test('players can search the list by name', function () {
    $me = onlineUser();
    onlineUser(['name' => 'Stacker Sam']);
    onlineUser(['name' => 'Tspin Tina']);

    $this->actingAs($me)->get(route('online.index', ['search' => 'tina']))
        ->assertInertia(fn (Assert $page) => $page
            ->has('players.data', 1)
            ->where('players.data.0.name', 'Tspin Tina')
            ->where('filters.search', 'tina'));
});

test('the list is paged, closest rating first', function () {
    $me = onlineUser(['rating' => 1500]);
    onlineUser(['name' => 'Far', 'rating' => 900]);
    onlineUser(['name' => 'Near', 'rating' => 1480]);
    User::factory()->count(OnlinePlayersController::PER_PAGE)->create(['last_seen_at' => now(), 'rating' => 500]);

    $this->actingAs($me)->get(route('online.index'))
        ->assertInertia(fn (Assert $page) => $page
            ->has('players.data', OnlinePlayersController::PER_PAGE)
            ->where('players.data.0.name', 'Near')
            ->where('players.data.1.name', 'Far')
            ->where('players.last_page', 2));
});

test('the lobby shows how many players are online', function () {
    onlineUser();

    $this->actingAs(User::factory()->create())->get(route('dashboard'))
        ->assertInertia(fn (Assert $page) => $page->where('onlineCount', 2));
});
