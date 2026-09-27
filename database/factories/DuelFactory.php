<?php

namespace Database\Factories;

use App\Models\Duel;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Duel>
 */
class DuelFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'player_one_id' => User::factory(),
            'player_two_id' => User::factory(),
            'seed' => fake()->numberBetween(1, 2_147_483_646),
            'player_one_seen_at' => now(),
            'player_two_seen_at' => now(),
            'starts_at' => now(),
            'ends_at' => now()->addSeconds(Duel::DURATION_SECONDS),
        ];
    }

    /**
     * A duel whose two minutes have already run out.
     */
    public function expired(): static
    {
        return $this->state(fn () => [
            'starts_at' => now()->subSeconds(Duel::DURATION_SECONDS + 3),
            'ends_at' => now()->subSeconds(3),
            'player_one_seen_at' => now()->subSeconds(4),
            'player_two_seen_at' => now()->subSeconds(4),
        ]);
    }

    /**
     * A first-to-40-lines race.
     */
    public function race(): static
    {
        return $this->state(fn () => [
            'mode' => Duel::MODE_RACE,
            'ranked' => false,
            'ends_at' => now()->addSeconds(Duel::RACE_DURATION_SECONDS),
        ]);
    }

    /**
     * A friendly duel that leaves rating and XP alone.
     */
    public function unranked(): static
    {
        return $this->state(fn () => ['ranked' => false]);
    }
}
