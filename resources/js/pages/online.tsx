import { Head, Link, router } from '@inertiajs/react';
import { BellOff, Eye, Flag, Search, Swords, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { InviteToggle } from '@/components/tetris/invite-toggle';
import { RankBadge } from '@/components/tetris/rank-badge';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { dashboard } from '@/routes';
import { watch as watchDuel } from '@/routes/duels';
import { index as onlineIndex } from '@/routes/online';
import { invite, show as showPlayer } from '@/routes/players';
import { useUser } from '@/hooks/use-user';

type OnlinePlayer = {
    id: number;
    name: string;
    rating: number;
    rank: RankProgress;
    acceptsInvites: boolean;
    inMatch: boolean;
    /** Their live duel, when they're in one. */
    duelId: number | null;
};

type Props = {
    players: {
        data: OnlinePlayer[];
        current_page: number;
        last_page: number;
        prev_page_url: string | null;
        next_page_url: string | null;
    };
    filters: { search: string; available: boolean };
    /** Everyone online, including you. */
    onlineCount: number;
    canInvite: boolean;
};

/** Keep the list current while the page is open. */
const REFRESH_MS = 30_000;

const SEARCH_DELAY_MS = 300;

export default function Online({
    players,
    filters,
    onlineCount,
    canInvite,
}: Props) {
    const user = useUser();
    const [search, setSearch] = useState(filters.search);

    const applyFilters = (next: { search: string; available: boolean }) =>
        router.get(
            onlineIndex().url,
            {
                search: next.search || undefined,
                available: next.available ? 1 : undefined,
            },
            { preserveState: true, preserveScroll: true, replace: true },
        );

    useEffect(() => {
        if (search.trim() === filters.search) {
            return;
        }

        const timer = setTimeout(
            () =>
                applyFilters({
                    search: search.trim(),
                    available: filters.available,
                }),
            SEARCH_DELAY_MS,
        );

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    useEffect(() => {
        const timer = setInterval(
            () => router.reload({ only: ['players', 'onlineCount'] }),
            REFRESH_MS,
        );

        return () => clearInterval(timer);
    }, []);

    const sendInvite = (player: OnlinePlayer, mode: 'battle' | 'race') =>
        router.post(invite(player.id).url, { mode });

    const others = Math.max(0, onlineCount - 1);

    return (
        <>
            <Head title="Online players" />
            <div className="flex h-full flex-1 flex-col items-center p-4">
                <Card className="w-full max-w-3xl">
                    <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
                        <div className="flex flex-col gap-1.5">
                            <CardTitle className="flex items-center gap-2">
                                <span className="size-2 rounded-full bg-emerald-500" />
                                Online players
                                <span className="font-normal text-muted-foreground tabular-nums">
                                    {others.toLocaleString()}
                                </span>
                            </CardTitle>
                            <CardDescription>
                                Invite a player to a friendly match. No rating
                                or XP. Closest rating to yours first.
                            </CardDescription>
                        </div>
                        <InviteToggle />
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                        {!user.accepts_invites && (
                            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                                Invites are off. Other players can see you're
                                online but can't invite you.
                            </p>
                        )}

                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative min-w-48 flex-1">
                                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    id="online-search"
                                    type="search"
                                    placeholder="Search by name"
                                    className="pl-8"
                                    value={search}
                                    maxLength={50}
                                    onChange={(event) =>
                                        setSearch(event.target.value)
                                    }
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="online-available"
                                    checked={filters.available}
                                    onCheckedChange={(checked) =>
                                        applyFilters({
                                            search: search.trim(),
                                            available: checked === true,
                                        })
                                    }
                                />
                                <Label htmlFor="online-available">
                                    Available to invite
                                </Label>
                            </div>
                        </div>

                        {players.data.length === 0 ? (
                            <p className="py-6 text-center text-sm text-muted-foreground">
                                {filters.search || filters.available ? (
                                    'No online players match your search.'
                                ) : (
                                    <>
                                        No one else is online right now. Use{' '}
                                        <Link
                                            href={dashboard()}
                                            className="font-medium underline"
                                        >
                                            Challenge a friend
                                        </Link>{' '}
                                        in the lobby to send a link instead.
                                    </>
                                )}
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-1 text-sm">
                                {players.data.map((player) => (
                                    <li
                                        key={player.id}
                                        className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
                                    >
                                        <RankBadge
                                            progress={player.rank}
                                            compact
                                        />
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

                        {players.last_page > 1 && (
                            <nav
                                aria-label="Pages"
                                className="flex items-center justify-between gap-3 text-sm"
                            >
                                <PageLink href={players.prev_page_url}>
                                    Previous
                                </PageLink>
                                <span className="text-muted-foreground tabular-nums">
                                    Page {players.current_page} of{' '}
                                    {players.last_page}
                                </span>
                                <PageLink href={players.next_page_url}>
                                    Next
                                </PageLink>
                            </nav>
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

Online.layout = {
    breadcrumbs: [{ title: 'Online players', href: onlineIndex() }],
};

function PageLink({
    href,
    children,
}: {
    href: string | null;
    children: React.ReactNode;
}) {
    if (href === null) {
        return (
            <Button variant="outline" size="sm" disabled>
                {children}
            </Button>
        );
    }

    return (
        <Button variant="outline" size="sm" asChild>
            <Link href={href} preserveState>
                {children}
            </Link>
        </Button>
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
    if (player.duelId !== null) {
        return (
            <Button variant="outline" size="sm" className="w-24" asChild>
                <Link href={watchDuel(player.duelId)}>
                    <Eye /> Watch
                </Link>
            </Button>
        );
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
                    title={
                        canInvite
                            ? undefined
                            : 'Finish your current match first'
                    }
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
