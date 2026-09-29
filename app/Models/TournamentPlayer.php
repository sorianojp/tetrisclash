<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A player signed up for a tournament.
 *
 * @property int $id
 * @property int $tournament_id
 * @property int $user_id
 * @property int|null $seed
 * @property CarbonImmutable|null $eliminated_at
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 * @property-read User $user
 */
#[Fillable(['tournament_id', 'user_id', 'seed', 'eliminated_at'])]
class TournamentPlayer extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['eliminated_at' => 'datetime'];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
