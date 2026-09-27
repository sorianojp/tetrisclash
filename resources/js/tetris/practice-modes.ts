import { formatTime } from '@/lib/format';

export type PracticeMode = 'sprint' | 'ultra' | 'dig' | 'survival' | 'zen';
/** Every mode keeps a personal best. */
export type RecordMode = PracticeMode;
export type PracticeRecords = Record<RecordMode, number | null>;

export const SPRINT_LINES = 40;
export const ULTRA_MS = 120_000;
export const DIG_ROWS = 10;

export const PRACTICE_MODES: Record<
    PracticeMode,
    { label: string; goal: string }
> = {
    sprint: { label: '40 Lines', goal: 'Clear 40 lines as fast as you can.' },
    ultra: { label: 'Ultra', goal: 'Score as much as you can in 2 minutes.' },
    dig: { label: 'Dig', goal: `Dig through ${DIG_ROWS} rows of garbage.` },
    survival: {
        label: 'Survival',
        goal: 'Garbage keeps coming, faster and bigger. Hold out.',
    },
    zen: { label: 'Zen', goal: 'No goal. Just stack.' },
};

export const RECORD_MODES: RecordMode[] = [
    'sprint',
    'ultra',
    'dig',
    'survival',
    'zen',
];

/** Timed races keep the fastest result; Ultra, Survival and Zen keep the highest. */
export const LOWER_IS_BETTER: Record<RecordMode, boolean> = {
    sprint: true,
    dig: true,
    ultra: false,
    survival: false,
    zen: false,
};

/** Ultra and Zen records are scores; the rest are times. */
export const formatRecord = (mode: RecordMode, value: number) =>
    mode === 'ultra' || mode === 'zen'
        ? value.toLocaleString()
        : formatTime(value);
