/** Format milliseconds as m:ss(.cc). */
export function formatTime(ms: number, withCentiseconds = true): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, '0');

    if (!withCentiseconds) {
        return `${minutes}:${seconds}`;
    }

    const centis = String(Math.floor((ms % 1000) / 10)).padStart(2, '0');

    return `${minutes}:${seconds}.${centis}`;
}
