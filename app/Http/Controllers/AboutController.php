<?php

namespace App\Http\Controllers;

use App\Models\Challenge;
use App\Models\Duel;
use App\Support\Ranks;
use Inertia\Inertia;
use Inertia\Response;

class AboutController extends Controller
{
    /**
     * The public "how the game works" page. Numbers come from the game's own rules so the
     * page never drifts out of date.
     */
    public function __invoke(): Response
    {
        return Inertia::render('about', [
            'rules' => [
                'battleSeconds' => Duel::DURATION_SECONDS,
                'kosToWin' => Duel::KOS_TO_WIN,
                'raceLines' => Duel::RACE_LINES,
                'raceSeconds' => Duel::RACE_DURATION_SECONDS,
                'ratingK' => Duel::RATING_K,
                'challengeMinutes' => Challenge::LIFETIME_MINUTES,
                'ratingRangeStart' => MatchmakingController::RATING_RANGE_START,
                'ratingRangeGrowth' => MatchmakingController::RATING_RANGE_GROWTH_PER_SECOND,
                'anyOpponentAfter' => MatchmakingController::ANY_OPPONENT_AFTER_SECONDS,
            ],
            'xp' => [
                'win' => Ranks::XP_WIN,
                'draw' => Ranks::XP_DRAW,
                'loss' => Ranks::XP_LOSS,
                'perKo' => Ranks::XP_PER_KO,
            ],
            'ranks' => Ranks::ladder(),
        ])->withViewData(['meta' => [
            'title' => 'How '.config('app.name').' works: rules, ranks and rating',
        ]]);
    }
}
