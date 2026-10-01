<?php

use App\Events\DuelUpdated;
use App\Models\Duel;
use App\Models\PracticeRun;
use App\Models\Replay;
use App\Models\User;
use Illuminate\Support\Facades\Event;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(fn () => Event::fake([DuelUpdated::class]));

/** A replay upload as the browser sends it: gzipped JSON frames, base64-encoded. */
function replayUpload(int $durationMs = 1000, ?array $frames = null): string
{
    $frames ??= [
        [0, str_repeat('0', 200), 0, 0, 0],
        [$durationMs, str_repeat('0', 190).'1111111111', 2, 3, 4],
    ];

    return base64_encode(gzencode(json_encode($frames)));
}

test('players upload their side of a finished duel once', function () {
    $duel = Duel::factory()->create(['finished_at' => now()]);

    $this->actingAs($duel->playerOne)
        ->postJson(route('duels.replay.store', $duel), ['data' => replayUpload(5000)])
        ->assertNoContent();
    $this->actingAs($duel->playerOne)
        ->postJson(route('duels.replay.store', $duel), ['data' => replayUpload(9000)])
        ->assertNoContent();

    expect(Replay::query()->where('duel_id', $duel->id)->sole())
        ->user_id->toBe($duel->player_one_id)
        ->duration_ms->toBe(5000);
});

test('replays can only be uploaded by players once the duel is over', function () {
    $duel = Duel::factory()->create();

    $this->actingAs($duel->playerOne)
        ->postJson(route('duels.replay.store', $duel), ['data' => replayUpload()])
        ->assertConflict();
    $this->actingAs(User::factory()->create())
        ->postJson(route('duels.replay.store', $duel), ['data' => replayUpload()])
        ->assertForbidden();
});

test('malformed replays are rejected', function (string $data) {
    $duel = Duel::factory()->create(['finished_at' => now()]);

    $this->actingAs($duel->playerOne)
        ->postJson(route('duels.replay.store', $duel), ['data' => $data])
        ->assertUnprocessable();

    expect(Replay::query()->count())->toBe(0);
})->with([
    'not base64' => ['!!!'],
    'not gzip' => [base64_encode('hello')],
    'bad snapshot' => [replayUpload(frames: [[0, 'abc', 0, 0, 0]])],
    'time going backwards' => [replayUpload(frames: [[500, str_repeat('0', 200), 0, 0, 0], [100, str_repeat('0', 200), 0, 0, 0]])],
    'empty' => [replayUpload(frames: [])],
]);

test('anyone can watch a finished duel replay', function () {
    $duel = Duel::factory()->create(['finished_at' => now(), 'winner_id' => null]);
    Replay::query()->create(['user_id' => $duel->player_two_id, 'duel_id' => $duel->id, 'duration_ms' => 1000, 'data' => 'abc']);

    $this->actingAs(User::factory()->create())
        ->get(route('duels.replay', $duel))
        ->assertInertia(fn (Assert $page) => $page
            ->component('replay')
            ->where('kind', 'duel')
            ->where('timelines.0.player.id', $duel->player_one_id)
            ->where('timelines.0.data', null)
            ->where('timelines.1.data', 'abc'));
});

test('guests can watch a shared replay, with a preview naming both players', function () {
    $duel = Duel::factory()->create(['finished_at' => now()]);
    $duel->update(['winner_id' => $duel->player_one_id]);

    $this->get(route('duels.replay', $duel))
        ->assertOk()
        ->assertSee('<meta property="og:title" content="'.e("Replay: {$duel->playerOne->name} vs {$duel->playerTwo->name}").'">', false)
        ->assertSee(e("{$duel->playerOne->name} takes the win."), false)
        ->assertInertia(fn (Assert $page) => $page->component('replay')->where('kind', 'duel'));
});

test('an unfinished duel has no replay page yet', function () {
    $duel = Duel::factory()->create();

    $this->actingAs(User::factory()->create())->get(route('duels.replay', $duel))->assertNotFound();
});

test('match history marks duels with a replay', function () {
    $duel = Duel::factory()->create(['finished_at' => now()]);
    Replay::query()->create(['user_id' => $duel->player_one_id, 'duel_id' => $duel->id, 'duration_ms' => 1000, 'data' => 'abc']);

    $this->actingAs($duel->playerOne)
        ->get(route('players.show', $duel->playerOne))
        ->assertInertia(fn (Assert $page) => $page->where('recentDuels.0.hasReplay', true));
});

test('a new best keeps its replay and replaces the older one', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->postJson(route('practice.records'), ['mode' => 'sprint', 'value' => 70000, 'replay' => replayUpload(70000)])->assertNoContent();
    $first = $user->practiceRuns()->sole();
    expect($first->replay)->not->toBeNull();

    // Slower: not a best, so no replay kept.
    $this->actingAs($user)->postJson(route('practice.records'), ['mode' => 'sprint', 'value' => 80000, 'replay' => replayUpload(80000)])->assertNoContent();
    expect(Replay::query()->count())->toBe(1);

    $this->actingAs($user)->postJson(route('practice.records'), ['mode' => 'sprint', 'value' => 60000, 'replay' => replayUpload(60000)])->assertNoContent();

    expect(Replay::query()->sole()->duration_ms)->toBe(60000);
});

test('a weekly best keeps its replay alongside the all-time one', function () {
    $user = User::factory()->create(['best_sprint_ms' => 40000]);
    $old = PracticeRun::factory()->for($user)->create(['mode' => 'sprint', 'value' => 40000, 'created_at' => now()->subWeeks(2)]);
    Replay::query()->create(['user_id' => $user->id, 'practice_run_id' => $old->id, 'duration_ms' => 40000, 'data' => 'abc']);

    $this->actingAs($user)->postJson(route('practice.records'), ['mode' => 'sprint', 'value' => 55000, 'replay' => replayUpload(55000)])->assertNoContent();

    expect(Replay::query()->orderBy('id')->pluck('duration_ms')->all())->toBe([40000, 55000]);
});

test('leaderboard entries link to their replay', function () {
    $user = User::factory()->create();
    $this->actingAs($user)->postJson(route('practice.records'), ['mode' => 'dig', 'value' => 25000, 'replay' => replayUpload(25000)]);
    $run = $user->practiceRuns()->sole();

    $this->actingAs($user)
        ->get(route('practice'))
        ->assertInertia(fn (Assert $page) => $page
            ->where('leaderboards.dig.allTime.entries.0.replayId', $run->id)
            ->where('leaderboards.dig.weekly.entries.0.replayId', $run->id));

    $this->actingAs(User::factory()->create())
        ->get(route('practice.replay', $run))
        ->assertInertia(fn (Assert $page) => $page
            ->component('replay')
            ->where('run.mode', 'dig')
            ->where('timelines.0.durationMs', 25000));
});

test('spectators can open the watch page, players are sent to their own view', function () {
    $duel = Duel::factory()->create();

    $this->actingAs(User::factory()->create())
        ->get(route('duels.watch', $duel))
        ->assertInertia(fn (Assert $page) => $page
            ->component('watch')
            ->where('players.0.id', $duel->player_one_id)
            ->where('players.1.id', $duel->player_two_id));

    $this->actingAs($duel->playerOne)
        ->get(route('duels.watch', $duel))
        ->assertRedirect(route('duels.show', $duel));
});

test('the online list links players in a match to their duel', function () {
    $viewer = User::factory()->create(['last_seen_at' => now()]);
    $busy = User::factory()->create(['last_seen_at' => now()]);
    $duel = Duel::factory()->create(['player_one_id' => $busy->id]);

    $this->actingAs($viewer)
        ->get(route('online.index'))
        ->assertInertia(fn (Assert $page) => $page
            ->where('players.data', fn ($players) => collect($players)->firstWhere('id', $busy->id)['duelId'] === $duel->id));
});

test('profiles link to a live duel', function () {
    $duel = Duel::factory()->create();

    $this->actingAs(User::factory()->create())
        ->get(route('players.show', $duel->playerTwo))
        ->assertInertia(fn (Assert $page) => $page->where('liveDuelId', $duel->id));
});
