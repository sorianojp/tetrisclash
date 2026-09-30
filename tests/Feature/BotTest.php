<?php

use App\Events\DuelFound;
use App\Events\DuelUpdated;
use App\Events\InviteReceived;
use App\Events\TournamentMatchReady;
use App\Models\Challenge;
use App\Models\Duel;
use App\Models\Tournament;
use App\Models\User;
use App\Support\Bots;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Broadcast;
use Illuminate\Support\Facades\Event;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    Event::fake([DuelFound::class, DuelUpdated::class, InviteReceived::class, TournamentMatchReady::class]);
    config([
        'game.bots.enabled' => true,
        'game.bots.runner_token' => 'secret-token',
        'game.bots.match_after_seconds' => 20,
        'game.bots.pair_chance' => 100,
    ]);
    Bots::install();
});

/** Mark every bot as online right now. */
function botsOnline(): void
{
    User::query()->bots()->update(['last_seen_at' => now()]);
}

function runner(): array
{
    return ['Authorization' => 'Bearer secret-token', 'Accept' => 'application/json'];
}

test('installing creates twenty verified bots, once', function () {
    expect(User::query()->bots()->count())->toBe(20);

    Bots::install();

    expect(User::query()->bots()->count())->toBe(20)
        ->and(User::query()->bots()->whereNull('email_verified_at')->count())->toBe(0);
});

test('nothing sent to browsers marks a bot as a bot', function () {
    $bot = User::query()->bots()->first();

    expect($bot->toArray())->not->toHaveKey('bot_key');

    $this->actingAs(User::factory()->create())
        ->get(route('players.show', $bot))
        ->assertInertia(fn (Assert $page) => $page->where('player', fn ($player) => ! collect($player)->has('bot_key')));
});

test('a player who waited long enough is matched with the closest-rated bot', function () {
    botsOnline();
    User::query()->bots()->where('bot_key', 'b05')->update(['rating' => 1190]);
    $player = User::factory()->create([
        'rating' => 1200,
        'queued_at' => now(),
        'searching_since' => now()->subSeconds(25),
    ]);

    $duelId = $this->actingAs($player)->postJson(route('matchmaking.join'))->json('duelId');

    $duel = Duel::query()->findOrFail($duelId);
    $bot = User::query()->find($duel->opponentIdOf($player));

    expect($bot->bot_key)->toBe('b05')
        ->and($duel->ranked)->toBeTrue()
        ->and($player->fresh()->currentEnergy())->toBe(config('game.energy.max') - 1);
});

test('no bot before the wait is up, or when bots are off', function () {
    botsOnline();
    $player = User::factory()->create(['queued_at' => now(), 'searching_since' => now()->subSeconds(5)]);

    $this->actingAs($player)->postJson(route('matchmaking.join'))->assertJsonPath('queued', true);

    config(['game.bots.enabled' => false]);
    $player->forceFill(['searching_since' => now()->subMinute()])->save();

    $this->actingAs($player)->postJson(route('matchmaking.join'))->assertJsonPath('queued', true);
});

test('a real opponent is still preferred over a bot', function () {
    botsOnline();
    $waiting = User::factory()->create(['queued_at' => now(), 'searching_since' => now()->subSeconds(30)]);
    $player = User::factory()->create(['queued_at' => now(), 'searching_since' => now()->subSeconds(30)]);

    $duelId = $this->actingAs($player)->postJson(route('matchmaking.join'))->json('duelId');

    expect(Duel::query()->find($duelId)->opponentIdOf($player))->toBe($waiting->id);
});

test('bots never rate above the cap', function () {
    config(['game.bots.max_rating' => 1300]);
    $bot = User::query()->bots()->first();
    $bot->forceFill(['rating' => 1295])->save();
    $duel = Duel::factory()->create(['player_one_id' => $bot->id, 'player_one_kos' => 2]);

    $this->actingAs($duel->playerTwo)->postJson(route('duels.ko', $duel))->assertJsonPath('winnerId', $bot->id);

    expect($bot->fresh()->rating)->toBe(1300);
});

test('bots keep their hours', function () {
    // b01 plays 00:00–04:00 and 12:00–15:00 UTC, on days it shows up.
    $day = collect(range(0, 30))
        ->map(fn ($i) => CarbonImmutable::parse('2026-10-01 01:00', 'UTC')->addDays($i))
        ->first(fn ($at) => crc32('b01'.$at->toDateString()) % 100 < 80);

    expect(Bots::scheduledOnline('b01', $day))->toBeTrue()
        ->and(Bots::scheduledOnline('b01', $day->setTime(6, 0)))->toBeFalse()
        ->and(Bots::scheduledOnline('b01', $day->setTime(13, 30)))->toBeTrue();
});

test('the tick brings scheduled bots online and pairs two of them up', function () {
    $this->travelTo(CarbonImmutable::parse('2026-10-01 13:00', 'UTC'));

    $this->artisan('bots:tick')->assertSuccessful();

    $online = User::query()->bots()->online()->pluck('bot_key');
    $expected = collect(Bots::ROSTER)->keys()->filter(fn ($key) => Bots::scheduledOnline($key));

    expect($online->sort()->values()->all())->toBe($expected->sort()->values()->all())
        ->and(Duel::query()->whereNull('finished_at')->count())->toBe($expected->count() >= 2 ? 1 : 0);
});

test('bots take the seats of a tournament nobody has joined for a while', function () {
    botsOnline();
    $host = User::factory()->create();
    $this->actingAs($host)->post(route('tournaments.store'), ['mode' => 'battle']);
    $tournament = Tournament::query()->sole();

    Bots::fillTournaments();
    expect($tournament->players()->count())->toBe(1);

    $this->travel(3)->minutes();
    botsOnline();
    Bots::fillTournaments();

    expect($tournament->players()->count())->toBe(2);
});

test('the runner API needs the token', function () {
    $this->getJson(route('internal.bots.work'))->assertNotFound();
    $this->getJson(route('internal.bots.work'), ['Authorization' => 'Bearer wrong'])->assertNotFound();

    config(['game.bots.runner_token' => null]);
    $this->getJson(route('internal.bots.work'), runner())->assertNotFound();
});

test('the runner sees the duels and invites its bots have', function () {
    botsOnline();
    $bot = User::query()->bots()->first();
    $duel = Duel::factory()->create(['player_two_id' => $bot->id]);
    $otherBot = User::query()->bots()->skip(1)->first();
    $invite = Challenge::open(User::factory()->create(), 'race', $otherBot);

    $this->getJson(route('internal.bots.work'), runner())
        ->assertOk()
        ->assertJsonPath('enabled', true)
        ->assertJsonPath('duels.0.duelId', $duel->id)
        ->assertJsonPath('duels.0.botId', $bot->id)
        ->assertJsonPath('duels.0.seed', $duel->seed)
        ->assertJsonPath('duels.0.style.pps', Bots::ROSTER[$bot->bot_key]['pps'])
        ->assertJsonPath('invites.0.code', $invite->code);
});

test('the runner plays a bot\'s duel through the same rules as a player', function () {
    $bot = User::query()->bots()->first();
    $duel = Duel::factory()->create(['player_one_id' => $bot->id, 'player_one_kos' => 2]);

    $this->postJson(route('internal.bots.heartbeat', [$bot, $duel]), ['lines_sent' => 4, 'lines' => 6], runner())
        ->assertOk()
        ->assertJsonPath('finished', false);

    $this->postJson(route('internal.bots.ko', [$duel->player_two_id, $duel]), ['lines_sent' => 0], runner())
        ->assertNotFound(); // not a bot

    $this->actingAs($duel->playerTwo)->postJson(route('duels.ko', $duel))->assertJsonPath('winnerId', $bot->id);

    $frames = [[0, str_repeat('0', 200), 0, 0, 0], [900, str_repeat('0', 200), 0, 4, 6]];
    $this->postJson(route('internal.bots.replay', [$bot, $duel]), ['data' => base64_encode(gzencode(json_encode($frames)))], runner())
        ->assertNoContent();

    expect($duel->replays()->where('user_id', $bot->id)->exists())->toBeTrue();
});

test('the runner can only act for a bot in its own duel', function () {
    $bot = User::query()->bots()->first();
    $duel = Duel::factory()->create();

    $this->postJson(route('internal.bots.heartbeat', [$bot, $duel]), ['lines_sent' => 0, 'lines' => 0], runner())
        ->assertForbidden();
});

test('bots answer invites', function () {
    botsOnline();
    $bot = User::query()->bots()->first();
    $host = User::factory()->create();
    $accepted = Challenge::open($host, 'battle', $bot);

    $duelId = $this->postJson(route('internal.bots.invites.accept', [$bot, $accepted]), [], runner())->json('duelId');
    expect(Duel::query()->find($duelId)->hasPlayer($host))->toBeTrue();

    $other = User::query()->bots()->skip(1)->first();
    $declined = Challenge::open(User::factory()->create(), 'battle', $other);
    $this->postJson(route('internal.bots.invites.decline', [$other, $declined]), [], runner())->assertNoContent();

    expect(Challenge::query()->find($declined->id))->toBeNull();
});

test('the runner signs presence channels as the bot', function () {
    config([
        'broadcasting.default' => 'reverb',
        'broadcasting.connections.reverb.key' => 'app-key',
        'broadcasting.connections.reverb.secret' => 'app-secret',
        'broadcasting.connections.reverb.app_id' => '1',
    ]);
    Broadcast::purge();
    require base_path('routes/channels.php');

    $bot = User::query()->bots()->first();
    $duel = Duel::factory()->create(['player_one_id' => $bot->id]);

    $response = $this->postJson(route('internal.bots.auth', $bot), [
        'socket_id' => '123.456',
        'channel_name' => "presence-duel.{$duel->id}",
    ], runner())->assertOk();

    expect((int) json_decode($response->json('channel_data'), true)['user_id'])->toBe($bot->id);

    $this->postJson(route('internal.bots.auth', $bot), [
        'socket_id' => '123.456',
        'channel_name' => 'presence-duel.'.Duel::factory()->create()->id,
    ], runner())->assertForbidden();
});

test('idle online bots are offered practice time', function () {
    botsOnline();
    $busy = User::query()->bots()->first();
    Duel::factory()->create(['player_one_id' => $busy->id]);

    $idle = $this->getJson(route('internal.bots.work'), runner())->json('idle');

    expect($idle)->toHaveCount(19)
        ->and(collect($idle)->pluck('botId'))->not->toContain($busy->id);
});

test('bot practice runs are saved like a player\'s', function () {
    $bot = User::query()->bots()->first();
    $frames = [[0, str_repeat('0', 200), 0, 0, 0], [52000, str_repeat('0', 200), 0, 0, 40]];

    $this->postJson(route('internal.bots.practice', $bot), [
        'mode' => 'sprint',
        'value' => 52000,
        'replay' => base64_encode(gzencode(json_encode($frames))),
    ], runner())->assertNoContent();

    expect($bot->fresh()->best_sprint_ms)->toBe(52000)
        ->and($bot->practiceRuns()->sole()->replay)->not->toBeNull()
        ->and($bot->achievements()->pluck('key')->all())->toBe(['sprint_60']);

    $this->postJson(route('internal.bots.practice', $bot), ['mode' => 'sprint', 'value' => 5], runner())
        ->assertJsonValidationErrors('value');
});

test('bots earn skill achievements', function () {
    $bot = User::query()->bots()->first();

    $this->postJson(route('internal.bots.achievements', $bot), ['key' => 'tetris'], runner())->assertNoContent();
    $this->postJson(route('internal.bots.achievements', $bot), ['key' => 'champion'], runner())->assertJsonValidationErrors('key');

    expect($bot->achievements()->pluck('key')->all())->toBe(['tetris']);
});

test('a practicing bot stays online', function () {
    $bot = User::query()->bots()->first();
    $bot->forceFill(['last_seen_at' => now()->subHour()])->save();

    $this->postJson(route('internal.bots.seen', $bot), [], runner())->assertNoContent();

    expect(User::query()->online()->whereKey($bot->id)->exists())->toBeTrue();
});

test('handing in a practice run marks the bot as seen', function () {
    $bot = User::query()->bots()->first();
    $bot->forceFill(['last_seen_at' => now()->subHour()])->save();

    $this->postJson(route('internal.bots.practice', $bot), ['mode' => 'ultra', 'value' => 9000], runner())->assertNoContent();

    expect($bot->fresh()->last_seen_at->isAfter(now()->subMinute()))->toBeTrue();
});
