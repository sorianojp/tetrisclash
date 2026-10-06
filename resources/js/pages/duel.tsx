import { Head, Link, router } from '@inertiajs/react';
import { echo } from '@laravel/echo-react';
import {
    Eye,
    Film,
    Flag,
    House,
    Swords,
    Trophy,
    WifiOff,
    X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AutopilotBar } from '@/components/tetris/autopilot-bar';
import { ClearCallout, describeClear } from '@/components/tetris/clear-callout';
import type { Callout } from '@/components/tetris/clear-callout';
import {
    EMOTES,
    EmoteBar,
    EmoteBubble,
    emoteIndex,
    useEmoteGate,
    useEmoteMute,
    useShownEmote,
} from '@/components/tetris/emotes';
import { FieldOverlay } from '@/components/tetris/field-overlay';
import { OpponentField } from '@/components/tetris/opponent-field';
import type { OpponentView } from '@/components/tetris/opponent-field';
import { PlayerPlate } from '@/components/tetris/player-plate';
import { PlayerEmblem } from '@/components/tetris/player-emblem';
import { RankProgressBar } from '@/components/tetris/rank-badge';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { ShareResult } from '@/components/tetris/share-result';
import { SoundToggle } from '@/components/tetris/sound-toggle';
import { TouchControls } from '@/components/tetris/touch-controls';
import { VersusIntro } from '@/components/tetris/versus-intro';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTouchDevice } from '@/hooks/use-touch-device';
import { sendJson } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { dashboard } from '@/routes';
import { forfeit, heartbeat, ko, replay as duelReplay } from '@/routes/duels';
import { store as storeReplay } from '@/routes/duels/replay';
import { show as showTournament } from '@/routes/tournaments';
import {
    AUTOPILOT_PAUSE_MS,
    useAutopilot,
    useAutopilotDriver,
} from '@/tetris/autopilot';
import { launchAttack, pointIn } from '@/tetris/projectiles';
import { PLAYER_LAYOUT } from '@/tetris/render';
import { ReplayRecorder, encodeReplay } from '@/tetris/replay';
import { sfx } from '@/tetris/sound';
import type { ShareCardData } from '@/tetris/share-card';
import { useCellSize, useTetrisGame } from '@/tetris/use-tetris-game';
import { ARCADE } from '@/tetris/arcade';

type DuelState = {
    id: number;
    mode: 'battle' | 'race';
    /** Unranked (friend challenge) duels don't touch rating or XP. */
    ranked: boolean;
    kos: Record<number, number>;
    /** Lines cleared per player, as last reported to the server (races). */
    lines: Record<number, number>;
    winnerId: number | null;
    finishReason:
        | 'knockout'
        | 'time'
        | 'forfeit'
        | 'disconnect'
        | 'finish'
        | 'abandoned'
        | 'cancelled'
        | null;
    ratingChange: number | null;
    /** XP each player earned, keyed by user id; null until the duel is settled. */
    xp: Record<number, number | null>;
    finished: boolean;
};

type Player = {
    id: number;
    name: string;
    rating: number;
    rank: RankProgress;
    wins: number;
    losses: number;
};

type Props = {
    duel: DuelState;
    me: Player;
    opponent: Player;
    seed: number;
    startsAt: number;
    endsAt: number;
    serverNow: number;
    kosToWin: number;
    raceLines: number;
    /** Set when this duel is a bracket match. */
    tournament: { id: number; name: string; round: string } | null;
};

type Member = { id: number; name: string };

/**
 * connecting: our realtime channel isn't joined yet (e.g. the socket server is down).
 * waiting: we're in, the opponent hasn't arrived yet. left: they were here and dropped.
 */
type Presence = 'connecting' | 'waiting' | 'online' | 'left';
/** s: board snapshot, p: pending garbage, l: lines sent, c: lines cleared. */
export type BoardWhisper = { s: string; p: number; l: number; c?: number };

/** The last part of the pre-match countdown, shown on the board; the versus intro plays before it. */
const BOARD_COUNTDOWN_MS = 3000;
const INTRO_MS = 5000;
const INTRO_FADE_MS = 350;

/** If the result still hasn't come this long after time's up, autopilot moves on anyway. */
const AUTOPILOT_GIVE_UP_MS = 60_000;

/** How long the board stays frozen after being topped out. */
const KO_PAUSE_MS = 1500;
const BOARD_SYNC_MS = 100;

/**
 * Incoming garbage we accept, mirroring the server's plausibility caps: a tampered
 * opponent can't bury us faster than a real player could attack.
 */
const MAX_ATTACK_PER_SECOND = 4;
const ATTACK_ALLOWANCE = 10;

const MODE_LABEL = {
    battle: { ranked: 'Ranked battle', friendly: 'Friendly battle' },
    race: { ranked: 'Race', friendly: 'Friendly race' },
};

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
    raceLines,
    tournament,
}: Props) {
    const [clockOffset] = useState(() => serverNow - Date.now());
    const [clock, setClock] = useState(() => Date.now() + clockOffset);
    const [state, setState] = useState(duel);
    const [knockedOut, setKnockedOut] = useState(false);
    /** The result card covers the boards; it can be closed to look at them. */
    const [showResult, setShowResult] = useState(true);
    const [presence, setPresence] = useState<Presence>('connecting');
    const [callout, setCallout] = useState<Callout | null>(null);
    const [progress, setProgress] = useState({
        mine: 0,
        theirs: 0,
        myLines: 0,
        theirLines: 0,
    });
    const [confirmForfeit, setConfirmForfeit] = useState(false);
    const opponentView = useRef<
        OpponentView & { linesSent: number; lines: number }
    >({
        snapshot: null,
        pending: 0,
        linesSent: 0,
        lines: 0,
    });
    const incomingTotal = useRef(0);
    const isRace = duel.mode === 'race';
    const channelRef = useRef<ReturnType<
        ReturnType<typeof echo>['join']
    > | null>(null);
    /** Spectators' channel: we stream our board and emotes there, and count who's watching. */
    const watchRef = useRef<ReturnType<ReturnType<typeof echo>['join']> | null>(
        null,
    );
    const [spectators, setSpectators] = useState(0);
    /** Read by the board stream, which runs outside React. */
    const spectatorsRef = useRef(0);
    const recorder = useRef(new ReplayRecorder());
    const finishedRef = useRef(duel.finished);
    const opponentBoxRef = useRef<HTMLDivElement>(null);
    const [rankAtStart] = useState(me.rank.rank);
    const touch = useTouchDevice();
    const narrow = useIsMobile();
    // Phones fit both boards side by side (the opponent's much smaller) above the touch controls.
    const cell = useCellSize(touch ? 440 : 270, 28, narrow ? 27 : 22);
    const [myEmote, showMyEmote] = useShownEmote();
    const [theirEmote, showTheirEmote] = useShownEmote();
    const [emotesMuted, toggleEmotesMuted] = useEmoteMute();
    const canSendEmote = useEmoteGate();
    const acceptEmote = useEmoteGate();
    const emotesMutedRef = useRef(emotesMuted);
    emotesMutedRef.current = emotesMuted;

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

    const { canvasRef, gameRef, controls } = useTetrisGame({
        seed,
        cell,
        running: phase === 'playing' && !knockedOut,
        // Gravity speeds up as the match goes on, like Tetris Battle.
        gravity: (elapsed) => Math.max(150, 1000 - elapsed / 150),
        events: {
            // Races are pure speed: no garbage changes hands.
            onAttack: (lines) => {
                if (isRace) {
                    return;
                }

                channelRef.current?.whisper('attack', { lines });
                fireAttack(lines, 'outgoing');
                sfx.attack(lines);
            },
            onClear: (info) => {
                setCallout({
                    id: Date.now(),
                    lines: describeClear(info),
                    attack: info.attack,
                });

                // Report the finishing line right away; the first report wins the race.
                if (
                    isRace &&
                    (gameRef.current?.stats.lines ?? 0) >= raceLines
                ) {
                    sendHeartbeat();
                }
            },
            onTopOut: () => {
                setKnockedOut(true);

                // In a race, topping out only costs time.
                if (!isRace) {
                    sendJson<DuelState>(ko(duel.id), {
                        lines_sent: gameRef.current?.stats.linesSent ?? 0,
                    })
                        .then(applyState)
                        .catch(() => {});
                }

                setTimeout(() => {
                    gameRef.current?.clearAfterKnockOut();
                    setKnockedOut(false);
                }, KO_PAUSE_MS);
            },
        },
    });

    const autopilot = useAutopilot();
    useAutopilotDriver(
        gameRef,
        autopilot.running,
        phase === 'playing' && !knockedOut,
    );

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
                setPresence(
                    members.some((m) => m.id === opponent.id)
                        ? 'online'
                        : 'waiting',
                ),
            )
            .joining(
                (member: Member) =>
                    member.id === opponent.id && setPresence('online'),
            )
            .leaving(
                (member: Member) =>
                    member.id === opponent.id && setPresence('left'),
            )
            .listen('DuelUpdated', applyState)
            .listenForWhisper('board', (board: BoardWhisper) => {
                opponentView.current = {
                    snapshot: board.s,
                    pending: board.p,
                    linesSent: board.l,
                    lines: board.c ?? 0,
                };
            })
            .listenForWhisper('attack', ({ lines }: { lines: number }) => {
                if (isRace) {
                    return;
                }

                const played = Math.max(
                    0,
                    (Date.now() + clockOffset - startsAt) / 1000,
                );
                const budget =
                    ATTACK_ALLOWANCE +
                    played * MAX_ATTACK_PER_SECOND -
                    incomingTotal.current;
                const incoming = Math.floor(
                    Math.max(0, Math.min(20, Number(lines) || 0, budget)),
                );

                incomingTotal.current += incoming;
                gameRef.current?.receiveGarbage(incoming);
                fireAttack(incoming, 'incoming');
            })
            .listenForWhisper('emote', ({ e }: { e: unknown }) => {
                const index = emoteIndex(e);

                if (
                    index !== null &&
                    !emotesMutedRef.current &&
                    acceptEmote()
                ) {
                    showTheirEmote(index);
                    sfx.emote();
                }
            });

        const watchName = `watch.duel.${duel.id}`;
        const watchers = new Set<number>();
        const players = [me.id, opponent.id];
        const count = () => {
            spectatorsRef.current = watchers.size;
            setSpectators(watchers.size);
        };
        watchRef.current = echo()
            .join(watchName)
            .here((members: Member[]) => {
                members
                    .filter((m) => !players.includes(m.id))
                    .forEach((m) => watchers.add(m.id));
                count();
            })
            .joining((member: Member) => {
                if (!players.includes(member.id)) {
                    watchers.add(member.id);
                    count();
                }
            })
            .leaving((member: Member) => {
                watchers.delete(member.id);
                count();
            });

        return () => {
            channelRef.current = null;
            watchRef.current = null;
            echo().leave(name);
            echo().leave(watchName);
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
                c: game.stats.lines,
            };
            const key = `${board.s}|${board.p}|${board.l}|${board.c}`;

            if (key !== last || Date.now() - lastSentAt > 1000) {
                channel.whisper('board', board);
                // Nobody watching: skip the spectator copy. A new spectator gets the
                // board within a second, from the periodic resend.
                if (spectatorsRef.current > 0) {
                    watchRef.current?.whisper('board', { ...board, u: me.id });
                }
                last = key;
                lastSentAt = Date.now();
            }

            const elapsed = Date.now() + clockOffset - startsAt;

            if (elapsed >= 0 && !finishedRef.current) {
                recorder.current.capture(
                    elapsed,
                    board.s,
                    board.p,
                    board.l,
                    board.c ?? 0,
                );
            }
        }, BOARD_SYNC_MS);

        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameRef]);

    // Clock + HUD refresh. The clock freezes once the result is in.
    useEffect(() => {
        if (state.finished) {
            return;
        }

        const timer = setInterval(() => {
            setClock(Date.now() + clockOffset);
            setProgress({
                mine: gameRef.current?.stats.linesSent ?? 0,
                theirs: opponentView.current.linesSent,
                myLines: gameRef.current?.stats.lines ?? 0,
                theirLines: opponentView.current.lines,
            });
        }, 100);

        return () => clearInterval(timer);
    }, [clockOffset, gameRef, state.finished]);

    /** Tell the server we're still here, with our attack total and lines cleared. */
    const sendHeartbeat = () =>
        void sendJson<DuelState>(heartbeat(duel.id), {
            lines_sent: gameRef.current?.stats.linesSent ?? 0,
            lines: gameRef.current?.stats.lines ?? 0,
        })
            .then(applyState)
            .catch(() => {});

    // Heartbeats run every few seconds; once time is up they poll quickly until
    // the server settles the result.
    const timeUp = phase === 'timeup';

    useEffect(() => {
        if (state.finished) {
            return;
        }

        if (timeUp) {
            sendHeartbeat();
        }

        const timer = setInterval(sendHeartbeat, timeUp ? 1000 : 3000);

        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeUp, state.finished, duel.id]);

    // Once it's over, upload our side of the replay (the final board included).
    useEffect(() => {
        if (!state.finished || finishedRef.current) {
            return;
        }

        finishedRef.current = true;
        void encodeReplay(recorder.current.frames)
            .then((data) => data && sendJson(storeReplay(duel.id), { data }))
            .catch(() => {});
    }, [state.finished, duel.id]);

    // The result jingle, once, when the match ends while we're watching it (not on a reload).
    const wasFinished = useRef(duel.finished);

    useEffect(() => {
        if (!state.finished || wasFinished.current) {
            return;
        }

        wasFinished.current = true;

        if (state.winnerId === null) {
            sfx.draw();
        } else if (state.winnerId === me.id) {
            sfx.win();
        } else {
            sfx.lose();
        }
    }, [state.finished, state.winnerId, me.id]);

    // Once a ranked duel settles, pull our updated rank so the result can show XP and rank-ups.
    useEffect(() => {
        if (state.finished && state.ranked) {
            router.reload({ only: ['me'] });
        }
    }, [state.finished, state.ranked]);

    const sendEmote = (index: number) => {
        if (!canSendEmote()) {
            return;
        }

        channelRef.current?.whisper('emote', { e: index });
        watchRef.current?.whisper('emote', { e: index, u: me.id });
        showMyEmote(index);
    };

    // Keys 1–6 send emotes; the game itself doesn't use the number row.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const index = Number(event.code.replace('Digit', '')) - 1;

            if (
                event.code.startsWith('Digit') &&
                index >= 0 &&
                index < EMOTES.length &&
                !event.repeat &&
                !(event.target instanceof HTMLInputElement)
            ) {
                sendEmote(index);
            }
        };
        window.addEventListener('keydown', onKey);

        return () => window.removeEventListener('keydown', onKey);
    });

    // Autopilot: say GG, give the result a moment on screen, then back to the lobby (which
    // queues again, or heads to Zen when energy is out).
    const stuck = phase === 'timeup' && clock - endsAt > AUTOPILOT_GIVE_UP_MS;

    useEffect(() => {
        if (!autopilot.running || (phase !== 'finished' && !stuck)) {
            return;
        }

        const gg = setTimeout(() => sendEmote(0), 1200);
        const next = setTimeout(
            () => router.visit(dashboard()),
            AUTOPILOT_PAUSE_MS * 1.5,
        );

        return () => {
            clearTimeout(gg);
            clearTimeout(next);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autopilot.running, phase, stuck]);

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
    const modeLabel = tournament
        ? `${tournament.name} · ${tournament.round}`
        : MODE_LABEL[duel.mode][duel.ranked ? 'ranked' : 'friendly'];
    const rankedUpNow = me.rank.rank > rankAtStart;

    const shareText = () => {
        const { outcome } = describeOutcome(state, me, opponent, raceLines);
        const verb = { win: 'won', loss: 'lost', draw: 'drew' }[outcome];

        return `I ${verb} a ${modeLabel.toLowerCase()} against ${opponent.name} on Tetris Clash! ${window.location.origin}`;
    };

    /** Snapshot the finished match as a square card. */
    const shareCard = (): ShareCardData => {
        const game = gameRef.current;
        const { outcome, reason } = describeOutcome(
            state,
            me,
            opponent,
            raceLines,
        );
        const change = state.ratingChange ?? 0;
        const xpGained = state.xp[me.id] ?? 0;
        const lines = game?.stats.lines ?? 0;
        const seconds = (game?.elapsedMs ?? 0) / 1000;
        const pps =
            seconds > 0 ? (game!.stats.pieces / seconds).toFixed(2) : '0.00';

        const stats: [string, string][] = isRace
            ? [
                  ['Pieces', String(game?.stats.pieces ?? 0)],
                  ['Pieces/sec', pps],
                  ['Opponent', `${progress.theirLines} lines`],
                  ['Time', formatTime(game?.elapsedMs ?? 0)],
              ]
            : [
                  ['Lines sent', String(game?.stats.linesSent ?? 0)],
                  ['Lines cleared', String(lines)],
                  ['Pieces/sec', pps],
                  ['Time', formatTime(game?.elapsedMs ?? 0, false)],
              ];

        if (state.ranked && outcome !== 'draw' && change > 0) {
            stats[2] = ['Rating', `${outcome === 'win' ? '+' : '−'}${change}`];
        }

        if (state.ranked) {
            stats[3] = ['XP', `+${xpGained}`];
        }

        return {
            mode: modeLabel,
            headline: { win: 'Victory', loss: 'Defeat', draw: 'Draw' }[outcome],
            tone:
                outcome === 'win'
                    ? 'win'
                    : outcome === 'loss'
                      ? 'loss'
                      : 'neutral',
            subline: `vs ${opponent.name} · ${reason}`,
            highlight: isRace
                ? {
                      label: 'Lines',
                      value: `${Math.min(lines, raceLines)} / ${raceLines}`,
                  }
                : { label: 'KOs', value: `${myKos} – ${theirKos}` },
            stats,
            ribbon: rankedUpNow ? `Rank up! ${me.rank.title}` : undefined,
            player: { name: me.name, rank: me.rank },
            board: game?.board ?? null,
            toppedOut: game?.toppedOut,
        };
    };

    const remaining = Math.max(0, endsAt - Math.max(clock, startsAt));
    const countdown = Math.ceil((startsAt - clock) / 1000);

    // Beep on 3, 2, 1, then GO.
    const beep = phase === 'countdown' && countdown <= 3 ? countdown : null;
    const lastPhase = useRef(phase);

    useEffect(() => {
        if (beep !== null && beep > 0) {
            sfx.countdown();
        }
    }, [beep]);

    useEffect(() => {
        if (lastPhase.current === 'countdown' && phase === 'playing') {
            sfx.go();
        }

        lastPhase.current = phase;
    }, [phase]);
    // Skipped on a late (re)load, once its slot in the countdown has passed.
    const introLeft = startsAt - BOARD_COUNTDOWN_MS - clock;
    const minutes = Math.round((endsAt - startsAt) / 60_000);
    const opponentCell = narrow
        ? Math.max(4, Math.round(cell * 0.4))
        : Math.max(10, Math.round(cell * 0.62));

    /** Sound, emotes and forfeit: beside the boards on desktop, below them on phones. */
    const matchActions = (
        <>
            <EmoteBar
                onSend={sendEmote}
                muted={emotesMuted}
                onToggleMute={toggleEmotesMuted}
            />
            <div className="flex items-center gap-2">
                <SoundToggle />
                {phase !== 'finished' && (
                    <Button
                        variant={confirmForfeit ? 'destructive' : 'ghost'}
                        size="sm"
                        onClick={surrender}
                        className="text-muted-foreground"
                    >
                        <Flag />{' '}
                        {confirmForfeit ? 'Tap again to forfeit' : 'Forfeit'}
                    </Button>
                )}
            </div>
        </>
    );

    return (
        <>
            <Head title={`${me.name} vs ${opponent.name}`} />
            <div className="flex h-full flex-1 flex-col items-center gap-4 p-4">
                <header className="grid w-full max-w-4xl grid-cols-[1fr_auto_1fr] items-center gap-3">
                    <PlayerPlate
                        player={me}
                        mode={duel.mode}
                        kos={myKos}
                        kosToWin={kosToWin}
                        linesSent={progress.mine}
                        lines={progress.myLines}
                        raceLines={raceLines}
                        tone="you"
                    />
                    <div className="flex flex-col items-center gap-1">
                        <div
                            className={cn(
                                'rounded-xl bg-[#080b18] px-4 py-1.5 text-center text-3xl font-black tabular-nums shadow-[0_0_24px_-6px_rgb(139_92_246/0.6)] ring-1 ring-violet-500/40 sm:text-4xl',
                                phase === 'playing' && remaining < 15000
                                    ? ARCADE.ko
                                    : ARCADE.plain,
                                phase === 'playing' &&
                                    remaining < 15000 &&
                                    'shadow-[0_0_28px_-4px_rgb(244_63_94/0.7)] ring-rose-500/60 motion-safe:animate-pulse',
                            )}
                        >
                            {formatTime(remaining, false)}
                        </div>
                        <span className="text-[11px] font-semibold tracking-wider whitespace-nowrap text-muted-foreground uppercase">
                            {modeLabel}
                        </span>
                        {spectators > 0 && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Eye className="size-3.5" /> {spectators}{' '}
                                watching
                            </span>
                        )}
                    </div>
                    <PlayerPlate
                        player={opponent}
                        mode={duel.mode}
                        kos={theirKos}
                        kosToWin={kosToWin}
                        linesSent={progress.theirs}
                        lines={progress.theirLines}
                        raceLines={raceLines}
                        align="right"
                        tone="opponent"
                    />
                </header>

                <div className="flex items-start justify-center gap-2 md:gap-6">
                    <div className="relative rounded-xl tetris-stage p-1.5 shadow-xl ring-1 ring-indigo-500/20 md:p-3">
                        <canvas ref={canvasRef} className="block" />
                        <ClearCallout callout={callout} />
                        <EmoteBubble emote={myEmote} />

                        {phase === 'countdown' && (
                            <FieldOverlay>
                                <div className="flex flex-col items-center gap-2 text-white">
                                    <span
                                        key={countdown}
                                        className={cn(
                                            'animate-callout text-8xl font-black',
                                            countdown > 0
                                                ? ARCADE.gold
                                                : ARCADE.go,
                                        )}
                                    >
                                        {countdown > 0 ? countdown : 'GO!'}
                                    </span>
                                    {isRace && (
                                        <span className="rounded-full bg-black/50 px-3 py-1 text-sm font-bold text-white">
                                            First to {raceLines} lines
                                        </span>
                                    )}
                                    {presence !== 'online' && (
                                        <span className="text-sm text-indigo-200">
                                            {presence === 'connecting'
                                                ? 'Connecting…'
                                                : 'Waiting for opponent…'}
                                        </span>
                                    )}
                                </div>
                            </FieldOverlay>
                        )}

                        {knockedOut && phase === 'playing' && (
                            <FieldOverlay className="bg-rose-950/60">
                                <span
                                    className={cn(
                                        'animate-callout text-7xl font-black',
                                        ARCADE.ko,
                                    )}
                                >
                                    {isRace ? 'OOPS!' : 'K.O.'}
                                </span>
                            </FieldOverlay>
                        )}

                        {phase === 'timeup' && (
                            <FieldOverlay>
                                <span
                                    className={cn(
                                        'animate-callout text-6xl font-black',
                                        ARCADE.time,
                                    )}
                                >
                                    TIME!
                                </span>
                            </FieldOverlay>
                        )}

                        {phase === 'finished' && !showResult && (
                            <FieldOverlay className="items-end pb-6">
                                <Button
                                    className="bg-amber-300 font-black text-amber-950 hover:bg-amber-200"
                                    onClick={() => setShowResult(true)}
                                >
                                    <Trophy /> Show result
                                </Button>
                            </FieldOverlay>
                        )}
                    </div>

                    <div className="flex flex-col items-center gap-2">
                        <div
                            ref={opponentBoxRef}
                            className="relative rounded-lg tetris-stage p-1 ring-1 ring-indigo-500/20 md:rounded-xl md:p-2"
                        >
                            <OpponentField
                                view={opponentView}
                                cell={opponentCell}
                            />
                            <EmoteBubble emote={theirEmote} />
                            {myKos > 0 && (
                                <div
                                    key={myKos}
                                    className="pointer-events-none absolute inset-0 flex animate-callout items-center justify-center"
                                >
                                    <span
                                        className={cn(
                                            'text-4xl font-black md:text-5xl',
                                            ARCADE.gold,
                                        )}
                                    >
                                        K.O.!
                                    </span>
                                </div>
                            )}
                            {presence !== 'online' && phase !== 'finished' && (
                                <div className="absolute inset-x-1 top-1 flex items-center justify-center gap-1.5 rounded-md bg-black/70 px-1 py-1 text-[10px] leading-tight text-amber-200 md:inset-x-2 md:top-2 md:px-2 md:text-xs">
                                    {presence === 'left' ? (
                                        <>
                                            <WifiOff className="size-3.5" />{' '}
                                            Disconnected
                                        </>
                                    ) : presence === 'waiting' ? (
                                        'Waiting for opponent…'
                                    ) : (
                                        <>
                                            <Spinner className="size-3.5" />{' '}
                                            Connecting…
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="hidden w-64 flex-col items-center gap-2 md:flex">
                            {matchActions}
                        </div>
                    </div>
                </div>

                {touch && phase !== 'finished' && (
                    <TouchControls controls={controls} />
                )}

                {/* On phones the opponent's board is narrow, so these go below. */}
                <div className="flex w-full flex-col items-center gap-2 md:hidden">
                    {matchActions}
                </div>
            </div>

            {phase === 'finished' && showResult && (
                <Result
                    tournamentId={tournament?.id ?? null}
                    state={state}
                    me={me}
                    opponent={opponent}
                    raceLines={raceLines}
                    rankedUp={rankedUpNow}
                    onClose={() => setShowResult(false)}
                    share={
                        <ShareResult
                            getCard={shareCard}
                            filename={`tetris-clash-${duel.mode}-${duel.id}.png`}
                            text={shareText()}
                        />
                    }
                />
            )}

            {phase === 'countdown' && introLeft > 0 && (
                <VersusIntro
                    me={me}
                    opponent={opponent}
                    mode={duel.mode}
                    title={modeLabel}
                    rules={[
                        isRace
                            ? `First to ${raceLines} lines`
                            : `First to ${kosToWin} KOs`,
                        `${minutes} minutes`,
                        state.ranked ? 'Rating on the line' : 'Just for fun',
                    ]}
                    status={
                        presence === 'connecting'
                            ? 'Connecting…'
                            : presence === 'waiting'
                              ? 'Waiting for opponent…'
                              : undefined
                    }
                    leaving={introLeft < INTRO_FADE_MS}
                    progress={Math.min(1, introLeft / INTRO_MS)}
                />
            )}

            <AutopilotBar
                status={
                    phase === 'finished'
                        ? 'Match over: back to the lobby'
                        : `${modeLabel} vs ${opponent.name}`
                }
            />
        </>
    );
}

Duel.layout = {
    breadcrumbs: [
        { title: 'Lobby', href: dashboard() },
        // The current page crumb isn't rendered as a link.
        { title: 'Match', href: dashboard() },
    ],
};

/** Who won, from this player's side, and a short reason why. */
function describeOutcome(
    state: DuelState,
    me: Player,
    opponent: Player,
    raceLines: number,
): { outcome: 'win' | 'loss' | 'draw'; reason: string } {
    const outcome =
        state.winnerId === null
            ? 'draw'
            : state.winnerId === me.id
              ? 'win'
              : 'loss';
    const reason = {
        knockout: 'by knockout',
        time: 'on time',
        finish:
            outcome === 'win'
                ? `first to ${raceLines} lines`
                : `${opponent.name} finished first`,
        forfeit:
            outcome === 'win' ? `${opponent.name} forfeited` : 'you forfeited',
        disconnect:
            outcome === 'win'
                ? `${opponent.name} disconnected`
                : 'you disconnected',
        abandoned: 'neither player showed up',
        cancelled: 'ended by an admin',
    }[state.finishReason ?? 'time'];

    return { outcome, reason };
}

function Result({
    tournamentId,
    state,
    me,
    opponent,
    raceLines,
    rankedUp,
    onClose,
    share,
}: {
    tournamentId: number | null;
    state: DuelState;
    me: Player;
    opponent: Player;
    raceLines: number;
    rankedUp: boolean;
    onClose: () => void;
    share: ReactNode;
}) {
    const { outcome, reason } = describeOutcome(state, me, opponent, raceLines);
    const change = state.ratingChange ?? 0;
    const xpGained = state.xp[me.id] ?? 0;
    const isRace = state.mode === 'race';
    const score = (id: number) =>
        isRace
            ? Math.min(state.lines[id] ?? 0, raceLines)
            : (state.kos[id] ?? 0);

    const look = {
        win: {
            title: 'text-amber-300',
            glow: 'shadow-[0_0_80px_-20px_rgb(251_191_36/0.6)]',
            label: 'YOU WIN!',
        },
        loss: {
            title: 'text-rose-300',
            glow: 'shadow-[0_0_80px_-20px_rgb(244_63_94/0.55)]',
            label: 'YOU LOSE',
        },
        draw: {
            title: 'text-slate-200',
            glow: '',
            label: 'DRAW',
        },
    }[outcome];

    return (
        <div className="fixed inset-0 z-40 flex animate-in items-center justify-center bg-black/60 p-4 backdrop-blur-sm duration-200 fade-in">
            <div
                role="dialog"
                aria-label={look.label}
                className={cn(
                    'relative flex w-full max-w-md animate-in flex-col items-center gap-5 overflow-hidden rounded-3xl bg-[#0d1224] px-6 pt-10 pb-6 text-center text-white ring-1 ring-white/10 duration-300 zoom-in-90 sm:px-8',
                    look.glow,
                )}
            >
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute top-4 right-4 rounded-md p-1 text-indigo-300 hover:bg-white/10 hover:text-white"
                    title="Hide to see the boards"
                >
                    <X className="size-5" />
                    <span className="sr-only">Hide result</span>
                </button>

                <div className="flex flex-col items-center gap-1.5">
                    <span
                        className={cn(
                            'inline-block pb-[0.1em] text-5xl font-black tracking-tight sm:text-6xl',
                            look.title,
                        )}
                    >
                        {look.label}
                    </span>
                    <span className="text-base text-indigo-200">{reason}</span>
                    {!state.ranked && !tournamentId && (
                        <span className="text-sm text-indigo-200/80">
                            Friendly match: no rating or XP
                        </span>
                    )}
                </div>

                {/* The final score, you on the left. */}
                <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl bg-white/5 px-4 py-4 ring-1 ring-white/10">
                    <ScoreSide player={me} tone="you" />
                    <span className="text-3xl font-black tabular-nums">
                        {score(me.id)}
                        <span className="mx-1.5 text-indigo-300">–</span>
                        {score(opponent.id)}
                        <span className="block text-[10px] font-bold tracking-widest text-indigo-300 uppercase">
                            {isRace ? 'Lines' : 'KOs'}
                        </span>
                    </span>
                    <ScoreSide player={opponent} tone="opponent" />
                </div>

                {state.ranked && (
                    <div className="grid w-full grid-cols-2 gap-3">
                        <div className="rounded-2xl bg-white/5 px-3 py-3 ring-1 ring-white/10">
                            <div className="text-xs font-bold tracking-wider text-indigo-300 uppercase">
                                Rating
                            </div>
                            <div
                                className={cn(
                                    'text-3xl font-black tabular-nums',
                                    outcome === 'win' && 'text-emerald-300',
                                    outcome === 'loss' && 'text-rose-300',
                                )}
                            >
                                {outcome === 'draw' || change === 0
                                    ? '±0'
                                    : `${outcome === 'win' ? '+' : '−'}${change}`}
                            </div>
                        </div>
                        <div className="rounded-2xl bg-white/5 px-3 py-3 ring-1 ring-white/10">
                            <div className="text-xs font-bold tracking-wider text-indigo-300 uppercase">
                                XP
                            </div>
                            <div className="text-3xl font-black text-amber-300 tabular-nums">
                                +{xpGained}
                            </div>
                        </div>
                    </div>
                )}

                {state.ranked && (
                    <div className="flex w-full flex-col items-center gap-2">
                        {rankedUp && (
                            <span
                                className={cn(
                                    'animate-callout text-2xl font-black',
                                    ARCADE.gold,
                                )}
                            >
                                RANK UP! {me.rank.rank} · {me.rank.title}
                            </span>
                        )}
                        <RankProgressBar
                            progress={me.rank}
                            className="w-full text-indigo-200"
                        />
                    </div>
                )}

                <div className="flex w-full flex-col gap-2">
                    {state.ranked && (
                        <Button
                            size="lg"
                            className="h-12 w-full bg-amber-300 text-base font-black text-amber-950 hover:bg-amber-200"
                            onClick={() =>
                                router.visit(dashboard({ query: { queue: 1 } }))
                            }
                        >
                            <Swords /> PLAY AGAIN
                        </Button>
                    )}
                    {tournamentId !== null && (
                        <Button size="lg" className="h-12 w-full" asChild>
                            <Link href={showTournament(tournamentId)}>
                                <Trophy /> Back to bracket
                            </Link>
                        </Button>
                    )}
                    <div className="grid grid-cols-3 gap-2 [&>*]:w-full">
                        <Button variant="secondary" asChild>
                            <Link href={dashboard()}>
                                <House /> Lobby
                            </Link>
                        </Button>
                        <Button variant="secondary" asChild>
                            <Link href={duelReplay(state.id)}>
                                <Film /> Replay
                            </Link>
                        </Button>
                        {share}
                    </div>
                </div>
            </div>
        </div>
    );
}

function ScoreSide({
    player,
    tone,
}: {
    player: Player;
    tone: 'you' | 'opponent';
}) {
    return (
        <div className="flex min-w-0 flex-col items-center gap-1.5">
            <PlayerEmblem
                name={player.name}
                id={player.id}
                size="md"
                tone={
                    tone === 'you'
                        ? 'bg-amber-400 text-amber-950'
                        : 'bg-rose-500 text-white'
                }
            />
            <span className="w-full truncate text-sm font-bold">
                {player.name}
            </span>
        </div>
    );
}
