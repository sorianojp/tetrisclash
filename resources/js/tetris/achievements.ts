import { sendJson } from '@/lib/api';
import { store as storeAchievement } from '@/routes/achievements';
import type { ClearInfo } from './engine';
import { skillAchievementsFor } from './skill-achievements';
import type { SkillAchievement } from './skill-achievements';

/** Reported this page load; the server ignores repeats, this just saves requests. */
const reported = new Set<SkillAchievement>();

/** Report any skill achievement a line clear earned. */
export function reportClearAchievements(info: ClearInfo): void {
    for (const key of skillAchievementsFor(info)) {
        if (!reported.has(key)) {
            reported.add(key);
            void sendJson(storeAchievement(), { key }).catch(() =>
                reported.delete(key),
            );
        }
    }
}
