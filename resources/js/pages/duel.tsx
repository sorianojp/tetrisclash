import { Head, Link, router } from '@inertiajs/react';
import { echo } from '@laravel/echo-react';
import { Flag, Swords, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ClearCallout, describeClear } from '@/components/tetris/clear-callout';
import type { Callout } from '@/components/tetris/clear-callout';
import { FieldOverlay } from '@/components/tetris/field-overlay';
import { OpponentField } from '@/components/tetris/opponent-field';
import type { OpponentView } from '@/components/tetris/opponent-field';
import { RankBadge, RankProgressBar } from '@/components/tetris/rank-badge';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { Button } from '@/components/ui/button';
import { sendJson } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { dashboard } from '@/routes';
import { forfeit, heartbeat, ko } from '@/routes/duels';
import { launchAttack, pointIn } from '@/tetris/projectiles';
import { PLAYER_LAYOUT } from '@/tetris/render';
import { useCellSize, useTetrisGame } from '@/tetris/use-tetris-game';

type DuelState = {
    id: number;
    kos: Record<number, number>;
    winnerId: number | null;
    finishReason: 'knockout' | 'time' | 'forfeit' | 'disconnect' | null;
    ratingChange: number | null;
    /** XP each player earned, keyed by user id; null until the duel is settled. */
    xp: Record<number, number | null>;
    finished: boolean;
};

type Player = { id: number; name: string; rating: number; rank: RankProgress };

type Props = {
    duel: DuelState;
    me: Player;
    opponent: Player;
    seed: number;
    startsAt: number;
    endsAt: number;
    serverNow: number;
    kosToWin: number;
};

type Member = { id: number; name: string };
type BoardWhisper = { s: string; p: number; l: number };

/** How long the board stays frozen after being topped out. */
const KO_PAUSE_MS = 1500;
const BOARD_SYNC_MS = 100;

const totalKos = (state: DuelState) =>
    Object.values(state.kos).reduce((sum, k) => sum + k, 0);

export default function Duel({
    duel,
    me,
    opponent,
    seed,
    startsAt,
    endsAt,
    serverNow,
    kosToWin,
}: Props) {
    const [clockOffset] = useState(() => serverNow - Date.now());
    const [clock, setClock] = useState(() => Date.now() + clockOffset);
    const [state, setState] = useState(duel);
    const [knockedOut, setKnockedOut] = useState(false);
    const [opponentOnline, setOpponentOnline] = useState(false);
    const [callout, setCallout] = useState<Callout | null>(null);
    const [linesSent, setLinesSent] = useState({ mine: 0, theirs: 0 });
    const [confirmForfeit, setConfirmForfeit] = useState(false);
    const opponentView = useRef<OpponentView & { linesSent: number }>({
        snapshot: null,
        pending: 0,
        linesSent: 0,
    });
    const channelRef = useRef<ReturnType<
        ReturnType<typeof echo>['join']
    > | null>(null);
    const opponentBoxRef = useRef<HTMLDivElement>(null);
    const [rankAtStart] = useState(me.rank.rank);
    const cell = useCellSize(254, 28);

    const phase = state.finished
        ? 'finished'
        : clock < startsAt
          ? 'countdown'
          : clock < endsAt
            ? 'playing'
            : 'timeup';

    /** Server responses and broadcasts can arrive out of order; never go backwards. */
    const applyState = (next: DuelState) =>
        setState((current) =>
            current.finished ||
            (!next.finished && totalKos(next) < totalKos(current))
                ? current
                : next,
        );

    const { canvasRef, gameRef } = useTetrisGame({
        seed,
        cell,
        running: phase === 'playing' && !knockedOut,
        // Gravity speeds up as the match goes on, like Tetris Battle.
        gravity: (elapsed) => Math.max(150, 1000 - elapsed / 150),
        events: {
            onAttack: (lines) => {
                channelRef.current?.whisper('attack', { lines });
                fireAttack(lines, 'outgoing');
            },
            onClear: (info) =>
                setCallout({
                    id: Date.now(),
                    lines: describeClear(info),
                    attack: info.attack,
                }),
            onTopOut: () => {
                setKnockedOut(true);
                sendJson<DuelState>(ko(duel.id), {
                    lines_sent: gameRef.current?.stats.linesSent ?? 0,
                })
                    .then(applyState)
                    .catch(() => {});
                setTimeout(() => {
                    gameRef.current?.clearAfterKnockOut();
                    setKnockedOut(false);
                }, KO_PAUSE_MS);
            },
        },
    });

    /** Fly an attack orb between the two boards. */
    const fireAttack = (lines: number, direction: 'outgoing' | 'incoming') => {
        const mine = canvasRef.current;
        const theirs = opponentBoxRef.current;

        if (!mine || !theirs || lines <= 0) {
            return;
        }

        const myBoard = pointIn(
            mine,
            (PLAYER_LAYOUT.boardX + 5) / PLAYER_LAYOUT.width,
            0.6,
        );
        const myMeter = pointIn(
            mine,
            (PLAYER_LAYOUT.meterX + 0.25) / PLAYER_LAYOUT.width,
            0.85,
        );
        const theirBoard = pointIn(theirs, 0.55, 0.6);

        if (direction === 'outgoing') {
            launchAttack(myBoard, theirBoard, lines, direction);
        } else {
            launchAttack(theirBoard, myMeter, lines, direction);
        }
    };

    // Realtime channel: presence, KO/result updates, and the opponent's board + attacks.
    useEffect(() => {
        const name = `duel.${duel.id}`;
        const channel = echo().join(name);
        channelRef.current = channel;

        channel
            .here((members: Member[]) =>
                setOpponentOnline(members.some((m) => m.id === opponent.id)),
            )
            .joining(
                (member: Member) =>
                    member.id === opponent.id && setOpponentOnline(true),
            )
            .leaving(
                (member: Member) =>
                    member.id === opponent.id && setOpponentOnline(false),
            )
            .listen('DuelUpdated', applyState)
            .listenForWhisper('board', (board: BoardWhisper) => {
                opponentView.current = {
                    snapshot: board.s,
                    pending: board.p,
                    linesSent: board.l,
                };
            })
            .listenForWhisper('attack', ({ lines }: { lines: number }) => {
                const incoming = Math.max(0, Math.min(20, Number(lines) || 0));
                gameRef.current?.receiveGarbage(incoming);
                fireAttack(incoming, 'incoming');
            });

        return () => {
            channelRef.current = null;
            echo().leave(name);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [duel.id, opponent.id]);

    // Stream our board to the opponent whenever it changes (and periodically,
    // so a reconnecting opponent catches up).
    useEffect(() => {
        let last = '';
        let lastSentAt = 0;

        const timer = setInterval(() => {
            const game = gameRef.current;
            const channel = channelRef.current;

            if (!game || !channel) {
                return;
            }

            const board: BoardWhisper = {
                s: game.snapshot(),
                p: game.pendingGarbageTotal,
                l: game.stats.linesSent,
            };
            const key = `${board.s}|${board.p}|${board.l}`;

            if (key !== last || Date.now() - lastSentAt > 1000) {
                channel.whisper('board', board);
                last = key;
                lastSentAt = Date.now();
            }
        }, BOARD_SYNC_MS);

        return () => clearInterval(timer);
    }, [gameRef]);

    // Clock + HUD refresh. The clock freezes once the result is in.
    useEffect(() => {
        if (state.finished) {
            return;
        }

        const timer = setInterval(() => {
            setClock(Date.now() + clockOffset);
            setLinesSent({
                mine: gameRef.current?.stats.linesSent ?? 0,
                theirs: opponentView.current.linesSent,
            });
        }, 100);

        return () => clearInterval(timer);
    }, [clockOffset, gameRef, state.finished]);

    // Heartbeats tell the server we're still here and carry our attack total.
    // Once time is up they poll quickly until the server settles the result.
    const timeUp = phase === 'timeup';

    useEffect(() => {
        if (state.finished) {
            return;
        }

        const beat = () =>
            void sendJson<DuelState>(heartbeat(duel.id), {
                lines_sent: gameRef.current?.stats.linesSent ?? 0,
            })
                .then(applyState)
                .catch(() => {});

        if (timeUp) {
            beat();
        }

        const timer = setInterval(beat, timeUp ? 1000 : 3000);

        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeUp, state.finished, duel.id]);

    // Once settled, pull our updated rank so the result can show XP progress and rank-ups.
    useEffect(() => {
        if (state.finished) {
            router.reload({ only: ['me'] });
        }
    }, [state.finished]);

    const surrender = () => {
        if (!confirmForfeit) {
            setConfirmForfeit(true);
            setTimeout(() => setConfirmForfeit(false), 3000);

            return;
        }

        void sendJson<DuelState>(forfeit(duel.id)).then(applyState);
    };

    const myKos = state.kos[me.id] ?? 0;
    const theirKos = state.kos[opponent.id] ?? 0;
    const remaining = Math.max(0, endsAt - Math.max(clock, startsAt));
    const countdown = Math.ceil((startsAt - clock) / 1000);
    const opponentCell = Math.max(10, Math.round(cell * 0.62));

    return (
        <>
            <Head title={`${me.name} vs ${opponent.name}`} />
            <div className="flex h-full flex-1 flex-col items-center gap-4 p-4">
                <header className="grid w-full max-w-4xl grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <PlayerPlate
                        player={me}
                        kos={myKos}
                        kosToWin={kosToWin}
                        linesSent={linesSent.mine}
                    />
                    <div
                        className={cn(
                            'rounded-lg bg-[#080b18] px-4 py-2 text-center font-mono text-2xl font-bold text-white tabular-nums ring-1 ring-indigo-500/30',
                            phase === 'playing' &&
                                remaining < 15000 &&
                                'text-rose-400',
                        )}
                    >
                        {formatTime(remaining, false)}
                    </div>
                    <PlayerPlate
                        player={opponent}
                        kos={theirKos}
                        kosToWin={kosToWin}
                        linesSent={linesSent.theirs}
                        align="right"
                    />
                </header>

                <div className="flex flex-wrap items-start justify-center gap-6">
                    <div className="relative tetris-stage rounded-xl p-3 shadow-xl ring-1 ring-indigo-500/20">
                        <canvas ref={canvasRef} className="block" />
                        <ClearCallout callout={callout} />

                        {phase === 'countdown' && (
                            <FieldOverlay>
                                <div className="flex flex-col items-center gap-2 text-white">
                                    <span
                                        key={countdown}
                                        className="animate-callout text-7xl font-black"
                                    >
                                        {countdown > 0 ? countdown : 'GO!'}
                                    </span>
                                    {!opponentOnline && (
                                        <span className="text-sm text-indigo-200">
                                            Waiting for opponent…
                                        </span>
                                    )}
                                </div>
                            </FieldOverlay>
                        )}

                        {knockedOut && phase === 'playing' && (
                            <FieldOverlay className="bg-rose-950/60">
                                <span className="animate-callout text-6xl font-black text-rose-300">
                                    K.O.
                                </span>
                            </FieldOverlay>
                        )}

                        {phase === 'timeup' && (
                            <FieldOverlay>
                                <span className="text-4xl font-black text-white">
                                    TIME!
                                </span>
                            </FieldOverlay>
                        )}

                        {phase === 'finished' && (
                            <FieldOverlay>
                                <Result
                                    state={state}
                                    me={me}
                                    opponent={opponent}
                                    rankedUp={me.rank.rank > rankAtStart}
                                />
                            </FieldOverlay>
                        )}
                    </div>

                    <div className="flex flex-col items-center gap-2">
                        <div
                            ref={opponentBoxRef}
                            className="relative tetris-stage rounded-xl p-2 ring-1 ring-indigo-500/20"
                        >
                            <OpponentField
                                view={opponentView}
                                cell={opponentCell}
                            />
                            {myKos > 0 && (
                                <div
                                    key={myKos}
                                    className="pointer-events-none absolute inset-0 flex animate-callout items-center justify-center"
                                >
                                    <span className="text-4xl font-black text-amber-300 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                                        K.O.!
                                    </span>
                                </div>
                            )}
                            {!opponentOnline && phase !== 'finished' && (
                                <div className="absolute inset-x-2 top-2 flex items-center justify-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-xs text-amber-200">
                                    <WifiOff className="size-3.5" />{' '}
                                    Disconnected
                                </div>
                            )}
                        </div>

                        {phase !== 'finished' && (
                            <Button
                                variant={
                                    confirmForfeit ? 'destructive' : 'ghost'
                                }
                                size="sm"
                                onClick={surrender}
                                className="text-muted-foreground"
                            >
                                <Flag />{' '}
                                {confirmForfeit
                                    ? 'Click again to forfeit'
                                    : 'Forfeit'}
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

Duel.layout = {
    breadcrumbs: [
        { title: 'Lobby', href: dashboard() },
        // The current page crumb isn't rendered as a link.
        { title: 'Ranked match', href: dashboard() },
    ],
};

function PlayerPlate({
    player,
    kos,
    kosToWin,
    linesSent,
    align = 'left',
}: {
    player: Player;
    kos: number;
    kosToWin: number;
    linesSent: number;
    align?: 'left' | 'right';
}) {
    return (
        <div
            className={cn(
                'flex min-w-0 flex-col gap-1',
                align === 'right' && 'items-end text-right',
            )}
        >
            <div className="flex max-w-full items-baseline gap-2">
                <span className="truncate font-bold">{player.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                    {player.rating}
                </span>
            </div>
            <RankBadge progress={player.rank} className="max-w-full" />
            <div
                className={cn(
                    'flex items-center gap-3 text-xs',
                    align === 'right' && 'flex-row-reverse',
                )}
            >
                <div
                    className="flex gap-1"
                    aria-label={`${kos} of ${kosToWin} KOs`}
                >
                    {Array.from({ length: kosToWin }, (_, i) => (
                        <span
                            key={i}
                            className={cn(
                                'size-3 rotate-45 rounded-[2px] border',
                                i < kos
                                    ? 'border-amber-500 bg-amber-400'
                                    : 'border-muted-foreground/40',
                            )}
                        />
                    ))}
                </div>
                <span className="text-muted-foreground tabular-nums">
                    <Swords className="mr-1 inline size-3" />
                    {linesSent} sent
                </span>
            </div>
        </div>
    );
}

function Result({
    state,
    me,
    opponent,
    rankedUp,
}: {
    state: DuelState;
    me: Player;
    opponent: Player;
    rankedUp: boolean;
}) {
    const outcome =
        state.winnerId === null
            ? 'draw'
            : state.winnerId === me.id
              ? 'win'
              : 'loss';
    const reason = {
        knockout: 'by knockout',
        time: 'on time',
        forfeit:
            outcome === 'win' ? `${opponent.name} forfeited` : 'you forfeited',
        disconnect:
            outcome === 'win'
                ? `${opponent.name} disconnected`
                : 'you disconnected',
    }[state.finishReason ?? 'time'];
    const change = state.ratingChange ?? 0;
    const xpGained = state.xp[me.id] ?? 0;

    return (
        <div className="flex flex-col items-center gap-2 px-4 text-center text-white">
            <span
                className={cn(
                    'animate-in text-5xl font-black tracking-tight duration-300 zoom-in-50',
                    outcome === 'win' && 'text-amber-300',
                    outcome === 'loss' && 'text-rose-300',
                )}
            >
                {outcome === 'win'
                    ? 'YOU WIN!'
                    : outcome === 'loss'
                      ? 'YOU LOSE'
                      : 'DRAW'}
            </span>
            <span className="text-sm text-indigo-200">{reason}</span>
            {change > 0 && outcome !== 'draw' && (
                <span
                    className={cn(
                        'text-lg font-bold',
                        outcome === 'win'
                            ? 'text-emerald-300'
                            : 'text-rose-300',
                    )}
                >
                    {outcome === 'win' ? '+' : '−'}
                    {change} rating
                </span>
            )}
            <span className="text-sm font-semibold text-indigo-100">
                +{xpGained} XP
            </span>
            {rankedUp && (
                <span className="animate-callout text-2xl font-black text-amber-300">
                    RANK UP! {me.rank.rank} · {me.rank.title}
                </span>
            )}
            <RankProgressBar progress={me.rank} className="w-56" />
            <div className="mt-3 flex gap-2">
                <Button
                    onClick={() =>
                        router.visit(dashboard({ query: { queue: 1 } }))
                    }
                >
                    Play again
                </Button>
                <Button variant="secondary" asChild>
                    <Link href={dashboard()}>Lobby</Link>
                </Button>
            </div>
        </div>
    );
}
