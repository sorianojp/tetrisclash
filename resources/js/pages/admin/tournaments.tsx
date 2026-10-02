import { Head, Link, router, usePage } from '@inertiajs/react';
import { Eye, Flag, Gavel, Swords, UserMinus, XCircle } from 'lucide-react';
import { AdminHeader, adminBreadcrumb } from '@/components/admin/admin-header';
import { ConfirmAction } from '@/components/admin/confirm-action';
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
import {
    destroy as cancelTournament,
    index as tournamentsIndex,
} from '@/routes/admin/tournaments';
import { advance } from '@/routes/admin/tournaments/matches';
import { destroy as removePlayer } from '@/routes/admin/tournaments/players';
import { watch as watchDuel } from '@/routes/duels';
import { show as showTournament } from '@/routes/tournaments';

type Player = { id: number; name: string };

type AdminTournament = {
    id: number;
    name: string;
    mode: 'battle' | 'race';
    status: 'open' | 'running';
    creator: string | null;
    createdAt: string | null;
    players: (Player & { eliminated: boolean })[];
    pendingMatches: {
        id: number;
        round: string;
        players: [Player | null, Player | null];
        duelId: number | null;
        live: boolean;
    }[];
};

type Props = {
    tournaments: AdminTournament[];
    size: number;
};

export default function AdminTournaments({ tournaments, size }: Props) {
    const { errors } = usePage().props;

    return (
        <>
            <Head title="Tournaments · Admin" />
            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4">
                <AdminHeader
                    title="Tournaments"
                    description="Open and running tournaments. Cancel one, remove a player before it starts, or decide a stuck match."
                />
                <InputError message={errors.tournament} />

                {tournaments.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                        No open or running tournaments.
                    </p>
                ) : (
                    tournaments.map((tournament) => (
                        <TournamentCard
                            key={tournament.id}
                            tournament={tournament}
                            size={size}
                        />
                    ))
                )}
            </div>
        </>
    );
}

AdminTournaments.layout = {
    breadcrumbs: [
        adminBreadcrumb,
        { title: 'Tournaments', href: tournamentsIndex() },
    ],
};

function TournamentCard({
    tournament,
    size,
}: {
    tournament: AdminTournament;
    size: number;
}) {
    const decide = (matchId: number, winnerId: number) =>
        router.post(
            advance({ tournament: tournament.id, match: matchId }).url,
            { winner_id: winnerId },
            { preserveScroll: true },
        );

    return (
        <Card>
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                    <CardTitle className="flex flex-wrap items-center gap-2">
                        <Link
                            href={showTournament(tournament.id)}
                            className="hover:underline"
                        >
                            {tournament.name}
                        </Link>
                        <Badge variant="outline" className="gap-1">
                            {tournament.mode === 'race' ? (
                                <Flag className="size-3" />
                            ) : (
                                <Swords className="size-3" />
                            )}
                            {tournament.mode === 'race' ? 'Race' : 'Battle'}
                        </Badge>
                        <Badge
                            variant={
                                tournament.status === 'running'
                                    ? 'default'
                                    : 'secondary'
                            }
                        >
                            {tournament.status === 'running'
                                ? 'Running'
                                : `Open · ${tournament.players.length}/${size}`}
                        </Badge>
                    </CardTitle>
                    <CardDescription>
                        {tournament.creator
                            ? `Started by ${tournament.creator}`
                            : 'Creator deleted'}{' '}
                        {tournament.createdAt}
                    </CardDescription>
                </div>
                <ConfirmAction
                    action={cancelTournament(tournament.id)}
                    title={`Cancel ${tournament.name}?`}
                    description="The tournament is deleted. Any bracket duel still being played is ended with no winner."
                    confirmLabel="Cancel tournament"
                >
                    <XCircle /> Cancel
                </ConfirmAction>
            </CardHeader>
            <CardContent>
                {tournament.status === 'open' ? (
                    <ul className="flex flex-col gap-1 text-sm">
                        {tournament.players.map((player) => (
                            <li
                                key={player.id}
                                className="flex items-center gap-3 rounded-md px-2 py-1 hover:bg-muted/50"
                            >
                                <span className="flex-1 font-medium">
                                    {player.name}
                                </span>
                                <ConfirmAction
                                    action={removePlayer({
                                        tournament: tournament.id,
                                        user: player.id,
                                    })}
                                    title={`Remove ${player.name}?`}
                                    description="They're taken out of the sign-ups. If nobody is left, the tournament is removed."
                                    confirmLabel="Remove"
                                    variant="ghost"
                                >
                                    <UserMinus /> Remove
                                </ConfirmAction>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <ul className="flex flex-col gap-2 text-sm">
                        {tournament.pendingMatches.map((match) => {
                            const [one, two] = match.players;
                            const decidable = one !== null && two !== null;

                            return (
                                <li
                                    key={match.id}
                                    className="flex flex-wrap items-center gap-3 rounded-lg border p-2"
                                >
                                    <span className="w-24 text-xs text-muted-foreground">
                                        {match.round}
                                    </span>
                                    <span className="flex-1">
                                        <span className="font-medium">
                                            {one?.name ?? 'TBD'}
                                        </span>
                                        <span className="text-muted-foreground">
                                            {' '}
                                            vs{' '}
                                        </span>
                                        <span className="font-medium">
                                            {two?.name ?? 'TBD'}
                                        </span>
                                    </span>
                                    {match.live && match.duelId !== null && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            asChild
                                        >
                                            <Link
                                                href={watchDuel(match.duelId)}
                                            >
                                                <Eye /> Live
                                            </Link>
                                        </Button>
                                    )}
                                    {decidable && (
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                >
                                                    <Gavel /> Decide
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                {[one, two].map((player) => (
                                                    <DropdownMenuItem
                                                        key={player.id}
                                                        onSelect={() =>
                                                            decide(
                                                                match.id,
                                                                player.id,
                                                            )
                                                        }
                                                    >
                                                        {player.name} wins
                                                        {match.live &&
                                                            ' (other forfeits)'}
                                                    </DropdownMenuItem>
                                                ))}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}
