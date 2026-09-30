import type { ClearInfo } from './engine';

/**
 * Sound effects, synthesized with the Web Audio API (no audio files to download). Off by
 * default, since people play in class and in public; the choice and volume are remembered
 * per browser. Browsers only allow audio after a click or key press, which every sound here
 * follows.
 */

type Settings = { on: boolean; volume: number };

const STORAGE_KEY = 'tetris-clash:sound';
const MOVE_GAP_MS = 30;

let settings: Settings = loadSettings();
const listeners = new Set<() => void>();
let context: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let lastMoveAt = 0;

function loadSettings(): Settings {
    try {
        const saved = JSON.parse(
            window.localStorage.getItem(STORAGE_KEY) ?? 'null',
        ) as Partial<Settings> | null;

        return {
            on: saved?.on === true,
            volume:
                typeof saved?.volume === 'number'
                    ? Math.min(1, Math.max(0, saved.volume))
                    : 0.6,
        };
    } catch {
        return { on: false, volume: 0.6 };
    }
}

function saveSettings(next: Settings): void {
    settings = next;

    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Storage can be blocked; the setting still holds for this page.
    }

    if (master) {
        master.gain.value = next.volume * 0.6;
    }

    listeners.forEach((listener) => listener());
}

/** For React (useSyncExternalStore): the current settings, and a way to hear changes. */
export const soundSettings = {
    get: (): Settings => settings,
    subscribe: (listener: () => void) => {
        listeners.add(listener);

        return () => listeners.delete(listener);
    },
};

export function setSoundOn(on: boolean): void {
    saveSettings({ ...settings, on });

    if (on) {
        // A little confirmation, which also unlocks audio (this runs from a click).
        sfx.rotate();
    }
}

export function setSoundVolume(volume: number): void {
    saveSettings({ ...settings, volume });
}

/** The audio graph, created on first use; null while sound is off or unsupported. */
function audio(): { ctx: AudioContext; out: GainNode } | null {
    if (!settings.on || typeof window === 'undefined') {
        return null;
    }

    if (!context) {
        const Context =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
                .webkitAudioContext;

        if (!Context) {
            return null;
        }

        context = new Context();
        master = context.createGain();
        master.gain.value = settings.volume * 0.6;
        master.connect(context.destination);
    }

    if (context.state === 'suspended') {
        void context.resume();
    }

    return { ctx: context, out: master! };
}

type ToneOptions = {
    type?: OscillatorType;
    gain?: number;
    /** Glide to this frequency over the tone. */
    slideTo?: number;
    /** Seconds from now. */
    delay?: number;
};

function tone(
    frequency: number,
    duration: number,
    { type = 'square', gain = 0.15, slideTo, delay = 0 }: ToneOptions = {},
): void {
    const graph = audio();

    if (!graph) {
        return;
    }

    const { ctx, out } = graph;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);

    if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
    }

    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(gain, start + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(env).connect(out);
    osc.start(start);
    osc.stop(start + duration + 0.02);
}

function noise(
    duration: number,
    {
        gain = 0.2,
        filter = 'lowpass',
        from = 1200,
        to = 200,
        delay = 0,
    }: {
        gain?: number;
        filter?: BiquadFilterType;
        from?: number;
        to?: number;
        delay?: number;
    } = {},
): void {
    const graph = audio();

    if (!graph) {
        return;
    }

    const { ctx, out } = graph;

    if (!noiseBuffer) {
        noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);

        for (let i = 0; i < data.length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
    }

    const start = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    const shape = ctx.createBiquadFilter();
    const env = ctx.createGain();

    source.buffer = noiseBuffer;
    shape.type = filter;
    shape.frequency.setValueAtTime(from, start);
    shape.frequency.exponentialRampToValueAtTime(to, start + duration);
    env.gain.setValueAtTime(gain, start);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    source.connect(shape).connect(env).connect(out);
    source.start(start);
    source.stop(start + duration + 0.02);
}

/** A note `semitones` above `base`. */
const note = (base: number, semitones: number) => base * 2 ** (semitones / 12);

export const sfx = {
    move(): void {
        const now = performance.now();

        // Auto-repeat moves every 20ms; one tick per 30ms is plenty.
        if (now - lastMoveAt >= MOVE_GAP_MS) {
            lastMoveAt = now;
            tone(620, 0.025, { gain: 0.05 });
        }
    },

    rotate(): void {
        tone(880, 0.035, { type: 'triangle', gain: 0.09 });
    },

    hold(): void {
        tone(520, 0.07, { type: 'triangle', gain: 0.1, slideTo: 780 });
    },

    hardDrop(): void {
        noise(0.09, { gain: 0.3, from: 900, to: 150 });
        tone(150, 0.1, { type: 'sine', gain: 0.25, slideTo: 60 });
    },

    /** Rises with lines cleared and climbs with the combo; flashier for big clears. */
    clear(info: ClearInfo): void {
        const base = note(523, Math.min(info.combo, 12));
        const steps = [0, 4, 7, 12];
        const big = info.lines === 4 || info.tSpin !== 'none';

        for (let i = 0; i < Math.max(1, info.lines); i++) {
            tone(note(base, steps[i]), 0.12, {
                type: big ? 'square' : 'triangle',
                gain: 0.12,
                delay: i * 0.045,
            });
        }

        if (big || info.backToBack) {
            tone(note(base, 19), 0.2, {
                type: 'triangle',
                gain: 0.1,
                delay: 0.2,
            });
            tone(note(base, 24), 0.25, {
                type: 'triangle',
                gain: 0.08,
                delay: 0.26,
            });
        }

        if (info.perfectClear) {
            [0, 4, 7, 12, 16, 19, 24].forEach((step, i) =>
                tone(note(523, step), 0.15, {
                    type: 'square',
                    gain: 0.09,
                    delay: 0.3 + i * 0.05,
                }),
            );
        }
    },

    /** Garbage sent: a whoosh, bigger for bigger attacks. */
    attack(lines: number): void {
        noise(0.25, {
            gain: Math.min(0.3, 0.1 + lines * 0.03),
            filter: 'bandpass',
            from: 400,
            to: 3000,
        });
    },

    /** Garbage coming our way: a low warning rumble. */
    incoming(lines: number): void {
        tone(90, 0.25, {
            type: 'sawtooth',
            gain: Math.min(0.2, 0.08 + lines * 0.02),
            slideTo: 55,
        });
    },

    countdown(): void {
        tone(440, 0.12, { gain: 0.12 });
    },

    go(): void {
        tone(880, 0.3, { gain: 0.14 });
    },

    ko(): void {
        noise(0.5, { gain: 0.35, from: 2000, to: 100 });
        tone(300, 0.5, { type: 'sawtooth', gain: 0.15, slideTo: 50 });
    },

    win(): void {
        [0, 4, 7, 12].forEach((step, i) =>
            tone(note(523, step), 0.14, {
                type: 'square',
                gain: 0.11,
                delay: i * 0.1,
            }),
        );
        tone(note(523, 16), 0.4, { type: 'triangle', gain: 0.12, delay: 0.42 });
    },

    lose(): void {
        [7, 4, 0, -5].forEach((step, i) =>
            tone(note(392, step), 0.2, {
                type: 'triangle',
                gain: 0.12,
                delay: i * 0.16,
            }),
        );
    },

    draw(): void {
        tone(523, 0.18, { type: 'triangle', gain: 0.11 });
        tone(523, 0.25, { type: 'triangle', gain: 0.11, delay: 0.2 });
    },

    emote(): void {
        tone(1200, 0.07, { type: 'sine', gain: 0.1, slideTo: 1700 });
    },
};
