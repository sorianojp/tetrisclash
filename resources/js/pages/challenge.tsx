import { Head, Link, router, usePage } from '@inertiajs/react';
import { useEcho } from '@laravel/echo-react';
import { Check, Copy, Flag, Swords } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { dashboard } from '@/routes';
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

    useEcho<{ duelId: number }>(
        `App.Models.User.${auth.user.id}`,
        'DuelFound',
        ({ duelId }) => router.visit(showDuel(duelId)),
    );

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
            <div className="flex h-full flex-1 items-start justify-center p-4 sm:items-center">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <mode.icon className="size-5" />
                            {isChallenger
                                ? `Your ${mode.label.toLowerCase()} challenge`
                                : `${challenger.name} challenges you!`}
                        </CardTitle>
                        <CardDescription>
                            {mode.rules} Friendly match: no rating or XP.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        <div className="flex items-center gap-3 rounded-lg border p-3">
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
                            <Closed message="This challenge has expired." />
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
                                    Cancel challenge
                                </Button>
                            </>
                        ) : (
                            <Button
                                size="lg"
                                onClick={() =>
                                    router.post(accept(challenge.code).url)
                                }
                            >
                                <mode.icon /> Accept {mode.label.toLowerCase()}
                            </Button>
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

function Closed({ message }: { message: string }) {
    return (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button variant="outline" asChild>
                <Link href={dashboard()}>Back to lobby</Link>
            </Button>
        </div>
    );
}
