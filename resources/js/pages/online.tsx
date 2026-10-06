import { Head, Link, router } from '@inertiajs/react';
import {
    BellOff,
    ChevronLeft,
    ChevronRight,
    Eye,
    Flag,
    Search,
    Swords,
    UserPlus,
    Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { InviteToggle } from '@/components/tetris/invite-toggle';
import { PageHeader } from '@/components/tetris/page-header';
import { RankEmblem, rankTier } from '@/components/tetris/rank-emblem';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
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
            <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 sm:p-6">
                <PageHeader
                    icon={Users}
                    title="Online players"
                    description={
                        <>
                            <span className="font-semibold text-emerald-600 tabular-nums dark:text-emerald-400">
                                {others.toLocaleString()} online
                            </span>{' '}
                            · Invite anyone to a friendly match: no rating or
                            XP. Closest rating to yours first.
                        </>
                    }
                    actions={<InviteToggle />}
                />

                {!user.accepts_invites && (
                    <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-200">
                        Your invites are off. Other players can see you're
                        online but can't invite you.
                    </p>
                )}

                <Card className="flex-row flex-wrap items-center gap-3 px-4 py-3">
                    <div className="relative min-w-48 flex-1">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            id="online-search"
                            type="search"
                            placeholder="Search players by name"
                            className="h-10 rounded-xl pl-9"
                            value={search}
                            maxLength={50}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border px-3 py-2">
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
                </Card>

                {players.data.length === 0 ? (
                    <Card className="items-center gap-3 px-6 py-12 text-center">
                        <span className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                            <Users className="size-7" />
                        </span>
                        {filters.search || filters.available ? (
                            <p className="text-sm text-muted-foreground">
                                No online players match your search.
                            </p>
                        ) : (
                            <>
                                <p className="font-semibold">
                                    No one else is online right now
                                </p>
                                <p className="max-w-sm text-sm text-muted-foreground">
                                    Send a friend a challenge link instead. They
                                    can play straight from it.
                                </p>
                                <Button className="mt-2" asChild>
                                    <Link href={dashboard()}>
                                        <UserPlus /> Challenge a friend
                                    </Link>
                                </Button>
                            </>
                        )}
                    </Card>
                ) : (
                    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {players.data.map((player) => (
                            <li key={player.id}>
                                <Card className="h-full flex-row items-center gap-3 px-4 py-4">
                                    <span className="relative">
                                        <RankEmblem
                                            rank={player.rank.rank}
                                            title={player.rank.title}
                                            size="lg"
                                        />
                                        <span
                                            title={
                                                player.inMatch
                                                    ? 'In a match'
                                                    : 'Online'
                                            }
                                            className={cn(
                                                'absolute -top-0.5 -right-0.5 size-4 rounded-full border-[3px] border-card',
                                                player.inMatch
                                                    ? 'bg-rose-500'
                                                    : 'bg-emerald-500',
                                            )}
                                        />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <Link
                                            href={showPlayer(player.id)}
                                            className="block truncate text-base font-black hover:underline"
                                        >
                                            {player.name}
                                        </Link>
                                        <p className="truncate text-sm font-bold">
                                            {player.rank.title}{' '}
                                            {rankTier(
                                                player.rank.rank,
                                                player.rank.title,
                                            )}
                                        </p>
                                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                                            <span>Rank {player.rank.rank}</span>
                                            <span>·</span>
                                            <span className="font-semibold">
                                                {player.rating} rating
                                            </span>
                                            {player.inMatch && (
                                                <span className="font-semibold text-rose-500">
                                                    · In a match
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    <PlayerAction
                                        player={player}
                                        canInvite={canInvite}
                                        onInvite={(mode) =>
                                            sendInvite(player, mode)
                                        }
                                    />
                                </Card>
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
                            <ChevronLeft /> Previous
                        </PageLink>
                        <span className="text-muted-foreground tabular-nums">
                            Page {players.current_page} of {players.last_page}
                        </span>
                        <PageLink href={players.next_page_url}>
                            Next <ChevronRight />
                        </PageLink>
                    </nav>
                )}
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
            <Button variant="outline" size="sm" asChild>
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
                    size="sm"
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
        <span className="flex items-center justify-end gap-1 text-xs whitespace-nowrap text-muted-foreground">
            {children}
        </span>
    );
}
