import { Link } from '@inertiajs/react';
import { ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCurrentUrl } from '@/hooks/use-current-url';
import { cn } from '@/lib/utils';
import { dashboard as adminDashboard } from '@/routes/admin';
import { index as botsIndex } from '@/routes/admin/bots';
import { index as duelsIndex } from '@/routes/admin/duels';
import { index as practiceIndex } from '@/routes/admin/practice';
import { index as tournamentsIndex } from '@/routes/admin/tournaments';
import { index as usersIndex } from '@/routes/admin/users';

const sections = [
    { title: 'Overview', href: adminDashboard(), exact: true },
    { title: 'Users', href: usersIndex(), exact: false },
    { title: 'Leaderboards', href: practiceIndex(), exact: false },
    { title: 'Tournaments', href: tournamentsIndex(), exact: false },
    { title: 'Duels', href: duelsIndex(), exact: false },
    { title: 'Bots', href: botsIndex(), exact: false },
];

export const adminBreadcrumb = { title: 'Admin', href: adminDashboard() };

/** Page title plus the tabs between admin sections. */
export function AdminHeader({
    title,
    description,
    actions,
}: {
    title: string;
    description?: string;
    actions?: ReactNode;
}) {
    const { isCurrentUrl, isCurrentOrParentUrl } = useCurrentUrl();

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
                        <ShieldCheck className="size-6 text-sky-500" /> {title}
                    </h1>
                    {description && (
                        <p className="text-sm text-muted-foreground">
                            {description}
                        </p>
                    )}
                </div>
                {actions}
            </div>
            <nav
                aria-label="Admin sections"
                className="-mx-1 flex gap-1 overflow-x-auto border-b pb-px"
            >
                {sections.map((section) => {
                    const active = section.exact
                        ? isCurrentUrl(section.href)
                        : isCurrentOrParentUrl(section.href);

                    return (
                        <Link
                            key={section.title}
                            href={section.href}
                            prefetch
                            className={cn(
                                '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                                active
                                    ? 'border-foreground text-foreground'
                                    : 'border-transparent text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {section.title}
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
