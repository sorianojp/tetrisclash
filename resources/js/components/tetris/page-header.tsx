import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** The title block at the top of a page: an icon tile, the title, a line of context and actions. */
export function PageHeader({
    icon: Icon,
    title,
    description,
    actions,
    className,
}: {
    icon: LucideIcon;
    title: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    className?: string;
}) {
    return (
        <header
            className={cn(
                'flex flex-wrap items-center justify-between gap-4',
                className,
            )}
        >
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25 sm:size-12">
                    <Icon className="size-5 sm:size-6" />
                </span>
                <div className="min-w-0">
                    <h1 className="truncate text-2xl font-black tracking-tight sm:text-3xl">
                        {title}
                    </h1>
                    {description && (
                        <p className="text-sm text-muted-foreground">
                            {description}
                        </p>
                    )}
                </div>
            </div>
            {actions && (
                <div className="flex flex-wrap items-center gap-2">
                    {actions}
                </div>
            )}
        </header>
    );
}
