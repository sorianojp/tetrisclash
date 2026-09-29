<?php

namespace App\Events;

use App\Models\Duel;
use App\Models\Tournament;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Sends both players of a bracket match to their duel, wherever they are in the app.
 */
class TournamentMatchReady implements ShouldBroadcastNow, ShouldDispatchAfterCommit
{
    use Dispatchable, InteractsWithSockets;

    public function __construct(public Duel $duel, public Tournament $tournament) {}

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
     * @return array{duelId: int, tournament: string}
     */
    public function broadcastWith(): array
    {
        return ['duelId' => $this->duel->id, 'tournament' => $this->tournament->name];
    }
}
