import { Link, usePage } from '@inertiajs/react';
import { Film } from 'lucide-react';
import { useState } from 'react';
import { RankBadge } from '@/components/tetris/rank-badge';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { show as showPlayer } from '@/routes/players';
import { replay as runReplay } from '@/routes/practice';
import { formatRecord } from '@/tetris/practice-modes';
import type { RecordMode } from '@/tetris/practice-modes';

/** One board as sent by the server (App\Support\PracticeLeaderboards). */
export type PracticeBoard = {
    entries: {
        id: number;
        name: string;
        value: number;
        /** Tied players share a position. */
        position: number;
        rank: RankProgress;
        /** The recorded run behind this result, when there is one. */
        replayId: number | null;
    }[];
    /** The viewer's standing, or null without a result on this board. */
    you: { position: number; value: number } | null;
};

type Period = 'allTime' | 'weekly';

export type PracticeBoards = Record<RecordMode, Record<Period, PracticeBoard>>;

/** Top results for one practice mode, all-time or this week. */
export function PracticeLeaderboard({
    mode,
    boards,
}: {
    mode: RecordMode;
    boards: Record<Period, PracticeBoard>;
}) {
    const { auth } = usePage().props;
    const [period, setPeriod] = useState<Period>('allTime');
    const board = boards[period];
    const youListed = board.entries.some((entry) => entry.id === auth.user.id);

    return (
        <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between gap-2">
                <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    value={period}
                    onValueChange={(value) =>
                        value && setPeriod(value as Period)
                    }
                >
                    <ToggleGroupItem value="allTime" className="px-3">
                        All-time
                    </ToggleGroupItem>
                    <ToggleGroupItem value="weekly" className="px-3">
                        This week
                    </ToggleGroupItem>
                </ToggleGroup>
                {period === 'weekly' && (
                    <span className="text-xs text-muted-foreground">
                        Resets Monday 00:00 UTC
                    </span>
                )}
            </div>

            {board.entries.length === 0 ? (
                <p className="text-muted-foreground">
                    {period === 'weekly'
                        ? 'No runs this week yet. Set the pace!'
                        : 'No records yet. Set the first one!'}
                </p>
            ) : (
                <ol className="flex flex-col gap-1">
                    {board.entries.map((entry) => (
                        <li
                            key={entry.id}
                            className={cn(
                                'flex items-center gap-3 rounded-md px-2 py-1.5',
                                entry.id === auth.user.id && 'bg-muted',
                            )}
                        >
                            <span className="w-5 text-right font-mono text-muted-foreground">
                                {entry.position}
                            </span>
                            <RankBadge progress={entry.rank} compact />
                            <Link
                                href={showPlayer(entry.id)}
                                className="flex-1 truncate font-medium hover:underline"
                            >
                                {entry.name}
                            </Link>
                            <span className="font-semibold tabular-nums">
                                {formatRecord(mode, entry.value)}
                            </span>
                            {entry.replayId !== null ? (
                                <Link
                                    href={runReplay(entry.replayId)}
                                    className="text-muted-foreground hover:text-foreground"
                                    title="Watch replay"
                                >
                                    <Film className="size-4" />
                                    <span className="sr-only">
                                        Watch replay
                                    </span>
                                </Link>
                            ) : (
                                <span className="w-4" />
                            )}
                        </li>
                    ))}
                </ol>
            )}

            {board.you && !youListed && (
                <div className="flex items-center gap-3 rounded-md border border-dashed px-2 py-1.5">
                    <span className="min-w-5 text-right font-mono text-muted-foreground">
                        {board.you.position}
                    </span>
                    <span className="flex-1 font-medium">You</span>
                    <span className="font-semibold tabular-nums">
                        {formatRecord(mode, board.you.value)}
                    </span>
                </div>
            )}
        </div>
    );
}
