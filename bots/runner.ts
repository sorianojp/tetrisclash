/**
 * The bot runner: plays the bots' games. It asks the app what the bots are doing (duels they
 * were matched into, invites they received) and plays each duel like a player's browser would.
 *
 *   npm run bots
 *
 * Needs APP_URL (or BOT_RUNNER_URL), BOT_RUNNER_TOKEN and the REVERB_* settings from .env.
 * BOT_PRACTICE_EVERY_SECONDS sets how often an idle bot practices (default 360).
 */
import type { ClearInfo } from '../resources/js/tetris/engine';
import { Api } from './api';
import type { InviteJob } from './api';
import type { BotStyle } from './brain';
import { playPractice } from './practice';
import type { PracticeMode } from './practice';
import { DuelSession } from './session';
import type { RealtimeConfig } from './session';
import { SkillReporter } from './skills';

const POLL_MS = 1000;
/** A duel that drops out of the work list is abandoned after this long. */
const GONE_AFTER_MS = 15_000;
/** On average, an idle online bot starts a practice run this often. */
const PRACTICE_EVERY_MS =
    Number(process.env.BOT_PRACTICE_EVERY_SECONDS ?? 360) * 1000;
/** Which modes bots practice, and how much. */
const PRACTICE_MODES: [PracticeMode, number][] = [
    ['sprint', 35],
    ['ultra', 20],
    ['dig', 20],
    ['survival', 15],
    ['zen', 10],
];

function env(name: string, fallback?: string): string {
    const value = process.env[name] ?? fallback;

    if (!value) {
        throw new Error(`Missing ${name} in the environment.`);
    }

    return value;
}

const api = new Api(
    env('BOT_RUNNER_URL', process.env.APP_URL).replace(/\/$/, ''),
    env('BOT_RUNNER_TOKEN'),
);
const realtime: RealtimeConfig = {
    key: env('REVERB_APP_KEY'),
    host: env('REVERB_HOST', '127.0.0.1'),
    port: Number(env('REVERB_PORT', '8080')),
    scheme: env('REVERB_SCHEME', 'http') === 'https' ? 'https' : 'http',
};

const sessions = new Map<string, { session: DuelSession; seenAt: number }>();
const invitesHandled = new Set<string>();
const practicing = new Set<number>();
/** How often a practicing bot pings "still here", like a player's open tab. */
const SEEN_EVERY_MS = 30_000;
let lastSeenPing = 0;
const skills = new SkillReporter(api);

const log = (message: string) =>
    console.log(`${new Date().toISOString()} ${message}`);

/**
 * Answer an invite after a human-ish pause: accept, decline, or let it lapse.
 */
function answerInvite(invite: InviteJob, clockOffset: number): void {
    invitesHandled.add(invite.code);

    const accept = Math.random() < invite.style.invites;
    const left = invite.expiresAt - (Date.now() + clockOffset);
    const delay = Math.min(left - 3000, 2500 + Math.random() * 6000);

    if (delay <= 0) {
        return;
    }

    setTimeout(() => {
        if (accept) {
            api.acceptInvite(invite.botId, invite.code)
                .then(({ duelId }) =>
                    log(
                        `bot ${invite.botId} accepted an invite (duel ${duelId})`,
                    ),
                )
                .catch(() => {});
        } else if (Math.random() < 0.5) {
            api.declineInvite(invite.botId, invite.code).catch(() => {});
        }
        // Otherwise it just lapses, like an unanswered invite.
    }, delay);
}

function pickMode(): PracticeMode {
    let roll = Math.random() * 100;

    for (const [mode, weight] of PRACTICE_MODES) {
        roll -= weight;

        if (roll < 0) {
            return mode;
        }
    }

    return 'sprint';
}

/**
 * Now and then, an idle bot plays a practice run. It's simulated in a moment, then handed in
 * when it would really have finished, so results (and the skill achievements along the way)
 * arrive at a human pace.
 */
function maybePractice(botId: number, style: BotStyle): void {
    if (practicing.has(botId) || Math.random() > POLL_MS / PRACTICE_EVERY_MS) {
        return;
    }

    practicing.add(botId);
    const mode = pickMode();
    const clears: ClearInfo[] = [];

    playPractice(mode, style, (info) => clears.push(info))
        .then((result) => {
            const lasted = Math.min(result?.durationMs ?? 60_000, 10 * 60_000);

            setTimeout(() => {
                clears.forEach((info) => skills.report(botId, info));

                if (result === null) {
                    practicing.delete(botId);

                    return;
                }

                api.practice(botId, result.mode, result.value, result.replay)
                    .then(() =>
                        log(`[bot ${botId}] ${result.mode}: ${result.value}`),
                    )
                    .catch((error: Error) =>
                        log(
                            `[bot ${botId}] ${result.mode} not saved: ${error.message}`,
                        ),
                    )
                    .finally(() => practicing.delete(botId));
            }, lasted);
        })
        .catch(() => practicing.delete(botId));
}

/** Keep practicing bots online, even past the end of their usual hours. */
function pingPracticing(): void {
    if (Date.now() - lastSeenPing < SEEN_EVERY_MS) {
        return;
    }

    lastSeenPing = Date.now();
    practicing.forEach((botId) => api.seen(botId).catch(() => {}));
}

async function poll(): Promise<void> {
    pingPracticing();

    const work = await api.work();
    const clockOffset = work.serverNow - Date.now();

    for (const job of work.duels) {
        const key = `${job.duelId}:${job.botId}`;
        const running = sessions.get(key);

        if (running) {
            running.seenAt = Date.now();
            continue;
        }

        const session = new DuelSession(
            job,
            api,
            realtime,
            clockOffset,
            (message) => log(`[bot ${job.botId}] ${message}`),
            skills,
        );
        sessions.set(key, { session, seenAt: Date.now() });
        session.start();
    }

    for (const [key, { session, seenAt }] of sessions) {
        if (session.done) {
            sessions.delete(key);
        } else if (!session.finished && Date.now() - seenAt > GONE_AFTER_MS) {
            // Settled or cancelled without us noticing.
            session.stop();
            sessions.delete(key);
        }
    }

    if (work.enabled) {
        for (const { botId, style } of work.idle) {
            maybePractice(botId, style);
        }

        for (const invite of work.invites) {
            if (!invitesHandled.has(invite.code)) {
                answerInvite(invite, clockOffset);
            }
        }
    }
}

async function main(): Promise<void> {
    log('bot runner started');

    for (;;) {
        try {
            await poll();
        } catch (error) {
            log(`poll failed: ${(error as Error).message}`);
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
}

void main();

process.on('SIGTERM', () => {
    sessions.forEach(({ session }) => session.stop());
    process.exit(0);
});
