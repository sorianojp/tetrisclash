import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Effects } from './effects';
import { Game } from './engine';
import type { GameEvents, GameOptions } from './engine';
import { InputController } from './input';
import { PLAYER_LAYOUT, drawPlayer, prepareCanvas } from './render';

type Options = {
    seed: number;
    gravity?: GameOptions['gravity'];
    startingGarbage?: GameOptions['startingGarbage'];
    timeLimitMs?: GameOptions['timeLimitMs'];
    events?: GameEvents;
    /** When false the game is frozen and keys are ignored (countdowns, KO pauses, results). */
    running: boolean;
    cell: number;
};

/**
 * Owns a Game instance, its keyboard input and the requestAnimationFrame loop
 * that simulates and draws it.
 */
export function useTetrisGame({
    seed,
    gravity,
    startingGarbage,
    timeLimitMs,
    events,
    running,
    cell,
}: Options) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const gameRef = useRef<Game | null>(null);
    const effectsRef = useRef<Effects | null>(null);
    const eventsRef = useRef(events);
    const runningRef = useRef(running);

    useLayoutEffect(() => {
        eventsRef.current = events;
        runningRef.current = running;
    });

    // Create (or recreate, when the seed changes) the game. Events are forwarded through a ref so
    // callers can pass fresh closures every render.
    useEffect(() => {
        const effects = new Effects(
            window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        );
        effectsRef.current = effects;
        gameRef.current = new Game({
            seed,
            gravity,
            startingGarbage,
            timeLimitMs,
            events: {
                onAttack: (lines) => eventsRef.current?.onAttack?.(lines),
                onClear: (info) => eventsRef.current?.onClear?.(info),
                onLock: () => eventsRef.current?.onLock?.(),
                onTopOut: () => eventsRef.current?.onTopOut?.(),
                onTimeUp: () => eventsRef.current?.onTimeUp?.(),
                onVisual: (event) => {
                    effects.handle(event);
                    eventsRef.current?.onVisual?.(event);
                },
            },
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [seed]);

    useEffect(() => {
        const input = new InputController(() => gameRef.current);
        const onKeyDown = (event: KeyboardEvent) => {
            if (
                event.target instanceof HTMLInputElement ||
                event.target instanceof HTMLTextAreaElement
            ) {
                return;
            }

            input.enabled = runningRef.current;
            input.keyDown(event);
        };
        const onKeyUp = (event: KeyboardEvent) => input.keyUp(event);
        const onBlur = () => input.releaseAll();

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onBlur);

        let frame = 0;
        let last = performance.now();

        const loop = (now: number) => {
            const dt = Math.min(now - last, 100);
            last = now;

            const game = gameRef.current;
            const canvas = canvasRef.current;

            if (game) {
                game.paused = !runningRef.current;
                input.enabled = runningRef.current;
                input.update(dt);
                game.update(dt, input.softDropping);
            }

            // Effects keep animating through pauses so bursts can finish.
            effectsRef.current?.update(dt);

            if (game && canvas) {
                const ctx = prepareCanvas(
                    canvas,
                    PLAYER_LAYOUT.width * cell,
                    PLAYER_LAYOUT.height * cell,
                );
                drawPlayer(ctx, game, cell, effectsRef.current ?? undefined);
            }

            frame = requestAnimationFrame(loop);
        };

        frame = requestAnimationFrame(loop);

        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
        };
    }, [cell]);

    return { canvasRef, gameRef };
}

/** Pick a cell size that fits the board in the viewport. */
export function useCellSize(reservedHeight: number, max = 30): number {
    const measure = () =>
        typeof window === 'undefined'
            ? max
            : Math.max(
                  14,
                  Math.min(
                      max,
                      Math.floor((window.innerHeight - reservedHeight) / 20),
                      Math.floor((window.innerWidth - 48) / 22),
                  ),
              );
    const [cell, setCell] = useState(measure);

    useEffect(() => {
        const onResize = () => setCell(measure());
        window.addEventListener('resize', onResize);

        return () => window.removeEventListener('resize', onResize);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reservedHeight, max]);

    return cell;
}
