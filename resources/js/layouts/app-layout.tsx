import { usePage } from '@inertiajs/react';
import { InviteListener } from '@/components/tetris/invite-listener';
import AppLayoutTemplate from '@/layouts/app/app-sidebar-layout';
import { applyGameTheme } from '@/tetris/themes';
import type { BreadcrumbItem } from '@/types';

export default function AppLayout({
    breadcrumbs = [],
    children,
}: {
    breadcrumbs?: BreadcrumbItem[];
    children: React.ReactNode;
}) {
    const { auth } = usePage().props;

    // Boards draw from module-level colours, so keep them on the player's theme.
    applyGameTheme(auth.user?.piece_theme, auth.user?.board_skin);

    return (
        <AppLayoutTemplate breadcrumbs={breadcrumbs}>
            {/* Only verified players can play, so only they appear online. */}
            {auth.user?.email_verified_at && (
                <InviteListener userId={auth.user.id} />
            )}
            {children}
        </AppLayoutTemplate>
    );
}
