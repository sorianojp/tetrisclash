import { sendJson } from '@/lib/api';
import { store as storeAchievement } from '@/routes/achievements';
import type { ClearInfo } from './engine';

/** Skill achievements the game reports (App\Support\Achievements::REPORTED_BY_CLIENT). */
type SkillAchievement =
    | 'tetris'
    | 'tspin'
    | 'back_to_back'
    | 'combo_10'
    | 'perfect_clear';

/** Reported this page load; the server ignores repeats, this just saves requests. */
const reported = new Set<SkillAchievement>();

/** Report any skill achievement a line clear earned. */
export function reportClearAchievements(info: ClearInfo): void {
    const earned: SkillAchievement[] = [];

    if (info.lines === 4) {
        earned.push('tetris');
    }

    if (info.tSpin === 'full' && info.lines > 0) {
        earned.push('tspin');
    }

    if (info.backToBack) {
        earned.push('back_to_back');
    }

    if (info.combo >= 10) {
        earned.push('combo_10');
    }

    if (info.perfectClear) {
        earned.push('perfect_clear');
    }

    for (const key of earned) {
        if (!reported.has(key)) {
            reported.add(key);
            void sendJson(storeAchievement(), { key }).catch(() =>
                reported.delete(key),
            );
        }
    }
}
