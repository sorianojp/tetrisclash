import {
    Award,
    Crown,
    Flame,
    Gem,
    Lock,
    Medal,
    Mountain,
    Pickaxe,
    RotateCw,
    Shield,
    Sparkles,
    Swords,
    Timer,
    TrendingUp,
    Trophy,
    Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** One achievement as sent by the server (App\Support\Achievements::forPlayer). */
export type AchievementStatus = {
    key: string;
    title: string;
    description: string;
    group: string;
    /** Formatted date, or null while locked. */
    unlockedAt: string | null;
};

const ICONS: Record<string, LucideIcon> = {
    first_win: Swords,
    wins_10: Medal,
    wins_50: Shield,
    duels_100: Award,
    flawless: Gem,
    race_win: Zap,
    rank_10: TrendingUp,
    rank_25: TrendingUp,
    rank_50: Mountain,
    champion: Crown,
    sprint_60: Timer,
    sprint_30: Timer,
    dig_30: Pickaxe,
    ultra_50k: Trophy,
    survival_180: Shield,
    zen_250k: Sparkles,
    tetris: Sparkles,
    tspin: RotateCw,
    back_to_back: Flame,
    combo_10: Flame,
    perfect_clear: Gem,
};

/** Achievements grouped by kind, unlocked ones in colour. */
export function AchievementList({
    achievements,
}: {
    achievements: AchievementStatus[];
}) {
    const groups = [...new Set(achievements.map((a) => a.group))];

    return (
        <div className="flex flex-col gap-4">
            {groups.map((group) => (
                <section key={group}>
                    <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                        {group}
                    </h3>
                    <ul className="grid gap-2 sm:grid-cols-2">
                        {achievements
                            .filter((a) => a.group === group)
                            .map((achievement) => {
                                const Icon = ICONS[achievement.key] ?? Trophy;
                                const unlocked =
                                    achievement.unlockedAt !== null;

                                return (
                                    <li
                                        key={achievement.key}
                                        className={cn(
                                            'flex items-center gap-3 rounded-lg border p-2.5',
                                            !unlocked && 'opacity-55',
                                        )}
                                        title={
                                            unlocked
                                                ? `Unlocked ${achievement.unlockedAt}`
                                                : 'Locked'
                                        }
                                    >
                                        <span
                                            className={cn(
                                                'flex size-9 shrink-0 items-center justify-center rounded-md',
                                                unlocked
                                                    ? 'bg-amber-400/20 text-amber-600 dark:text-amber-300'
                                                    : 'bg-muted text-muted-foreground',
                                            )}
                                        >
                                            {unlocked ? (
                                                <Icon className="size-5" />
                                            ) : (
                                                <Lock className="size-4" />
                                            )}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-semibold">
                                                {achievement.title}
                                            </span>
                                            <span className="block text-xs text-muted-foreground">
                                                {achievement.description}
                                            </span>
                                        </span>
                                    </li>
                                );
                            })}
                    </ul>
                </section>
            ))}
        </div>
    );
}
