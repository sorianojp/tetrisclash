<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Tells one side of an invite that the other side ended it: the invitee declined
 * (sent to the challenger) or the challenger took it back (sent to the invitee).
 */
class InviteClosed implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets;

    public const DECLINED = 'declined';

    public const CANCELLED = 'cancelled';

    public function __construct(public int $recipientId, public string $code, public string $reason) {}

    /**
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        return [new PrivateChannel('App.Models.User.'.$this->recipientId)];
    }

    /**
     * @return array{code: string, reason: string}
     */
    public function broadcastWith(): array
    {
        return ['code' => $this->code, 'reason' => $this->reason];
    }
}
