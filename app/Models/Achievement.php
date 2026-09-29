<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * An achievement a player has unlocked. What each key means lives in App\Support\Achievements.
 *
 * @property int $id
 * @property int $user_id
 * @property string $key
 * @property CarbonImmutable|null $created_at
 * @property-read User $user
 */
#[Fillable(['user_id', 'key'])]
class Achievement extends Model
{
    public const UPDATED_AT = null;

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
