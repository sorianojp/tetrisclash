<?php

namespace Database\Factories;

use App\Models\PracticeRun;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PracticeRun>
 */
class PracticeRunFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'mode' => 'sprint',
            'value' => fake()->numberBetween(30000, 120000),
        ];
    }
}
