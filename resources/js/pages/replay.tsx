import { Head, Link } from '@inertiajs/react';
import { Film, Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { OpponentField } from '@/components/tetris/opponent-field';
import type { OpponentView } from '@/components/tetris/opponent-field';
import { PlayerEmblem } from '@/components/tetris/player-emblem';
import { RankBadge } from '@/components/tetris/rank-badge';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatTime } from '@/lib/format';
import { dashboard, practice } from '@/routes';
import { show as showPlayer } from '@/routes/players';
import { PRACTICE_MODES, formatRecord } from '@/tetris/practice-modes';
import type { RecordMode } from '@/tetris/practice-modes';
import { decodeReplay, frameAt } from '@/tetris/replay';
import type { ReplayFrame } from '@/tetris/replay';
import { useCellSize } from '@/tetris/use-tetris-game';

type Player = { id: number; name: string; rank: RankProgress };

type Timeline = {
    player: Player;
    /** Null when this player's side was never uploaded. */
    data: string | null;
    durationMs: number;
};

type Props = {
    kind: 'duel' | 'practice';
    duel: {
        mode: 'battle' | 'race';
        ranked: boolean;
        kos: Record<number, number>;
        winnerId: number | null;
        finishReason: string | null;
    } | null;
    run: { mode: RecordMode; value: number; playedAt: string | null } | null;
    timelines: Timeline[];
};

const SPEEDS = ['0.5', '1', '2', '4'];

/** Play back recorded boards: one practice run, or both sides of a duel in sync. */
export default function Replay({ kind, duel, run, timelines }: Props) {
    const [frames, setFrames] = useState<(ReplayFrame[] | null)[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [time, setTime] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState('1');
    const views = useRef(
        timelines.map(() => ({
            current: { snapshot: null, pending: 0 } as OpponentView,
        })),
    );
    const timeRef = useRef(0);
    const cell = useCellSize(300, timelines.length > 1 ? 24 : 28);
    const duration = Math.max(0, ...timelines.map((t) => t.durationMs));

    useEffect(() => {
        Promise.all(
            timelines.map((t) =>
                t.data ? decodeReplay(t.data) : Promise.resolve(null),
            ),
        )
            .then((decoded) => {
                setFrames(decoded);
                setPlaying(true);
            })
            .catch(() => setFailed(true));
    }, [timelines]);

    const seek = (t: number) => {
        timeRef.current = Math.max(0, Math.min(duration, t));
        setTime(timeRef.current);
    };

    // Advance the clock while playing.
    useEffect(() => {
        if (!playing) {
            return;
        }

        let frame = 0;
        let last = performance.now();

        const loop = (now: number) => {
            const next = timeRef.current + (now - last) * Number(speed);
            last = now;
            seek(next);

            if (next >= duration) {
                setPlaying(false);

                return;
            }

            frame = requestAnimationFrame(loop);
        };

        frame = requestAnimationFrame(loop);

        return () => cancelAnimationFrame(frame);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing, speed, duration]);

    // Point each board at the frame for the current time.
    const current = (frames ?? []).map((list) =>
        list ? frameAt(list, time) : null,
    );

    useEffect(() => {
        current.forEach((frame, i) => {
            views.current[i].current = {
                snapshot: frame?.[1] ?? null,
                pending: frame?.[2] ?? 0,
            };
        });
    });

    // Space plays and pauses.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.code === 'Space' && frames) {
                event.preventDefault();
                togglePlay();
            }
        };
        window.addEventListener('keydown', onKey);

        return () => window.removeEventListener('keydown', onKey);
    });

    const togglePlay = () => {
        if (!playing && timeRef.current >= duration) {
            seek(0);
        }

        setPlaying(!playing);
    };

    const heading =
        kind === 'duel'
            ? timelines.map((t) => t.player.name).join(' vs ')
            : `${timelines[0].player.name} · ${run ? PRACTICE_MODES[run.mode].label : ''}`;

    return (
        <>
            <Head title={`Replay: ${heading}`} />
            <div className="flex h-full flex-1 flex-col items-center gap-5 p-4 sm:p-6">
                <div className="flex flex-col items-center gap-2 text-center">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/15 px-3 py-1 text-[11px] font-bold tracking-[0.2em] text-violet-600 uppercase dark:text-violet-300">
                        <Film className="size-3.5" /> Replay
                    </span>
                    <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                        {heading}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {duel && describeDuel(duel, timelines)}
                        {run &&
                            `${formatRecord(run.mode, run.value)}${run.playedAt ? ` · ${run.playedAt}` : ''}`}
                    </p>
                </div>

                {failed ? (
                    <p className="text-sm text-muted-foreground">
                        This replay couldn't be loaded in this browser.
                    </p>
                ) : !frames ? (
                    <Spinner />
                ) : (
                    <>
                        <div className="flex flex-wrap items-start justify-center gap-6">
                            {timelines.map((timeline, i) => (
                                <div
                                    key={timeline.player.id}
                                    className="flex flex-col items-center gap-2"
                                >
                                    <div className="flex items-center gap-2 rounded-xl border bg-card px-2.5 py-1.5 text-sm shadow-sm">
                                        <PlayerEmblem
                                            name={timeline.player.name}
                                            id={timeline.player.id}
                                            size="xs"
                                        />
                                        <Link
                                            href={showPlayer(
                                                timeline.player.id,
                                            )}
                                            className="font-semibold hover:underline"
                                        >
                                            {timeline.player.name}
                                        </Link>
                                        <RankBadge
                                            progress={timeline.player.rank}
                                            compact
                                        />
                                        {duel && duel.mode === 'battle' && (
                                            <span className="text-xs text-muted-foreground">
                                                {duel.kos[timeline.player.id] ??
                                                    0}{' '}
                                                KO
                                            </span>
                                        )}
                                    </div>
                                    <div className="relative tetris-stage rounded-xl p-2 ring-1 ring-indigo-500/20">
                                        <OpponentField
                                            view={views.current[i]}
                                            cell={cell}
                                        />
                                        {!frames[i] && (
                                            <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-indigo-200">
                                                Not recorded
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-4 text-xs text-muted-foreground tabular-nums">
                                        <span>
                                            Lines {current[i]?.[4] ?? 0}
                                        </span>
                                        {kind === 'duel' && (
                                            <span>
                                                Sent {current[i]?.[3] ?? 0}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex w-full max-w-xl flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm dark:bg-gradient-to-b dark:from-white/[0.04] dark:to-transparent">
                            <input
                                type="range"
                                min={0}
                                max={duration}
                                step={100}
                                value={time}
                                onChange={(event) =>
                                    seek(Number(event.target.value))
                                }
                                aria-label="Replay position"
                                className="w-full accent-primary"
                            />
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        onClick={togglePlay}
                                        aria-label={playing ? 'Pause' : 'Play'}
                                    >
                                        {playing ? <Pause /> : <Play />}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => seek(0)}
                                        aria-label="Back to start"
                                    >
                                        <RotateCcw />
                                    </Button>
                                    <span className="font-mono text-sm tabular-nums">
                                        {formatTime(time, false)} /{' '}
                                        {formatTime(duration, false)}
                                    </span>
                                </div>
                                <ToggleGroup
                                    type="single"
                                    variant="outline"
                                    size="sm"
                                    value={speed}
                                    onValueChange={(value) =>
                                        value && setSpeed(value)
                                    }
                                    aria-label="Playback speed"
                                >
                                    {SPEEDS.map((value) => (
                                        <ToggleGroupItem
                                            key={value}
                                            value={value}
                                            className="px-2.5"
                                        >
                                            {value}×
                                        </ToggleGroupItem>
                                    ))}
                                </ToggleGroup>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}

Replay.layout = {
    breadcrumbs: [
        { title: 'Lobby', href: dashboard() },
        { title: 'Replay', href: practice() },
    ],
};

function describeDuel(
    duel: NonNullable<Props['duel']>,
    timelines: Timeline[],
): string {
    const kind = `${duel.ranked ? 'Ranked' : 'Friendly'} ${duel.mode}`;
    const winner = timelines.find((t) => t.player.id === duel.winnerId);

    return `${kind} · ${winner ? `${winner.player.name} won` : 'Draw'}`;
}
