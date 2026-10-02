import {
    Anvil,
    Bomb,
    BrickWall,
    Building2,
    Castle,
    CircleDot,
    CloudLightning,
    Crown,
    Ghost,
    Grid2x2,
    Hammer,
    Layers,
    Link2,
    Magnet,
    Moon,
    Mountain,
    Rocket,
    RotateCw,
    Rows3,
    ShieldHalf,
    Shovel,
    Sun,
    Tornado,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useId } from 'react';
import { cn } from '@/lib/utils';

/** The frame grows grander with each group of titles (App\Support\Ranks::GROUPS). */
type Frame = 'block' | 'shield' | 'hexagon' | 'octagon' | 'seal';

type RankStyle = {
    /** First rank that carries the title. */
    from: number;
    group: string;
    frame: Frame;
    icon: LucideIcon;
    /** Badge face, its darker rim, and the icon colour. */
    face: string;
    rim: string;
    glyph: string;
};

/**
 * One badge per title, keyed by name; mirrors App\Support\Ranks::TITLES. Every title has its
 * own icon and colour, and its group sets the frame.
 */
export const RANK_STYLES: Record<string, RankStyle> = {
    // Blocks: a game block.
    Pebble: {
        from: 1,
        group: 'Blocks',
        frame: 'block',
        icon: CircleDot,
        face: '#78716c',
        rim: '#44403c',
        glyph: '#fafaf9',
    },
    Brick: {
        from: 6,
        group: 'Blocks',
        frame: 'block',
        icon: BrickWall,
        face: '#c2410c',
        rim: '#7c2d12',
        glyph: '#ffedd5',
    },
    Stacker: {
        from: 11,
        group: 'Blocks',
        frame: 'block',
        icon: Layers,
        face: '#d97706',
        rim: '#78350f',
        glyph: '#fffbeb',
    },
    'Line Breaker': {
        from: 16,
        group: 'Blocks',
        frame: 'block',
        icon: Rows3,
        face: '#65a30d',
        rim: '#365314',
        glyph: '#f7fee7',
    },
    'Block Smith': {
        from: 21,
        group: 'Blocks',
        frame: 'block',
        icon: Anvil,
        face: '#0d9488',
        rim: '#134e4a',
        glyph: '#f0fdfa',
    },
    // Builders: a shield.
    'Combo Crafter': {
        from: 26,
        group: 'Builders',
        frame: 'shield',
        icon: Link2,
        face: '#0284c7',
        rim: '#0c4a6e',
        glyph: '#f0f9ff',
    },
    'Well Digger': {
        from: 31,
        group: 'Builders',
        frame: 'shield',
        icon: Shovel,
        face: '#059669',
        rim: '#064e3b',
        glyph: '#ecfdf5',
    },
    'Spin Adept': {
        from: 36,
        group: 'Builders',
        frame: 'shield',
        icon: RotateCw,
        face: '#7c3aed',
        rim: '#4c1d95',
        glyph: '#f5f3ff',
    },
    'Tower Keeper': {
        from: 41,
        group: 'Builders',
        frame: 'shield',
        icon: Castle,
        face: '#4f46e5',
        rim: '#312e81',
        glyph: '#eef2ff',
    },
    'Quad Striker': {
        from: 46,
        group: 'Builders',
        frame: 'shield',
        icon: Grid2x2,
        face: '#0891b2',
        rim: '#164e63',
        glyph: '#ecfeff',
    },
    // Fighters: a hexagon.
    'Garbage Crusher': {
        from: 51,
        group: 'Fighters',
        frame: 'hexagon',
        icon: Bomb,
        face: '#ea580c',
        rim: '#7c2d12',
        glyph: '#fff7ed',
    },
    'Skyline Architect': {
        from: 56,
        group: 'Fighters',
        frame: 'hexagon',
        icon: Building2,
        face: '#2563eb',
        rim: '#1e3a8a',
        glyph: '#eff6ff',
    },
    'Board Breaker': {
        from: 61,
        group: 'Fighters',
        frame: 'hexagon',
        icon: Hammer,
        face: '#dc2626',
        rim: '#7f1d1d',
        glyph: '#fef2f2',
    },
    'Storm Stacker': {
        from: 66,
        group: 'Fighters',
        frame: 'hexagon',
        icon: CloudLightning,
        face: '#334155',
        rim: '#0f172a',
        glyph: '#facc15',
    },
    'Gravity Bender': {
        from: 71,
        group: 'Fighters',
        frame: 'hexagon',
        icon: Magnet,
        face: '#c026d3',
        rim: '#701a75',
        glyph: '#fdf4ff',
    },
    // Forces: an octagon with a spiked burst behind it.
    'Well Warden': {
        from: 76,
        group: 'Forces',
        frame: 'octagon',
        icon: ShieldHalf,
        face: '#15803d',
        rim: '#14532d',
        glyph: '#dcfce7',
    },
    Titan: {
        from: 81,
        group: 'Forces',
        frame: 'octagon',
        icon: Mountain,
        face: '#92400e',
        rim: '#451a03',
        glyph: '#fde68a',
    },
    Tempest: {
        from: 86,
        group: 'Forces',
        frame: 'octagon',
        icon: Tornado,
        face: '#155e75',
        rim: '#083344',
        glyph: '#a5f3fc',
    },
    'Void Walker': {
        from: 91,
        group: 'Forces',
        frame: 'octagon',
        icon: Ghost,
        face: '#3b0764',
        rim: '#1a032e',
        glyph: '#d8b4fe',
    },
    Nova: {
        from: 96,
        group: 'Forces',
        frame: 'octagon',
        icon: Sun,
        face: '#f59e0b',
        rim: '#92400e',
        glyph: '#451a03',
    },
    // Cosmic: a round seal in a sunburst.
    Eclipse: {
        from: 101,
        group: 'Cosmic',
        frame: 'seal',
        icon: Moon,
        face: '#1e1b4b',
        rim: '#0b0a24',
        glyph: '#fcd34d',
    },
    Ascendant: {
        from: 106,
        group: 'Cosmic',
        frame: 'seal',
        icon: Rocket,
        face: '#be123c',
        rim: '#4c0519',
        glyph: '#fff1f2',
    },
    'Clash Sovereign': {
        from: 110,
        group: 'Cosmic',
        frame: 'seal',
        icon: Crown,
        face: '#eab308',
        rim: '#713f12',
        glyph: '#422006',
    },
};

const TITLES = Object.keys(RANK_STYLES);

export function rankStyle(title: string): RankStyle {
    return RANK_STYLES[title] ?? RANK_STYLES.Pebble;
}

/** The title after this one, if any. */
export function nextTitle(title: string): string | null {
    const i = TITLES.indexOf(title);

    return i >= 0 && i < TITLES.length - 1 ? TITLES[i + 1] : null;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/** A rank's level within its title: Tower Keeper I–V. */
export function rankTier(rank: number, title: string): string {
    return ROMAN[Math.max(0, rank - rankStyle(title).from)] ?? '';
}

/** Regular polygon points, centred in the 100×100 box. */
function polygon(sides: number, radius: number, rotate = 0): string {
    return Array.from({ length: sides }, (_, i) => {
        const a = ((Math.PI * 2) / sides) * i + rotate;

        return `${50 + radius * Math.sin(a)},${50 - radius * Math.cos(a)}`;
    }).join(' ');
}

/** A star: alternating outer and inner points. */
function star(points: number, outer: number, inner: number): string {
    return Array.from({ length: points * 2 }, (_, i) => {
        const a = (Math.PI / points) * i;
        const r = i % 2 === 0 ? outer : inner;

        return `${50 + r * Math.sin(a)},${50 - r * Math.cos(a)}`;
    }).join(' ');
}

/** Each frame's outline, and where its icon sits (x, y, size). */
const FRAMES: Record<
    Frame,
    {
        shape: (props: object) => React.ReactNode;
        icon: [number, number, number];
    }
> = {
    block: {
        shape: (p) => (
            <rect x="12" y="12" width="76" height="76" rx="16" {...p} />
        ),
        icon: [28, 28, 44],
    },
    shield: {
        shape: (p) => (
            <path
                d="M50 8 L86 20 V47 C86 70 70 85 50 93 C30 85 14 70 14 47 V20 Z"
                {...p}
            />
        ),
        icon: [29, 25, 42],
    },
    hexagon: {
        shape: (p) => <polygon points={polygon(6, 42, Math.PI / 6)} {...p} />,
        icon: [29, 29, 42],
    },
    octagon: {
        shape: (p) => <polygon points={polygon(8, 36, Math.PI / 8)} {...p} />,
        icon: [31, 31, 38],
    },
    seal: {
        shape: (p) => <circle cx="50" cy="50" r="34" {...p} />,
        icon: [32, 32, 36],
    },
};

const SIZES = {
    xs: 'size-[18px]',
    sm: 'size-6',
    md: 'size-10',
    lg: 'size-16',
    xl: 'size-28',
    '2xl': 'size-40',
} as const;

/**
 * A rank's badge: its title's frame, colour and icon. Bigger sizes add the level within the
 * title (I–V) on a ribbon.
 */
export function RankEmblem({
    rank,
    title,
    size = 'md',
    showTier = true,
    className,
}: {
    rank: number;
    title: string;
    size?: keyof typeof SIZES;
    /** The I–V ribbon on bigger sizes; off for a title's badge on its own (the ladder). */
    showTier?: boolean;
    className?: string;
}) {
    const style = rankStyle(title);
    const frame = FRAMES[style.frame];
    const clip = useId();
    const [ix, iy, is] = frame.icon;
    const withTier =
        showTier && (size === 'lg' || size === 'xl' || size === '2xl');
    const tier = rankTier(rank, title);

    return (
        <span
            className={cn(
                'relative inline-flex shrink-0',
                SIZES[size],
                className,
            )}
            role="img"
            aria-label={`Rank ${rank} · ${title}`}
        >
            <svg viewBox="0 0 100 100" className="size-full overflow-visible">
                <defs>
                    <clipPath id={clip}>{frame.shape({})}</clipPath>
                </defs>

                {/* Forces get a spiked burst; Cosmic a sunburst and an outer ring. */}
                {style.frame === 'octagon' && (
                    <polygon
                        points={star(8, 50, 38)}
                        fill={style.face}
                        stroke={style.rim}
                        strokeWidth={3}
                        strokeLinejoin="round"
                    />
                )}
                {style.frame === 'seal' && (
                    <>
                        <polygon points={star(16, 50, 40)} fill="#fbbf24" />
                        <circle cx="50" cy="50" r="41" fill={style.rim} />
                    </>
                )}

                {frame.shape({ fill: style.face })}
                {/* Bevel, like a block on the board: light along the top, shade along the bottom. */}
                <g clipPath={`url(#${clip})`}>
                    <rect
                        x="0"
                        y="0"
                        width="100"
                        height="30"
                        fill="#fff"
                        opacity="0.18"
                    />
                    <rect
                        x="0"
                        y="72"
                        width="100"
                        height="28"
                        fill="#000"
                        opacity="0.18"
                    />
                </g>
                {frame.shape({
                    fill: 'none',
                    stroke: style.rim,
                    strokeWidth: 6,
                    strokeLinejoin: 'round',
                })}

                <style.icon
                    x={ix}
                    y={iy}
                    width={is}
                    height={is}
                    color={style.glyph}
                    strokeWidth={2.4}
                />
            </svg>

            {withTier && tier && (
                <span
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-md px-1.5 text-[10px] leading-4 font-black tracking-wider text-white shadow ring-2 ring-background"
                    style={{ backgroundColor: style.rim }}
                >
                    {tier}
                </span>
            )}
        </span>
    );
}
