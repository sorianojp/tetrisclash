<?php

namespace App\Models;

use App\Support\Energy;
use App\Support\Ranks;
use Carbon\CarbonImmutable;
use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
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
 * @property int|null $best_zen_score
 * @property int $xp
 * @property CarbonImmutable|null $queued_at
 * @property CarbonImmutable|null $searching_since
 * @property bool $accepts_invites
 * @property CarbonImmutable|null $last_seen_at
 * @property int|null $energy
 * @property CarbonImmutable|null $energy_updated_at
 * @property string $piece_theme
 * @property string $board_skin
 * @property string|null $bot_key
 * @property bool $is_admin
 * @property CarbonImmutable|null $banned_at
 * @property string|null $ban_reason
 * @property CarbonImmutable|null $bot_paused_at
 * @property bool $autopilot
 */
#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'two_factor_secret', 'two_factor_recovery_codes', 'remember_token', 'bot_key'])]
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
        'accepts_invites' => true,
        'piece_theme' => 'classic',
        'board_skin' => 'midnight',
        'is_admin' => false,
        'autopilot' => false,
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
        // Zen has no time limit, so its score cap is far above Ultra's.
        'zen' => ['column' => 'best_zen_score', 'lowerIsBetter' => false, 'min' => 0, 'max' => 100000000],
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
     * A computer player (see App\Support\Bots). Only the server knows.
     */
    public function isBot(): bool
    {
        return $this->bot_key !== null;
    }

    /**
     * @param  Builder<User>  $query
     */
    public function scopeBots(Builder $query): void
    {
        $query->whereNotNull('bot_key');
    }

    /**
     * Played by its own browser on autopilot (a livestream account). Only admins and the
     * account itself know; to everyone else it's a regular player.
     */
    public function isAutopilot(): bool
    {
        return $this->autopilot;
    }

    public function isAdmin(): bool
    {
        return $this->is_admin;
    }

    /**
     * Suspended by an admin: signed out on their next request and left off every list.
     */
    public function isBanned(): bool
    {
        return $this->banned_at !== null;
    }

    /**
     * @param  Builder<User>  $query
     */
    public function scopeNotBanned(Builder $query): void
    {
        $query->whereNull('banned_at');
    }

    /**
     * @return HasMany<Achievement, $this>
     */
    public function achievements(): HasMany
    {
        return $this->hasMany(Achievement::class);
    }

    /**
     * @return HasMany<PracticeRun, $this>
     */
    public function practiceRuns(): HasMany
    {
        return $this->hasMany(PracticeRun::class);
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
     * Energy available for ranked matches right now.
     */
    public function currentEnergy(): int
    {
        return Energy::at($this->energy, $this->energy_updated_at)['current'];
    }

    /**
     * Pay one energy for a ranked match. Spending from full starts the refill clock now;
     * otherwise progress toward the next point carries over.
     */
    public function spendEnergy(): void
    {
        ['current' => $current, 'refillingSince' => $since] = Energy::at($this->energy, $this->energy_updated_at);

        $this->forceFill([
            'energy' => max(0, $current - 1),
            'energy_updated_at' => $since ?? now(),
        ])->save();
    }

    /**
     * Energy for the client, which counts down to refills on its own.
     *
     * @return array{current: int, max: int, nextAt: int|null, intervalMs: int}
     */
    public function energyStatus(): array
    {
        ['current' => $current, 'refillingSince' => $since] = Energy::at($this->energy, $this->energy_updated_at);

        return [
            'current' => $current,
            'max' => Energy::max(),
            'nextAt' => $since?->addSeconds(Energy::intervalSeconds())->getTimestampMs(),
            'intervalMs' => Energy::intervalSeconds() * 1000,
        ];
    }

    /** A player counts as online if their app pinged within this window (it pings every 30s). */
    public const ONLINE_WINDOW_SECONDS = 120;

    /** Skip the write when the last ping was this recent. */
    private const SEEN_WRITE_INTERVAL_SECONDS = 20;

    /**
     * Record that the player has the app open.
     */
    public function markSeen(): void
    {
        if ($this->last_seen_at === null || $this->last_seen_at->lt(now()->subSeconds(self::SEEN_WRITE_INTERVAL_SECONDS))) {
            $this->forceFill(['last_seen_at' => now()])->save();
        }
    }

    /**
     * Verified players (the only ones who can play) seen recently.
     *
     * @param  Builder<User>  $query
     */
    public function scopeOnline(Builder $query): void
    {
        $query->whereNotNull('email_verified_at')
            ->whereNull('banned_at')
            ->where('last_seen_at', '>=', now()->subSeconds(self::ONLINE_WINDOW_SECONDS));
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
            'accepts_invites' => 'boolean',
            'last_seen_at' => 'datetime',
            'energy_updated_at' => 'datetime',
            'is_admin' => 'boolean',
            'banned_at' => 'datetime',
            'bot_paused_at' => 'datetime',
            'autopilot' => 'boolean',
        ];
    }
}
