import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Marks an autopilot account (it plays itself on a livestream) wherever its name shows. */
export function LiveBotTag({ className }: { className?: string }) {
    return (
        <span
            title="This account plays itself on autopilot, live on stream"
            className={cn(
                'inline-flex shrink-0 items-center gap-1 self-center rounded-md bg-cyan-400 px-1.5 py-0.5 text-[10px] leading-none font-black tracking-wider whitespace-nowrap text-cyan-950 uppercase',
                className,
            )}
        >
            <Bot className="size-3" />
            Live bot
        </span>
    );
}
