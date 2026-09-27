<?php

namespace Database\Factories;

use App\Models\Challenge;
use App\Models\Duel;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Challenge>
 */
class ChallengeFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'code' => Str::lower(Str::random(10)),
            'challenger_id' => User::factory(),
            'mode' => Duel::MODE_BATTLE,
            'expires_at' => now()->addMinutes(Challenge::LIFETIME_MINUTES),
        ];
    }

    public function expired(): static
    {
        return $this->state(fn () => ['expires_at' => now()->subMinute()]);
    }
}
