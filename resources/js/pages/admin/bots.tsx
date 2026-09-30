import { Head, Link, router } from '@inertiajs/react';
import { Pause, Play } from 'lucide-react';
import { AdminHeader, adminBreadcrumb } from '@/components/admin/admin-header';
import { RankBadge } from '@/components/tetris/rank-badge';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { index as botsIndex, update } from '@/routes/admin/bots';
import { show as showUser } from '@/routes/admin/users';

type Bot = {
    id: number;
    key: string;
    name: string;
    rating: number;
    wins: number;
    losses: number;
    rank: RankProgress;
    online: boolean;
    busy: boolean;
    paused: boolean;
    scheduled: boolean;
    lastSeen: string | null;
};

type Props = {
    enabled: boolean;
    bots: Bot[];
};

export default function AdminBots({ enabled, bots }: Props) {
    const setPaused = (bot: Bot, paused: boolean) =>
        router.patch(update(bot.id).url, { paused }, { preserveScroll: true });

    return (
        <>
            <Head title="Bots · Admin" />
            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4">
                <AdminHeader
                    title="Bots"
                    description="Computer players that keep the game lively. A paused bot finishes the match it's in, then stays offline."
                />

                {!enabled && (
                    <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                        Bots are turned off for the whole game (
                        <code>BOTS_ENABLED=false</code>), so none of them play
                        right now.
                    </p>
                )}

                <Card>
                    <CardHeader>
                        <CardTitle>Roster · {bots.length}</CardTitle>
                        <CardDescription>
                            {bots.length === 0
                                ? 'No bot accounts yet. Run php artisan bots:install to create them.'
                                : `${bots.filter((bot) => bot.online).length} online, ${bots.filter((bot) => bot.paused).length} paused.`}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ul className="flex flex-col gap-1 text-sm">
                            {bots.map((bot) => (
                                <li
                                    key={bot.id}
                                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 hover:bg-muted/50"
                                >
                                    <RankBadge progress={bot.rank} compact />
                                    <Link
                                        href={showUser(bot.id)}
                                        className="min-w-0 flex-1 truncate font-medium hover:underline"
                                    >
                                        {bot.name}
                                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                                            {bot.key}
                                        </span>
                                    </Link>
                                    <span className="w-14 text-right text-xs text-muted-foreground tabular-nums">
                                        {bot.rating}
                                    </span>
                                    <span className="w-20 text-right text-xs text-muted-foreground tabular-nums">
                                        {bot.wins}W {bot.losses}L
                                    </span>
                                    <span className="flex w-28 justify-end">
                                        <BotStatus bot={bot} />
                                    </span>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="w-24"
                                        onClick={() =>
                                            setPaused(bot, !bot.paused)
                                        }
                                    >
                                        {bot.paused ? (
                                            <>
                                                <Play /> Resume
                                            </>
                                        ) : (
                                            <>
                                                <Pause /> Pause
                                            </>
                                        )}
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

AdminBots.layout = {
    breadcrumbs: [adminBreadcrumb, { title: 'Bots', href: botsIndex() }],
};

function BotStatus({ bot }: { bot: Bot }) {
    if (bot.busy) {
        return <Badge>In a match</Badge>;
    }

    if (bot.paused) {
        return <Badge variant="secondary">Paused</Badge>;
    }

    if (bot.online) {
        return (
            <Badge variant="outline" className="gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Online
            </Badge>
        );
    }

    return (
        <span className="text-xs text-muted-foreground">
            {bot.scheduled ? 'due online' : 'offline'}
        </span>
    );
}
