import { Head, Link, router, usePage } from '@inertiajs/react';
import { useEcho } from '@laravel/echo-react';
import {
    Crown,
    Flag,
    Gamepad2,
    Swords,
    Timer,
    Trophy,
    UserPlus,
    Zap,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ControlsLegend } from '@/components/tetris/controls-legend';
import { DuelHistory } from '@/components/tetris/duel-history';
import { EnergyMeter, liveEnergy } from '@/components/tetris/energy-meter';
import type { EnergyStatus } from '@/components/tetris/energy-meter';
import { OnlineNow } from '@/components/tetris/online-now';
import { PracticeLeaderboard } from '@/components/tetris/practice-leaderboard';
import type { PracticeBoards } from '@/components/tetris/practice-leaderboard';
import type { DuelSummary } from '@/components/tetris/duel-history';
import { RankBadge, RankProgressBar } from '@/components/tetris/rank-badge';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { sendJson } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { dashboard, practice } from '@/routes';
import { store as storeChallenge } from '@/routes/challenges';
import { show as showDuel } from '@/routes/duels';
import { join, leave } from '@/routes/matchmaking';
import { show as showPlayer } from '@/routes/players';
import {
    PRACTICE_MODES,
    RECORD_MODES,
    formatRecord,
} from '@/tetris/practice-modes';
import type { PracticeRecords, RecordMode } from '@/tetris/practice-modes';

type Props = {
    stats: {
        rating: number;
        wins: number;
        losses: number;
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
    practiceLeaderboards: PracticeBoards;
    recentDuels: DuelSummary[];
    records: PracticeRecords;
    activeDuelId: number | null;
    onlineCount: number;
    energy: EnergyStatus;
    serverNow: number;
};

const OUT_OF_ENERGY =
    'Out of energy. It refills over time; friendly matches and practice are free.';

/** Re-join the queue this often so the server knows we're still searching. */
const QUEUE_REFRESH_MS = 5000;

export default function Lobby({
    stats,
    leaderboard,
    practiceLeaderboards,
    recentDuels,
    records,
    activeDuelId,
    onlineCount,
    energy,
    serverNow,
}: Props) {
    const { auth } = usePage().props;
    const [searching, setSearching] = useState(false);
    const [searchStartedAt, setSearchStartedAt] = useState(0);
    /** Rating gap the server currently accepts for us; null = any opponent. */
    const [searchRange, setSearchRange] = useState<number | null | undefined>();
    const [now, setNow] = useState(() => Date.now());
    const [clockOffset] = useState(() => serverNow - Date.now());
    const [board, setBoard] = useState<'ranked' | RecordMode>('ranked');
    const searchingRef = useRef(false);
    const liveEnergyNow = liveEnergy(energy, now + clockOffset);
    const hasEnergy = liveEnergyNow.current > 0;

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
        const response = await sendJson<{
            duelId?: number;
            queued?: boolean;
            range?: number | null;
            outOfEnergy?: boolean;
        }>(join());

        if (response.duelId) {
            goToDuel(response.duelId);
        } else if (response.outOfEnergy) {
            searchingRef.current = false;
            setSearching(false);
            toast.error(OUT_OF_ENERGY);
            router.reload({ only: ['energy', 'serverNow'] });
        } else {
            setSearchRange(response.range);
        }
    };

    const startSearch = () => {
        if (!hasEnergy) {
            toast.error(OUT_OF_ENERGY);

            return;
        }

        setSearchRange(undefined);
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

    // Ticks the search timer and the energy refill countdown.
    useEffect(() => {
        const tick = setInterval(() => setNow(Date.now()), 1000);

        return () => clearInterval(tick);
    }, []);

    // While searching: keep our queue spot fresh.
    useEffect(() => {
        if (!searching) {
            return;
        }

        const refresh = setInterval(() => void joinQueue(), QUEUE_REFRESH_MS);

        return () => clearInterval(refresh);
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

    /** Open a challenge link; the server sends us to its page to share it. */
    const challenge = (mode: 'battle' | 'race') =>
        router.post(storeChallenge().url, { mode });

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
                    <div className="flex flex-col gap-4 lg:col-span-2">
                        <Card className="overflow-hidden">
                            <div className="relative bg-gradient-to-br from-indigo-950 via-violet-900 to-fuchsia-900 p-6 text-white sm:p-8">
                                <TetrominoBackdrop />
                                <div className="relative flex flex-col gap-4">
                                    <div>
                                        <p className="text-xs font-semibold tracking-[0.2em] text-fuchsia-200 uppercase">
                                            Tetris Clash · 1v1
                                        </p>
                                        <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
                                            Battle for the top
                                        </h1>
                                        <p className="mt-2 max-w-md text-sm text-indigo-100">
                                            Two minutes. Clear lines to send
                                            garbage. Top your opponent out three
                                            times to win by KO. Otherwise, most
                                            KOs wins, then most lines sent.
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
                                                            now -
                                                                searchStartedAt,
                                                        ),
                                                        false,
                                                    )}
                                                </span>
                                                {searchRange !== undefined && (
                                                    <span className="text-xs text-indigo-200">
                                                        {searchRange === null
                                                            ? 'any rating'
                                                            : `rating ±${searchRange}`}
                                                    </span>
                                                )}
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
                                                disabled={
                                                    activeDuelId !== null ||
                                                    !hasEnergy
                                                }
                                            >
                                                <Swords /> Find match
                                                <span className="flex items-center gap-0.5 rounded bg-amber-950/15 px-1.5 text-xs">
                                                    <Zap className="size-3" />1
                                                </span>
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
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button
                                                        size="lg"
                                                        variant="secondary"
                                                        className="bg-white/10 text-white hover:bg-white/20"
                                                        disabled={
                                                            activeDuelId !==
                                                            null
                                                        }
                                                    >
                                                        <UserPlus /> Challenge a
                                                        friend
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="start">
                                                    <DropdownMenuItem
                                                        onSelect={() =>
                                                            challenge('battle')
                                                        }
                                                    >
                                                        <Swords /> Battle
                                                        <span className="ml-auto text-xs text-muted-foreground">
                                                            3 KOs
                                                        </span>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onSelect={() =>
                                                            challenge('race')
                                                        }
                                                    >
                                                        <Flag /> Race
                                                        <span className="ml-auto text-xs text-muted-foreground">
                                                            First to 40 lines
                                                        </span>
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    )}

                                    <EnergyMeter
                                        current={liveEnergyNow.current}
                                        max={energy.max}
                                        nextInMs={liveEnergyNow.nextInMs}
                                        intervalMs={energy.intervalMs}
                                    />
                                </div>
                            </div>
                        </Card>

                        <OnlineNow initialCount={onlineCount} />
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between gap-2">
                                Your stats
                                <Link
                                    href={showPlayer(auth.user.id)}
                                    className="text-xs font-normal text-muted-foreground hover:underline"
                                >
                                    View profile
                                </Link>
                            </CardTitle>
                            <CardDescription>
                                Ranked matches earn XP and move your rating.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="grid grid-cols-3 gap-3">
                            <div className="col-span-3 flex flex-col gap-2 rounded-lg border p-3">
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
                            <div className="col-span-3 rounded-lg border p-3">
                                <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Timer className="size-4" /> Practice bests
                                </div>
                                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                    {RECORD_MODES.map((mode) => (
                                        <div
                                            key={mode}
                                            className="flex justify-between gap-2"
                                        >
                                            <dt className="text-muted-foreground">
                                                {PRACTICE_MODES[mode].label}
                                            </dt>
                                            <dd className="font-semibold tabular-nums">
                                                {records[mode] === null
                                                    ? '—'
                                                    : formatRecord(
                                                          mode,
                                                          records[mode],
                                                      )}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-2">
                                    <Crown className="size-4 text-amber-500" />{' '}
                                    Leaderboard
                                </span>
                                <Select
                                    value={board}
                                    onValueChange={(value) =>
                                        setBoard(value as typeof board)
                                    }
                                >
                                    <SelectTrigger
                                        size="sm"
                                        aria-label="Leaderboard"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent align="end">
                                        <SelectItem value="ranked">
                                            Ranked
                                        </SelectItem>
                                        {RECORD_MODES.map((mode) => (
                                            <SelectItem key={mode} value={mode}>
                                                {PRACTICE_MODES[mode].label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {board !== 'ranked' ? (
                                <PracticeLeaderboard
                                    mode={board}
                                    board={practiceLeaderboards[board]}
                                />
                            ) : leaderboard.length === 0 ? (
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
                                            <Link
                                                href={showPlayer(player.id)}
                                                className="flex-1 truncate font-medium hover:underline"
                                            >
                                                {player.name}
                                            </Link>
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
                            <DuelHistory
                                duels={recentDuels}
                                empty="Your match history will show up here."
                            />
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
