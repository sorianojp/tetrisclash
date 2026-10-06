import { usePage } from '@inertiajs/react';
import {
    useEffect,
    useLayoutEffect,
    useRef,
    useSyncExternalStore,
} from 'react';
import type { RefObject } from 'react';
import type { BotStyle } from '../../../bots/brain';
import { BotPlayer } from '../../../bots/player';
import type { Game } from './engine';

/**
 * Autopilot: an account an admin has flagged (users.autopilot) can let its browser play by
 * itself, for a livestream. It plays ranked while it has energy, Zen while energy refills,
 * and goes back to ranked once it's full, forever. Only the account itself sees that;
 * the switch here only says whether *this* browser is the one doing the playing, so signing
 * in on a phone doesn't start a second autopilot.
 */

/** How the autopilot plays: quick and clean, with the odd human slip. */
export const AUTOPILOT_STYLE: BotStyle = {
    pps: 2.5,
    mistakes: 0.02,
    hold: true,
    well: true,
    chatty: 0.5,
    invites: 0,
};

/** The pause between steps of the loop (queueing, leaving a result, the next Zen run). */
export const AUTOPILOT_PAUSE_MS = 6000;

const STORAGE_KEY = 'tetris-clash:autopilot';
const listeners = new Set<() => void>();
let fallback = false;

function readSwitch(): boolean {
    try {
        return window.localStorage.getItem(STORAGE_KEY) === 'on';
    } catch {
        return fallback;
    }
}

function writeSwitch(on: boolean): void {
    fallback = on;

    try {
        if (on) {
            window.localStorage.setItem(STORAGE_KEY, 'on');
        } else {
            window.localStorage.removeItem(STORAGE_KEY);
        }
    } catch {
        // Storage blocked: the switch lasts until the page reloads.
    }

    listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);

    return () => listeners.delete(listener);
}

/**
 * Whether the signed-in account is on autopilot, and whether this browser is running it.
 */
export function useAutopilot(): {
    enabled: boolean;
    running: boolean;
    start: () => void;
    stop: () => void;
} {
    const { auth } = usePage().props;
    const enabled = auth.user?.autopilot === true;
    const on = useSyncExternalStore(subscribe, readSwitch, () => false);

    return {
        enabled,
        running: enabled && on,
        start: () => writeSwitch(true),
        stop: () => writeSwitch(false),
    };
}

/**
 * Put the autopilot at the controls of the page's game while `active` (the same moments a
 * player's keys work). It follows the game across restarts, which make a new Game.
 */
export function useAutopilotDriver(
    gameRef: RefObject<Game | null>,
    running: boolean,
    active: boolean,
): void {
    const activeRef = useRef(active);

    useLayoutEffect(() => {
        activeRef.current = active;
    });

    useEffect(() => {
        if (!running) {
            return;
        }

        let player: BotPlayer | null = null;
        const timer = setInterval(() => {
            const game = gameRef.current;

            if (!game) {
                return;
            }

            if (player?.game !== game) {
                player = new BotPlayer(game, AUTOPILOT_STYLE);
            }

            // Frozen (countdown, KO pause, result): drop whatever it was about to do.
            if (!activeRef.current || game.paused) {
                player.reset();

                return;
            }

            player.act(performance.now());
        }, 16);

        return () => clearInterval(timer);
    }, [gameRef, running]);
}
