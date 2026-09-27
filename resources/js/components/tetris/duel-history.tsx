import { Link } from '@inertiajs/react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
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
        <ul className="flex flex-col gap-2 text-sm">
            {duels.map((duel) => (
                <li key={duel.id} className="flex items-center gap-3">
                    <ResultBadge result={duel.result} />
                    <span className="min-w-0 flex-1 truncate">
                        vs{' '}
                        <Link
                            href={showPlayer(duel.opponentId)}
                            className="font-medium hover:underline"
                        >
                            {duel.opponent}
                        </Link>
                        <span className="ml-1 text-xs text-muted-foreground">
                            {duel.mode === 'race'
                                ? `${duel.myLines}–${duel.theirLines} lines`
                                : `${duel.myKos}–${duel.theirKos} KO`}
                            {duel.reason &&
                            !['time', 'knockout', 'finish'].includes(
                                duel.reason,
                            )
                                ? ` · ${duel.reason}`
                                : ''}
                        </span>
                    </span>
                    {!duel.ranked && (
                        <Badge variant="outline" className="text-[10px]">
                            {duel.mode === 'race' ? 'Race' : 'Friendly'}
                        </Badge>
                    )}
                    <span className="text-xs whitespace-nowrap text-muted-foreground">
                        {duel.finishedAt}
                    </span>
                </li>
            ))}
        </ul>
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
