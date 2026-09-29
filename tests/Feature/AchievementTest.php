<?php

use App\Events\AchievementUnlocked;
use App\Events\DuelUpdated;
use App\Models\Duel;
use App\Models\User;
use App\Support\Achievements;
use Illuminate\Support\Facades\Event;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(fn () => Event::fake([AchievementUnlocked::class, DuelUpdated::class]));

function unlockedKeys(User $user): array
{
    return $user->fresh()->achievements()->pluck('key')->sort()->values()->all();
}

test('winning a battle 3-0 unlocks first win and flawless', function () {
    $duel = Duel::factory()->create(['player_two_kos' => 2]);

    $this->actingAs($duel->playerOne)->postJson(route('duels.ko', $duel))->assertOk();

    expect(unlockedKeys($duel->playerTwo))->toBe(['first_win', 'flawless'])
        ->and(unlockedKeys($duel->playerOne))->toBe([]);
    Event::assertDispatchedTimes(AchievementUnlocked::class, 2);
});

test('a friendly win is not a first ranked win', function () {
    $duel = Duel::factory()->unranked()->create(['player_two_kos' => 2, 'player_one_kos' => 1]);

    $this->actingAs($duel->playerOne)->postJson(route('duels.ko', $duel))->assertOk();

    expect(unlockedKeys($duel->playerTwo))->toBe([]);
});

test('winning a race unlocks speed demon', function () {
    $duel = Duel::factory()->race()->create(['starts_at' => now()->subSeconds(60)]);

    $this->actingAs($duel->playerOne)
        ->postJson(route('duels.heartbeat', $duel), ['lines' => Duel::RACE_LINES])
        ->assertJsonPath('finished', true);

    expect(unlockedKeys($duel->playerOne))->toBe(['race_win']);
});

test('practice results unlock their thresholds', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->postJson(route('practice.records'), ['mode' => 'sprint', 'value' => 45000])->assertNoContent();
    expect(unlockedKeys($user))->toBe(['sprint_60']);

    $this->actingAs($user)->postJson(route('practice.records'), ['mode' => 'ultra', 'value' => 60000])->assertNoContent();
    expect(unlockedKeys($user))->toBe(['sprint_60', 'ultra_50k']);
});

test('achievements unlock once', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->postJson(route('achievements.store'), ['key' => 'tetris'])->assertNoContent();
    $this->actingAs($user)->postJson(route('achievements.store'), ['key' => 'tetris'])->assertNoContent();

    expect(unlockedKeys($user))->toBe(['tetris']);
    Event::assertDispatchedTimes(AchievementUnlocked::class, 1);
});

test('the client can only report skill achievements', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->postJson(route('achievements.store'), ['key' => 'champion'])
        ->assertJsonValidationErrors('key');

    expect(unlockedKeys($user))->toBe([]);
});

test('profiles list every achievement and which are unlocked', function () {
    $player = User::factory()->create();
    $player->achievements()->create(['key' => 'tspin']);

    $this->actingAs(User::factory()->create())
        ->get(route('players.show', $player))
        ->assertInertia(fn (Assert $page) => $page
            ->has('achievements', count(Achievements::ALL))
            ->where('achievements.0.key', 'first_win')
            ->where('achievements.0.unlockedAt', null)
            ->where('achievements', fn ($list) => collect($list)->firstWhere('key', 'tspin')['unlockedAt'] !== null));
});
