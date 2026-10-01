import { Link, usePage } from '@inertiajs/react';
import {
    Gamepad2,
    Info,
    ShieldCheck,
    Swords,
    Trophy,
    UserRound,
    Users,
} from 'lucide-react';
import AppLogo from '@/components/app-logo';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { about, dashboard, home, practice } from '@/routes';
import { dashboard as adminDashboard } from '@/routes/admin';
import { index as onlineIndex } from '@/routes/online';
import { index as tournamentsIndex } from '@/routes/tournaments';
import { show as showPlayer } from '@/routes/players';
import type { NavItem } from '@/types';

const gameNavItems: NavItem[] = [
    {
        title: 'Lobby',
        href: dashboard(),
        icon: Swords,
    },
    {
        title: 'Practice',
        href: practice(),
        icon: Gamepad2,
    },
    {
        title: 'Tournaments',
        href: tournamentsIndex(),
        icon: Trophy,
    },
    {
        title: 'Online players',
        href: onlineIndex(),
        icon: Users,
    },
];

export function AppSidebar() {
    const { auth } = usePage().props;
    const mainNavItems: NavItem[] = [
        ...gameNavItems,
        ...(auth.user
            ? [
                  {
                      title: 'Profile',
                      href: showPlayer(auth.user.id),
                      icon: UserRound,
                  },
              ]
            : []),
        { title: 'About', href: about(), icon: Info },
    ];

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link
                                href={auth.user ? dashboard() : home()}
                                prefetch
                            >
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={mainNavItems} />
                {auth.user?.is_admin && (
                    <NavMain
                        label="Manage"
                        items={[
                            {
                                title: 'Admin',
                                href: adminDashboard(),
                                icon: ShieldCheck,
                            },
                        ]}
                        matchChildren
                    />
                )}
            </SidebarContent>

            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
