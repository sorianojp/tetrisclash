import { Link } from '@inertiajs/react';
import { Film } from 'lucide-react';
import { PlayerEmblem } from '@/components/tetris/player-emblem';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { replay as duelReplay } from '@/routes/duels';
import { show as showPlayer } from '@/routes/players';

export type DuelSummary = {
    id: number;
    mode: 'battle' | 'race';
    ranked: boolean;
    opponentId: number;
    opponent: string;
    result: 'win' | 'loss' | 'draw';
    myKos: number;
    theirKos: number;
    myLines: number;
    theirLines: number;
    reason: string | null;
    ratingChange: number | null;
    finishedAt: string | null;
    hasReplay: boolean;
};

/** A player's finished duels, newest first. */
export function DuelHistory({
    duels,
    empty,
}: {
    duels: DuelSummary[];
    empty: string;
}) {
    if (duels.length === 0) {
        return <p className="text-sm text-muted-foreground">{empty}</p>;
    }

    return (
        <ul className="flex flex-col gap-1.5 text-sm">
            {duels.map((duel) => (
                <li
                    key={duel.id}
                    className="flex items-center gap-2.5 rounded-lg border border-transparent px-1.5 py-1 transition-colors hover:border-border hover:bg-muted/40"
                >
                    <ResultTile result={duel.result} />
                    <PlayerEmblem
                        name={duel.opponent}
                        id={duel.opponentId}
                        size="xs"
                    />
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                        <Link
                            href={showPlayer(duel.opponentId)}
                            className="truncate font-semibold hover:underline"
                        >
                            {duel.opponent}
                        </Link>
                        <span className="truncate text-xs text-muted-foreground">
                            {duel.mode === 'race'
                                ? `${duel.myLines}–${duel.theirLines} lines`
                                : `${duel.myKos}–${duel.theirKos} KO`}
                            {!duel.ranked &&
                                ` · ${duel.mode === 'race' ? 'Race' : 'Friendly'}`}
                            {duel.reason &&
                            !['time', 'knockout', 'finish'].includes(
                                duel.reason,
                            )
                                ? ` · ${duel.reason}`
                                : ''}
                        </span>
                    </span>
                    <span className="flex flex-col items-end leading-tight">
                        {/* The server stores the size of the change; the result gives its sign. */}
                        {duel.ranked &&
                            duel.ratingChange !== null &&
                            duel.result !== 'draw' && (
                                <span
                                    className={cn(
                                        'text-xs font-bold tabular-nums',
                                        duel.result === 'win'
                                            ? 'text-emerald-600 dark:text-emerald-400'
                                            : 'text-rose-600 dark:text-rose-400',
                                    )}
                                >
                                    {duel.result === 'win' ? '+' : '−'}
                                    {duel.ratingChange}
                                </span>
                            )}
                        <span className="text-[11px] whitespace-nowrap text-muted-foreground">
                            {duel.finishedAt}
                        </span>
                    </span>
                    {duel.hasReplay ? (
                        <Link
                            href={duelReplay(duel.id)}
                            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Watch replay"
                        >
                            <Film className="size-4" />
                            <span className="sr-only">Watch replay</span>
                        </Link>
                    ) : (
                        <span className="size-7 shrink-0" />
                    )}
                </li>
            ))}
        </ul>
    );
}

/** A one-letter result block: W, L or D. */
function ResultTile({ result }: { result: 'win' | 'loss' | 'draw' }) {
    const styles = {
        win: 'bg-emerald-500 text-white shadow-emerald-500/30',
        loss: 'bg-rose-500 text-white shadow-rose-500/30',
        draw: 'bg-muted text-muted-foreground',
    };

    return (
        <span
            title={result}
            className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-black uppercase shadow-sm',
                styles[result],
            )}
        >
            {result[0]}
        </span>
    );
}

export function ResultBadge({ result }: { result: 'win' | 'loss' | 'draw' }) {
    const styles = {
        win: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
        loss: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
        draw: 'bg-muted text-muted-foreground',
    };

    return (
        <Badge
            variant="outline"
            className={cn(
                'w-12 justify-center border-transparent uppercase',
                styles[result],
            )}
        >
            {result}
        </Badge>
    );
}
