// Generative music. Each track is a fixed set of oscillators, filters and
// gains built once; playing a note only schedules AudioParam changes, so the
// sequencer creates no nodes while it runs. The clock is the audio context's
// own time: synth.ts calls schedule() every frame and each call queues the
// steps that fall inside the next quarter of a second or so.

import type { Ctx } from './dsp';
import { BLOCK, mtof, Patch, perBlock } from './dsp';
import type { SongInfo } from './song';

/** 'results' is only ever a recorded song (see song.ts SCREEN_SONGS); without one the menu music plays. */
export type TrackName = 'menu' | 'race' | 'results';

export interface TrackInfo {
  name: TrackName;
  /** Which circuit's race music ('meridian', 'canyon', 'helios'); the menu's is 'menu'. */
  style: string;
  /** Arrangement phase (the race track follows the lap phase; the menu is always 1). */
  phase: number;
  bar: number;
  /** Context time of the first bar. */
  startTime: number;
  barDur: number;
  /** Context time at which the current phase began, or -1. */
  changeAt: number;
  /** For a recorded song (song.ts): where it is and what it has done. */
  song?: SongInfo;
}

/** What synth.ts plays: a synthesised track here, or a recorded song (song.ts). */
export interface MusicTrack {
  readonly name: TrackName;
  readonly style: string;
  /** Direct signal and reverb send; synth.ts connects both and fades them together. */
  readonly dry: GainNode;
  readonly wet: GainNode;
  /** Each part's own output, so the audio check can measure the mix. */
  readonly taps: Record<string, AudioNode>;
  /** Queue what is due before now + ahead. `finished`: the race is over for the player. */
  schedule(now: number, lapPhase: number, ahead: number, finished?: boolean): void;
  fade(to: number, now: number, tau: number): void;
  dispose(): void;
  info(): TrackInfo;
  /** Starts again from the top when a new race asks for it, rather than carrying on. */
  readonly restartsWithRace?: boolean;
  /** It cannot play (a song that failed to load): the engine puts the synthesised track on instead. */
  readonly broken?: boolean;
  /** It has played to its end (a song after its ending): the engine moves on to the menu music. */
  readonly done?: boolean;
}

/** Node factory that remembers every running source so a track can be torn down. */
class Kit {
  private readonly srcs: AudioScheduledSourceNode[] = [];
  /** Length of one render block in seconds. */
  readonly block: number;
  /**
   * Pitches and cutoffs are read once at the start of each render block (see
   * perBlock). Note times sit on block boundaries (see Track.schedule), so
   * asking for a change this much early makes it land exactly with the note.
   */
  readonly lead: number;
  constructor(readonly ctx: Ctx) {
    this.block = BLOCK / ctx.sampleRate;
    this.lead = this.block / 2;
  }

  osc(type: OscillatorType, freq: number, cents = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = cents;
    perBlock(o.frequency);
    o.start();
    this.srcs.push(o);
    return o;
  }
  /** Folds its input down to one channel: half the work for every filter after it. */
  mono(): GainNode {
    const g = this.ctx.createGain();
    g.channelCount = 1;
    g.channelCountMode = 'explicit';
    return g;
  }
  loop(buf: AudioBuffer): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start();
    this.srcs.push(s);
    return s;
  }
  gain(value: number, dest?: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    if (dest) g.connect(dest);
    return g;
  }
  filter(type: BiquadFilterType, freq: number, q: number, dest?: AudioNode): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    // Cutoffs move once per render block: see perBlock().
    perBlock(f.frequency);
    if (dest) f.connect(dest);
    return f;
  }
  /** A node that pans its input on the way to `dest` (or `dest` itself where panning is unavailable). */
  pan(p: number, dest: AudioNode): AudioNode {
    if (p === 0 || typeof this.ctx.createStereoPanner !== 'function') return dest;
    const n = this.ctx.createStereoPanner();
    n.pan.value = p;
    n.connect(dest);
    return n;
  }
  /** A tempo-synced echo. Returns the node to feed. */
  echo(time: number, feedback: number, tone: number, dest: AudioNode): AudioNode {
    const d = this.ctx.createDelay(1.5);
    d.delayTime.value = time;
    const lp = this.filter('lowpass', tone, 0.5, d);
    const fb = this.gain(feedback, lp);
    d.connect(fb);
    d.connect(dest);
    const input = this.gain(1, lp);
    return input;
  }
  stop(): void {
    for (const s of this.srcs) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.srcs.length = 0;
  }
}

/** Oscillators into a lowpass into a gain: bass, arpeggio and lead are all this. */
class Mono {
  private readonly oscs: Array<[OscillatorNode, number]> = [];
  private readonly lp: BiquadFilterNode;
  private readonly vca: GainNode;
  private readonly lead: number;

  /** Each wave is [type, frequency ratio, detune in cents, level]. */
  constructor(kit: Kit, waves: Array<[OscillatorType, number, number, number]>, q: number, dest: AudioNode) {
    this.lead = kit.lead;
    this.vca = kit.gain(0, dest);
    this.lp = kit.filter('lowpass', 800, q, this.vca);
    for (const [type, ratio, cents, level] of waves) {
      const o = kit.osc(type, 220 * ratio, cents);
      o.connect(kit.gain(level, this.lp));
      this.oscs.push([o, ratio]);
    }
  }

  /**
   * `cut` is the resting filter cutoff; it starts `env` times higher and
   * falls back over `decay` while the level settles to `sus`. Notes must not
   * overlap: `dur` has to end before the next note starts.
   */
  note(at: number, freq: number, dur: number, vel: number, cut: number, env = 2, decay = 0.05, sus = 0.6, glide = 0): void {
    for (const [o, ratio] of this.oscs) {
      if (glide > 0) o.frequency.setTargetAtTime(freq * ratio, at - this.lead, glide);
      else o.frequency.setValueAtTime(freq * ratio, at - this.lead);
    }
    this.lp.frequency.setValueAtTime(Math.min(12000, cut * env), at - this.lead);
    this.lp.frequency.setTargetAtTime(cut, at, decay);
    const g = this.vca.gain;
    g.setTargetAtTime(vel, at, 0.003);
    g.setTargetAtTime(vel * sus, at + 0.012, decay);
    g.setTargetAtTime(0, at + dur, 0.015);
  }
}

/** A sustained chord: a few voices of paired, detuned saws through one filter. */
class Pad {
  private readonly voices: OscillatorNode[][] = [];
  readonly lp: BiquadFilterNode;
  readonly vca: GainNode;
  private readonly lead: number;

  constructor(kit: Kit, count: number, cutoff: number, dest: AudioNode) {
    this.lead = kit.lead;
    this.vca = kit.gain(0, dest);
    this.lp = kit.filter('lowpass', cutoff, 0.7, this.vca);
    for (let i = 0; i < count; i++) {
      const spread = count > 1 ? (i / (count - 1)) * 2 - 1 : 0;
      const to = kit.gain(1 / count, kit.pan(spread * 0.6, this.lp));
      const a = kit.osc('sawtooth', 220, -7);
      const b = kit.osc('sawtooth', 220, 7);
      a.connect(to);
      b.connect(to);
      this.voices.push([a, b]);
    }
  }

  chord(at: number, notes: readonly number[], shift: number, glide: number): void {
    this.voices.forEach((pair, i) => {
      const f = mtof(notes[i % notes.length] + shift);
      for (const o of pair) o.frequency.setTargetAtTime(f, at - this.lead, glide);
    });
  }
}

abstract class Track {
  /** Direct signal and reverb send; synth.ts connects both and fades them together. */
  readonly dry: GainNode;
  readonly wet: GainNode;
  readonly startTime: number;
  /** Each part's own output, so the audio check can measure the mix. */
  readonly taps: Record<string, AudioNode> = {};
  protected readonly kit: Kit;
  protected bar = 0;
  /** Steps since the start. Step times are start + tick * stepDur, so they never drift. */
  private tick = 0;

  constructor(
    ctx: Ctx,
    readonly name: TrackName,
    readonly style: string,
    protected readonly stepDur: number,
    protected readonly stepsPerBar: number,
    now: number,
  ) {
    this.kit = new Kit(ctx);
    this.dry = this.kit.gain(0);
    this.wet = this.kit.gain(0);
    this.startTime = now + 0.1;
  }

  protected abstract doStep(t: number, step: number, lapPhase: number): void;
  abstract info(): TrackInfo;

  /** Queue every step due before now + ahead. */
  schedule(now: number, lapPhase: number, ahead: number): void {
    let t = this.startTime + this.tick * this.stepDur;
    if (t < now - 0.02) {
      // The game stalled (hidden tab, long frame). Skip what was missed
      // instead of playing it late, staying on the same grid.
      this.tick += Math.ceil((now + 0.03 - t) / this.stepDur);
      t = this.startTime + this.tick * this.stepDur;
    }
    while (t < now + ahead) {
      this.bar = Math.floor(this.tick / this.stepsPerBar);
      // Snap to the render block (under 3 ms), so per-block parameters change with the note.
      this.doStep(Math.round(t / this.kit.block) * this.kit.block, this.tick % this.stepsPerBar, lapPhase);
      this.tick++;
      t = this.startTime + this.tick * this.stepDur;
    }
  }

  fade(to: number, now: number, tau: number): void {
    for (const p of [this.dry.gain, this.wet.gain]) {
      p.cancelScheduledValues(now);
      p.setTargetAtTime(to, now, tau);
    }
  }

  dispose(): void {
    this.kit.stop();
    this.dry.disconnect();
    this.wet.disconnect();
  }

  protected send(from: AudioNode, amount: number): void {
    from.connect(this.kit.gain(amount, this.wet));
  }
}

// ---- race ---------------------------------------------------------------------

interface Chord {
  /** Bass root, MIDI. */
  bass: number;
  /** Close-voiced triad around middle C. */
  pad: readonly [number, number, number];
}

type Wave = [OscillatorType, number, number, number];
type Melody = ReadonlyArray<ReadonlyArray<readonly [number, number, number]>>;

/**
 * One circuit's race music. Every style follows the same arrangement (a
 * sparse formation lap, drums and stabs for the battle lap, the lead and a
 * key change for the speed lap) so the music still tells you where you are
 * in the race; the key, tempo, groove and sounds are its own.
 */
interface RaceStyle {
  bpm: number;
  /** One chord per bar for each lap phase. */
  prog: Record<number, readonly Chord[]>;
  /** Semitones each phase is transposed by. */
  shift: Record<number, number>;
  /** Arpeggio shapes: indices into the chord's six-note ladder, one per eighth note. */
  shapes: ReadonlyArray<readonly number[]>;
  /** Lead arpeggio shapes, one index per sixteenth. */
  leads: ReadonlyArray<readonly number[]>;
  /** Bass lines in semitones above the root, per sixteenth; null rests (keep the kick's steps empty). */
  bass2: ReadonlyArray<number | null>;
  bass3: ReadonlyArray<number | null>;
  /** Kick steps for the battle and speed laps. */
  kicks2: readonly number[];
  kicks3: readonly number[];
  /** A soft extra kick on step 14 every fourth bar. */
  pickup: boolean;
  /** Steps the battle-lap chord stabs land on. */
  stabs: ReadonlySet<number>;
  hatVel: readonly number[];
  /** Steps whose hat rings open. */
  hatOpen: ReadonlySet<number>;
  /** Speed-lap melody over prog[3], as [step, length in steps, MIDI note]. */
  melody: Melody;
  mix: { kick: number; snare: number; hat: number; crash: number; riser: number; bass: number; arp: number; lead: number; pad: number; echo: number };
  bassWaves: Wave[];
  bassQ: number;
  arpWaves: Wave[];
  arpQ: number;
  leadWaves: Wave[];
  leadQ: number;
  padCut: number;
  /** Multiplies every filter cutoff the patterns ask for: darker below 1, brighter above. */
  bright: number;
  /** Kick pitch sweep, start and end in Hz. */
  kickHz: [number, number];
}

// ---- Meridian Skyway: A minor, 138 BPM, the original theme ------------------

const Am: Chord = { bass: 45, pad: [57, 60, 64] };
const F: Chord = { bass: 41, pad: [57, 60, 65] };
const C: Chord = { bass: 48, pad: [55, 60, 64] };
const G: Chord = { bass: 43, pad: [55, 59, 62] };
const Dm: Chord = { bass: 50, pad: [57, 62, 65] };
const Em: Chord = { bass: 40, pad: [55, 59, 64] };
const E: Chord = { bass: 40, pad: [56, 59, 64] };
const Bb: Chord = { bass: 46, pad: [58, 62, 65] };

/** Track mix. The audio check prints what each phase measures at the output. */
const RACE_MIX = { kick: 0.55, snare: 1.35, hat: 0.5, crash: 0.5, riser: 0.6, bass: 0.45, arp: 0.4, lead: 0.45, pad: 0.4, echo: 0.4 };

const MERIDIAN: RaceStyle = {
  bpm: 138,
  prog: {
    // Formation lap: slow changes, open and expectant.
    1: [Am, Am, F, F, C, C, G, G, Am, Am, F, F, Dm, Dm, Em, Em],
    // Battle lap: a change every bar, the major V and a flat II for bite.
    2: [Am, F, Dm, E, Am, F, Bb, E],
    // Speed lap: the formation chords at double speed, then IV-V-iii-vi.
    3: [Am, F, C, G, F, G, Em, Am],
  },
  // The speed lap lifts a whole tone, to B minor.
  shift: { 1: 0, 2: 0, 3: 2 },
  shapes: [
    [0, 2, 4, 2, 1, 3, 5, 3],
    [0, 1, 2, 3, 4, 3, 2, 1],
    [2, 4, 5, 4, 2, 1, 0, 1],
    [0, 2, 1, 3, 2, 4, 3, 5],
  ],
  leads: [
    [0, 2, 4, 5, 4, 2, 0, 2, 4, 5, 4, 2, 0, 2, 4, 5],
    [5, 4, 2, 4, 5, 4, 2, 0, 2, 4, 5, 4, 2, 0, 2, 4],
    [0, 3, 5, 3, 0, 3, 5, 3, 1, 4, 5, 4, 1, 4, 5, 4],
  ],
  bass2: [null, 0, 0, 0, null, 0, 0, 12, null, 0, 0, 0, null, 0, 12, 0],
  bass3: [null, 0, 12, 0, null, 0, 12, 0, null, 0, 12, 0, null, 0, 12, 12],
  kicks2: [0, 4, 8, 12],
  kicks3: [0, 4, 8, 12],
  pickup: true,
  // 3+3+2.
  stabs: new Set([0, 3, 6, 8, 11, 14]),
  hatVel: [0.5, 0.22, 0.8, 0.27],
  hatOpen: new Set([2, 6, 10, 14]),
  melody: [
    [[0, 3, 76], [3, 3, 81], [6, 2, 79], [8, 4, 76], [12, 2, 72], [14, 2, 74]],
    [[0, 6, 76], [6, 2, 72], [8, 4, 69], [12, 4, 72]],
    [[0, 3, 79], [3, 3, 76], [6, 2, 72], [8, 4, 79], [12, 2, 76], [14, 2, 79]],
    [[0, 6, 74], [6, 2, 71], [8, 4, 74], [12, 2, 79], [14, 2, 81]],
    [[0, 3, 81], [3, 3, 84], [6, 2, 81], [8, 4, 77], [12, 4, 81]],
    [[0, 3, 83], [3, 3, 86], [6, 2, 83], [8, 4, 79], [12, 4, 83]],
    [[0, 6, 83], [6, 2, 79], [8, 4, 76], [12, 2, 79], [14, 2, 83]],
    [[0, 8, 81], [8, 4, 76], [12, 4, 81]],
  ],
  mix: RACE_MIX,
  bassWaves: [['sawtooth', 1, -6, 0.55], ['square', 1, 6, 0.28], ['sine', 1, 0, 0.4]],
  bassQ: 3,
  arpWaves: [['square', 1, 0, 0.5], ['sawtooth', 1, 9, 0.35]],
  arpQ: 1.5,
  leadWaves: [['sawtooth', 1, -7, 0.5], ['sawtooth', 1, 7, 0.5], ['square', 0.5, 0, 0.22]],
  leadQ: 1.2,
  padCut: 700,
  bright: 1,
  kickHz: [220, 47],
};

// ---- Corkscrew Canyon: E Phrygian, 128 BPM, a broken beat ---------------------

const cEm: Chord = { bass: 40, pad: [55, 59, 64] };
const cF: Chord = { bass: 41, pad: [57, 60, 65] };
const cG: Chord = { bass: 43, pad: [55, 59, 62] };
const cDm: Chord = { bass: 38, pad: [57, 62, 65] };
const cC: Chord = { bass: 48, pad: [55, 60, 64] };

const CANYON: RaceStyle = {
  bpm: 128,
  prog: {
    // Formation lap: the tonic leaning on its flat second, low and wary.
    1: [cEm, cEm, cF, cF, cEm, cEm, cDm, cDm, cEm, cEm, cF, cF, cC, cC, cDm, cDm],
    2: [cEm, cF, cEm, cDm, cEm, cF, cG, cF],
    3: [cEm, cF, cG, cF, cEm, cF, cDm, cEm],
  },
  // The speed lap climbs a semitone, to F Phrygian: tighter, not brighter.
  shift: { 1: 0, 2: 0, 3: 1 },
  shapes: [
    [0, 1, 0, 2, 0, 1, 0, 3],
    [0, 2, 1, 0, 3, 1, 2, 0],
    [0, 3, 1, 4, 2, 5, 1, 3],
    [5, 3, 4, 1, 2, 0, 1, 0],
  ],
  leads: [
    [0, 1, 0, 3, 0, 1, 0, 4, 0, 1, 0, 3, 0, 1, 5, 4],
    [0, 0, 3, 0, 0, 4, 0, 0, 5, 0, 4, 0, 3, 0, 1, 0],
    [3, 1, 0, 1, 3, 1, 0, 1, 4, 2, 0, 2, 4, 2, 0, 2],
  ],
  // A galloping line round the broken kick.
  bass2: [null, 0, 0, 12, 0, 0, null, 0, 0, 0, null, 0, 7, 0, 12, 0],
  bass3: [null, 0, 12, null, 0, 12, null, 0, 12, 0, null, 0, 12, 0, 7, 12],
  kicks2: [0, 6, 10],
  kicks3: [0, 3, 6, 10],
  pickup: false,
  stabs: new Set([0, 6, 10, 14]),
  hatVel: [0.45, 0.18, 0.62, 0.3],
  hatOpen: new Set([6, 14]),
  melody: [
    [[0, 3, 76], [3, 3, 77], [6, 2, 76], [8, 4, 74], [12, 4, 71]],
    [[0, 6, 72], [6, 2, 74], [8, 4, 77], [12, 4, 76]],
    [[0, 3, 79], [3, 3, 77], [6, 2, 76], [8, 4, 74], [12, 2, 71], [14, 2, 74]],
    [[0, 8, 77], [8, 4, 76], [12, 4, 72]],
    [[0, 3, 79], [3, 3, 81], [6, 2, 79], [8, 4, 77], [12, 4, 76]],
    [[0, 3, 81], [3, 3, 84], [6, 2, 81], [8, 4, 77], [12, 4, 81]],
    [[0, 6, 77], [6, 2, 74], [8, 4, 81], [12, 2, 77], [14, 2, 74]],
    [[0, 8, 76], [8, 4, 71], [12, 4, 76]],
  ],
  mix: { kick: 0.62, snare: 1.25, hat: 0.45, crash: 0.45, riser: 0.55, bass: 0.5, arp: 0.42, lead: 0.42, pad: 0.42, echo: 0.45 },
  // Growl: a square over a sub an octave down, through a resonant filter.
  bassWaves: [['square', 1, -4, 0.5], ['sawtooth', 0.5, 0, 0.3], ['sine', 0.5, 0, 0.45]],
  bassQ: 5,
  // Plucked: a triangle with a thin square an octave up.
  arpWaves: [['triangle', 1, 0, 0.7], ['square', 2, 4, 0.16]],
  arpQ: 4,
  leadWaves: [['square', 1, -10, 0.42], ['sawtooth', 1, 10, 0.4], ['triangle', 2, 0, 0.14]],
  leadQ: 2,
  padCut: 520,
  bright: 0.8,
  kickHz: [180, 42],
};

// ---- Helios Drop: D major, 145 BPM, uplifting trance --------------------------

const hD: Chord = { bass: 38, pad: [57, 62, 66] };
const hEm: Chord = { bass: 40, pad: [55, 59, 64] };
const hG: Chord = { bass: 43, pad: [55, 59, 62] };
const hA: Chord = { bass: 45, pad: [57, 61, 64] };
const hBm: Chord = { bass: 47, pad: [54, 59, 62] };

const HELIOS: RaceStyle = {
  bpm: 145,
  prog: {
    1: [hD, hD, hA, hA, hBm, hBm, hG, hG, hD, hD, hA, hA, hG, hG, hA, hA],
    // vi-IV-I-V, the anthem changes.
    2: [hBm, hG, hD, hA, hBm, hG, hEm, hA],
    3: [hG, hA, hBm, hBm, hG, hA, hD, hA],
  },
  // The speed lap lifts a whole tone, to E major.
  shift: { 1: 0, 2: 0, 3: 2 },
  shapes: [
    [0, 2, 4, 5, 4, 2, 0, 2],
    [0, 3, 5, 3, 1, 4, 5, 4],
    [0, 2, 4, 2, 5, 4, 2, 0],
    [1, 3, 5, 3, 0, 2, 4, 2],
  ],
  leads: [
    [0, 2, 4, 5, 3, 5, 4, 2, 0, 2, 4, 5, 3, 5, 4, 2],
    [5, 4, 3, 2, 5, 4, 3, 2, 4, 3, 2, 1, 4, 3, 2, 1],
    [0, 3, 5, 3, 0, 3, 5, 3, 0, 2, 4, 2, 0, 2, 5, 4],
  ],
  // Off-beat bass for the battle lap, rolling sixteenths for the speed lap.
  bass2: [null, null, 0, null, null, null, 0, null, null, null, 0, null, null, null, 0, 12],
  bass3: [null, 0, 0, 12, null, 0, 0, 12, null, 0, 0, 12, null, 0, 12, 12],
  kicks2: [0, 4, 8, 12],
  kicks3: [0, 4, 8, 12],
  pickup: false,
  // Gated off-beat chords.
  stabs: new Set([2, 6, 10, 14]),
  hatVel: [0.32, 0.2, 0.95, 0.24],
  hatOpen: new Set([2, 6, 10, 14]),
  melody: [
    [[0, 3, 83], [3, 3, 81], [6, 2, 79], [8, 4, 78], [12, 2, 79], [14, 2, 81]],
    [[0, 6, 81], [6, 2, 76], [8, 4, 78], [12, 4, 81]],
    [[0, 3, 83], [3, 3, 86], [6, 2, 85], [8, 4, 83], [12, 4, 78]],
    [[0, 8, 78], [8, 4, 81], [12, 4, 83]],
    [[0, 3, 86], [3, 3, 83], [6, 2, 79], [8, 4, 83], [12, 2, 86], [14, 2, 88]],
    [[0, 3, 85], [3, 3, 81], [6, 2, 76], [8, 4, 81], [12, 4, 85]],
    [[0, 6, 86], [6, 2, 85], [8, 4, 81], [12, 2, 78], [14, 2, 81]],
    [[0, 8, 85], [8, 4, 81], [12, 4, 76]],
  ],
  mix: { kick: 0.58, snare: 1.15, hat: 0.5, crash: 0.55, riser: 0.65, bass: 0.42, arp: 0.36, lead: 0.4, pad: 0.42, echo: 0.42 },
  bassWaves: [['sawtooth', 1, -5, 0.5], ['sawtooth', 1, 5, 0.35], ['sine', 0.5, 0, 0.45]],
  bassQ: 2,
  // Supersaw-ish: two saws a quarter-tone apart.
  arpWaves: [['sawtooth', 1, -12, 0.42], ['sawtooth', 1, 12, 0.42]],
  arpQ: 1.2,
  leadWaves: [['sawtooth', 1, -14, 0.38], ['sawtooth', 1, 0, 0.32], ['sawtooth', 1, 14, 0.38], ['square', 2, 0, 0.1]],
  leadQ: 1,
  padCut: 1000,
  bright: 1.25,
  kickHz: [240, 50],
};

const STYLES: Record<string, RaceStyle> = { meridian: MERIDIAN, canyon: CANYON, helios: HELIOS };

/** The circuits that have race music of their own. */
export const RACE_STYLES = Object.keys(STYLES);

const ladder = (ch: Chord, i: number): number => ch.pad[i % 3] + (i >= 3 ? 12 : 0);

class RaceTrack extends Track {
  private phase = 1;
  private phaseStart = 0;
  private changeAt = -1;
  /** True from the moment a new lap phase is asked for until the bar line where it starts. */
  private building = false;

  private readonly kickOsc: OscillatorNode;
  private readonly kickG: AudioParam;
  private readonly clickG: AudioParam;
  private readonly hatG: AudioParam;
  private readonly snareG: AudioParam;
  private readonly snareOsc: OscillatorNode;
  private readonly snareToneG: AudioParam;
  private readonly crashG: AudioParam;
  private readonly riserBp: BiquadFilterNode;
  private readonly riserG: AudioParam;
  private readonly bass: Mono;
  private readonly arp: Mono;
  private readonly lead: Mono;
  private readonly pad: Pad;
  private readonly kickPatch: Patch;
  private readonly snarePatch: Patch;
  private readonly leadPatch: Patch;
  private readonly st: RaceStyle;

  constructor(ctx: Ctx, white: AudioBuffer, now: number, style: string) {
    const st = STYLES[style] ?? MERIDIAN;
    super(ctx, 'race', STYLES[style] ? style : 'meridian', 60 / st.bpm / 4, 16, now);
    this.st = st;
    const RACE_MIX = st.mix;
    const k = this.kit;
    const dry = this.dry;

    // Drums: one sine for the kick, and one noise loop shared by everything
    // else. Kick and snare sit behind patches that are only plugged in from
    // the battle lap on (and for the roll that leads into it).
    const kickBus = k.gain(1);
    this.kickPatch = new Patch(kickBus, dry);
    this.kickOsc = k.osc('sine', 50);
    const kickG = k.gain(0, kickBus);
    this.kickOsc.connect(kickG);
    this.kickG = kickG.gain;

    const noise = k.loop(white);
    const dust = k.mono();
    noise.connect(dust);
    // A tick of noise on each kick, so it still reads on speakers with no bass.
    const clickG = k.gain(0, kickBus);
    dust.connect(k.filter('bandpass', 2600, 1.2, clickG));
    this.clickG = clickG.gain;
    const hatG = k.gain(0, k.pan(0.25, dry));
    dust.connect(k.filter('highpass', 7200, 0.7, hatG));
    this.hatG = hatG.gain;

    const snareOut = k.gain(1, dry);
    this.send(snareOut, 0.14);
    const snareBus = k.gain(1);
    this.snarePatch = new Patch(snareBus, snareOut);
    const snareG = k.gain(0, snareBus);
    dust.connect(k.filter('bandpass', 1900, 0.7, snareG));
    this.snareG = snareG.gain;
    this.snareOsc = k.osc('triangle', 190);
    const snareToneG = k.gain(0, snareBus);
    this.snareOsc.connect(snareToneG);
    this.snareToneG = snareToneG.gain;

    // Crash and riser keep the noise in stereo: they are meant to be wide.
    const crashG = k.gain(0, dry);
    noise.connect(k.filter('highpass', 5200, 0.7, crashG));
    this.crashG = crashG.gain;
    this.send(crashG, 0.3);

    const riserG = k.gain(0, dry);
    this.riserBp = k.filter('bandpass', 600, 1.6, riserG);
    noise.connect(this.riserBp);
    this.riserG = riserG.gain;
    this.send(riserG, 0.2);

    // Pitched parts.
    const bassOut = k.gain(RACE_MIX.bass, dry);
    this.bass = new Mono(k, st.bassWaves, st.bassQ, bassOut);

    const echoOut = k.gain(RACE_MIX.echo, k.pan(0.35, dry));
    this.send(echoOut, 0.3);
    const echo = k.echo(this.stepDur * 3, 0.36, 2400, echoOut);

    const arpOut = k.gain(RACE_MIX.arp, k.pan(-0.3, dry));
    arpOut.connect(echo);
    this.send(arpOut, 0.2);
    this.arp = new Mono(k, st.arpWaves, st.arpQ, arpOut);

    // The lead only plays on the speed lap, so it is unplugged until then.
    const leadBus = k.gain(1, k.pan(0.15, dry));
    leadBus.connect(k.gain(0.5, echo));
    this.send(leadBus, 0.25);
    const leadOut = k.gain(RACE_MIX.lead);
    this.leadPatch = new Patch(leadOut, leadBus);
    this.lead = new Mono(k, st.leadWaves, st.leadQ, leadOut);

    const padOut = k.gain(RACE_MIX.pad, dry);
    this.send(padOut, 0.35);
    this.pad = new Pad(k, 3, st.padCut, padOut);
    this.pad.chord(this.startTime, st.prog[1][0].pad, 0, 0.001);

    Object.assign(this.taps, { kick: kickG, click: clickG, snare: snareG, snareTone: snareToneG, hat: hatG, crash: crashG, riser: riserG, bass: bassOut, arp: arpOut, lead: leadOut, echo: echoOut, pad: padOut });
  }

  info(): TrackInfo {
    return { name: this.name, style: this.style, phase: this.phase, bar: this.bar, startTime: this.startTime, barDur: this.stepDur * 16, changeAt: this.changeAt };
  }

  private kick(t: number, vel: number): void {
    const RACE_MIX = this.st.mix;
    const f = this.kickOsc.frequency;
    f.setValueAtTime(this.st.kickHz[0], t - this.kit.lead);
    f.exponentialRampToValueAtTime(this.st.kickHz[1], t + 0.13);
    this.kickG.setTargetAtTime(vel * RACE_MIX.kick, t, 0.0015);
    this.kickG.setTargetAtTime(0, t + 0.11, 0.06);
    this.clickG.setTargetAtTime(vel * RACE_MIX.kick * 1.3, t, 0.0005);
    this.clickG.setTargetAtTime(0, t + 0.002, 0.004);
  }

  /** Noise snare with a clap's double strike and a short tuned thump underneath. */
  private snare(t: number, vel: number): void {
    const v = vel * this.st.mix.snare;
    this.snareG.setTargetAtTime(v, t, 0.001);
    this.snareG.setTargetAtTime(v * 0.25, t + 0.006, 0.003);
    this.snareG.setTargetAtTime(v, t + 0.014, 0.001);
    this.snareG.setTargetAtTime(0, t + 0.024, 0.05);
    const f = this.snareOsc.frequency;
    f.setValueAtTime(235, t - this.kit.lead);
    f.exponentialRampToValueAtTime(170, t + 0.05);
    this.snareToneG.setTargetAtTime(v * 0.22, t, 0.001);
    this.snareToneG.setTargetAtTime(0, t + 0.012, 0.03);
  }

  private hat(t: number, vel: number, open: boolean): void {
    this.hatG.setTargetAtTime(vel * this.st.mix.hat, t, 0.0008);
    this.hatG.setTargetAtTime(0, t + 0.004, open ? 0.06 : 0.013);
  }

  private crash(t: number, vel: number): void {
    this.crashG.setTargetAtTime(vel * this.st.mix.crash, t, 0.002);
    this.crashG.setTargetAtTime(0, t + 0.02, 0.4);
  }

  /** Noise sweeping up from `t` to the end of the bar. */
  private rise(t: number, step: number, amount: number): void {
    const end = t + (16 - step) * this.stepDur;
    const f = this.riserBp.frequency;
    // A build-up can be asked for while a turnaround's sweep is already queued.
    f.cancelScheduledValues(t);
    this.riserG.cancelScheduledValues(t);
    f.setValueAtTime(500, t);
    f.exponentialRampToValueAtTime(6500, end);
    this.riserG.setValueAtTime(0.0001, t);
    this.riserG.exponentialRampToValueAtTime(this.st.mix.riser * amount, end);
    this.riserG.setTargetAtTime(0, end, 0.03);
  }

  protected doStep(t: number, step: number, lapPhase: number): void {
    const want = lapPhase >= 3 ? 3 : lapPhase >= 2 ? 2 : 1;
    if (step === 0) {
      // Arrangement changes only ever happen here, on a bar line.
      if (want !== this.phase) {
        this.phase = want;
        this.phaseStart = this.bar;
        this.changeAt = t;
        this.crash(t, want > 1 ? 1 : 0.5);
      }
      this.building = false;
    } else if (want !== this.phase && !this.building) {
      // A new phase is coming at the next bar line: build into it.
      this.building = true;
      this.rise(t, step, 1);
    }

    const ph = this.phase;
    const pb = this.bar - this.phaseStart;
    const cyc = pb % 16;
    // Plug in only what this phase (or the one being built towards) plays.
    this.kickPatch.set(ph >= 2, t, 3);
    this.snarePatch.set(ph >= 2 || want >= 2 || this.building, t, 3);
    this.leadPatch.set(ph === 3, t, 3);
    const st = this.st;
    const B = st.bright;
    const prog = st.prog[ph];
    const ch = prog[pb % prog.length];
    const sh = st.shift[ph];
    const sd = this.stepDur;
    // Two slow, unrelated sweeps keep filters moving so no two passes sound the same.
    const breath = 0.5 - 0.5 * Math.cos((pb / 16) * Math.PI * 2);
    const breath2 = 0.5 - 0.5 * Math.cos((pb / 12) * Math.PI * 2);
    // Every sixteenth bar is a turnaround: the kick drops out under a snare roll.
    const turn = ph >= 2 && cyc === 15;
    const roll = (this.building || turn) && step >= 8;

    if (step === 0) {
      this.pad.chord(t, ch.pad, sh, 0.012);
      this.pad.lp.frequency.setTargetAtTime((ph === 1 ? 520 + 480 * breath : ph === 2 ? 800 + 400 * breath : 1300 + 500 * breath) * B, t, 0.25);
      if (ph === 1) this.pad.vca.gain.setTargetAtTime(0.75 + 0.25 * breath, t, 0.5);
      else if (ph === 2 && pb < 4) this.pad.vca.gain.setTargetAtTime(0.6, t, 0.1);
      // Mark the eight-bar sections: a sweep into each one and a crash on its first beat.
      if (turn) this.rise(t + 8 * sd, 8, 0.6);
      else if (ph === 1 && cyc % 8 === 7) this.rise(t + 8 * sd, 8, 0.3);
      else if (cyc % 8 === 0 && pb > 0) this.crash(t, ph === 1 ? 0.3 : 0.7);
    }

    // -- drums --
    if (ph >= 2) {
      if ((ph === 2 ? st.kicks2 : st.kicks3).includes(step)) {
        if (!roll) this.kick(t, 1);
      } else if (st.pickup && step === 14 && cyc % 4 === 3 && !turn) {
        this.kick(t, 0.7);
      }
    }
    if (roll) this.snare(t, 0.3 + (0.6 * (step - 8)) / 7);
    else if (ph >= 2 && (step === 4 || step === 12)) this.snare(t, 1);
    else if (ph >= 2 && cyc % 8 === 7 && (step === 10 || step === 15)) this.snare(t, 0.4);

    if (ph === 1) {
      if (pb >= 2) {
        if (step % 2 === 0) this.hat(t, step % 4 === 2 ? 1 : 0.5, pb >= 8 && step % 8 === 6);
        else if (step === 15 && pb % 2 === 1) this.hat(t, 0.3, false);
      }
    } else {
      this.hat(t, st.hatVel[step % 4] * (ph === 3 ? 1.15 : 1), st.hatOpen.has(step));
    }

    // -- bass --
    if (ph === 1) {
      if (step % 2 === 0) {
        const up = step === 14 && pb % 2 === 1 ? 12 : 0;
        this.bass.note(t, mtof(ch.bass + sh + up), sd * 1.2, step % 4 === 0 ? 0.95 : 0.65, (330 + 260 * breath) * B, 2.4, 0.06);
      }
    } else {
      const n = (ph === 2 ? st.bass2 : st.bass3)[step];
      if (n !== null) this.bass.note(t, mtof(ch.bass + sh + n), sd * 0.75, n ? 1 : 0.82, ((ph === 2 ? 420 : 520) + 380 * breath) * B, 3.2, 0.045);
    }

    // -- chords --
    if (ph === 2 && pb >= 4) {
      if (st.stabs.has(step)) {
        this.pad.vca.gain.setTargetAtTime(1, t, 0.004);
        this.pad.vca.gain.setTargetAtTime(0.1, t + 0.09, 0.03);
      }
    } else if (ph === 3 && step % 4 === 0) {
      // Duck on every beat, as if the kick were pushing the pad aside.
      this.pad.vca.gain.setTargetAtTime(0.2, t, 0.005);
      this.pad.vca.gain.setTargetAtTime(0.8, t + 0.05, 0.075);
    }

    // -- arpeggio --
    if (step % 2 === 0) {
      const i = step >> 1;
      if (ph === 1 && pb >= 4) {
        const note = ladder(ch, st.shapes[(pb >> 1) % st.shapes.length][i]) + 12 + sh;
        this.arp.note(t, mtof(note), sd * 1.5, step % 4 === 0 ? 1 : 0.75, (1100 + 900 * breath2) * B, 1.8, 0.07, 0.4);
      } else if (ph === 2 && pb >= 8) {
        const note = ladder(ch, st.shapes[pb % st.shapes.length][i]) + sh;
        this.arp.note(t, mtof(note), sd * 1.5, step % 4 === 0 ? 0.8 : 0.6, (900 + 500 * breath2) * B, 1.8, 0.07, 0.4);
      } else if (ph === 3) {
        const note = ladder(ch, st.shapes[pb % st.shapes.length][i]) + sh;
        this.arp.note(t, mtof(note), sd * 1.5, step % 4 === 0 ? 0.8 : 0.6, (1500 + 700 * breath2) * B, 1.8, 0.07, 0.4);
      }
    }

    // -- lead: eight bars of sixteenth-note arpeggio, then eight of melody --
    if (ph === 3) {
      if (pb % 16 < 8) {
        const note = ladder(ch, st.leads[pb % st.leads.length][step]) + 12 + sh;
        this.lead.note(t, mtof(note), sd * 0.8, step % 4 === 0 ? 0.9 : 0.62, (2300 + 900 * breath) * B, 1.6, 0.05, 0.5);
      } else {
        for (const [at, len, midi] of st.melody[pb % st.melody.length]) {
          if (at === step) this.lead.note(t, mtof(midi + sh), len * sd * 0.92, 0.9, 2600 * B, 1.5, 0.12, 0.75, 0.012);
        }
      }
    }
  }
}

// ---- menu ---------------------------------------------------------------------

const MENU_BPM = 100;

interface MenuChord {
  bass: number;
  pad: readonly number[];
  /** Notes the arpeggio may use, low to high. */
  tones: readonly number[];
}

/** D major, two bars per chord: IV - V - iii - vi - IV - V - I - I. */
const MENU_PROG: readonly MenuChord[] = [
  { bass: 43, pad: [55, 59, 62, 66], tones: [67, 71, 74, 78, 81, 83] },
  { bass: 45, pad: [57, 61, 64, 66], tones: [69, 73, 76, 78, 81, 85] },
  { bass: 42, pad: [54, 57, 61, 64], tones: [66, 69, 73, 76, 78, 81] },
  { bass: 47, pad: [54, 57, 59, 62], tones: [66, 71, 74, 78, 81, 83] },
  { bass: 43, pad: [55, 59, 62, 66], tones: [67, 71, 74, 78, 81, 83] },
  { bass: 45, pad: [57, 61, 64, 66], tones: [69, 73, 76, 78, 81, 85] },
  { bass: 38, pad: [54, 57, 62, 64], tones: [66, 69, 74, 76, 78, 81] },
  { bass: 38, pad: [54, 57, 62, 64], tones: [66, 69, 74, 76, 78, 81] },
];
/** Arpeggio per bar: an index into the chord's tones on each eighth note, or a rest. */
const MENU_SHAPES: ReadonlyArray<ReadonlyArray<number | null>> = [
  [0, null, 2, 3, null, 4, null, 2],
  [1, null, 3, 4, null, 5, null, 3],
  [0, null, 2, 4, null, 3, null, 1],
  [2, null, 4, 5, null, 4, null, 2],
];

const MENU_MIX = { pad: 0.5, bell: 0.53, bass: 0.1, echo: 0.5 };

class MenuTrack extends Track {
  private readonly pad: Pad;
  private readonly bells: Array<{ osc: OscillatorNode; g: AudioParam }> = [];
  private bell = 0;
  private readonly bassOscs: OscillatorNode[];
  private readonly bassG: AudioParam;

  constructor(ctx: Ctx, now: number) {
    super(ctx, 'menu', 'menu', 60 / MENU_BPM / 2, 8, now);
    const k = this.kit;
    const dry = this.dry;

    const padOut = k.gain(MENU_MIX.pad, dry);
    this.send(padOut, 0.5);
    this.pad = new Pad(k, 4, 800, padOut);
    this.pad.chord(this.startTime, MENU_PROG[0].pad, 0, 0.001);

    // Three bell voices taken in turn, so each note can ring over the next two.
    const bellOut = k.gain(MENU_MIX.bell, dry);
    this.send(bellOut, 0.4);
    const echoOut = k.gain(MENU_MIX.echo, k.pan(0.4, bellOut));
    const echo = k.echo(this.stepDur * 1.5, 0.42, 2200, echoOut);
    const bellLp = k.filter('lowpass', 3200, 0.5, k.pan(-0.2, bellOut));
    bellLp.connect(echo);
    for (let i = 0; i < 3; i++) {
      const g = k.gain(0, bellLp);
      const osc = k.osc('triangle', 440);
      osc.connect(g);
      this.bells.push({ osc, g: g.gain });
    }

    const bassOut = k.gain(MENU_MIX.bass, dry);
    const bassG = k.gain(0, bassOut);
    this.bassG = bassG.gain;
    const sub = k.osc('sine', 98);
    const body = k.osc('triangle', 98);
    sub.connect(bassG);
    body.connect(k.gain(0.5, bassG));
    this.bassOscs = [sub, body];

    Object.assign(this.taps, { pad: padOut, bell: bellOut, bass: bassOut });
  }

  info(): TrackInfo {
    return { name: this.name, style: this.style, phase: 1, bar: this.bar, startTime: this.startTime, barDur: this.stepDur * 8, changeAt: -1 };
  }

  private ring(t: number, midi: number, vel: number): void {
    const b = this.bells[this.bell];
    this.bell = (this.bell + 1) % this.bells.length;
    b.osc.frequency.setValueAtTime(mtof(midi), t - this.kit.lead);
    b.g.setTargetAtTime(vel, t, 0.004);
    b.g.setTargetAtTime(0, t + 0.02, 0.28);
  }

  protected doStep(t: number, step: number): void {
    const bar = this.bar;
    const ch = MENU_PROG[(bar >> 1) % MENU_PROG.length];
    const breath = 0.5 - 0.5 * Math.cos((bar / 16) * Math.PI * 2);

    if (step === 0 && bar % 2 === 0) {
      this.pad.chord(t, ch.pad, 0, 0.07);
      this.pad.lp.frequency.setTargetAtTime(650 + 500 * breath, t, 1);
      // Each chord breathes in: dip, then swell.
      this.pad.vca.gain.setTargetAtTime(0.7, t, 0.08);
      this.pad.vca.gain.setTargetAtTime(1, t + 0.2, 0.8);
      for (const o of this.bassOscs) o.frequency.setTargetAtTime(mtof(ch.bass), t - this.kit.lead, 0.03);
      this.bassG.setTargetAtTime(1, t, 0.06);
      this.bassG.setTargetAtTime(0.55, t + 0.4, 1.2);
    }

    const i = MENU_SHAPES[bar % 4][step];
    if (i !== null) this.ring(t, ch.tones[i], step === 0 ? 0.85 : 0.6);
    // A high sparkle to close every fourth bar.
    if (bar % 4 === 3 && step === 6) this.ring(t, ch.tones[5] + 12, 0.3);
  }
}

/** `style` picks the race music: a circuit's theme id ('meridian', 'canyon', 'helios'). */
export function createTrack(name: TrackName, ctx: Ctx, white: AudioBuffer, now: number, style = 'meridian'): MusicTrack {
  return name === 'race' ? new RaceTrack(ctx, white, now, style) : new MenuTrack(ctx, now);
}
