<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\ChallengeFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * A shareable link inviting anyone who opens it to an unranked duel with the challenger.
 *
 * @property int $id
 * @property string $code
 * @property int $challenger_id
 * @property string $mode
 * @property int|null $duel_id
 * @property CarbonImmutable $expires_at
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 * @property-read User $challenger
 */
#[Fillable(['code', 'challenger_id', 'mode', 'duel_id', 'expires_at'])]
class Challenge extends Model
{
    /** @use HasFactory<ChallengeFactory> */
    use HasFactory;

    public const LIFETIME_MINUTES = 15;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'code';
    }

    /**
     * Open a fresh challenge, replacing any the player still has open.
     */
    public static function open(User $challenger, string $mode): self
    {
        self::query()->where('challenger_id', $challenger->id)->whereNull('duel_id')->delete();

        return self::create([
            'code' => Str::lower(Str::random(10)),
            'challenger_id' => $challenger->id,
            'mode' => $mode,
            'expires_at' => now()->addMinutes(self::LIFETIME_MINUTES),
        ]);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function challenger(): BelongsTo
    {
        return $this->belongsTo(User::class, 'challenger_id');
    }

    public function isAccepted(): bool
    {
        return $this->duel_id !== null;
    }

    public function isExpired(): bool
    {
        return ! $this->isAccepted() && $this->expires_at->isPast();
    }
}
