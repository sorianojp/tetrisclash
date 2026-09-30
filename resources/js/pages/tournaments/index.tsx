import { Head, Link, router, usePage } from '@inertiajs/react';
import { Crown, Flag, Plus, Swords, Trophy, Users } from 'lucide-react';
import InputError from '@/components/input-error';
import { Badge } from '@/components/ui/badge';
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
import { dashboard } from '@/routes';
import {
    index as tournamentsIndex,
    join,
    show,
    store,
} from '@/routes/tournaments';

type Summary = {
    id: number;
    name: string;
    mode: 'battle' | 'race';
    players: number;
    winner: string | null;
    finishedAt: string | null;
};

type Props = {
    open: Summary[];
    running: Summary[];
    finished: Summary[];
    /** The tournament you're signed up for or still playing in. */
    currentId: number | null;
    size: number;
};

export default function Tournaments({
    open,
    running,
    finished,
    currentId,
    size,
}: Props) {
    const { errors } = usePage().props;

    const create = (mode: 'battle' | 'race') =>
        router.post(store().url, { mode });

    return (
        <>
            <Head title="Tournaments" />
            <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
                            <Trophy className="size-6 text-amber-500" />{' '}
                            Tournaments
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {size} players, single elimination. It starts the
                            moment the last seat fills, and your matches start
                            on their own. Friendly matches: no rating or energy.
                        </p>
                    </div>
                    {currentId === null ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button>
                                    <Plus /> New tournament
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                    onSelect={() => create('battle')}
                                >
                                    <Swords /> Battle cup
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onSelect={() => create('race')}
                                >
                                    <Flag /> Race cup
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <Button asChild>
                            <Link href={show(currentId)}>Your tournament</Link>
                        </Button>
                    )}
                </div>
                <InputError message={errors.tournament} />

                <Card>
                    <CardHeader>
                        <CardTitle>Taking sign-ups</CardTitle>
                        <CardDescription>
                            Join one and it starts when {size} players are in.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {open.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                None open right now. Start one!
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-2">
                                {open.map((tournament) => (
                                    <li
                                        key={tournament.id}
                                        className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                                    >
                                        <ModeBadge mode={tournament.mode} />
                                        <Link
                                            href={show(tournament.id)}
                                            className="flex-1 font-semibold hover:underline"
                                        >
                                            {tournament.name}
                                        </Link>
                                        <span className="flex items-center gap-1 text-sm text-muted-foreground tabular-nums">
                                            <Users className="size-4" />
                                            {tournament.players}/{size}
                                        </span>
                                        {tournament.id === currentId ? (
                                            <Badge variant="secondary">
                                                Joined
                                            </Badge>
                                        ) : (
                                            <Button
                                                size="sm"
                                                disabled={currentId !== null}
                                                onClick={() =>
                                                    router.post(
                                                        join(tournament.id).url,
                                                    )
                                                }
                                            >
                                                Join
                                            </Button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>In progress</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <TournamentList
                                tournaments={running}
                                empty="No tournaments running."
                            />
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent champions</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <TournamentList
                                tournaments={finished}
                                empty="No tournaments finished yet."
                            />
                        </CardContent>
                    </Card>
                </div>
            </div>
        </>
    );
}

Tournaments.layout = {
    breadcrumbs: [
        { title: 'Lobby', href: dashboard() },
        { title: 'Tournaments', href: tournamentsIndex() },
    ],
};

function ModeBadge({ mode }: { mode: 'battle' | 'race' }) {
    return (
        <Badge variant="outline" className="gap-1">
            {mode === 'race' ? (
                <Flag className="size-3" />
            ) : (
                <Swords className="size-3" />
            )}
            {mode === 'race' ? 'Race' : 'Battle'}
        </Badge>
    );
}

function TournamentList({
    tournaments,
    empty,
}: {
    tournaments: Summary[];
    empty: string;
}) {
    if (tournaments.length === 0) {
        return <p className="text-sm text-muted-foreground">{empty}</p>;
    }

    return (
        <ul className="flex flex-col gap-2 text-sm">
            {tournaments.map((tournament) => (
                <li key={tournament.id} className="flex items-center gap-2">
                    <Link
                        href={show(tournament.id)}
                        className="flex-1 truncate font-medium hover:underline"
                    >
                        {tournament.name}
                    </Link>
                    {tournament.winner && (
                        <span className="flex items-center gap-1 text-muted-foreground">
                            <Crown className="size-3.5 text-amber-500" />
                            {tournament.winner}
                        </span>
                    )}
                    {tournament.finishedAt && (
                        <span className="text-xs text-muted-foreground">
                            {tournament.finishedAt}
                        </span>
                    )}
                </li>
            ))}
        </ul>
    );
}
