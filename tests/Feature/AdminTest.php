<?php

use App\Events\AchievementUnlocked;
use App\Events\DuelFound;
use App\Events\DuelUpdated;
use App\Events\TournamentMatchReady;
use App\Models\Achievement;
use App\Models\Challenge;
use App\Models\Duel;
use App\Models\PracticeRun;
use App\Models\Tournament;
use App\Models\TournamentMatch;
use App\Models\User;
use App\Support\Bots;
use App\Support\Energy;
use App\Support\PracticeLeaderboards;
use Illuminate\Support\Facades\Event;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(fn () => Event::fake([DuelFound::class, DuelUpdated::class, TournamentMatchReady::class, AchievementUnlocked::class]));

function admin(): User
{
    return User::factory()->admin()->create();
}

test('admin pages are for admins only', function (string $route) {
    $this->get(route($route))->assertRedirect(route('login'));
    $this->actingAs(User::factory()->create())->get(route($route))->assertForbidden();
    $this->actingAs(admin())->get(route($route))->assertOk();
})->with([
    'admin.dashboard',
    'admin.users.index',
    'admin.practice.index',
    'admin.tournaments.index',
    'admin.duels.index',
    'admin.bots.index',
]);

test('players cannot use admin actions', function () {
    $player = User::factory()->create();
    $other = User::factory()->create();

    $this->actingAs($player)->post(route('admin.users.ban', $other))->assertForbidden();
    $this->actingAs($player)->patch(route('admin.users.stats', $other), ['rating' => 3000, 'xp' => 0])->assertForbidden();

    expect($other->fresh()->isBanned())->toBeFalse();
});

test('the console grants and revokes admin', function () {
    $user = User::factory()->create(['email' => 'boss@example.com']);

    $this->artisan('user:make-admin', ['email' => 'boss@example.com'])->assertSuccessful();
    expect($user->fresh()->isAdmin())->toBeTrue();

    $this->artisan('user:make-admin', ['email' => 'boss@example.com', '--revoke' => true])->assertSuccessful();
    expect($user->fresh()->isAdmin())->toBeFalse();

    $this->artisan('user:make-admin', ['email' => 'nobody@example.com'])->assertFailed();
});

test('the shared user tells the app who is an admin', function () {
    $this->actingAs(admin())
        ->get(route('dashboard'))
        ->assertInertia(fn (Assert $page) => $page->where('auth.user.is_admin', true));
});

test('the dashboard counts players and activity', function () {
    User::factory()->count(3)->create();
    User::factory()->create(['banned_at' => now()]);
    Duel::factory()->create();

    $this->actingAs(admin())
        ->get(route('admin.dashboard'))
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/dashboard')
            // Four above, the duel's two players and the admin.
            ->where('stats.players', 7)
            ->where('stats.banned', 1)
            ->where('stats.liveDuels', 1)
            ->has('recentSignups', 7));
});

test('users can be searched and filtered', function () {
    User::factory()->create(['name' => 'Alice', 'email' => 'alice@example.com']);
    User::factory()->create(['name' => 'Bob', 'banned_at' => now()]);

    $this->actingAs(admin())
        ->get(route('admin.users.index', ['search' => 'alice@']))
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/users/index')
            ->has('users.data', 1)
            ->where('users.data.0.name', 'Alice'));

    $this->actingAs(admin())
        ->get(route('admin.users.index', ['filter' => 'banned']))
        ->assertInertia(fn (Assert $page) => $page
            ->has('users.data', 1)
            ->where('users.data.0.name', 'Bob'));
});

test('an admin can see a player in detail', function () {
    $player = User::factory()->create(['best_sprint_ms' => 50000]);
    PracticeRun::factory()->create(['user_id' => $player->id, 'value' => 50000]);

    $this->actingAs(admin())
        ->get(route('admin.users.show', $player))
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/users/show')
            ->where('user.id', $player->id)
            ->where('records.sprint', 50000)
            ->has('runs', 1)
            ->where('canBan', true));
});

test('a banned player is signed out, loses their match and leaves the boards', function () {
    $player = User::factory()->create(['best_sprint_ms' => 30000, 'last_seen_at' => now(), 'wins' => 1]);
    $opponent = User::factory()->create();
    $duel = Duel::factory()->create(['player_one_id' => $player->id, 'player_two_id' => $opponent->id]);

    $this->actingAs(admin())
        ->post(route('admin.users.ban', $player), ['reason' => 'Cheating'])
        ->assertRedirect();

    $player->refresh();
    expect($player->isBanned())->toBeTrue()
        ->and($player->ban_reason)->toBe('Cheating')
        ->and($duel->fresh())->winner_id->toBe($opponent->id)->finish_reason->toBe('forfeit')
        ->and(User::query()->online()->whereKey($player->id)->exists())->toBeFalse();

    $boards = PracticeLeaderboards::all($opponent);
    expect($boards['sprint']['allTime']['entries'])->toBe([]);

    $this->actingAs($player)
        ->get(route('dashboard'))
        ->assertRedirect(route('login'))
        ->assertSessionHas('status', 'This account has been suspended: Cheating');
    $this->assertGuest();
});

test('a banned player drops out of a tournament that has not started', function () {
    $player = User::factory()->create();
    $tournament = Tournament::openBy(User::factory()->create(), Duel::MODE_BATTLE);
    $tournament->join($player);

    $this->actingAs(admin())->post(route('admin.users.ban', $player));

    expect($tournament->players()->where('user_id', $player->id)->exists())->toBeFalse();
});

test('admins cannot be banned', function () {
    $admin = admin();

    $this->actingAs($admin)->post(route('admin.users.ban', $admin))->assertForbidden();
    $this->actingAs($admin)->post(route('admin.users.ban', admin()))->assertForbidden();
});

test('unbanning lets the player back in', function () {
    $player = User::factory()->create(['banned_at' => now(), 'ban_reason' => 'Spam']);

    $this->actingAs(admin())->delete(route('admin.users.unban', $player))->assertRedirect();

    expect($player->fresh())->banned_at->toBeNull()->ban_reason->toBeNull();
    $this->actingAs($player->fresh())->get(route('dashboard'))->assertOk();
});

test('an admin can set rating, xp and energy', function () {
    $player = User::factory()->create();

    $this->actingAs(admin())->patch(route('admin.users.stats', $player), ['rating' => 1500, 'xp' => 9000])->assertRedirect();
    expect($player->fresh())->rating->toBe(1500)->xp->toBe(9000);

    $this->actingAs(admin())->patch(route('admin.users.energy', $player), ['energy' => 1])->assertRedirect();
    expect($player->fresh()->currentEnergy())->toBe(1);

    $this->actingAs(admin())->patch(route('admin.users.energy', $player), ['energy' => Energy::max()])->assertRedirect();
    expect($player->fresh())->energy->toBeNull()
        ->and($player->fresh()->currentEnergy())->toBe(Energy::max());

    $this->actingAs(admin())->patch(route('admin.users.energy', $player), ['energy' => Energy::max() + 1])->assertSessionHasErrors('energy');
});

test('an admin can grant and remove achievements', function () {
    $player = User::factory()->create();

    $this->actingAs(admin())->post(route('admin.users.achievements.store', $player), ['key' => 'champion'])->assertRedirect();
    expect($player->achievements()->pluck('key')->all())->toBe(['champion']);

    $this->actingAs(admin())->delete(route('admin.users.achievements.destroy', [$player, 'champion']))->assertRedirect();
    expect(Achievement::query()->count())->toBe(0);

    $this->actingAs(admin())->post(route('admin.users.achievements.store', $player), ['key' => 'nope'])->assertSessionHasErrors('key');
});

test('resetting a record deletes it and every run in that mode', function () {
    $player = User::factory()->create(['best_sprint_ms' => 20000, 'best_ultra_score' => 1000]);
    PracticeRun::factory()->count(2)->create(['user_id' => $player->id, 'mode' => 'sprint']);
    PracticeRun::factory()->create(['user_id' => $player->id, 'mode' => 'ultra', 'value' => 1000]);

    $this->actingAs(admin())->delete(route('admin.users.records.destroy', [$player, 'sprint']))->assertRedirect();

    expect($player->fresh())->best_sprint_ms->toBeNull()->best_ultra_score->toBe(1000)
        ->and($player->practiceRuns()->pluck('mode')->all())->toBe(['ultra']);

    $this->actingAs(admin())->delete(route('admin.users.records.destroy', [$player, 'bogus']))->assertNotFound();
});

test('deleting a record run falls back to the next best run', function () {
    $player = User::factory()->create(['best_sprint_ms' => 20000]);
    $fake = PracticeRun::factory()->create(['user_id' => $player->id, 'mode' => 'sprint', 'value' => 20000]);
    PracticeRun::factory()->create(['user_id' => $player->id, 'mode' => 'sprint', 'value' => 70000]);
    PracticeRun::factory()->create(['user_id' => $player->id, 'mode' => 'sprint', 'value' => 65000]);

    $this->actingAs(admin())->delete(route('admin.practice.runs.destroy', $fake))->assertRedirect();

    expect($player->fresh()->best_sprint_ms)->toBe(65000)
        ->and(PracticeRun::query()->count())->toBe(2);
});

test('deleting a run that is not the record leaves the record alone', function () {
    $player = User::factory()->create(['best_ultra_score' => 90000]);
    $run = PracticeRun::factory()->create(['user_id' => $player->id, 'mode' => 'ultra', 'value' => 5000]);

    $this->actingAs(admin())->delete(route('admin.practice.runs.destroy', $run))->assertRedirect();

    expect($player->fresh()->best_ultra_score)->toBe(90000);
});

test('the leaderboards page lists records and runs for a mode', function () {
    User::factory()->create(['best_dig_ms' => 40000]);
    PracticeRun::factory()->create(['mode' => 'dig', 'value' => 40000]);

    $this->actingAs(admin())
        ->get(route('admin.practice.index', ['mode' => 'dig']))
        ->assertInertia(fn (Assert $page) => $page
            ->component('admin/practice')
            ->where('mode', 'dig')
            ->has('records', 1)
            ->has('weeklyRuns', 1)
            ->has('recentRuns', 1));
});

test('ending a duel leaves rating, records and xp alone', function () {
    $duel = Duel::factory()->create(['player_one_kos' => 2]);

    $this->actingAs(admin())->post(route('admin.duels.cancel', $duel))->assertRedirect();

    $duel->refresh();
    expect($duel->finish_reason)->toBe('cancelled')
        ->and($duel->winner_id)->toBeNull()
        ->and($duel->rating_change)->toBeNull()
        ->and($duel->playerOne->rating)->toBe(1000)
        ->and($duel->playerOne->losses + $duel->playerOne->wins)->toBe(0)
        ->and($duel->playerOne->xp)->toBe(0);
});

/** A tournament that has started, with its four quarterfinal duels live. */
function runningTournament(): Tournament
{
    $tournament = Tournament::openBy(User::factory()->create(), Duel::MODE_BATTLE);

    foreach (User::factory()->count(Tournament::SIZE - 1)->create() as $player) {
        $tournament->join($player);
    }

    return $tournament->fresh();
}

test('cancelling a tournament removes it and ends its live duels', function () {
    $tournament = runningTournament();
    $duelIds = $tournament->matches()->whereNotNull('duel_id')->pluck('duel_id');

    $this->actingAs(admin())->delete(route('admin.tournaments.destroy', $tournament))->assertRedirect();

    expect(Tournament::query()->count())->toBe(0)
        ->and(Duel::query()->whereKey($duelIds)->whereNull('finished_at')->count())->toBe(0)
        ->and(Duel::query()->whereKey($duelIds)->pluck('finish_reason')->unique()->all())->toBe(['cancelled']);
});

test('deciding a live bracket match forfeits it for the loser', function () {
    $tournament = runningTournament();
    $match = $tournament->matches()->where('round', 1)->where('position', 0)->firstOrFail();

    $this->actingAs(admin())
        ->post(route('admin.tournaments.matches.advance', [$tournament, $match]), ['winner_id' => $match->player_two_id])
        ->assertRedirect();

    $match->refresh();
    expect($match->winner_id)->toBe($match->player_two_id)
        ->and(Duel::query()->findOrFail($match->duel_id)->finish_reason)->toBe('forfeit')
        ->and($tournament->matches()->where('round', 2)->where('position', 0)->value('player_one_id'))->toBe($match->player_two_id);
});

test('deciding a match that never started advances the winner', function () {
    $tournament = runningTournament();
    $match = $tournament->matches()->where('round', 1)->where('position', 0)->firstOrFail();
    // The duel was lost track of: the match has no duel any more.
    Duel::query()->whereKey($match->duel_id)->update(['finished_at' => now(), 'finish_reason' => 'abandoned']);
    $match->update(['duel_id' => null]);

    $this->actingAs(admin())
        ->post(route('admin.tournaments.matches.advance', [$tournament, $match]), ['winner_id' => $match->player_one_id])
        ->assertRedirect();

    expect($match->fresh()->winner_id)->toBe($match->player_one_id)
        ->and($tournament->players()->where('user_id', $match->player_two_id)->value('eliminated_at'))->not->toBeNull();
});

test('a match can only be decided for one of its players', function () {
    $tournament = runningTournament();
    $match = $tournament->matches()->where('round', 1)->firstOrFail();
    $final = TournamentMatch::query()->where('tournament_id', $tournament->id)->where('round', Tournament::ROUNDS)->firstOrFail();

    $this->actingAs(admin())
        ->post(route('admin.tournaments.matches.advance', [$tournament, $match]), ['winner_id' => User::factory()->create()->id])
        ->assertSessionHasErrors('tournament');

    // Nobody has reached the final yet.
    $this->actingAs(admin())
        ->post(route('admin.tournaments.matches.advance', [$tournament, $final]), ['winner_id' => $match->player_one_id])
        ->assertSessionHasErrors('tournament');
});

test('a player can be removed from a tournament before it starts', function () {
    $creator = User::factory()->create();
    $tournament = Tournament::openBy($creator, Duel::MODE_RACE);
    $player = User::factory()->create();
    $tournament->join($player);

    $this->actingAs(admin())->delete(route('admin.tournaments.players.destroy', [$tournament, $player]))->assertRedirect();

    expect($tournament->players()->pluck('user_id')->all())->toBe([$creator->id]);

    $running = runningTournament();
    $this->actingAs(admin())
        ->delete(route('admin.tournaments.players.destroy', [$running, $running->players()->value('user_id')]))
        ->assertSessionHasErrors('tournament');
});

test('a paused bot stays offline and takes no matches', function () {
    config(['game.bots.enabled' => true, 'game.bots.match_after_seconds' => 0]);
    Bots::install();
    User::query()->bots()->update(['bot_paused_at' => now()]);
    $bot = User::query()->bots()->firstOrFail();

    $this->actingAs(admin())->patch(route('admin.bots.update', $bot), ['paused' => false])->assertRedirect();
    expect($bot->fresh()->bot_paused_at)->toBeNull();

    $player = User::factory()->create(['rating' => 1000]);
    expect(Bots::opponentFor($player, 60)?->id)->toBe($bot->id);

    $this->actingAs(admin())->patch(route('admin.bots.update', $bot), ['paused' => true])->assertRedirect();
    expect(Bots::opponentFor($player, 60))->toBeNull();

    // Admin can't pause a regular player through the bot route.
    $this->actingAs(admin())->patch(route('admin.bots.update', $player), ['paused' => true])->assertNotFound();
});

test('banned players and paused bots cannot be invited', function () {
    $banned = User::factory()->create(['banned_at' => now()]);
    $pausedBot = User::factory()->create(['bot_key' => 'b01', 'bot_paused_at' => now()]);
    $inviter = User::factory()->create();

    $this->actingAs($inviter)->post(route('players.invite', $banned), ['mode' => 'battle'])->assertRedirect();
    $this->actingAs($inviter)->post(route('players.invite', $pausedBot), ['mode' => 'battle'])->assertRedirect();

    expect(Challenge::query()->count())->toBe(0);
});
