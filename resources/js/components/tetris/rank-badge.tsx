import { Crown, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A player's rank as sent by the server (App\Support\Ranks::progress). */
export type RankProgress = {
    rank: number;
    title: string;
    xp: number;
    xpIntoRank: number;
    /** Null at the max rank. */
    xpForNext: number | null;
};

/** Badge colour climbs with the title groups: blocks, builders, fighters, forces, cosmic. */
function tierClass(rank: number): string {
    if (rank >= 110) {
        return 'bg-amber-400 text-white';
    }

    if (rank >= 101) {
        return 'bg-rose-500/15 text-rose-600 dark:text-rose-300';
    }

    if (rank >= 76) {
        return 'bg-violet-500/15 text-violet-600 dark:text-violet-300';
    }

    if (rank >= 51) {
        return 'bg-sky-500/15 text-sky-600 dark:text-sky-300';
    }

    if (rank >= 26) {
        return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300';
    }

    return 'bg-muted text-muted-foreground';
}

/** "34 · Prodigy" pill; `compact` shows only the rank number (title on hover). */
export function RankBadge({
    progress,
    compact = false,
    className,
}: {
    progress: RankProgress;
    compact?: boolean;
    className?: string;
}) {
    const Icon = progress.rank >= 76 ? Crown : Shield;

    return (
        <span
            title={`Rank ${progress.rank} · ${progress.title}`}
            className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
                tierClass(progress.rank),
                className,
            )}
        >
            <Icon className="size-3" />
            <span className="tabular-nums">{progress.rank}</span>
            {!compact && <span>· {progress.title}</span>}
        </span>
    );
}

/** XP bar toward the next rank. */
export function RankProgressBar({
    progress,
    className,
}: {
    progress: RankProgress;
    className?: string;
}) {
    const percent =
        progress.xpForNext === null
            ? 100
            : Math.min(100, (progress.xpIntoRank / progress.xpForNext) * 100);

    return (
        <div className={cn('flex flex-col gap-1', className)}>
            <div
                className="h-2 overflow-hidden rounded-full bg-current/15"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(percent)}
            >
                <div
                    className="h-full rounded-full bg-violet-500 transition-[width] duration-700"
                    style={{ width: `${percent}%` }}
                />
            </div>
            <span className="text-xs tabular-nums opacity-70">
                {progress.xpForNext === null
                    ? 'Max rank'
                    : `${progress.xpIntoRank} / ${progress.xpForNext} XP to Rank ${progress.rank + 1}`}
            </span>
        </div>
    );
}
