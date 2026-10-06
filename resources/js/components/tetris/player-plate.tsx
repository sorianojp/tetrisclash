import { Swords } from 'lucide-react';
import { RankEmblem, rankTier } from '@/components/tetris/rank-emblem';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { cn } from '@/lib/utils';

/** Side colours, as in the match intro: you in amber, your opponent in rose. */
const TONES = {
    you: 'border-amber-400/50 shadow-[0_0_24px_-10px_rgb(251_191_36/0.7)]',
    opponent: 'border-rose-500/50 shadow-[0_0_24px_-10px_rgb(244_63_94/0.7)]',
} as const;

/** A player's mini card above their board: name, rank and match progress (KOs, or race lines). */
export function PlayerPlate({
    player,
    mode,
    kos,
    kosToWin,
    linesSent,
    lines,
    raceLines,
    align = 'left',
    tone,
}: {
    player: { id: number; name: string; rating: number; rank: RankProgress };
    mode: 'battle' | 'race';
    kos: number;
    kosToWin: number;
    linesSent: number;
    lines: number;
    raceLines: number;
    align?: 'left' | 'right';
    tone?: keyof typeof TONES;
}) {
    return (
        <div
            className={cn(
                'relative flex min-w-0 items-center gap-2.5 overflow-hidden rounded-2xl border bg-card/80 px-2 py-2 shadow-sm backdrop-blur sm:gap-3 sm:px-3',
                align === 'right' && 'flex-row-reverse text-right',
                tone && TONES[tone],
            )}
        >
            {/* The rank badge is the plate's picture: big enough to read at a glance. */}
            <RankEmblem
                rank={player.rank.rank}
                title={player.rank.title}
                size="lg"
                className="hidden sm:inline-flex"
            />
            <div
                className={cn(
                    'flex min-w-0 flex-col gap-1',
                    align === 'right' && 'items-end',
                )}
            >
                <div
                    className={cn(
                        'flex max-w-full items-baseline gap-2',
                        align === 'right' && 'flex-row-reverse',
                    )}
                >
                    {/* Phones: a small badge beside the name, so the name keeps its room. */}
                    <RankEmblem
                        rank={player.rank.rank}
                        title={player.rank.title}
                        size="sm"
                        className="self-center sm:hidden"
                    />
                    <span className="truncate font-black tracking-tight">
                        {player.name}
                    </span>
                    <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">
                        {player.rating}
                    </span>
                </div>
                <span className="max-w-full truncate text-xs font-bold">
                    <span className="hidden text-muted-foreground sm:inline">
                        Rank {player.rank.rank} ·{' '}
                    </span>
                    <span className="text-foreground">
                        {player.rank.title}{' '}
                        {rankTier(player.rank.rank, player.rank.title)}
                    </span>
                </span>
                {mode === 'race' ? (
                    <div
                        className={cn(
                            'flex w-full min-w-28 items-center gap-2 text-xs',
                            align === 'right' && 'flex-row-reverse',
                        )}
                    >
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                                className={cn(
                                    'h-full rounded-full bg-cyan-400 transition-[width]',
                                    align === 'right' && 'ml-auto',
                                )}
                                style={{
                                    width: `${Math.min(100, (lines / raceLines) * 100)}%`,
                                }}
                            />
                        </div>
                        <span className="font-semibold text-muted-foreground tabular-nums">
                            {Math.min(lines, raceLines)}/{raceLines}
                        </span>
                    </div>
                ) : (
                    <div
                        className={cn(
                            'flex items-center gap-3 text-xs',
                            align === 'right' && 'flex-row-reverse',
                        )}
                    >
                        <div
                            className="flex gap-1.5"
                            aria-label={`${kos} of ${kosToWin} KOs`}
                        >
                            {Array.from({ length: kosToWin }, (_, i) => (
                                <span
                                    key={i}
                                    className={cn(
                                        'size-3 rotate-45 rounded-[2px] border transition-colors',
                                        i < kos
                                            ? 'border-amber-300 bg-amber-400 shadow-[0_0_8px_rgb(251_191_36/0.8)]'
                                            : 'border-muted-foreground/40',
                                    )}
                                />
                            ))}
                        </div>
                        <span className="font-semibold whitespace-nowrap text-muted-foreground tabular-nums">
                            <Swords className="mr-1 inline size-3" />
                            {linesSent} sent
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
