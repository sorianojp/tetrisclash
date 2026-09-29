/**
 * Replays: the board snapshots a game streams to opponents, recorded over time.
 * A frame is [ms since start, snapshot, pending garbage, lines sent, lines cleared].
 * Uploads are gzipped JSON, base64-encoded (App\Support\ReplayData checks them).
 */
export type ReplayFrame = [
    t: number,
    snapshot: string,
    pending: number,
    linesSent: number,
    lines: number,
];

/** Matches the server's cap: 30 minutes at 10 frames a second. */
const MAX_FRAMES = 18000;
/** Record at most this often; the board is streamed at the same rate. */
const FRAME_MS = 100;

export class ReplayRecorder {
    frames: ReplayFrame[] = [];
    private lastKey = '';
    private lastAt = -Infinity;

    /** Add a frame if the board changed and enough time has passed (or it's forced: the final board). */
    capture(
        t: number,
        snapshot: string,
        pending: number,
        linesSent: number,
        lines: number,
        force = false,
    ): void {
        const key = `${snapshot}|${pending}|${linesSent}|${lines}`;
        const time = Math.max(0, Math.round(t));

        if (
            key === this.lastKey ||
            (time - this.lastAt < FRAME_MS && !force) ||
            this.frames.length >= MAX_FRAMES
        ) {
            return;
        }

        // Never step back in time (a forced frame can land at the same ms as the last).
        this.frames.push([
            Math.max(time, this.frames.at(-1)?.[0] ?? 0),
            snapshot,
            pending,
            linesSent,
            lines,
        ]);
        this.lastKey = key;
        this.lastAt = time;
    }

    reset(): void {
        this.frames = [];
        this.lastKey = '';
        this.lastAt = -Infinity;
    }
}

/** Gzip + base64 the frames for upload; null when the browser can't compress. */
export async function encodeReplay(
    frames: ReplayFrame[],
): Promise<string | null> {
    if (frames.length === 0 || typeof CompressionStream === 'undefined') {
        return null;
    }

    const stream = new Blob([JSON.stringify(frames)])
        .stream()
        .pipeThrough(new CompressionStream('gzip'));
    const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    let binary = '';

    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }

    return btoa(binary);
}

/** Unpack stored replay data back into frames. */
export async function decodeReplay(data: string): Promise<ReplayFrame[]> {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const stream = new Blob([bytes])
        .stream()
        .pipeThrough(new DecompressionStream('gzip'));

    return JSON.parse(await new Response(stream).text()) as ReplayFrame[];
}

/** The frame showing at time t: the last one at or before it. */
export function frameAt(frames: ReplayFrame[], t: number): ReplayFrame | null {
    let low = 0;
    let high = frames.length - 1;
    let found = -1;

    while (low <= high) {
        const mid = (low + high) >> 1;

        if (frames[mid][0] <= t) {
            found = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    return found === -1 ? null : frames[found];
}
