import { Badge } from '@/components/ui/badge';

export function UserBadges({
    user,
}: {
    user: {
        isAdmin: boolean;
        isBot: boolean;
        banned: boolean;
        verified: boolean;
    };
}) {
    return (
        <>
            {user.isAdmin && <Badge variant="secondary">Admin</Badge>}
            {user.isBot && <Badge variant="outline">Bot</Badge>}
            {user.banned && <Badge variant="destructive">Banned</Badge>}
            {!user.verified && <Badge variant="outline">Unverified</Badge>}
        </>
    );
}
