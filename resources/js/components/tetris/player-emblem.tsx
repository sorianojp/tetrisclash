import { cn } from '@/lib/utils';

/** Piece colours, as block gradients. A player keeps the same one everywhere. */
const TONES = [
    'from-cyan-300 to-sky-500 text-cyan-950',
    'from-amber-300 to-orange-500 text-amber-950',
    'from-violet-400 to-fuchsia-600 text-white',
    'from-lime-300 to-emerald-500 text-emerald-950',
    'from-rose-400 to-red-600 text-white',
    'from-sky-400 to-indigo-600 text-white',
    'from-orange-300 to-amber-600 text-orange-950',
] as const;

const SIZES = {
    xs: 'size-6 rounded-md text-[11px] shadow-[inset_0_2px_0_rgb(255_255_255/0.35),inset_0_-2px_0_rgb(0_0_0/0.2)]',
    sm: 'size-8 rounded-lg text-sm shadow-[inset_0_3px_0_rgb(255_255_255/0.35),inset_0_-3px_0_rgb(0_0_0/0.2)]',
    md: 'size-11 rounded-xl text-lg shadow-[inset_0_4px_0_rgb(255_255_255/0.35),inset_0_-4px_0_rgb(0_0_0/0.22)]',
    lg: 'size-16 rounded-xl text-3xl shadow-[inset_0_6px_0_rgb(255_255_255/0.35),inset_0_-6px_0_rgb(0_0_0/0.25)]',
    xl: 'size-24 rounded-2xl text-5xl shadow-[inset_0_8px_0_rgb(255_255_255/0.35),inset_0_-8px_0_rgb(0_0_0/0.25)]',
} as const;

export function emblemTone(seed: number | string): string {
    const n =
        typeof seed === 'number'
            ? seed
            : Array.from(seed).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);

    return TONES[Math.abs(n) % TONES.length];
}

/**
 * A player's avatar: their initial on a bevelled block, like a piece on the board.
 * `tone` overrides the colour (the match intro uses amber for you, rose for them).
 */
export function PlayerEmblem({
    name,
    id,
    size = 'sm',
    tone,
    className,
}: {
    name: string;
    /** Picks the colour; falls back to the name. */
    id?: number;
    size?: keyof typeof SIZES;
    tone?: string;
    className?: string;
}) {
    const initial = Array.from(name.trim())[0]?.toUpperCase() ?? '?';

    return (
        <span
            aria-hidden
            className={cn(
                'inline-flex shrink-0 items-center justify-center bg-gradient-to-br leading-none font-black select-none',
                SIZES[size],
                tone ?? emblemTone(id ?? name),
                className,
            )}
        >
            {initial}
        </span>
    );
}
