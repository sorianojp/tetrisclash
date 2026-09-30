import { ReplayRecorder, encodeReplay } from '../resources/js/tetris/replay';
import type { ClearInfo } from '../resources/js/tetris/engine';
import type { BotStyle } from './brain';
import { BotPlayer } from './player';

/** The practice modes, with the same rules as resources/js/pages/practice.tsx. */
export type PracticeMode = 'sprint' | 'ultra' | 'dig' | 'survival' | 'zen';

export type PracticeResult = {
    mode: PracticeMode;
    /** Time (ms) or score, as the record board keeps it for that mode. */
    value: number;
    /** How long the run took, so the runner can wait that long before "finishing" it. */
    durationMs: number;
    replay: string | null;
};

const SPRINT_LINES = 40;
const ULTRA_MS = 120_000;
const DIG_ROWS = 10;
const SURVIVAL_FIRST_ATTACK_MS = 5000;
/** Runs that go on longer than this are abandoned, like a player walking away. */
const GIVE_UP_MS = 20 * 60 * 1000;
const TICK_MS = 33;

const survivalGap = (elapsed: number) => Math.max(1500, 6000 - elapsed / 30);
const survivalAttack = (elapsed: number) =>
    1 + Math.floor(Math.random() * Math.min(4, 1 + elapsed / 40_000));

/**
 * Play one practice run on a simulated clock (it takes a moment, not the run's real length),
 * recording it like the practice page does. Null when the run doesn't count, e.g. topping
 * out before finishing 40 Lines.
 */
export async function playPractice(
    mode: PracticeMode,
    style: BotStyle,
    onClear: (info: ClearInfo) => void,
): Promise<PracticeResult | null> {
    let outcome: 'cleared' | 'timeUp' | 'toppedOut' | null = null;

    const player = new BotPlayer(
        {
            seed: Math.floor(Math.random() * 2 ** 31),
            startingGarbage: mode === 'dig' ? DIG_ROWS : 0,
            timeLimitMs: mode === 'ultra' ? ULTRA_MS : undefined,
            gravity:
                mode === 'zen'
                    ? (elapsed) => Math.max(80, 1000 - elapsed / 150)
                    : mode === 'survival'
                      ? (elapsed) => Math.max(150, 1000 - elapsed / 250)
                      : undefined,
            events: {
                onClear: (info) => {
                    onClear(info);

                    if (mode === 'sprint' && game.stats.lines >= SPRINT_LINES) {
                        outcome = 'cleared';
                    }
                },
                onLock: () => {
                    if (mode === 'dig' && game.garbageRows === 0) {
                        outcome = 'cleared';
                    }
                },
                onTimeUp: () => (outcome = 'timeUp'),
                onTopOut: () => (outcome = 'toppedOut'),
            },
        },
        // Digging means going after the garbage holes, not saving a well for Tetrises.
        mode === 'dig' ? { ...style, well: false } : style,
    );
    const game = player.game;
    const recorder = new ReplayRecorder();
    let nextAttackAt = SURVIVAL_FIRST_ATTACK_MS;
    let ticks = 0;

    while (outcome === null && game.elapsedMs < GIVE_UP_MS) {
        game.update(TICK_MS, false);
        player.act(game.elapsedMs);

        if (mode === 'survival' && game.elapsedMs >= nextAttackAt) {
            game.receiveGarbage(survivalAttack(game.elapsedMs));
            nextAttackAt += survivalGap(game.elapsedMs);
        }

        recorder.capture(
            game.elapsedMs,
            game.snapshot(),
            game.pendingGarbageTotal,
            game.stats.linesSent,
            game.stats.lines,
        );

        // Let live duels in the same process keep their timing.
        if (++ticks % 500 === 0) {
            await new Promise((resolve) => setImmediate(resolve));
        }
    }

    const value = recordValue(mode, outcome, game.elapsedMs, game.stats.score);

    if (value === null) {
        return null;
    }

    recorder.capture(
        game.elapsedMs,
        game.snapshot(),
        game.pendingGarbageTotal,
        game.stats.linesSent,
        game.stats.lines,
        true,
    );

    return {
        mode,
        value,
        durationMs: game.elapsedMs,
        replay: await encodeReplay(recorder.frames).catch(() => null),
    };
}

/** The value a finished run puts on the record board, if it counts (as on the practice page). */
function recordValue(
    mode: PracticeMode,
    outcome: 'cleared' | 'timeUp' | 'toppedOut' | null,
    timeMs: number,
    score: number,
): number | null {
    if (outcome === null) {
        return null;
    }

    if ((mode === 'sprint' || mode === 'dig') && outcome === 'cleared') {
        return Math.round(timeMs);
    }

    if (mode === 'ultra' && outcome === 'timeUp') {
        return score;
    }

    if (mode === 'survival') {
        return Math.round(timeMs);
    }

    return mode === 'zen' ? score : null;
}
