<?php

use App\Support\Ranks;

test('everyone starts at rank 1 as a Pebble', function () {
    expect(Ranks::progress(0))->toBe([
        'rank' => 1,
        'title' => 'Pebble',
        'xp' => 0,
        'xpIntoRank' => 0,
        'xpForNext' => 52,
    ]);
});

test('each rank step costs 40 + 12 per rank', function () {
    expect(Ranks::xpToReach(1))->toBe(0)
        ->and(Ranks::xpToReach(2))->toBe(52)
        ->and(Ranks::xpToReach(3))->toBe(52 + 64)
        ->and(Ranks::rankFor(51))->toBe(1)
        ->and(Ranks::rankFor(52))->toBe(2)
        ->and(Ranks::rankFor(Ranks::xpToReach(26)))->toBe(26)
        ->and(Ranks::rankFor(Ranks::xpToReach(26) - 1))->toBe(25);
});

test('titles follow the rank bands', function (int $rank, string $title) {
    expect(Ranks::titleFor($rank))->toBe($title);
})->with([
    [1, 'Pebble'],
    [5, 'Pebble'],
    [6, 'Brick'],
    [25, 'Block Smith'],
    [26, 'Combo Crafter'],
    [50, 'Quad Striker'],
    [51, 'Garbage Crusher'],
    [76, 'Well Warden'],
    [100, 'Nova'],
    [105, 'Eclipse'],
    [109, 'Ascendant'],
    [110, 'Clash Sovereign'],
]);

test('rank caps at 110', function () {
    $progress = Ranks::progress(Ranks::xpToReach(110) + 50_000);

    expect($progress['rank'])->toBe(110)
        ->and($progress['title'])->toBe('Clash Sovereign')
        ->and($progress['xpForNext'])->toBeNull();
});

test('duel xp rewards results and KOs but not quitting', function () {
    expect(Ranks::xpForDuel('win', 3, false))->toBe(130)
        ->and(Ranks::xpForDuel('draw', 1, false))->toBe(70)
        ->and(Ranks::xpForDuel('loss', 2, false))->toBe(60)
        ->and(Ranks::xpForDuel('loss', 2, true))->toBe(0);
});

test('the ladder covers every rank once, in order', function () {
    $ladder = Ranks::ladder();

    expect($ladder[0]['from'])->toBe(1)
        ->and(end($ladder)['to'])->toBe(Ranks::MAX_RANK)
        ->and(end($ladder)['title'])->toBe('Clash Sovereign');

    foreach (array_slice($ladder, 1) as $i => $band) {
        expect($band['from'])->toBe($ladder[$i]['to'] + 1)
            ->and($band['xp'])->toBe(Ranks::xpToReach($band['from']));
    }
});
