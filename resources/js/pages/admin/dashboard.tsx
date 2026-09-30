import { Head, Link } from '@inertiajs/react';
import { AdminHeader, adminBreadcrumb } from '@/components/admin/admin-header';
import { Badge } from '@/components/ui/badge';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { index as duelsIndex } from '@/routes/admin/duels';
import { index as tournamentsIndex } from '@/routes/admin/tournaments';
import { index as usersIndex, show as showUser } from '@/routes/admin/users';

type Props = {
    stats: {
        players: number;
        newToday: number;
        newThisWeek: number;
        onlinePlayers: number;
        onlineBots: number;
        banned: number;
        duelsToday: number;
        liveDuels: number;
        openTournaments: number;
        runningTournaments: number;
        practiceRunsToday: number;
    };
    recentSignups: {
        id: number;
        name: string;
        email: string;
        verified: boolean;
        banned: boolean;
        joined: string | null;
    }[];
};

export default function AdminDashboard({ stats, recentSignups }: Props) {
    const tiles = [
        {
            label: 'Players',
            value: stats.players,
            detail: `+${stats.newToday} today · +${stats.newThisWeek} this week`,
            href: usersIndex(),
        },
        {
            label: 'Online now',
            value: stats.onlinePlayers,
            detail: `plus ${stats.onlineBots} bots`,
        },
        {
            label: 'Duels today',
            value: stats.duelsToday,
            detail: `${stats.liveDuels} live right now`,
            href: duelsIndex(),
        },
        {
            label: 'Tournaments',
            value: stats.openTournaments + stats.runningTournaments,
            detail: `${stats.openTournaments} open · ${stats.runningTournaments} running`,
            href: tournamentsIndex(),
        },
        {
            label: 'Practice runs today',
            value: stats.practiceRunsToday,
        },
        {
            label: 'Banned',
            value: stats.banned,
            href: usersIndex({ query: { filter: 'banned' } }),
        },
    ];

    return (
        <>
            <Head title="Admin" />
            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4">
                <AdminHeader
                    title="Admin"
                    description="The game at a glance."
                />

                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    {tiles.map((tile) => {
                        const body = (
                            <Card className="h-full gap-1 py-4">
                                <CardContent className="flex flex-col gap-1 px-4">
                                    <span className="text-xs font-medium text-muted-foreground">
                                        {tile.label}
                                    </span>
                                    <span className="text-3xl font-black tabular-nums">
                                        {tile.value.toLocaleString()}
                                    </span>
                                    {tile.detail && (
                                        <span className="text-xs text-muted-foreground">
                                            {tile.detail}
                                        </span>
                                    )}
                                </CardContent>
                            </Card>
                        );

                        return tile.href ? (
                            <Link
                                key={tile.label}
                                href={tile.href}
                                className="rounded-xl transition-opacity hover:opacity-80"
                            >
                                {body}
                            </Link>
                        ) : (
                            <div key={tile.label}>{body}</div>
                        );
                    })}
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Latest sign-ups</CardTitle>
                        <CardDescription>
                            Newest players (bots not included).
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {recentSignups.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No players yet.
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-1 text-sm">
                                {recentSignups.map((user) => (
                                    <li
                                        key={user.id}
                                        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 hover:bg-muted/50"
                                    >
                                        <Link
                                            href={showUser(user.id)}
                                            className="font-medium hover:underline"
                                        >
                                            {user.name}
                                        </Link>
                                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                                            {user.email}
                                        </span>
                                        {!user.verified && (
                                            <Badge variant="outline">
                                                Unverified
                                            </Badge>
                                        )}
                                        {user.banned && (
                                            <Badge variant="destructive">
                                                Banned
                                            </Badge>
                                        )}
                                        <span className="text-xs text-muted-foreground">
                                            {user.joined}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

AdminDashboard.layout = {
    breadcrumbs: [adminBreadcrumb],
};
