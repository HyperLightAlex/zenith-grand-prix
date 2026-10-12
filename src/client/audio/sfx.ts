// One-shot sound effects. Each is a recipe that layers a few oscillators and
// filtered noise bursts onto a Voice; the engine in synth.ts owns volume,
// panning, the voice limit and cleaning up afterwards.

import type { SfxName } from './audio';
import type { Ctx, Rng } from './dsp';
import { mtof, perBlock } from './dsp';

export interface SfxHost {
  readonly ctx: Ctx;
  readonly white: AudioBuffer;
  readonly pink: AudioBuffer;
  readonly rng: Rng;
}

/** perc: strike then die away. flat: on, hold, off. swell: rise to a peak then fall. */
type Shape = 'perc' | 'flat' | 'swell';

interface ToneOpts {
  /** Waveform, sine unless given. */
  w?: OscillatorType;
  /** Frequency, and optionally where it glides to. */
  f: number;
  f2?: number;
  /** Glide time; the whole note unless given. */
  ft?: number;
  /** Start, seconds after the sound begins. */
  t?: number;
  /** Length in seconds. */
  d: number;
  /** Peak gain. */
  g: number;
  /** Attack time. For a swell, the time of the peak. */
  a?: number;
  /** Time held at the peak before a perc starts to decay. */
  h?: number;
  s?: Shape;
  /** Detune in cents. */
  dt?: number;
  /** Lowpass cutoff, for taming saws and squares. */
  lp?: number;
}

interface NoiseOpts {
  /** White (default) or pink. */
  k?: 'w' | 'p';
  t?: number;
  d: number;
  g: number;
  a?: number;
  h?: number;
  s?: Shape;
  /** Filter type, frequency, optional sweep target, Q and sweep time. */
  ft?: BiquadFilterType;
  ff?: number;
  ff2?: number;
  fq?: number;
  fs?: number;
  /** Chop the noise at this rate in hertz to make it rattle or grind. */
  am?: number;
  /** Keep the noise in stereo. Most layers fold it to mono, which halves the filtering work. */
  wide?: boolean;
}

interface BellOpts {
  f: number;
  /** Modulator frequency as a multiple of the carrier; non-integers sound metallic. */
  ratio: number;
  /** Modulation depth at the strike; it fades as the note rings. */
  idx: number;
  t?: number;
  d: number;
  g: number;
}

/** One playing sound effect: a handful of sources feeding a single gain. */
export class Voice {
  readonly out: GainNode;
  readonly srcs: AudioScheduledSourceNode[] = [];
  /** Context time when the last layer has finished. */
  end: number;
  private readonly ts: number;

  constructor(
    private readonly host: SfxHost,
    readonly t0: number,
    private readonly pitch: number,
  ) {
    this.out = host.ctx.createGain();
    this.end = t0;
    this.ts = 1 / pitch;
  }

  private envelope(g: AudioParam, at: number, d: number, peak: number, a: number, h: number, s: Shape): void {
    const pk = Math.max(1e-4, peak);
    g.setValueAtTime(0, at);
    if (s === 'flat') {
      const r = Math.min(0.02 * this.ts, d * 0.3);
      const up = Math.min(a, d * 0.3);
      g.linearRampToValueAtTime(pk, at + up);
      g.setValueAtTime(pk, at + d - r);
      g.linearRampToValueAtTime(0, at + d);
    } else if (s === 'swell') {
      g.linearRampToValueAtTime(pk, at + Math.min(a, d * 0.95));
      g.linearRampToValueAtTime(0, at + d);
    } else {
      const up = Math.min(a, d * 0.4);
      g.linearRampToValueAtTime(pk, at + up);
      if (h > 0) g.setValueAtTime(pk, at + up + Math.min(h, d * 0.5));
      g.exponentialRampToValueAtTime(pk * 0.001, at + d);
    }
  }

  private begin(src: AudioScheduledSourceNode, at: number, d: number): void {
    src.stop(at + d + 0.03);
    this.srcs.push(src);
    if (at + d > this.end) this.end = at + d;
  }

  tone(o: ToneOpts): void {
    const { ctx } = this.host;
    const at = this.t0 + (o.t ?? 0) * this.ts;
    const d = o.d * this.ts;
    const s = o.s ?? 'perc';
    const osc = ctx.createOscillator();
    osc.type = o.w ?? 'sine';
    osc.frequency.setValueAtTime(o.f * this.pitch, at);
    if (o.f2 !== undefined) osc.frequency.exponentialRampToValueAtTime(o.f2 * this.pitch, at + (o.ft ?? o.d) * this.ts);
    if (o.dt) osc.detune.value = o.dt;
    const env = ctx.createGain();
    this.envelope(env.gain, at, d, o.g, (o.a ?? (s === 'swell' ? o.d * 0.5 : 0.003)) * this.ts, (o.h ?? 0) * this.ts, s);
    if (o.lp !== undefined) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.min(18000, o.lp * this.pitch);
      lp.Q.value = 0.7;
      osc.connect(lp);
      lp.connect(env);
    } else {
      osc.connect(env);
    }
    env.connect(this.out);
    osc.start(at);
    this.begin(osc, at, d);
  }

  noise(o: NoiseOpts): void {
    const { ctx, rng } = this.host;
    const at = this.t0 + (o.t ?? 0) * this.ts;
    const d = o.d * this.ts;
    const s = o.s ?? 'perc';
    const buf = o.k === 'p' ? this.host.pink : this.host.white;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = this.pitch;
    const chain: AudioNode[] = [];
    if (o.ft !== undefined && o.ff !== undefined) {
      const f = ctx.createBiquadFilter();
      f.type = o.ft;
      f.Q.value = o.fq ?? 0.7;
      perBlock(f.frequency);
      f.frequency.setValueAtTime(Math.min(18000, o.ff * this.pitch), at);
      if (o.ff2 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.min(18000, o.ff2 * this.pitch), at + (o.fs ?? o.d) * this.ts);
      chain.push(f);
    }
    if (o.am !== undefined) {
      const chop = ctx.createGain();
      chop.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = o.am * this.pitch;
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      lfo.connect(depth);
      depth.connect(chop.gain);
      lfo.start(at);
      this.begin(lfo, at, d);
      chain.push(chop);
    }
    const env = ctx.createGain();
    this.envelope(env.gain, at, d, o.g, (o.a ?? (s === 'swell' ? o.d * 0.5 : 0.002)) * this.ts, (o.h ?? 0) * this.ts, s);
    chain.push(env);
    if (!o.wide) {
      // The noise loops are stereo; fold to one channel at the first node.
      chain[0].channelCount = 1;
      chain[0].channelCountMode = 'explicit';
    }
    let node: AudioNode = src;
    for (const n of chain) {
      node.connect(n);
      node = n;
    }
    env.connect(this.out);
    src.start(at, rng.next() * (buf.duration - 0.05));
    this.begin(src, at, d);
  }

  /** A struck, ringing tone made by frequency modulation. */
  bell(o: BellOpts): void {
    const { ctx } = this.host;
    const at = this.t0 + (o.t ?? 0) * this.ts;
    const d = o.d * this.ts;
    const fc = o.f * this.pitch;
    const fm = fc * o.ratio;
    const car = ctx.createOscillator();
    car.frequency.value = fc;
    const mod = ctx.createOscillator();
    mod.frequency.value = fm;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(Math.max(1, o.idx * fm), at);
    depth.gain.exponentialRampToValueAtTime(Math.max(1, o.idx * fm * 0.04), at + d * 0.7);
    mod.connect(depth);
    depth.connect(car.frequency);
    const env = ctx.createGain();
    this.envelope(env.gain, at, d, o.g, 0.001 * this.ts, 0, 'perc');
    car.connect(env);
    env.connect(this.out);
    car.start(at);
    mod.start(at);
    this.begin(car, at, d);
    this.begin(mod, at, d);
  }
}

// ---- recipes ----------------------------------------------------------------

type Recipe = (v: Voice, r: Rng) => void;

/** A bright, slightly detuned stack for fanfares. */
function brass(v: Voice, midi: number, t: number, d: number, g: number): void {
  const f = mtof(midi);
  v.tone({ w: 'sawtooth', f, t, d, g: g * 0.5, lp: 3200, h: d * 0.5, a: 0.012, dt: 7 });
  v.tone({ w: 'sawtooth', f, t, d, g: g * 0.5, lp: 3200, h: d * 0.5, a: 0.012, dt: -7 });
  v.tone({ w: 'triangle', f, t, d, g: g * 0.6, h: d * 0.5, a: 0.008 });
}

/** A soft rounded note for the gentler jingles. */
function flute(v: Voice, midi: number, t: number, d: number, g: number): void {
  const f = mtof(midi);
  v.tone({ w: 'triangle', f, t, d, g, a: 0.03, h: d * 0.45 });
  v.tone({ w: 'sine', f: f * 2, t, d: d * 0.8, g: g * 0.18, a: 0.03 });
}

const RECIPES: Record<SfxName, Recipe> = {
  // -- menus --
  ui_move: (v) => {
    v.tone({ f: 1900, f2: 1500, d: 0.035, g: 0.8, a: 0.001 });
    v.noise({ d: 0.012, g: 0.25, ft: 'highpass', ff: 5000 });
  },
  ui_select: (v) => {
    v.tone({ w: 'triangle', f: 1318.5, d: 0.07, g: 0.7, a: 0.002 });
    v.tone({ f: 2637, d: 0.05, g: 0.2 });
    v.tone({ w: 'triangle', f: 1760, t: 0.06, d: 0.24, g: 0.8, a: 0.002 });
    v.tone({ f: 3520, t: 0.06, d: 0.16, g: 0.22 });
  },
  ui_back: (v) => {
    v.tone({ w: 'triangle', f: 700, f2: 440, d: 0.12, g: 0.9, a: 0.002 });
    v.tone({ f: 350, f2: 220, d: 0.12, g: 0.4 });
  },

  // -- start sequence --
  count_beep: (v) => {
    v.tone({ w: 'square', f: 440, d: 0.17, g: 0.28, s: 'flat', lp: 1800 });
    v.tone({ f: 880, d: 0.17, g: 0.6, s: 'flat' });
  },
  count_go: (v) => {
    // An open fifth, so it sits on the music whichever chord is playing.
    v.tone({ f: 880, d: 0.8, g: 0.55, a: 0.004, h: 0.25 });
    v.tone({ f: 1318.5, d: 0.8, g: 0.4, a: 0.004, h: 0.25 });
    v.tone({ f: 1760, d: 0.8, g: 0.32, a: 0.004, h: 0.25 });
    v.tone({ w: 'sawtooth', f: 880, d: 0.65, g: 0.2, lp: 3000, h: 0.2, dt: 6 });
    v.tone({ w: 'sawtooth', f: 440, d: 0.65, g: 0.18, lp: 2200, h: 0.2, dt: -6 });
    v.noise({ d: 0.3, g: 0.18, ft: 'highpass', ff: 6000 });
  },
  launch: (v) => {
    v.noise({ k: 'p', d: 0.45, g: 1.6, s: 'swell', a: 0.26, ft: 'bandpass', ff: 350, ff2: 4500, fq: 1.2, wide: true });
    v.tone({ w: 'sawtooth', f: 180, f2: 720, d: 0.32, g: 0.2, s: 'swell', a: 0.24, lp: 2000 });
    v.bell({ f: 1318.5, ratio: 3.5, idx: 1.2, t: 0.26, d: 0.9, g: 0.45 });
    v.bell({ f: 1975.5, ratio: 2, idx: 0.6, t: 0.33, d: 0.8, g: 0.35 });
    v.tone({ f: 2637, t: 0.33, d: 0.6, g: 0.14 });
  },

  // -- movement --
  boost: (v) => {
    v.tone({ f: 140, f2: 48, d: 0.3, g: 0.9, a: 0.003 });
    v.noise({ k: 'p', d: 0.7, g: 1.8, a: 0.01, ft: 'lowpass', ff: 3800, ff2: 500, fq: 0.8, wide: true });
    v.noise({ d: 0.5, g: 0.4, s: 'swell', a: 0.08, ft: 'bandpass', ff: 800, ff2: 2600, fq: 2 });
    v.tone({ w: 'sawtooth', f: 160, f2: 480, d: 0.45, g: 0.22, s: 'swell', a: 0.3, lp: 1800 });
  },
  dash: (v) => {
    v.noise({ d: 0.2, g: 1, a: 0.004, ft: 'bandpass', ff: 2600, ff2: 600, fq: 1.1 });
    v.noise({ d: 0.06, g: 0.35, ft: 'highpass', ff: 4500 });
    v.tone({ f: 300, f2: 120, d: 0.1, g: 0.3 });
  },

  // -- targeting --
  lock: (v) => {
    v.tone({ w: 'square', f: 987.8, d: 0.06, g: 0.5, s: 'flat', lp: 4200 });
    v.tone({ w: 'square', f: 1318.5, t: 0.085, d: 0.13, g: 0.5, s: 'flat', lp: 4800 });
    v.tone({ f: 2637, t: 0.085, d: 0.2, g: 0.2 });
  },
  unlock: (v) => {
    v.tone({ f: 880, f2: 520, d: 0.18, g: 0.8, a: 0.008 });
    v.tone({ w: 'triangle', f: 1760, f2: 1040, d: 0.1, g: 0.12, a: 0.008 });
  },
  denied: (v) => {
    for (const t of [0, 0.115]) {
      v.tone({ w: 'sawtooth', f: 147, t, d: 0.085, g: 0.6, s: 'flat', lp: 700 });
      v.tone({ w: 'square', f: 155.5, t, d: 0.085, g: 0.35, s: 'flat', lp: 500 });
    }
  },

  // -- melee --
  swing_light: (v) => {
    v.noise({ d: 0.16, g: 1, s: 'swell', a: 0.07, ft: 'bandpass', ff: 1200, ff2: 6000, fq: 2.2 });
    v.tone({ f: 2400, f2: 5200, d: 0.1, g: 0.05, s: 'swell', a: 0.05 });
  },
  swing_heavy: (v) => {
    v.noise({ k: 'p', d: 0.34, g: 4, s: 'swell', a: 0.16, ft: 'bandpass', ff: 220, ff2: 1900, fq: 1.4 });
    v.noise({ d: 0.3, g: 0.9, s: 'swell', a: 0.17, ft: 'bandpass', ff: 700, ff2: 3600, fq: 2.5 });
    v.tone({ f: 70, f2: 120, d: 0.3, g: 0.13, s: 'swell', a: 0.16 });
  },
  hit_light: (v) => {
    v.noise({ d: 0.05, g: 1, a: 0.0005, ft: 'highpass', ff: 2200 });
    v.bell({ f: 1850, ratio: 1.41, idx: 3, d: 0.13, g: 0.5 });
    v.bell({ f: 3100, ratio: 2.3, idx: 2, d: 0.07, g: 0.25 });
    v.tone({ f: 260, f2: 150, d: 0.06, g: 0.5, a: 0.001 });
  },
  hit_heavy: (v) => {
    v.tone({ f: 130, f2: 36, ft: 0.16, d: 0.36, g: 0.85, a: 0.002 });
    v.noise({ k: 'p', d: 0.26, g: 2.4, a: 0.001, ft: 'lowpass', ff: 2600, ff2: 260, fq: 1 });
    v.noise({ d: 0.03, g: 0.7, ft: 'highpass', ff: 3000 });
    v.bell({ f: 410, ratio: 2.76, idx: 4, d: 0.3, g: 0.45 });
    v.noise({ t: 0.02, d: 0.16, g: 1.3, ft: 'bandpass', ff: 1100, fq: 1.5, am: 70 });
  },
  block: (v) => {
    v.tone({ f: 540, f2: 500, d: 0.26, g: 0.8, a: 0.001 });
    v.tone({ f: 1385, d: 0.14, g: 0.35 });
    v.tone({ w: 'triangle', f: 270, d: 0.12, g: 0.4 });
    v.noise({ d: 0.12, g: 2.2, ft: 'bandpass', ff: 520, fq: 12 });
    v.noise({ d: 0.015, g: 0.4, ft: 'highpass', ff: 3000 });
  },
  parry: (v) => {
    v.noise({ d: 0.02, g: 0.5, ft: 'highpass', ff: 7000 });
    v.noise({ d: 0.16, g: 0.3, s: 'swell', a: 0.05, ft: 'bandpass', ff: 3000, ff2: 9000, fq: 3 });
    v.tone({ f: 1760, d: 0.9, g: 0.6, a: 0.001 });
    v.tone({ f: 2637, d: 1.0, g: 0.45, a: 0.001, dt: 5 });
    v.tone({ f: 3530, d: 0.7, g: 0.2 });
    v.tone({ f: 5274, d: 0.35, g: 0.1 });
    v.bell({ f: 2637, ratio: 2.4, idx: 1.5, d: 0.25, g: 0.28 });
    v.tone({ f: 3951, t: 0.07, d: 0.3, g: 0.12 });
    v.tone({ f: 5274, t: 0.13, d: 0.3, g: 0.08 });
  },
  guard_break: (v, r) => {
    v.noise({ d: 0.5, g: 0.9, a: 0.001, ft: 'highpass', ff: 2400, wide: true });
    v.noise({ k: 'p', d: 0.25, g: 1.2, ft: 'lowpass', ff: 1500, ff2: 300 });
    v.tone({ w: 'sawtooth', f: 1500, f2: 160, d: 0.4, g: 0.4, lp: 3000 });
    v.tone({ f: 110, f2: 45, d: 0.3, g: 0.45 });
    for (let i = 0; i < 6; i++) v.tone({ f: r.range(2200, 6800), t: r.range(0, 0.16), d: r.range(0.08, 0.25), g: 0.3 });
  },

  // -- reading a fight --
  // A heavy blow coming at you. Kept soft and mid-range: it has to be heard
  // over a fight without being one more bright sound on top of it.
  tell: (v) => {
    // Parry: two quick rising glints.
    v.tone({ w: 'triangle', f: 740, d: 0.07, g: 0.7, a: 0.003 });
    v.tone({ w: 'triangle', f: 988, t: 0.075, d: 0.12, g: 0.75, a: 0.003 });
    v.tone({ f: 1976, t: 0.075, d: 0.08, g: 0.08 });
  },
  tell_dodge: (v) => {
    // A guard breaker (or a heavy gun): a low double thrum. Get out of the way.
    for (const t of [0, 0.09]) {
      v.tone({ w: 'square', f: 196, t, d: 0.075, g: 0.5, s: 'flat', lp: 900 });
      v.tone({ f: 98, t, d: 0.075, g: 0.6, s: 'flat' });
    }
  },
  momentum: (v) => {
    // A blow thrown out of a boost: a rising rush, the run-up going into it.
    v.noise({ d: 0.22, g: 1.4, s: 'swell', a: 0.16, ft: 'bandpass', ff: 500, ff2: 2400, fq: 1.6, wide: true });
    v.noise({ k: 'p', d: 0.2, g: 1.2, s: 'swell', a: 0.15, ft: 'bandpass', ff: 300, ff2: 900, fq: 1.2 });
    v.tone({ w: 'triangle', f: 330, f2: 660, d: 0.18, g: 0.12, s: 'swell', a: 0.15 });
  },
  momentum_hit: (v) => {
    // A momentum strike landing: a heavy hit with a boom under it.
    v.tone({ f: 120, f2: 30, ft: 0.22, d: 0.5, g: 1, a: 0.002 });
    v.noise({ k: 'p', d: 0.36, g: 2.8, a: 0.001, ft: 'lowpass', ff: 2200, ff2: 180, fq: 0.9, wide: true });
    v.noise({ d: 0.025, g: 0.6, ft: 'highpass', ff: 2800 });
    v.bell({ f: 330, ratio: 2.76, idx: 4, d: 0.36, g: 0.45 });
    v.noise({ t: 0.02, d: 0.2, g: 1.2, ft: 'bandpass', ff: 900, fq: 1.4, am: 60 });
  },
  ringout: (v) => {
    // Thrown into the barrier: a deep clang, the field crackling, a thump.
    v.bell({ f: 180, ratio: 3.53, idx: 6, d: 0.7, g: 0.8 });
    v.bell({ f: 412, ratio: 1.83, idx: 3, d: 0.4, g: 0.35 });
    v.tone({ f: 110, f2: 34, ft: 0.25, d: 0.55, g: 0.9, a: 0.002 });
    v.noise({ k: 'p', d: 0.3, g: 2, a: 0.001, ft: 'lowpass', ff: 1800, ff2: 200 });
    v.noise({ t: 0.03, d: 0.45, g: 0.9, s: 'swell', a: 0.05, ft: 'bandpass', ff: 1400, ff2: 700, fq: 2.2, am: 85, wide: true });
  },

  // -- guns --
  shot_carbine: (v) => {
    v.tone({ w: 'sawtooth', f: 2100, f2: 280, ft: 0.08, d: 0.11, g: 0.7, a: 0.001, lp: 5000 });
    v.tone({ w: 'square', f: 1050, f2: 140, d: 0.09, g: 0.3, lp: 3000 });
    v.noise({ d: 0.035, g: 0.6, ft: 'highpass', ff: 3500 });
    v.tone({ f: 180, f2: 70, d: 0.07, g: 0.5 });
  },
  shot_scatter: (v) => {
    v.noise({ d: 0.32, g: 1.3, a: 0.001, ft: 'lowpass', ff: 6500, ff2: 600, fq: 0.7, wide: true });
    v.noise({ k: 'p', d: 0.4, g: 1.2, ft: 'lowpass', ff: 900, ff2: 200 });
    v.tone({ f: 170, f2: 45, d: 0.2, g: 0.7 });
    v.tone({ w: 'sawtooth', f: 1500, f2: 180, d: 0.14, g: 0.3, lp: 4000 });
    v.tone({ w: 'sawtooth', f: 1150, f2: 120, d: 0.17, g: 0.25, lp: 3500 });
  },
  bullet_hit: (v) => {
    v.noise({ d: 0.025, g: 0.9, ft: 'highpass', ff: 4200 });
    v.tone({ f: 3300, f2: 2100, d: 0.045, g: 0.5 });
    v.bell({ f: 2500, ratio: 1.7, idx: 2, d: 0.05, g: 0.3 });
  },

  // -- collisions --
  wall: (v) => {
    v.bell({ f: 320, ratio: 3.53, idx: 5, d: 0.38, g: 0.6 });
    v.bell({ f: 742, ratio: 1.83, idx: 3, d: 0.22, g: 0.3 });
    v.noise({ d: 0.3, g: 1.2, a: 0.002, ft: 'bandpass', ff: 2600, ff2: 1500, fq: 2.5, am: 58 });
    v.tone({ f: 150, f2: 70, d: 0.12, g: 0.6 });
    v.noise({ d: 0.02, g: 0.5, ft: 'highpass', ff: 2500 });
  },
  bump: (v) => {
    v.tone({ f: 190, f2: 75, d: 0.14, g: 0.75, a: 0.002 });
    v.tone({ w: 'triangle', f: 520, f2: 240, d: 0.09, g: 0.8, a: 0.001 });
    v.noise({ d: 0.06, g: 3.5, ft: 'bandpass', ff: 850, fq: 1.8 });
  },
  ko: (v) => {
    v.noise({ d: 0.05, g: 0.8, ft: 'highpass', ff: 2000 });
    v.noise({ k: 'p', d: 3.4, g: 2.2, a: 0.004, h: 0.12, ft: 'lowpass', ff: 5000, ff2: 110, fs: 2.4, fq: 0.7, wide: true });
    v.noise({ d: 1.6, g: 1.5, a: 0.004, ft: 'bandpass', ff: 2400, ff2: 400, fq: 0.9, wide: true });
    v.tone({ f: 95, f2: 28, ft: 0.9, d: 1.8, g: 0.75, a: 0.003 });
    v.tone({ w: 'triangle', f: 55, f2: 38, t: 0.1, d: 1.4, g: 0.3 });
    v.noise({ k: 'p', t: 0.14, d: 1.4, g: 1.2, ft: 'lowpass', ff: 2500, ff2: 180, wide: true });
    v.tone({ f: 120, f2: 40, t: 0.14, d: 0.6, g: 0.6 });
    v.noise({ t: 0.2, d: 2, g: 0.6, ft: 'bandpass', ff: 3200, ff2: 1200, fq: 3, am: 23 });
  },
  critical: (v) => {
    // A tritone back and forth: reads as a warning without being shrill.
    [1318.5, 932.3, 1318.5, 932.3].forEach((f, i) => {
      v.tone({ w: 'square', f, t: i * 0.095, d: 0.085, g: 0.4, s: 'flat', lp: 3200 });
      v.tone({ f: f / 2, t: i * 0.095, d: 0.085, g: 0.3, s: 'flat' });
    });
  },

  // -- race events --
  lap: (v) => {
    // E then B: both belong to every key the race music uses.
    v.bell({ f: 1318.5, ratio: 3.5, idx: 0.9, d: 0.5, g: 0.6 });
    v.bell({ f: 1975.5, ratio: 3.5, idx: 0.7, t: 0.09, d: 0.7, g: 0.6 });
    v.tone({ f: 3951, t: 0.09, d: 0.35, g: 0.1 });
  },
  lap_phase: (v) => {
    // "Dun-DUNN": a low G stab falling onto A minor, with a boom and a crash.
    const stab = (t: number, d: number, notes: number[], g: number): void => {
      notes.forEach((m, i) => v.tone({ w: 'sawtooth', f: mtof(m), t, d, g, lp: 1700, h: d * 0.3, a: 0.006, dt: i % 2 ? 8 : -8 }));
    };
    stab(0, 0.2, [43, 50, 55], 0.4);
    stab(0.24, 1.3, [45, 52, 57, 60], 0.42);
    v.tone({ f: 82, f2: 41, t: 0, d: 0.25, g: 0.8 });
    v.tone({ f: 110, f2: 55, ft: 0.5, t: 0.24, d: 0.9, g: 1 });
    v.noise({ t: 0.24, d: 1.4, g: 0.35, ft: 'highpass', ff: 4500, wide: true });
    v.noise({ k: 'p', t: 0.24, d: 0.5, g: 1, ft: 'lowpass', ff: 900, ff2: 150 });
  },
  final_lap: (v) => {
    // A riser and a run up to an open B chord, announcing the lifted key.
    v.noise({ d: 0.62, g: 0.5, s: 'swell', a: 0.58, ft: 'bandpass', ff: 700, ff2: 7000, fq: 1.5, wide: true });
    v.tone({ w: 'sawtooth', f: 220, f2: 987.8, d: 0.6, g: 0.25, s: 'swell', a: 0.56, lp: 3000 });
    [76, 81, 83, 86, 88, 93].forEach((m, i) => v.tone({ w: 'square', f: mtof(m), t: 0.1 + i * 0.075, d: 0.16, g: 0.3, lp: 5000 }));
    const T = 0.55;
    for (const [m, g] of [[83, 0.5], [88, 0.45], [95, 0.36]]) {
      v.tone({ w: 'sawtooth', f: mtof(m), t: T, d: 1.1, g: g * 0.45, lp: 4500, h: 0.3, dt: 6 });
      v.tone({ f: mtof(m), t: T, d: 1.2, g, h: 0.3 });
    }
    v.noise({ t: T, d: 1.0, g: 0.3, ft: 'highpass', ff: 6000, wide: true });
    v.tone({ f: mtof(47), t: T, d: 0.8, g: 0.7 });
  },
  finish: (v) => {
    // Ta-ta-ta-TAAA in D major, the key of the speed lap.
    brass(v, 81, 0, 0.08, 0.5);
    brass(v, 81, 0.1, 0.08, 0.5);
    brass(v, 81, 0.2, 0.08, 0.5);
    brass(v, 86, 0.3, 0.95, 0.55);
    brass(v, 78, 0.3, 0.95, 0.35);
    brass(v, 74, 0.3, 0.95, 0.35);
    v.tone({ w: 'triangle', f: mtof(50), t: 0.3, d: 0.9, g: 0.5, h: 0.3 });
    v.tone({ f: 150, f2: 60, t: 0.3, d: 0.3, g: 0.7 });
    v.noise({ t: 0.3, d: 1.1, g: 0.3, ft: 'highpass', ff: 5000, wide: true });
  },
  win: (v) => {
    // Up the D major arpeggio, then IV-V-I.
    const tune: Array<[number, number, number]> = [
      [69, 0, 0.13], [74, 0.14, 0.13], [78, 0.28, 0.13], [81, 0.42, 0.3],
      [79, 0.74, 0.13], [81, 0.88, 0.13], [85, 1.02, 0.3], [86, 1.34, 1.3],
    ];
    for (const [m, t, d] of tune) {
      brass(v, m, t, d, 0.5);
      v.bell({ f: mtof(m + 12), ratio: 3.5, idx: 0.6, t, d: Math.max(0.3, d), g: 0.14 });
    }
    const chords: Array<[number[], number, number]> = [
      [[62, 66, 69], 0, 0.72], [[62, 67, 71], 0.74, 0.26], [[64, 69, 73], 1.02, 0.3], [[62, 66, 69, 74], 1.34, 1.3],
    ];
    for (const [notes, t, d] of chords) for (const m of notes) v.tone({ w: 'sawtooth', f: mtof(m), t, d, g: 0.12, lp: 1800, h: d * 0.6, a: 0.01 });
    const bass: Array<[number, number, number]> = [[50, 0, 0.7], [43, 0.74, 0.26], [45, 1.02, 0.3], [38, 1.34, 1.3]];
    for (const [m, t, d] of bass) v.tone({ w: 'triangle', f: mtof(m), t, d, g: 0.34, h: d * 0.5, a: 0.005 });
    v.tone({ f: 150, f2: 55, t: 0, d: 0.25, g: 0.6 });
    v.tone({ f: 150, f2: 50, t: 1.34, d: 0.4, g: 0.8 });
    v.noise({ t: 1.34, d: 1.3, g: 0.3, ft: 'highpass', ff: 5000, wide: true });
  },
  lose: (v) => {
    // Stepping down B minor: rueful, not grim.
    const tune: Array<[number, number, number]> = [[78, 0, 0.38], [76, 0.4, 0.38], [74, 0.8, 0.38], [73, 1.2, 0.38], [71, 1.6, 1.2]];
    for (const [m, t, d] of tune) flute(v, m, t, d, 0.6);
    const chords: Array<[number[], number, number]> = [
      [[59, 62, 66], 0, 0.78], [[55, 59, 62], 0.8, 0.38], [[57, 61, 64], 1.2, 0.38], [[59, 62, 66], 1.6, 1.2],
    ];
    for (const [notes, t, d] of chords) for (const m of notes) v.tone({ w: 'triangle', f: mtof(m), t, d, g: 0.12, h: d * 0.5, a: 0.03 });
    const bass: Array<[number, number, number]> = [[47, 0, 0.78], [43, 0.8, 0.38], [45, 1.2, 0.38], [47, 1.6, 1.2]];
    for (const [m, t, d] of bass) v.tone({ w: 'triangle', f: mtof(m), t, d, g: 0.28, h: d * 0.4, a: 0.02 });
  },

  // -- radio --
  command: (v) => {
    v.noise({ d: 0.02, g: 0.7, ft: 'bandpass', ff: 2200, fq: 1.5 });
    for (let i = 0; i < 3; i++) v.tone({ f: 1568, t: 0.05 + i * 0.04, d: 0.027, g: 0.55, s: 'flat', a: 0.002 });
    v.noise({ t: 0.04, d: 0.15, g: 0.14, s: 'flat', ft: 'bandpass', ff: 2600, fq: 0.8 });
  },
  comms: (v) => {
    v.noise({ d: 0.22, g: 1.6, s: 'flat', a: 0.004, ft: 'bandpass', ff: 2000, fq: 1.6 });
    v.noise({ d: 0.22, g: 0.5, s: 'flat', ft: 'bandpass', ff: 3400, fq: 3 });
    v.tone({ w: 'square', f: 95, d: 0.012, g: 0.5 });
    v.noise({ t: 0.225, d: 0.014, g: 0.9, ft: 'bandpass', ff: 1500, fq: 1 });
  },

  // -- cells and gates --
  gate: (v) => {
    // A up to E. The game raises the pitch as charges are banked, by as much
    // as a fifth, which carries the pair up to the lap chime's E and B. The
    // bells' overtones are octaves, so it stays sweet wherever in between it lands.
    v.noise({ d: 0.1, g: 0.6, s: 'swell', a: 0.035, ft: 'bandpass', ff: 2400, ff2: 7000, fq: 1.4 });
    v.bell({ f: 880, ratio: 3, idx: 0.6, d: 0.14, g: 0.5 });
    v.bell({ f: 1318.5, ratio: 3, idx: 0.6, t: 0.06, d: 0.32, g: 0.6 });
    v.tone({ f: 2637, t: 0.06, d: 0.18, g: 0.1 });
  },
  cells_full: (v) => {
    // The gate's A and E, then the A above to bring it home. The last note
    // rings over the held fifth, with a quick beat high up for the shimmer.
    v.noise({ d: 0.12, g: 0.6, s: 'swell', a: 0.04, ft: 'bandpass', ff: 2400, ff2: 7000, fq: 1.4 });
    v.bell({ f: 880, ratio: 3, idx: 0.6, d: 0.16, g: 0.5 });
    v.bell({ f: 1318.5, ratio: 3, idx: 0.6, t: 0.07, d: 0.2, g: 0.5 });
    v.bell({ f: 1760, ratio: 3, idx: 0.8, t: 0.14, d: 0.8, g: 0.6 });
    v.tone({ w: 'triangle', f: 440, d: 0.4, g: 0.22, a: 0.004, h: 0.1 });
    v.tone({ f: 1318.5, t: 0.14, d: 0.7, g: 0.22 });
    v.tone({ f: 3520, t: 0.14, d: 0.6, g: 0.1, dt: 3 });
    v.tone({ f: 3520, t: 0.14, d: 0.6, g: 0.1, dt: -3 });
    v.noise({ t: 0.14, d: 0.5, g: 0.1, ft: 'highpass', ff: 7000, wide: true });
  },

  // -- abilities --
  overdrive: (v) => {
    // Ignition, the turbine spooling up two octaves to E, a note in every key
    // the race music uses, then the rush of air it leaves behind.
    v.tone({ f: 150, f2: 42, d: 0.34, g: 1, a: 0.003 });
    v.noise({ k: 'p', d: 0.22, g: 1.8, a: 0.002, ft: 'lowpass', ff: 1800, ff2: 250, fq: 0.8 });
    v.noise({ d: 0.03, g: 0.5, ft: 'highpass', ff: 3000 });
    v.tone({ w: 'sawtooth', f: 82.4, f2: 329.6, ft: 0.55, d: 0.6, g: 0.3, s: 'swell', a: 0.25, lp: 1200 });
    v.tone({ w: 'sawtooth', f: 164.8, f2: 659.3, ft: 0.55, d: 0.72, g: 0.26, s: 'swell', a: 0.55, lp: 2000, dt: 9 });
    v.tone({ w: 'sawtooth', f: 164.8, f2: 659.3, ft: 0.55, d: 0.72, g: 0.26, s: 'swell', a: 0.55, lp: 2000, dt: -9 });
    v.tone({ f: 659.3, f2: 2637, ft: 0.55, d: 0.7, g: 0.06, s: 'swell', a: 0.55 });
    v.noise({ k: 'p', d: 0.64, g: 2, s: 'swell', a: 0.56, ft: 'bandpass', ff: 300, ff2: 3200, fq: 1.1, wide: true });
    v.noise({ k: 'p', t: 0.52, d: 0.8, g: 4, a: 0.05, ft: 'bandpass', ff: 3600, ff2: 600, fs: 0.5, fq: 0.6, wide: true });
  },
  breakaway: (v) => {
    // "Shing": air drawn up through a narrow band into a bright ring on E and B, then let go.
    v.noise({ d: 0.13, g: 2.4, s: 'swell', a: 0.085, ft: 'bandpass', ff: 1400, ff2: 9000, fq: 3 });
    v.tone({ f: 2637, t: 0.085, d: 0.6, g: 0.3, a: 0.001 });
    v.tone({ f: 3951, t: 0.085, d: 0.55, g: 0.2, a: 0.001, dt: 6 });
    v.tone({ f: 5274, t: 0.085, d: 0.35, g: 0.1 });
    v.bell({ f: 3951, ratio: 1.5, idx: 1.2, t: 0.085, d: 0.2, g: 0.2 });
    v.noise({ t: 0.085, d: 0.7, g: 0.5, ft: 'bandpass', ff: 7000, ff2: 2500, fq: 0.9, wide: true });
    v.tone({ f: 260, f2: 110, d: 0.09, g: 0.3 });
  },
  snare_shot: (v) => {
    // The carbine's falling zap an octave and more lower, on a thump; then the
    // cable going taut: the partials of a struck bar, sagging as they ring,
    // and a rattle that settles.
    v.tone({ w: 'sawtooth', f: 900, f2: 100, ft: 0.12, d: 0.18, g: 0.6, a: 0.001, lp: 2600 });
    v.tone({ w: 'square', f: 450, f2: 60, d: 0.15, g: 0.3, lp: 1600 });
    v.noise({ d: 0.035, g: 0.6, ft: 'highpass', ff: 2600 });
    v.tone({ f: 150, f2: 50, d: 0.16, g: 0.7 });
    for (const [ratio, g, d] of [[1, 0.45, 0.7], [2.76, 0.3, 0.6], [5.4, 0.16, 0.4]]) {
      v.tone({ w: 'triangle', f: 220 * 1.14 * ratio, f2: 220 * ratio, ft: 0.07, t: 0.01, d, g, a: 0.001 });
    }
    v.bell({ f: 607, ratio: 0.09, idx: 2.2, t: 0.01, d: 0.5, g: 0.3 });
  },
  snared: (v) => {
    // The clamp biting and latching, then a saw and a square a semitone apart
    // wound down together onto the notes of `denied`. The beat between them
    // slows as they fall, like the speed being dragged off.
    v.bell({ f: 240, ratio: 3.53, idx: 5, d: 0.12, g: 0.6 });
    v.noise({ d: 0.03, g: 1, ft: 'bandpass', ff: 1900, fq: 1.5 });
    v.noise({ t: 0.05, d: 0.02, g: 0.6, ft: 'bandpass', ff: 3000, fq: 2 });
    v.tone({ f: 190, f2: 80, d: 0.08, g: 0.6 });
    v.tone({ w: 'sawtooth', f: 440, f2: 146.8, ft: 0.55, t: 0.04, d: 0.7, g: 0.45, a: 0.01, h: 0.35, lp: 1500 });
    v.tone({ w: 'square', f: 466.2, f2: 155.6, ft: 0.55, t: 0.04, d: 0.7, g: 0.28, a: 0.01, h: 0.35, lp: 1100 });
    v.noise({ t: 0.04, d: 0.6, g: 0.7, h: 0.25, ft: 'bandpass', ff: 2400, ff2: 700, fq: 2, am: 48 });
  },
  pulse: (v, r) => {
    // A dull thud, the ring spreading (noise and a tone swept down four octaves) and stray sparks.
    v.tone({ f: 105, f2: 36, d: 0.32, g: 1, a: 0.004 });
    v.noise({ k: 'p', d: 0.2, g: 2, a: 0.004, ft: 'lowpass', ff: 420, ff2: 120 });
    v.noise({ k: 'p', d: 0.7, g: 1.8, s: 'swell', a: 0.05, ft: 'bandpass', ff: 5200, ff2: 180, fq: 1.6, wide: true });
    v.tone({ w: 'sawtooth', f: 1320, f2: 82, d: 0.6, g: 0.2, a: 0.01, lp: 2600 });
    v.noise({ t: 0.03, d: 0.45, g: 0.5, ft: 'bandpass', ff: 3400, fq: 3, am: 53 });
    for (let i = 0; i < 6; i++) v.noise({ t: r.range(0.04, 0.42), d: r.range(0.01, 0.03), g: r.range(0.3, 0.7), ft: 'highpass', ff: r.range(3500, 8000) });
  },
  ram: (v) => {
    // A horn on an open fifth over A, bent up into pitch like a rev, above a growl that climbs an octave.
    const horn = (f: number, g: number, dt: number): void => v.tone({ w: 'sawtooth', f: f * 0.84, f2: f, ft: 0.1, d: 0.64, g, a: 0.015, h: 0.3, lp: 1500, dt });
    horn(110, 0.4, -8);
    horn(110, 0.4, 8);
    horn(164.8, 0.3, 6);
    horn(220, 0.22, -6);
    v.tone({ w: 'sawtooth', f: 55, f2: 110, d: 0.6, g: 0.35, s: 'swell', a: 0.4, lp: 500 });
    v.noise({ k: 'p', d: 0.6, g: 5, s: 'swell', a: 0.35, ft: 'bandpass', ff: 70, ff2: 150, fq: 5 });
    v.tone({ f: 120, f2: 50, d: 0.14, g: 0.7 });
  },
  aegis: (v) => {
    // Rising air, then G major built up from the bottom: the one major triad
    // that A minor, B minor and the menu's D major all contain.
    v.noise({ k: 'p', d: 0.45, g: 1.2, s: 'swell', a: 0.28, ft: 'bandpass', ff: 500, ff2: 3000, fq: 1.2, wide: true });
    v.tone({ f: 196, f2: 392, ft: 0.25, d: 0.45, g: 0.25, s: 'swell', a: 0.25 });
    [67, 71, 74, 79].forEach((midi, i) => {
      const t = 0.06 + i * 0.055;
      v.tone({ w: 'triangle', f: mtof(midi), t, d: 0.68 - t, g: 0.4, a: 0.03, h: 0.2 });
    });
    v.tone({ w: 'triangle', f: mtof(55), t: 0.06, d: 0.6, g: 0.3, a: 0.04, h: 0.2 });
    for (const [midi, dt] of [[86, 5], [86, -5], [91, 5], [91, -5]]) v.tone({ f: mtof(midi), t: 0.2, d: 0.45, g: 0.05, a: 0.04, dt });
    v.noise({ t: 0.2, d: 0.45, g: 0.08, ft: 'highpass', ff: 6000, wide: true });
  },
};

// ---- mixing notes -----------------------------------------------------------

export interface SfxMeta {
  /** Loudness trim, set from the peaks the audio check measures. */
  level: number;
  /** How much goes to the reverb. */
  send: number;
  /** Sounds at 2 are never dropped or stolen when the voice limit is hit. */
  prio: number;
  /** Random pitch spread, so repeats do not sound stamped out. */
  vary: number;
  /** Shortest gap in seconds between two plays of the same sound. */
  gap: number;
  /** Turn the music down by this fraction for this many seconds. */
  duck?: [number, number];
}

const m = (level: number, send = 0, prio = 1, vary = 0, gap = 0.03, duck?: [number, number]): SfxMeta => ({ level, send, prio, vary, gap, duck });

export const SFX_META: Record<SfxName, SfxMeta> = {
  ui_move: m(0.2, 0, 2),
  ui_select: m(0.3, 0.1, 2),
  ui_back: m(0.19, 0.05, 2),
  count_beep: m(0.4, 0.05, 2),
  count_go: m(0.325, 0.2, 2, 0, 0.03, [0.25, 0.5]),
  launch: m(0.6, 0.25, 2),
  boost: m(0.3, 0.1, 1),
  dash: m(0.77, 0.05, 1, 0.05),
  lock: m(0.3, 0.05, 2),
  unlock: m(0.25, 0.05, 2),
  denied: m(0.35, 0, 2),
  swing_light: m(1.0, 0.05, 1, 0.08),
  swing_heavy: m(0.75, 0.08, 1, 0.06),
  hit_light: m(0.4, 0.08, 1, 0.07),
  hit_heavy: m(0.58, 0.12, 1, 0.05),
  block: m(0.52, 0.1, 1, 0.05),
  parry: m(0.4, 0.35, 2, 0.02),
  // Bright sounds trimmed after play: they cut through far more than their peak suggests.
  guard_break: m(0.3, 0.25, 2),
  tell: m(0.5, 0.05, 2, 0, 0.1),
  tell_dodge: m(0.26, 0.03, 2, 0, 0.1),
  momentum: m(0.75, 0.08, 1, 0.04),
  momentum_hit: m(0.36, 0.12, 2, 0.04),
  ringout: m(0.4, 0.2, 2, 0.03),
  shot_carbine: m(0.35, 0.06, 1, 0.05),
  shot_scatter: m(0.5, 0.12, 1, 0.04),
  bullet_hit: m(0.2, 0.04, 0, 0.15, 0.08),
  wall: m(0.38, 0.1, 1, 0.06),
  bump: m(0.45, 0.03, 1, 0.08),
  ko: m(0.6, 0.3, 2, 0, 0.1, [0.3, 0.7]),
  critical: m(0.36, 0.05, 2, 0, 0.5),
  lap: m(0.45, 0.3, 2),
  lap_phase: m(0.4, 0.25, 2, 0, 0.5, [0.4, 1.1]),
  final_lap: m(0.3, 0.3, 2, 0, 0.5, [0.5, 1.3]),
  finish: m(0.29, 0.3, 2, 0, 0.5, [0.45, 1.2]),
  win: m(0.36, 0.3, 2, 0, 1, [0.75, 2.7]),
  lose: m(0.4, 0.35, 2, 0, 1, [0.75, 2.8]),
  command: m(0.41, 0.03, 2),
  comms: m(0.41, 0, 2),
  // No gap for the gate: a rival threading it in the same frame must not swallow the player's own chime.
  gate: m(0.4, 0.15, 1, 0, 0),
  cells_full: m(0.39, 0.3, 2),
  overdrive: m(0.53, 0.15, 2, 0, 0.03, [0.25, 0.9]),
  breakaway: m(0.35, 0.15, 2, 0.02),
  snare_shot: m(0.41, 0.08, 1, 0.04),
  snared: m(0.4, 0.1, 2, 0.03),
  pulse: m(0.55, 0.2, 2, 0.04),
  ram: m(0.38, 0.12, 2),
  aegis: m(0.28, 0.35, 2),
};

export const SFX_NAMES = Object.keys(RECIPES) as SfxName[];

/** Build the nodes for one sound. The caller connects `voice.out` and tracks it. */
export function buildSfx(host: SfxHost, name: SfxName, t0: number, pitch: number): Voice {
  const v = new Voice(host, t0, pitch);
  RECIPES[name](v, host.rng);
  return v;
}
