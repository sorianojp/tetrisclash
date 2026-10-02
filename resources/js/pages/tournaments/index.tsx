import { Head, Link, router, usePage } from '@inertiajs/react';
import { Crown, Flag, LogIn, Plus, Swords, Trophy, Users } from 'lucide-react';
import InputError from '@/components/input-error';
import { PageHeader } from '@/components/tetris/page-header';
import { PlayerEmblem } from '@/components/tetris/player-emblem';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
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

    const createButton =
        currentId === null ? (
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button className="font-bold">
                        <Plus /> New tournament
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => create('battle')}>
                        <Swords /> Battle cup
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => create('race')}>
                        <Flag /> Race cup
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        ) : (
            <Button className="font-bold" asChild>
                <Link href={show(currentId)}>
                    <Trophy /> Your tournament
                </Link>
            </Button>
        );

    return (
        <>
            <Head title="Tournaments" />
            <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 sm:p-6">
                <PageHeader
                    icon={Trophy}
                    title="Tournaments"
                    description={`${size} players, single elimination. It starts the moment the last seat fills, and your matches start on their own. Friendly: no rating or energy.`}
                    actions={createButton}
                />
                <InputError message={errors.tournament} />

                <section className="flex flex-col gap-3">
                    <h2 className="flex items-center gap-2 text-sm font-bold tracking-wider text-muted-foreground uppercase">
                        <span className="relative flex size-2">
                            <span className="absolute inline-flex size-full rounded-full bg-emerald-400 opacity-60 motion-safe:animate-ping" />
                            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                        </span>
                        Taking sign-ups
                    </h2>
                    {open.length === 0 ? (
                        <Card className="items-center gap-3 px-6 py-10 text-center">
                            <span className="flex size-14 items-center justify-center rounded-2xl bg-amber-300 text-amber-950 shadow-lg shadow-amber-500/25">
                                <Trophy className="size-7" />
                            </span>
                            <p className="font-semibold">
                                No tournaments open right now
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Start one and it fills as players join.
                            </p>
                            {currentId === null && (
                                <div className="mt-1">{createButton}</div>
                            )}
                        </Card>
                    ) : (
                        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {open.map((tournament) => (
                                <li key={tournament.id}>
                                    <Card className="h-full gap-4 px-5">
                                        <div className="flex items-center gap-3">
                                            <span
                                                className={cn(
                                                    'flex size-12 shrink-0 items-center justify-center rounded-xl shadow-lg',
                                                    tournament.mode === 'race'
                                                        ? 'bg-cyan-400 text-cyan-950 shadow-cyan-500/25'
                                                        : 'bg-amber-300 text-amber-950 shadow-amber-500/25',
                                                )}
                                            >
                                                <Trophy className="size-6" />
                                            </span>
                                            <div className="min-w-0">
                                                <Link
                                                    href={show(tournament.id)}
                                                    className="block truncate text-lg font-black tracking-tight hover:underline"
                                                >
                                                    {tournament.name}
                                                </Link>
                                                <ModeBadge
                                                    mode={tournament.mode}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                                                <span className="flex items-center gap-1">
                                                    <Users className="size-3.5" />
                                                    Seats
                                                </span>
                                                <span className="tabular-nums">
                                                    {tournament.players}/{size}
                                                </span>
                                            </div>
                                            <SeatMeter
                                                filled={tournament.players}
                                                size={size}
                                            />
                                        </div>
                                        {tournament.id === currentId ? (
                                            <Button variant="secondary" asChild>
                                                <Link
                                                    href={show(tournament.id)}
                                                >
                                                    <Trophy /> Joined · View
                                                    bracket
                                                </Link>
                                            </Button>
                                        ) : (
                                            <Button
                                                className="font-bold"
                                                disabled={currentId !== null}
                                                onClick={() =>
                                                    router.post(
                                                        join(tournament.id).url,
                                                    )
                                                }
                                            >
                                                <LogIn /> Join tournament
                                            </Button>
                                        )}
                                    </Card>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                <Swords className="size-4 text-violet-500" />
                                In progress
                            </CardTitle>
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
                            <CardTitle>
                                <Crown className="size-4 text-amber-500" />
                                Recent champions
                            </CardTitle>
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

/** One pip per seat; filled ones glow. */
function SeatMeter({ filled, size }: { filled: number; size: number }) {
    return (
        <div
            className="flex gap-1"
            role="img"
            aria-label={`${filled} of ${size} seats taken`}
        >
            {Array.from({ length: size }, (_, i) => (
                <span
                    key={i}
                    className={cn(
                        'h-2.5 flex-1 rounded-sm',
                        i < filled
                            ? 'bg-emerald-300 shadow-[0_0_8px_rgb(16_185_129/0.5)]'
                            : 'bg-muted',
                    )}
                />
            ))}
        </div>
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
                <li
                    key={tournament.id}
                    className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-muted/40"
                >
                    <Trophy className="size-4 shrink-0 text-muted-foreground" />
                    <Link
                        href={show(tournament.id)}
                        className="flex-1 truncate font-semibold hover:underline"
                    >
                        {tournament.name}
                    </Link>
                    {tournament.winner && (
                        <span className="flex items-center gap-1.5 font-semibold">
                            <Crown className="size-3.5 text-amber-500" />
                            <PlayerEmblem name={tournament.winner} size="xs" />
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
