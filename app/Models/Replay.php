<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A recording of one player's board: their side of a duel, or a practice run. It's the
 * same stream of board snapshots the game sends to opponents, so it plays back exactly
 * what an opponent (or spectator) saw.
 *
 * @property int $id
 * @property int $user_id
 * @property int|null $duel_id
 * @property int|null $practice_run_id
 * @property int $duration_ms
 * @property string $data
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 * @property-read User $user
 */
#[Fillable(['user_id', 'duel_id', 'practice_run_id', 'duration_ms', 'data'])]
#[Hidden(['data'])]
class Replay extends Model
{
    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
