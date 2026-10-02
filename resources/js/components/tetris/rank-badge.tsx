import {
    nextTitle,
    RankEmblem,
    rankStyle,
    rankTier,
} from '@/components/tetris/rank-emblem';
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

/** "[badge] 34 · Prodigy" pill; `compact` shows the badge and number only (title on hover). */
export function RankBadge({
    progress,
    compact = false,
    className,
}: {
    progress: RankProgress;
    compact?: boolean;
    className?: string;
}) {
    return (
        <span
            title={`Rank ${progress.rank} · ${progress.title} ${rankTier(progress.rank, progress.title)}`}
            className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-muted/60 py-0.5 pr-2.5 pl-0.5 text-xs font-bold whitespace-nowrap dark:bg-white/[0.06]',
                compact && 'pr-2',
                className,
            )}
        >
            <RankEmblem rank={progress.rank} title={progress.title} size="xs" />
            <span className="tabular-nums">{progress.rank}</span>
            {!compact && (
                <span className="font-semibold opacity-90">
                    {progress.title}
                </span>
            )}
        </span>
    );
}

/** XP bar toward the next rank, in the title's colour. */
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
                    className="h-full rounded-full transition-[width] duration-700"
                    style={{
                        width: `${percent}%`,
                        backgroundColor: rankStyle(progress.title).face,
                    }}
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

/**
 * The big rank display: badge, "RANK 43", title and level, XP to the next rank and the
 * next title to unlock.
 */
export function RankShowcase({
    progress,
    className,
}: {
    progress: RankProgress;
    className?: string;
}) {
    const style = rankStyle(progress.title);
    const next = nextTitle(progress.title);
    const nextStyle = next ? rankStyle(next) : null;
    const percent =
        progress.xpForNext === null
            ? 100
            : Math.min(100, (progress.xpIntoRank / progress.xpForNext) * 100);

    return (
        <div className={cn('flex flex-col gap-3', className)}>
            <div className="flex items-center gap-4 sm:gap-5">
                <RankEmblem
                    rank={progress.rank}
                    title={progress.title}
                    size="xl"
                    className="drop-shadow-[0_8px_16px_rgb(0_0_0/0.35)]"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div>
                        <p
                            className="text-[11px] font-black tracking-[0.25em] uppercase"
                            style={{ color: style.face }}
                        >
                            {style.group}
                        </p>
                        <p className="flex items-baseline gap-2">
                            <span className="text-4xl leading-none font-black tracking-tight tabular-nums">
                                {progress.rank}
                            </span>
                            <span className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                                Rank
                            </span>
                        </p>
                        <p className="truncate text-xl font-black tracking-tight">
                            {progress.title}{' '}
                            <span className="text-muted-foreground">
                                {rankTier(progress.rank, progress.title)}
                            </span>
                        </p>
                    </div>
                    <div className="flex flex-col gap-1">
                        <div
                            className="h-3 overflow-hidden rounded-full bg-muted"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(percent)}
                        >
                            <div
                                className="h-full rounded-full transition-[width] duration-700"
                                style={{
                                    width: `${percent}%`,
                                    backgroundColor: style.face,
                                }}
                            />
                        </div>
                        <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                            {progress.xpForNext === null
                                ? 'Max rank reached'
                                : `${progress.xpIntoRank} / ${progress.xpForNext} XP to Rank ${progress.rank + 1}`}
                        </span>
                    </div>
                </div>
            </div>
            {next && nextStyle && (
                <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-xs text-muted-foreground dark:bg-white/[0.03]">
                    <RankEmblem rank={nextStyle.from} title={next} size="sm" />
                    <span className="min-w-0 flex-1 truncate">
                        Next title:{' '}
                        <span className="font-bold text-foreground">
                            {next}
                        </span>
                    </span>
                    <span className="font-semibold whitespace-nowrap tabular-nums">
                        Rank {nextStyle.from}
                    </span>
                </div>
            )}
        </div>
    );
}
