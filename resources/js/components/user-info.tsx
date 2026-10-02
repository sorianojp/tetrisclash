import { PlayerEmblem } from '@/components/tetris/player-emblem';
import { Avatar, AvatarImage } from '@/components/ui/avatar';
import type { User } from '@/types';

export function UserInfo({
    user,
    showEmail = false,
}: {
    user: User;
    showEmail?: boolean;
}) {
    return (
        <>
            {user.avatar ? (
                <Avatar className="h-8 w-8 overflow-hidden rounded-lg">
                    <AvatarImage src={user.avatar} alt={user.name} />
                </Avatar>
            ) : (
                <PlayerEmblem name={user.name} id={user.id} size="sm" />
            )}
            <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                {showEmail && (
                    <span className="truncate text-xs text-muted-foreground">
                        {user.email}
                    </span>
                )}
            </div>
        </>
    );
}
