import type { VisualEvent } from './engine';
import { BOARD_WIDTH, CELL_COLORS, VISIBLE_ROWS } from './pieces';

/**
 * Cosmetic effects drawn on top of (and around) a player's board: particles,
 * flashes, drop trails, shockwaves and screen shake. Positions are in board
 * cells; drawing converts them to pixels.
 */

type Timed = { age: number; duration: number };

type Particle = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    age: number;
    life: number;
    size: number;
    color: string;
    angle: number;
    spin: number;
    gravity: number;
    glow: boolean;
};

type RowFlash = Timed & { y: number; strong: boolean };
type CellFlash = Timed & { cells: [number, number][] };
type Trail = Timed & {
    columns: { x: number; top: number; bottom: number }[];
    color: string;
};
type Ring = Timed & { x: number; y: number; color: string; radius: number };
type BoardFlash = Timed & { color: string; strength: number };
type Band = Timed & { lines: number };
type Shake = Timed & { dx: number; dy: number; magnitude: number };

const MAX_PARTICLES = 900;
const TSPIN_COLOR = '#d66bff';
const TETRIS_COLOR = '#43e6ff';
const GOLD = '#ffd54a';

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const easeOut = (t: number) => 1 - (1 - t) ** 3;

export class Effects {
    /** 0..1, set when garbage is incoming so the meter can pulse. */
    meterPulse = 0;

    private particles: Particle[] = [];
    private rowFlashes: RowFlash[] = [];
    private cellFlashes: CellFlash[] = [];
    private trails: Trail[] = [];
    private rings: Ring[] = [];
    private boardFlashes: BoardFlash[] = [];
    private garbageBands: Band[] = [];
    private shakes: Shake[] = [];
    private time = 0;

    constructor(private readonly reducedMotion = false) {}

    handle(event: VisualEvent): void {
        switch (event.kind) {
            case 'hardDrop':
                this.hardDrop(
                    event.cells,
                    event.distance,
                    CELL_COLORS[event.value],
                );
                break;
            case 'lock':
                this.cellFlashes.push({
                    cells: event.cells,
                    age: 0,
                    duration: 170,
                });
                break;
            case 'clear':
                this.clear(event);
                break;
            case 'garbageRise':
                this.garbageBands.push({
                    lines: event.lines,
                    age: 0,
                    duration: 380,
                });
                this.shake(0, -1, 3 + Math.min(event.lines, 8), 260);
                break;
            case 'incoming':
                this.meterPulse = 1;
                break;
            case 'topOut':
                this.explode(event.board);
                break;
        }
    }

    update(dt: number): void {
        this.time += dt;
        this.meterPulse = Math.max(0, this.meterPulse - dt / 900);

        const seconds = dt / 1000;

        for (const p of this.particles) {
            p.age += dt;
            p.vy += p.gravity * seconds;
            p.vx *= 1 - 0.8 * seconds;
            p.x += p.vx * seconds;
            p.y += p.vy * seconds;
            p.angle += p.spin * seconds;
        }

        this.particles = this.particles.filter((p) => p.age < p.life);

        for (const list of [
            this.rowFlashes,
            this.cellFlashes,
            this.trails,
            this.rings,
            this.boardFlashes,
            this.garbageBands,
            this.shakes,
        ] as Timed[][]) {
            for (const item of list) {
                item.age += dt;
            }
        }

        const alive = <T extends Timed>(items: T[]) =>
            items.filter((i) => i.age < i.duration);
        this.rowFlashes = alive(this.rowFlashes);
        this.cellFlashes = alive(this.cellFlashes);
        this.trails = alive(this.trails);
        this.rings = alive(this.rings);
        this.boardFlashes = alive(this.boardFlashes);
        this.garbageBands = alive(this.garbageBands);
        this.shakes = alive(this.shakes);
    }

    /** Current screen-shake offset in pixels. */
    shakeOffset(): [number, number] {
        let x = 0;
        let y = 0;

        for (const s of this.shakes) {
            const t = s.age / s.duration;
            const falloff = (1 - t) ** 2;
            const wobble = Math.cos(t * Math.PI * 5);
            const jitter = s.dx === 0 && s.dy === 0 ? 1 : 0;
            x += (s.dx * wobble + jitter * rand(-1, 1)) * s.magnitude * falloff;
            y += (s.dy * wobble + jitter * rand(-1, 1)) * s.magnitude * falloff;
        }

        return [x, y];
    }

    /** Glow behind the blocks that heats up with the combo count. */
    drawAura(
        ctx: CanvasRenderingContext2D,
        left: number,
        cell: number,
        combo: number,
        backToBack: boolean,
    ): void {
        const width = BOARD_WIDTH * cell;
        const height = VISIBLE_ROWS * cell;

        if (combo > 0) {
            const level = Math.min(combo, 10) / 10;
            const hue = (30 - level * 40 + this.time / 40) % 360;
            const pulse = 0.5 + 0.5 * Math.sin(this.time / 180);
            const gradient = ctx.createRadialGradient(
                left + width / 2,
                height,
                0,
                left + width / 2,
                height,
                height * (0.5 + level * 0.5),
            );
            gradient.addColorStop(
                0,
                `hsla(${hue}, 95%, 60%, ${0.12 + level * 0.18 + pulse * 0.05})`,
            );
            gradient.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(left, 0, width, height);
        }

        if (backToBack) {
            ctx.save();
            ctx.shadowColor = GOLD;
            ctx.shadowBlur = cell * (0.5 + 0.2 * Math.sin(this.time / 250));
            ctx.strokeStyle = 'rgba(255, 213, 74, 0.55)';
            ctx.lineWidth = 2;
            ctx.strokeRect(left - 1, -1, width + 2, height + 2);
            ctx.restore();
        }
    }

    /** Pulsing red warning when the stack gets close to the top. */
    drawDanger(
        ctx: CanvasRenderingContext2D,
        left: number,
        cell: number,
        topRow: number,
    ): void {
        const DANGER_ROWS = 6;

        if (topRow >= DANGER_ROWS) {
            return;
        }

        const intensity = (DANGER_ROWS - topRow) / DANGER_ROWS;
        const alpha = intensity * (0.35 + 0.2 * Math.sin(this.time / 140));
        const width = BOARD_WIDTH * cell;
        const height = VISIBLE_ROWS * cell;
        const edge = cell * 2.5;

        const top = ctx.createLinearGradient(0, 0, 0, edge * 1.5);
        top.addColorStop(0, `rgba(255, 40, 70, ${alpha})`);
        top.addColorStop(1, 'rgba(255, 40, 70, 0)');
        ctx.fillStyle = top;
        ctx.fillRect(left, 0, width, edge * 1.5);

        for (const [x0, x1] of [
            [left, left + edge],
            [left + width, left + width - edge],
        ]) {
            const side = ctx.createLinearGradient(x0, 0, x1, 0);
            side.addColorStop(0, `rgba(255, 40, 70, ${alpha * 0.8})`);
            side.addColorStop(1, 'rgba(255, 40, 70, 0)');
            ctx.fillStyle = side;
            ctx.fillRect(Math.min(x0, x1), 0, edge, height);
        }

        ctx.strokeStyle = `rgba(255, 60, 90, ${0.4 + alpha})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(left - 1, -1, width + 2, height + 2);
    }

    /** Everything drawn above the blocks. */
    drawOverlay(
        ctx: CanvasRenderingContext2D,
        left: number,
        cell: number,
    ): void {
        const width = BOARD_WIDTH * cell;
        const height = VISIBLE_ROWS * cell;

        ctx.save();
        ctx.beginPath();
        ctx.rect(left, 0, width, height);
        ctx.clip();

        for (const trail of this.trails) {
            const fade = 1 - easeOut(trail.age / trail.duration);

            for (const column of trail.columns) {
                const top = Math.max(column.top, -1) * cell;
                const bottom = column.bottom * cell;
                const gradient = ctx.createLinearGradient(0, top, 0, bottom);
                gradient.addColorStop(0, 'rgba(255,255,255,0)');
                gradient.addColorStop(1, trail.color);
                ctx.globalAlpha = 0.55 * fade;
                ctx.fillStyle = gradient;
                ctx.fillRect(
                    left + column.x * cell + cell * 0.1,
                    top,
                    cell * 0.8,
                    bottom - top,
                );
            }
        }

        ctx.globalAlpha = 1;

        for (const flash of this.cellFlashes) {
            ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - flash.age / flash.duration)})`;

            for (const [x, y] of flash.cells) {
                ctx.fillRect(left + x * cell, y * cell, cell, cell);
            }
        }

        for (const flash of this.rowFlashes) {
            const t = flash.age / flash.duration;
            const grow = easeOut(Math.min(1, t * 2));
            const thickness = cell * (1 + (flash.strong ? 0.6 : 0.2) * grow);
            const cy = (flash.y + 0.5) * cell;
            ctx.globalAlpha = (1 - t) * 0.9;
            ctx.fillStyle = flash.strong ? '#fff7cf' : '#ffffff';
            ctx.fillRect(
                left + (width / 2) * (1 - grow),
                cy - thickness / 2,
                width * grow,
                thickness,
            );
        }

        for (const band of this.garbageBands) {
            const t = band.age / band.duration;
            const bandHeight = Math.min(band.lines, VISIBLE_ROWS) * cell;
            const gradient = ctx.createLinearGradient(
                0,
                height - bandHeight - cell,
                0,
                height,
            );
            gradient.addColorStop(0, 'rgba(255, 50, 80, 0)');
            gradient.addColorStop(1, 'rgba(255, 50, 80, 0.75)');
            ctx.globalAlpha = 1 - t;
            ctx.fillStyle = gradient;
            ctx.fillRect(
                left,
                height - bandHeight - cell,
                width,
                bandHeight + cell,
            );
        }

        for (const flash of this.boardFlashes) {
            ctx.globalAlpha =
                flash.strength * (1 - easeOut(flash.age / flash.duration));
            ctx.fillStyle = flash.color;
            ctx.fillRect(left, 0, width, height);
        }

        ctx.globalAlpha = 1;
        ctx.restore();

        // Shockwaves and particles may spill over the panels around the board.
        for (const ring of this.rings) {
            const t = ring.age / ring.duration;
            ctx.save();
            ctx.globalAlpha = 1 - t;
            ctx.strokeStyle = ring.color;
            ctx.shadowColor = ring.color;
            ctx.shadowBlur = cell * 0.8;
            ctx.lineWidth = cell * 0.35 * (1 - t) + 1;
            ctx.beginPath();
            ctx.arc(
                left + ring.x * cell,
                ring.y * cell,
                easeOut(t) * ring.radius * cell,
                0,
                Math.PI * 2,
            );
            ctx.stroke();
            ctx.restore();
        }

        for (const p of this.particles) {
            const t = p.age / p.life;
            const size = p.size * cell * (p.glow ? 1 - t : 1);
            ctx.save();
            ctx.globalAlpha = t < 0.7 ? 1 : (1 - t) / 0.3;

            if (p.glow) {
                ctx.globalCompositeOperation = 'lighter';
                ctx.shadowColor = p.color;
                ctx.shadowBlur = size * 2;
            }

            ctx.translate(left + p.x * cell, p.y * cell);
            ctx.rotate(p.angle);
            ctx.fillStyle = p.color;
            ctx.fillRect(-size / 2, -size / 2, size, size);

            if (!p.glow) {
                ctx.fillStyle = 'rgba(255,255,255,0.35)';
                ctx.fillRect(-size / 2, -size / 2, size, size * 0.25);
            }

            ctx.restore();
        }
    }

    // ---- Event handlers ----------------------------------------------------

    private hardDrop(
        cells: [number, number][],
        distance: number,
        color: string,
    ): void {
        if (distance <= 0) {
            return;
        }

        const columns = new Map<number, { top: number; bottom: number }>();

        for (const [x, y] of cells) {
            const column = columns.get(x);
            columns.set(x, {
                top: Math.min(column?.top ?? Infinity, y - distance),
                bottom: Math.max(column?.bottom ?? -Infinity, y + 1),
            });
        }

        this.trails.push({
            columns: [...columns].map(([x, c]) => ({ x, ...c })),
            color,
            age: 0,
            duration: 240,
        });

        // Dust puffs under the piece's lowest cells.
        for (const [x, y] of cells) {
            if (!cells.some(([cx, cy]) => cx === x && cy === y + 1)) {
                this.spawn(3, () => ({
                    x: x + rand(0.1, 0.9),
                    y: y + 1,
                    vx: rand(-3, 3),
                    vy: rand(-3, -0.5),
                    life: rand(250, 450),
                    size: rand(0.08, 0.16),
                    color: 'rgba(220,230,255,0.8)',
                    gravity: 6,
                    glow: false,
                }));
            }
        }

        this.shake(0, 1, Math.min(2 + distance * 0.3, 7), 170);
    }

    private clear(event: Extract<VisualEvent, { kind: 'clear' }>): void {
        const { rows, info } = event;
        const strong = info.lines >= 4 || info.tSpin !== 'none';
        const accent =
            info.tSpin !== 'none'
                ? TSPIN_COLOR
                : info.lines >= 4
                  ? TETRIS_COLOR
                  : '#ffffff';

        for (const row of rows) {
            this.rowFlashes.push({
                y: row.y,
                strong,
                age: 0,
                duration: strong ? 420 : 300,
            });

            row.cells.forEach((value, x) => {
                const color = CELL_COLORS[value] ?? '#ffffff';
                this.spawn(strong ? 3 : 2, () => ({
                    x: x + 0.5,
                    y: row.y + 0.5,
                    vx: (x - 4.5) * rand(0.4, 1.4) + rand(-2.5, 2.5),
                    vy: rand(-11, -3),
                    life: rand(650, 1100),
                    size: rand(0.22, 0.45),
                    color,
                    gravity: 28,
                    glow: false,
                }));
            });

            if (strong) {
                this.spawn(10, () => ({
                    x: rand(0, BOARD_WIDTH),
                    y: row.y + 0.5,
                    vx: rand(-8, 8),
                    vy: rand(-8, 2),
                    life: rand(400, 800),
                    size: rand(0.12, 0.22),
                    color: accent,
                    gravity: 6,
                    glow: true,
                }));
            }
        }

        const centerY =
            rows.reduce((sum, r) => sum + r.y + 0.5, 0) /
            Math.max(1, rows.length);

        if (strong) {
            this.rings.push({
                x: BOARD_WIDTH / 2,
                y: centerY,
                color: accent,
                radius: 9,
                age: 0,
                duration: 550,
            });
        }

        if (info.backToBack) {
            this.rings.push({
                x: BOARD_WIDTH / 2,
                y: centerY,
                color: GOLD,
                radius: 12,
                age: 0,
                duration: 750,
            });
        }

        if (info.perfectClear) {
            this.boardFlashes.push({
                color: GOLD,
                strength: 0.6,
                age: 0,
                duration: 900,
            });
            this.spawn(80, () => ({
                x: rand(0, BOARD_WIDTH),
                y: VISIBLE_ROWS,
                vx: rand(-4, 4),
                vy: rand(-26, -12),
                life: rand(900, 1600),
                size: rand(0.15, 0.3),
                color: `hsl(${Math.floor(rand(0, 360))}, 95%, 65%)`,
                gravity: 18,
                glow: true,
            }));
        }

        this.shake(
            0,
            0,
            info.lines * 1.2 + (strong ? 4 : 0) + Math.min(info.combo, 6) * 0.4,
            strong ? 320 : 200,
        );
    }

    private explode(board: number[][]): void {
        board.forEach((row, y) =>
            row.forEach((value, x) => {
                if (value) {
                    this.spawn(1, () => ({
                        x: x + 0.5,
                        y: y + 0.5,
                        vx: (x - 4.5) * rand(1, 3),
                        vy: rand(-16, -2),
                        life: rand(900, 1500),
                        size: rand(0.5, 0.8),
                        color: CELL_COLORS[value],
                        gravity: 30,
                        glow: false,
                    }));
                }
            }),
        );

        this.boardFlashes.push({
            color: '#ff2a4a',
            strength: 0.55,
            age: 0,
            duration: 700,
        });
        this.rings.push({
            x: BOARD_WIDTH / 2,
            y: VISIBLE_ROWS / 2,
            color: '#ff4a6a',
            radius: 14,
            age: 0,
            duration: 700,
        });
        this.shake(0, 0, 10, 450);
    }

    private spawn(
        count: number,
        make: () => Omit<Particle, 'age' | 'angle' | 'spin'>,
    ): void {
        const scaled = this.reducedMotion ? Math.ceil(count * 0.3) : count;

        for (
            let i = 0;
            i < scaled && this.particles.length < MAX_PARTICLES;
            i++
        ) {
            this.particles.push({
                ...make(),
                age: 0,
                angle: rand(0, Math.PI),
                spin: rand(-8, 8),
            });
        }
    }

    /** dx/dy give a direction (0, 0 = random jitter). Magnitude is in pixels. */
    private shake(
        dx: number,
        dy: number,
        magnitude: number,
        duration: number,
    ): void {
        if (!this.reducedMotion) {
            this.shakes.push({ dx, dy, magnitude, age: 0, duration });
        }
    }
}
