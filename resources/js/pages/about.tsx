import { Head, Link, usePage } from '@inertiajs/react';
import {
    Flag,
    Gamepad2,
    Keyboard,
    LogIn,
    ShieldCheck,
    Swords,
    Trophy,
    UserPlus,
} from 'lucide-react';
import type { ReactNode } from 'react';
import AppLogoIcon from '@/components/app-logo-icon';
import { ControlsLegend } from '@/components/tetris/controls-legend';
import { RankEmblem } from '@/components/tetris/rank-emblem';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/format';
import { dashboard, home, login, register } from '@/routes';
import {
    BACK_TO_BACK_BONUS,
    COMBO_ATTACK,
    LINE_ATTACK,
    PERFECT_CLEAR_ATTACK,
    TSPIN_ATTACK,
    TSPIN_MINI_ATTACK,
} from '@/tetris/engine';
import { PRACTICE_MODES } from '@/tetris/practice-modes';
import type { PracticeMode } from '@/tetris/practice-modes';

type Props = {
    rules: {
        battleSeconds: number;
        kosToWin: number;
        raceLines: number;
        raceSeconds: number;
        ratingK: number;
        challengeMinutes: number;
        ratingRangeStart: number;
        ratingRangeGrowth: number;
        anyOpponentAfter: number;
    };
    xp: { win: number; draw: number; loss: number; perKo: number };
    ranks: {
        from: number;
        to: number;
        title: string;
        group: string;
        xp: number;
    }[];
};

const SECTIONS = [
    ['play', 'Ways to play'],
    ['attacks', 'Attacks'],
    ['ranks', 'Ranks & rating'],
    ['practice', 'Practice'],
    ['controls', 'Controls'],
    ['fair-play', 'Fair play'],
] as const;

const minutes = (seconds: number) => formatTime(seconds * 1000, false);

export default function About({ rules, xp, ranks }: Props) {
    const { auth, name } = usePage().props;

    // Combo bonus: the first combo step that sends extra garbage, and the cap.
    const firstComboBonus = COMBO_ATTACK.findIndex((lines) => lines > 0);
    const maxComboBonus = Math.max(...COMBO_ATTACK);
    const maxComboAt = COMBO_ATTACK.indexOf(maxComboBonus);

    const attacks: [string, string][] = [
        ['Single', lines(LINE_ATTACK[1])],
        ['Double', lines(LINE_ATTACK[2])],
        ['Triple', lines(LINE_ATTACK[3])],
        ['Tetris (4 lines)', lines(LINE_ATTACK[4])],
        ['T-spin single', lines(TSPIN_ATTACK[1])],
        ['T-spin double', lines(TSPIN_ATTACK[2])],
        ['T-spin triple', lines(TSPIN_ATTACK[3])],
        ['T-spin mini', `up to ${lines(Math.max(...TSPIN_MINI_ATTACK))}`],
        ['Back-to-back bonus', `+${BACK_TO_BACK_BONUS}`],
        ['Perfect clear', `+${PERFECT_CLEAR_ATTACK}`],
    ];

    const groups = ranks.reduce<Record<string, Props['ranks']>>(
        (byGroup, band) => {
            (byGroup[band.group] ??= []).push(band);

            return byGroup;
        },
        {},
    );

    return (
        <>
            <Head title="About" />
            <div className="min-h-screen bg-background text-foreground">
                <header className="border-b">
                    <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4">
                        <Link
                            href={home()}
                            className="flex items-center gap-2 font-bold"
                        >
                            <AppLogoIcon className="h-4 fill-purple-500" />
                            {name}
                        </Link>
                        <nav className="flex items-center gap-2">
                            {auth.user ? (
                                <Button size="sm" asChild>
                                    <Link href={dashboard()}>
                                        <Swords /> Go to lobby
                                    </Link>
                                </Button>
                            ) : (
                                <>
                                    <Button size="sm" variant="ghost" asChild>
                                        <Link href={login()}>
                                            <LogIn /> Log in
                                        </Link>
                                    </Button>
                                    <Button size="sm" asChild>
                                        <Link href={register()}>
                                            <UserPlus /> Sign up
                                        </Link>
                                    </Button>
                                </>
                            )}
                        </nav>
                    </div>
                </header>

                <main className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-8">
                    <section className="overflow-hidden rounded-xl bg-violet-900 p-6 text-white sm:p-8">
                        <p className="text-xs font-semibold tracking-[0.2em] text-fuchsia-200 uppercase">
                            About the game
                        </p>
                        <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
                            How {name} works
                        </h1>
                        <p className="mt-3 max-w-2xl text-indigo-100">
                            {name} is head-to-head Tetris in your browser. Clear
                            lines to send garbage to your opponent, knock them
                            out, climb the ranks, or just race your friends to
                            40 lines. Everything below is how the game really
                            plays.
                        </p>
                        <nav className="mt-5 flex flex-wrap gap-2">
                            {SECTIONS.map(([id, label]) => (
                                <a
                                    key={id}
                                    href={`#${id}`}
                                    className="rounded-full bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
                                >
                                    {label}
                                </a>
                            ))}
                        </nav>
                    </section>

                    <Section id="play" title="Ways to play" icon={<Swords />}>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <ModeCard icon={<Trophy />} title="Ranked battle">
                                Press <b>Find match</b> in the lobby to face a
                                player near your rating. Wins and losses move
                                your rating and earn XP.
                            </ModeCard>
                            <ModeCard
                                icon={<UserPlus />}
                                title="Challenge a friend"
                            >
                                Pick Battle or Race and share the link. It works
                                for {rules.challengeMinutes} minutes. Friendly
                                matches don&apos;t change rating or XP.
                            </ModeCard>
                            <ModeCard icon={<Gamepad2 />} title="Practice">
                                Five solo modes with personal bests. Great for
                                warming up before a match.
                            </ModeCard>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <RuleList
                                icon={<Swords />}
                                title="Battle"
                                rules={[
                                    `Matches last ${minutes(rules.battleSeconds)}.`,
                                    'Clearing lines sends garbage rows to your opponent.',
                                    'If your stack reaches the top, your opponent scores a KO and your board resets.',
                                    `First to ${rules.kosToWin} KOs wins on the spot.`,
                                    'When time runs out: most KOs wins, then most garbage sent. A full tie is a draw.',
                                ]}
                            />
                            <RuleList
                                icon={<Flag />}
                                title="Race"
                                rules={[
                                    `First to clear ${rules.raceLines} lines wins.`,
                                    'No garbage: it is pure speed.',
                                    'Topping out freezes and clears your board. You keep your lines but lose time.',
                                    `After ${minutes(rules.raceSeconds)}, whoever cleared the most lines wins.`,
                                    'Races are played through friend challenges.',
                                ]}
                            />
                        </div>
                    </Section>

                    <Section
                        id="attacks"
                        title="Attacks"
                        icon={<Swords />}
                        intro="Bigger and harder clears send more garbage. Your attack first cancels any garbage waiting to hit you; only what's left over reaches your opponent."
                    >
                        <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
                            <dl className="divide-y rounded-lg border text-sm">
                                {attacks.map(([clear, sent]) => (
                                    <div
                                        key={clear}
                                        className="flex justify-between gap-3 px-3 py-2"
                                    >
                                        <dt>{clear}</dt>
                                        <dd className="font-semibold tabular-nums">
                                            {sent}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                            <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                                <p>
                                    <b className="text-foreground">
                                        Back-to-back:
                                    </b>{' '}
                                    a Tetris or T-spin right after another one
                                    (with no plain clears between) adds +
                                    {BACK_TO_BACK_BONUS}.
                                </p>
                                <p>
                                    <b className="text-foreground">Combos:</b>{' '}
                                    clear lines with piece after piece to build
                                    a combo. From combo {firstComboBonus} each
                                    clear adds extra garbage, up to +
                                    {maxComboBonus} at combo {maxComboAt}.
                                </p>
                                <p>
                                    <b className="text-foreground">
                                        Perfect clear:
                                    </b>{' '}
                                    empty the whole board for +
                                    {PERFECT_CLEAR_ATTACK}.
                                </p>
                                <p>
                                    <b className="text-foreground">T-spins:</b>{' '}
                                    rotate a T piece into a tight slot as your
                                    last move before it locks.
                                </p>
                            </div>
                        </div>
                    </Section>

                    <Section
                        id="ranks"
                        title="Ranks & rating"
                        icon={<Trophy />}
                        featured
                        intro="You have two numbers. Your rank shows how far you've come; your rating shows how strong you are right now."
                    >
                        <div className="grid gap-3 sm:grid-cols-2">
                            <RuleList
                                icon={<Trophy />}
                                title="Rating"
                                rules={[
                                    'Everyone starts at 1000.',
                                    `A ranked match moves rating by up to ${rules.ratingK} points. Beating a stronger player earns more; losing to a weaker one costs more.`,
                                    'The leaderboard is sorted by rating.',
                                    `Matchmaking looks for players within ±${rules.ratingRangeStart} rating, widening by ${rules.ratingRangeGrowth} every second. After ${rules.anyOpponentAfter} seconds, anyone can be your opponent.`,
                                ]}
                            />
                            <div className="rounded-lg border p-4 text-sm">
                                <h3 className="font-semibold">
                                    XP from ranked matches
                                </h3>
                                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                                    <dt className="text-muted-foreground">
                                        Win
                                    </dt>
                                    <dd className="text-right font-semibold tabular-nums">
                                        {xp.win} XP
                                    </dd>
                                    <dt className="text-muted-foreground">
                                        Draw
                                    </dt>
                                    <dd className="text-right font-semibold tabular-nums">
                                        {xp.draw} XP
                                    </dd>
                                    <dt className="text-muted-foreground">
                                        Loss
                                    </dt>
                                    <dd className="text-right font-semibold tabular-nums">
                                        {xp.loss} XP
                                    </dd>
                                    <dt className="text-muted-foreground">
                                        Each KO you land
                                    </dt>
                                    <dd className="text-right font-semibold tabular-nums">
                                        +{xp.perKo} XP
                                    </dd>
                                    <dt className="text-muted-foreground">
                                        Forfeit or disconnect
                                    </dt>
                                    <dd className="text-right font-semibold tabular-nums">
                                        0 XP
                                    </dd>
                                </dl>
                                <p className="mt-3 text-muted-foreground">
                                    Ranks never go down. Each rank needs a bit
                                    more XP than the last.
                                </p>
                            </div>
                        </div>

                        {/* The ladder: every title's badge, group by group. */}
                        <div className="flex flex-col gap-4">
                            {Object.entries(groups).map(([group, bands]) => (
                                <div
                                    key={group}
                                    className="rounded-2xl border bg-card p-4 sm:p-5"
                                >
                                    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                                        <h3 className="text-lg font-black tracking-tight">
                                            {group}
                                        </h3>
                                        <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                                            Ranks {bands[0].from}–
                                            {bands[bands.length - 1].to}
                                        </span>
                                    </div>
                                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                                        {bands.map((band) => (
                                            <li
                                                key={band.from}
                                                className="flex flex-col items-center gap-2 rounded-xl border bg-muted/40 px-2 pt-4 pb-3 text-center dark:bg-white/[0.03]"
                                            >
                                                <RankEmblem
                                                    rank={band.from}
                                                    title={band.title}
                                                    size="xl"
                                                    showTier={false}
                                                    className="drop-shadow-[0_6px_12px_rgb(0_0_0/0.35)]"
                                                />
                                                <span className="mt-1 text-sm leading-tight font-black">
                                                    {band.title}
                                                </span>
                                                <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                                                    {band.from === band.to
                                                        ? `Rank ${band.from}`
                                                        : `Ranks ${band.from}–${band.to}`}
                                                </span>
                                                <span className="text-[11px] text-muted-foreground tabular-nums">
                                                    {band.xp.toLocaleString()}{' '}
                                                    XP
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </Section>

                    <Section
                        id="practice"
                        title="Practice modes"
                        icon={<Gamepad2 />}
                        intro="Solo modes don't affect rating or XP. Your best results are saved and shown on your profile."
                    >
                        <dl className="grid gap-3 sm:grid-cols-2">
                            {(
                                Object.entries(PRACTICE_MODES) as [
                                    PracticeMode,
                                    { label: string; goal: string },
                                ][]
                            ).map(([mode, info]) => (
                                <div
                                    key={mode}
                                    className="rounded-lg border p-3"
                                >
                                    <dt className="font-semibold">
                                        {info.label}
                                    </dt>
                                    <dd className="text-sm text-muted-foreground">
                                        {info.goal}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </Section>

                    <Section
                        id="controls"
                        title="Controls"
                        icon={<Keyboard />}
                        intro="Play with the keyboard. Press R in practice to restart instantly."
                    >
                        <div className="max-w-sm rounded-lg border p-4">
                            <ControlsLegend />
                        </div>
                    </Section>

                    <Section
                        id="fair-play"
                        title="Fair play"
                        icon={<ShieldCheck />}
                    >
                        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
                            <li>
                                The server checks every reported result against
                                what&apos;s humanly possible in the time played,
                                and ignores anything beyond it.
                            </li>
                            <li>
                                Quitting a ranked match counts as a loss and
                                earns no XP.
                            </li>
                            <li>
                                Friendly matches never touch rating or XP, so
                                there&apos;s nothing to gain by farming a
                                friend.
                            </li>
                            <li>
                                Personal bests that beat what any human has done
                                are rejected.
                            </li>
                        </ul>
                    </Section>

                    <div className="flex flex-col items-center gap-3 rounded-xl border p-6 text-center">
                        <p className="text-lg font-semibold">Ready to play?</p>
                        <Button size="lg" asChild>
                            <Link href={auth.user ? dashboard() : register()}>
                                <Swords />
                                {auth.user
                                    ? 'Go to lobby'
                                    : 'Create an account'}
                            </Link>
                        </Button>
                    </div>
                </main>

                <footer className="border-t py-6 text-center text-xs text-muted-foreground">
                    <Link href={home()} className="hover:underline">
                        {name}
                    </Link>
                </footer>
            </div>
        </>
    );
}

const lines = (count: number) => (count === 1 ? '1 line' : `${count} lines`);

function Section({
    id,
    title,
    icon,
    intro,
    featured = false,
    children,
}: {
    id: string;
    title: string;
    icon: ReactNode;
    intro?: string;
    /** A headline section: bigger title, set apart from the rest. */
    featured?: boolean;
    children: ReactNode;
}) {
    return (
        <section
            id={id}
            className={cn(
                'flex scroll-mt-6 flex-col gap-4',
                featured &&
                    'rounded-3xl border bg-muted/30 p-4 sm:p-6 dark:bg-white/[0.02]',
            )}
        >
            <div>
                <h2
                    className={cn(
                        'flex items-center gap-2 text-xl font-bold [&_svg]:size-5 [&_svg]:text-violet-500',
                        featured &&
                            'text-3xl font-black tracking-tight sm:text-4xl [&_svg]:size-8',
                    )}
                >
                    {icon}
                    {title}
                </h2>
                {intro && (
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                        {intro}
                    </p>
                )}
            </div>
            {children}
        </section>
    );
}

function ModeCard({
    icon,
    title,
    children,
}: {
    icon: ReactNode;
    title: string;
    children: ReactNode;
}) {
    return (
        <div className="rounded-lg border p-4">
            <h3 className="flex items-center gap-2 font-semibold [&_svg]:size-4 [&_svg]:text-violet-500">
                {icon}
                {title}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{children}</p>
        </div>
    );
}

function RuleList({
    icon,
    title,
    rules,
}: {
    icon: ReactNode;
    title: string;
    rules: string[];
}) {
    return (
        <div className="rounded-lg border p-4">
            <h3 className="flex items-center gap-2 font-semibold [&_svg]:size-4 [&_svg]:text-violet-500">
                {icon}
                {title}
            </h3>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
                {rules.map((rule) => (
                    <li key={rule}>{rule}</li>
                ))}
            </ul>
        </div>
    );
}
