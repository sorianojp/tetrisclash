import { Flag, Swords } from 'lucide-react';
import { RankBadge, RankProgressBar } from '@/components/tetris/rank-badge';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

type Player = {
    id: number;
    name: string;
    rating: number;
    rank: RankProgress;
    wins: number;
    losses: number;
};

/** Each side's colours: you in amber, the opponent in rose, like the board glows. */
const SIDES = {
    you: {
        label: 'You',
        tag: 'bg-amber-300 text-amber-950',
        ring: 'ring-amber-300/50 shadow-[0_0_60px_-12px_rgb(251_191_36/0.55)]',
        bar: 'from-amber-300 via-amber-400 to-orange-400',
        emblem: 'from-amber-300 via-amber-400 to-orange-500 text-amber-950',
        enter: 'motion-safe:animate-card-in-left',
    },
    opponent: {
        label: 'Opponent',
        tag: 'bg-rose-400 text-rose-950',
        ring: 'ring-rose-400/50 shadow-[0_0_60px_-12px_rgb(244_63_94/0.55)]',
        bar: 'from-rose-400 via-pink-500 to-fuchsia-500',
        emblem: 'from-rose-400 via-pink-500 to-fuchsia-600 text-white',
        enter: 'motion-safe:animate-card-in-right',
    },
} as const;

/**
 * Full-screen pre-match intro: the two players face off as cards, with VS between them.
 * The parent decides when it's visible; `leaving` fades it out into the board.
 */
export function VersusIntro({
    me,
    opponent,
    mode,
    title,
    rules,
    status,
    leaving,
    progress,
}: {
    me: Player;
    opponent: Player;
    mode: 'battle' | 'race';
    /** e.g. "Ranked battle", or a tournament round. */
    title: string;
    /** e.g. ["First to 3 KOs", "2 minutes"]. */
    rules: string[];
    /** Shown while the opponent hasn't connected yet. */
    status?: string;
    leaving: boolean;
    /** Time left in the intro, 1 → 0. */
    progress: number;
}) {
    const ModeIcon = mode === 'race' ? Flag : Swords;

    return (
        <div
            role="status"
            aria-label={`${title}: ${me.name} versus ${opponent.name}`}
            className={cn(
                'fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 overflow-hidden bg-[#070a17] px-3 py-8 text-white transition-opacity duration-300 sm:gap-10 sm:px-6',
                leaving && 'opacity-0',
            )}
        >
            {/* Each side glows in its player's colour, over a faint board grid. */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_18%_55%,rgb(251_191_36/0.16),transparent_55%),radial-gradient(ellipse_at_82%_55%,rgb(244_63_94/0.18),transparent_55%),radial-gradient(ellipse_at_50%_0%,rgb(139_92_246/0.18),transparent_60%)]"
            />
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.035)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.035)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)] bg-[size:44px_44px]"
            />

            <p className="relative inline-flex items-center gap-2 rounded-full border border-fuchsia-300/30 bg-fuchsia-400/10 px-4 py-1.5 text-xs font-bold tracking-[0.25em] text-fuchsia-200 uppercase motion-safe:animate-fade-down sm:text-sm">
                <ModeIcon className="size-4" />
                {title}
            </p>

            <div className="relative grid w-full max-w-4xl grid-cols-[1fr_auto_1fr] items-center">
                <PlayerCard player={me} side="you" />
                <div className="relative z-10 -mx-4 flex flex-col items-center sm:mx-2">
                    <span
                        aria-hidden
                        className="absolute top-1/2 left-1/2 h-40 w-px -translate-x-1/2 -translate-y-1/2 bg-gradient-to-b from-transparent via-white/40 to-transparent sm:h-72"
                    />
                    <span className="relative bg-gradient-to-br from-amber-300 via-rose-400 to-fuchsia-400 bg-clip-text px-1 text-4xl font-black text-transparent italic drop-shadow-[0_0_24px_rgb(244_63_94/0.6)] motion-safe:animate-versus-slam sm:text-7xl">
                        VS
                    </span>
                </div>
                <PlayerCard player={opponent} side="opponent" />
            </div>

            <div className="relative flex flex-col items-center gap-3 motion-safe:animate-fade-up">
                <ul className="flex flex-wrap justify-center gap-2">
                    {rules.map((rule) => (
                        <li
                            key={rule}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-indigo-100 sm:text-sm"
                        >
                            {rule}
                        </li>
                    ))}
                </ul>
                {status && (
                    <p className="flex items-center gap-2 text-xs text-indigo-300 sm:text-sm">
                        <Spinner className="size-3.5" />
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

function PlayerCard({
    player,
    side,
}: {
    player: Player;
    side: keyof typeof SIDES;
}) {
    const look = SIDES[side];
    const played = player.wins + player.losses;
    const winRate =
        played > 0 ? `${Math.round((player.wins / played) * 100)}%` : '—';

    return (
        <div className="min-w-0 [perspective:1200px]">
            <article
                className={cn(
                    'relative flex flex-col gap-3 overflow-hidden rounded-2xl bg-gradient-to-b from-[#161b33] to-[#0b0f20] p-3 ring-1 sm:gap-4 sm:rounded-3xl sm:p-6',
                    look.ring,
                    look.enter,
                )}
            >
                {/* The card's colour strip, and a holographic sheen that sweeps across once. */}
                <span
                    aria-hidden
                    className={cn(
                        'absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r',
                        look.bar,
                    )}
                />
                <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_35%,rgb(255_255_255/0.16)_48%,rgb(232_121_249/0.12)_52%,transparent_65%)] bg-[length:250%_100%] bg-[position:150%_0] motion-safe:animate-card-sheen"
                />

                <span
                    className={cn(
                        'self-start rounded-md px-2 py-0.5 text-[10px] font-black tracking-[0.15em] uppercase sm:text-xs sm:tracking-[0.2em]',
                        look.tag,
                    )}
                >
                    {look.label}
                </span>

                <Emblem name={player.name} className={look.emblem} />

                <div className="flex min-w-0 flex-col items-center gap-2 text-center">
                    <h2
                        className="w-full truncate text-lg leading-tight font-black tracking-tight sm:text-3xl"
                        title={player.name}
                    >
                        {player.name}
                    </h2>
                    <RankBadge
                        progress={player.rank}
                        compact
                        className="bg-white/10 text-white sm:hidden"
                    />
                    <RankBadge
                        progress={player.rank}
                        className="hidden max-w-full bg-white/10 text-white sm:inline-flex"
                    />
                </div>

                {/* Stacked rows on phones, side by side from tablets up. */}
                <dl className="flex flex-col divide-y divide-white/10 rounded-xl bg-white/[0.04] py-0.5 ring-1 ring-white/5 sm:grid sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:py-2 sm:text-center">
                    <Stat label="Rating" value={player.rating} />
                    <Stat
                        label="Record"
                        value={`${player.wins}–${player.losses}`}
                    />
                    <Stat label="Win" value={winRate} />
                </dl>

                <RankProgressBar
                    progress={player.rank}
                    className="hidden text-indigo-200 sm:flex"
                />
            </article>
        </div>
    );
}

/** A big bevelled block with the player's initial, like a piece on the board. */
function Emblem({ name, className }: { name: string; className: string }) {
    const initial = Array.from(name.trim())[0]?.toUpperCase() ?? '?';

    return (
        <div
            aria-hidden
            className={cn(
                'relative mx-auto flex aspect-square w-16 items-center justify-center rounded-xl bg-gradient-to-br text-3xl font-black shadow-[inset_0_6px_0_rgb(255_255_255/0.35),inset_0_-6px_0_rgb(0_0_0/0.25)] sm:w-28 sm:rounded-2xl sm:text-6xl sm:shadow-[inset_0_10px_0_rgb(255_255_255/0.35),inset_0_-10px_0_rgb(0_0_0/0.25)]',
                className,
            )}
        >
            {initial}
        </div>
    );
}

function Stat({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="flex min-w-0 items-center justify-between gap-2 px-2.5 py-1.5 sm:flex-col sm:justify-center sm:gap-0.5 sm:px-1 sm:py-0">
            <dt className="truncate text-[10px] font-semibold tracking-wider text-indigo-300 uppercase sm:text-[11px]">
                {label}
            </dt>
            <dd className="truncate text-sm font-black tabular-nums sm:text-xl">
                {value}
            </dd>
        </div>
    );
}
