import { Swords } from 'lucide-react';
import { RankBadge } from '@/components/tetris/rank-badge';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { cn } from '@/lib/utils';

/** A player's name, rank and match progress (KOs, or race lines). */
export function PlayerPlate({
    player,
    mode,
    kos,
    kosToWin,
    linesSent,
    lines,
    raceLines,
    align = 'left',
}: {
    player: { name: string; rating: number; rank: RankProgress };
    mode: 'battle' | 'race';
    kos: number;
    kosToWin: number;
    linesSent: number;
    lines: number;
    raceLines: number;
    align?: 'left' | 'right';
}) {
    return (
        <div
            className={cn(
                'flex min-w-0 flex-col gap-1',
                align === 'right' && 'items-end text-right',
            )}
        >
            <div className="flex max-w-full items-baseline gap-2">
                <span className="truncate font-bold">{player.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                    {player.rating}
                </span>
            </div>
            <RankBadge
                progress={player.rank}
                className={cn('max-w-full', align === 'left' && 'self-start')}
            />
            {mode === 'race' ? (
                <div
                    className={cn(
                        'flex w-full max-w-48 items-center gap-2 text-xs',
                        align === 'right' && 'flex-row-reverse',
                    )}
                >
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                            className={cn(
                                'h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-[width]',
                                align === 'right' && 'ml-auto',
                            )}
                            style={{
                                width: `${Math.min(100, (lines / raceLines) * 100)}%`,
                            }}
                        />
                    </div>
                    <span className="text-muted-foreground tabular-nums">
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
                        className="flex gap-1"
                        aria-label={`${kos} of ${kosToWin} KOs`}
                    >
                        {Array.from({ length: kosToWin }, (_, i) => (
                            <span
                                key={i}
                                className={cn(
                                    'size-3 rotate-45 rounded-[2px] border',
                                    i < kos
                                        ? 'border-amber-500 bg-amber-400'
                                        : 'border-muted-foreground/40',
                                )}
                            />
                        ))}
                    </div>
                    <span className="text-muted-foreground tabular-nums">
                        <Swords className="mr-1 inline size-3" />
                        {linesSent} sent
                    </span>
                </div>
            )}
        </div>
    );
}
