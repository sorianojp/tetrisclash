import { router } from '@inertiajs/react';
import { useEcho } from '@laravel/echo-react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { startOnlinePing } from '@/hooks/use-online';
import { sendJson } from '@/lib/api';
import { accept, decline } from '@/routes/challenges';
import { show as showDuel } from '@/routes/duels';

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
 * On every signed-in page: keeps the player in the online list, pops up invites
 * from other players with Accept / Decline until they expire, and announces
 * achievements as they unlock.
 */
export function InviteListener({ userId }: { userId: number }) {
    useEffect(() => startOnlinePing(), []);

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

    // A bracket match started: go play it, wherever we are.
    useEcho<{ duelId: number; tournament: string }>(
        `App.Models.User.${userId}`,
        'TournamentMatchReady',
        ({ duelId, tournament }) => {
            toast.info(`${tournament}: your match is starting`);
            router.visit(showDuel(duelId));
        },
    );

    useEcho<{ title: string; description: string }>(
        `App.Models.User.${userId}`,
        'AchievementUnlocked',
        ({ title, description }) =>
            toast.success(`Achievement unlocked: ${title}`, { description }),
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
