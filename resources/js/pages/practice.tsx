import { Head, Link, router, usePage } from '@inertiajs/react';
import { Crown, RotateCcw, Swords } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { ClearCallout, describeClear } from '@/components/tetris/clear-callout';
import type { Callout } from '@/components/tetris/clear-callout';
import { ControlsLegend } from '@/components/tetris/controls-legend';
import { FieldOverlay } from '@/components/tetris/field-overlay';
import { PracticeLeaderboard } from '@/components/tetris/practice-leaderboard';
import type { PracticeBoards } from '@/components/tetris/practice-leaderboard';
import { ShareResult } from '@/components/tetris/share-result';
import { SoundToggle } from '@/components/tetris/sound-toggle';
import { TouchControls } from '@/components/tetris/touch-controls';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTouchDevice } from '@/hooks/use-touch-device';
import { sendJson } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { dashboard, practice, register } from '@/routes';
import { records as recordsRoute } from '@/routes/practice';
import type { GameStats } from '@/tetris/engine';
import {
    DIG_ROWS,
    LOWER_IS_BETTER,
    PRACTICE_MODES,
    SPRINT_LINES,
    ULTRA_MS,
    formatRecord,
} from '@/tetris/practice-modes';
import type { PracticeMode, PracticeRecords } from '@/tetris/practice-modes';
import { ReplayRecorder, encodeReplay } from '@/tetris/replay';
import { sfx } from '@/tetris/sound';
import type { ShareCardData } from '@/tetris/share-card';
import { useCellSize, useTetrisGame } from '@/tetris/use-tetris-game';

type Mode = PracticeMode;
type Phase = 'countdown' | 'playing' | 'done';
type Outcome = 'cleared' | 'timeUp' | 'toppedOut';
type Result = {
    outcome: Outcome;
    timeMs: number;
    score: number;
    newBest: boolean;
};

const MODES = PRACTICE_MODES;
const SURVIVAL_FIRST_ATTACK_MS = 5000;
const COUNTDOWN_MS = 2400;

/** Survival attacks arrive more often (6s down to 1.5s) and grow to 4 lines as time passes. */
const survivalGap = (elapsed: number) => Math.max(1500, 6000 - elapsed / 30);
const survivalAttack = (elapsed: number) =>
    1 + Math.floor(Math.random() * Math.min(4, 1 + elapsed / 40_000));

const newSeed = () => Math.floor(Math.random() * 2 ** 31);

/** The value a finished run puts on the record board, if it counts. */
function recordValue(
    mode: Mode,
    outcome: Outcome,
    timeMs: number,
    score: number,
): number | null {
    if ((mode === 'sprint' || mode === 'dig') && outcome === 'cleared') {
        return Math.round(timeMs);
    }

    if (mode === 'ultra' && outcome === 'timeUp') {
        return score;
    }

    if (mode === 'survival') {
        return Math.round(timeMs);
    }

    // Zen only ends when you top out, so every game counts.
    if (mode === 'zen') {
        return score;
    }

    return null;
}

export default function Practice({
    records: initialRecords,
    leaderboards,
}: {
    records: PracticeRecords;
    leaderboards: PracticeBoards;
}) {
    const { auth } = usePage().props;
    const [mode, setMode] = useState<Mode>('sprint');
    const [seed, setSeed] = useState(newSeed);
    const [phase, setPhase] = useState<Phase>('countdown');
    const [countdownEndsAt, setCountdownEndsAt] = useState(
        () => Date.now() + COUNTDOWN_MS,
    );
    const [now, setNow] = useState(() => Date.now());
    const [stats, setStats] = useState<
        GameStats & { timeMs: number; garbageRows: number }
    >({
        lines: 0,
        pieces: 0,
        linesSent: 0,
        score: 0,
        timeMs: 0,
        garbageRows: 0,
    });
    const [result, setResult] = useState<Result | null>(null);
    const [records, setRecords] = useState(initialRecords);
    const [callout, setCallout] = useState<Callout | null>(null);
    const nextAttackAt = useRef(SURVIVAL_FIRST_ATTACK_MS);
    const recorder = useRef(new ReplayRecorder());

    /** Record the board as it stands now (forced for the final frame). */
    const record = (force = false) => {
        const game = gameRef.current;

        if (game) {
            recorder.current.capture(
                game.elapsedMs,
                game.snapshot(),
                game.pendingGarbageTotal,
                game.stats.linesSent,
                game.stats.lines,
                force,
            );
        }
    };
    const touch = useTouchDevice();
    const narrow = useIsMobile();
    // Phones leave room for the stats strip above and the touch controls below.
    const cell = useCellSize(touch ? 470 : 190);

    const finish = (outcome: Outcome) => {
        const game = gameRef.current;
        const timeMs = game?.elapsedMs ?? 0;
        const score = game?.stats.score ?? 0;
        const value = recordValue(mode, outcome, timeMs, score);
        let newBest = false;

        if (value !== null) {
            const best = records[mode];
            newBest =
                best === null ||
                (LOWER_IS_BETTER[mode] ? value < best : value > best);

            if (newBest) {
                setRecords({ ...records, [mode]: value });
            }

            record(true);

            // Any counted run can move us up this week's board. Its replay goes along, and is
            // kept if the run is a best. Guests' runs aren't saved; the result card says so.
            if (auth.user) {
                encodeReplay(recorder.current.frames)
                    .catch(() => null)
                    .then((replay) =>
                        sendJson(recordsRoute(), { mode, value, replay }),
                    )
                    .then(() => router.reload({ only: ['leaderboards'] }))
                    .catch(() =>
                        toast.error(
                            "Couldn't save that result, so it won't count on the leaderboards.",
                        ),
                    );
            }
        }

        setPhase('done');
        setResult({ outcome, timeMs, score, newBest });

        // Topping out already crashed; finishing (or a new best) gets a fanfare.
        if (newBest || outcome !== 'toppedOut') {
            sfx.win();
        }
    };

    const { canvasRef, gameRef, controls } = useTetrisGame({
        seed,
        cell,
        running: phase === 'playing',
        startingGarbage: mode === 'dig' ? DIG_ROWS : 0,
        timeLimitMs: mode === 'ultra' ? ULTRA_MS : undefined,
        // Zen and Survival slowly speed up; the races keep classic 1 row per second.
        gravity:
            mode === 'zen'
                ? (elapsed) => Math.max(80, 1000 - elapsed / 150)
                : mode === 'survival'
                  ? (elapsed) => Math.max(150, 1000 - elapsed / 250)
                  : undefined,
        events: {
            onClear: (info) => {
                setCallout({
                    id: Date.now(),
                    lines: describeClear(info),
                    attack: info.attack,
                });

                if (
                    mode === 'sprint' &&
                    (gameRef.current?.stats.lines ?? 0) >= SPRINT_LINES
                ) {
                    finish('cleared');
                }
            },
            onLock: () => {
                if (mode === 'dig' && gameRef.current?.garbageRows === 0) {
                    finish('cleared');
                }
            },
            onTimeUp: () => finish('timeUp'),
            onTopOut: () => finish('toppedOut'),
        },
    });

    const restart = (nextMode: Mode = mode) => {
        setMode(nextMode);
        setSeed(newSeed());
        setResult(null);
        setCallout(null);
        setPhase('countdown');
        setCountdownEndsAt(Date.now() + COUNTDOWN_MS);
        nextAttackAt.current = SURVIVAL_FIRST_ATTACK_MS;
        recorder.current.reset();
    };

    // Countdown, Survival's garbage waves, then a HUD refresh loop while playing.
    useEffect(() => {
        const timer = setInterval(() => {
            const current = Date.now();
            setNow(current);

            if (phase === 'countdown' && current >= countdownEndsAt) {
                setPhase('playing');
            }

            const game = gameRef.current;

            if (!game) {
                return;
            }

            if (
                mode === 'survival' &&
                phase === 'playing' &&
                !game.toppedOut &&
                game.elapsedMs >= nextAttackAt.current
            ) {
                game.receiveGarbage(survivalAttack(game.elapsedMs));
                nextAttackAt.current += survivalGap(game.elapsedMs);
            }

            if (phase === 'playing') {
                record();
            }

            setStats({
                ...game.stats,
                timeMs: game.elapsedMs,
                garbageRows: game.garbageRows,
            });
        }, 50);

        return () => clearInterval(timer);
    }, [mode, phase, countdownEndsAt, gameRef]);

    // R restarts at any time.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            // Typing in a dialog (e.g. the share preview) shouldn't restart the run.
            const inDialog =
                event.target instanceof Element &&
                event.target.closest('[role="dialog"]');

            if (event.code === 'KeyR' && !event.repeat && !inDialog) {
                restart();
            }
        };
        window.addEventListener('keydown', onKey);

        return () => window.removeEventListener('keydown', onKey);
    });

    /** The headline number of a run: its time or its score. */
    const resultValue = (finished: Result) =>
        showsTime(mode, finished.outcome)
            ? formatTime(finished.timeMs)
            : finished.score.toLocaleString();

    const shareText = (finished: Result) =>
        `${resultTitle(mode, finished.outcome)} ${MODES[mode].label}: ${resultValue(finished)} on Tetris Clash! ${window.location.origin}`;

    /** Snapshot the finished run as a square card. */
    const shareCard = (finished: Result): ShareCardData => {
        const game = gameRef.current;
        const seconds = finished.timeMs / 1000;
        const pieces = game?.stats.pieces ?? 0;

        return {
            mode: MODES[mode].label,
            headline: resultTitle(mode, finished.outcome),
            tone:
                finished.newBest || finished.outcome === 'cleared'
                    ? 'win'
                    : finished.outcome === 'toppedOut' &&
                        mode !== 'survival' &&
                        mode !== 'zen'
                      ? 'loss'
                      : 'neutral',
            subline: MODES[mode].goal,
            highlight: {
                label: showsTime(mode, finished.outcome) ? 'Time' : 'Score',
                value: resultValue(finished),
            },
            stats: [
                ['Lines', String(game?.stats.lines ?? 0)],
                ['Pieces', String(pieces)],
                [
                    'Pieces/sec',
                    seconds > 0 ? (pieces / seconds).toFixed(2) : '0.00',
                ],
                ['Attack', String(game?.stats.linesSent ?? 0)],
            ],
            ribbon: finished.newBest ? 'New personal best' : undefined,
            player: { name: auth.user?.name ?? 'Guest' },
            board: game?.board ?? null,
            toppedOut: game?.toppedOut,
        };
    };

    const countdown = Math.ceil((countdownEndsAt - now) / 800);

    // Beep on 3, 2, 1, then GO.
    const beep = phase === 'countdown' ? countdown : null;
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
    const pps =
        stats.timeMs > 0
            ? (stats.pieces / (stats.timeMs / 1000)).toFixed(2)
            : '0.00';
    const best = records[mode];
    const bestLabel = best === null ? '—' : formatRecord(mode, best);

    const hud: Record<Mode, [string, string | number][]> = {
        sprint: [
            ['Time', formatTime(stats.timeMs)],
            ['Lines', `${Math.min(stats.lines, SPRINT_LINES)}/${SPRINT_LINES}`],
            ['Pieces/sec', pps],
            ['Attack', stats.linesSent],
            ['Best', bestLabel],
        ],
        ultra: [
            ['Time left', formatTime(Math.max(0, ULTRA_MS - stats.timeMs))],
            ['Score', stats.score.toLocaleString()],
            ['Pieces/sec', pps],
            ['Lines', stats.lines],
            ['Best', bestLabel],
        ],
        dig: [
            ['Time', formatTime(stats.timeMs)],
            ['Garbage left', `${stats.garbageRows}/${DIG_ROWS}`],
            ['Pieces/sec', pps],
            ['Pieces', stats.pieces],
            ['Best', bestLabel],
        ],
        survival: [
            ['Survived', formatTime(stats.timeMs)],
            ['Lines', stats.lines],
            ['Pieces/sec', pps],
            ['Attack', stats.linesSent],
            ['Best', bestLabel],
        ],
        zen: [
            ['Time', formatTime(stats.timeMs)],
            ['Score', stats.score.toLocaleString()],
            ['Pieces/sec', pps],
            ['Lines', stats.lines],
            ['Best', bestLabel],
        ],
    };

    return (
        <>
            <Head title="Practice" />
            <div className="flex h-full flex-1 flex-col items-center gap-4 p-4">
                <div className="flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
                    <div className="flex max-w-full flex-col gap-1.5">
                        <div className="max-w-full overflow-x-auto">
                            <ToggleGroup
                                type="single"
                                variant="outline"
                                className="rounded-xl bg-card"
                                value={mode}
                                onValueChange={(value) =>
                                    value && restart(value as Mode)
                                }
                            >
                                {(Object.keys(MODES) as Mode[]).map((key) => (
                                    <ToggleGroupItem
                                        key={key}
                                        value={key}
                                        className="px-3 font-semibold data-[state=on]:border-transparent data-[state=on]:bg-gradient-to-r data-[state=on]:from-violet-500 data-[state=on]:to-fuchsia-500 data-[state=on]:text-white sm:px-4"
                                    >
                                        {MODES[key].label}
                                    </ToggleGroupItem>
                                ))}
                            </ToggleGroup>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {MODES[mode].goal}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <SoundToggle />
                        <Button variant="outline" onClick={() => restart()}>
                            <RotateCcw /> Restart{' '}
                            <kbd className="ml-1 text-xs text-muted-foreground">
                                R
                            </kbd>
                        </Button>
                    </div>
                </div>

                {/* Phones: the key numbers above the board, since the full panel is below the fold. */}
                {narrow && (
                    <div className="grid w-full max-w-md grid-cols-3 gap-2">
                        {hud[mode].slice(0, 3).map(([label, value]) => (
                            <HudStat
                                key={label}
                                label={label}
                                value={value}
                                compact
                            />
                        ))}
                    </div>
                )}

                <div className="flex w-full max-w-5xl flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center">
                    <div className="flex w-full flex-col items-center gap-4 lg:w-auto">
                        <div className="relative tetris-stage rounded-xl p-1.5 shadow-xl ring-1 ring-indigo-500/20 md:p-3">
                            <canvas ref={canvasRef} className="block" />
                            <ClearCallout callout={callout} />

                            {phase === 'countdown' && countdown > 0 && (
                                <FieldOverlay>
                                    <div className="flex flex-col items-center gap-2 text-center text-white">
                                        <span
                                            key={countdown}
                                            className="animate-callout text-7xl font-black"
                                        >
                                            {countdown}
                                        </span>
                                        <span className="text-sm font-semibold tracking-widest uppercase">
                                            {MODES[mode].label}
                                        </span>
                                    </div>
                                </FieldOverlay>
                            )}

                            {phase === 'done' && result && (
                                <FieldOverlay>
                                    <ResultCard
                                        mode={mode}
                                        result={result}
                                        guest={!auth.user}
                                        onRestart={() => restart()}
                                        share={
                                            <ShareResult
                                                getCard={() =>
                                                    shareCard(result)
                                                }
                                                filename={`tetris-clash-${mode}.png`}
                                                text={shareText(result)}
                                            />
                                        }
                                    />
                                </FieldOverlay>
                            )}
                        </div>

                        {touch && <TouchControls controls={controls} />}
                    </div>

                    <aside className="flex w-full max-w-xs flex-col gap-4">
                        {/* An odd last tile (Best) spans the row instead of sitting alone. */}
                        <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2">
                            {/* On phones the first three are in the strip above the board. */}
                            {hud[mode]
                                .slice(narrow ? 3 : 0)
                                .map(([label, value]) => (
                                    <HudStat
                                        key={label}
                                        label={label}
                                        value={value}
                                    />
                                ))}
                        </div>
                        <Card accent="violet" className="gap-3 px-4 py-5">
                            <h2 className="flex items-center gap-2 text-sm font-bold">
                                <Crown className="size-4 text-amber-500" />
                                {MODES[mode].label} leaderboard
                            </h2>
                            <PracticeLeaderboard
                                mode={mode}
                                boards={leaderboards[mode]}
                            />
                        </Card>
                        <Card className="px-4 py-5">
                            <ControlsLegend />
                        </Card>
                    </aside>
                </div>
            </div>
        </>
    );
}

Practice.layout = {
    breadcrumbs: [
        { title: 'Lobby', href: dashboard() },
        { title: 'Practice', href: practice() },
    ],
};

/** Whether a finished run is measured by time (vs. score). */
function showsTime(mode: Mode, outcome: Outcome): boolean {
    return (
        mode === 'survival' ||
        ((mode === 'sprint' || mode === 'dig') && outcome === 'cleared')
    );
}

function resultTitle(mode: Mode, outcome: Outcome): string {
    return mode === 'survival'
        ? 'SURVIVED'
        : mode === 'zen'
          ? 'GAME OVER'
          : outcome === 'cleared'
            ? 'FINISHED!'
            : outcome === 'timeUp'
              ? "TIME'S UP!"
              : 'TOPPED OUT';
}

function ResultCard({
    mode,
    result,
    guest,
    onRestart,
    share,
}: {
    mode: Mode;
    result: Result;
    guest: boolean;
    onRestart: () => void;
    share: ReactNode;
}) {
    const { outcome, timeMs, score, newBest } = result;
    const timed = showsTime(mode, outcome);
    const showsScore = mode === 'ultra' || mode === 'zen';
    const title = resultTitle(mode, outcome);

    return (
        <div className="flex flex-col items-center gap-3 text-center text-white">
            <span className="text-3xl font-black">{title}</span>
            {(timed || showsScore) && (
                <span className="text-4xl font-bold tabular-nums">
                    {timed ? formatTime(timeMs) : score.toLocaleString()}
                </span>
            )}
            {newBest && (
                <span className="text-sm font-semibold text-amber-300">
                    New personal best!
                </span>
            )}
            <div className="mt-2 flex flex-wrap justify-center gap-2">
                <Button onClick={onRestart}>
                    <RotateCcw /> Play again
                </Button>
                {share}
            </div>
            {guest && (
                <div className="mt-1 flex max-w-60 flex-col items-center gap-2">
                    <p className="text-xs text-indigo-200">
                        Sign up to save your bests, get on the leaderboard and
                        battle real players 1v1.
                    </p>
                    <Button
                        size="sm"
                        className="bg-amber-400 font-bold text-amber-950 hover:bg-amber-300"
                        asChild
                    >
                        <Link href={register()}>
                            <Swords /> Sign up free
                        </Link>
                    </Button>
                </div>
            )}
        </div>
    );
}

function HudStat({
    label,
    value,
    compact = false,
}: {
    label: string;
    value: string | number;
    compact?: boolean;
}) {
    return (
        <div
            className={cn(
                'rounded-xl border bg-card shadow-sm dark:bg-gradient-to-b dark:from-white/[0.04] dark:to-transparent',
                compact ? 'px-2.5 py-1.5' : 'px-3 py-2.5',
            )}
        >
            <div className="truncate text-[11px] font-semibold tracking-wider text-violet-500 uppercase dark:text-violet-300">
                {label}
            </div>
            <div
                className={cn(
                    'font-black tracking-tight tabular-nums',
                    compact ? 'text-base' : 'text-xl',
                )}
            >
                {value}
            </div>
        </div>
    );
}
