import { Link } from '@inertiajs/react';
import { Film } from 'lucide-react';
import { PlayerEmblem } from '@/components/tetris/player-emblem';
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
                    className={cn(
                        'relative flex items-center gap-2.5 overflow-hidden rounded-lg border py-1.5 pr-1.5 pl-3.5 transition-colors hover:bg-muted/40',
                        RESULT_STYLES[duel.result].row,
                    )}
                >
                    {/* The result as a coloured edge, so it can't be mistaken for the avatar. */}
                    <span
                        aria-hidden
                        className={cn(
                            'absolute inset-y-0 left-0 w-1',
                            RESULT_STYLES[duel.result].edge,
                        )}
                    />
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
                            {duel.finishedAt && ` · ${duel.finishedAt}`}
                        </span>
                    </span>
                    <span className="flex flex-col items-end gap-0.5 leading-tight">
                        <ResultBadge result={duel.result} />
                        {/* The server stores the size of the change; the result gives its sign. */}
                        {duel.ranked &&
                            duel.ratingChange !== null &&
                            duel.result !== 'draw' && (
                                <span
                                    className={cn(
                                        'text-xs font-bold tabular-nums',
                                        RESULT_STYLES[duel.result].text,
                                    )}
                                >
                                    {duel.result === 'win' ? '+' : '−'}
                                    {duel.ratingChange}
                                </span>
                            )}
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

const RESULT_STYLES = {
    win: {
        row: 'border-emerald-500/20 bg-emerald-500/[0.06]',
        edge: 'bg-emerald-500',
        text: 'text-emerald-600 dark:text-emerald-400',
        badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    },
    loss: {
        row: 'border-rose-500/20 bg-rose-500/[0.06]',
        edge: 'bg-rose-500',
        text: 'text-rose-600 dark:text-rose-400',
        badge: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    },
    draw: {
        row: 'border-border',
        edge: 'bg-muted-foreground/40',
        text: 'text-muted-foreground',
        badge: 'border-border bg-muted text-muted-foreground',
    },
};

/** "WIN" / "LOSS" / "DRAW": an outlined pill, unlike the solid avatar blocks. */
export function ResultBadge({ result }: { result: 'win' | 'loss' | 'draw' }) {
    return (
        <span
            className={cn(
                'inline-flex w-12 justify-center rounded-full border px-2 py-0.5 text-[10px] font-black tracking-wider uppercase',
                RESULT_STYLES[result].badge,
            )}
        >
            {result}
        </span>
    );
}
