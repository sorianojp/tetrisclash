<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One bracket slot: round 1 is the quarterfinals, round 3 the final. Its winner moves to
 * position ⌊position / 2⌋ of the next round.
 *
 * @property int $id
 * @property int $tournament_id
 * @property int $round
 * @property int $position
 * @property int|null $player_one_id
 * @property int|null $player_two_id
 * @property int|null $duel_id
 * @property int|null $winner_id
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 * @property-read Tournament $tournament
 * @property-read Duel|null $duel
 */
#[Fillable(['tournament_id', 'round', 'position', 'player_one_id', 'player_two_id', 'duel_id', 'winner_id'])]
class TournamentMatch extends Model
{
    /**
     * @return BelongsTo<Tournament, $this>
     */
    public function tournament(): BelongsTo
    {
        return $this->belongsTo(Tournament::class);
    }

    /**
     * @return BelongsTo<Duel, $this>
     */
    public function duel(): BelongsTo
    {
        return $this->belongsTo(Duel::class);
    }

    public function isReady(): bool
    {
        return $this->player_one_id !== null && $this->player_two_id !== null
            && $this->duel_id === null && $this->winner_id === null;
    }
}
