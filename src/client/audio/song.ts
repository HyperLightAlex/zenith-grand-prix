// Recorded race music: a song (made in Suno) whose stems have been mixed down
// into a few layers (tools/music), played so that it builds lap by lap the
// way the synthesised race music does.
//
//   lap 1   the melody and the bass, a little quieter
//   lap 2   the drums come in: the beat, for the fighting
//   lap 3   the rest (Meridian: brass, percussion, effects; Canyon and
//           Helios: percussion and effects): the full song, at full volume,
//           with the kick and bass lifted (a low shelf). A song can also go
//           somewhere else for it (Helios: into its drop; Canyon: its last
//           chorus, a key up; see `finale`)
//   finish  on to the song's ending; once it has played out, the engine
//           moves on to the menu music (see SynthAudio.afterSong)
//
// Each lap is a little louder than the last (the build sets each lap's
// level: -18.5, -17.5 and -15.5 LUFS), but a lap is told from the last by
// what comes in, and the last by its weight too. The layers follow how cleanly
// Suno's stems come apart (they are separated out of the finished mix): some
// were carved out of one another (Meridian's keys, synth, strings and guitar;
// Canyon's guitar, strings, brass, voices and synth), and heard apart each
// has holes where the others were, which sounds hollow, like music down a
// telephone. So they come in together (a tangled stem can still be turned
// down a little on a lap). See tools/music.
//
// Every change waits for the next bar line. The song plays from its start;
// when it reaches the end of its loop it goes back to the loop's start, as
// often as the race needs, and the finish jumps to its ending. All layers
// play from one buffer each, started together, so they can never drift apart.
//
// Experimental: only with ?music=suno in the address (see main.ts). Without
// it, nothing here loads.

import type { MusicTrack, TrackInfo, TrackName } from './music';

/** The songs there are, by circuit: where each one's files are. */
export const SONGS: Record<string, string> = {
  meridian: 'music/meridian/',
  canyon: 'music/canyon/',
  helios: 'music/helios/',
};

/**
 * Songs for screens, by what they are for: the menus ('title', the title
 * theme: the menus' music wherever there is no other), and the results when
 * the player's team has won ('results-win', also the Grand Prix award for
 * first) or lost ('results-loss'). They play whole, every layer in, from the top and then
 * round their loop for as long as the screen is up. Small (one layer), so
 * they are decoded once there is an audio context and kept.
 */
export const SCREEN_SONGS: Record<string, string> = {
  title: 'music/title/',
  'results-win': 'music/results-win/',
  'results-loss': 'music/results-loss/',
};

/** What tools/music/build.py writes as song.json. Times are positions in the layer files, in seconds. */
export interface SongManifest {
  id: string;
  title: string;
  rate: number;
  frames: number;
  layers: Array<{ id: string; file: string }>;
  /** Bar lines from the start up to the loop's end (the last one is the loop's end). */
  bars: number[];
  loop: [number, number];
  /** Where the ending's first bar line is. */
  ending: number;
  end: number;
  /** Each layer's level on laps 1, 2 and 3, in dB; null for silent. */
  laps: Record<string, Array<number | null>>;
  /**
   * A layer heard through a filter on some laps (Meridian: the drums
   * through a high-pass on lap 1, so only the hats play). When the filter
   * comes off, `open` says how: 'sweep' opens it up from the lap change to
   * the bar line, 'cut' drops the whole layer in on the bar line.
   */
  filter: { layer: string; type: 'lowpass' | 'highpass'; hz: number; laps: number[]; open: 'sweep' | 'cut' } | null;
  /**
   * A low shelf on some layers, its boost (dB) on each lap: Meridian's kick
   * and bass come up on the last lap. Optional.
   */
  lowShelf?: { layers: string[]; hz: number; db: number[] } | null;
  /**
   * Optional: a stretch the song jumps to as lap `lap` starts, on the bar
   * line it would have changed on anyway, and loops `loop` from then on
   * (Helios: the build into the drop, then the drop). It lands at the same
   * place in the song's chord cycle as the bar line it leaves from:
   * `entry[bar % cycle]`, where bar is that bar line's number (the bars in
   * the files up to the loop's end are numbered as in the song). Its bar
   * lines follow the loop's end in `bars`. With `phrase`, the lap change
   * (and the jump) waits instead for the next phrase to start: a bar line
   * numbered `first` + n x `bars` (Canyon: its finale is a key change, which
   * sounds meant only on a phrase).
   */
  finale?: { lap: number; cycle: number; entry: number[]; loop: [number, number]; phrase?: { bars: number; first: number } | null } | null;
  /**
   * Optional: semitones to move each race stinger by while this song plays,
   * in place of its circuit's (the stingers are written for Meridian's
   * synthesised music; see STINGER_KEY in game.ts).
   */
  stingers?: Record<string, number> | null;
  /** Gain on the whole song, in dB, to sit it at the synthesised music's level. */
  level: number;
  /** The level of one layer, one byte per millisecond for the first two seconds, from ffmpeg's decoding. */
  sync: { layer: string; env: string };
}

type Phase = 1 | 2 | 3;
const phaseOf = (lapPhase: number): Phase => (lapPhase >= 3 ? 3 : lapPhase >= 2 ? 2 : 1);

/** Seconds of cross-fade at every jump (into the loop, into the ending), ending on the bar line. */
export const XFADE = 0.012;
/** How far ahead the loop's next pass is queued. */
const QUEUE_AHEAD = 3;
/** A lap change heard this soon goes to the bar line after (so there is time to build into it). */
const CHANGE_LEAD = 0.3;
/** How far ahead the song is queued while looking for a phrase's first bar line (see SongManifest.finale). */
const PHRASE_AHEAD = 15;
/** Where a sweep takes the filter before the layer goes over to its direct path. */
const OPEN_HZ = { lowpass: 20000, highpass: 20 } as const;
/** The pause after the ending's last note before the engine moves on to the menu music. */
export const AFTER_ENDING = 0.6;
/** Most a browser's decoder is allowed to differ from ffmpeg's in where it starts the audio. */
const MAX_SHIFT_MS = 60;

// ---- the timeline ---------------------------------------------------------------

/**
 * One stretch of the song: file position `from` plays at context time `at`,
 * until position `until` (the loop's end for the song's body, the files' end
 * for the ending).
 */
export interface Segment {
  at: number;
  from: number;
  until: number;
  kind: 'body' | 'ending';
}

export interface SongMap {
  bars: number[];
  loop: [number, number];
  ending: number;
  end: number;
}

/**
 * Where the song is when: the stretches of it queued against the audio
 * clock. No Web Audio here, so it can be tested on its own.
 */
export class SongPlan {
  readonly segs: Segment[] = [];
  /** The stretch being looped: the map's loop, or the one a jump() went on to. */
  loop: [number, number];
  constructor(readonly map: SongMap) {
    this.loop = map.loop;
  }

  endOf(s: Segment): number {
    return s.at + (s.until - s.from);
  }

  start(at: number, from = 0): Segment {
    const seg: Segment = { at, from, until: this.loop[1], kind: 'body' };
    this.segs.push(seg);
    return seg;
  }

  /** The stretch playing at context time `t`: the last to have started by then, if it has not ended. */
  segAt(t: number): Segment | null {
    for (let i = this.segs.length - 1; i >= 0; i--) {
      const s = this.segs[i];
      if (s.at <= t + 1e-9) return t < this.endOf(s) ? s : null;
    }
    return null;
  }

  /** The file position playing at context time `t`, or null if nothing is. */
  posAt(t: number): number | null {
    const s = this.segAt(t);
    return s ? s.from + (t - s.at) : null;
  }

  /** The bar number at context time `t` (-1 before the first bar line, or in the ending). */
  barAt(t: number): number {
    const s = this.segAt(t);
    if (!s || s.kind === 'ending') return -1;
    const p = s.from + (t - s.at);
    const bars = this.map.bars;
    let i = -1;
    while (i + 1 < bars.length && bars[i + 1] <= p + 1e-9) i++;
    return i;
  }

  /**
   * Queue the loop's next pass once the last stretch ends before `by`.
   * Returns the stretches added.
   */
  extend(by: number): Segment[] {
    const added: Segment[] = [];
    for (;;) {
      const last = this.segs[this.segs.length - 1];
      if (!last || last.kind !== 'body') return added;
      const t = this.endOf(last);
      if (t > by) return added;
      const seg: Segment = { at: t, from: this.loop[0], until: this.loop[1], kind: 'body' };
      this.segs.push(seg);
      added.push(seg);
    }
  }

  /** The first bar line at or after context time `t`, in the stretches queued so far. */
  nextBar(t: number): { at: number; bar: number } | null {
    const bars = this.map.bars;
    for (const s of this.segs) {
      if (s.kind !== 'body' || this.endOf(s) < t - 1e-9) continue;
      const p = s.from + Math.max(0, t - s.at);
      for (let i = 0; i < bars.length; i++) {
        if (bars[i] >= p - 1e-9 && bars[i] <= s.until + 1e-9) return { at: s.at + (bars[i] - s.from), bar: i };
      }
    }
    return null;
  }

  /**
   * The ending, from the first bar line at or after `t`: whatever was queued
   * to start from then on is dropped, and what is playing stops there.
   */
  finish(t: number): { ending: Segment; cut: Segment | null; dropped: Segment[] } | null {
    const next = this.nextBar(t);
    if (!next) return null;
    const dropped = this.segs.filter((s) => s.at >= next.at - 1e-6);
    for (const s of dropped) this.segs.splice(this.segs.indexOf(s), 1);
    const cut = this.segAt(next.at - 1e-6);
    if (cut) cut.until = cut.from + (next.at - cut.at);
    const ending: Segment = { at: next.at, from: this.map.ending, until: this.map.end, kind: 'ending' };
    this.segs.push(ending);
    return { ending, cut, dropped };
  }

  /**
   * From the first bar line at or after `t`, on to another stretch: from
   * file position `pick(bar)` (`bar`: the number of the bar line it leaves
   * from), looping `loop` from then on. Like finish(), whatever was queued to
   * start from then on is dropped, and what is playing stops there.
   */
  jump(t: number, pick: (bar: number) => number, loop: [number, number]): { seg: Segment; cut: Segment | null; dropped: Segment[] } | null {
    const next = this.nextBar(t);
    if (!next) return null;
    const dropped = this.segs.filter((s) => s.at >= next.at - 1e-6);
    for (const s of dropped) this.segs.splice(this.segs.indexOf(s), 1);
    const cut = this.segAt(next.at - 1e-6);
    if (cut) cut.until = cut.from + (next.at - cut.at);
    this.loop = loop;
    const seg: Segment = { at: next.at, from: pick(next.bar), until: loop[1], kind: 'body' };
    this.segs.push(seg);
    return { seg, cut, dropped };
  }

  /** Forget stretches that ended before `t`. */
  prune(t: number): Segment[] {
    const gone = this.segs.filter((s, i) => i < this.segs.length - 1 && this.endOf(s) < t);
    for (const s of gone) this.segs.splice(this.segs.indexOf(s), 1);
    return gone;
  }
}

// ---- loading ----------------------------------------------------------------------

export const decodeOne = (ctx: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> =>
  new Promise((ok, fail) => {
    // Older Safari only has the callback form; newer browsers return a promise too.
    const p = ctx.decodeAudioData(data, ok, (e) => fail(e ?? new Error('could not decode')));
    if (p && typeof p.catch === 'function') p.catch(fail);
  });

/**
 * What to decode recorded music with for `ctx`. Decoded, audio takes 8 bytes
 * a sample frame: a race song's layers over 200 MB at 48 kHz. Only on a
 * device with very little memory (2 GB or less) is it decoded at 32 kHz
 * instead: a third less, but the browser then has to resample it as it
 * plays, which dulls the top end.
 */
export function decodeInto(ctx: BaseAudioContext): BaseAudioContext {
  const mem = (globalThis.navigator as (Navigator & { deviceMemory?: number }) | undefined)?.deviceMemory;
  const rate = mem !== undefined && mem < 4 ? Math.min(32000, ctx.sampleRate) : ctx.sampleRate;
  if (rate !== ctx.sampleRate && typeof OfflineAudioContext !== 'undefined') {
    try {
      return new OfflineAudioContext(2, 1, rate);
    } catch {
      return ctx;
    }
  }
  return ctx;
}

/**
 * A song's files: downloaded as soon as this is made and kept for the visit
 * (about 20 MB). Decoded when a race on its circuit asks for it, and let go
 * of when a race on another circuit with a song does: decoded, a song takes
 * over 200 MB, so only one is held at a time.
 */
export class SongSource {
  /** 'loading' until it is decoded (or while it is not, once let go of). */
  state: 'loading' | 'ready' | 'failed' = 'loading';
  manifest: SongManifest | null = null;
  buffers: AudioBuffer[] = [];
  /** How much later than the manifest's times this browser's decoder puts the audio, in seconds. */
  shift = 0;
  private readonly files: Promise<{ manifest: SongManifest; data: ArrayBuffer[] }>;
  private decoding = false;
  /** Counts the times the decoded song was let go of, so a decode under way then is dropped. */
  private released = 0;

  constructor(readonly base: string) {
    this.files = (async () => {
      const res = await fetch(base + 'song.json');
      if (!res.ok) throw new Error(`${base}song.json: ${res.status}`);
      const manifest = (await res.json()) as SongManifest;
      const data = await Promise.all(
        manifest.layers.map(async (l) => {
          const r = await fetch(base + l.file);
          if (!r.ok) throw new Error(`${base}${l.file}: ${r.status}`);
          return r.arrayBuffer();
        }),
      );
      return { manifest, data };
    })();
    this.files.catch((err) => this.fail(err));
  }

  /** Decode into buffers for `ctx`, unless that is done or under way. */
  decode(ctx: BaseAudioContext): void {
    if (this.decoding || this.state !== 'loading') return;
    this.decoding = true;
    const round = this.released;
    const current = () => round === this.released;
    void (async () => {
      const { manifest, data } = await this.files;
      const into = decodeInto(ctx);
      // Two at a time (where there are cores to spare, that is near half the
      // wait, and only two layers are mid-decode at once), each from a copy:
      // the browser takes over the data it decodes, and the download is kept
      // to decode again after a release.
      const buffers: AudioBuffer[] = [];
      for (let i = 0; i < data.length; i += 2) {
        if (!current()) return;
        buffers.push(...(await Promise.all(data.slice(i, i + 2).map((d) => decodeOne(into, d.slice(0))))));
      }
      if (!current()) return;
      const s = manifest.layers.findIndex((l) => l.id === manifest.sync.layer);
      this.shift = s >= 0 ? syncShift(buffers[s], manifest.sync.env) : 0;
      this.manifest = manifest;
      this.buffers = buffers;
      this.state = 'ready';
    })()
      .catch((err) => {
        if (current()) this.fail(err);
      })
      .finally(() => {
        if (current()) this.decoding = false;
      });
  }

  /**
   * Let go of the decoded layers (or a decode under way), keeping the
   * download to decode from again. What is still playing from them plays
   * on: the browser keeps a buffer while a source plays it.
   */
  release(): void {
    if (this.state === 'failed') return;
    this.released++;
    this.decoding = false;
    this.buffers = [];
    this.state = 'loading';
  }

  private fail(err: unknown): void {
    if (this.state === 'failed') return;
    this.state = 'failed';
    console.warn(`[audio] the song in ${this.base} could not be loaded; the race music is synthesised instead:`, err);
  }
}

/**
 * Where this decoder starts the audio against ffmpeg's, in seconds: the lag
 * (within MAX_SHIFT_MS) at which the buffer's level, millisecond by
 * millisecond, best matches the fingerprint the build stored.
 */
export function syncShift(buf: AudioBuffer, b64: string): number {
  const bin = atob(b64);
  const ref = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i++) ref[i] = bin.charCodeAt(i);
  const env = levelEnvelope(buf, ref.length + MAX_SHIFT_MS + 1);
  return bestLag(ref, env) / 1000;
}

/** A buffer's level in dB above -90, the loudest sample of each millisecond. */
export function levelEnvelope(buf: AudioBuffer, ms: number): Float32Array {
  // (Each millisecond's own samples: at 44.1 kHz a millisecond is 44.1 of them.)
  const per = buf.sampleRate / 1000;
  const n = Math.min(ms, Math.floor(buf.length / per));
  const out = new Float32Array(n);
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  for (let i = 0; i < n; i++) {
    let m = 0;
    const e = Math.min(buf.length, Math.floor((i + 1) * per));
    for (const d of chans) for (let j = Math.floor(i * per); j < e; j++) m = Math.max(m, Math.abs(d[j]));
    out[i] = Math.min(90, Math.max(0, Math.round(20 * Math.log10(m + 1e-9) + 90)));
  }
  return out;
}

/** The lag in milliseconds (env behind ref is positive) where the two line up best. */
export function bestLag(ref: ArrayLike<number>, env: ArrayLike<number>): number {
  const mean = (a: ArrayLike<number>) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i];
    return s / Math.max(1, a.length);
  };
  const mr = mean(ref);
  const me = mean(env);
  let best = 0;
  let bestScore = -Infinity;
  for (let lag = -MAX_SHIFT_MS; lag <= MAX_SHIFT_MS; lag++) {
    let s = 0;
    for (let i = Math.max(0, -lag); i < ref.length && i + lag < env.length; i++) s += (ref[i] - mr) * (env[i + lag] - me);
    if (s > bestScore) {
      bestScore = s;
      best = lag;
    }
  }
  return best;
}

// ---- the track --------------------------------------------------------------------

export interface SongInfo {
  id: string;
  state: SongSource['state'] | 'playing' | 'ended';
  /** File position now, or -1. */
  pos: number;
  ending: boolean;
  /** Decoder start against ffmpeg's, in ms. */
  shiftMs: number;
  /** Sample rate the layers were decoded at. */
  rate: number;
  /** The last few changes, in context time: what, when, at which bar. */
  log: Array<{ what: string; at: number; bar: number }>;
}

interface Layer {
  id: string;
  /** The lap's level for this layer. */
  gain: GainNode;
  /**
   * For a layer that is filtered on some laps: the filter pair, and the two
   * paths the layer is heard through, filtered and direct. On the bar line
   * it goes over to the direct path, so without its filter it is heard
   * exactly as recorded.
   */
  filters: BiquadFilterNode[];
  /** The lap-by-lap low shelf, on a layer that has one. */
  shelf: BiquadFilterNode | null;
  filteredPath: GainNode | null;
  directPath: GainNode | null;
}

interface Playing {
  seg: Segment;
  srcs: AudioBufferSourceNode[];
  envs: GainNode[];
}

/**
 * A recorded song as a music track (same interface as the synthesised
 * ones): the race music, built up lap by lap to its ending at the finish;
 * or, given a `screen`, the music of a screen (the menus, the results), every layer in
 * and looping until the screen moves on.
 */
export class SongTrack implements MusicTrack {
  readonly name: TrackName;
  readonly dry: GainNode;
  readonly wet: GainNode;
  readonly taps: Record<string, AudioNode> = {};
  readonly restartsWithRace: boolean;
  broken = false;

  private plan: SongPlan | null = null;
  private layers: Layer[] = [];
  private playing: Playing[] = [];
  private phase: Phase = 1;
  /** The phase asked for most recently, and the bar line it starts on. */
  private target: Phase = 1;
  private targetAt = -1;
  private changeAt = -1;
  private ending = false;
  /** Context time the ending's last note ends, once it is queued. */
  private endingEnd = -1;
  /** Seen the race unfinished since starting: a finish only counts after that. */
  private armed = false;
  /** Gone on to the finale (see SongManifest.finale). */
  private inFinale = false;
  private readonly log: SongInfo['log'] = [];
  private startTime = -1;
  private disposed = false;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly source: SongSource,
    readonly style: string,
    private readonly screen: TrackName | null = null,
  ) {
    this.name = screen ?? 'race';
    this.restartsWithRace = !screen;
    this.dry = ctx.createGain();
    this.dry.gain.value = 0;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0;
  }

  schedule(now: number, lapPhase: number, _ahead: number, finished = false): void {
    if (this.disposed) return;
    // A screen's song has no laps and no finish: everything in, round and round.
    if (this.screen) {
      lapPhase = 3;
      finished = false;
    }
    if (!this.plan) {
      if (this.source.state === 'failed') this.broken = true;
      else if (this.source.state === 'ready') this.begin(now + 0.05, phaseOf(lapPhase));
      return;
    }
    const plan = this.plan;
    // The loop's next pass, queued well before it is due.
    for (const seg of plan.extend(now + QUEUE_AHEAD)) this.play(seg, true);
    // If the game stalled for longer than that while the audio ran on, pick
    // the loop up again where it would have been.
    const last = plan.segs[plan.segs.length - 1];
    if (!this.ending && last && plan.endOf(last) < now) this.resume(now + 0.05);

    if (!finished) this.armed = true;
    if (finished && this.armed && !this.ending) this.end(now);

    const want = phaseOf(lapPhase);
    if (!this.ending && want !== this.target) {
      const next = this.changeBar(want, now);
      if (next) this.change(want, next.at, now, next.bar);
    }
    if (this.targetAt >= 0 && now >= this.targetAt) {
      this.phase = this.target;
      this.targetAt = -1;
    }
    // Let go of what has finished playing.
    for (const p of this.playing.splice(0)) {
      if (now > plan.endOf(p.seg) + 0.1) this.release(p);
      else this.playing.push(p);
    }
    plan.prune(now - 1);
  }

  /**
   * The ending has played out (and a moment more): the engine moves on to
   * the menu music, so the wait for the results is not silent.
   */
  get done(): boolean {
    return this.endingEnd >= 0 && this.ctx.currentTime >= this.endingEnd + AFTER_ENDING;
  }

  /** The song's own keys for the race stingers, if it has them. */
  get stingers(): Record<string, number> | null {
    return this.source.manifest?.stingers ?? null;
  }

  fade(to: number, now: number, tau: number): void {
    const g = this.dry.gain;
    g.cancelScheduledValues(now);
    // Fading in before the song has started: be at full level for its first note.
    if (!this.plan && to > 0) g.setValueAtTime(to, now);
    else g.setTargetAtTime(to, now, tau);
  }

  dispose(): void {
    this.disposed = true;
    for (const p of this.playing) this.release(p);
    this.playing = [];
    this.dry.disconnect();
    this.wet.disconnect();
  }

  info(): TrackInfo {
    const now = this.ctx.currentTime;
    const plan = this.plan;
    const bar = plan ? plan.barAt(now) : -1;
    const bars = this.source.manifest?.bars ?? [];
    const pos = plan?.posAt(now) ?? null;
    return {
      name: this.name,
      style: this.style,
      phase: this.targetAt >= 0 && now >= this.targetAt ? this.target : this.phase,
      bar,
      startTime: this.startTime,
      barDur: bar >= 0 && bar + 1 < bars.length ? bars[bar + 1] - bars[bar] : bars.length > 1 ? bars[1] - bars[0] : 0,
      changeAt: this.changeAt,
      song: {
        id: this.source.manifest?.id ?? this.source.base,
        state: !plan ? this.source.state : pos === null && this.ending ? 'ended' : 'playing',
        pos: pos ?? -1,
        ending: this.ending,
        shiftMs: Math.round(this.source.shift * 1000),
        rate: this.source.buffers[0]?.sampleRate ?? 0,
        log: this.log.slice(),
      },
    };
  }

  // ---- internals ----

  private note(what: string, at: number, bar: number): void {
    this.log.push({ what, at, bar });
    if (this.log.length > 24) this.log.shift();
  }

  private gainFor(id: string, phase: Phase): number {
    const db = this.source.manifest!.laps[id]?.[phase - 1];
    return db === null || db === undefined ? 0 : 10 ** (db / 20);
  }

  /** The low shelf's boost on a lap, in dB. */
  private shelfFor(phase: Phase): number {
    return this.source.manifest!.lowShelf?.db[phase - 1] ?? 0;
  }

  /** A layer's low shelf to lap `to`'s boost, on the bar line at `at`. */
  private shelve(l: Layer, to: Phase, at: number): void {
    if (!l.shelf) return;
    l.shelf.gain.cancelScheduledValues(at - XFADE);
    l.shelf.gain.setTargetAtTime(this.shelfFor(to), at - XFADE, XFADE / 3);
  }

  private filtered(id: string, phase: Phase): boolean {
    const f = this.source.manifest!.filter;
    return !!f && f.layer === id && f.laps.includes(phase);
  }

  private begin(at: number, phase: Phase): void {
    const ctx = this.ctx;
    const m = this.source.manifest!;
    const level = ctx.createGain();
    level.gain.value = 10 ** (m.level / 20);
    level.connect(this.dry);
    this.layers = m.layers.map((l) => {
      const gain = ctx.createGain();
      gain.gain.value = this.gainFor(l.id, phase);
      const out = ctx.createGain();
      // The layer's own low shelf, if it has one, between it and the song's level.
      let shelf: BiquadFilterNode | null = null;
      if (m.lowShelf?.layers.includes(l.id)) {
        shelf = ctx.createBiquadFilter();
        shelf.type = 'lowshelf';
        shelf.frequency.value = m.lowShelf.hz;
        shelf.gain.value = this.shelfFor(phase);
        out.connect(shelf);
        shelf.connect(level);
      } else out.connect(level);
      const filters: BiquadFilterNode[] = [];
      let filteredPath: GainNode | null = null;
      let directPath: GainNode | null = null;
      if (m.filter?.layer === l.id) {
        const on = this.filtered(l.id, phase);
        // A fourth-order Butterworth: two biquads (Q in dB).
        for (const q of [-5.33, 2.33]) {
          const f = ctx.createBiquadFilter();
          f.type = m.filter.type;
          f.Q.value = q;
          f.frequency.value = on ? m.filter.hz : OPEN_HZ[m.filter.type];
          filters.push(f);
        }
        filteredPath = ctx.createGain();
        filteredPath.gain.value = on ? 1 : 0;
        directPath = ctx.createGain();
        directPath.gain.value = on ? 0 : 1;
        gain.connect(filters[0]);
        filters[0].connect(filters[1]);
        filters[1].connect(filteredPath);
        filteredPath.connect(out);
        gain.connect(directPath);
        directPath.connect(out);
      } else {
        gain.connect(out);
      }
      this.taps[l.id] = shelf ?? out;
      return { id: l.id, gain, filters, shelf, filteredPath, directPath };
    });
    this.plan = new SongPlan(m);
    this.phase = this.target = phase;
    this.startTime = at + m.bars[0];
    // (Started on the finale's lap, as on joining a race late: in the finale.)
    const f = m.finale;
    if (f && phase >= f.lap) {
      this.plan.loop = f.loop;
      this.inFinale = true;
    }
    // (From its first bar: a phrase's first, where it waits for one; else the cycle's.)
    const into = f ? f.entry[f.phrase ? ((f.phrase.first % f.cycle) + f.cycle) % f.cycle : 0] : 0;
    this.play(this.plan.start(at, this.inFinale ? into : 0), false);
    this.note(`start, lap ${phase}`, at, -1);
  }

  /** Start one stretch's sources: with a cross-fade from what plays before it, or straight in. */
  private play(seg: Segment, xfade: boolean, jumped = false): void {
    if (this.source.buffers.length !== this.layers.length) {
      // Let go of under it (the engine keeps the song of the race on, so
      // this should not happen): the engine starts it again.
      this.broken = true;
      return;
    }
    const ctx = this.ctx;
    const shift = this.source.shift;
    const x = xfade ? XFADE : 0;
    // On whole samples, start and offset both: a source started between
    // samples is interpolated, which takes the edge off the top end.
    const t0 = Math.ceil(Math.max(ctx.currentTime, seg.at - x) * ctx.sampleRate) / ctx.sampleRate;
    const rate = this.source.buffers[0].sampleRate;
    const offset = Math.max(0, Math.round((seg.from - (seg.at - t0) + shift) * rate) / rate);
    const stopAt = seg.kind === 'body' && this.plan ? this.plan.endOf(seg) + 0.01 : null;
    const srcs: AudioBufferSourceNode[] = [];
    const envs: GainNode[] = [];
    this.layers.forEach((l, i) => {
      const src = ctx.createBufferSource();
      src.buffer = this.source.buffers[i];
      const env = ctx.createGain();
      if (x > 0 && t0 < seg.at) {
        env.gain.setValueAtTime(0, t0);
        env.gain.linearRampToValueAtTime(1, seg.at);
      }
      src.connect(env);
      env.connect(l.gain);
      src.start(t0, offset);
      if (stopAt !== null) src.stop(stopAt);
      srcs.push(src);
      envs.push(env);
    });
    // What plays before it fades out over the same moment.
    if (x > 0) for (const p of this.playing) if (p.seg !== seg && Math.abs(this.plan!.endOf(p.seg) - seg.at) < 1e-6) this.fadeOut(p, seg.at);
    this.playing.push({ seg, srcs, envs });
    if (!jumped && seg.kind === 'body' && seg.from === this.plan!.loop[0] && seg.at > this.startTime) this.note('loop', seg.at, this.source.manifest!.bars.indexOf(seg.from));
  }

  private fadeOut(p: Playing, at: number): void {
    for (const env of p.envs) {
      env.gain.cancelScheduledValues(at - XFADE);
      env.gain.setValueAtTime(1, at - XFADE);
      env.gain.linearRampToValueAtTime(0, at);
    }
    for (const s of p.srcs) {
      try {
        s.stop(at + 0.01);
      } catch {
        /* an older browser that only takes one stop: the fade has it silent anyway */
      }
    }
  }

  private release(p: Playing): void {
    for (const s of p.srcs) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
      s.disconnect();
    }
    for (const e of p.envs) e.disconnect();
  }

  /** Lap phase `to` from the bar line at `at` (a filtered layer may open up from now until then). */
  private change(to: Phase, at: number, now: number, bar: number): void {
    const m = this.source.manifest!;
    for (const l of this.layers) {
      const g = l.gain.gain;
      g.cancelScheduledValues(at - XFADE);
      g.setTargetAtTime(this.gainFor(l.id, to), at - XFADE, XFADE / 3);
      this.shelve(l, to, at);
      if (l.filters.length) {
        const was = this.filtered(l.id, this.target);
        const will = this.filtered(l.id, to);
        if (was && !will) this.unfilter(l, now, at);
        else if (will && !was) {
          for (const f of l.filters) {
            f.frequency.cancelScheduledValues(at - XFADE);
            f.frequency.setValueAtTime(m.filter!.hz, at - XFADE);
          }
          this.paths(l, true, at);
        }
      }
    }
    this.target = to;
    this.targetAt = at;
    this.changeAt = at;
    this.note(`lap ${to}`, at, bar);
    if (m.finale && !this.inFinale && to >= m.finale.lap) this.toFinale(at);
  }

  /**
   * The bar line a change to lap phase `to` happens on: the next one far
   * enough ahead, or, going into a finale that waits for a phrase, the next
   * phrase's first (queueing the song far enough ahead to find it).
   */
  private changeBar(to: Phase, now: number): { at: number; bar: number } | null {
    const plan = this.plan!;
    const f = this.source.manifest!.finale;
    const p = f && !this.inFinale && to >= f.lap ? f.phrase : null;
    if (!p) return plan.nextBar(now + CHANGE_LEAD);
    for (const seg of plan.extend(now + PHRASE_AHEAD)) this.play(seg, true);
    let t = now + CHANGE_LEAD;
    for (let i = 0; i <= p.bars; i++) {
      const next = plan.nextBar(t);
      if (!next) return null;
      if ((((next.bar - p.first) % p.bars) + p.bars) % p.bars === 0) return next;
      t = next.at + 1e-3;
    }
    return null;
  }

  /** On to the finale on the bar line at `at`, at the place in the chord cycle the song has got to. */
  private toFinale(at: number): void {
    const f = this.source.manifest!.finale!;
    const done = this.plan!.jump(at, (bar) => f.entry[((bar % f.cycle) + f.cycle) % f.cycle], f.loop);
    if (!done) return;
    this.inFinale = true;
    for (const seg of done.dropped) {
      const i = this.playing.findIndex((p) => p.seg === seg);
      if (i >= 0) this.release(this.playing.splice(i, 1)[0]);
    }
    // (What is playing now fades out into it: play() sees it ends there.)
    this.play(done.seg, true, true);
    this.note('finale', done.seg.at, this.source.manifest!.bars.indexOf(done.seg.from));
  }

  /** The finish: on to the ending at the next bar line, every layer in. */
  private end(now: number): void {
    const plan = this.plan!;
    const done = plan.finish(now + 0.12);
    if (!done) return;
    this.ending = true;
    for (const seg of done.dropped) {
      const i = this.playing.findIndex((p) => p.seg === seg);
      if (i >= 0) this.release(this.playing.splice(i, 1)[0]);
    }
    // (What is playing now fades out into the ending: play() sees it ends there.)
    const at = done.ending.at;
    for (const l of this.layers) {
      l.gain.gain.cancelScheduledValues(at - XFADE);
      l.gain.gain.setTargetAtTime(this.gainFor(l.id, 3), at - XFADE, XFADE / 3);
      this.shelve(l, 3, at);
      if (l.filters.length && this.filtered(l.id, this.targetAt >= 0 && now < this.targetAt ? this.phase : this.target)) this.unfilter(l, now, at);
    }
    this.targetAt = -1;
    this.phase = this.target = 3;
    this.play(done.ending, true);
    this.endingEnd = plan.endOf(done.ending);
    this.note('ending', at, plan.map.bars.length - 1);
  }

  /**
   * Take a layer's filter off at the bar line at `at`: swept open from now
   * until then, or (a 'cut') the whole layer dropping in on it.
   */
  private unfilter(l: Layer, now: number, at: number): void {
    const f = this.source.manifest!.filter!;
    if (f.open === 'sweep') {
      for (const bq of l.filters) {
        bq.frequency.cancelScheduledValues(now);
        bq.frequency.setValueAtTime(Math.max(20, bq.frequency.value), now);
        bq.frequency.exponentialRampToValueAtTime(OPEN_HZ[f.type], at);
      }
    }
    this.paths(l, false, at);
  }

  /** Over to the filtered path (or the direct one) in the moment before the bar line at `at`. */
  private paths(l: Layer, filtered: boolean, at: number): void {
    for (const [p, to] of [[l.filteredPath, filtered ? 1 : 0], [l.directPath, filtered ? 0 : 1]] as const) {
      if (!p) continue;
      p.gain.cancelScheduledValues(at - XFADE);
      p.gain.setValueAtTime(1 - to, at - XFADE);
      p.gain.linearRampToValueAtTime(to, at);
    }
  }

  /** Back into the loop after a stall, where it would have got to. */
  private resume(at: number): void {
    const plan = this.plan!;
    const loop = plan.loop;
    const last = plan.segs[plan.segs.length - 1];
    const len = loop[1] - loop[0];
    const over = last ? (at - plan.endOf(last)) % len : 0;
    this.play(plan.start(at, loop[0] + Math.max(0, over)), false);
    this.note('resume', at, plan.barAt(at));
  }
}
