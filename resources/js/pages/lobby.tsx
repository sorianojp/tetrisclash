import { Head, Link, router } from '@inertiajs/react';
import { useEcho } from '@laravel/echo-react';
import {
    ChevronRight,
    Crown,
    Flag,
    Gamepad2,
    History,
    Keyboard,
    Swords,
    Timer,
    Trophy,
    UserPlus,
    X,
    Zap,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AutopilotBar } from '@/components/tetris/autopilot-bar';
import { ControlsLegend } from '@/components/tetris/controls-legend';
import { DuelHistory } from '@/components/tetris/duel-history';
import { EnergyMeter, liveEnergy } from '@/components/tetris/energy-meter';
import type { EnergyStatus } from '@/components/tetris/energy-meter';
import { OnlineNow } from '@/components/tetris/online-now';
import { PracticeLeaderboard } from '@/components/tetris/practice-leaderboard';
import type { PracticeBoards } from '@/components/tetris/practice-leaderboard';
import type { DuelSummary } from '@/components/tetris/duel-history';
import { PlayerEmblem } from '@/components/tetris/player-emblem';
import { RankBadge, RankShowcase } from '@/components/tetris/rank-badge';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { StatTile } from '@/components/tetris/stat-tile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { show as showTournament } from '@/routes/tournaments';
import { AUTOPILOT_PAUSE_MS, useAutopilot } from '@/tetris/autopilot';
import {
    PRACTICE_MODES,
    RECORD_MODES,
    formatRecord,
} from '@/tetris/practice-modes';
import type { PracticeRecords, RecordMode } from '@/tetris/practice-modes';
import { useUser } from '@/hooks/use-user';

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

/** A long-running autopilot tab starts fresh every so often (from here, between matches). */
const AUTOPILOT_RELOAD_AFTER_MS = 3 * 60 * 60 * 1000;

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
    const user = useUser();
    const autopilot = useAutopilot();
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
        `App.Models.User.${user.id}`,
        'DuelFound',
        ({ duelId }) => goToDuel(duelId),
    );

    const joinQueue = async () => {
        const response = await sendJson<{
            duelId?: number;
            queued?: boolean;
            range?: number | null;
            outOfEnergy?: boolean;
            inTournament?: number;
        }>(join());

        if (response.duelId) {
            goToDuel(response.duelId);
        } else if (response.inTournament) {
            searchingRef.current = false;
            setSearching(false);
            // Bracket matches need a person to show up for them; hand back the controls.
            autopilot.stop();
            toast.info(
                "You're still in a tournament. Your next match starts on its own.",
                {
                    action: {
                        label: 'Bracket',
                        onClick: () =>
                            router.visit(
                                showTournament(response.inTournament!),
                            ),
                    },
                },
            );
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

    // Autopilot: rejoin a match in progress, queue for ranked while there's energy, and
    // practice Zen while it refills.
    useEffect(() => {
        if (!autopilot.running || searching) {
            return;
        }

        const next = setTimeout(() => {
            if (activeDuelId) {
                goToDuel(activeDuelId);
            } else if (performance.now() > AUTOPILOT_RELOAD_AFTER_MS) {
                window.location.assign(dashboard().url);
            } else if (hasEnergy) {
                startSearch();
            } else {
                router.visit(practice({ query: { mode: 'zen' } }));
            }
        }, AUTOPILOT_PAUSE_MS / 2);

        return () => clearTimeout(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autopilot.running, searching, hasEnergy, activeDuelId]);

    /** Open a challenge link; the server sends us to its page to share it. */
    const challenge = (mode: 'battle' | 'race') =>
        router.post(storeChallenge().url, { mode });

    const played = stats.wins + stats.losses;
    const winRate = played > 0 ? Math.round((stats.wins / played) * 100) : null;

    return (
        <>
            <Head title="Lobby" />
            <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 sm:p-6">
                {activeDuelId && (
                    <Card className="flex-row flex-wrap items-center justify-between gap-3 px-5 py-4">
                        <span className="flex items-center gap-2 text-sm font-semibold">
                            <span className="relative flex size-2.5">
                                <span className="absolute inline-flex size-full rounded-full bg-amber-400 opacity-60 motion-safe:animate-ping" />
                                <span className="relative inline-flex size-2.5 rounded-full bg-amber-400" />
                            </span>
                            You have a match in progress.
                        </span>
                        <Button
                            size="sm"
                            className="bg-amber-400 font-bold text-amber-950 hover:bg-amber-300"
                            onClick={() => goToDuel(activeDuelId)}
                        >
                            <Swords /> Rejoin match
                        </Button>
                    </Card>
                )}

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <Card className="gap-0 overflow-hidden py-0 lg:col-span-2">
                        <div className="relative h-full bg-violet-900 p-6 text-white sm:p-8">
                            <TetrominoBackdrop />
                            <div className="relative flex h-full flex-col gap-5">
                                <div>
                                    <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold tracking-[0.25em] text-fuchsia-100 uppercase">
                                        <Swords className="size-3.5" /> Ranked
                                        1v1
                                    </p>
                                    <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
                                        Battle for{' '}
                                        <span className="inline-block pr-[0.15em] pb-[0.12em] text-amber-300">
                                            the top
                                        </span>
                                    </h1>
                                    <p className="mt-3 max-w-md text-sm text-indigo-100 sm:text-base">
                                        Two minutes. Clear lines to send
                                        garbage. Top your opponent out three
                                        times to win by KO. Otherwise, most KOs
                                        wins, then most lines sent.
                                    </p>
                                </div>

                                {searching ? (
                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 font-semibold ring-1 ring-white/15">
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
                                            <X /> Cancel
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap gap-3">
                                        <Button
                                            size="lg"
                                            className="h-12 bg-amber-300 px-6 text-base font-black text-amber-950 shadow-lg shadow-amber-500/30 hover:bg-amber-200"
                                            onClick={startSearch}
                                            disabled={
                                                activeDuelId !== null ||
                                                !hasEnergy
                                            }
                                        >
                                            <Swords /> FIND MATCH
                                            <span className="flex items-center gap-0.5 rounded bg-amber-950/15 px-1.5 text-xs">
                                                <Zap className="size-3" />1
                                            </span>
                                        </Button>
                                        <Button
                                            size="lg"
                                            variant="secondary"
                                            className="h-12 bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20"
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
                                                    className="h-12 bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20"
                                                    disabled={
                                                        activeDuelId !== null
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

                                <div className="mt-auto flex flex-wrap items-end justify-between gap-4">
                                    <EnergyMeter
                                        current={liveEnergyNow.current}
                                        max={energy.max}
                                        nextInMs={liveEnergyNow.nextInMs}
                                        intervalMs={energy.intervalMs}
                                    />
                                    <OnlineNow initialCount={onlineCount} />
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Your player card, like the ones in the match intro. */}
                    <Card className="gap-5 px-6">
                        <div className="flex items-center gap-2.5">
                            <PlayerEmblem
                                name={user.name}
                                id={user.id}
                                size="sm"
                            />
                            <h2 className="min-w-0 flex-1 truncate text-lg font-black tracking-tight">
                                {user.name}
                            </h2>
                            <span className="text-[11px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
                                Your rank
                            </span>
                        </div>
                        <RankShowcase progress={stats.rank} />
                        <div className="grid grid-cols-3 gap-2">
                            <StatTile
                                icon={Trophy}
                                tone="amber"
                                label="Rating"
                                value={stats.rating}
                            />
                            <StatTile
                                icon={Swords}
                                tone="violet"
                                label="Record"
                                value={`${stats.wins}–${stats.losses}`}
                            />
                            <StatTile
                                tone="emerald"
                                label="Win"
                                value={winRate === null ? '—' : `${winRate}%`}
                            />
                        </div>
                        <Button variant="outline" className="mt-auto" asChild>
                            <Link href={showPlayer(user.id)}>
                                View profile <ChevronRight />
                            </Link>
                        </Button>
                    </Card>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <Card>
                        <CardHeader>
                            <CardTitle className="justify-between">
                                <span className="flex items-center gap-2">
                                    <Crown className="size-4 text-amber-500" />
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
                                    boards={practiceLeaderboards[board]}
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
                                                'flex items-center gap-2.5 rounded-lg px-2 py-1.5',
                                                player.id === user.id &&
                                                    'bg-violet-500/10 ring-1 ring-violet-500/30',
                                            )}
                                        >
                                            <Place position={i + 1} />
                                            <PlayerEmblem
                                                name={player.name}
                                                id={player.id}
                                                size="xs"
                                            />
                                            <Link
                                                href={showPlayer(player.id)}
                                                className="min-w-0 flex-1 truncate font-semibold hover:underline"
                                            >
                                                {player.name}
                                            </Link>
                                            <RankBadge
                                                progress={player.rank}
                                                compact
                                            />
                                            <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">
                                                {player.wins}–{player.losses}
                                            </span>
                                            <span className="w-11 text-right font-black tabular-nums">
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
                            <CardTitle>
                                <History className="size-4 text-cyan-500" />
                                Recent matches
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <DuelHistory
                                duels={recentDuels}
                                empty="Your match history will show up here."
                            />
                        </CardContent>
                    </Card>

                    <div className="flex flex-col gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="justify-between">
                                    <span className="flex items-center gap-2">
                                        <Timer className="size-4 text-emerald-500" />
                                        Practice bests
                                    </span>
                                    <Link
                                        href={practice()}
                                        className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                                    >
                                        Play →
                                    </Link>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-2 gap-2">
                                {RECORD_MODES.map((mode) => (
                                    <StatTile
                                        key={mode}
                                        label={PRACTICE_MODES[mode].label}
                                        value={
                                            records[mode] === null
                                                ? '—'
                                                : formatRecord(
                                                      mode,
                                                      records[mode],
                                                  )
                                        }
                                        className="py-2 [&>span:nth-child(2)]:text-base"
                                    />
                                ))}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>
                                    <Keyboard className="size-4 text-muted-foreground" />
                                    Controls
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ControlsLegend />
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>

            <AutopilotBar
                status={
                    searching
                        ? 'Ranked: searching for an opponent'
                        : hasEnergy
                          ? 'Ranked: finding the next match'
                          : 'Out of energy: off to Zen'
                }
                energy={{ ...liveEnergyNow, max: energy.max }}
            />
        </>
    );
}

Lobby.layout = {
    breadcrumbs: [{ title: 'Lobby', href: dashboard() }],
};

/** Leaderboard position; the top three get medal colours. */
function Place({ position }: { position: number }) {
    const medal = [
        'bg-amber-200 text-amber-950',
        'bg-slate-100 text-slate-900',
        'bg-orange-300 text-orange-950',
    ][position - 1];

    return (
        <span
            className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-black tabular-nums',
                medal ?? 'text-muted-foreground',
            )}
        >
            {position}
        </span>
    );
}

/** Decorative falling blocks for the hero card. */
function TetrominoBackdrop() {
    const blocks = [
        // Kept to the top right, clear of the buttons and the online pill.
        { color: 'bg-cyan-400', className: 'right-6 top-5 h-4 w-16' },
        { color: 'bg-amber-400', className: 'right-28 top-12 size-8' },
        { color: 'bg-fuchsia-500', className: 'right-8 top-20 h-8 w-4' },
        { color: 'bg-rose-500', className: 'right-16 top-32 h-4 w-8' },
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
