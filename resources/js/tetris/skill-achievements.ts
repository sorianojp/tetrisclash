import type { ClearInfo } from './engine';

/** Skill achievements the game reports (App\Support\Achievements::REPORTED_BY_CLIENT). */
export type SkillAchievement =
    | 'tetris'
    | 'tspin'
    | 'back_to_back'
    | 'combo_10'
    | 'perfect_clear';

/** The skill achievements a line clear earned. */
export function skillAchievementsFor(info: ClearInfo): SkillAchievement[] {
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

    return earned;
}
