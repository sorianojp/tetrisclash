import { Link, usePage } from '@inertiajs/react';
import { Gamepad2, Swords, UserRound } from 'lucide-react';
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
import { dashboard, practice } from '@/routes';
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
];

export function AppSidebar() {
    const { auth } = usePage().props;
    const mainNavItems: NavItem[] = [
        ...gameNavItems,
        { title: 'Profile', href: showPlayer(auth.user.id), icon: UserRound },
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
