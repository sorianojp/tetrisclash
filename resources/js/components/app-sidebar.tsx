import { Link, usePage } from '@inertiajs/react';
import { Gamepad2, Info, Swords, Trophy, UserRound, Users } from 'lucide-react';
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
import { about, dashboard, practice } from '@/routes';
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
        { title: 'Profile', href: showPlayer(auth.user.id), icon: UserRound },
        { title: 'About', href: about(), icon: Info },
    ];

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href={dashboard()} prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={mainNavItems} />
            </SidebarContent>

            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
