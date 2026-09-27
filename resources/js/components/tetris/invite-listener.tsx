import { router } from '@inertiajs/react';
import { useEcho } from '@laravel/echo-react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { goOnline } from '@/hooks/use-online-players';
import { sendJson } from '@/lib/api';
import { accept, decline } from '@/routes/challenges';

type Invite = {
    code: string;
    mode: 'battle' | 'race';
    expiresInMs: number;
    challenger: {
        id: number;
        name: string;
        rating: number;
        rank: RankProgress;
    };
};

const toastId = (code: string) => `invite-${code}`;

/**
 * On every signed-in page: keeps the player in the online list, and pops up invites
 * from other players with Accept / Decline until they expire.
 */
export function InviteListener({ userId }: { userId: number }) {
    useEffect(() => goOnline(), []);

    useEcho<Invite>(
        `App.Models.User.${userId}`,
        'InviteReceived',
        ({ code, mode, expiresInMs, challenger }) => {
            toast(`${challenger.name} invites you to a ${mode}`, {
                id: toastId(code),
                description: `${challenger.rank.title} · rating ${challenger.rating}. Friendly match: no rating or XP.`,
                duration: expiresInMs,
                action: {
                    label: 'Accept',
                    onClick: () => router.post(accept(code).url),
                },
                cancel: {
                    label: 'Decline',
                    onClick: () => void sendJson(decline(code)).catch(() => {}),
                },
            });
        },
    );

    // The challenger took the invite back (cancelled, or sent a new one).
    useEcho<{ code: string; reason: string }>(
        `App.Models.User.${userId}`,
        'InviteClosed',
        ({ code, reason }) => {
            if (reason === 'cancelled') {
                toast.dismiss(toastId(code));
            }
        },
    );

    return null;
}
