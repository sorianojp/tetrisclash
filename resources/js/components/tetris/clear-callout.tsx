import type { ClearInfo } from '@/tetris/engine';

const LINE_NAMES = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];

/** Human readable lines for a clear, e.g. ["B2B", "T-SPIN DOUBLE", "3 COMBO"]. */
export function describeClear(info: ClearInfo): string[] {
    const parts: string[] = [];

    if (info.perfectClear) {
        parts.push('PERFECT CLEAR');
    }

    if (info.backToBack) {
        parts.push('BACK-TO-BACK');
    }

    if (info.tSpin !== 'none') {
        parts.push(
            `T-SPIN ${info.tSpin === 'mini' ? 'MINI ' : ''}${LINE_NAMES[info.lines]}`,
        );
    } else if (info.lines === 4) {
        parts.push('TETRIS');
    }

    if (info.combo > 0) {
        parts.push(`${info.combo} COMBO`);
    }

    return parts;
}

export type Callout = { id: number; lines: string[]; attack: number };

/** Colour and size for each kind of callout line. */
function toneFor(line: string): string {
    if (line.startsWith('PERFECT')) {
        return 'text-rainbow text-3xl sm:text-4xl';
    }

    if (line.startsWith('T-SPIN')) {
        return 'text-fuchsia-300 text-2xl sm:text-3xl [text-shadow:0_0_18px_rgb(217_70_239/0.9)]';
    }

    if (line === 'TETRIS') {
        return 'text-cyan-200 text-3xl sm:text-4xl [text-shadow:0_0_18px_rgb(34_211_238/0.9)]';
    }

    if (line === 'BACK-TO-BACK') {
        return 'text-amber-200 text-base sm:text-lg [text-shadow:0_0_12px_rgb(251_191_36/0.9)]';
    }

    // Combos
    return 'text-orange-300 text-xl sm:text-2xl [text-shadow:0_0_14px_rgb(251_146_60/0.8)]';
}

/**
 * Brief animated text for special clears, shown over the board. Keyed by
 * callout id so each clear restarts the CSS animation.
 */
export function ClearCallout({ callout }: { callout: Callout | null }) {
    if (!callout || callout.lines.length === 0) {
        return null;
    }

    return (
        <div
            key={callout.id}
            className="pointer-events-none absolute inset-x-0 top-1/3 flex animate-callout flex-col items-center gap-0.5"
        >
            {callout.lines.map((line) => (
                <span
                    key={line}
                    className={`font-black tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] ${toneFor(line)}`}
                >
                    {line}
                </span>
            ))}
            {callout.attack > 0 && (
                <span className="text-sm font-bold text-rose-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                    +{callout.attack} attack
                </span>
            )}
        </div>
    );
}
