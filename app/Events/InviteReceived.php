<?php

namespace App\Events;

use App\Models\Challenge;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Pops up an invite on the invited player's screen.
 */
class InviteReceived implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Challenge $challenge) {}

    /**
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        return [new PrivateChannel('App.Models.User.'.$this->challenge->invitee_id)];
    }

    /**
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        $challenger = $this->challenge->challenger;

        return [
            'code' => $this->challenge->code,
            'mode' => $this->challenge->mode,
            // Relative, so the invitee's clock doesn't matter.
            'expiresInMs' => max(0, (int) now()->diffInMilliseconds($this->challenge->expires_at)),
            'challenger' => [
                'id' => $challenger->id,
                'name' => $challenger->name,
                'rating' => $challenger->rating,
                'rank' => $challenger->rankProgress(),
            ],
        ];
    }
}
