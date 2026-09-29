<?php

namespace App\Support;

use Throwable;

/**
 * Checks replay uploads. A replay is a JSON list of frames, gzipped then base64-encoded by
 * the browser: [t, snapshot, pending, linesSent, lines], where t is ms since the start and
 * snapshot is the 10×20 visible field, one digit (0–8) per cell.
 */
final class ReplayData
{
    /** 30 minutes at the 10 frames a second the game records. */
    public const MAX_FRAMES = 18000;

    public const MAX_DURATION_MS = 30 * 60 * 1000;

    /** Caps on the upload and on what it may inflate to, so a crafted gzip can't balloon. */
    public const MAX_UPLOAD_BYTES = 1_500_000;

    private const MAX_JSON_BYTES = 8_000_000;

    private const SNAPSHOT = '/^[0-8]{200}$/';

    /**
     * The upload re-encoded for storage with its duration, or null if it isn't a valid replay.
     *
     * @return array{data: string, durationMs: int}|null
     */
    public static function parse(string $upload): ?array
    {
        if (strlen($upload) > self::MAX_UPLOAD_BYTES) {
            return null;
        }

        try {
            $gzipped = base64_decode($upload, true);
            $json = $gzipped === false ? false : gzdecode($gzipped, self::MAX_JSON_BYTES);
            $frames = $json === false ? null : json_decode($json, true, 4, JSON_THROW_ON_ERROR);
        } catch (Throwable) {
            return null;
        }

        if (! is_array($frames) || ! array_is_list($frames) || $frames === [] || count($frames) > self::MAX_FRAMES) {
            return null;
        }

        $previous = 0;

        foreach ($frames as $frame) {
            if (! self::validFrame($frame, $previous)) {
                return null;
            }

            $previous = $frame[0];
        }

        return [
            'data' => base64_encode((string) gzencode((string) json_encode($frames), 6)),
            'durationMs' => $previous,
        ];
    }

    private static function validFrame(mixed $frame, int $previous): bool
    {
        if (! is_array($frame) || ! array_is_list($frame) || count($frame) !== 5) {
            return false;
        }

        [$t, $snapshot, $pending, $sent, $lines] = $frame;

        return is_int($t) && $t >= $previous && $t <= self::MAX_DURATION_MS
            && is_string($snapshot) && preg_match(self::SNAPSHOT, $snapshot) === 1
            && self::count($pending) && self::count($sent) && self::count($lines);
    }

    private static function count(mixed $value): bool
    {
        return is_int($value) && $value >= 0 && $value <= 100_000;
    }
}
