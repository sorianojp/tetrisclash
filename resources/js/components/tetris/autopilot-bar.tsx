import { Bot, Pause, Play, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAutopilot } from '@/tetris/autopilot';

/**
 * For autopilot accounts: what the autopilot is up to, its energy, and the switch that
 * starts or stops it in this browser. It sits in a corner, in view of the stream.
 */
export function AutopilotBar({
    status,
    energy,
}: {
    /** e.g. "Ranked: searching", "Zen while energy refills". */
    status: string;
    energy?: { current: number; max: number; nextInMs: number | null };
}) {
    const autopilot = useAutopilot();

    if (!autopilot.enabled) {
        return null;
    }

    return (
        <div className="fixed right-4 bottom-4 z-30 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl bg-[#0d1224]/95 py-2 pr-2 pl-3 text-white shadow-xl ring-1 ring-cyan-400/40 backdrop-blur">
            <span
                className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-lg',
                    autopilot.running
                        ? 'bg-cyan-400 text-cyan-950'
                        : 'bg-white/10 text-indigo-200',
                )}
            >
                <Bot className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col leading-tight">
                <span className="text-[10px] font-black tracking-[0.2em] text-cyan-300 uppercase">
                    Live bot{autopilot.running ? '' : ' · paused'}
                </span>
                <span className="truncate text-sm font-bold">
                    {autopilot.running ? status : 'Autopilot is off'}
                </span>
                {energy && (
                    <span className="flex items-center gap-1 text-xs text-indigo-200 tabular-nums">
                        <Zap className="size-3 text-amber-300" />
                        {energy.current}/{energy.max}
                        {energy.nextInMs !== null &&
                            ` · +1 in ${formatTime(energy.nextInMs, false)}`}
                    </span>
                )}
            </div>
            <Button
                size="sm"
                variant="secondary"
                className="bg-white/10 text-white hover:bg-white/20"
                onClick={autopilot.running ? autopilot.stop : autopilot.start}
            >
                {autopilot.running ? (
                    <>
                        <Pause /> Stop
                    </>
                ) : (
                    <>
                        <Play /> Start
                    </>
                )}
            </Button>
        </div>
    );
}
