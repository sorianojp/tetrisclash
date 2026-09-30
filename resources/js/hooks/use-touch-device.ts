import { useSyncExternalStore } from 'react';

/** Phones and tablets: the main pointer is a finger, not a mouse. */
const query =
    typeof window === 'undefined'
        ? undefined
        : window.matchMedia('(pointer: coarse)');

function subscribe(callback: () => void) {
    query?.addEventListener('change', callback);

    return () => query?.removeEventListener('change', callback);
}

/** Whether to show on-screen game controls instead of keyboard hints. */
export function useTouchDevice(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => query?.matches ?? false,
        () => false,
    );
}
