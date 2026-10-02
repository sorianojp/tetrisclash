import { Head, Link } from '@inertiajs/react';
import { echo } from '@laravel/echo-react';
import { Eye, Film, House } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
    EMOTE_COOLDOWN_MS,
    EmoteBubble,
    emoteIndex,
    useEmoteMute,
    useShownEmote,
} from '@/components/tetris/emotes';
import { OpponentField } from '@/components/tetris/opponent-field';
import type { OpponentView } from '@/components/tetris/opponent-field';
import { PlayerPlate } from '@/components/tetris/player-plate';
import { SoundToggle } from '@/components/tetris/sound-toggle';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { Button } from '@/components/ui/button';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { dashboard } from '@/routes';
import { sfx } from '@/tetris/sound';
import { replay as duelReplay } from '@/routes/duels';
import { useCellSize } from '@/tetris/use-tetris-game';
import { useIsMobile } from '@/hooks/use-mobile';

type DuelState = {
    id: number;
    mode: 'battle' | 'race';
    ranked: boolean;
    kos: Record<number, number>;
    lines: Record<number, number>;
    winnerId: number | null;
    finishReason: string | null;
    finished: boolean;
};

type Player = { id: number; name: string; rating: number; rank: RankProgress };
type Member = { id: number; name: string };
type BoardView = OpponentView & { linesSent: number; lines: number };
type WatchWhisper = { s: string; p: number; l: number; c?: number; u: number };

type Props = {
    duel: DuelState;
    players: [Player, Player];
    startsAt: number;
    endsAt: number;
    serverNow: number;
    kosToWin: number;
    raceLines: number;
};

const emptyView = (): BoardView => ({
    snapshot: null,
    pending: 0,
    linesSent: 0,
    lines: 0,
});

/** Watch a live duel: both boards as their players stream them, plus results as they land. */
export default function Watch({
    duel,
    players,
    startsAt,
    endsAt,
    serverNow,
    kosToWin,
    raceLines,
}: Props) {
    const [one, two] = players;
    const [clockOffset] = useState(() => serverNow - Date.now());
    const [clock, setClock] = useState(() => Date.now() + clockOffset);
    const [state, setState] = useState(duel);
    const [spectators, setSpectators] = useState(0);
    const views = useRef<Record<number, BoardView>>({
        [one.id]: emptyView(),
        [two.id]: emptyView(),
    });
    const viewOne = useRef<BoardView>(views.current[one.id]);
    const viewTwo = useRef<BoardView>(views.current[two.id]);
    const [progress, setProgress] = useState({
        [one.id]: { linesSent: 0, lines: 0 },
        [two.id]: { linesSent: 0, lines: 0 },
    });
    const [emoteOne, showEmoteOne] = useShownEmote();
    const [emoteTwo, showEmoteTwo] = useShownEmote();
    const [muted] = useEmoteMute();
    const mutedRef = useRef(muted);
    mutedRef.current = muted;
    const narrow = useIsMobile();
    // Phones: both boards side by side, each about half the width.
    const cell = useCellSize(250, 26, narrow ? 24 : 22);

    useEffect(() => {
        const name = `watch.duel.${duel.id}`;
        const ids = [one.id, two.id];
        const watchers = new Set<number>();
        const lastEmote: Record<number, number> = {};
        const count = () => setSpectators(watchers.size);

        echo()
            .join(name)
            .here((members: Member[]) => {
                members
                    .filter((m) => !ids.includes(m.id))
                    .forEach((m) => watchers.add(m.id));
                count();
            })
            .joining((member: Member) => {
                if (!ids.includes(member.id)) {
                    watchers.add(member.id);
                    count();
                }
            })
            .leaving((member: Member) => {
                watchers.delete(member.id);
                count();
            })
            .listen('DuelUpdated', (next: DuelState) =>
                setState((current) => (current.finished ? current : next)),
            )
            .listenForWhisper('board', (board: WatchWhisper) => {
                const view = views.current[board.u];

                if (!view || typeof board.s !== 'string') {
                    return;
                }

                view.snapshot = board.s;
                view.pending = Number(board.p) || 0;
                view.linesSent = Number(board.l) || 0;
                view.lines = Number(board.c) || 0;
            })
            .listenForWhisper(
                'emote',
                ({ e, u }: { e: unknown; u: number }) => {
                    const index = emoteIndex(e);
                    const now = Date.now();

                    if (
                        index === null ||
                        !ids.includes(u) ||
                        mutedRef.current ||
                        now - (lastEmote[u] ?? 0) < EMOTE_COOLDOWN_MS
                    ) {
                        return;
                    }

                    lastEmote[u] = now;
                    (u === one.id ? showEmoteOne : showEmoteTwo)(index);
                    sfx.emote();
                },
            );

        return () => echo().leave(name);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [duel.id, one.id, two.id]);

    // Clock and plate stats; the boards redraw themselves from the view refs.
    useEffect(() => {
        const timer = setInterval(() => {
            setClock(Date.now() + clockOffset);
            setProgress({
                [one.id]: {
                    linesSent: viewOne.current.linesSent,
                    lines: viewOne.current.lines,
                },
                [two.id]: {
                    linesSent: viewTwo.current.linesSent,
                    lines: viewTwo.current.lines,
                },
            });
        }, 100);

        return () => clearInterval(timer);
    }, [clockOffset, one.id, two.id]);

    const remaining = state.finished
        ? 0
        : Math.max(0, endsAt - Math.max(clock, startsAt));
    const countdown = Math.ceil((startsAt - clock) / 1000);
    const opponentCell = narrow ? cell : Math.max(12, Math.round(cell * 0.9));
    const title = `${one.name} vs ${two.name}`;
    const winner = players.find((p) => p.id === state.winnerId);

    const plate = (player: Player, align: 'left' | 'right') => (
        <PlayerPlate
            player={player}
            mode={duel.mode}
            kos={state.kos[player.id] ?? 0}
            kosToWin={kosToWin}
            linesSent={progress[player.id]?.linesSent ?? 0}
            lines={Math.max(
                progress[player.id]?.lines ?? 0,
                state.lines[player.id] ?? 0,
            )}
            raceLines={raceLines}
            align={align}
        />
    );

    return (
        <>
            <Head title={`Watching ${title}`} />
            <div className="flex h-full flex-1 flex-col items-center gap-4 p-4">
                <header className="grid w-full max-w-4xl grid-cols-[1fr_auto_1fr] items-center gap-3">
                    {plate(one, 'left')}
                    <div className="flex flex-col items-center gap-1">
                        <div
                            className={cn(
                                'rounded-xl bg-[#080b18] px-4 py-2 text-center font-mono text-2xl font-black text-white tabular-nums shadow-[0_0_24px_-6px_rgb(139_92_246/0.6)] ring-1 ring-violet-500/40 sm:text-3xl',
                                !state.finished &&
                                    clock >= startsAt &&
                                    remaining < 15000 &&
                                    'text-rose-400',
                            )}
                        >
                            {formatTime(remaining, false)}
                        </div>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Eye className="size-3.5" /> Spectating
                            {spectators > 1 && ` · ${spectators} watching`}
                        </span>
                    </div>
                    {plate(two, 'right')}
                </header>

                {state.finished && (
                    <div className="flex flex-wrap items-center justify-center gap-3 rounded-xl border bg-muted/40 px-4 py-3 text-sm">
                        <span className="font-semibold">
                            {winner
                                ? `${winner.name} wins${reasonText(state.finishReason)}`
                                : 'Draw'}
                        </span>
                        <Button size="sm" variant="secondary" asChild>
                            <Link href={duelReplay(duel.id)}>
                                <Film /> Replay
                            </Link>
                        </Button>
                        <Button size="sm" variant="ghost" asChild>
                            <Link href={dashboard()}>
                                <House /> Lobby
                            </Link>
                        </Button>
                    </div>
                )}

                <SoundToggle />

                <div className="flex items-start justify-center gap-3 md:gap-6">
                    {[
                        { player: one, view: viewOne, emote: emoteOne },
                        { player: two, view: viewTwo, emote: emoteTwo },
                    ].map(({ player, view, emote }) => (
                        <div
                            key={player.id}
                            className="relative tetris-stage rounded-xl p-2 ring-1 ring-indigo-500/20"
                        >
                            <OpponentField view={view} cell={opponentCell} />
                            <EmoteBubble emote={emote} />
                            {!state.finished && countdown > 0 && (
                                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                    <span className="text-6xl font-black text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                                        {countdown}
                                    </span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}

Watch.layout = {
    breadcrumbs: [
        { title: 'Lobby', href: dashboard() },
        { title: 'Spectating', href: dashboard() },
    ],
};

function reasonText(reason: string | null): string {
    return (
        {
            knockout: ' by knockout',
            time: ' on time',
            finish: ', first to the line',
            forfeit: ' by forfeit',
            disconnect: ' (opponent disconnected)',
            abandoned: '',
            cancelled: '',
        }[reason ?? 'time'] ?? ''
    );
}
