import { Link, router, usePage } from '@inertiajs/react';
import { Bell, BellOff, Flag, Swords, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { RankBadge } from '@/components/tetris/rank-badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    refreshOnlineStatus,
    useOnlinePlayers,
} from '@/hooks/use-online-players';
import type { OnlinePlayer } from '@/hooks/use-online-players';
import { preference } from '@/routes/invites';
import { invite, show as showPlayer } from '@/routes/players';

/** Players you can invite first, then alphabetical. */
function byAvailability(a: OnlinePlayer, b: OnlinePlayer): number {
    const free = (p: OnlinePlayer) => (p.acceptsInvites && !p.inMatch ? 0 : 1);

    return free(a) - free(b) || a.name.localeCompare(b.name);
}

/**
 * Everyone online right now, with an Invite button for each, plus the player's own
 * "don't disturb" switch for incoming invites.
 */
export function OnlinePlayers({ canInvite }: { canInvite: boolean }) {
    const { auth } = usePage().props;
    const others = useOnlinePlayers()
        .filter((player) => player.id !== auth.user.id)
        .sort(byAvailability);
    const acceptsInvites = auth.user.accepts_invites;
    const [saving, setSaving] = useState(false);

    const toggleInvites = () =>
        router.patch(
            preference().url,
            { accepts_invites: !acceptsInvites },
            {
                preserveScroll: true,
                preserveState: true,
                onStart: () => setSaving(true),
                onFinish: () => setSaving(false),
                onSuccess: () => refreshOnlineStatus(),
            },
        );

    const sendInvite = (player: OnlinePlayer, mode: 'battle' | 'race') =>
        router.post(invite(player.id).url, { mode });

    return (
        <Card>
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                    <CardTitle className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-emerald-500" />
                        Online now
                        <span className="font-normal text-muted-foreground tabular-nums">
                            {others.length}
                        </span>
                    </CardTitle>
                    <CardDescription>
                        Invite a player to a friendly match. No rating or XP.
                    </CardDescription>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleInvites}
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
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                {!acceptsInvites && (
                    <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                        Invites are off. Other players can see you're online but
                        can't invite you.
                    </p>
                )}

                {others.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No one else is online right now. Use{' '}
                        <span className="font-medium">Challenge a friend</span>{' '}
                        to send a link instead.
                    </p>
                ) : (
                    <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto text-sm">
                        {others.map((player) => (
                            <li
                                key={player.id}
                                className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
                            >
                                <RankBadge progress={player.rank} compact />
                                <Link
                                    href={showPlayer(player.id)}
                                    className="min-w-0 flex-1 truncate font-medium hover:underline"
                                >
                                    {player.name}
                                </Link>
                                <span className="text-xs text-muted-foreground tabular-nums">
                                    {player.rating}
                                </span>
                                <PlayerAction
                                    player={player}
                                    canInvite={canInvite}
                                    onInvite={(mode) =>
                                        sendInvite(player, mode)
                                    }
                                />
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}

function PlayerAction({
    player,
    canInvite,
    onInvite,
}: {
    player: OnlinePlayer;
    canInvite: boolean;
    onInvite: (mode: 'battle' | 'race') => void;
}) {
    if (player.inMatch) {
        return <Status>In a match</Status>;
    }

    if (!player.acceptsInvites) {
        return (
            <Status>
                <BellOff className="size-3" /> Invites off
            </Status>
        );
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="w-24"
                    disabled={!canInvite}
                >
                    <UserPlus /> Invite
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onInvite('battle')}>
                    <Swords /> Battle
                    <span className="ml-auto text-xs text-muted-foreground">
                        3 KOs
                    </span>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onInvite('race')}>
                    <Flag /> Race
                    <span className="ml-auto text-xs text-muted-foreground">
                        First to 40 lines
                    </span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function Status({ children }: { children: React.ReactNode }) {
    return (
        <span className="flex w-24 items-center justify-end gap-1 text-xs text-muted-foreground">
            {children}
        </span>
    );
}
