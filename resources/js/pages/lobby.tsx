import { Head, Link, router, usePage } from '@inertiajs/react';
import { useEcho } from '@laravel/echo-react';
import { Crown, Gamepad2, Swords, Timer, Trophy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ControlsLegend } from '@/components/tetris/controls-legend';
import { RankBadge, RankProgressBar } from '@/components/tetris/rank-badge';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { sendJson } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { dashboard, practice } from '@/routes';
import { show as showDuel } from '@/routes/duels';
import { join, leave } from '@/routes/matchmaking';

type Props = {
    stats: {
        rating: number;
        wins: number;
        losses: number;
        bestSprintMs: number | null;
        rank: RankProgress;
    };
    leaderboard: {
        id: number;
        name: string;
        rating: number;
        wins: number;
        losses: number;
        rank: RankProgress;
    }[];
    recentDuels: {
        id: number;
        opponent: string;
        result: 'win' | 'loss' | 'draw';
        myKos: number;
        theirKos: number;
        reason: string | null;
        ratingChange: number | null;
        finishedAt: string | null;
    }[];
    activeDuelId: number | null;
};

/** Re-join the queue this often so the server knows we're still searching. */
const QUEUE_REFRESH_MS = 5000;

export default function Lobby({
    stats,
    leaderboard,
    recentDuels,
    activeDuelId,
}: Props) {
    const { auth } = usePage().props;
    const [searching, setSearching] = useState(false);
    const [searchStartedAt, setSearchStartedAt] = useState(0);
    const [now, setNow] = useState(() => Date.now());
    const searchingRef = useRef(false);

    const goToDuel = (duelId: number) => {
        searchingRef.current = false;
        router.visit(showDuel(duelId));
    };

    useEcho<{ duelId: number }>(
        `App.Models.User.${auth.user.id}`,
        'DuelFound',
        ({ duelId }) => goToDuel(duelId),
    );

    const joinQueue = async () => {
        const response = await sendJson<{ duelId?: number; queued?: boolean }>(
            join(),
        );

        if (response.duelId) {
            goToDuel(response.duelId);
        }
    };

    const startSearch = () => {
        searchingRef.current = true;
        setSearching(true);
        setSearchStartedAt(Date.now());
        void joinQueue();
    };

    const cancelSearch = () => {
        searchingRef.current = false;
        setSearching(false);
        void sendJson(leave());
    };

    // While searching: keep our queue spot fresh and tick the search timer.
    useEffect(() => {
        if (!searching) {
            return;
        }

        const refresh = setInterval(() => void joinQueue(), QUEUE_REFRESH_MS);
        const tick = setInterval(() => setNow(Date.now()), 1000);

        return () => {
            clearInterval(refresh);
            clearInterval(tick);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searching]);

    // Leave the queue if the player navigates away mid-search.
    useEffect(
        () => () => {
            if (searchingRef.current) {
                void sendJson(leave(), undefined, { keepalive: true });
            }
        },
        [],
    );

    // "Play again" from a finished duel lands here with ?queue=1.
    useEffect(() => {
        if (
            new URLSearchParams(window.location.search).get('queue') === '1' &&
            !activeDuelId
        ) {
            window.history.replaceState({}, '', dashboard().url);
            startSearch();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const played = stats.wins + stats.losses;
    const winRate = played > 0 ? Math.round((stats.wins / played) * 100) : null;

    return (
        <>
            <Head title="Lobby" />
            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                {activeDuelId && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
                        <span>You have a match in progress.</span>
                        <Button
                            size="sm"
                            onClick={() => goToDuel(activeDuelId)}
                        >
                            Rejoin match
                        </Button>
                    </div>
                )}

                <div className="grid gap-4 lg:grid-cols-3">
                    <Card className="overflow-hidden lg:col-span-2">
                        <div className="relative bg-gradient-to-br from-indigo-950 via-violet-900 to-fuchsia-900 p-6 text-white sm:p-8">
                            <TetrominoBackdrop />
                            <div className="relative flex flex-col gap-4">
                                <div>
                                    <p className="text-xs font-semibold tracking-[0.2em] text-fuchsia-200 uppercase">
                                        Tetris Battle · 1v1
                                    </p>
                                    <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
                                        Battle for the top
                                    </h1>
                                    <p className="mt-2 max-w-md text-sm text-indigo-100">
                                        Two minutes. Clear lines to send
                                        garbage. Top your opponent out three
                                        times to win by KO. Otherwise, most KOs
                                        wins, then most lines sent.
                                    </p>
                                </div>

                                {searching ? (
                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 font-medium">
                                            <Spinner />
                                            Searching for an opponent…
                                            <span className="text-indigo-200 tabular-nums">
                                                {formatTime(
                                                    Math.max(
                                                        0,
                                                        now - searchStartedAt,
                                                    ),
                                                    false,
                                                )}
                                            </span>
                                        </div>
                                        <Button
                                            variant="secondary"
                                            onClick={cancelSearch}
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap gap-3">
                                        <Button
                                            size="lg"
                                            className="bg-amber-400 font-bold text-amber-950 hover:bg-amber-300"
                                            onClick={startSearch}
                                            disabled={activeDuelId !== null}
                                        >
                                            <Swords /> Find match
                                        </Button>
                                        <Button
                                            size="lg"
                                            variant="secondary"
                                            className="bg-white/10 text-white hover:bg-white/20"
                                            asChild
                                        >
                                            <Link href={practice()}>
                                                <Gamepad2 /> Practice
                                            </Link>
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Your stats</CardTitle>
                            <CardDescription>
                                Ranked matches earn XP and move your rating.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 gap-3">
                            <div className="col-span-2 flex flex-col gap-2 rounded-lg border p-3">
                                <RankBadge
                                    progress={stats.rank}
                                    className="self-start text-sm"
                                />
                                <RankProgressBar progress={stats.rank} />
                            </div>
                            <Stat
                                icon={<Trophy className="size-4" />}
                                label="Rating"
                                value={stats.rating}
                            />
                            <Stat
                                icon={<Swords className="size-4" />}
                                label="Record"
                                value={`${stats.wins}W – ${stats.losses}L`}
                            />
                            <Stat
                                label="Win rate"
                                value={winRate === null ? '—' : `${winRate}%`}
                            />
                            <Stat
                                icon={<Timer className="size-4" />}
                                label="Best 40L"
                                value={
                                    stats.bestSprintMs
                                        ? formatTime(stats.bestSprintMs)
                                        : '—'
                                }
                            />
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Crown className="size-4 text-amber-500" />{' '}
                                Leaderboard
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {leaderboard.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    No ranked matches yet. Be the first!
                                </p>
                            ) : (
                                <ol className="flex flex-col gap-1 text-sm">
                                    {leaderboard.map((player, i) => (
                                        <li
                                            key={player.id}
                                            className={cn(
                                                'flex items-center gap-3 rounded-md px-2 py-1.5',
                                                player.id === auth.user.id &&
                                                    'bg-muted',
                                            )}
                                        >
                                            <span className="w-5 text-right font-mono text-muted-foreground">
                                                {i + 1}
                                            </span>
                                            <RankBadge
                                                progress={player.rank}
                                                compact
                                            />
                                            <span className="flex-1 truncate font-medium">
                                                {player.name}
                                            </span>
                                            <span className="text-xs text-muted-foreground tabular-nums">
                                                {player.wins}–{player.losses}
                                            </span>
                                            <span className="w-12 text-right font-semibold tabular-nums">
                                                {player.rating}
                                            </span>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Recent matches</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {recentDuels.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Your match history will show up here.
                                </p>
                            ) : (
                                <ul className="flex flex-col gap-2 text-sm">
                                    {recentDuels.map((duel) => (
                                        <li
                                            key={duel.id}
                                            className="flex items-center gap-3"
                                        >
                                            <ResultBadge result={duel.result} />
                                            <span className="flex-1 truncate">
                                                vs{' '}
                                                <span className="font-medium">
                                                    {duel.opponent}
                                                </span>
                                                <span className="ml-1 text-xs text-muted-foreground">
                                                    {duel.myKos}–{duel.theirKos}{' '}
                                                    KO
                                                    {duel.reason &&
                                                    duel.reason !== 'time' &&
                                                    duel.reason !== 'knockout'
                                                        ? ` · ${duel.reason}`
                                                        : ''}
                                                </span>
                                            </span>
                                            <span className="text-xs whitespace-nowrap text-muted-foreground">
                                                {duel.finishedAt}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Controls</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ControlsLegend />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </>
    );
}

Lobby.layout = {
    breadcrumbs: [{ title: 'Lobby', href: dashboard() }],
};

function Stat({
    label,
    value,
    icon,
}: {
    label: string;
    value: string | number;
    icon?: React.ReactNode;
}) {
    return (
        <div className="rounded-lg border p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {icon}
                {label}
            </div>
            <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
        </div>
    );
}

function ResultBadge({ result }: { result: 'win' | 'loss' | 'draw' }) {
    const styles = {
        win: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
        loss: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
        draw: 'bg-muted text-muted-foreground',
    };

    return (
        <Badge
            variant="outline"
            className={cn(
                'w-12 justify-center border-transparent uppercase',
                styles[result],
            )}
        >
            {result}
        </Badge>
    );
}

/** Decorative falling blocks for the hero card. */
function TetrominoBackdrop() {
    const blocks = [
        { color: 'bg-cyan-400', className: 'right-6 top-4 h-4 w-16' },
        { color: 'bg-amber-400', className: 'right-28 top-12 size-8' },
        { color: 'bg-fuchsia-500', className: 'right-10 bottom-6 h-4 w-12' },
        { color: 'bg-lime-400', className: 'right-44 bottom-10 h-8 w-4' },
        { color: 'bg-rose-500', className: 'right-20 top-28 h-4 w-8' },
    ];

    return (
        <div
            aria-hidden
            className="pointer-events-none absolute inset-0 hidden opacity-60 sm:block"
        >
            {blocks.map((block, i) => (
                <div
                    key={i}
                    className={cn(
                        'absolute rounded-sm shadow-[inset_0_2px_0_rgba(255,255,255,0.4)]',
                        block.color,
                        block.className,
                    )}
                />
            ))}
        </div>
    );
}
