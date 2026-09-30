import { Head, Link, router } from '@inertiajs/react';
import { Eye, Film, OctagonX } from 'lucide-react';
import { useEffect } from 'react';
import { AdminHeader, adminBreadcrumb } from '@/components/admin/admin-header';
import { ConfirmAction } from '@/components/admin/confirm-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { cancel, index as duelsIndex } from '@/routes/admin/duels';
import { show as showUser } from '@/routes/admin/users';
import { replay as duelReplay, watch as watchDuel } from '@/routes/duels';

type AdminDuel = {
    id: number;
    mode: 'battle' | 'race';
    ranked: boolean;
    players: [{ id: number; name: string }, { id: number; name: string }];
    score: [number, number];
    winnerId: number | null;
    reason: string | null;
    inTournament: boolean;
    hasReplay: boolean;
    startedAt: string;
    finishedAt: string | null;
};

type Props = {
    live: AdminDuel[];
    recent: AdminDuel[];
};

const REFRESH_MS = 15_000;

export default function AdminDuels({ live, recent }: Props) {
    useEffect(() => {
        const timer = setInterval(
            () => router.reload({ only: ['live', 'recent'] }),
            REFRESH_MS,
        );

        return () => clearInterval(timer);
    }, []);

    return (
        <>
            <Head title="Duels · Admin" />
            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4">
                <AdminHeader
                    title="Duels"
                    description="Duels still being played, and the latest finished ones."
                />

                <Card>
                    <CardHeader>
                        <CardTitle>Live · {live.length}</CardTitle>
                        <CardDescription>
                            Ending a duel settles it with no winner and no
                            rating change. In a tournament, the higher seed goes
                            through.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {live.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Nothing live right now.
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-2 text-sm">
                                {live.map((duel) => (
                                    <DuelRow key={duel.id} duel={duel}>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            asChild
                                        >
                                            <Link href={watchDuel(duel.id)}>
                                                <Eye /> Watch
                                            </Link>
                                        </Button>
                                        <ConfirmAction
                                            action={cancel(duel.id)}
                                            title="End this duel?"
                                            description="It's settled with no winner. Rating, records and XP don't change."
                                            confirmLabel="End duel"
                                        >
                                            <OctagonX /> End
                                        </ConfirmAction>
                                    </DuelRow>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Recently finished</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {recent.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                No finished duels yet.
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-2 text-sm">
                                {recent.map((duel) => (
                                    <DuelRow key={duel.id} duel={duel}>
                                        <span className="text-xs text-muted-foreground">
                                            {duel.reason} · {duel.finishedAt}
                                        </span>
                                        {duel.hasReplay && (
                                            <Link
                                                href={duelReplay(duel.id)}
                                                className="text-muted-foreground hover:text-foreground"
                                                title="Watch replay"
                                            >
                                                <Film className="size-4" />
                                            </Link>
                                        )}
                                    </DuelRow>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

AdminDuels.layout = {
    breadcrumbs: [adminBreadcrumb, { title: 'Duels', href: duelsIndex() }],
};

function DuelRow({
    duel,
    children,
}: {
    duel: AdminDuel;
    children: React.ReactNode;
}) {
    const [one, two] = duel.players;
    const name = (player: { id: number; name: string }) => (
        <Link
            href={showUser(player.id)}
            className={cn(
                'hover:underline',
                duel.winnerId === player.id ? 'font-bold' : 'font-medium',
            )}
        >
            {player.name}
        </Link>
    );

    return (
        <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-2">
            <span className="min-w-0 flex-1">
                {name(one)}{' '}
                <span className="text-muted-foreground tabular-nums">
                    {duel.score[0]}–{duel.score[1]}
                </span>{' '}
                {name(two)}
            </span>
            <Badge variant="outline">
                {duel.mode === 'race' ? 'Race' : 'Battle'}
            </Badge>
            {duel.inTournament ? (
                <Badge variant="secondary">Tournament</Badge>
            ) : (
                !duel.ranked && <Badge variant="secondary">Friendly</Badge>
            )}
            {children}
        </li>
    );
}
