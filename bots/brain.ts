import type { Game } from '../resources/js/tetris/engine';
import {
    BOARD_HEIGHT,
    BOARD_WIDTH,
    EMPTY,
    SHAPES,
} from '../resources/js/tetris/pieces';
import type { Cell, PieceType, Rotation } from '../resources/js/tetris/pieces';

/** How a bot plays (App\Support\Bots::ROSTER). */
export type BotStyle = {
    /** Pieces per second it aims for. */
    pps: number;
    /** Chance of taking a worse placement than the best it found. */
    mistakes: number;
    /** Whether it uses hold. */
    hold: boolean;
    /** Keeps the right-hand column open for Tetrises. */
    well: boolean;
    /** How often it emotes, 0–1. */
    chatty: number;
    /** Chance it accepts an invite. */
    invites: number;
};

/** Where to put the current piece: optionally swap with hold first, then rotate and slide. */
export type Plan = { hold: boolean; rotation: Rotation; x: number };

type Board = Cell[][];

const WELL = BOARD_WIDTH - 1;
const ROTATIONS: Rotation[] = [0, 1, 2, 3];

/**
 * Pick a placement for the falling piece: try every rotation and column (and the hold
 * piece, for bots that use hold), score the board each would leave, and take the best,
 * or sometimes a near miss, the way a person misjudges.
 */
export function planMove(
    game: Game,
    style: BotStyle,
    random: () => number,
): Plan | null {
    const active = game.active;

    if (!active) {
        return null;
    }

    const options: { plan: Plan; score: number }[] = [];
    const consider = (type: PieceType, hold: boolean) => {
        const seen = new Set<string>();

        for (const rotation of ROTATIONS) {
            // O and the symmetric pieces repeat shapes; skip duplicates.
            const key = SHAPES[type][rotation]
                .map(([x, y]) => `${x},${y}`)
                .sort()
                .join('|');

            for (let x = -3; x < BOARD_WIDTH + 2; x++) {
                const y = dropY(game.board, type, rotation, x, active.y);

                if (y === null || seen.has(`${key}@${x}:${y}`)) {
                    continue;
                }

                seen.add(`${key}@${x}:${y}`);
                options.push({
                    plan: { hold, rotation, x },
                    score: evaluate(
                        place(game.board, type, rotation, x, y),
                        style,
                    ),
                });
            }
        }
    };

    consider(active.type, false);

    if (style.hold && !game.holdUsed) {
        consider(game.hold ?? game.nextPieces[0], true);
    }

    if (options.length === 0) {
        return null;
    }

    options.sort((a, b) => b.score - a.score);

    if (random() < style.mistakes) {
        // A near miss: one of the next few best, rarely something worse.
        const pool = random() < 0.15 ? options.length : 4;
        const pick =
            1 + Math.floor(random() * Math.min(pool, options.length - 1));

        return options[Math.min(pick, options.length - 1)].plan;
    }

    return options[0].plan;
}

function fits(
    board: Board,
    type: PieceType,
    rotation: Rotation,
    px: number,
    py: number,
): boolean {
    return SHAPES[type][rotation].every(([cx, cy]) => {
        const x = px + cx;
        const y = py + cy;

        return (
            x >= 0 &&
            x < BOARD_WIDTH &&
            y >= 0 &&
            y < BOARD_HEIGHT &&
            board[y][x] === EMPTY
        );
    });
}

/** Where the piece would land dropped straight down from row startY, or null if it can't go there. */
function dropY(
    board: Board,
    type: PieceType,
    rotation: Rotation,
    x: number,
    startY: number,
): number | null {
    if (!fits(board, type, rotation, x, startY)) {
        return null;
    }

    let y = startY;

    while (fits(board, type, rotation, x, y + 1)) {
        y++;
    }

    return y;
}

type Placement = {
    board: Board;
    cleared: number;
    /** Height the piece landed at (rows from the floor to its middle). */
    landingHeight: number;
    /** Lines cleared × the piece's own cells that went with them. */
    eroded: number;
};

function place(
    board: Board,
    type: PieceType,
    rotation: Rotation,
    px: number,
    py: number,
): Placement {
    const next = board.map((row) => row.slice());
    const cells = SHAPES[type][rotation].map(([cx, cy]) => [px + cx, py + cy]);

    for (const [x, y] of cells) {
        next[y][x] = 1;
    }

    const full = new Set<number>();
    next.forEach((row, y) => {
        if (row.every((cell) => cell !== EMPTY)) {
            full.add(y);
        }
    });

    const kept = next.filter((_, y) => !full.has(y));

    while (kept.length < BOARD_HEIGHT) {
        kept.unshift(Array.from({ length: BOARD_WIDTH }, () => EMPTY));
    }

    const ys = cells.map(([, y]) => y);

    return {
        board: kept,
        cleared: full.size,
        landingHeight: BOARD_HEIGHT - (Math.min(...ys) + Math.max(...ys)) / 2,
        eroded: full.size * cells.filter(([, y]) => full.has(y)).length,
    };
}

/**
 * Score a placement with the El-Tetris features (landing height, eroded cells, row and
 * column transitions, holes, wells): it keeps the stack low, flat and hole-free. Bots that
 * keep a well leave the right column open and hold out for Tetrises while it's safe.
 */
function evaluate(placement: Placement, style: BotStyle): number {
    const { board, cleared, landingHeight, eroded } = placement;
    const filled = (x: number, y: number) =>
        x < 0 || x >= BOARD_WIDTH || y >= BOARD_HEIGHT || board[y][x] !== EMPTY;

    let rowTransitions = 0;
    let columnTransitions = 0;
    let holes = 0;
    let wells = 0;
    let top = BOARD_HEIGHT;

    for (let y = 0; y < BOARD_HEIGHT; y++) {
        for (let x = 0; x <= BOARD_WIDTH; x++) {
            if (filled(x - 1, y) !== filled(x, y)) {
                rowTransitions++;
            }
        }
    }

    for (let x = 0; x < BOARD_WIDTH; x++) {
        let covered = false;
        let well = 0;

        for (let y = 0; y < BOARD_HEIGHT; y++) {
            const here = filled(x, y);

            if (y > 0 && filled(x, y - 1) !== here) {
                columnTransitions++;
            }

            if (here) {
                covered = true;
                top = Math.min(top, y);
            } else if (covered) {
                holes++;
            }

            // Empty with both sides filled: part of a well, deeper cells cost more.
            const skipWell = style.well && x === WELL;

            if (!here && !skipWell && filled(x - 1, y) && filled(x + 1, y)) {
                well++;
                wells += well;
            } else {
                well = 0;
            }
        }

        if (!filled(x, BOARD_HEIGHT - 1)) {
            columnTransitions++;
        }
    }

    const stack = BOARD_HEIGHT - top;
    let score =
        -4.5 * landingHeight +
        3.42 * eroded -
        3.22 * rowTransitions -
        9.35 * columnTransitions -
        7.9 * holes -
        3.39 * wells;

    if (style.well && stack < 12) {
        // Save lines up for a Tetris, and keep blocks out of the well.
        let inWell = 0;

        for (let y = 0; y < BOARD_HEIGHT; y++) {
            if (board[y][WELL] !== EMPTY) {
                inWell++;
            }
        }

        score += cleared === 4 ? 60 : -6 * cleared;
        score -= 12 * inWell;
    }

    return score;
}
