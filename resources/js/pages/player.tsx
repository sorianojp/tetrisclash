import { Head, Link } from '@inertiajs/react';
import {
    Award,
    Eye,
    History,
    Percent,
    Swords,
    Timer,
    Trophy,
} from 'lucide-react';
import { AchievementList } from '@/components/tetris/achievement-list';
import type { AchievementStatus } from '@/components/tetris/achievement-list';
import { DuelHistory } from '@/components/tetris/duel-history';
import type { DuelSummary } from '@/components/tetris/duel-history';
import { PlayerEmblem } from '@/components/tetris/player-emblem';
import { RankProgressBar } from '@/components/tetris/rank-badge';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { RankEmblem, rankTier } from '@/components/tetris/rank-emblem';
import { StatTile } from '@/components/tetris/stat-tile';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { dashboard } from '@/routes';
import { watch as watchDuel } from '@/routes/duels';
import {
    PRACTICE_MODES,
    RECORD_MODES,
    formatRecord,
} from '@/tetris/practice-modes';
import type { PracticeRecords, RecordMode } from '@/tetris/practice-modes';

type Props = {
    player: {
        id: number;
        name: string;
        joinedAt: string | null;
        rating: number;
        wins: number;
        losses: number;
        rank: RankProgress;
    };
    records: PracticeRecords;
    /** All-time leaderboard position per mode. */
    placements: Record<RecordMode, number | null>;
    achievements: AchievementStatus[];
    /** The duel they're playing right now, if any. */
    liveDuelId: number | null;
    recentDuels: DuelSummary[];
};

export default function Player({
    player,
    records,
    placements,
    achievements,
    recentDuels,
    liveDuelId,
}: Props) {
    const unlocked = achievements.filter((a) => a.unlockedAt !== null).length;

    const played = player.wins + player.losses;
    const winRate =
        played > 0 ? `${Math.round((player.wins / played) * 100)}%` : '—';

    return (
        <>
            <Head title={player.name} />
            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 sm:p-6">
                {liveDuelId !== null && (
                    <Link href={watchDuel(liveDuelId)}>
                        <Card className="flex-row items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-rose-500/5">
                            <span className="flex items-center gap-2 text-sm font-semibold">
                                <span className="relative flex size-2.5">
                                    <span className="absolute inline-flex size-full rounded-full bg-rose-500 opacity-60 motion-safe:animate-ping" />
                                    <span className="relative inline-flex size-2.5 rounded-full bg-rose-500" />
                                </span>
                                {player.name} is in a match right now
                            </span>
                            <span className="flex items-center gap-1 text-sm font-bold text-rose-600 dark:text-rose-300">
                                <Eye className="size-4" /> Watch live
                            </span>
                        </Card>
                    </Link>
                )}

                <Card className="gap-0 overflow-hidden py-0">
                    <div className="relative flex flex-col gap-5 bg-violet-900 p-6 text-white sm:flex-row sm:items-center sm:p-8">
                        <PlayerEmblem
                            name={player.name}
                            id={player.id}
                            size="xl"
                            className="relative ring-4 ring-white/15"
                        />
                        <div className="relative min-w-0 flex-1">
                            <p className="text-[11px] font-bold tracking-[0.25em] text-fuchsia-200 uppercase">
                                Player card
                            </p>
                            <h1 className="truncate text-3xl font-black tracking-tight sm:text-4xl">
                                {player.name}
                            </h1>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-indigo-200">
                                {player.joinedAt && (
                                    <span>Playing since {player.joinedAt}</span>
                                )}
                            </div>
                        </div>
                        <div className="relative flex items-center gap-4 rounded-2xl bg-black/25 p-3 pr-5 ring-1 ring-white/10">
                            <RankEmblem
                                rank={player.rank.rank}
                                title={player.rank.title}
                                size="xl"
                            />
                            <div className="flex w-40 flex-col gap-1.5">
                                <span className="text-[11px] font-black tracking-[0.25em] text-indigo-200 uppercase">
                                    Rank
                                </span>
                                <span className="text-4xl leading-none font-black tabular-nums">
                                    {player.rank.rank}
                                </span>
                                <span className="text-sm leading-tight font-bold">
                                    {player.rank.title}{' '}
                                    {rankTier(
                                        player.rank.rank,
                                        player.rank.title,
                                    )}
                                </span>
                                <RankProgressBar
                                    progress={player.rank}
                                    className="text-indigo-100"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-6">
                        <StatTile
                            icon={Trophy}
                            tone="amber"
                            label="Rating"
                            value={player.rating}
                        />
                        <StatTile
                            icon={Swords}
                            tone="violet"
                            label="Record"
                            value={`${player.wins}–${player.losses}`}
                        />
                        <StatTile
                            icon={Percent}
                            tone="emerald"
                            label="Win rate"
                            value={winRate}
                        />
                        <StatTile
                            icon={Award}
                            tone="rose"
                            label="Achievements"
                            value={`${unlocked}/${achievements.length}`}
                        />
                    </div>
                </Card>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_1.6fr]">
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                <Timer className="size-4 text-emerald-500" />
                                Practice bests
                            </CardTitle>
                            <CardDescription>
                                With their all-time leaderboard place.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-2">
                            {RECORD_MODES.map((mode) => (
                                <div
                                    key={mode}
                                    className="flex items-center gap-3 rounded-xl border bg-muted/40 px-3 py-2 dark:bg-white/[0.03]"
                                >
                                    <span className="flex-1 text-sm font-semibold">
                                        {PRACTICE_MODES[mode].label}
                                    </span>
                                    {placements[mode] !== null && (
                                        <span
                                            className={cn(
                                                'rounded-md px-1.5 py-0.5 text-[11px] font-black tabular-nums',
                                                placements[mode] <= 3
                                                    ? 'bg-amber-200 text-amber-950'
                                                    : 'bg-muted text-muted-foreground',
                                            )}
                                            title={`#${placements[mode]} all-time in ${PRACTICE_MODES[mode].label}`}
                                        >
                                            #{placements[mode]}
                                        </span>
                                    )}
                                    <span className="w-20 text-right font-black tabular-nums">
                                        {records[mode] === null
                                            ? '—'
                                            : formatRecord(mode, records[mode])}
                                    </span>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>
                                <History className="size-4 text-cyan-500" />
                                Match history
                            </CardTitle>
                            <CardDescription>
                                Latest {recentDuels.length || ''} matches,
                                ranked and friendly.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <DuelHistory
                                duels={recentDuels}
                                empty="No matches played yet."
                            />
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="justify-between">
                            <span className="flex items-center gap-2">
                                <Award className="size-4 text-amber-500" />
                                Achievements
                            </span>
                            <span className="text-sm font-semibold text-muted-foreground tabular-nums">
                                {unlocked} / {achievements.length}
                            </span>
                        </CardTitle>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                            <div
                                className="h-full rounded-full bg-amber-300"
                                style={{
                                    width: `${achievements.length ? (unlocked / achievements.length) * 100 : 0}%`,
                                }}
                            />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <AchievementList achievements={achievements} />
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

Player.layout = {
    breadcrumbs: [
        { title: 'Lobby', href: dashboard() },
        { title: 'Player', href: dashboard() },
    ],
};
