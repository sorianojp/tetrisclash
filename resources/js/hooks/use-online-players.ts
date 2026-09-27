import { echo } from '@laravel/echo-react';
import { useSyncExternalStore } from 'react';
import type { RankProgress } from '@/components/tetris/rank-badge';

/** A signed-in player, as the `online` presence channel describes them (User::onlineProfile). */
export type OnlinePlayer = {
    id: number;
    name: string;
    rating: number;
    rank: RankProgress;
    acceptsInvites: boolean;
    inMatch: boolean;
};

const CHANNEL = 'online';

/**
 * Leaving waits this long, so a layout remount during navigation doesn't make us
 * blink offline for everyone else.
 */
const LEAVE_DELAY_MS = 1000;

let players: OnlinePlayer[] = [];
let joined = false;
let users = 0;
let leaveTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function publish(next: OnlinePlayer[]): void {
    players = next;
    listeners.forEach((listener) => listener());
}

function join(): void {
    joined = true;
    echo()
        .join(CHANNEL)
        .here((members: OnlinePlayer[]) => publish(members))
        .joining((member: OnlinePlayer) =>
            publish([...players.filter((p) => p.id !== member.id), member]),
        )
        .leaving((member: OnlinePlayer) =>
            publish(players.filter((p) => p.id !== member.id)),
        );
}

function leave(): void {
    joined = false;
    echo().leave(CHANNEL);
}

/** Join the online list while signed in; call the returned function to stop. */
export function goOnline(): () => void {
    users++;
    clearTimeout(leaveTimer);

    if (!joined) {
        join();
    }

    return () => {
        users--;

        if (users === 0) {
            leaveTimer = setTimeout(() => {
                leave();
                publish([]);
            }, LEAVE_DELAY_MS);
        }
    };
}

/**
 * Re-join so everyone sees our current status. Presence data is captured when we join,
 * so this is how a changed invite setting or a started/finished match reaches others.
 */
export function refreshOnlineStatus(): void {
    if (joined) {
        leave();
        join();
    }
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);

    return () => listeners.delete(listener);
}

/** Everyone currently online, including the current player. */
export function useOnlinePlayers(): OnlinePlayer[] {
    return useSyncExternalStore(
        subscribe,
        () => players,
        () => players,
    );
}
