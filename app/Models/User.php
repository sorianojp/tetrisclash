<?php

namespace App\Models;

use App\Support\Ranks;
use Carbon\CarbonImmutable;
use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Carbon;
use Laravel\Fortify\Contracts\PasskeyUser;
use Laravel\Fortify\PasskeyAuthenticatable;
use Laravel\Fortify\TwoFactorAuthenticatable;

/**
 * @property int $id
 * @property string $name
 * @property string $email
 * @property Carbon|null $email_verified_at
 * @property string $password
 * @property string|null $two_factor_secret
 * @property string|null $two_factor_recovery_codes
 * @property Carbon|null $two_factor_confirmed_at
 * @property string|null $remember_token
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 * @property int $rating
 * @property int $wins
 * @property int $losses
 * @property int|null $best_sprint_ms
 * @property int|null $best_ultra_score
 * @property int|null $best_dig_ms
 * @property int|null $best_survival_ms
 * @property int $xp
 * @property CarbonImmutable|null $queued_at
 * @property CarbonImmutable|null $searching_since
 */
#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'two_factor_secret', 'two_factor_recovery_codes', 'remember_token'])]
class User extends Authenticatable implements MustVerifyEmail, PasskeyUser
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable, PasskeyAuthenticatable, TwoFactorAuthenticatable;

    /**
     * @var array<string, mixed>
     */
    protected $attributes = [
        'rating' => 1000,
        'wins' => 0,
        'losses' => 0,
        'xp' => 0,
    ];

    /**
     * Practice modes with a personal best: where it's stored, whether a lower value is better,
     * and the range a believable result can fall in. The bounds sit past what any human has
     * done (e.g. 40 lines in under 10 seconds), so a tampered client can't post an impossible
     * record, while every real result still fits.
     *
     * @var array<string, array{column: string, lowerIsBetter: bool, min: int, max: int}>
     */
    public const PRACTICE_RECORDS = [
        'sprint' => ['column' => 'best_sprint_ms', 'lowerIsBetter' => true, 'min' => 10000, 'max' => 3600000],
        'dig' => ['column' => 'best_dig_ms', 'lowerIsBetter' => true, 'min' => 4000, 'max' => 3600000],
        'ultra' => ['column' => 'best_ultra_score', 'lowerIsBetter' => false, 'min' => 0, 'max' => 500000],
        'survival' => ['column' => 'best_survival_ms', 'lowerIsBetter' => false, 'min' => 0, 'max' => 86400000],
    ];

    /**
     * Personal bests keyed by practice mode (null when never set).
     *
     * @return array<string, int|null>
     */
    public function practiceRecords(): array
    {
        return array_map(fn (array $record) => $this->{$record['column']}, self::PRACTICE_RECORDS);
    }

    /**
     * The player's rank, title and progress toward the next rank.
     *
     * @return array{rank: int, title: string, xp: int, xpIntoRank: int, xpForNext: int|null}
     */
    public function rankProgress(): array
    {
        return Ranks::progress($this->xp);
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'two_factor_confirmed_at' => 'datetime',
            'queued_at' => 'datetime',
            'searching_since' => 'datetime',
        ];
    }
}
