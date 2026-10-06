import { router, usePage } from '@inertiajs/react';
import { useEffect } from 'react';
import { InviteListener } from '@/components/tetris/invite-listener';
import AppLayoutTemplate from '@/layouts/app/app-sidebar-layout';
import { dashboard } from '@/routes';
import { AUTOPILOT_PAUSE_MS, useAutopilot } from '@/tetris/autopilot';
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
    const { component } = usePage();
    const autopilot = useAutopilot();

    // Autopilot only knows the lobby, matches and practice; from anywhere else, head back.
    useEffect(() => {
        if (
            !autopilot.running ||
            ['lobby', 'duel', 'practice'].includes(component)
        ) {
            return;
        }

        const back = setTimeout(
            () => router.visit(dashboard()),
            AUTOPILOT_PAUSE_MS * 2,
        );

        return () => clearTimeout(back);
    }, [autopilot.running, component]);

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
