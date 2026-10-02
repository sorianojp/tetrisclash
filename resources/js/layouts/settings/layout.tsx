import { Link } from '@inertiajs/react';
import type { PropsWithChildren } from 'react';
import { Palette, Settings, Shield, SunMoon, UserRound } from 'lucide-react';
import { PageHeader } from '@/components/tetris/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCurrentUrl } from '@/hooks/use-current-url';
import { cn, toUrl } from '@/lib/utils';
import { edit as editAppearance } from '@/routes/appearance';
import { edit } from '@/routes/profile';
import { edit as editSecurity } from '@/routes/security';
import { edit as editThemes } from '@/routes/themes';
import type { NavItem } from '@/types';

const sidebarNavItems: NavItem[] = [
    {
        title: 'Profile',
        icon: UserRound,
        href: edit(),
    },
    {
        title: 'Security',
        icon: Shield,
        href: editSecurity(),
    },
    {
        title: 'Appearance',
        icon: SunMoon,
        href: editAppearance(),
    },
    {
        title: 'Game themes',
        icon: Palette,
        href: editThemes(),
    },
];

export default function SettingsLayout({ children }: PropsWithChildren) {
    const { isCurrentOrParentUrl } = useCurrentUrl();

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
            <PageHeader
                icon={Settings}
                title="Settings"
                description="Manage your profile, account and how the game looks"
            />

            <div className="flex flex-col gap-6 lg:flex-row">
                <aside className="w-full lg:w-52">
                    <nav
                        className="flex gap-1 overflow-x-auto lg:flex-col"
                        aria-label="Settings"
                    >
                        {sidebarNavItems.map((item, index) => (
                            <Button
                                key={`${toUrl(item.href)}-${index}`}
                                size="sm"
                                variant="ghost"
                                asChild
                                className={cn(
                                    'h-9 shrink-0 justify-start rounded-lg font-semibold text-muted-foreground lg:w-full',
                                    isCurrentOrParentUrl(item.href) &&
                                        'bg-violet-500/20 text-foreground shadow-[inset_2px_0_0_0_var(--color-violet-400)]',
                                )}
                            >
                                <Link href={item.href}>
                                    {item.icon && (
                                        <item.icon className="h-4 w-4" />
                                    )}
                                    {item.title}
                                </Link>
                            </Button>
                        ))}
                    </nav>
                </aside>

                <Card className="min-w-0 flex-1 px-5 py-6 sm:px-8">
                    <section className="max-w-2xl space-y-12">
                        {children}
                    </section>
                </Card>
            </div>
        </div>
    );
}
