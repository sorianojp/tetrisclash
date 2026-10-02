import { Swords } from 'lucide-react';
import { PlayerEmblem } from '@/components/tetris/player-emblem';
import { RankBadge } from '@/components/tetris/rank-badge';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { cn } from '@/lib/utils';

/** Side colours, as in the match intro: you in amber, your opponent in rose. */
const TONES = {
    you: {
        emblem: 'from-amber-300 to-orange-500 text-amber-950',
    },
    opponent: {
        emblem: 'from-rose-400 to-fuchsia-600 text-white',
    },
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
    const look = tone ? TONES[tone] : null;

    return (
        <div
            className={cn(
                'relative flex min-w-0 items-center gap-2.5 overflow-hidden rounded-2xl border bg-card/80 px-2.5 py-2 shadow-sm backdrop-blur sm:gap-3 sm:px-3',
                align === 'right' && 'flex-row-reverse text-right',
            )}
        >
            <PlayerEmblem
                name={player.name}
                id={player.id}
                size="md"
                tone={look?.emblem}
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
                    <span className="truncate font-black tracking-tight">
                        {player.name}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {player.rating}
                    </span>
                </div>
                <RankBadge
                    progress={player.rank}
                    compact
                    className={cn(align === 'left' && 'self-start')}
                />
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
                                    'h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-[width]',
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
                        <span className="font-semibold text-muted-foreground tabular-nums">
                            <Swords className="mr-1 inline size-3" />
                            {linesSent} sent
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
