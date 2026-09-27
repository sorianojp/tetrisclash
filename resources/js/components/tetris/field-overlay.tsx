import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Dimmed layer over a game field for countdowns, KOs and results. */
export function FieldOverlay({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'absolute inset-0 flex items-center justify-center rounded-xl bg-black/55 backdrop-blur-[2px]',
                className,
            )}
        >
            {children}
        </div>
    );
}
