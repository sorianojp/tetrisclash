import { router } from '@inertiajs/react';
import { useEcho } from '@laravel/echo-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { InviteCard } from '@/components/tetris/invite-card';
import type { Invite } from '@/components/tetris/invite-card';
import { startOnlinePing } from '@/hooks/use-online';
import { sendJson } from '@/lib/api';
import { accept, decline } from '@/routes/challenges';
import { show as showDuel } from '@/routes/duels';

/**
 * On every signed-in page: keeps the player in the online list, shows invites from other
 * players as a card in the middle of the screen until they expire (one at a time, oldest
 * first), and announces achievements as they unlock.
 */
export function InviteListener({ userId }: { userId: number }) {
    const [invites, setInvites] = useState<
        { invite: Invite; receivedAt: number }[]
    >([]);
    const current = invites[0];

    useEffect(() => startOnlinePing(), []);

    const close = useCallback(
        (code: string) =>
            setInvites((list) => list.filter((i) => i.invite.code !== code)),
        [],
    );

    useEcho<Invite>(`App.Models.User.${userId}`, 'InviteReceived', (invite) =>
        setInvites((list) => [
            // A newer invite from the same player replaces theirs.
            ...list.filter(
                (i) => i.invite.challenger.id !== invite.challenger.id,
            ),
            { invite, receivedAt: Date.now() },
        ]),
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
                close(code);
            }
        },
    );

    if (!current) {
        return null;
    }

    const { code } = current.invite;

    return (
        <InviteCard
            key={code}
            invite={current.invite}
            receivedAt={current.receivedAt}
            onAccept={() => {
                close(code);
                router.post(accept(code).url);
            }}
            onDecline={() => {
                close(code);
                void sendJson(decline(code)).catch(() => {});
            }}
            onDismiss={() => close(code)}
        />
    );
}
