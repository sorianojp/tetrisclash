import { BOARD_WIDTH, CELL_COLORS, HIDDEN_ROWS, VISIBLE_ROWS } from './pieces';
import type { Cell } from './pieces';
import { drawBlock } from './render';

/** Everything a square result card shows. */
export type ShareCardData = {
    /** e.g. "Ranked battle", "40 Lines". */
    mode: string;
    /** e.g. "Victory", "Finished!". */
    headline: string;
    tone: 'win' | 'loss' | 'neutral';
    /** Line under the headline, e.g. "vs Alex · by knockout". */
    subline?: string;
    /** The one number that matters most (time, score, KOs). */
    highlight?: { label: string; value: string };
    /** Up to four supporting numbers. */
    stats: [label: string, value: string][];
    /** Small gold ribbon, e.g. "New personal best". */
    ribbon?: string;
    player: { name: string; rank?: { rank: number; title: string } };
    /** Full engine board (hidden rows included); null draws an empty well. */
    board: Cell[][] | null;
    toppedOut?: boolean;
};

export const SHARE_CARD_SIZE = 1080;

const FONT = '"Instrument Sans", ui-sans-serif, system-ui, sans-serif';
const PAD = 72;
const TONE_COLOR = { win: '#fcd34d', loss: '#fda4af', neutral: '#ffffff' };

/** Draw the result card onto a new 1080×1080 canvas. */
export async function renderShareCard(
    data: ShareCardData,
): Promise<HTMLCanvasElement> {
    // Canvas text only uses web fonts that are already loaded.
    await Promise.all(
        ['500 32px', '600 96px'].map((spec) =>
            document.fonts.load(`${spec} "Instrument Sans"`).catch(() => []),
        ),
    );

    const canvas = document.createElement('canvas');
    canvas.width = SHARE_CARD_SIZE;
    canvas.height = SHARE_CARD_SIZE;
    const ctx = canvas.getContext('2d')!;

    drawBackground(ctx);
    drawHeader(ctx, data.mode);
    drawBoard(ctx, data.board, data.toppedOut ?? false);
    drawDetails(ctx, data);
    drawFooter(ctx, data.player);

    return canvas;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) =>
        canvas.toBlob(
            (blob) =>
                blob ? resolve(blob) : reject(new Error('Could not export')),
            'image/png',
        ),
    );
}

// ---- Sections ---------------------------------------------------------------

function drawBackground(ctx: CanvasRenderingContext2D): void {
    const gradient = ctx.createLinearGradient(
        0,
        0,
        SHARE_CARD_SIZE,
        SHARE_CARD_SIZE,
    );
    gradient.addColorStop(0, '#1e1b4b');
    gradient.addColorStop(0.55, '#4c1d95');
    gradient.addColorStop(1, '#701a75');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, SHARE_CARD_SIZE, SHARE_CARD_SIZE);

    // A few faint falling pieces for texture.
    const pieces: [x: number, y: number, cells: [number, number][]][] = [
        [
            880,
            150,
            [
                [0, 0],
                [1, 0],
                [2, 0],
                [3, 0],
            ],
        ],
        [
            560,
            40,
            [
                [1, 0],
                [0, 1],
                [1, 1],
                [2, 1],
            ],
        ],
    ];
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#ffffff';

    for (const [x, y, cells] of pieces) {
        for (const [cx, cy] of cells) {
            roundRect(ctx, x + cx * 44, y + cy * 44, 40, 40, 6);
            ctx.fill();
        }
    }

    ctx.globalAlpha = 1;
}

function drawHeader(ctx: CanvasRenderingContext2D, mode: string): void {
    // Logo: the T-tetromino.
    ctx.fillStyle = '#c084fc';

    for (const [cx, cy] of [
        [0, 0],
        [1, 0],
        [2, 0],
        [1, 1],
    ]) {
        roundRect(ctx, PAD + cx * 17, PAD + 4 + cy * 17, 15, 15, 3);
        ctx.fill();
    }

    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.font = `600 34px ${FONT}`;
    ctx.fillText('TETRIS CLASH', PAD + 68, PAD + 20);

    // Mode pill, right-aligned.
    ctx.font = `600 24px ${FONT}`;
    const label = mode.toUpperCase();
    const width = ctx.measureText(label).width + 40;
    const x = SHARE_CARD_SIZE - PAD - width;
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    roundRect(ctx, x, PAD, width, 42, 21);
    ctx.fill();
    ctx.fillStyle = '#f5d0fe';
    ctx.fillText(label, x + 20, PAD + 22);
}

/** The player's final well, drawn with the game's own block style. */
function drawBoard(
    ctx: CanvasRenderingContext2D,
    board: Cell[][] | null,
    toppedOut: boolean,
): void {
    const cell = 36;
    const inset = 12;
    const left = PAD;
    const top = 170;
    const width = BOARD_WIDTH * cell;
    const height = VISIBLE_ROWS * cell;

    ctx.fillStyle = 'rgba(8, 11, 24, 0.85)';
    roundRect(ctx, left, top, width + inset * 2, height + inset * 2, 18);
    ctx.fill();

    const x0 = left + inset;
    const y0 = top + inset;

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;

    for (let x = 1; x < BOARD_WIDTH; x++) {
        ctx.beginPath();
        ctx.moveTo(x0 + x * cell + 0.5, y0);
        ctx.lineTo(x0 + x * cell + 0.5, y0 + height);
        ctx.stroke();
    }

    for (let y = 1; y < VISIBLE_ROWS; y++) {
        ctx.beginPath();
        ctx.moveTo(x0, y0 + y * cell + 0.5);
        ctx.lineTo(x0 + width, y0 + y * cell + 0.5);
        ctx.stroke();
    }

    if (!board) {
        return;
    }

    for (let y = 0; y < VISIBLE_ROWS; y++) {
        for (let x = 0; x < BOARD_WIDTH; x++) {
            const value = board[y + HIDDEN_ROWS]?.[x];

            if (value) {
                drawBlock(
                    ctx,
                    x0 + x * cell,
                    y0 + y * cell,
                    cell,
                    toppedOut ? '#3a3f4d' : CELL_COLORS[value],
                );
            }
        }
    }
}

function drawDetails(ctx: CanvasRenderingContext2D, data: ShareCardData): void {
    const left = 504;
    const width = SHARE_CARD_SIZE - PAD - left;
    let y = 196;

    ctx.textBaseline = 'alphabetic';

    if (data.ribbon) {
        ctx.font = `600 24px ${FONT}`;
        const label = data.ribbon.toUpperCase();
        const ribbonWidth = ctx.measureText(label).width + 36;
        ctx.fillStyle = '#fbbf24';
        roundRect(ctx, left, y, ribbonWidth, 42, 21);
        ctx.fill();
        ctx.fillStyle = '#451a03';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, left + 18, y + 22);
        ctx.textBaseline = 'alphabetic';
        y += 66;
    } else {
        y += 24;
    }

    // Headline, shrunk to fit.
    y += 80;
    ctx.fillStyle = TONE_COLOR[data.tone];
    fitText(ctx, data.headline.toUpperCase(), left, y, width, 600, 104);

    if (data.subline) {
        y += 52;
        ctx.fillStyle = '#c7d2fe';
        fitText(ctx, data.subline, left, y, width, 500, 32);
    }

    if (data.highlight) {
        y += 84;
        ctx.fillStyle = '#c7d2fe';
        ctx.font = `600 24px ${FONT}`;
        ctx.fillText(data.highlight.label.toUpperCase(), left, y);
        y += 92;
        ctx.fillStyle = '#ffffff';
        fitText(ctx, data.highlight.value, left, y, width, 600, 96);
    }

    // Supporting stats in a 2×2 grid.
    y += 40;
    const gap = 16;
    const boxWidth = (width - gap) / 2;
    const boxHeight = 104;

    data.stats.slice(0, 4).forEach(([label, value], i) => {
        const bx = left + (i % 2) * (boxWidth + gap);
        const by = y + Math.floor(i / 2) * (boxHeight + gap);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        roundRect(ctx, bx, by, boxWidth, boxHeight, 16);
        ctx.fill();
        ctx.fillStyle = '#c7d2fe';
        ctx.font = `600 20px ${FONT}`;
        ctx.fillText(label.toUpperCase(), bx + 20, by + 38);
        ctx.fillStyle = '#ffffff';
        fitText(ctx, value, bx + 20, by + 84, boxWidth - 40, 600, 38);
    });
}

/** Bottom row: who played on the left; where and when on the right. */
function drawFooter(
    ctx: CanvasRenderingContext2D,
    player: ShareCardData['player'],
): void {
    const nameY = SHARE_CARD_SIZE - 86;
    const subY = SHARE_CARD_SIZE - 44;
    const half = SHARE_CARD_SIZE / 2 - PAD;

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    fitText(ctx, player.name, PAD, nameY, half, 600, 36);

    if (player.rank) {
        ctx.fillStyle = '#e9d5ff';
        fitText(
            ctx,
            `Rank ${player.rank.rank} · ${player.rank.title}`,
            PAD,
            subY,
            half,
            500,
            28,
        );
    }

    ctx.textAlign = 'right';
    ctx.font = `600 30px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(
        window.location.host || 'Tetris Clash',
        SHARE_CARD_SIZE - PAD,
        nameY,
    );

    ctx.font = `500 24px ${FONT}`;
    ctx.fillStyle = '#c7d2fe';
    const date = new Date().toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
    ctx.fillText(date, SHARE_CARD_SIZE - PAD, subY);
    ctx.textAlign = 'left';
}

// ---- Helpers ------------------------------------------------------------

/** Draw text at the largest size (up to maxSize) that fits in maxWidth. */
function fitText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    weight: number,
    maxSize: number,
): void {
    let size = maxSize;

    do {
        ctx.font = `${weight} ${size}px ${FONT}`;
        size -= 2;
    } while (ctx.measureText(text).width > maxWidth && size > 12);

    ctx.fillText(text, x, y);
}

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
): void {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
}
