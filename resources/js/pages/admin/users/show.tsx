import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    Ban,
    BatteryCharging,
    ExternalLink,
    Eye,
    Film,
    RotateCcw,
    Save,
    ShieldCheck,
    Trash2,
    Trophy,
} from 'lucide-react';
import type { FormEvent } from 'react';
import { AdminHeader, adminBreadcrumb } from '@/components/admin/admin-header';
import { ConfirmAction } from '@/components/admin/confirm-action';
import { UserBadges } from '@/components/admin/user-badges';
import InputError from '@/components/input-error';
import { DuelHistory } from '@/components/tetris/duel-history';
import type { DuelSummary } from '@/components/tetris/duel-history';
import { RankBadge } from '@/components/tetris/rank-badge';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { destroy as deleteRun } from '@/routes/admin/practice/runs';
import {
    ban,
    energy as setEnergy,
    index as usersIndex,
    stats as setStats,
    unban,
} from '@/routes/admin/users';
import {
    destroy as revokeAchievement,
    store as grantAchievement,
} from '@/routes/admin/users/achievements';
import { destroy as resetRecord } from '@/routes/admin/users/records';
import { watch as watchDuel } from '@/routes/duels';
import { show as showPlayer } from '@/routes/players';
import { replay as runReplay } from '@/routes/practice';
import { show as showTournament } from '@/routes/tournaments';
import {
    PRACTICE_MODES,
    RECORD_MODES,
    formatRecord,
} from '@/tetris/practice-modes';
import type { PracticeRecords, RecordMode } from '@/tetris/practice-modes';

type Props = {
    user: {
        id: number;
        name: string;
        email: string | null;
        verified: boolean;
        isAdmin: boolean;
        isBot: boolean;
        ban: { at: string | null; reason: string | null } | null;
        joined: string | null;
        lastSeen: string | null;
        rating: number;
        wins: number;
        losses: number;
        xp: number;
        rank: RankProgress;
        energy: { current: number; max: number };
    };
    records: PracticeRecords;
    runs: {
        id: number;
        mode: RecordMode;
        value: number;
        hasReplay: boolean;
        createdAt: string | null;
    }[];
    achievements: {
        key: string;
        title: string;
        group: string;
        unlocked: boolean;
    }[];
    recentDuels: DuelSummary[];
    activeDuelId: number | null;
    tournamentId: number | null;
    canBan: boolean;
};

export default function AdminUser({
    user,
    records,
    runs,
    achievements,
    recentDuels,
    activeDuelId,
    tournamentId,
    canBan,
}: Props) {
    return (
        <>
            <Head title={`${user.name} · Admin`} />
            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-4">
                <AdminHeader
                    title={user.name}
                    description={[
                        user.email,
                        user.joined && `joined ${user.joined}`,
                        user.lastSeen ? `seen ${user.lastSeen}` : 'never seen',
                    ]
                        .filter(Boolean)
                        .join(' · ')}
                    actions={
                        <div className="flex flex-wrap gap-2">
                            {activeDuelId !== null && (
                                <Button variant="outline" size="sm" asChild>
                                    <Link href={watchDuel(activeDuelId)}>
                                        <Eye /> Watch live duel
                                    </Link>
                                </Button>
                            )}
                            {tournamentId !== null && (
                                <Button variant="outline" size="sm" asChild>
                                    <Link href={showTournament(tournamentId)}>
                                        <Trophy /> Tournament
                                    </Link>
                                </Button>
                            )}
                            <Button variant="outline" size="sm" asChild>
                                <Link href={showPlayer(user.id)}>
                                    <ExternalLink /> Public profile
                                </Link>
                            </Button>
                        </div>
                    }
                />

                <div className="flex flex-wrap items-center gap-2">
                    <RankBadge progress={user.rank} compact />
                    <UserBadges user={{ ...user, banned: user.ban !== null }} />
                </div>

                <BanCard user={user} canBan={canBan} />

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <StatsCard user={user} />
                    <EnergyCard user={user} />
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>Practice records</CardTitle>
                        <CardDescription>
                            Resetting a record also deletes every run (and
                            replay) in that mode.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ul className="flex flex-col gap-1 text-sm">
                            {RECORD_MODES.map((mode) => (
                                <li
                                    key={mode}
                                    className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
                                >
                                    <span className="w-24 font-medium">
                                        {PRACTICE_MODES[mode].label}
                                    </span>
                                    <span className="flex-1 tabular-nums">
                                        {records[mode] === null ? (
                                            <span className="text-muted-foreground">
                                                No record
                                            </span>
                                        ) : (
                                            formatRecord(mode, records[mode])
                                        )}
                                    </span>
                                    {records[mode] !== null && (
                                        <ConfirmAction
                                            action={resetRecord({
                                                user: user.id,
                                                mode,
                                            })}
                                            title={`Reset ${user.name}'s ${PRACTICE_MODES[mode].label} record?`}
                                            description="Their record and every run in this mode are deleted, on the all-time and weekly boards."
                                            confirmLabel="Reset record"
                                        >
                                            <RotateCcw /> Reset
                                        </ConfirmAction>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>Recent practice runs</CardTitle>
                            <CardDescription>
                                Deleting their best run drops the record to
                                their next best.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {runs.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    No runs.
                                </p>
                            ) : (
                                <ul className="flex flex-col gap-1 text-sm">
                                    {runs.map((run) => (
                                        <li
                                            key={run.id}
                                            className="flex items-center gap-2"
                                        >
                                            <span className="w-20 text-muted-foreground">
                                                {PRACTICE_MODES[run.mode].label}
                                            </span>
                                            <span className="flex-1 font-medium tabular-nums">
                                                {formatRecord(
                                                    run.mode,
                                                    run.value,
                                                )}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {run.createdAt}
                                            </span>
                                            {run.hasReplay && (
                                                <Link
                                                    href={runReplay(run.id)}
                                                    className="text-muted-foreground hover:text-foreground"
                                                    title="Watch replay"
                                                >
                                                    <Film className="size-4" />
                                                </Link>
                                            )}
                                            <ConfirmAction
                                                action={deleteRun(run.id)}
                                                title="Delete this run?"
                                                confirmLabel="Delete run"
                                                variant="ghost"
                                            >
                                                <Trash2 />
                                                <span className="sr-only">
                                                    Delete
                                                </span>
                                            </ConfirmAction>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Recent duels</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <DuelHistory
                                duels={recentDuels}
                                empty="No finished duels."
                            />
                        </CardContent>
                    </Card>
                </div>

                <AchievementsCard
                    userId={user.id}
                    achievements={achievements}
                />
            </div>
        </>
    );
}

AdminUser.layout = {
    breadcrumbs: [
        adminBreadcrumb,
        { title: 'Users', href: usersIndex() },
        // The current page crumb isn't rendered as a link.
        { title: 'User', href: usersIndex() },
    ],
};

function BanCard({ user, canBan }: { user: Props['user']; canBan: boolean }) {
    if (user.ban !== null) {
        return (
            <Card className="border-destructive/50 bg-destructive/5">
                <CardContent className="flex flex-wrap items-center gap-3">
                    <Ban className="size-5 text-destructive" />
                    <div className="flex-1 text-sm">
                        <p className="font-semibold">
                            Banned {user.ban.at && `on ${user.ban.at}`}
                        </p>
                        <p className="text-muted-foreground">
                            {user.ban.reason ?? 'No reason given.'}
                        </p>
                    </div>
                    <ConfirmAction
                        action={unban(user.id)}
                        title={`Unban ${user.name}?`}
                        description="They can sign in and play again, and show up on the boards."
                        confirmLabel="Unban"
                        destructive={false}
                    >
                        <ShieldCheck /> Unban
                    </ConfirmAction>
                </CardContent>
            </Card>
        );
    }

    if (!canBan) {
        return null;
    }

    return (
        <div>
            <ConfirmAction
                action={ban(user.id)}
                title={`Ban ${user.name}?`}
                description="They're signed out right away and can't sign back in. A match in progress is forfeited, they leave any tournament that hasn't started, and they're hidden from the leaderboards and the online list."
                confirmLabel="Ban"
                reasonLabel="Reason (shown to them)"
                variant="destructive"
            >
                <Ban /> Ban player
            </ConfirmAction>
        </div>
    );
}

function StatsCard({ user }: { user: Props['user'] }) {
    const form = useForm({ rating: user.rating, xp: user.xp });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.patch(setStats(user.id).url, { preserveScroll: true });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Rating &amp; XP</CardTitle>
                <CardDescription>
                    {user.wins}W {user.losses}L. Themes unlock by rank, so raise
                    XP to unlock them.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={submit} className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="grid gap-2">
                            <Label htmlFor="rating">Rating</Label>
                            <Input
                                id="rating"
                                type="number"
                                min={0}
                                max={5000}
                                value={form.data.rating}
                                onChange={(event) =>
                                    form.setData(
                                        'rating',
                                        Number(event.target.value),
                                    )
                                }
                            />
                            <InputError message={form.errors.rating} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="xp">XP</Label>
                            <Input
                                id="xp"
                                type="number"
                                min={0}
                                value={form.data.xp}
                                onChange={(event) =>
                                    form.setData(
                                        'xp',
                                        Number(event.target.value),
                                    )
                                }
                            />
                            <InputError message={form.errors.xp} />
                        </div>
                    </div>
                    <Button
                        type="submit"
                        className="self-start"
                        disabled={form.processing || !form.isDirty}
                    >
                        <Save /> Save
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}

function EnergyCard({ user }: { user: Props['user'] }) {
    const set = (amount: number) =>
        router.patch(
            setEnergy(user.id).url,
            { energy: amount },
            { preserveScroll: true },
        );

    return (
        <Card>
            <CardHeader>
                <CardTitle>Energy</CardTitle>
                <CardDescription>
                    {user.energy.current} of {user.energy.max} for ranked
                    matches.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-1">
                    {Array.from({ length: user.energy.max + 1 }, (_, i) => (
                        <Button
                            key={i}
                            size="sm"
                            variant={
                                i === user.energy.current
                                    ? 'default'
                                    : 'outline'
                            }
                            className="w-10 tabular-nums"
                            onClick={() => set(i)}
                        >
                            {i}
                        </Button>
                    ))}
                </div>
                <Button
                    variant="secondary"
                    className="self-start"
                    disabled={user.energy.current >= user.energy.max}
                    onClick={() => set(user.energy.max)}
                >
                    <BatteryCharging /> Refill
                </Button>
            </CardContent>
        </Card>
    );
}

function AchievementsCard({
    userId,
    achievements,
}: {
    userId: number;
    achievements: Props['achievements'];
}) {
    const toggle = (achievement: Props['achievements'][number]) =>
        achievement.unlocked
            ? router.delete(
                  revokeAchievement({ user: userId, key: achievement.key }).url,
                  { preserveScroll: true },
              )
            : router.post(
                  grantAchievement(userId).url,
                  { key: achievement.key },
                  { preserveScroll: true },
              );

    const unlocked = achievements.filter((a) => a.unlocked).length;

    return (
        <Card>
            <CardHeader>
                <CardTitle>Achievements</CardTitle>
                <CardDescription>
                    {unlocked} of {achievements.length} unlocked. Click one to
                    grant or remove it.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-wrap gap-2">
                    {achievements.map((achievement) => (
                        <button
                            key={achievement.key}
                            type="button"
                            onClick={() => toggle(achievement)}
                            title={`${achievement.group}: click to ${achievement.unlocked ? 'remove' : 'grant'}`}
                            className={cn(
                                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                                achievement.unlocked
                                    ? 'border-amber-500/40 bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-300'
                                    : 'text-muted-foreground hover:bg-muted',
                            )}
                        >
                            {achievement.title}
                        </button>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
