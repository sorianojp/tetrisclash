import { Head, Link, router, usePage } from '@inertiajs/react';
import { Crown, Eye, Film, Swords, Trophy, Users } from 'lucide-react';
import { useEffect } from 'react';
import InputError from '@/components/input-error';
import { PageHeader } from '@/components/tetris/page-header';
import { PlayerEmblem } from '@/components/tetris/player-emblem';
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
import { useUser } from '@/hooks/use-user';

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
    const { errors } = usePage().props;
    const user = useUser();
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

    const action =
        tournament.status === 'open' &&
        (joined ? (
            <Button
                variant="outline"
                onClick={() => router.delete(leave(tournament.id).url)}
            >
                Leave
            </Button>
        ) : (
            <Button
                className="font-bold"
                disabled={currentId !== null}
                onClick={() => router.post(join(tournament.id).url)}
            >
                Join tournament
            </Button>
        ));

    return (
        <>
            <Head title={tournament.name} />
            <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 sm:p-6">
                <PageHeader
                    icon={Trophy}
                    title={tournament.name}
                    description={
                        <>
                            {tournament.mode === 'race'
                                ? 'Races: first to 40 lines'
                                : 'Battles: first to 3 KOs'}{' '}
                            · {tournament.size} players · single elimination ·{' '}
                            <span className="font-semibold text-foreground">
                                {
                                    {
                                        open: 'Taking sign-ups',
                                        running: 'In progress',
                                        finished: 'Finished',
                                    }[tournament.status]
                                }
                            </span>
                        </>
                    }
                    actions={action || undefined}
                />
                <InputError message={errors.tournament} />

                {champion && (
                    <Card className="gap-0 overflow-hidden py-0">
                        <div className="flex flex-col items-center gap-3 bg-gradient-to-br from-amber-300 via-orange-400 to-rose-500 px-6 py-8 text-center text-amber-950 sm:flex-row sm:text-left">
                            <PlayerEmblem
                                name={champion.name}
                                id={champion.id}
                                size="lg"
                                className="ring-4 ring-white/40"
                            />
                            <div>
                                <p className="flex items-center justify-center gap-1.5 text-xs font-black tracking-[0.25em] uppercase sm:justify-start">
                                    <Crown className="size-4" /> Champion
                                </p>
                                <p className="text-3xl font-black tracking-tight">
                                    {champion.name}
                                </p>
                            </div>
                        </div>
                    </Card>
                )}

                {tournament.status === 'open' ? (
                    <Card accent="emerald">
                        <CardHeader>
                            <CardTitle className="justify-between">
                                <span className="flex items-center gap-2">
                                    <Users className="size-4 text-emerald-500" />
                                    Players
                                </span>
                                <span className="text-sm font-semibold text-muted-foreground tabular-nums">
                                    {players.length}/{tournament.size}
                                </span>
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                                It starts as soon as {tournament.size} players
                                are in. Keep the app open: your matches start on
                                their own and take you straight to them.
                            </p>
                        </CardHeader>
                        <CardContent>
                            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                {Array.from(
                                    { length: tournament.size },
                                    (_, i) => players[i] ?? null,
                                ).map((player, i) => (
                                    <li
                                        key={player?.id ?? `empty-${i}`}
                                        className={cn(
                                            'flex h-14 items-center gap-2.5 rounded-xl px-3 text-sm',
                                            player
                                                ? 'border bg-muted/40 dark:bg-white/[0.03]'
                                                : 'border-2 border-dashed text-muted-foreground',
                                            player?.id === user.id &&
                                                'border-violet-500/40 bg-violet-500/10',
                                        )}
                                    >
                                        {player ? (
                                            <>
                                                <PlayerEmblem
                                                    name={player.name}
                                                    id={player.id}
                                                    size="sm"
                                                />
                                                <PlayerLink player={player} />
                                                <RankBadge
                                                    progress={player.rank}
                                                    compact
                                                />
                                            </>
                                        ) : (
                                            <>
                                                <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-xs font-black">
                                                    {i + 1}
                                                </span>
                                                Open seat
                                            </>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                        {rounds.map((round) => (
                            <section
                                key={round.name}
                                className="flex flex-col justify-around gap-4"
                            >
                                <h2 className="flex items-center gap-2 text-xs font-black tracking-[0.2em] text-muted-foreground uppercase">
                                    <span className="h-px flex-1 bg-border" />
                                    {round.name}
                                    <span className="h-px flex-1 bg-border" />
                                </h2>
                                {round.matches.map((match) => (
                                    <MatchCard
                                        key={match.id}
                                        match={match}
                                        myId={user.id}
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
                'relative flex flex-col gap-1 overflow-hidden rounded-2xl border bg-card p-2.5 text-sm shadow-sm dark:bg-gradient-to-b dark:from-white/[0.04] dark:to-transparent',
                match.live && 'border-rose-500/50 shadow-rose-500/10',
                mine && 'ring-2 ring-violet-500/40',
            )}
        >
            {match.live && (
                <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-rose-400 via-pink-500 to-fuchsia-500" />
            )}
            {match.players.map((player, i) => (
                <div
                    key={player?.id ?? `tbd-${i}`}
                    className={cn(
                        'flex items-center gap-2 rounded-lg px-2 py-1.5',
                        match.winnerId !== null &&
                            player?.id === match.winnerId &&
                            'bg-emerald-500/10 font-semibold',
                        match.winnerId !== null &&
                            player &&
                            player.id !== match.winnerId &&
                            'opacity-50',
                    )}
                >
                    {player ? (
                        <>
                            <PlayerEmblem
                                name={player.name}
                                id={player.id}
                                size="xs"
                            />
                            <PlayerLink player={player} />
                            <RankBadge progress={player.rank} compact />
                        </>
                    ) : (
                        <>
                            <span className="size-6 rounded-md border-2 border-dashed" />
                            <span className="flex-1 text-muted-foreground">
                                TBD
                            </span>
                        </>
                    )}
                    {match.score && (
                        <span
                            className={cn(
                                'w-6 text-right font-black tabular-nums',
                                player?.id === match.winnerId &&
                                    'text-emerald-600 dark:text-emerald-400',
                            )}
                        >
                            {match.score[i]}
                        </span>
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
                                    className="gap-1.5 border-rose-500/50 font-bold text-rose-500"
                                >
                                    <span className="size-1.5 rounded-full bg-rose-500 motion-safe:animate-pulse" />
                                    LIVE
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
