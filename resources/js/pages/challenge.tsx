import { Head, Link, router, usePage } from '@inertiajs/react';
import { useEcho } from '@laravel/echo-react';
import {
    Check,
    Copy,
    Flag,
    Gamepad2,
    House,
    LogIn,
    Swords,
    X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { PlayerEmblem } from '@/components/tetris/player-emblem';
import { RankBadge } from '@/components/tetris/rank-badge';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useClipboard } from '@/hooks/use-clipboard';
import { formatTime } from '@/lib/format';
import { dashboard, login, practice, register } from '@/routes';
import { accept, destroy } from '@/routes/challenges';
import { show as showDuel } from '@/routes/duels';
import { show as showPlayer } from '@/routes/players';

type Props = {
    challenge: {
        code: string;
        mode: 'battle' | 'race';
        status: 'open' | 'accepted' | 'expired';
        expiresAt: number;
        url: string;
    };
    challenger: {
        id: number;
        name: string;
        rating: number;
        rank: RankProgress;
    };
    /** Set when this is an invite to one player rather than a shareable link. */
    invitee: { id: number; name: string } | null;
    isChallenger: boolean;
    serverNow: number;
};

const MODE_INFO = {
    battle: {
        label: 'Battle',
        icon: Swords,
        rules: 'Send garbage, top your friend out 3 times. Two minutes.',
    },
    race: {
        label: 'Race',
        icon: Flag,
        rules: 'First to clear 40 lines wins. No garbage, just speed.',
    },
};

/** Without the socket server we'd never hear the accept, so check back now and then. */
const POLL_MS = 5000;

export default function Challenge({
    challenge,
    challenger,
    invitee,
    isChallenger,
    serverNow,
}: Props) {
    const { auth } = usePage().props;
    const [clockOffset] = useState(() => serverNow - Date.now());
    const [now, setNow] = useState(() => Date.now() + clockOffset);
    const [copied, copy] = useClipboard();
    const mode = MODE_INFO[challenge.mode];
    const remaining = Math.max(0, challenge.expiresAt - now);
    const expired = challenge.status === 'expired' || remaining === 0;

    useEffect(() => {
        if (!isChallenger || challenge.status !== 'open') {
            return;
        }

        const tick = setInterval(() => setNow(Date.now() + clockOffset), 1000);
        // Reloading an accepted challenge redirects us into the duel.
        const poll = setInterval(
            () => router.reload({ only: ['challenge'] }),
            POLL_MS,
        );

        return () => {
            clearInterval(tick);
            clearInterval(poll);
        };
    }, [isChallenger, challenge.status, clockOffset]);

    return (
        <>
            <Head title={`${mode.label} challenge`} />
            {auth.user && (
                <ChallengeEvents
                    userId={auth.user.id}
                    code={challenge.code}
                    inviteeName={invitee?.name}
                />
            )}
            <div className="flex h-full flex-1 items-start justify-center p-4 sm:items-center sm:p-6">
                <Card
                    accent={challenge.mode === 'race' ? 'cyan' : 'violet'}
                    className="w-full max-w-md"
                >
                    <CardHeader className="items-center text-center">
                        <span className="mb-1 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/30">
                            <mode.icon className="size-6" />
                        </span>
                        <CardTitle className="justify-center text-2xl font-black">
                            {isChallenger
                                ? invitee
                                    ? `${mode.label} invite to ${invitee.name}`
                                    : `Your ${mode.label.toLowerCase()} challenge`
                                : `${challenger.name} challenges you!`}
                        </CardTitle>
                        <CardDescription>
                            {mode.rules} Friendly match: no rating or XP.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3 dark:bg-white/[0.03]">
                            <PlayerEmblem
                                name={challenger.name}
                                id={challenger.id}
                                size="md"
                            />
                            <div className="min-w-0 flex-1">
                                <Link
                                    href={showPlayer(challenger.id)}
                                    className="block truncate font-semibold hover:underline"
                                >
                                    {challenger.name}
                                </Link>
                                <span className="text-xs text-muted-foreground tabular-nums">
                                    Rating {challenger.rating}
                                </span>
                            </div>
                            <RankBadge progress={challenger.rank} />
                        </div>

                        {challenge.status === 'accepted' ? (
                            <Closed message="This challenge was already accepted." />
                        ) : expired ? (
                            <Closed
                                message={
                                    invitee && isChallenger
                                        ? `${invitee.name} didn't answer in time.`
                                        : 'This challenge has expired.'
                                }
                            />
                        ) : isChallenger && invitee ? (
                            <>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Spinner />
                                    Waiting for {invitee.name} to accept…{' '}
                                    <span className="tabular-nums">
                                        {formatTime(remaining, false)}
                                    </span>
                                </div>
                                <Button
                                    variant="ghost"
                                    onClick={() =>
                                        router.delete(
                                            destroy(challenge.code).url,
                                        )
                                    }
                                >
                                    <X /> Cancel invite
                                </Button>
                            </>
                        ) : isChallenger ? (
                            <>
                                <div className="flex flex-col gap-2">
                                    <span className="text-sm font-medium">
                                        Send this link to a friend
                                    </span>
                                    <div className="flex gap-2">
                                        <Input
                                            readOnly
                                            value={challenge.url}
                                            onFocus={(event) =>
                                                event.currentTarget.select()
                                            }
                                        />
                                        <Button
                                            variant="outline"
                                            onClick={() =>
                                                void copy(challenge.url)
                                            }
                                        >
                                            {copied === challenge.url ? (
                                                <Check />
                                            ) : (
                                                <Copy />
                                            )}
                                            {copied === challenge.url
                                                ? 'Copied'
                                                : 'Copy'}
                                        </Button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Spinner />
                                    Waiting for your friend… link expires in{' '}
                                    <span className="tabular-nums">
                                        {formatTime(remaining, false)}
                                    </span>
                                </div>
                                <Button
                                    variant="ghost"
                                    onClick={() =>
                                        router.delete(
                                            destroy(challenge.code).url,
                                        )
                                    }
                                >
                                    <X /> Cancel challenge
                                </Button>
                            </>
                        ) : auth.user ? (
                            <Button
                                size="lg"
                                className="h-12 bg-gradient-to-r from-amber-300 to-amber-400 text-base font-black text-amber-950 italic shadow-lg shadow-amber-500/25 hover:from-amber-200 hover:to-amber-300"
                                onClick={() =>
                                    router.post(accept(challenge.code).url)
                                }
                            >
                                <mode.icon /> Accept {mode.label.toLowerCase()}
                            </Button>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <Button
                                    size="lg"
                                    className="h-12 bg-gradient-to-r from-amber-300 to-amber-400 text-base font-black text-amber-950 italic shadow-lg shadow-amber-500/25 hover:from-amber-200 hover:to-amber-300"
                                    asChild
                                >
                                    <Link href={register()}>
                                        <mode.icon /> Sign up free to accept
                                    </Link>
                                </Button>
                                <Button variant="ghost" asChild>
                                    <Link href={login()}>
                                        <LogIn /> Have an account? Log in
                                    </Link>
                                </Button>
                                <p className="text-center text-xs text-muted-foreground">
                                    Takes a few seconds. You'll come straight
                                    back here to play.
                                </p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

Challenge.layout = {
    breadcrumbs: [
        { title: 'Lobby', href: dashboard() },
        { title: 'Challenge', href: dashboard() },
    ],
};

/** Hear when the challenge is accepted (or an invite declined), for a signed-in viewer. */
function ChallengeEvents({
    userId,
    code,
    inviteeName,
}: {
    userId: number;
    code: string;
    inviteeName?: string;
}) {
    useEcho<{ duelId: number }>(
        `App.Models.User.${userId}`,
        'DuelFound',
        ({ duelId }) => router.visit(showDuel(duelId)),
    );

    useEcho<{ code: string; reason: string }>(
        `App.Models.User.${userId}`,
        'InviteClosed',
        (event) => {
            if (event.code === code && event.reason === 'declined') {
                toast.info(`${inviteeName ?? 'They'} declined your invite.`);
                router.visit(dashboard());
            }
        },
    );

    return null;
}

function Closed({ message }: { message: string }) {
    const { auth } = usePage().props;

    return (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
            <p className="text-sm text-muted-foreground">{message}</p>
            {auth.user ? (
                <Button variant="outline" asChild>
                    <Link href={dashboard()}>
                        <House /> Back to lobby
                    </Link>
                </Button>
            ) : (
                <Button asChild>
                    <Link href={practice()}>
                        <Gamepad2 /> Try practice mode, free
                    </Link>
                </Button>
            )}
        </div>
    );
}
