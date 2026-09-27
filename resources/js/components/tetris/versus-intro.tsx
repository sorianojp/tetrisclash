import { RankBadge } from '@/components/tetris/rank-badge';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { cn } from '@/lib/utils';

type Player = { id: number; name: string; rating: number; rank: RankProgress };

/**
 * Full-screen "YOU vs OPPONENT" card shown at the start of the pre-match countdown.
 * The parent decides when it's visible; `leaving` fades it out into the board.
 */
export function VersusIntro({
    me,
    opponent,
    title,
    rules,
    status,
    leaving,
    progress,
}: {
    me: Player;
    opponent: Player;
    /** e.g. "Ranked battle". */
    title: string;
    /** e.g. "First to 3 KOs · 2 minutes". */
    rules: string;
    /** Shown while the opponent hasn't connected yet. */
    status?: string;
    leaving: boolean;
    /** Time left in the intro, 1 → 0. */
    progress: number;
}) {
    return (
        <div
            role="status"
            aria-label={`${title}: ${me.name} versus ${opponent.name}`}
            className={cn(
                'fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 overflow-hidden bg-[#070a17] px-4 py-10 text-white transition-opacity duration-300',
                leaving && 'opacity-0',
            )}
        >
            {/* Each side glows in its player's colour. */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_50%,rgb(251_191_36/0.18),transparent_55%),radial-gradient(ellipse_at_85%_50%,rgb(244_63_94/0.2),transparent_55%)]"
            />

            <p className="relative text-xs font-semibold tracking-[0.3em] text-fuchsia-300 uppercase sm:text-sm">
                {title}
            </p>

            <div className="relative grid w-full max-w-5xl items-center gap-6 sm:grid-cols-[1fr_auto_1fr] sm:gap-10">
                <Side
                    player={me}
                    label="You"
                    className="motion-safe:animate-versus-in-left sm:items-end sm:text-right"
                    labelClassName="text-amber-300"
                />
                <span className="bg-gradient-to-br from-amber-300 via-rose-400 to-fuchsia-400 bg-clip-text px-3 text-center text-6xl font-black text-transparent italic drop-shadow-[0_0_24px_rgb(244_63_94/0.45)] motion-safe:animate-versus-slam sm:text-8xl">
                    VS
                </span>
                <Side
                    player={opponent}
                    label="Opponent"
                    className="motion-safe:animate-versus-in-right sm:items-start sm:text-left"
                    labelClassName="text-rose-400"
                />
            </div>

            <div className="relative flex flex-col items-center gap-2 text-center">
                <p className="text-sm font-semibold text-indigo-100 sm:text-base">
                    {rules}
                </p>
                {status && (
                    <p className="text-xs text-indigo-300 sm:text-sm">
                        {status}
                    </p>
                )}
            </div>

            {/* Drains as the intro runs out, into the board countdown. */}
            <div
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-1 bg-white/10"
            >
                <div
                    className="h-full bg-gradient-to-r from-amber-300 via-rose-400 to-fuchsia-400 transition-[width] duration-100 ease-linear"
                    style={{ width: `${progress * 100}%` }}
                />
            </div>
        </div>
    );
}

function Side({
    player,
    label,
    className,
    labelClassName,
}: {
    player: Player;
    label: string;
    className: string;
    labelClassName: string;
}) {
    return (
        <div
            className={cn(
                'flex min-w-0 flex-col items-center gap-2 text-center',
                className,
            )}
        >
            <span
                className={cn(
                    'text-xs font-bold tracking-[0.3em] uppercase',
                    labelClassName,
                )}
            >
                {label}
            </span>
            <span className="max-w-full truncate text-4xl font-black tracking-tight sm:text-6xl">
                {player.name}
            </span>
            <RankBadge progress={player.rank} className="max-w-full" />
            <span className="text-sm text-indigo-200 tabular-nums">
                Rating {player.rating}
            </span>
        </div>
    );
}
