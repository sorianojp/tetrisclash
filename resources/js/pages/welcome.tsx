import { Head, Link, usePage } from '@inertiajs/react';
import { Swords, Timer, Trophy, Zap } from 'lucide-react';
import AppLogoIcon from '@/components/app-logo-icon';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { dashboard, login, register } from '@/routes';

const FEATURES = [
    {
        icon: Swords,
        title: 'Real-time 1v1',
        text: 'Get matched with another player and battle live. Line clears send garbage to their board.',
    },
    {
        icon: Zap,
        title: 'T-spins, combos, B2B',
        text: 'Modern rules with SRS rotation, hold and 5-piece preview, using the Tetris Battle attack table.',
    },
    {
        icon: Trophy,
        title: 'Ranked ladder',
        text: 'Win to climb the Elo leaderboard. Three KOs ends the match early.',
    },
    {
        icon: Timer,
        title: '40-line sprint',
        text: 'Warm up solo and chase your personal best.',
    },
];

/** A decorative board: rows of blocks with the classic palette. */
const MINI_BOARD = [
    '..........',
    '....33....',
    '...333....',
    '..........',
    '.......1..',
    '6......1..',
    '66.....1.2',
    '6.44...122',
    '5444.77722',
    '55588.7888',
    '8588888.88',
];

const COLORS: Record<string, string> = {
    '1': 'bg-cyan-400',
    '2': 'bg-yellow-400',
    '3': 'bg-purple-500',
    '4': 'bg-lime-500',
    '5': 'bg-rose-500',
    '6': 'bg-blue-500',
    '7': 'bg-orange-400',
    '8': 'bg-slate-500',
};

export default function Welcome() {
    const { auth, name } = usePage().props;

    return (
        <>
            <Head title="Online Tetris battles" />
            <div className="min-h-screen bg-[#070a17] text-white">
                <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
                    <div className="flex items-center gap-2 font-bold">
                        <AppLogoIcon className="h-4 fill-purple-400" />
                        {name}
                    </div>
                    <nav className="flex items-center gap-2">
                        {auth.user ? (
                            <Button asChild>
                                <Link href={dashboard()}>Go to lobby</Link>
                            </Button>
                        ) : (
                            <>
                                <Button
                                    variant="ghost"
                                    className="text-white hover:bg-white/10 hover:text-white"
                                    asChild
                                >
                                    <Link href={login()}>Log in</Link>
                                </Button>
                                <Button
                                    className="bg-amber-400 text-amber-950 hover:bg-amber-300"
                                    asChild
                                >
                                    <Link href={register()}>Sign up</Link>
                                </Button>
                            </>
                        )}
                    </nav>
                </header>

                <main className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-[1.2fr_1fr] lg:py-20">
                    <section>
                        <p className="text-sm font-semibold tracking-[0.25em] text-fuchsia-300 uppercase">
                            Online multiplayer Tetris
                        </p>
                        <h1 className="mt-3 text-5xl font-black tracking-tight sm:text-6xl">
                            Clear lines.
                            <br />
                            <span className="bg-gradient-to-r from-amber-300 via-rose-400 to-fuchsia-400 bg-clip-text text-transparent">
                                Bury your rival.
                            </span>
                        </h1>
                        <p className="mt-5 max-w-lg text-lg text-indigo-200">
                            Two-minute head-to-head battles, like the Tetris
                            Battle days. Send garbage, pull off T-spins and
                            chain combos to knock your opponent out.
                        </p>
                        <div className="mt-8 flex flex-wrap gap-3">
                            <Button
                                size="lg"
                                className="bg-amber-400 font-bold text-amber-950 hover:bg-amber-300"
                                asChild
                            >
                                <Link
                                    href={auth.user ? dashboard() : register()}
                                >
                                    <Swords /> Play now
                                </Link>
                            </Button>
                        </div>
                    </section>

                    <div
                        aria-hidden
                        className="mx-auto rounded-2xl bg-[#0d1224] p-3 shadow-2xl ring-1 ring-indigo-500/30"
                    >
                        <div className="grid grid-cols-10 gap-[2px]">
                            {MINI_BOARD.join('')
                                .split('')
                                .map((cell, i) => (
                                    <div
                                        key={i}
                                        className={cn(
                                            'size-5 rounded-[3px] sm:size-6',
                                            cell === '.'
                                                ? 'bg-white/[0.03]'
                                                : cn(
                                                      COLORS[cell],
                                                      'shadow-[inset_0_3px_0_rgba(255,255,255,0.35),inset_0_-3px_0_rgba(0,0,0,0.25)]',
                                                  ),
                                        )}
                                    />
                                ))}
                        </div>
                    </div>
                </main>

                <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-20 sm:grid-cols-2 lg:grid-cols-4">
                    {FEATURES.map(({ icon: Icon, title, text }) => (
                        <div
                            key={title}
                            className="rounded-xl border border-white/10 bg-white/[0.03] p-5"
                        >
                            <Icon className="size-5 text-amber-300" />
                            <h2 className="mt-3 font-bold">{title}</h2>
                            <p className="mt-1 text-sm text-indigo-200">
                                {text}
                            </p>
                        </div>
                    ))}
                </section>
            </div>
        </>
    );
}
