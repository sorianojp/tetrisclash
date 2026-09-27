import { Link } from '@inertiajs/react';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useOnlineCount } from '@/hooks/use-online';
import { index as onlineIndex } from '@/routes/online';

/** The lobby's "how many are online" card, linking to the full list. */
export function OnlineNow({ initialCount }: { initialCount: number }) {
    const count = useOnlineCount() ?? initialCount;

    return (
        <Card className="flex-row flex-wrap items-center justify-between gap-4 px-6">
            <div className="flex items-center gap-3">
                <span className="relative flex size-3">
                    <span className="absolute inline-flex size-full rounded-full bg-emerald-400 opacity-60 motion-safe:animate-ping" />
                    <span className="relative inline-flex size-3 rounded-full bg-emerald-500" />
                </span>
                <div>
                    <div className="text-2xl leading-none font-bold tabular-nums">
                        {count.toLocaleString()}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                        {count === 1 ? 'player' : 'players'} online now
                    </div>
                </div>
            </div>
            <Button variant="outline" asChild>
                <Link href={onlineIndex()}>
                    <Users /> See who's online
                </Link>
            </Button>
        </Card>
    );
}
