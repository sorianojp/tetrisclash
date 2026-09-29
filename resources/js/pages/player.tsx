import { Head } from '@inertiajs/react';
import { Swords, Timer, Trophy } from 'lucide-react';
import { DuelHistory } from '@/components/tetris/duel-history';
import type { DuelSummary } from '@/components/tetris/duel-history';
import { RankBadge, RankProgressBar } from '@/components/tetris/rank-badge';
import type { RankProgress } from '@/components/tetris/rank-badge';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { dashboard } from '@/routes';
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
    recentDuels: DuelSummary[];
};

export default function Player({
    player,
    records,
    placements,
    recentDuels,
}: Props) {
    const played = player.wins + player.losses;
    const winRate =
        played > 0 ? `${Math.round((player.wins / played) * 100)}%` : '—';

    return (
        <>
            <Head title={player.name} />
            <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-4">
                <Card className="overflow-hidden">
                    <div className="flex flex-col gap-4 bg-gradient-to-br from-indigo-950 via-violet-900 to-fuchsia-900 p-6 text-white sm:flex-row sm:items-end sm:justify-between">
                        <div className="min-w-0">
                            <h1 className="truncate text-3xl font-black tracking-tight">
                                {player.name}
                            </h1>
                            {player.joinedAt && (
                                <p className="text-sm text-indigo-200">
                                    Playing since {player.joinedAt}
                                </p>
                            )}
                        </div>
                        <div className="flex w-full flex-col gap-2 sm:w-64">
                            <RankBadge
                                progress={player.rank}
                                className="self-start bg-white/15 text-sm text-white sm:self-end"
                            />
                            <RankProgressBar progress={player.rank} />
                        </div>
                    </div>
                    <CardContent className="grid grid-cols-3 gap-3 pt-6">
                        <Stat
                            icon={<Trophy className="size-4" />}
                            label="Rating"
                            value={player.rating}
                        />
                        <Stat
                            icon={<Swords className="size-4" />}
                            label="Ranked record"
                            value={`${player.wins}W – ${player.losses}L`}
                        />
                        <Stat label="Win rate" value={winRate} />
                    </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Timer className="size-4" /> Practice bests
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <dl className="flex flex-col gap-2 text-sm">
                                {RECORD_MODES.map((mode) => (
                                    <div
                                        key={mode}
                                        className="flex justify-between gap-2"
                                    >
                                        <dt className="text-muted-foreground">
                                            {PRACTICE_MODES[mode].label}
                                        </dt>
                                        <dd className="flex items-baseline gap-2 font-semibold tabular-nums">
                                            {placements[mode] !== null && (
                                                <span
                                                    className={cn(
                                                        'text-xs font-medium',
                                                        placements[mode] <= 3
                                                            ? 'text-amber-500'
                                                            : 'text-muted-foreground',
                                                    )}
                                                    title={`#${placements[mode]} all-time in ${PRACTICE_MODES[mode].label}`}
                                                >
                                                    #{placements[mode]}
                                                </span>
                                            )}
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
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Match history</CardTitle>
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
