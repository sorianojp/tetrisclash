import type { ClearInfo } from '../resources/js/tetris/engine';
import { skillAchievementsFor } from '../resources/js/tetris/skill-achievements';
import type { Api } from './api';

/**
 * Reports the skill achievements (a Tetris, a T-spin…) bots earn, as a player's browser
 * does. Each is sent once per bot while the runner is up; the server ignores repeats anyway.
 */
export class SkillReporter {
    private readonly sent = new Set<string>();

    constructor(private readonly api: Api) {}

    report(botId: number, info: ClearInfo): void {
        for (const key of skillAchievementsFor(info)) {
            const id = `${botId}:${key}`;

            if (!this.sent.has(id)) {
                this.sent.add(id);
                this.api
                    .achievement(botId, key)
                    .catch(() => this.sent.delete(id));
            }
        }
    }
}
