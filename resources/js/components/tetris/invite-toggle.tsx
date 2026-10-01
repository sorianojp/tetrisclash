import { router } from '@inertiajs/react';
import { Bell, BellOff } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { preference } from '@/routes/invites';
import { useUser } from '@/hooks/use-user';

/** The player's "don't disturb" switch for incoming invites. */
export function InviteToggle() {
    const user = useUser();
    const acceptsInvites = user.accepts_invites;
    const [saving, setSaving] = useState(false);

    const toggle = () =>
        router.patch(
            preference().url,
            { accepts_invites: !acceptsInvites },
            {
                preserveScroll: true,
                preserveState: true,
                onStart: () => setSaving(true),
                onFinish: () => setSaving(false),
            },
        );

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={toggle}
            disabled={saving}
            aria-pressed={acceptsInvites}
            title={
                acceptsInvites
                    ? 'Turn off to stop other players inviting you'
                    : 'Turn on to let other players invite you'
            }
        >
            {acceptsInvites ? <Bell /> : <BellOff />}
            {acceptsInvites ? 'Invites on' : 'Invites off'}
        </Button>
    );
}
