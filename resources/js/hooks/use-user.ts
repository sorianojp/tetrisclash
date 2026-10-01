import { usePage } from '@inertiajs/react';
import type { User } from '@/types';

/**
 * The signed-in player, on pages behind login. Pages guests can open (practice, challenge
 * links, replays) read `auth.user` instead, which is null for a guest.
 */
export function useUser(): User {
    const { user } = usePage().props.auth;

    if (!user) {
        throw new Error('This page needs a signed-in player.');
    }

    return user;
}
