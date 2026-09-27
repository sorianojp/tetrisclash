/**
 * Glowing orbs that fly between the two boards when garbage is sent.
 * Pure DOM + Web Animations API, so firing one never re-renders React.
 */

type Point = { x: number; y: number };

const COLORS = {
    outgoing: { core: '#fff6c2', glow: '#ffb423' },
    incoming: { core: '#ffd0d8', glow: '#ff2d55' },
};

function reducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function orb(size: number, core: string, glow: string): HTMLDivElement {
    const el = document.createElement('div');
    Object.assign(el.style, {
        position: 'fixed',
        left: '0px',
        top: '0px',
        width: `${size}px`,
        height: `${size}px`,
        marginLeft: `${-size / 2}px`,
        marginTop: `${-size / 2}px`,
        borderRadius: '9999px',
        pointerEvents: 'none',
        zIndex: '60',
        background: `radial-gradient(circle, ${core} 0%, ${glow} 55%, transparent 72%)`,
        boxShadow: `0 0 ${size}px ${size / 3}px ${glow}`,
        mixBlendMode: 'screen',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(el);

    return el;
}

/** Points along a curved arc from `from` to `to`, for keyframes. */
function arc(from: Point, to: Point, lift: number, steps = 12): Point[] {
    const control = {
        x: (from.x + to.x) / 2,
        y: Math.min(from.y, to.y) - lift,
    };

    return Array.from({ length: steps + 1 }, (_, i) => {
        const t = i / steps;
        const u = 1 - t;

        return {
            x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
            y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
        };
    });
}

function impact(at: Point, glow: string, size: number): void {
    const ring = document.createElement('div');
    Object.assign(ring.style, {
        position: 'fixed',
        left: `${at.x}px`,
        top: `${at.y}px`,
        width: `${size}px`,
        height: `${size}px`,
        marginLeft: `${-size / 2}px`,
        marginTop: `${-size / 2}px`,
        borderRadius: '9999px',
        border: `3px solid ${glow}`,
        boxShadow: `0 0 18px ${glow}, inset 0 0 18px ${glow}`,
        pointerEvents: 'none',
        zIndex: '60',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(ring);

    ring.animate(
        [
            { transform: 'scale(0.3)', opacity: 1 },
            { transform: 'scale(2.6)', opacity: 0 },
        ],
        { duration: 420, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
    ).onfinish = () => ring.remove();
}

/**
 * Fire an attack orb (plus a short comet tail) from one point to another.
 * Bigger attacks make bigger orbs.
 */
export function launchAttack(
    from: Point,
    to: Point,
    lines: number,
    direction: 'outgoing' | 'incoming',
): void {
    const { core, glow } = COLORS[direction];
    const size = 14 + Math.min(lines, 10) * 3;

    if (reducedMotion()) {
        impact(to, glow, size);

        return;
    }

    const path = arc(from, to, 80 + Math.min(lines, 10) * 8);
    const duration = 520;
    const tail = Math.min(3 + lines, 8);

    for (let i = 0; i <= tail; i++) {
        const scale = 1 - i / (tail + 1);
        const el = orb(size * scale, core, glow);
        el.style.opacity = String(i === 0 ? 1 : 0.55 * scale);

        const animation = el.animate(
            path.map((p, index) => ({
                transform: `translate(${p.x}px, ${p.y}px) scale(${index === 0 ? 0.4 : 1})`,
            })),
            {
                duration,
                delay: i * 22,
                easing: 'cubic-bezier(0.45, 0, 0.55, 1)',
                fill: 'backwards',
            },
        );

        animation.onfinish = () => {
            el.remove();

            if (i === 0) {
                impact(to, glow, size * 1.4);
            }
        };
    }
}

/** Centre of an element's box, optionally offset by a fraction of its size. */
export function pointIn(el: Element, fx = 0.5, fy = 0.5): Point {
    const rect = el.getBoundingClientRect();

    return {
        x: rect.left + rect.width * fx,
        y: rect.top + rect.height * fy,
    };
}
