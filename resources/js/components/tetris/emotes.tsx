import { MessageCircle, MessageCircleOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Preset reactions players can send mid-duel. Only an index goes over the wire, so
 * there's no free text to moderate. Keys 1–6 send them too.
 */
export const EMOTES = ['GG', 'Nice!', '🔥', '😱', '😅', '👋'] as const;

/** Minimum gap between emotes a player sends (and that we accept from them). */
export const EMOTE_COOLDOWN_MS = 1500;
const SHOW_MS = 2500;
const MUTE_KEY = 'tetris-clash:mute-emotes';

export type ShownEmote = { id: number; index: number };

/** The emote index in a whisper, or null when it isn't a valid one. */
export function emoteIndex(value: unknown): number | null {
    return Number.isInteger(value) &&
        (value as number) >= 0 &&
        (value as number) < EMOTES.length
        ? (value as number)
        : null;
}

/** An emote that shows for a moment, then clears itself. */
export function useShownEmote(): [ShownEmote | null, (index: number) => void] {
    const [shown, setShown] = useState<ShownEmote | null>(null);

    useEffect(() => {
        if (!shown) {
            return;
        }

        const timer = setTimeout(() => setShown(null), SHOW_MS);

        return () => clearTimeout(timer);
    }, [shown]);

    return [shown, (index) => setShown({ id: Date.now(), index })];
}

/** Whether the viewer muted incoming emotes, remembered in this browser. */
export function useEmoteMute(): [boolean, () => void] {
    const [muted, setMuted] = useState(() => {
        try {
            return window.localStorage.getItem(MUTE_KEY) === '1';
        } catch {
            return false;
        }
    });

    const toggle = () =>
        setMuted((current) => {
            try {
                window.localStorage.setItem(MUTE_KEY, current ? '0' : '1');
            } catch {
                // Storage can be blocked; muting still works for this page.
            }

            return !current;
        });

    return [muted, toggle];
}

/**
 * Accepts at most one emote per cooldown from a sender, so a tampered client
 * can't flood the screen.
 */
export function useEmoteGate(): () => boolean {
    const last = useRef(0);

    return () => {
        const now = Date.now();

        if (now - last.current < EMOTE_COOLDOWN_MS) {
            return false;
        }

        last.current = now;

        return true;
    };
}

/** A speech bubble over a board. */
export function EmoteBubble({ emote }: { emote: ShownEmote | null }) {
    if (!emote) {
        return null;
    }

    const text = EMOTES[emote.index];
    const isEmoji = !/^[A-Za-z!]/.test(text);

    return (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
            <span
                key={emote.id}
                className={cn(
                    'animate-callout rounded-2xl bg-white px-3 py-1 font-black text-indigo-950 shadow-lg ring-2 ring-indigo-400/60',
                    isEmoji ? 'text-3xl' : 'text-xl',
                )}
            >
                {text}
            </span>
        </div>
    );
}

/** Emote buttons plus a mute toggle for the opponent's emotes. */
export function EmoteBar({
    onSend,
    muted,
    onToggleMute,
}: {
    onSend: (index: number) => void;
    muted: boolean;
    onToggleMute: () => void;
}) {
    return (
        <div className="flex flex-wrap items-center justify-center gap-1">
            {EMOTES.map((emote, i) => (
                <Button
                    key={emote}
                    variant="outline"
                    size="sm"
                    className="h-8 min-w-9 px-2"
                    title={`Send ${emote} (key ${i + 1})`}
                    onClick={() => onSend(i)}
                >
                    {emote}
                </Button>
            ))}
            <Button
                variant="ghost"
                size="sm"
                className="h-8 text-muted-foreground"
                onClick={onToggleMute}
                aria-pressed={muted}
                title={
                    muted ? "Show opponent's emotes" : "Hide opponent's emotes"
                }
            >
                {muted ? <MessageCircleOff /> : <MessageCircle />}
                <span className="sr-only">
                    {muted ? 'Unmute emotes' : 'Mute emotes'}
                </span>
            </Button>
        </div>
    );
}
