import {
    BOARD_HEIGHT,
    BOARD_WIDTH,
    CELL_OF,
    EMPTY,
    GARBAGE,
    HIDDEN_ROWS,
    PIECE_TYPES,
    SHAPES,
    SPAWN_X,
    kicksFor,
} from './pieces';
import type { Cell, PieceType, Rotation } from './pieces';

export type ActivePiece = {
    type: PieceType;
    x: number;
    y: number;
    rotation: Rotation;
};

export type TSpin = 'none' | 'mini' | 'full';

export type ClearInfo = {
    lines: number;
    tSpin: TSpin;
    /** Consecutive line-clearing pieces, 0 for the first clear in a chain. */
    combo: number;
    backToBack: boolean;
    perfectClear: boolean;
    /** Attack generated before cancelling incoming garbage. */
    attack: number;
};

export type GameStats = {
    lines: number;
    pieces: number;
    linesSent: number;
    score: number;
};

/** A row removed by a line clear, in visible-field coordinates. */
export type ClearedRow = { y: number; cells: Cell[] };

/**
 * Purely cosmetic notifications for the effects layer. Coordinates are in
 * visible-field cells (y may be negative for cells above the field).
 */
export type VisualEvent =
    | {
          kind: 'hardDrop';
          cells: [number, number][];
          distance: number;
          value: Cell;
      }
    | { kind: 'lock'; cells: [number, number][]; value: Cell }
    | { kind: 'clear'; rows: ClearedRow[]; info: ClearInfo }
    | { kind: 'garbageRise'; lines: number }
    | { kind: 'incoming'; lines: number }
    | { kind: 'topOut'; board: Cell[][] };

export type GameEvents = {
    /** Garbage to send to the opponent, after cancelling our own incoming lines. */
    onAttack?: (lines: number) => void;
    onClear?: (info: ClearInfo) => void;
    onLock?: () => void;
    onTopOut?: () => void;
    /** The game's time limit ran out. */
    onTimeUp?: () => void;
    onVisual?: (event: VisualEvent) => void;
};

export type GameOptions = {
    seed: number;
    /** Milliseconds per row of gravity; may change over time. */
    gravity?: (elapsedMs: number) => number;
    events?: GameEvents;
    /** Rows of messy garbage (a different hole each row) to start with. */
    startingGarbage?: number;
    /** Stop the game once this much play time has passed. */
    timeLimitMs?: number;
};

const LOCK_DELAY_MS = 500;
const MAX_LOCK_RESETS = 15;
const SOFT_DROP_FACTOR = 20;
const NEXT_PREVIEW = 5;

/** Attack table: garbage lines sent, indexed by lines cleared (or combo count). */
export const LINE_ATTACK = [0, 0, 1, 2, 4];
export const TSPIN_ATTACK = [0, 2, 4, 6];
export const TSPIN_MINI_ATTACK = [0, 0, 1];
export const COMBO_ATTACK = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
export const PERFECT_CLEAR_ATTACK = 10;
export const BACK_TO_BACK_BONUS = 1;

const filledRow = (value: Cell): Cell[] =>
    Array.from({ length: BOARD_WIDTH }, () => value);

/** Deterministic PRNG so both duel players get the same piece order. */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;

    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class Game {
    board: Cell[][] = [];
    active: ActivePiece | null = null;
    hold: PieceType | null = null;
    holdUsed = false;
    queue: PieceType[] = [];
    /** Incoming garbage waiting to rise, one entry per attack. */
    pendingGarbage: number[] = [];
    stats: GameStats = { lines: 0, pieces: 0, linesSent: 0, score: 0 };
    combo = -1;
    backToBack = false;
    toppedOut = false;
    timeUp = false;
    paused = false;
    elapsedMs = 0;

    private readonly random: () => number;
    private readonly gravity: (elapsedMs: number) => number;
    private readonly events: GameEvents;
    private readonly timeLimitMs: number | null;
    private fallTimer = 0;
    private lockTimer = 0;
    private lockResets = 0;
    private lowestY = 0;
    private lastActionWasRotation = false;
    private lastKickIndex = 0;

    constructor(options: GameOptions) {
        this.random = mulberry32(options.seed);
        this.gravity = options.gravity ?? (() => 1000);
        this.events = options.events ?? {};
        this.timeLimitMs = options.timeLimitMs ?? null;
        this.board = this.emptyBoard();
        this.addMessyGarbage(options.startingGarbage ?? 0);
        this.spawn();
    }

    get pendingGarbageTotal(): number {
        return this.pendingGarbage.reduce((sum, lines) => sum + lines, 0);
    }

    /** Rows on the board that still contain garbage. */
    get garbageRows(): number {
        return this.board.filter((row) => row.includes(GARBAGE)).length;
    }

    get nextPieces(): PieceType[] {
        this.fillQueue();

        return this.queue.slice(0, NEXT_PREVIEW);
    }

    // ---- Player actions -------------------------------------------------

    move(dx: number): boolean {
        if (
            !this.canAct() ||
            !this.tryPlace(this.active!.x + dx, this.active!.y)
        ) {
            return false;
        }

        this.afterSuccessfulMove(false);

        return true;
    }

    rotate(direction: 1 | -1): boolean {
        if (!this.canAct()) {
            return false;
        }

        const piece = this.active!;
        const to = ((piece.rotation + direction + 4) % 4) as Rotation;
        const kicks = kicksFor(piece.type, piece.rotation, to);

        for (let i = 0; i < kicks.length; i++) {
            const [dx, dy] = kicks[i];

            if (this.fits(piece.type, to, piece.x + dx, piece.y + dy)) {
                piece.x += dx;
                piece.y += dy;
                piece.rotation = to;
                this.lastKickIndex = i;
                this.afterSuccessfulMove(true);

                return true;
            }
        }

        return false;
    }

    /** Move down one row; returns false when the piece is resting on something. */
    softDropStep(): boolean {
        if (
            !this.canAct() ||
            !this.tryPlace(this.active!.x, this.active!.y + 1)
        ) {
            return false;
        }

        this.stats.score += 1;
        this.lastActionWasRotation = false;
        this.trackLowest();

        return true;
    }

    hardDrop(): void {
        if (!this.canAct()) {
            return;
        }

        const distance = this.ghostY() - this.active!.y;

        if (distance > 0) {
            this.active!.y += distance;
            this.lastActionWasRotation = false;
        }

        this.events.onVisual?.({
            kind: 'hardDrop',
            cells: this.visibleCells(this.active!),
            distance,
            value: CELL_OF[this.active!.type],
        });

        this.stats.score += distance * 2;
        this.lock();
    }

    holdPiece(): void {
        if (!this.canAct() || this.holdUsed) {
            return;
        }

        const current = this.active!.type;
        const next = this.hold;
        this.hold = current;
        this.holdUsed = true;
        this.spawn(next ?? undefined);
    }

    // ---- Simulation ------------------------------------------------------

    /** Advance the game clock. */
    update(dt: number, softDropping: boolean): void {
        if (this.paused || this.toppedOut || this.timeUp || !this.active) {
            return;
        }

        this.elapsedMs += dt;

        if (this.timeLimitMs !== null && this.elapsedMs >= this.timeLimitMs) {
            this.elapsedMs = this.timeLimitMs;
            this.timeUp = true;
            this.events.onTimeUp?.();

            return;
        }

        const interval =
            this.gravity(this.elapsedMs) /
            (softDropping ? SOFT_DROP_FACTOR : 1);
        this.fallTimer += dt;

        while (this.fallTimer >= interval) {
            this.fallTimer -= interval;

            if (!this.tryPlace(this.active.x, this.active.y + 1)) {
                this.fallTimer = 0;
                break;
            }

            this.lastActionWasRotation = false;
            this.trackLowest();

            if (softDropping) {
                this.stats.score += 1;
            }
        }

        if (this.isGrounded()) {
            this.lockTimer += dt;

            if (this.lockTimer >= LOCK_DELAY_MS) {
                this.lock();
            }
        } else {
            this.lockTimer = 0;
        }
    }

    receiveGarbage(lines: number): void {
        if (lines > 0) {
            this.pendingGarbage.push(lines);
            this.events.onVisual?.({ kind: 'incoming', lines });
        }
    }

    /** After a KO: wipe the field and incoming garbage but keep the piece sequence. */
    clearAfterKnockOut(): void {
        this.board = this.emptyBoard();
        this.pendingGarbage = [];
        this.combo = -1;
        this.backToBack = false;
        this.toppedOut = false;
        this.holdUsed = false;
        this.spawn();
    }

    ghostY(): number {
        const piece = this.active!;
        let y = piece.y;

        while (this.fits(piece.type, piece.rotation, piece.x, y + 1)) {
            y++;
        }

        return y;
    }

    cellsOf(piece: ActivePiece): [number, number][] {
        return SHAPES[piece.type][piece.rotation].map(([x, y]) => [
            piece.x + x,
            piece.y + y,
        ]);
    }

    /** A piece's cells translated into visible-field coordinates. */
    visibleCells(piece: ActivePiece): [number, number][] {
        return this.cellsOf(piece).map(([x, y]) => [x, y - HIDDEN_ROWS]);
    }

    /**
     * Compact visible-field snapshot (with the falling piece drawn in) for the
     * opponent's view: one character per cell.
     */
    snapshot(): string {
        const rows = this.board.slice(HIDDEN_ROWS).map((row) => row.slice());

        if (this.active) {
            for (const [x, y] of this.cellsOf(this.active)) {
                if (y >= HIDDEN_ROWS) {
                    rows[y - HIDDEN_ROWS][x] = CELL_OF[this.active.type];
                }
            }
        }

        return rows.map((row) => row.join('')).join('');
    }

    // ---- Internals -------------------------------------------------------

    private emptyBoard(): Cell[][] {
        return Array.from({ length: BOARD_HEIGHT }, () => filledRow(EMPTY));
    }

    private canAct(): boolean {
        return (
            !this.paused &&
            !this.toppedOut &&
            !this.timeUp &&
            this.active !== null
        );
    }

    /** Fill the bottom of the board with garbage rows, never repeating a hole column twice in a row. */
    private addMessyGarbage(lines: number): void {
        let hole = -1;

        for (let i = 0; i < lines; i++) {
            let next = Math.floor(
                Math.random() * (hole < 0 ? BOARD_WIDTH : BOARD_WIDTH - 1),
            );

            if (hole >= 0 && next >= hole) {
                next++;
            }

            hole = next;
            const row = filledRow(GARBAGE);
            row[hole] = EMPTY;
            this.board.shift();
            this.board.push(row);
        }
    }

    private fillQueue(): void {
        while (this.queue.length < NEXT_PREVIEW + 1) {
            const bag = [...PIECE_TYPES];

            for (let i = bag.length - 1; i > 0; i--) {
                const j = Math.floor(this.random() * (i + 1));
                [bag[i], bag[j]] = [bag[j], bag[i]];
            }

            this.queue.push(...bag);
        }
    }

    private spawn(type?: PieceType): void {
        this.fillQueue();

        const next = type ?? this.queue.shift()!;
        const piece: ActivePiece = {
            type: next,
            x: SPAWN_X[next],
            y: HIDDEN_ROWS - 2,
            rotation: 0,
        };

        this.active = piece;
        this.fallTimer = 0;
        this.lockTimer = 0;
        this.lockResets = 0;
        this.lastActionWasRotation = false;

        if (!this.fits(piece.type, piece.rotation, piece.x, piece.y)) {
            this.topOut();

            return;
        }

        // Guideline: drop straight into the visible field when there's room.
        if (this.fits(piece.type, piece.rotation, piece.x, piece.y + 1)) {
            piece.y++;
        }

        this.lowestY = piece.y;
    }

    private fits(
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
                this.board[y][x] === EMPTY
            );
        });
    }

    private tryPlace(x: number, y: number): boolean {
        const piece = this.active!;

        if (!this.fits(piece.type, piece.rotation, x, y)) {
            return false;
        }

        piece.x = x;
        piece.y = y;

        return true;
    }

    private isGrounded(): boolean {
        const piece = this.active!;

        return !this.fits(piece.type, piece.rotation, piece.x, piece.y + 1);
    }

    private trackLowest(): void {
        if (this.active!.y > this.lowestY) {
            this.lowestY = this.active!.y;
            this.lockResets = 0;
        }
    }

    /** Move-reset lock delay, capped so pieces can't be stalled forever. */
    private afterSuccessfulMove(rotation: boolean): void {
        this.lastActionWasRotation = rotation;
        this.trackLowest();

        if (this.lockResets < MAX_LOCK_RESETS) {
            this.lockTimer = 0;

            if (this.isGrounded()) {
                this.lockResets++;
            }
        }
    }

    private detectTSpin(): TSpin {
        const piece = this.active!;

        if (piece.type !== 'T' || !this.lastActionWasRotation) {
            return 'none';
        }

        const filled = (dx: number, dy: number) => {
            const x = piece.x + dx;
            const y = piece.y + dy;

            return (
                x < 0 ||
                x >= BOARD_WIDTH ||
                y >= BOARD_HEIGHT ||
                (y >= 0 && this.board[y][x] !== EMPTY)
            );
        };

        // Corners of the T's 3x3 box, in order: top-left, top-right, bottom-right, bottom-left.
        const corners = [
            filled(0, 0),
            filled(2, 0),
            filled(2, 2),
            filled(0, 2),
        ];

        if (corners.filter(Boolean).length < 3) {
            return 'none';
        }

        // The two corners either side of the T's pointing direction.
        const front = [
            [0, 1],
            [1, 2],
            [2, 3],
            [3, 0],
        ][piece.rotation];
        const frontFilled = front.every((i) => corners[i]);

        return frontFilled || this.lastKickIndex === 4 ? 'full' : 'mini';
    }

    private lock(): void {
        const piece = this.active!;
        const tSpin = this.detectTSpin();
        const cells = this.cellsOf(piece);

        for (const [x, y] of cells) {
            this.board[y][x] = CELL_OF[piece.type];
        }

        this.events.onVisual?.({
            kind: 'lock',
            cells: this.visibleCells(piece),
            value: CELL_OF[piece.type],
        });

        this.active = null;
        this.stats.pieces++;
        this.holdUsed = false;

        // Lock out: the whole piece settled above the visible field.
        if (cells.every(([, y]) => y < HIDDEN_ROWS)) {
            this.topOut();

            return;
        }

        const cleared = this.clearLines();
        this.scoreClear(cleared.length, tSpin, cleared);

        if (cleared.length === 0) {
            this.riseGarbage();
        }

        this.events.onLock?.();

        if (!this.toppedOut) {
            this.spawn();
        }
    }

    private clearLines(): ClearedRow[] {
        const cleared: ClearedRow[] = [];
        const remaining = this.board.filter((row, y) => {
            const full = row.every((cell) => cell !== EMPTY);

            if (full) {
                cleared.push({ y: y - HIDDEN_ROWS, cells: row });
            }

            return !full;
        });

        for (let i = 0; i < cleared.length; i++) {
            remaining.unshift(filledRow(EMPTY));
        }

        this.board = remaining;

        return cleared;
    }

    private scoreClear(
        lines: number,
        tSpin: TSpin,
        rows: ClearedRow[] = [],
    ): void {
        if (lines === 0) {
            this.combo = -1;

            return;
        }

        this.combo++;
        this.stats.lines += lines;

        const difficult = lines === 4 || tSpin !== 'none';
        const backToBack = difficult && this.backToBack;
        this.backToBack = difficult;

        let attack =
            tSpin === 'full'
                ? TSPIN_ATTACK[lines]
                : tSpin === 'mini'
                  ? (TSPIN_MINI_ATTACK[lines] ?? 0)
                  : LINE_ATTACK[lines];

        if (backToBack) {
            attack += BACK_TO_BACK_BONUS;
        }

        attack += COMBO_ATTACK[Math.min(this.combo, COMBO_ATTACK.length - 1)];

        const perfectClear = this.board.every((row) =>
            row.every((cell) => cell === EMPTY),
        );

        if (perfectClear) {
            attack += PERFECT_CLEAR_ATTACK;
        }

        this.stats.score +=
            [0, 100, 300, 500, 800][lines] * (tSpin === 'full' ? 2 : 1) +
            50 * this.combo;
        this.stats.linesSent += attack;

        const info: ClearInfo = {
            lines,
            tSpin,
            combo: this.combo,
            backToBack,
            perfectClear,
            attack,
        };
        this.events.onClear?.(info);
        this.events.onVisual?.({ kind: 'clear', rows, info });

        // Our attack cancels incoming garbage first; only the rest reaches the opponent.
        let outgoing = attack;

        while (outgoing > 0 && this.pendingGarbage.length > 0) {
            const blocked = Math.min(outgoing, this.pendingGarbage[0]);
            outgoing -= blocked;
            this.pendingGarbage[0] -= blocked;

            if (this.pendingGarbage[0] === 0) {
                this.pendingGarbage.shift();
            }
        }

        if (outgoing > 0) {
            this.events.onAttack?.(outgoing);
        }
    }

    private riseGarbage(): void {
        const total = this.pendingGarbageTotal;

        if (total > 0) {
            this.events.onVisual?.({ kind: 'garbageRise', lines: total });
        }

        for (const lines of this.pendingGarbage.splice(0)) {
            const hole = Math.floor(Math.random() * BOARD_WIDTH);

            for (let i = 0; i < lines; i++) {
                const pushedOut = this.board.shift()!;

                if (pushedOut.some((cell) => cell !== EMPTY)) {
                    this.toppedOut = true;
                }

                const row = filledRow(GARBAGE);
                row[hole] = EMPTY;
                this.board.push(row);
            }
        }

        if (this.toppedOut) {
            this.topOut();
        }
    }

    private topOut(): void {
        this.toppedOut = true;
        this.active = null;
        this.events.onVisual?.({
            kind: 'topOut',
            board: this.board.slice(HIDDEN_ROWS).map((row) => row.slice()),
        });
        this.events.onTopOut?.();
    }
}
