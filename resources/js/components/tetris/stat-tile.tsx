import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const TONES = {
    default: 'text-muted-foreground',
    violet: 'text-violet-500 dark:text-violet-300',
    amber: 'text-amber-500 dark:text-amber-300',
    emerald: 'text-emerald-600 dark:text-emerald-300',
    rose: 'text-rose-500 dark:text-rose-300',
    cyan: 'text-cyan-600 dark:text-cyan-300',
} as const;

/** One number with its label, e.g. Rating 1121. */
export function StatTile({
    label,
    value,
    hint,
    icon: Icon,
    tone = 'default',
    className,
}: {
    label: string;
    value: ReactNode;
    hint?: ReactNode;
    icon?: LucideIcon;
    tone?: keyof typeof TONES;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'flex min-w-0 flex-col gap-1 rounded-xl border bg-muted/40 px-3 py-2.5 dark:bg-white/[0.03]',
                className,
            )}
        >
            <span
                className={cn(
                    'flex items-center gap-1.5 truncate text-[11px] font-semibold tracking-wider uppercase',
                    TONES[tone],
                )}
            >
                {Icon && <Icon className="size-3.5 shrink-0" />}
                {label}
            </span>
            <span className="truncate text-xl font-black tracking-tight tabular-nums">
                {value}
            </span>
            {hint && (
                <span className="truncate text-xs text-muted-foreground">
                    {hint}
                </span>
            )}
        </div>
    );
}
