<?php

namespace App\Events;

use App\Support\Achievements;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Pops up "Achievement unlocked" on the player's screen.
 */
class AchievementUnlocked implements ShouldBroadcastNow, ShouldDispatchAfterCommit
{
    use Dispatchable, InteractsWithSockets;

    public function __construct(public int $userId, public string $key) {}

    /**
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        return [new PrivateChannel('App.Models.User.'.$this->userId)];
    }

    /**
     * @return array{key: string, title: string, description: string}
     */
    public function broadcastWith(): array
    {
        $achievement = Achievements::ALL[$this->key];

        return [
            'key' => $this->key,
            'title' => $achievement['title'],
            'description' => $achievement['description'],
        ];
    }
}
