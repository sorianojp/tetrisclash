import type { BotStyle } from './brain';

/** A bot's side of a live duel (BotRunnerController::work). */
export type DuelJob = {
    duelId: number;
    botId: number;
    seed: number;
    mode: 'battle' | 'race';
    startsAt: number;
    endsAt: number;
    playerIds: [number, number];
    style: BotStyle;
};

export type InviteJob = {
    code: string;
    botId: number;
    expiresAt: number;
    style: BotStyle;
};

export type Work = {
    enabled: boolean;
    serverNow: number;
    duels: DuelJob[];
    invites: InviteJob[];
    /** Online bots with nothing to do: free to practice. */
    idle: { botId: number; style: BotStyle }[];
};

/** The duel as the server reports it (Duel::toClient). */
export type DuelState = {
    kos: Record<number, number>;
    winnerId: number | null;
    finished: boolean;
};

/**
 * Talks to the app's internal bot API (routes/web.php, internal/bots), acting for bots.
 */
export class Api {
    constructor(
        private readonly baseUrl: string,
        private readonly token: string,
    ) {}

    work(): Promise<Work> {
        return this.request('GET', 'work');
    }

    /** Sign a channel subscription as the bot. */
    auth(
        botId: number,
        socketId: string,
        channelName: string,
    ): Promise<{ auth: string; channel_data?: string }> {
        return this.request('POST', `${botId}/auth`, {
            socket_id: socketId,
            channel_name: channelName,
        });
    }

    heartbeat(
        botId: number,
        duelId: number,
        linesSent: number,
        lines: number,
    ): Promise<DuelState> {
        return this.request('POST', `${botId}/duels/${duelId}/heartbeat`, {
            lines_sent: linesSent,
            lines,
        });
    }

    knockOut(
        botId: number,
        duelId: number,
        linesSent: number,
    ): Promise<DuelState> {
        return this.request('POST', `${botId}/duels/${duelId}/ko`, {
            lines_sent: linesSent,
        });
    }

    replay(botId: number, duelId: number, data: string): Promise<void> {
        return this.request('POST', `${botId}/duels/${duelId}/replay`, {
            data,
        });
    }

    /** Keep a busy bot showing as online. */
    seen(botId: number): Promise<void> {
        return this.request('POST', `${botId}/seen`);
    }

    practice(
        botId: number,
        mode: string,
        value: number,
        replay: string | null,
    ): Promise<void> {
        return this.request('POST', `${botId}/practice`, {
            mode,
            value,
            replay,
        });
    }

    achievement(botId: number, key: string): Promise<void> {
        return this.request('POST', `${botId}/achievements`, { key });
    }

    acceptInvite(
        botId: number,
        code: string,
    ): Promise<{ duelId: number | null }> {
        return this.request('POST', `${botId}/invites/${code}/accept`);
    }

    declineInvite(botId: number, code: string): Promise<void> {
        return this.request('POST', `${botId}/invites/${code}/decline`);
    }

    private async request<T>(
        method: string,
        path: string,
        body?: Record<string, unknown>,
    ): Promise<T> {
        const response = await fetch(`${this.baseUrl}/internal/bots/${path}`, {
            method,
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.token}`,
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
            throw new Error(`${method} ${path} failed with ${response.status}`);
        }

        return (
            response.status === 204 ? undefined : await response.json()
        ) as T;
    }
}
