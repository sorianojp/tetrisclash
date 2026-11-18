import { Bot, Play, Zap } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { formatTime } from '@/lib/format';
import { useAutopilot } from '@/tetris/autopilot';

/** Alt+P starts and stops autopilot (the game itself doesn't use Alt). */
const SHORTCUT_CODE = 'KeyP';

/**
 * For autopilot accounts: the switch that starts autopilot in this browser. Once it's running
 * the card hides, so the stream shows only the game; Alt+P stops it (and starts it again).
 */
export function AutopilotBar({
    energy,
}: {
    energy?: { current: number; max: number; nextInMs: number | null };
}) {
    const autopilot = useAutopilot();
    const { enabled, running, start, stop } = autopilot;

    useEffect(() => {
        if (!enabled) {
            return;
        }

        const onKey = (event: KeyboardEvent) => {
            if (event.altKey && event.code === SHORTCUT_CODE && !event.repeat) {
                event.preventDefault();

                if (running) {
                    stop();
                } else {
                    start();
                }
            }
        };
        window.addEventListener('keydown', onKey);

        return () => window.removeEventListener('keydown', onKey);
    }, [enabled, running, start, stop]);

    if (!enabled || running) {
        return null;
    }

    return (
        <div className="fixed right-4 bottom-4 z-30 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl bg-[#0d1224]/95 py-2 pr-2 pl-3 text-white shadow-xl ring-1 ring-cyan-400/40 backdrop-blur">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-indigo-200">
                <Bot className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col leading-tight">
                <span className="text-[10px] font-black tracking-[0.2em] text-cyan-300 uppercase">
                    Autopilot · off
                </span>
                <span className="truncate text-sm font-bold">
                    Ranked, then Zen while energy refills
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
                onClick={start}
            >
                <Play /> Start
                <kbd className="ml-1 text-[10px] text-indigo-200">Alt+P</kbd>
            </Button>
        </div>
    );
}
