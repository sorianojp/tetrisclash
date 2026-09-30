import { Head, Link, router } from '@inertiajs/react';
import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { AdminHeader, adminBreadcrumb } from '@/components/admin/admin-header';
import { UserBadges } from '@/components/admin/user-badges';
import { RankBadge } from '@/components/tetris/rank-badge';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { index as usersIndex, show as showUser } from '@/routes/admin/users';

type Filter = 'players' | 'banned' | 'admins' | 'bots';

type AdminUser = {
    id: number;
    name: string;
    email: string | null;
    rating: number;
    wins: number;
    losses: number;
    rank: RankProgress;
    verified: boolean;
    isAdmin: boolean;
    isBot: boolean;
    banned: boolean;
    lastSeen: string | null;
    joined: string | null;
};

type Props = {
    users: {
        data: AdminUser[];
        current_page: number;
        last_page: number;
        total: number;
        prev_page_url: string | null;
        next_page_url: string | null;
    };
    filters: { search: string; filter: Filter };
};

const FILTERS: { id: Filter; label: string }[] = [
    { id: 'players', label: 'Players' },
    { id: 'banned', label: 'Banned' },
    { id: 'admins', label: 'Admins' },
    { id: 'bots', label: 'Bots' },
];

const SEARCH_DELAY_MS = 300;

export default function AdminUsers({ users, filters }: Props) {
    const [search, setSearch] = useState(filters.search);

    const apply = (next: { search: string; filter: Filter }) =>
        router.get(
            usersIndex().url,
            {
                search: next.search || undefined,
                filter: next.filter === 'players' ? undefined : next.filter,
            },
            { preserveState: true, preserveScroll: true, replace: true },
        );

    useEffect(() => {
        if (search.trim() === filters.search) {
            return;
        }

        const timer = setTimeout(
            () => apply({ search: search.trim(), filter: filters.filter }),
            SEARCH_DELAY_MS,
        );

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    return (
        <>
            <Head title="Users · Admin" />
            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4">
                <AdminHeader
                    title="Users"
                    description={`${users.total.toLocaleString()} ${users.total === 1 ? 'account' : 'accounts'}, newest first.`}
                />

                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative min-w-48 flex-1">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Search by name or email"
                            className="pl-8"
                            value={search}
                            maxLength={100}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    </div>
                    <div className="flex gap-1 rounded-lg bg-muted p-1">
                        {FILTERS.map((option) => (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() =>
                                    apply({
                                        search: search.trim(),
                                        filter: option.id,
                                    })
                                }
                                className={cn(
                                    'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                                    filters.filter === option.id
                                        ? 'bg-background shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>

                <Card className="py-2">
                    <CardContent className="px-2">
                        {users.data.length === 0 ? (
                            <p className="py-6 text-center text-sm text-muted-foreground">
                                No accounts match.
                            </p>
                        ) : (
                            <ul className="flex flex-col text-sm">
                                {users.data.map((user) => (
                                    <li key={user.id}>
                                        <Link
                                            href={showUser(user.id)}
                                            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-2 hover:bg-muted/50"
                                        >
                                            <RankBadge
                                                progress={user.rank}
                                                compact
                                            />
                                            <div className="flex min-w-0 flex-1 flex-col">
                                                <span className="flex items-center gap-2 truncate font-medium">
                                                    {user.name}
                                                    <UserBadges user={user} />
                                                </span>
                                                {user.email && (
                                                    <span className="truncate text-xs text-muted-foreground">
                                                        {user.email}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">
                                                {user.rating}
                                            </span>
                                            <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">
                                                {user.wins}W {user.losses}L
                                            </span>
                                            <span className="hidden w-28 text-right text-xs text-muted-foreground sm:inline">
                                                {user.lastSeen
                                                    ? `seen ${user.lastSeen}`
                                                    : 'never seen'}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>

                {users.last_page > 1 && (
                    <nav
                        aria-label="Pages"
                        className="flex items-center justify-between gap-3 text-sm"
                    >
                        <PageLink href={users.prev_page_url}>Previous</PageLink>
                        <span className="text-muted-foreground tabular-nums">
                            Page {users.current_page} of {users.last_page}
                        </span>
                        <PageLink href={users.next_page_url}>Next</PageLink>
                    </nav>
                )}
            </div>
        </>
    );
}

AdminUsers.layout = {
    breadcrumbs: [adminBreadcrumb, { title: 'Users', href: usersIndex() }],
};

function PageLink({
    href,
    children,
}: {
    href: string | null;
    children: ReactNode;
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
