import type { Effects } from './effects';
import type { Game } from './engine';
import {
    BOARD_WIDTH,
    CELL_COLORS,
    CELL_OF,
    HIDDEN_ROWS,
    SHAPES,
    VISIBLE_ROWS,
} from './pieces';
import type { PieceType } from './pieces';

/** Board colours of the active skin; applyGameTheme (themes.ts) swaps them. */
export const SKIN = {
    field: '#0d1224',
    panel: '#141a33',
    grid: 'rgba(255,255,255,0.05)',
    border: '#2c3766',
    label: '#8d9bd6',
};
const METER = '#f23a4b';

/** Player field layout, measured in cells. */
export const PLAYER_LAYOUT = {
    holdX: 0,
    meterX: 5.3,
    boardX: 6,
    nextX: 16.5,
    width: 21.5,
    height: VISIBLE_ROWS,
    panelWidth: 5,
};

/** Size a canvas for crisp drawing on high-DPI screens and return its context. */
export function prepareCanvas(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
): CanvasRenderingContext2D {
    const ratio = window.devicePixelRatio || 1;

    if (canvas.width !== Math.round(width * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
    }

    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    return ctx;
}

export function drawBlock(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    color: string,
    alpha = 1,
): void {
    const bevel = Math.max(2, size * 0.14);

    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, size, size);

    // Beveled highlights give the classic glossy Tetris Battle look.
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x, y, size, bevel);
    ctx.fillRect(x, y, bevel, size);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x, y + size - bevel, size, bevel);
    ctx.fillRect(x + size - bevel, y, bevel, size);
    ctx.globalAlpha = 1;
}

function drawGhostBlock(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    color: string,
): void {
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, size, size);
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
    ctx.globalAlpha = 1;
}

function drawGrid(
    ctx: CanvasRenderingContext2D,
    left: number,
    cell: number,
): void {
    ctx.fillStyle = SKIN.field;
    ctx.fillRect(left, 0, BOARD_WIDTH * cell, VISIBLE_ROWS * cell);

    ctx.strokeStyle = SKIN.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let x = 1; x < BOARD_WIDTH; x++) {
        ctx.moveTo(left + x * cell + 0.5, 0);
        ctx.lineTo(left + x * cell + 0.5, VISIBLE_ROWS * cell);
    }

    for (let y = 1; y < VISIBLE_ROWS; y++) {
        ctx.moveTo(left, y * cell + 0.5);
        ctx.lineTo(left + BOARD_WIDTH * cell, y * cell + 0.5);
    }

    ctx.stroke();

    ctx.strokeStyle = SKIN.border;
    ctx.lineWidth = 2;
    ctx.strokeRect(
        left - 1,
        -1,
        BOARD_WIDTH * cell + 2,
        VISIBLE_ROWS * cell + 2,
    );
}

function drawMeter(
    ctx: CanvasRenderingContext2D,
    left: number,
    width: number,
    cell: number,
    pending: number,
    pulse = 0,
): void {
    const height = VISIBLE_ROWS * cell;

    ctx.fillStyle = SKIN.panel;
    ctx.fillRect(left, 0, width, height);

    if (pending > 0) {
        const fill = Math.min(pending, VISIBLE_ROWS) * cell;
        // Big incoming attacks blink; fresh ones glow.
        const blink =
            pending >= 8 ? 0.65 + 0.35 * Math.sin(performance.now() / 90) : 1;

        ctx.save();
        ctx.shadowColor = METER;
        ctx.shadowBlur = cell * (0.3 + pulse * 1.2);
        ctx.globalAlpha = blink;
        ctx.fillStyle = pulse > 0.5 ? '#ff8a9a' : METER;
        ctx.fillRect(left, height - fill, width, fill);
        ctx.restore();
    }
}

/** Draw a piece centred inside a box (for hold / next previews). */
function drawPreview(
    ctx: CanvasRenderingContext2D,
    type: PieceType,
    centerX: number,
    centerY: number,
    size: number,
    dimmed = false,
): void {
    const cells = SHAPES[type][0];
    const xs = cells.map(([x]) => x);
    const ys = cells.map(([, y]) => y);
    const width = Math.max(...xs) - Math.min(...xs) + 1;
    const height = Math.max(...ys) - Math.min(...ys) + 1;
    const originX = centerX - (width * size) / 2 - Math.min(...xs) * size;
    const originY = centerY - (height * size) / 2 - Math.min(...ys) * size;
    const color = dimmed ? CELL_COLORS[8] : CELL_COLORS[CELL_OF[type]];

    for (const [x, y] of cells) {
        drawBlock(ctx, originX + x * size, originY + y * size, size, color);
    }
}

function drawPanel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    cell: number,
): void {
    ctx.fillStyle = SKIN.panel;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = SKIN.border;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
    ctx.fillStyle = SKIN.label;
    ctx.font = `700 ${Math.round(cell * 0.5)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x + width / 2, y + cell * 0.3);
}

/** Highest visible row that contains a block (VISIBLE_ROWS when empty). */
function stackTop(game: Game): number {
    const index = game.board
        .slice(HIDDEN_ROWS)
        .findIndex((row) => row.some(Boolean));

    return index === -1 ? VISIBLE_ROWS : index;
}

export function drawPlayer(
    ctx: CanvasRenderingContext2D,
    game: Game,
    cell: number,
    effects?: Effects,
): void {
    const L = PLAYER_LAYOUT;
    const boardLeft = L.boardX * cell;

    ctx.clearRect(0, 0, L.width * cell, L.height * cell);
    ctx.save();

    const [shakeX, shakeY] = effects?.shakeOffset() ?? [0, 0];
    ctx.translate(shakeX, shakeY);

    // Hold
    drawPanel(
        ctx,
        L.holdX * cell,
        0,
        L.panelWidth * cell,
        4 * cell,
        'HOLD',
        cell,
    );

    if (game.hold) {
        drawPreview(
            ctx,
            game.hold,
            (L.holdX + L.panelWidth / 2) * cell,
            2.4 * cell,
            cell * 0.8,
            game.holdUsed,
        );
    }

    // Next queue
    const next = game.nextPieces;
    drawPanel(
        ctx,
        L.nextX * cell,
        0,
        L.panelWidth * cell,
        (1.2 + next.length * 2.6) * cell,
        'NEXT',
        cell,
    );
    next.forEach((type, i) => {
        const size = i === 0 ? cell * 0.8 : cell * 0.62;
        drawPreview(
            ctx,
            type,
            (L.nextX + L.panelWidth / 2) * cell,
            (2.4 + i * 2.6) * cell,
            size,
        );
    });

    drawMeter(
        ctx,
        L.meterX * cell,
        0.5 * cell,
        cell,
        game.pendingGarbageTotal,
        effects?.meterPulse,
    );
    drawGrid(ctx, boardLeft, cell);
    effects?.drawAura(ctx, boardLeft, cell, game.combo, game.backToBack);

    for (let y = HIDDEN_ROWS; y < game.board.length; y++) {
        for (let x = 0; x < BOARD_WIDTH; x++) {
            const value = game.board[y][x];

            if (value) {
                drawBlock(
                    ctx,
                    boardLeft + x * cell,
                    (y - HIDDEN_ROWS) * cell,
                    cell,
                    // A topped-out stack turns to grey rubble.
                    game.toppedOut ? '#3a3f4d' : CELL_COLORS[value],
                );
            }
        }
    }

    if (game.active) {
        const color = CELL_COLORS[CELL_OF[game.active.type]];
        const ghost = { ...game.active, y: game.ghostY() };

        for (const [x, y] of game.cellsOf(ghost)) {
            if (y >= HIDDEN_ROWS) {
                drawGhostBlock(
                    ctx,
                    boardLeft + x * cell,
                    (y - HIDDEN_ROWS) * cell,
                    cell,
                    color,
                );
            }
        }

        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = cell * 0.6;

        for (const [x, y] of game.cellsOf(game.active)) {
            if (y >= HIDDEN_ROWS) {
                drawBlock(
                    ctx,
                    boardLeft + x * cell,
                    (y - HIDDEN_ROWS) * cell,
                    cell,
                    color,
                );
            }
        }

        ctx.restore();
    }

    if (effects) {
        effects.drawDanger(ctx, boardLeft, cell, stackTop(game));
        effects.drawOverlay(ctx, boardLeft, cell);
    }

    ctx.restore();
}

export const OPPONENT_LAYOUT = {
    meterX: 0,
    boardX: 0.8,
    width: 10.8,
    height: VISIBLE_ROWS,
};

/** Draw the opponent's field from the snapshot string they whisper to us. */
export function drawOpponent(
    ctx: CanvasRenderingContext2D,
    snapshot: string | null,
    pending: number,
    cell: number,
): void {
    const L = OPPONENT_LAYOUT;
    const boardLeft = L.boardX * cell;

    ctx.clearRect(0, 0, L.width * cell, L.height * cell);
    drawMeter(ctx, L.meterX * cell, 0.5 * cell, cell, pending);
    drawGrid(ctx, boardLeft, cell);

    if (!snapshot) {
        return;
    }

    for (let i = 0; i < snapshot.length; i++) {
        const value = snapshot.charCodeAt(i) - 48;

        if (value > 0) {
            const x = i % BOARD_WIDTH;
            const y = Math.floor(i / BOARD_WIDTH);
            drawBlock(
                ctx,
                boardLeft + x * cell,
                y * cell,
                cell,
                CELL_COLORS[value],
            );
        }
    }
}
