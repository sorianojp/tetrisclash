import { Head, Link, router } from '@inertiajs/react';
import { Film, RotateCcw, Trash2 } from 'lucide-react';
import { AdminHeader, adminBreadcrumb } from '@/components/admin/admin-header';
import { ConfirmAction } from '@/components/admin/confirm-action';
import { Badge } from '@/components/ui/badge';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { index as practiceIndex } from '@/routes/admin/practice';
import { destroy as deleteRun } from '@/routes/admin/practice/runs';
import { show as showUser } from '@/routes/admin/users';
import { destroy as resetRecord } from '@/routes/admin/users/records';
import { replay as runReplay } from '@/routes/practice';
import {
    PRACTICE_MODES,
    RECORD_MODES,
    formatRecord,
} from '@/tetris/practice-modes';
import type { RecordMode } from '@/tetris/practice-modes';

type Run = {
    id: number;
    value: number;
    player: { id: number; name: string; banned: boolean };
    hasReplay: boolean;
    createdAt: string | null;
};

type Props = {
    mode: RecordMode;
    records: { id: number; name: string; banned: boolean; value: number }[];
    weeklyRuns: Run[];
    recentRuns: Run[];
};

export default function AdminPractice({
    mode,
    records,
    weeklyRuns,
    recentRuns,
}: Props) {
    const label = PRACTICE_MODES[mode].label;

    return (
        <>
            <Head title="Leaderboards · Admin" />
            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4">
                <AdminHeader
                    title="Leaderboards"
                    description="Take down practice results that shouldn't be on the boards. Banned players are already hidden from them."
                />

                <div className="flex flex-wrap gap-1 self-start rounded-lg bg-muted p-1">
                    {RECORD_MODES.map((option) => (
                        <button
                            key={option}
                            type="button"
                            onClick={() =>
                                router.get(
                                    practiceIndex().url,
                                    { mode: option },
                                    { preserveScroll: true, replace: true },
                                )
                            }
                            className={cn(
                                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                                option === mode
                                    ? 'bg-background shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {PRACTICE_MODES[option].label}
                        </button>
                    ))}
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>All-time records · {label}</CardTitle>
                        <CardDescription>
                            Each player's personal best. Resetting one deletes
                            the record and all their {label} runs.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {records.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No records yet.
                            </p>
                        ) : (
                            <ol className="flex flex-col gap-1 text-sm">
                                {records.map((record, i) => (
                                    <li
                                        key={record.id}
                                        className="flex items-center gap-3 rounded-md px-2 py-1 hover:bg-muted/50"
                                    >
                                        <span className="w-6 text-right text-muted-foreground tabular-nums">
                                            {i + 1}
                                        </span>
                                        <PlayerLink player={record} />
                                        <span className="font-semibold tabular-nums">
                                            {formatRecord(mode, record.value)}
                                        </span>
                                        <ConfirmAction
                                            action={resetRecord({
                                                user: record.id,
                                                mode,
                                            })}
                                            title={`Reset ${record.name}'s ${label} record?`}
                                            description={`Their record and every ${label} run they've played are deleted.`}
                                            confirmLabel="Reset record"
                                        >
                                            <RotateCcw /> Reset
                                        </ConfirmAction>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <RunList
                        title={`Best runs this week · ${label}`}
                        description="Individual runs, best first."
                        runs={weeklyRuns}
                        mode={mode}
                    />
                    <RunList
                        title={`Latest runs · ${label}`}
                        description="Newest first."
                        runs={recentRuns}
                        mode={mode}
                    />
                </div>
            </div>
        </>
    );
}

AdminPractice.layout = {
    breadcrumbs: [
        adminBreadcrumb,
        { title: 'Leaderboards', href: practiceIndex() },
    ],
};

function PlayerLink({
    player,
}: {
    player: { id: number; name: string; banned: boolean };
}) {
    return (
        <span className="flex min-w-0 flex-1 items-center gap-2">
            <Link
                href={showUser(player.id)}
                className="truncate font-medium hover:underline"
            >
                {player.name}
            </Link>
            {player.banned && <Badge variant="destructive">Banned</Badge>}
        </span>
    );
}

function RunList({
    title,
    description,
    runs,
    mode,
}: {
    title: string;
    description: string;
    runs: Run[];
    mode: RecordMode;
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                {runs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No runs.</p>
                ) : (
                    <ul className="flex flex-col gap-1 text-sm">
                        {runs.map((run) => (
                            <li
                                key={run.id}
                                className="flex items-center gap-2"
                            >
                                <PlayerLink player={run.player} />
                                <span className="font-semibold tabular-nums">
                                    {formatRecord(mode, run.value)}
                                </span>
                                <span className="hidden text-xs text-muted-foreground sm:inline">
                                    {run.createdAt}
                                </span>
                                {run.hasReplay && (
                                    <Link
                                        href={runReplay(run.id)}
                                        className="text-muted-foreground hover:text-foreground"
                                        title="Watch replay"
                                    >
                                        <Film className="size-4" />
                                    </Link>
                                )}
                                <ConfirmAction
                                    action={deleteRun(run.id)}
                                    title="Delete this run?"
                                    description="If it's the player's record, their record drops to their next best run."
                                    confirmLabel="Delete run"
                                    variant="ghost"
                                >
                                    <Trash2 />
                                    <span className="sr-only">Delete</span>
                                </ConfirmAction>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
