import type { Game } from './engine';
import { sfx } from './sound';

export type Action =
    | 'left'
    | 'right'
    | 'softDrop'
    | 'hardDrop'
    | 'rotateCW'
    | 'rotateCCW'
    | 'hold';

export const KEY_BINDINGS: Record<string, Action> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowDown: 'softDrop',
    Space: 'hardDrop',
    ArrowUp: 'rotateCW',
    KeyX: 'rotateCW',
    KeyZ: 'rotateCCW',
    ControlLeft: 'rotateCCW',
    ControlRight: 'rotateCCW',
    KeyC: 'hold',
    ShiftLeft: 'hold',
    ShiftRight: 'hold',
};

/** Delayed Auto Shift: how long an arrow is held before auto-repeat starts. */
const DAS_MS = 130;
/** Auto Repeat Rate: time between repeated moves once DAS has charged. */
const ARR_MS = 20;

/**
 * Turns keyboard state into game actions with DAS/ARR handling so
 * sideways movement feels like a proper Tetris client.
 */
export class InputController {
    softDropping = false;
    enabled = true;

    private direction: -1 | 0 | 1 = 0;
    private heldDirections: (-1 | 1)[] = [];
    private dasTimer = 0;
    private arrTimer = 0;

    constructor(private readonly game: () => Game | null) {}

    keyDown(event: KeyboardEvent): void {
        const action = KEY_BINDINGS[event.code];

        if (!action) {
            return;
        }

        event.preventDefault();

        if (event.repeat || !this.enabled) {
            return;
        }

        const game = this.game();

        switch (action) {
            case 'left':
            case 'right':
                this.pressDirection(action === 'left' ? -1 : 1);
                break;
            case 'softDrop':
                this.softDropping = true;
                break;
            case 'hardDrop':
                game?.hardDrop();
                break;
            case 'rotateCW':
                if (game?.rotate(1)) {
                    sfx.rotate();
                }

                break;
            case 'rotateCCW':
                if (game?.rotate(-1)) {
                    sfx.rotate();
                }

                break;
            case 'hold':
                if (game && !game.holdUsed) {
                    game.holdPiece();

                    if (game.holdUsed) {
                        sfx.hold();
                    }
                }

                break;
        }
    }

    keyUp(event: KeyboardEvent): void {
        const action = KEY_BINDINGS[event.code];

        if (action === 'left' || action === 'right') {
            this.releaseDirection(action === 'left' ? -1 : 1);
        } else if (action === 'softDrop') {
            this.softDropping = false;
        }
    }

    releaseAll(): void {
        this.heldDirections = [];
        this.direction = 0;
        this.softDropping = false;
    }

    update(dt: number): void {
        const game = this.game();

        if (!game || this.direction === 0 || !this.enabled) {
            return;
        }

        this.dasTimer += dt;

        if (this.dasTimer < DAS_MS) {
            return;
        }

        this.arrTimer += dt;

        while (this.arrTimer >= ARR_MS) {
            this.arrTimer -= ARR_MS;

            if (!game.move(this.direction)) {
                this.arrTimer = 0;
                break;
            }

            sfx.move();
        }
    }

    private pressDirection(direction: -1 | 1): void {
        this.heldDirections = [
            ...this.heldDirections.filter((d) => d !== direction),
            direction,
        ];
        this.setDirection(direction);
    }

    private releaseDirection(direction: -1 | 1): void {
        this.heldDirections = this.heldDirections.filter(
            (d) => d !== direction,
        );
        const remaining = this.heldDirections.at(-1) ?? 0;

        if (remaining !== this.direction) {
            this.setDirection(remaining);
        }
    }

    /** The most recently pressed direction wins; moving starts immediately. */
    private setDirection(direction: -1 | 0 | 1): void {
        this.direction = direction;
        this.dasTimer = 0;
        this.arrTimer = 0;

        if (direction !== 0 && this.enabled && this.game()?.move(direction)) {
            sfx.move();
        }
    }
}
