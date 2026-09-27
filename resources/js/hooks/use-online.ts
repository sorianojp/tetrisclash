import { useSyncExternalStore } from 'react';
import { sendJson } from '@/lib/api';
import { ping } from '@/routes/online';

/** Must stay well inside User::ONLINE_WINDOW_SECONDS (120s) on the server. */
const PING_MS = 30_000;

/** Don't re-ping on a remount (e.g. during navigation) if we pinged this recently. */
const MIN_GAP_MS = 20_000;

let count: number | null = null;
let lastPingAt = 0;
let users = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

async function sendPing(): Promise<void> {
    lastPingAt = Date.now();

    try {
        const { online } = await sendJson<{ online: number }>(ping());
        count = online;
        listeners.forEach((listener) => listener());
    } catch {
        // A dropped ping is fine; the next one catches up.
    }
}

/** Keep the player listed as online while the app is open; call the returned function to stop. */
export function startOnlinePing(): () => void {
    users++;

    if (users === 1) {
        if (Date.now() - lastPingAt > MIN_GAP_MS) {
            void sendPing();
        }

        timer = setInterval(() => void sendPing(), PING_MS);
    }

    return () => {
        users--;

        if (users === 0) {
            clearInterval(timer);
        }
    };
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);

    return () => listeners.delete(listener);
}

/** Players online (including you) as of the latest ping, or null before the first one. */
export function useOnlineCount(): number | null {
    return useSyncExternalStore(
        subscribe,
        () => count,
        () => count,
    );
}
