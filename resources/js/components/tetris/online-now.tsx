import { Link } from '@inertiajs/react';
import { ChevronRight } from 'lucide-react';
import { useOnlineCount } from '@/hooks/use-online';
import { index as onlineIndex } from '@/routes/online';

/** "12 online · See who's online", for the lobby hero. */
export function OnlineNow({ initialCount }: { initialCount: number }) {
    const count = useOnlineCount() ?? initialCount;

    return (
        <Link
            href={onlineIndex()}
            className="inline-flex items-center gap-2 self-start rounded-full bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/15"
        >
            <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full rounded-full bg-emerald-400 opacity-60 motion-safe:animate-ping" />
                <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
            </span>
            <span className="font-semibold tabular-nums">
                {count.toLocaleString()}
            </span>
            {count === 1 ? 'player' : 'players'} online
            <span className="text-indigo-200">· See who's online</span>
            <ChevronRight className="size-4 text-indigo-200" />
        </Link>
    );
}
