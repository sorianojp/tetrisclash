import { Zap } from 'lucide-react';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Ranked-match energy as the server sent it (User::energyStatus). */
export type EnergyStatus = {
    current: number;
    max: number;
    /** When the next point arrives (server clock, ms); null when full. */
    nextAt: number | null;
    intervalMs: number;
};

/** Pips get crowded past this; larger pools show a single icon. */
const MAX_PIPS = 10;

/**
 * Energy at `now` (server clock), counting refills since the server's snapshot, so the
 * meter ticks up on its own without asking the server again.
 */
export function liveEnergy(
    status: EnergyStatus,
    now: number,
): { current: number; nextInMs: number | null } {
    if (status.nextAt === null) {
        return { current: status.current, nextInMs: null };
    }

    if (now < status.nextAt) {
        return { current: status.current, nextInMs: status.nextAt - now };
    }

    const refilled = 1 + Math.floor((now - status.nextAt) / status.intervalMs);
    const current = Math.min(status.max, status.current + refilled);

    return {
        current,
        nextInMs:
            current >= status.max
                ? null
                : status.nextAt + refilled * status.intervalMs - now,
    };
}

export function EnergyMeter({
    current,
    max,
    nextInMs,
    intervalMs,
}: {
    current: number;
    max: number;
    nextInMs: number | null;
    intervalMs: number;
}) {
    const minutes = Math.round(intervalMs / 60_000);

    return (
        <div className="flex flex-col gap-1 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <div
                    className="flex items-center gap-0.5"
                    role="img"
                    aria-label={`Energy ${current} of ${max}`}
                >
                    {max <= MAX_PIPS ? (
                        Array.from({ length: max }, (_, i) => (
                            <Zap
                                key={i}
                                className={cn(
                                    'size-5',
                                    i < current
                                        ? 'fill-amber-300 text-amber-300'
                                        : 'text-white/30',
                                )}
                            />
                        ))
                    ) : (
                        <Zap className="size-5 fill-amber-300 text-amber-300" />
                    )}
                </div>
                <span className="font-semibold tabular-nums">
                    {current}/{max}
                </span>
                <span className="text-indigo-200 tabular-nums">
                    {nextInMs === null
                        ? 'Full'
                        : `+1 in ${formatTime(Math.ceil(nextInMs / 1000) * 1000, false)}`}
                </span>
            </div>
            <p className="text-xs text-indigo-200">
                {current === 0
                    ? 'Out of energy. Friendly matches and practice are free.'
                    : `Ranked matches use 1 energy. Refills 1 every ${minutes} min.`}
            </p>
        </div>
    );
}
