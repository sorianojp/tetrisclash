import Pusher from 'pusher-js';
import type { Channel, PresenceChannel } from 'pusher-js';
import type { Game } from '../resources/js/tetris/engine';
import { ReplayRecorder, encodeReplay } from '../resources/js/tetris/replay';
import type { Api, DuelJob, DuelState } from './api';
import { BotPlayer } from './player';
import type { SkillReporter } from './skills';

export type RealtimeConfig = {
    key: string;
    host: string;
    port: number;
    scheme: 'http' | 'https';
};

/** These mirror resources/js/pages/duel.tsx, so a bot plays by the same rules as a person. */
const RACE_LINES = 40;
const KO_PAUSE_MS = 1500;
const BOARD_SYNC_MS = 100;
const MAX_ATTACK_PER_SECOND = 4;
const ATTACK_ALLOWANCE = 10;
const TICK_MS = 33;
const EMOTE_COOLDOWN_MS = 1500;
/** Indexes into EMOTES (resources/js/components/tetris/emotes.tsx). */
const EMOTE = { gg: 0, nice: 1, fire: 2, shock: 3, sweat: 4, wave: 5 };

/**
 * One bot playing one duel: its own game (same seed and engine as the opponent's browser),
 * its own realtime connection, and the same whispers, heartbeats and reports a player's
 * duel page makes.
 */
export class DuelSession {
    finished = false;
    /** Stopped and disconnected; the runner can forget it. */
    done = false;

    private readonly player: BotPlayer;
    private readonly game: Game;
    private readonly pusher: Pusher;
    private duelChannel: Channel | null = null;
    private watchChannel: Channel | null = null;
    private readonly recorder = new ReplayRecorder();
    private readonly random = Math.random;
    private timers: ReturnType<typeof setInterval>[] = [];
    private knockedOut = false;
    private incomingTotal = 0;
    private lastBoardKey = '';
    private lastBoardAt = 0;
    private lastEmoteAt = 0;
    private greeted = false;
    private polling = false;
    private lastTick = Date.now();

    constructor(
        private readonly job: DuelJob,
        private readonly api: Api,
        realtime: RealtimeConfig,
        /** Server clock minus ours. */
        private readonly clockOffset: number,
        private readonly log: (message: string) => void,
        private readonly skills: SkillReporter,
    ) {
        this.player = new BotPlayer(
            {
                seed: job.seed,
                gravity: (elapsed) => Math.max(150, 1000 - elapsed / 150),
                events: {
                    onAttack: (lines) => this.onAttack(lines),
                    onClear: (info) => {
                        this.skills.report(this.job.botId, info);

                        if (
                            this.job.mode === 'race' &&
                            this.game.stats.lines >= RACE_LINES
                        ) {
                            void this.heartbeat();
                        }

                        if (info.attack >= 4) {
                            this.maybeEmote(EMOTE.fire, 0.15);
                        }
                    },
                    onTopOut: () => this.onTopOut(),
                },
            },
            job.style,
        );
        this.game = this.player.game;

        this.pusher = new Pusher(realtime.key, {
            cluster: 'mt1',
            wsHost: realtime.host,
            wsPort: realtime.port,
            wssPort: realtime.port,
            forceTLS: realtime.scheme === 'https',
            enabledTransports: ['ws', 'wss'],
            channelAuthorization: {
                endpoint: '',
                transport: 'ajax',
                customHandler: ({ socketId, channelName }, callback) => {
                    this.api
                        .auth(job.botId, socketId, channelName)
                        .then((data) => callback(null, data))
                        .catch((error: Error) => callback(error, null));
                },
            },
        });
    }

    get key(): string {
        return `${this.job.duelId}:${this.job.botId}`;
    }

    start(): void {
        this.log(`joining duel ${this.job.duelId} (${this.job.mode})`);

        this.duelChannel = this.pusher.subscribe(
            `presence-duel.${this.job.duelId}`,
        );
        this.watchChannel = this.pusher.subscribe(
            `presence-watch.duel.${this.job.duelId}`,
        );

        this.duelChannel.bind(
            'client-attack',
            ({ lines }: { lines: unknown }) => this.onIncoming(lines),
        );
        this.duelChannel.bind('client-emote', ({ e }: { e: unknown }) =>
            this.onOpponentEmote(e),
        );
        this.duelChannel.bind('App\\Events\\DuelUpdated', (state: DuelState) =>
            this.apply(state),
        );

        this.timers.push(
            setInterval(() => this.tick(), TICK_MS),
            setInterval(() => void this.heartbeat(), 3000),
        );
        void this.heartbeat();
    }

    stop(): void {
        this.timers.forEach(clearInterval);
        this.timers = [];
        this.pusher.disconnect();
        this.done = true;
    }

    private now(): number {
        return Date.now() + this.clockOffset;
    }

    private tick(): void {
        const now = this.now();
        const dt = Math.min(100, Date.now() - this.lastTick);
        this.lastTick = Date.now();

        if (this.finished) {
            return;
        }

        const playing = now >= this.job.startsAt && now < this.job.endsAt;

        if (playing && !this.greeted) {
            this.greeted = true;
            this.maybeEmote(EMOTE.wave, 0.2);
        }

        this.game.paused = !playing || this.knockedOut;
        this.game.update(dt, false);

        if (playing && !this.knockedOut) {
            this.player.act(now);
        }

        this.streamBoard(now);

        // Once time's up, poll quickly until the server settles the result.
        if (now >= this.job.endsAt && !this.polling) {
            this.polling = true;
            this.timers.push(setInterval(() => void this.heartbeat(), 1000));
        }
    }

    private streamBoard(now: number): void {
        const board = {
            s: this.game.snapshot(),
            p: this.game.pendingGarbageTotal,
            l: this.game.stats.linesSent,
            c: this.game.stats.lines,
        };
        const key = `${board.s}|${board.p}|${board.l}|${board.c}`;

        if (now >= this.job.startsAt) {
            this.recorder.capture(
                now - this.job.startsAt,
                board.s,
                board.p,
                board.l,
                board.c,
            );
        }

        if (
            Date.now() - this.lastBoardAt < BOARD_SYNC_MS ||
            (key === this.lastBoardKey && Date.now() - this.lastBoardAt < 1000)
        ) {
            return;
        }

        this.duelChannel?.trigger('client-board', board);

        // Nobody watching: skip the spectator copy (a new spectator gets the board
        // within a second, from the periodic resend).
        if (this.spectators() > 0) {
            this.watchChannel?.trigger('client-board', {
                ...board,
                u: this.job.botId,
            });
        }
        this.lastBoardKey = key;
        this.lastBoardAt = Date.now();
    }

    /** Members of the spectator channel who aren't one of the two players. */
    private spectators(): number {
        const members = (this.watchChannel as PresenceChannel | null)?.members;
        let count = 0;

        members?.each((member: { id: string }) => {
            if (!this.job.playerIds.includes(Number(member.id))) {
                count++;
            }
        });

        return count;
    }

    private onAttack(lines: number): void {
        if (this.job.mode === 'battle') {
            this.duelChannel?.trigger('client-attack', { lines });
        }
    }

    /** Garbage from the opponent, capped like the duel page caps it. */
    private onIncoming(lines: unknown): void {
        if (this.job.mode === 'race' || this.finished) {
            return;
        }

        const played = Math.max(0, (this.now() - this.job.startsAt) / 1000);
        const budget =
            ATTACK_ALLOWANCE +
            played * MAX_ATTACK_PER_SECOND -
            this.incomingTotal;
        const incoming = Math.floor(
            Math.max(0, Math.min(20, Number(lines) || 0, budget)),
        );

        this.incomingTotal += incoming;
        this.game.receiveGarbage(incoming);
    }

    private onTopOut(): void {
        this.knockedOut = true;
        this.player.reset();
        this.maybeEmote(EMOTE.shock, 0.25);

        if (this.job.mode === 'battle') {
            void this.api
                .knockOut(
                    this.job.botId,
                    this.job.duelId,
                    this.game.stats.linesSent,
                )
                .then((state) => this.apply(state))
                .catch(() => {});
        }

        setTimeout(() => {
            this.game.clearAfterKnockOut();
            this.knockedOut = false;
        }, KO_PAUSE_MS);
    }

    private async heartbeat(): Promise<void> {
        if (this.finished) {
            return;
        }

        try {
            this.apply(
                await this.api.heartbeat(
                    this.job.botId,
                    this.job.duelId,
                    this.game.stats.linesSent,
                    this.game.stats.lines,
                ),
            );
        } catch {
            // A missed heartbeat is fine; the next one catches up.
        }
    }

    private apply(state: DuelState): void {
        if (!state.finished || this.finished) {
            return;
        }

        this.finished = true;
        this.game.paused = true;
        this.log(
            `duel ${this.job.duelId} over: ${state.winnerId === this.job.botId ? 'won' : state.winnerId === null ? 'draw' : 'lost'}`,
        );

        const snapshot = this.game.snapshot();
        this.recorder.capture(
            this.now() - this.job.startsAt,
            snapshot,
            this.game.pendingGarbageTotal,
            this.game.stats.linesSent,
            this.game.stats.lines,
            true,
        );

        setTimeout(
            () =>
                this.maybeEmote(
                    EMOTE.gg,
                    0.3 + this.job.style.chatty * 0.6,
                    true,
                ),
            800 + this.random() * 1700,
        );

        void encodeReplay(this.recorder.frames)
            .then((data) =>
                data
                    ? this.api.replay(this.job.botId, this.job.duelId, data)
                    : undefined,
            )
            .catch(() => {});

        // Linger a moment, like someone reading the result, then leave.
        setTimeout(() => this.stop(), 6000 + this.random() * 4000);
    }

    private onOpponentEmote(e: unknown): void {
        if (e === EMOTE.gg && this.finished) {
            this.maybeEmote(EMOTE.gg, 0.5 + this.job.style.chatty * 0.5, true);
        } else if (!this.finished) {
            this.maybeEmote(
                this.random() < 0.5 ? EMOTE.sweat : EMOTE.nice,
                0.25,
            );
        }
    }

    /** Send an emote with a chance scaled by how chatty this bot is. */
    private maybeEmote(index: number, chance: number, flat = false): void {
        const odds = flat ? chance : chance * this.job.style.chatty * 2;

        if (
            this.random() >= odds ||
            Date.now() - this.lastEmoteAt < EMOTE_COOLDOWN_MS
        ) {
            return;
        }

        this.lastEmoteAt = Date.now();
        setTimeout(
            () => {
                this.duelChannel?.trigger('client-emote', { e: index });
                this.watchChannel?.trigger('client-emote', {
                    e: index,
                    u: this.job.botId,
                });
            },
            300 + this.random() * 900,
        );
    }
}
