import { Game } from '../resources/js/tetris/engine';
import type { GameOptions } from '../resources/js/tetris/engine';
import { planMove } from './brain';
import type { BotStyle, Plan } from './brain';

type Step = { at: number; run: () => void };

/**
 * A bot at the controls of one game: it plans each piece and plays it out as timed key
 * presses at its own pace. Time is whatever clock the caller passes in: real time in a duel,
 * simulated time in practice. It makes its own game, or takes over one that already exists
 * (an autopilot account's game on the page).
 */
export class BotPlayer {
    readonly game: Game;
    private steps: Step[] = [];

    constructor(
        options: GameOptions | Game,
        private readonly style: BotStyle,
        private readonly random: () => number = Math.random,
    ) {
        this.game = options instanceof Game ? options : new Game(options);
    }

    /** Run the key presses that are due; plan the next piece when there's nothing queued. */
    act(now: number): void {
        while (this.steps.length > 0 && this.steps[0].at <= now) {
            this.steps.shift()!.run();
        }

        if (this.steps.length > 0 || !this.game.active) {
            return;
        }

        const plan = planMove(this.game, this.style, this.random);

        if (plan) {
            this.schedule(plan, now);
        }
    }

    /** Drop what it was about to do (after a KO). */
    reset(): void {
        this.steps = [];
    }

    /**
     * Turn a plan into timed key presses: a moment to "look", then hold, rotations and
     * slides a few dozen ms apart, then the drop, paced to the bot's pieces per second.
     */
    private schedule(plan: Plan, now: number): void {
        const pieceMs = 1000 / this.style.pps;
        const stepMs = Math.min(110, Math.max(30, pieceMs * 0.08));
        const jitter = () => 0.7 + this.random() * 0.6;
        // Now and then a longer look, the way people pause.
        const pause = this.random() < 0.04 ? 300 + this.random() * 600 : 0;
        let at = now + Math.max(40, pieceMs * 0.4) * jitter() + pause;
        const add = (run: () => void) => {
            this.steps.push({ at, run });
            at += stepMs * jitter();
        };

        if (plan.hold) {
            add(() => this.game.holdPiece());
        }

        const turns = plan.rotation === 3 ? [-1] : Array(plan.rotation).fill(1);

        for (const direction of turns as (1 | -1)[]) {
            add(() => this.game.rotate(direction));
        }

        // Slide one column at a time; a couple of spare steps cover rotation kicks.
        const slides = Math.abs(plan.x - (this.game.active?.x ?? plan.x)) + 2;

        for (let i = 0; i < slides; i++) {
            add(() => {
                const piece = this.game.active;

                if (piece && piece.x !== plan.x) {
                    this.game.move(Math.sign(plan.x - piece.x));
                }
            });
        }

        this.steps.push({
            at: Math.max(at, now + pieceMs * jitter()),
            run: () => this.game.hardDrop(),
        });
    }
}
