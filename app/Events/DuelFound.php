<?php

namespace App\Events;

use App\Models\Duel;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Tells both matched players that their duel is ready.
 */
class DuelFound implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Duel $duel) {}

    /**
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('App.Models.User.'.$this->duel->player_one_id),
            new PrivateChannel('App.Models.User.'.$this->duel->player_two_id),
        ];
    }

    /**
     * @return array{duelId: int}
     */
    public function broadcastWith(): array
    {
        return ['duelId' => $this->duel->id];
    }
}
