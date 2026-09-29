<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\PracticeRunFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One finished practice run that counts toward a record (see User::PRACTICE_RECORDS),
 * kept so boards can rank results from a period, not just all-time bests.
 *
 * @property int $id
 * @property int $user_id
 * @property string $mode
 * @property int $value
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 * @property-read User $user
 */
#[Fillable(['user_id', 'mode', 'value'])]
class PracticeRun extends Model
{
    /** @use HasFactory<PracticeRunFactory> */
    use HasFactory;

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
