import { Link, usePage } from '@inertiajs/react';
import { RankBadge } from '@/components/tetris/rank-badge';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { cn } from '@/lib/utils';
import { show as showPlayer } from '@/routes/players';
import { formatRecord } from '@/tetris/practice-modes';
import type { RecordMode } from '@/tetris/practice-modes';

/** One mode's board as sent by the server (App\Support\PracticeLeaderboards). */
export type PracticeBoard = {
    entries: {
        id: number;
        name: string;
        value: number;
        rank: RankProgress;
    }[];
    /** The viewer's standing, or null without a record in this mode. */
    you: { position: number; value: number } | null;
};

export type PracticeBoards = Record<RecordMode, PracticeBoard>;

/** Top personal bests for one practice mode. */
export function PracticeLeaderboard({
    mode,
    board,
}: {
    mode: RecordMode;
    board: PracticeBoard;
}) {
    const { auth } = usePage().props;
    const youListed = board.entries.some((entry) => entry.id === auth.user.id);

    if (board.entries.length === 0) {
        return (
            <p className="text-sm text-muted-foreground">
                No records yet. Set the first one!
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-2 text-sm">
            <ol className="flex flex-col gap-1">
                {board.entries.map((entry, i) => (
                    <li
                        key={entry.id}
                        className={cn(
                            'flex items-center gap-3 rounded-md px-2 py-1.5',
                            entry.id === auth.user.id && 'bg-muted',
                        )}
                    >
                        <span className="w-5 text-right font-mono text-muted-foreground">
                            {i + 1}
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
                    </li>
                ))}
            </ol>
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
