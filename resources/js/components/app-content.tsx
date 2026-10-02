import * as React from 'react';
import { SidebarInset } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import type { AppVariant } from '@/types';

type Props = React.ComponentProps<'main'> & {
    variant?: AppVariant;
};

export function AppContent({ variant = 'sidebar', children, ...props }: Props) {
    if (variant === 'sidebar') {
        return (
            <SidebarInset
                {...props}
                className={cn(
                    // A faint violet glow at the top of every page.
                    'bg-[radial-gradient(ellipse_80%_40%_at_50%_0%,rgb(139_92_246/0.07),transparent)] dark:bg-[radial-gradient(ellipse_80%_40%_at_50%_0%,rgb(139_92_246/0.12),transparent)]',
                    props.className,
                )}
            >
                {children}
            </SidebarInset>
        );
    }

    return (
        <main
            className="mx-auto flex h-full w-full max-w-7xl flex-1 flex-col gap-4 rounded-xl"
            {...props}
        >
            {children}
        </main>
    );
}
