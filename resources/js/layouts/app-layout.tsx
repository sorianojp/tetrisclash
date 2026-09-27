import { usePage } from '@inertiajs/react';
import { InviteListener } from '@/components/tetris/invite-listener';
import AppLayoutTemplate from '@/layouts/app/app-sidebar-layout';
import type { BreadcrumbItem } from '@/types';

export default function AppLayout({
    breadcrumbs = [],
    children,
}: {
    breadcrumbs?: BreadcrumbItem[];
    children: React.ReactNode;
}) {
    const { auth } = usePage().props;

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
