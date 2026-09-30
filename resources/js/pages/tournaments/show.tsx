import { Head, Link, router, usePage } from '@inertiajs/react';
import { Crown, Eye, Film, Swords, Users } from 'lucide-react';
import { useEffect } from 'react';
import InputError from '@/components/input-error';
import { RankBadge } from '@/components/tetris/rank-badge';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { dashboard } from '@/routes';
import {
    replay as duelReplay,
    show as showDuel,
    watch as watchDuel,
} from '@/routes/duels';
import { show as showPlayer } from '@/routes/players';
import { index as tournamentsIndex, join, leave } from '@/routes/tournaments';

type Player = {
    id: number;
    name: string;
    rank: RankProgress;
    seed: number | null;
    eliminated: boolean;
};

type Match = {
    id: number;
    players: [Player | null, Player | null];
    /** KOs (battle) or lines (race), once the duel exists. */
    score: [number, number] | null;
    winnerId: number | null;
    duelId: number | null;
    live: boolean;
};

type Props = {
    tournament: {
        id: number;
        name: string;
        mode: 'battle' | 'race';
        status: 'open' | 'running' | 'finished';
        winnerId: number | null;
        size: number;
    };
    players: Player[];
    rounds: { name: string; matches: Match[] }[];
    joined: boolean;
    currentId: number | null;
};

/** Refresh quickly while a match is live, slower while the bracket waits. */
const POLL_LIVE_MS = 4000;
const POLL_IDLE_MS = 10000;

export default function TournamentShow({
    tournament,
    players,
    rounds,
    joined,
    currentId,
}: Props) {
    const { auth, errors } = usePage().props;
    const champion = players.find((p) => p.id === tournament.winnerId);

    const anyLive = rounds.some((round) => round.matches.some((m) => m.live));

    // Keep the bracket (and sign-ups) fresh until it's decided; skipped while the tab is hidden.
    useEffect(() => {
        if (tournament.status === 'finished') {
            return;
        }

        const timer = setInterval(
            () => {
                if (!document.hidden) {
                    router.reload({
                        only: ['tournament', 'players', 'rounds', 'joined'],
                    });
                }
            },
            anyLive || tournament.status === 'open'
                ? POLL_LIVE_MS
                : POLL_IDLE_MS,
        );

        return () => clearInterval(timer);
    }, [tournament.status, anyLive]);

    return (
        <>
            <Head title={tournament.name} />
            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-black tracking-tight">
                            {tournament.name}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {tournament.mode === 'race'
                                ? 'Races: first to 40 lines'
                                : 'Battles: first to 3 KOs'}{' '}
                            · {tournament.size} players · single elimination
                        </p>
                    </div>
                    {tournament.status === 'open' &&
                        (joined ? (
                            <Button
                                variant="outline"
                                onClick={() =>
                                    router.delete(leave(tournament.id).url)
                                }
                            >
                                Leave
                            </Button>
                        ) : (
                            <Button
                                disabled={currentId !== null}
                                onClick={() =>
                                    router.post(join(tournament.id).url)
                                }
                            >
                                Join
                            </Button>
                        ))}
                </div>
                <InputError message={errors.tournament} />

                {champion && (
                    <div className="flex items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-amber-400 to-rose-500 px-4 py-4 text-white">
                        <Crown className="size-6" />
                        <span className="text-lg font-black">
                            {champion.name} is the champion!
                        </span>
                    </div>
                )}

                {tournament.status === 'open' ? (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Users className="size-4" /> Players (
                                {players.length}/{tournament.size})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="mb-3 text-sm text-muted-foreground">
                                It starts as soon as {tournament.size} players
                                are in. Keep the app open: your matches start on
                                their own and take you straight to them.
                            </p>
                            <ul className="grid gap-2 sm:grid-cols-2">
                                {Array.from(
                                    { length: tournament.size },
                                    (_, i) => players[i] ?? null,
                                ).map((player, i) => (
                                    <li
                                        key={player?.id ?? `empty-${i}`}
                                        className="flex h-10 items-center gap-2 rounded-lg border px-3 text-sm"
                                    >
                                        {player ? (
                                            <>
                                                <RankBadge
                                                    progress={player.rank}
                                                    compact
                                                />
                                                <PlayerLink player={player} />
                                            </>
                                        ) : (
                                            <span className="text-muted-foreground">
                                                Open seat
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        {rounds.map((round) => (
                            <section
                                key={round.name}
                                className="flex flex-col justify-around gap-3"
                            >
                                <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                                    {round.name}
                                </h2>
                                {round.matches.map((match) => (
                                    <MatchCard
                                        key={match.id}
                                        match={match}
                                        myId={auth.user.id}
                                    />
                                ))}
                            </section>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}

TournamentShow.layout = {
    breadcrumbs: [
        { title: 'Lobby', href: dashboard() },
        { title: 'Tournaments', href: tournamentsIndex() },
    ],
};

function PlayerLink({ player }: { player: Player }) {
    return (
        <Link
            href={showPlayer(player.id)}
            className="min-w-0 flex-1 truncate font-medium hover:underline"
        >
            {player.name}
        </Link>
    );
}

function MatchCard({ match, myId }: { match: Match; myId: number }) {
    const mine = match.players.some((p) => p?.id === myId);

    return (
        <div
            className={cn(
                'flex flex-col gap-1 rounded-lg border p-2 text-sm',
                match.live && 'border-rose-500/50',
                mine && 'ring-2 ring-primary/30',
            )}
        >
            {match.players.map((player, i) => (
                <div
                    key={player?.id ?? `tbd-${i}`}
                    className={cn(
                        'flex items-center gap-2 rounded px-1.5 py-1',
                        match.winnerId !== null &&
                            player?.id === match.winnerId &&
                            'bg-emerald-500/10 font-semibold',
                        match.winnerId !== null &&
                            player &&
                            player.id !== match.winnerId &&
                            'text-muted-foreground line-through',
                    )}
                >
                    {player ? (
                        <>
                            <RankBadge progress={player.rank} compact />
                            <PlayerLink player={player} />
                        </>
                    ) : (
                        <span className="flex-1 text-muted-foreground">
                            TBD
                        </span>
                    )}
                    {match.score && (
                        <span className="tabular-nums">{match.score[i]}</span>
                    )}
                </div>
            ))}
            {match.duelId !== null && (
                <div className="flex items-center justify-end gap-1 pt-1">
                    {match.live ? (
                        mine ? (
                            <Button size="sm" asChild>
                                <Link href={showDuel(match.duelId)}>
                                    <Swords /> Play
                                </Link>
                            </Button>
                        ) : (
                            <>
                                <Badge
                                    variant="outline"
                                    className="border-rose-500/50 text-rose-500"
                                >
                                    Live
                                </Badge>
                                <Button size="sm" variant="ghost" asChild>
                                    <Link href={watchDuel(match.duelId)}>
                                        <Eye /> Watch
                                    </Link>
                                </Button>
                            </>
                        )
                    ) : (
                        <Button size="sm" variant="ghost" asChild>
                            <Link href={duelReplay(match.duelId)}>
                                <Film /> Replay
                            </Link>
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
