<?php

namespace App\Models;

use App\Events\DuelFound;
use App\Events\InviteClosed;
use Carbon\CarbonImmutable;
use Database\Factories\ChallengeFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * An unranked duel waiting for an opponent: a shareable link anyone can accept, or an
 * invite sent to one online player (invitee_id), which only they can accept.
 *
 * @property int $id
 * @property string $code
 * @property int $challenger_id
 * @property int|null $invitee_id
 * @property string $mode
 * @property int|null $duel_id
 * @property CarbonImmutable $expires_at
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 * @property-read User $challenger
 * @property-read User|null $invitee
 */
#[Fillable(['code', 'challenger_id', 'invitee_id', 'mode', 'duel_id', 'expires_at'])]
class Challenge extends Model
{
    /** @use HasFactory<ChallengeFactory> */
    use HasFactory;

    public const LIFETIME_MINUTES = 15;

    /** Invites need an answer while the challenger waits, so they close much sooner than links. */
    public const INVITE_LIFETIME_SECONDS = 60;

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
     * Open a fresh challenge (an invite when there's an invitee), replacing any the player still has open.
     */
    public static function open(User $challenger, string $mode, ?User $invitee = null): self
    {
        self::query()
            ->where('challenger_id', $challenger->id)
            ->whereNull('duel_id')
            ->get()
            ->each(fn (self $old) => $old->withdraw());

        return self::create([
            'code' => Str::lower(Str::random(10)),
            'challenger_id' => $challenger->id,
            'invitee_id' => $invitee?->id,
            'mode' => $mode,
            'expires_at' => $invitee
                ? now()->addSeconds(self::INVITE_LIFETIME_SECONDS)
                : now()->addMinutes(self::LIFETIME_MINUTES),
        ]);
    }

    /**
     * Take back an unaccepted challenge, clearing a pending invite from the invitee's screen.
     */
    public function withdraw(): void
    {
        $this->delete();

        if ($this->invitee_id !== null && ! $this->isExpired()) {
            InviteClosed::dispatch($this->invitee_id, $this->code, InviteClosed::CANCELLED);
        }
    }

    /**
     * Accept on behalf of a player and start the friendly duel. Null when it's too late
     * (accepted, expired, or either player is already in a match).
     */
    public function accept(User $user): ?Duel
    {
        $duel = DB::transaction(function () use ($user) {
            $challenge = self::query()->lockForUpdate()->findOrFail($this->id);

            abort_unless($challenge->canBeAcceptedBy($user), 403, 'You cannot accept this challenge.');

            if ($challenge->isAccepted() || $challenge->isExpired()) {
                return null;
            }

            $challenger = User::query()->findOrFail($challenge->challenger_id);

            if (Duel::activeFor($user) || Duel::activeFor($challenger)) {
                return null;
            }

            User::query()->whereKey([$user->id, $challenger->id])->update(['queued_at' => null, 'searching_since' => null]);

            $duel = Duel::start($challenger, $user, $challenge->mode, ranked: false);
            $challenge->update(['duel_id' => $duel->id]);

            return $duel;
        });

        if ($duel !== null) {
            $this->duel_id = $duel->id;
            DuelFound::dispatch($duel);
        }

        return $duel;
    }

    /**
     * The invited player turns it down.
     */
    public function decline(): void
    {
        if (! $this->isAccepted()) {
            $this->delete();
            InviteClosed::dispatch($this->challenger_id, $this->code, InviteClosed::DECLINED);
        }
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function challenger(): BelongsTo
    {
        return $this->belongsTo(User::class, 'challenger_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function invitee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invitee_id');
    }

    public function isInvite(): bool
    {
        return $this->invitee_id !== null;
    }

    /**
     * Anyone can accept a link; only the invited player can accept an invite.
     */
    public function canBeAcceptedBy(User $user): bool
    {
        return $this->challenger_id !== $user->id && (! $this->isInvite() || $this->invitee_id === $user->id);
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
