<?php

use App\Events\AchievementUnlocked;
use App\Events\DuelUpdated;
use App\Events\TournamentMatchReady;
use App\Models\Duel;
use App\Models\Tournament;
use App\Models\User;
use Illuminate\Support\Facades\Event;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(fn () => Event::fake([DuelUpdated::class, TournamentMatchReady::class, AchievementUnlocked::class]));

/** A tournament with its creator plus seven more players signed up (so it has started). */
function fullTournament(string $mode = Duel::MODE_BATTLE): Tournament
{
    $creator = User::factory()->create();
    test()->actingAs($creator)->post(route('tournaments.store'), ['mode' => $mode]);
    $tournament = Tournament::query()->latest('id')->firstOrFail();

    foreach (User::factory()->count(Tournament::SIZE - 1)->create() as $player) {
        test()->actingAs($player)->post(route('tournaments.join', $tournament))->assertRedirect();
    }

    return $tournament->fresh();
}

/** Win a tournament duel for its first player by KO. */
function winDuel(Duel $duel): void
{
    $duel->update(['player_two_kos' => 0, 'player_one_kos' => Duel::KOS_TO_WIN - 1]);
    test()->actingAs($duel->playerTwo)->postJson(route('duels.ko', $duel))->assertJsonPath('finished', true);
}

test('creating a tournament signs the creator up', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->post(route('tournaments.store'), ['mode' => 'race'])
        ->assertRedirect();

    $tournament = Tournament::query()->sole();
    expect($tournament)
        ->status->toBe(Tournament::STATUS_OPEN)
        ->mode->toBe('race')
        ->name->toBe('Race Cup #1')
        ->and($tournament->players()->pluck('user_id')->all())->toBe([$user->id]);
});

test('the eighth player starts the bracket with four friendly duels', function () {
    $tournament = fullTournament();

    expect($tournament->status)->toBe(Tournament::STATUS_RUNNING)
        ->and($tournament->matches()->count())->toBe(7)
        ->and($tournament->matches()->where('round', 1)->whereNotNull('duel_id')->count())->toBe(4)
        ->and(Duel::query()->where('ranked', true)->count())->toBe(0);

    Event::assertDispatchedTimes(TournamentMatchReady::class, 4);

    // Players get the full lead-in to arrive.
    $duel = Duel::query()->first();
    expect((int) $duel->starts_at->diffInSeconds($duel->created_at, true))->toBe(Tournament::MATCH_COUNTDOWN_SECONDS);
});

test('a player can only be in one tournament at a time', function () {
    $user = User::factory()->create();
    $this->actingAs($user)->post(route('tournaments.store'), ['mode' => 'battle']);

    $this->actingAs($user)
        ->post(route('tournaments.store'), ['mode' => 'battle'])
        ->assertSessionHasErrors('tournament');

    expect(Tournament::query()->count())->toBe(1);
});

test('players can leave before it starts, and an empty tournament goes away', function () {
    $user = User::factory()->create();
    $this->actingAs($user)->post(route('tournaments.store'), ['mode' => 'battle']);
    $tournament = Tournament::query()->sole();

    $this->actingAs($user)->delete(route('tournaments.leave', $tournament))->assertRedirect(route('tournaments.index'));

    expect(Tournament::query()->count())->toBe(0);
});

test('nobody can join a full tournament', function () {
    $tournament = fullTournament();

    $this->actingAs(User::factory()->create())
        ->post(route('tournaments.join', $tournament))
        ->assertSessionHasErrors('tournament');
});

test('winners advance round by round until a champion is crowned', function () {
    $tournament = fullTournament();

    for ($round = 1; $round <= Tournament::ROUNDS; $round++) {
        $tournament->matches()->where('round', $round)->with('duel')->get()
            ->each(fn ($match) => winDuel($match->duel));
    }

    $tournament->refresh();
    $final = $tournament->matches()->where('round', 3)->sole();

    expect($tournament)
        ->status->toBe(Tournament::STATUS_FINISHED)
        ->winner_id->toBe($final->player_one_id)
        ->and($tournament->players()->whereNull('eliminated_at')->pluck('user_id')->all())->toBe([$final->player_one_id])
        ->and(User::query()->find($final->player_one_id)->achievements()->pluck('key'))->toContain('champion');
});

test('a semifinal waits until both quarterfinals behind it are decided', function () {
    $tournament = fullTournament();
    $first = $tournament->matches()->where('round', 1)->where('position', 0)->sole();

    winDuel($first->duel);

    $semi = $tournament->matches()->where('round', 2)->where('position', 0)->sole();
    expect($semi->player_one_id)->toBe($first->duel->player_one_id)
        ->and($semi->player_two_id)->toBeNull()
        ->and($semi->duel_id)->toBeNull();
});

test('a drawn or abandoned match sends the higher seed through', function () {
    $tournament = fullTournament();
    $match = $tournament->matches()->where('round', 1)->where('position', 0)->sole();
    $match->duel->update([
        'starts_at' => now()->subMinute(),
        'player_one_seen_at' => now()->subMinute(),
        'player_two_seen_at' => now()->subMinute(),
    ]);

    $this->artisan('duels:sweep')->assertSuccessful();

    $seeds = $tournament->players()->pluck('seed', 'user_id');
    $higher = $seeds[$match->player_one_id] < $seeds[$match->player_two_id] ? $match->player_one_id : $match->player_two_id;

    expect($match->duel->fresh()->finish_reason)->toBe('abandoned')
        ->and($match->fresh()->winner_id)->toBe($higher);
});

test('abandoned ranked duels move no rating', function () {
    $duel = Duel::factory()->create([
        'starts_at' => now()->subMinute(),
        'player_one_seen_at' => now()->subMinute(),
        'player_two_seen_at' => now()->subMinute(),
    ]);

    $this->artisan('duels:sweep');

    expect($duel->fresh()->finish_reason)->toBe('abandoned')
        ->and($duel->playerOne->fresh()->rating)->toBe(1000)
        ->and($duel->playerOne->fresh()->xp)->toBe(0);
});

test('a bracket match waits while a player is busy in another duel', function () {
    $players = User::factory()->count(Tournament::SIZE)->create();
    $busy = Duel::factory()->create(['player_one_id' => $players[0]->id]);

    $this->actingAs($players[0])->post(route('tournaments.store'), ['mode' => 'battle']);
    $tournament = Tournament::query()->sole();
    $players->skip(1)->each(fn ($player) => $this->actingAs($player)->post(route('tournaments.join', $tournament)));

    $waiting = $tournament->matches()->where('round', 1)
        ->where(fn ($q) => $q->where('player_one_id', $players[0]->id)->orWhere('player_two_id', $players[0]->id))
        ->sole();
    expect($waiting->duel_id)->toBeNull();

    $this->actingAs($busy->playerTwo)->postJson(route('duels.forfeit', $busy));

    expect($waiting->fresh()->duel_id)->not->toBeNull();
});

test('players still in a running tournament cannot queue for ranked', function () {
    $tournament = fullTournament();
    $duel = $tournament->matches()->where('round', 1)->first()->duel;
    winDuel($duel);

    // Through to the semifinal, which waits on the other quarterfinal.
    $this->actingAs($duel->playerOne)
        ->postJson(route('matchmaking.join'))
        ->assertJsonPath('inTournament', $tournament->id);
});

test('the bracket page shows every round', function () {
    $tournament = fullTournament();

    $this->actingAs(User::factory()->create())
        ->get(route('tournaments.show', $tournament))
        ->assertInertia(fn (Assert $page) => $page
            ->component('tournaments/show')
            ->has('rounds', 3)
            ->where('rounds.0.name', 'Quarterfinal')
            ->has('rounds.0.matches', 4)
            ->where('rounds.0.matches.0.live', true)
            ->where('rounds.2.name', 'Final')
            ->has('players', 8)
            ->where('joined', false));
});

test('tournament duels show their bracket on the duel page', function () {
    $tournament = fullTournament();
    $duel = $tournament->matches()->where('round', 1)->first()->duel;

    $this->actingAs($duel->playerOne)
        ->get(route('duels.show', $duel))
        ->assertInertia(fn (Assert $page) => $page
            ->where('tournament.id', $tournament->id)
            ->where('tournament.round', 'Quarterfinal'));
});

test('the tournaments list groups by status', function () {
    $tournament = fullTournament();
    $user = User::factory()->create();
    $this->actingAs($user)->post(route('tournaments.store'), ['mode' => 'race']);

    $this->actingAs($user)
        ->get(route('tournaments.index'))
        ->assertInertia(fn (Assert $page) => $page
            ->component('tournaments/index')
            ->where('running.0.id', $tournament->id)
            ->where('open.0.players', 1)
            ->where('currentId', Tournament::query()->where('mode', 'race')->value('id')));
});
