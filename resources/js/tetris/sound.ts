import type { ClearInfo } from './engine';

/**
 * Sound effects, synthesized with the Web Audio API (no audio files to download). Off by
 * default, since people play in class and in public; the choice and volume are remembered
 * per browser. Browsers only allow audio after a click or key press, which every sound here
 * follows.
 *
 * Everything is in one key (G major pentatonic) so sounds that overlap stay musical. Combos
 * climb that scale and stack layers as they grow: plucks, then bass and kick, then snare and
 * arpeggios, then risers and fanfares. A light reverb gives depth, and a compressor keeps
 * busy moments from clipping.
 */

type Settings = { on: boolean; volume: number };

const STORAGE_KEY = 'tetris-clash:sound';
const MOVE_GAP_MS = 30;
/** G4: the root everything is tuned from. */
const ROOT = 392;
/** Major pentatonic, in semitones. */
const PENTATONIC = [0, 2, 4, 7, 9];

let settings: Settings = loadSettings();
const listeners = new Set<() => void>();
let lastMoveAt = 0;

type Graph = {
    ctx: AudioContext;
    /** Dry input to the master bus. */
    out: GainNode;
    /** Send into the reverb. */
    reverb: GainNode;
    master: GainNode;
    noise: AudioBuffer;
};

let graph: Graph | null = null;

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

    if (graph) {
        graph.master.gain.value = next.volume;
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

/**
 * The audio graph, built on first use: voices → (dry + reverb) → compressor → volume.
 * Null while sound is off or unsupported.
 */
function audio(): Graph | null {
    if (!settings.on || typeof window === 'undefined') {
        return null;
    }

    if (!graph) {
        const Context =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext })
                .webkitAudioContext;

        if (!Context) {
            return null;
        }

        const ctx = new Context();
        const master = ctx.createGain();
        const compressor = ctx.createDynamicsCompressor();
        const out = ctx.createGain();
        const reverb = ctx.createGain();
        const convolver = ctx.createConvolver();

        master.gain.value = settings.volume;
        compressor.threshold.value = -14;
        compressor.ratio.value = 6;
        out.gain.value = 0.7;
        convolver.buffer = impulse(ctx, 1.6);

        out.connect(compressor);
        reverb.connect(convolver).connect(compressor);
        compressor.connect(master).connect(ctx.destination);

        const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noise.getChannelData(0);

        for (let i = 0; i < data.length; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        graph = { ctx, out, reverb, master, noise };
    }

    if (graph.ctx.state === 'suspended') {
        void graph.ctx.resume();
    }

    return graph;
}

/** A small-room reverb: stereo noise fading out over `seconds`. */
function impulse(ctx: AudioContext, seconds: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);

        for (let i = 0; i < length; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
        }
    }

    return buffer;
}

type VoiceOptions = {
    type?: OscillatorType;
    gain?: number;
    /** Glide to this frequency over the note. */
    slideTo?: number;
    /** Seconds from now. */
    delay?: number;
    attack?: number;
    /** Lowpass cutoff (Hz); sweeps to filterTo when given. */
    filter?: number;
    filterTo?: number;
    /** Spread two oscillators this many cents apart, for a fuller sound. */
    detune?: number;
    /** How much goes to the reverb, 0–1. */
    wet?: number;
};

/** One note: oscillator(s) → lowpass → envelope → dry and reverb. */
function voice(
    frequency: number,
    duration: number,
    {
        type = 'triangle',
        gain = 0.15,
        slideTo,
        delay = 0,
        attack = 0.004,
        filter = 6000,
        filterTo,
        detune = 0,
        wet = 0.15,
    }: VoiceOptions = {},
): void {
    const g = audio();

    if (!g) {
        return;
    }

    const { ctx } = g;
    const start = ctx.currentTime + delay;
    const end = start + duration;
    const lowpass = ctx.createBiquadFilter();
    const env = ctx.createGain();

    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(filter, start);

    if (filterTo) {
        lowpass.frequency.exponentialRampToValueAtTime(filterTo, end);
    }

    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, end);

    for (const cents of detune > 0 ? [-detune, detune] : [0]) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.detune.value = cents;
        osc.frequency.setValueAtTime(frequency, start);

        if (slideTo) {
            osc.frequency.exponentialRampToValueAtTime(slideTo, end);
        }

        osc.connect(lowpass);
        osc.start(start);
        osc.stop(end + 0.05);
    }

    lowpass.connect(env);
    env.connect(g.out);

    if (wet > 0) {
        const send = ctx.createGain();
        send.gain.value = wet;
        env.connect(send).connect(g.reverb);
    }
}

/** Filtered noise: clicks, hits, whooshes and risers. */
function noise(
    duration: number,
    {
        gain = 0.2,
        filter = 'lowpass',
        from = 1200,
        to = 200,
        q = 1,
        delay = 0,
        attack = 0.002,
        wet = 0.1,
    }: {
        gain?: number;
        filter?: BiquadFilterType;
        from?: number;
        to?: number;
        q?: number;
        delay?: number;
        attack?: number;
        wet?: number;
    } = {},
): void {
    const g = audio();

    if (!g) {
        return;
    }

    const { ctx } = g;
    const start = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    const shape = ctx.createBiquadFilter();
    const env = ctx.createGain();

    source.buffer = g.noise;
    shape.type = filter;
    shape.Q.value = q;
    shape.frequency.setValueAtTime(from, start);
    shape.frequency.exponentialRampToValueAtTime(to, start + duration);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    source.connect(shape).connect(env).connect(g.out);

    if (wet > 0) {
        const send = ctx.createGain();
        send.gain.value = wet;
        env.connect(send).connect(g.reverb);
    }

    source.start(start);
    source.stop(start + duration + 0.05);
}

// ---- Drums ---------------------------------------------------------------

function kick(delay = 0, gain = 0.5): void {
    voice(150, 0.18, { type: 'sine', gain, slideTo: 42, delay, wet: 0 });
    noise(0.02, {
        gain: gain * 0.3,
        filter: 'highpass',
        from: 3000,
        to: 3000,
        delay,
        wet: 0,
    });
}

function snare(delay = 0, gain = 0.3): void {
    noise(0.16, {
        gain,
        filter: 'bandpass',
        from: 2200,
        to: 1400,
        q: 0.8,
        delay,
        wet: 0.25,
    });
    voice(210, 0.08, {
        type: 'triangle',
        gain: gain * 0.6,
        slideTo: 150,
        delay,
        wet: 0,
    });
}

function hat(delay = 0, gain = 0.08): void {
    noise(0.04, {
        gain,
        filter: 'highpass',
        from: 7000,
        to: 7000,
        delay,
        wet: 0,
    });
}

function cymbal(delay = 0, gain = 0.15): void {
    noise(1.2, {
        gain,
        filter: 'highpass',
        from: 5000,
        to: 9000,
        delay,
        wet: 0.4,
    });
}

// ---- Pitch ---------------------------------------------------------------

const semitones = (base: number, steps: number) => base * 2 ** (steps / 12);

/** The n-th note up the pentatonic scale from the root. */
function scaleNote(step: number): number {
    const octave = Math.floor(step / PENTATONIC.length);

    return semitones(ROOT, 12 * octave + PENTATONIC[step % PENTATONIC.length]);
}

/** Combo intensity tier: 0 no combo, 1 warming up, 2 heating, 3 on fire, 4 unstoppable. */
function tierOf(combo: number): number {
    return combo >= 10
        ? 4
        : combo >= 7
          ? 3
          : combo >= 4
            ? 2
            : combo >= 1
              ? 1
              : 0;
}

export const sfx = {
    /** A soft click. Auto-repeat moves every 20ms, so at most one per 30ms. */
    move(): void {
        const now = performance.now();

        if (now - lastMoveAt >= MOVE_GAP_MS) {
            lastMoveAt = now;
            noise(0.018, {
                gain: 0.07,
                filter: 'bandpass',
                from: 3200,
                to: 2600,
                q: 2,
                wet: 0,
            });
        }
    },

    /** A wooden tock. */
    rotate(): void {
        voice(880, 0.05, { type: 'sine', gain: 0.1, slideTo: 620, wet: 0 });
    },

    /** Two quick notes up: the piece tucked away. */
    hold(): void {
        voice(scaleNote(5), 0.07, { gain: 0.08, wet: 0.1 });
        voice(scaleNote(7), 0.09, { gain: 0.08, delay: 0.05, wet: 0.1 });
    },

    /** A punchy thump. */
    hardDrop(): void {
        kick(0, 0.4);
        noise(0.08, { gain: 0.12, from: 1500, to: 200, wet: 0 });
    },

    /**
     * Line clears. Lines cleared set the chord (one note up to a full chord for a Tetris);
     * the combo climbs the scale and stacks layers, so a long chain keeps getting bigger.
     */
    clear(info: ClearInfo): void {
        const combo = Math.max(0, info.combo);
        const tier = tierOf(combo);
        const base = scaleNote(Math.min(combo, 14));
        const bright = 1800 + tier * 1600;
        const wet = 0.15 + tier * 0.05;
        const tetris = info.lines >= 4;
        const tspin = info.tSpin !== 'none' && info.lines > 0;
        const chord = [0, 4, 7, 12].slice(0, Math.max(1, info.lines));

        // T-spin: a zap into the chord.
        if (tspin) {
            voice(2400, 0.12, {
                type: 'square',
                gain: 0.06,
                slideTo: base,
                filter: 5000,
                wet: 0.2,
            });
        }

        const at = tspin ? 0.08 : 0;

        chord.forEach((step, i) =>
            voice(semitones(base, step), tetris ? 0.45 : 0.22, {
                type: tetris || tier >= 3 ? 'sawtooth' : 'triangle',
                gain: tetris ? 0.07 : 0.1,
                detune: tetris || tier >= 2 ? 8 : 0,
                filter: tetris ? 900 : bright,
                filterTo: tetris ? 7000 : undefined,
                delay: at + i * (tetris ? 0.012 : 0.03),
                wet,
            }),
        );

        // Tier 1+: a sparkle an octave up.
        if (tier >= 1) {
            voice(semitones(base, 12), 0.12, {
                type: 'sine',
                gain: 0.06,
                delay: at + 0.05,
                wet,
            });
        }

        // Tier 2+: the beat kicks in, with a bass note under it.
        if (tier >= 2) {
            kick(at, 0.35 + tier * 0.03);
            voice(base / 2, 0.25, {
                type: 'sawtooth',
                gain: 0.07,
                filter: 600,
                detune: 6,
                delay: at,
                wet: 0.05,
            });
        }

        // Tier 3+: snare and a quick arpeggio up.
        if (tier >= 3) {
            snare(at + 0.06, 0.2);
            [7, 12, 16].forEach((step, i) =>
                voice(semitones(base, step), 0.1, {
                    type: 'square',
                    gain: 0.045,
                    filter: bright,
                    delay: at + 0.08 + i * 0.045,
                    wet,
                }),
            );
        }

        // Tier 4: a riser and a two-octave run: unstoppable.
        if (tier >= 4) {
            noise(0.35, {
                gain: 0.08,
                filter: 'bandpass',
                from: 600,
                to: 9000,
                q: 1.5,
                attack: 0.2,
                wet: 0.2,
            });
            [12, 16, 19, 24, 28].forEach((step, i) =>
                voice(semitones(base, step), 0.09, {
                    type: 'square',
                    gain: 0.04,
                    filter: 8000,
                    delay: at + 0.1 + i * 0.035,
                    wet: 0.3,
                }),
            );
            hat(at + 0.12);
            hat(at + 0.18);
        }

        // Milestones (5, 10, 15…): a fanfare stab.
        if (combo > 0 && combo % 5 === 0) {
            [0, 4, 7, 11, 14].forEach((step) =>
                voice(semitones(base, step), 0.6, {
                    type: 'sawtooth',
                    gain: 0.04,
                    detune: 10,
                    filter: 2500,
                    filterTo: 6000,
                    delay: at + 0.2,
                    wet: 0.35,
                }),
            );
            cymbal(at + 0.2, 0.08);
        }

        // Tetris: impact and shimmer.
        if (tetris) {
            kick(at, 0.45);
            cymbal(at, 0.1);
            [19, 24].forEach((step, i) =>
                voice(semitones(base, step), 0.3, {
                    type: 'sine',
                    gain: 0.06,
                    delay: at + 0.18 + i * 0.07,
                    wet: 0.4,
                }),
            );
        }

        // Back-to-back: a power layer an octave down.
        if (info.backToBack) {
            voice(base / 2, 0.4, {
                type: 'sawtooth',
                gain: 0.06,
                detune: 12,
                filter: 1500,
                filterTo: 400,
                delay: at,
                wet: 0.2,
            });
        }

        if (info.perfectClear) {
            [0, 4, 7, 12, 16, 19, 24, 28].forEach((step, i) =>
                voice(semitones(ROOT, step), 0.3, {
                    type: 'square',
                    gain: 0.05,
                    filter: 6000,
                    delay: 0.35 + i * 0.06,
                    wet: 0.4,
                }),
            );
            cymbal(0.35, 0.15);
            kick(0.35, 0.5);
        }
    },

    /** A long combo just ended: power down, bigger the longer it was. */
    comboBreak(combo: number): void {
        if (combo < 3) {
            return;
        }

        const size = Math.min(1, combo / 10);

        voice(scaleNote(Math.min(combo, 14)), 0.35 + size * 0.3, {
            type: 'sawtooth',
            gain: 0.06 + size * 0.04,
            slideTo: 90,
            filter: 3000,
            filterTo: 300,
            detune: 10,
            wet: 0.2,
        });
        noise(0.3 + size * 0.3, {
            gain: 0.06 + size * 0.05,
            filter: 'bandpass',
            from: 4000,
            to: 300,
            wet: 0.2,
        });
    },

    /** Garbage sent: a zap, bigger (with a hit) for big attacks. */
    attack(lines: number): void {
        const size = Math.min(1, lines / 6);

        voice(300, 0.18, {
            type: 'sawtooth',
            gain: 0.05 + size * 0.05,
            slideTo: 1800,
            filter: 4000,
            detune: 8,
            wet: 0.15,
        });
        noise(0.2, {
            gain: 0.06 + size * 0.08,
            filter: 'bandpass',
            from: 500,
            to: 5000,
            q: 2,
            wet: 0.1,
        });

        if (lines >= 4) {
            kick(0, 0.4);
        }
    },

    /** Garbage coming our way: a thump, or an alarm for big attacks. */
    incoming(lines: number): void {
        if (lines >= 4) {
            [0, 0.16].forEach((delay, i) =>
                voice(i === 0 ? 233 : 196, 0.14, {
                    type: 'square',
                    gain: 0.07,
                    filter: 1200,
                    delay,
                    wet: 0.1,
                }),
            );
        } else {
            voice(110, 0.2, { type: 'sine', gain: 0.18, slideTo: 60, wet: 0 });
        }
    },

    countdown(): void {
        voice(scaleNote(5), 0.16, { type: 'sine', gain: 0.14, wet: 0.2 });
    },

    go(): void {
        [0, 4, 7, 12].forEach((step) =>
            voice(semitones(scaleNote(5), step), 0.45, {
                type: 'sawtooth',
                gain: 0.05,
                detune: 8,
                filter: 2500,
                wet: 0.3,
            }),
        );
        kick(0, 0.4);
    },

    ko(): void {
        kick(0, 0.6);
        noise(0.8, { gain: 0.3, from: 3000, to: 120, wet: 0.35 });
        voice(420, 0.7, {
            type: 'sawtooth',
            gain: 0.1,
            slideTo: 40,
            filter: 2000,
            filterTo: 200,
            detune: 15,
            wet: 0.3,
        });
    },

    win(): void {
        [0, 4, 7, 12].forEach((step, i) =>
            voice(semitones(ROOT, step + 12), 0.16, {
                type: 'square',
                gain: 0.07,
                filter: 4000,
                delay: i * 0.1,
                wet: 0.2,
            }),
        );
        [0, 4, 7, 12].forEach((step) =>
            voice(semitones(ROOT, step + 12), 0.9, {
                type: 'sawtooth',
                gain: 0.045,
                detune: 10,
                filter: 1500,
                filterTo: 5000,
                delay: 0.42,
                wet: 0.4,
            }),
        );
        kick(0.42, 0.45);
        cymbal(0.42, 0.1);
    },

    lose(): void {
        [7, 3, 0, -5].forEach((step, i) =>
            voice(semitones(ROOT, step), 0.3, {
                type: 'triangle',
                gain: 0.12,
                filter: 2000,
                delay: i * 0.2,
                wet: 0.35,
            }),
        );
    },

    draw(): void {
        voice(ROOT, 0.25, { type: 'triangle', gain: 0.11, wet: 0.25 });
        voice(semitones(ROOT, 7), 0.35, {
            type: 'triangle',
            gain: 0.11,
            delay: 0.22,
            wet: 0.25,
        });
    },

    /** A bubbly pop. */
    emote(): void {
        voice(700, 0.07, { type: 'sine', gain: 0.1, slideTo: 1300, wet: 0.1 });
        voice(1100, 0.08, {
            type: 'sine',
            gain: 0.08,
            slideTo: 1800,
            delay: 0.05,
            wet: 0.1,
        });
    },
};

/** A clear as the engine reports it, for previews. */
function previewClear(
    lines: number,
    combo: number,
    extra: Partial<ClearInfo> = {},
): ClearInfo {
    return {
        lines,
        combo,
        tSpin: 'none',
        backToBack: false,
        perfectClear: false,
        attack: 0,
        ...extra,
    };
}

/**
 * Every sound, playable from the settings page. "Combo run" chains clears from 0 to 14 and
 * then breaks the combo, to hear it build.
 */
export const soundPreviews: { label: string; play: () => void }[] = [
    {
        label: 'Move',
        play: () =>
            [0, 60, 120].forEach((t) =>
                setTimeout(() => {
                    lastMoveAt = 0;
                    sfx.move();
                }, t),
            ),
    },
    { label: 'Rotate', play: () => sfx.rotate() },
    { label: 'Hold', play: () => sfx.hold() },
    { label: 'Hard drop', play: () => sfx.hardDrop() },
    { label: 'Single', play: () => sfx.clear(previewClear(1, 0)) },
    { label: 'Double', play: () => sfx.clear(previewClear(2, 0)) },
    { label: 'Triple', play: () => sfx.clear(previewClear(3, 0)) },
    { label: 'Tetris', play: () => sfx.clear(previewClear(4, 0)) },
    {
        label: 'T-spin',
        play: () => sfx.clear(previewClear(2, 0, { tSpin: 'full' })),
    },
    {
        label: 'Back-to-back',
        play: () => sfx.clear(previewClear(4, 1, { backToBack: true })),
    },
    {
        label: 'Perfect clear',
        play: () => sfx.clear(previewClear(4, 0, { perfectClear: true })),
    },
    {
        label: 'Combo run',
        play: () => {
            for (let combo = 0; combo <= 14; combo++) {
                setTimeout(
                    () =>
                        sfx.clear(previewClear(combo % 3 === 2 ? 2 : 1, combo)),
                    combo * 420,
                );
            }

            setTimeout(() => sfx.comboBreak(14), 15 * 420 + 200);
        },
    },
    { label: 'Attack', play: () => sfx.attack(2) },
    { label: 'Big attack', play: () => sfx.attack(6) },
    { label: 'Incoming', play: () => sfx.incoming(2) },
    { label: 'Big incoming', play: () => sfx.incoming(6) },
    {
        label: 'Countdown',
        play: () => {
            [0, 1000, 2000].forEach((t) =>
                setTimeout(() => sfx.countdown(), t),
            );
            setTimeout(() => sfx.go(), 3000);
        },
    },
    { label: 'KO', play: () => sfx.ko() },
    { label: 'Win', play: () => sfx.win() },
    { label: 'Lose', play: () => sfx.lose() },
    { label: 'Draw', play: () => sfx.draw() },
    { label: 'Emote', play: () => sfx.emote() },
];
