import { Check, Flag, Swords, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PlayerEmblem } from '@/components/tetris/player-emblem';
import { RankBadge } from '@/components/tetris/rank-badge';
import type { RankProgress } from '@/components/tetris/rank-badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type Invite = {
    code: string;
    mode: 'battle' | 'race';
    expiresInMs: number;
    challenger: {
        id: number;
        name: string;
        rating: number;
        rank: RankProgress;
    };
};

const MODES = {
    battle: {
        label: 'Battle',
        icon: Swords,
        rules: 'First to 3 KOs · 2 minutes',
    },
    race: { label: 'Race', icon: Flag, rules: 'First to 40 lines' },
};

/**
 * An incoming invite, as a card in the middle of the screen: who's asking, what for, and how
 * long is left to answer. Closing it lets the invite lapse, like ignoring it.
 */
export function InviteCard({
    invite,
    receivedAt,
    onAccept,
    onDecline,
    onDismiss,
}: {
    invite: Invite;
    /** When it arrived (Date.now()), for the countdown. */
    receivedAt: number;
    onAccept: () => void;
    onDecline: () => void;
    onDismiss: () => void;
}) {
    const [now, setNow] = useState(() => Date.now());
    const mode = MODES[invite.mode];
    const left = Math.max(0, receivedAt + invite.expiresInMs - now);

    useEffect(() => {
        const tick = setInterval(() => setNow(Date.now()), 250);

        return () => clearInterval(tick);
    }, []);

    useEffect(() => {
        if (left === 0) {
            onDismiss();
        }
    }, [left, onDismiss]);

    return (
        <Dialog open onOpenChange={(open) => !open && onDismiss()}>
            <DialogContent className="gap-0 overflow-hidden rounded-3xl border-violet-500/30 p-0 sm:max-w-sm">
                <div className="flex flex-col items-center gap-4 px-6 pt-8 pb-6 text-center">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/15 px-3 py-1 text-[11px] font-bold tracking-[0.2em] text-violet-600 uppercase dark:text-violet-300">
                        <mode.icon className="size-3.5" /> {mode.label} invite
                    </span>
                    <PlayerEmblem
                        name={invite.challenger.name}
                        id={invite.challenger.id}
                        size="xl"
                        className="motion-safe:animate-in motion-safe:zoom-in-75"
                    />
                    <div className="flex flex-col items-center gap-1.5">
                        <DialogTitle className="text-2xl font-black tracking-tight">
                            {invite.challenger.name}
                        </DialogTitle>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <RankBadge progress={invite.challenger.rank} />
                            <span className="font-semibold tabular-nums">
                                {invite.challenger.rating}
                            </span>
                        </div>
                    </div>
                    <DialogDescription className="text-sm">
                        wants to play a friendly {mode.label.toLowerCase()}.
                        <br />
                        {mode.rules} · no rating or XP.
                    </DialogDescription>

                    <div className="flex w-full flex-col gap-2">
                        <Button
                            size="lg"
                            className="h-12 bg-gradient-to-r from-amber-300 to-amber-400 text-base font-black text-amber-950 shadow-lg shadow-amber-500/25 hover:from-amber-200 hover:to-amber-300"
                            onClick={onAccept}
                        >
                            <Check /> ACCEPT
                        </Button>
                        <Button variant="outline" onClick={onDecline}>
                            <X /> Decline
                        </Button>
                    </div>
                </div>

                {/* Drains as the invite runs out. */}
                <div className="h-1 bg-muted">
                    <div
                        className={cn(
                            'h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-[width] duration-300 ease-linear',
                            left < 5000 && 'from-rose-500 to-rose-400',
                        )}
                        style={{
                            width: `${(left / invite.expiresInMs) * 100}%`,
                        }}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
}
