// Measures the synthesiser in a real browser, since nobody can listen to a CI
// run. Loaded by tools/audio-check.mjs through the Vite dev server:
//
//   node tools/audio-check.mjs            full run, about three minutes
//   node tools/audio-check.mjs --quick    offline renders only, under a minute
//   node tools/audio-check.mjs --only sfx just the named parts (see main() below)
//   node tools/audio-check.mjs --dump d   also write the renders to d/ as WAV
//
// Two passes. The real-time pass drives a live AudioContext exactly as the game
// does (nothing before unlock(), then every sound, layer and music state) and
// reads levels from AnalyserNodes on the engine's output. The offline pass
// renders the same things through an OfflineAudioContext, which is faster than
// real time and sample-exact, and looks closer: duration, spectrum, limiter
// gain, bar-line timing.

import type { AudioScene, SfxName, SfxOptions } from '../src/client/audio/audio';
import { mtof } from '../src/client/audio/dsp';
import { SFX_NAMES } from '../src/client/audio/sfx';
import { MASTER, MAX_VOICES, MUSIC_TRIM, SynthAudio } from '../src/client/audio/synth';
import { XFADE, type SongInfo } from '../src/client/audio/song';

type Cell = string | number;
type Row = Record<string, Cell>;

export interface Report {
  done: boolean;
  failures: string[];
  notes: string[];
  tables: Record<string, Row[]>;
}

declare global {
  interface Window {
    __audioReport?: Report;
    __audioDump?: (name: string, base64: string) => Promise<void>;
  }
}

const params = new URLSearchParams(location.search);
const QUICK = params.has('quick');
const DUMP = params.has('dump');
/** Parts to run, or null for all of them. */
const ONLY = params.get('only')?.split(',') ?? null;

const report: Report = { done: false, failures: [], notes: [], tables: {} };
window.__audioReport = report;

const logEl = document.getElementById('log');
function log(msg: string): void {
  console.log(msg);
  if (logEl) logEl.textContent += `\n${msg}`;
}
function fail(msg: string): void {
  report.failures.push(msg);
  log(`FAIL ${msg}`);
}
function table(name: string): Row[] {
  return (report.tables[name] ??= []);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const db = (x: number): number => (x > 1e-9 ? Math.round(200 * Math.log10(x)) / 10 : -180);
const r3 = (x: number): number => Math.round(x * 1000) / 1000;

/** Sounds quieter than this at the output count as silent, louder than CLIP as clipped. */
const SILENT = 0.01;
const CLIP = 1.0;
/** Default volumes: what the engine uses when setVolumes() is never called. */
const VOL = { master: 0.8, music: 0.45, sfx: 0.9 };

// ---- scenes -------------------------------------------------------------------

/** Flat out at the formation lap's limiter. Every field is spelled out, the optional one too, because the real-time pass copies scenes over one another. */
const BASE: AudioScene = { racing: true, speed: 110, throttle: 1, boosting: false, surge: false, battle: false, lapPhase: 1, onStrip: false, drafting: false, scraping: false, critical: false };
const OFF: AudioScene = { ...BASE, racing: false, speed: 0, throttle: 0 };

interface LayerCase {
  name: string;
  scene: AudioScene;
  /** Name of the case this one adds a layer to, for measuring that layer alone. */
  vs?: string;
  silent?: boolean;
}

const LAYER_CASES: LayerCase[] = [
  { name: 'off', scene: OFF, silent: true },
  { name: 'idle (speed 0)', scene: { ...BASE, speed: 0, throttle: 0 } },
  { name: 'cruise (55)', scene: { ...BASE, speed: 55 } },
  { name: 'limiter (110)', scene: BASE },
  { name: 'coast (110, throttle 0)', scene: { ...BASE, throttle: 0 } },
  { name: 'pre-battle (100, 0.6)', scene: { ...BASE, speed: 100, throttle: 0.6 } },
  { name: '+battle', scene: { ...BASE, speed: 100, throttle: 0.6, battle: true }, vs: 'pre-battle (100, 0.6)' },
  { name: 'flat out (160)', scene: { ...BASE, speed: 160 } },
  { name: '+boosting', scene: { ...BASE, speed: 160, boosting: true }, vs: 'flat out (160)' },
  { name: '+surge', scene: { ...BASE, speed: 160, boosting: true, surge: true }, vs: '+boosting' },
  { name: 'boost (192)', scene: { ...BASE, speed: 192, boosting: true } },
  { name: 'overdrive (208)', scene: { ...BASE, speed: 208, boosting: true, surge: true } },
  { name: 'overdrive peak (250)', scene: { ...BASE, speed: 250, boosting: true, surge: true } },
  { name: '+onStrip', scene: { ...BASE, onStrip: true }, vs: 'limiter (110)' },
  { name: '+drafting', scene: { ...BASE, drafting: true }, vs: 'limiter (110)' },
  { name: 'flat out, drafting (160)', scene: { ...BASE, speed: 160, drafting: true } },
  { name: '+scraping', scene: { ...BASE, scraping: true }, vs: 'limiter (110)' },
  { name: '+carving, building', scene: { ...BASE, carve: 0.55, carveTier: 0 }, vs: 'limiter (110)' },
  { name: '+carving tight, tier 3', scene: { ...BASE, carve: 1, carveTier: 3 }, vs: 'limiter (110)' },
  { name: '+critical', scene: { ...BASE, speed: 0, throttle: 0, critical: true }, vs: 'idle (speed 0)' },
  { name: 'everything', scene: { ...BASE, speed: 250, boosting: true, surge: true, onStrip: true, drafting: true, scraping: true, critical: true } },
  { name: 'off again', scene: OFF, silent: true },
];

// ---- real-time pass -----------------------------------------------------------

class Meter {
  private readonly ans: AnalyserNode[];
  private readonly buf: Float32Array<ArrayBuffer>;
  peak = 0;
  private sum = 0;
  private count = 0;

  constructor(ctx: AudioContext, node: AudioNode) {
    // One analyser per channel: a single analyser would fold stereo to mono
    // and under-read anything wide by up to 3 dB.
    const stereo = ctx.createGain();
    stereo.channelCount = 2;
    stereo.channelCountMode = 'explicit';
    const split = ctx.createChannelSplitter(2);
    node.connect(stereo);
    stereo.connect(split);
    // Analysers are pulled on their own, but a silent path to the output makes sure of it.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    mute.connect(ctx.destination);
    this.ans = [0, 1].map((ch) => {
      const an = ctx.createAnalyser();
      an.fftSize = 4096;
      split.connect(an, ch);
      an.connect(mute);
      return an;
    });
    this.buf = new Float32Array(4096);
  }

  /** Peak of the last 85 ms or so; also folds it into the running peak and RMS. */
  poll(): number {
    let p = 0;
    for (const an of this.ans) {
      an.getFloatTimeDomainData(this.buf);
      let s = 0;
      for (let i = 0; i < this.buf.length; i++) {
        const v = this.buf[i];
        const a = v < 0 ? -v : v;
        if (a > p) p = a;
        s += v * v;
      }
      this.sum += s / this.buf.length;
      this.count++;
    }
    if (p > this.peak) this.peak = p;
    return p;
  }

  reset(): void {
    this.peak = 0;
    this.sum = 0;
    this.count = 0;
  }

  get rms(): number {
    return this.count ? Math.sqrt(this.sum / this.count) : 0;
  }
}

async function realtime(): Promise<void> {
  log('--- real-time pass ---');
  // Count every AudioContext the page opens, and every warning the engine swallows.
  let created = 0;
  const Real = window.AudioContext;
  class Counting extends Real {
    constructor(o?: AudioContextOptions) {
      super(o);
      created++;
    }
  }
  (window as unknown as { AudioContext: typeof AudioContext }).AudioContext = Counting;
  let warnings = 0;
  const warn = console.warn.bind(console);
  console.warn = (...args: unknown[]): void => {
    if (typeof args[0] === 'string' && args[0].startsWith('[audio]')) warnings++;
    warn(...args);
  };

  // 1. Everything must be a silent no-op before unlock().
  const scene: AudioScene = { ...OFF };
  const probe = new SynthAudio();
  const audio = new SynthAudio();
  try {
    probe.setVolumes(0.3, 0.2, 0.1);
    probe.setVolumes(Number.NaN, -4, 9);
    probe.update(0.016, scene);
    probe.update(0.016, { ...BASE, critical: true, boosting: true });
    for (const n of SFX_NAMES) probe.play(n, { volume: 0.5, pan: 0.3, pitch: 1.2 });
    probe.play('ko');
    probe.setMusic('menu');
    probe.setMusic('race');
    probe.setMusic(null);
    // The real instance is asked for menu music now and should start it once unlocked.
    audio.setMusic('menu');
    audio.update(0.016, scene);
    audio.play('ui_select');
  } catch (err) {
    fail(`a method threw before unlock(): ${String(err)}`);
  }
  if (created !== 0) fail(`${created} AudioContext(s) were created before unlock()`);
  if (audio.context !== null || audio.output !== null) fail('engine exposes a context before unlock()');
  const row: Row = { 'contexts before unlock': created };

  // 2. unlock(), twice.
  audio.unlock();
  audio.unlock();
  row['contexts after unlock x2'] = created;
  if (created !== 1) fail(`unlock() twice created ${created} AudioContexts, expected 1`);
  const ctx = audio.context as AudioContext | null;
  const out = audio.output;
  const preNode = audio.preLimiter;
  if (!ctx || !out || !preNode) {
    fail('no context after unlock()');
    return;
  }
  for (let i = 0; i < 60 && ctx.state !== 'running'; i++) await sleep(50);
  row['state'] = ctx.state;
  row['sample rate'] = ctx.sampleRate;
  if (ctx.state !== 'running') {
    fail(`AudioContext is "${ctx.state}" after unlock()`);
    return;
  }

  const post = new Meter(ctx, out);
  const pre = new Meter(ctx, preNode);
  let lastLoud = 0;
  const poller = setInterval(() => {
    pre.poll();
    if (post.poll() > 0.004) lastLoud = performance.now();
  }, 8);
  let prev = performance.now();
  const frames = setInterval(() => {
    const now = performance.now();
    audio.update(Math.min(0.1, (now - prev) / 1000), scene);
    prev = now;
  }, 16);
  const quiet = async (ms = 200, limit = 6000): Promise<boolean> => {
    const t0 = performance.now();
    while (performance.now() - t0 < limit) {
      if (performance.now() - lastLoud > ms) return true;
      await sleep(20);
    }
    return false;
  };

  try {
    // Music asked for before unlock should now be playing.
    await sleep(1800);
    const info0 = audio.debugInfo();
    row['music asked for before unlock'] = `${info0.music?.name ?? 'none'}, peak ${r3(post.peak)}`;
    if (info0.music?.name !== 'menu' || post.peak < 0.003) fail('menu music requested before unlock() did not start after it');
    audio.setMusic(null);
    await sleep(1500);
    if (!(await quiet())) fail('music did not fade to silence after setMusic(null)');

    // 3. A context suspended later must come back on the next play() or unlock().
    await ctx.suspend();
    audio.play('ui_move');
    for (let i = 0; i < 40 && ctx.state !== 'running'; i++) await sleep(25);
    row['resumed by play()'] = ctx.state;
    if (ctx.state !== 'running') fail('play() did not resume a suspended context');
    await ctx.suspend();
    audio.unlock();
    for (let i = 0; i < 40 && ctx.state !== 'running'; i++) await sleep(25);
    row['resumed by unlock()'] = ctx.state;
    if (ctx.state !== 'running') fail('unlock() did not resume a suspended context');
    if (created !== 1) fail('a second AudioContext was created while resuming');
    table('startup').push(row);
    await quiet();

    // 4. Every sound effect.
    for (const name of SFX_NAMES) {
      await quiet();
      await sleep(60);
      post.reset();
      pre.reset();
      const t0 = performance.now();
      lastLoud = 0;
      audio.play(name);
      await sleep(120);
      while (performance.now() - t0 < 5000 && performance.now() - lastLoud < 260) await sleep(20);
      const peak = post.peak;
      table('sfx (real time)').push({ name, peak: r3(peak), dBFS: db(peak), 'pre-limiter': r3(pre.peak), 'heard for (s)': r3(Math.max(0, (lastLoud - t0) / 1000 - 0.085)) });
      if (peak < SILENT) fail(`sfx ${name} is silent in real time (peak ${peak.toFixed(4)})`);
      if (peak >= CLIP) fail(`sfx ${name} clips in real time (peak ${peak.toFixed(3)})`);
    }

    // 5. The continuous layer, one scene at a time.
    const seen = new Map<string, number>();
    for (const c of LAYER_CASES) {
      Object.assign(scene, c.scene);
      await sleep(c.name === 'off again' ? 1400 : 900);
      post.reset();
      pre.reset();
      await sleep(c.vs === 'idle (speed 0)' ? 2000 : 900);
      seen.set(c.name, post.rms);
      const base = c.vs ? (seen.get(c.vs) ?? 0) : 0;
      table('continuous layer (real time)').push({
        scene: c.name,
        peak: r3(post.peak),
        'rms dBFS': db(post.rms),
        'layer alone dBFS': c.vs ? db(Math.sqrt(Math.max(0, post.rms ** 2 - base ** 2))) : '',
      });
      if (c.silent && post.peak > 0.003) fail(`continuous layer not silent when racing is false (${c.name}: peak ${post.peak.toFixed(4)})`);
      if (!c.silent && post.rms < 0.002) fail(`continuous layer inaudible in scene "${c.name}"`);
      if (post.peak >= CLIP) fail(`continuous layer clips in scene "${c.name}"`);
    }
    Object.assign(scene, OFF);

    // 6. Music: menu, race through its three phases, then nothing.
    const musicCases: Array<[string, 'menu' | 'race' | null, number, number]> = [
      ['menu', 'menu', 1, 6000],
      ['race, phase 1', 'race', 1, 8000],
      ['race, phase 2', 'race', 2, 8000],
      ['race, phase 3', 'race', 3, 8000],
      ['null', null, 1, 1600],
    ];
    for (const [name, track, phase, ms] of musicCases) {
      audio.setMusic(track);
      scene.lapPhase = phase;
      // Let the cross-fade or the bar-line change happen before measuring.
      await sleep(track === null ? 1500 : 2200);
      post.reset();
      pre.reset();
      await sleep(ms);
      const info = audio.debugInfo().music;
      table('music (real time)').push({ state: name, peak: r3(post.peak), 'rms dBFS': db(post.rms), playing: info ? `${info.name} phase ${info.phase} bar ${info.bar}` : 'nothing' });
      if (track === null) {
        if (post.peak > 0.003) fail(`music still audible 1.5 s after setMusic(null) (peak ${post.peak.toFixed(4)})`);
      } else {
        if (post.rms < 0.004) fail(`music state "${name}" is inaudible`);
        if (info?.name !== track || (track === 'race' && info.phase !== phase)) fail(`music state "${name}" is not what is playing`);
      }
      if (post.peak >= CLIP) fail(`music state "${name}" clips`);
    }

    // 7. Pile-up: far more sounds than the voice limit in a single frame.
    await quiet();
    post.reset();
    pre.reset();
    let most = 0;
    for (let k = 0; k < 3; k++) for (const n of SFX_NAMES) audio.play(n);
    most = audio.debugInfo().voices;
    await sleep(1500);
    const pilePeak = post.peak;
    const pilePre = pre.peak;
    await quiet(300, 8000);
    // The longest sounds are three seconds; they should all have been let go by then.
    for (let i = 0; i < 60 && audio.debugInfo().voices > 0; i++) await sleep(100);
    table('pile-up (real time)').push({ 'plays in one frame': SFX_NAMES.length * 3, 'voices kept': most, 'voice limit': MAX_VOICES, peak: r3(pilePeak), 'pre-limiter': r3(pilePre), 'voices after': audio.debugInfo().voices });
    if (most > MAX_VOICES) fail(`${most} voices alive, limit is ${MAX_VOICES}`);
    if (pilePeak >= CLIP) fail(`pile-up clips (peak ${pilePeak.toFixed(3)})`);
    if (audio.debugInfo().voices !== 0) fail('voices were not released after the pile-up');
    if (ctx.state !== 'running') fail(`context ended the run "${ctx.state}"`);
  } finally {
    clearInterval(poller);
    clearInterval(frames);
    console.warn = warn;
    if (warnings) fail(`the engine swallowed ${warnings} Web Audio error(s) in real time (see [audio] warnings)`);
    await ctx.close().catch(() => {});
  }
}

// ---- offline pass -------------------------------------------------------------

const SR = 48000;
const STEP = 0.05;

interface Cue {
  t: number;
  run: (a: SynthAudio) => void;
}

interface Render {
  buf: AudioBuffer;
  audio: SynthAudio;
  warnings: number;
}

/**
 * Render `seconds` of the engine. Channels 0-1 are its output, 2-3 the mix
 * before the limiter. `sceneAt` is asked for the scene every 50 ms, like a slow
 * game loop, and `each` runs after every update.
 */
async function render(
  seconds: number,
  cues: Cue[],
  sceneAt: (t: number) => AudioScene,
  each?: (t: number, a: SynthAudio, ctx: OfflineAudioContext) => void,
  vol?: [number, number, number],
  preTap = true,
  songs?: Record<string, string>,
): Promise<Render> {
  const ctx = new OfflineAudioContext(preTap ? 4 : 2, Math.ceil(seconds * SR), SR);
  const audio = new SynthAudio(songs ? { songs } : {});
  if (vol) audio.setVolumes(vol[0], vol[1], vol[2]);
  audio.debugAttach(ctx);
  // A recorded song decodes in the background: wait for it, so the render starts with it ready.
  if (songs) await audio.debugSongsLoaded();
  const tap = audio.preLimiter;
  if (!tap) throw new Error('debugAttach did not build a graph');
  if (preTap) {
    const split = ctx.createChannelSplitter(2);
    const merge = ctx.createChannelMerger(4);
    tap.connect(split);
    split.connect(merge, 0, 2);
    split.connect(merge, 1, 3);
    merge.connect(ctx.destination);
  }

  let warnings = 0;
  const warn = console.warn.bind(console);
  console.warn = (...args: unknown[]): void => {
    if (typeof args[0] === 'string' && args[0].startsWith('[audio]')) warnings++;
    warn(...args);
  };
  const sorted = [...cues].sort((x, y) => x.t - y.t);
  let ci = 0;
  const tick = (t: number): void => {
    while (ci < sorted.length && sorted[ci].t <= t + 1e-6) sorted[ci++].run(audio);
    audio.update(STEP, sceneAt(t));
    each?.(t, audio, ctx);
  };
  try {
    tick(0);
    for (let k = 1; k * STEP < seconds; k++) {
      void ctx.suspend(k * STEP).then(() => {
        try {
          tick(ctx.currentTime);
        } finally {
          void ctx.resume();
        }
      });
    }
    const buf = await ctx.startRendering();
    return { buf, audio, warnings };
  } finally {
    console.warn = warn;
  }
}

/**
 * Loudness of the engine's individual layers and music parts during an
 * offline render, read from analysers at every 50 ms update. Each reading
 * covers the last 43 ms, so nearly every sample is seen once.
 */
class TapMeters {
  private readonly meters = new Map<string, { node: AudioNode; ans: AnalyserNode[]; sum: number; n: number; peak: number }>();
  private readonly buf = new Float32Array(2048);

  /** Read every tap the engine currently exposes; `keep` says whether this moment counts. */
  poll(a: SynthAudio, ctx: OfflineAudioContext, keep: boolean): void {
    for (const [name, node] of Object.entries(a.debugTaps())) {
      let m = this.meters.get(name);
      if (!m || m.node !== node) {
        // Force stereo so a mono part reads the same on both sides, as it does at the output.
        const st = ctx.createGain();
        st.channelCount = 2;
        st.channelCountMode = 'explicit';
        const split = ctx.createChannelSplitter(2);
        node.connect(st);
        st.connect(split);
        const ans = [0, 1].map((ch) => {
          const an = ctx.createAnalyser();
          an.fftSize = 2048;
          split.connect(an, ch);
          return an;
        });
        m = { node, ans, sum: m?.sum ?? 0, n: m?.n ?? 0, peak: m?.peak ?? 0 };
        this.meters.set(name, m);
        continue;
      }
      if (!keep) continue;
      for (const an of m.ans) {
        an.getFloatTimeDomainData(this.buf);
        let sq = 0;
        for (let i = 0; i < this.buf.length; i++) {
          const v = this.buf[i];
          sq += v * v;
          if (v > m.peak) m.peak = v;
          else if (-v > m.peak) m.peak = -v;
        }
        m.sum += sq / this.buf.length;
        m.n++;
      }
    }
  }

  /** RMS and peak of each tap since the last call, scaled by `gain`, then start again. */
  take(gain: number, prefix: string): Record<string, { rms: number; peak: number }> {
    const out: Record<string, { rms: number; peak: number }> = {};
    for (const [name, m] of this.meters) {
      if (!name.startsWith(prefix)) continue;
      out[name.slice(prefix.length)] = { rms: m.n ? Math.sqrt(m.sum / m.n) * gain : 0, peak: m.peak * gain };
      m.sum = 0;
      m.n = 0;
      m.peak = 0;
    }
    return out;
  }
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

interface Stats {
  peak: number;
  prePeak: number;
  rms: number;
  /** Seconds between the first and last sample within 30 dB of the peak. */
  dur: number;
  /** Seconds from the start of the window to the first of those samples. */
  onset: number;
  /** Spectral centre of gravity in hertz. */
  centroid: number;
  /** Share of the energy below 250 Hz, 250-2500 Hz and above. */
  low: number;
  mid: number;
  high: number;
  left: number;
  right: number;
  rmsLeft: number;
  rmsRight: number;
}

function analyse(buf: AudioBuffer, t0: number, t1: number): Stats {
  const i0 = Math.max(0, Math.floor(t0 * SR));
  const i1 = Math.min(buf.length, Math.floor(t1 * SR));
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const pL = buf.getChannelData(2);
  const pR = buf.getChannelData(3);
  let peak = 0;
  let prePeak = 0;
  let left = 0;
  let right = 0;
  for (let i = i0; i < i1; i++) {
    const a = Math.abs(L[i]);
    const b = Math.abs(R[i]);
    if (a > left) left = a;
    if (b > right) right = b;
    const c = Math.max(Math.abs(pL[i]), Math.abs(pR[i]));
    if (c > prePeak) prePeak = c;
  }
  peak = Math.max(left, right);
  const floor = Math.max(0.0004, peak * 0.0316);
  let first = -1;
  let last = -1;
  for (let i = i0; i < i1; i++) {
    if (Math.abs(L[i]) > floor || Math.abs(R[i]) > floor) {
      if (first < 0) first = i;
      last = i;
    }
  }
  if (first < 0) return { peak, prePeak, rms: 0, dur: 0, onset: 0, centroid: 0, low: 0, mid: 0, high: 0, left, right, rmsLeft: 0, rmsRight: 0 };
  let sumL = 0;
  let sumR = 0;
  for (let i = first; i <= last; i++) {
    sumL += L[i] * L[i];
    sumR += R[i] * R[i];
  }
  const span = last - first + 1;
  const rms = Math.sqrt((sumL + sumR) / 2 / span);

  // Averaged power spectrum of the active part.
  const N = 4096;
  const power = new Float64Array(N / 2);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  let frames = 0;
  for (let s = first; s <= last && frames < 1200; s += N / 2) {
    for (let i = 0; i < N; i++) {
      const j = s + i;
      const x = j < i1 ? (L[j] + R[j]) / 2 : 0;
      re[i] = x * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < N / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  let total = 0;
  let weighted = 0;
  let low = 0;
  let mid = 0;
  let high = 0;
  for (let k = 1; k < N / 2; k++) {
    const f = (k * SR) / N;
    const p = power[k];
    total += p;
    weighted += p * f;
    if (f < 250) low += p;
    else if (f < 2500) mid += p;
    else high += p;
  }
  total = Math.max(total, 1e-30);
  return { peak, prePeak, rms, dur: span / SR, onset: (first - i0) / SR, centroid: weighted / total, low: low / total, mid: mid / total, high: high / total, left, right, rmsLeft: Math.sqrt(sumL / span), rmsRight: Math.sqrt(sumR / span) };
}

/** Amplitude of one frequency over a short stretch of the output (Goertzel). Only for steady tones. */
function toneLevel(buf: AudioBuffer, t0: number, t1: number, freq: number): number {
  const i0 = Math.max(0, Math.floor(t0 * SR));
  const i1 = Math.min(buf.length, Math.floor(t1 * SR));
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const w = (2 * Math.PI * freq) / SR;
  const c = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = i0; i < i1; i++) {
    const s = (L[i] + R[i]) / 2 + c * s1 - s2;
    s2 = s1;
    s1 = s;
  }
  const n = Math.max(1, i1 - i0);
  return (2 * Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2))) / n;
}

/**
 * RMS of the output between two frequencies, from averaged spectra. Unlike
 * toneLevel this does not care about phase, so it works on notes that stop
 * and start.
 */
function bandLevel(buf: AudioBuffer, t0: number, t1: number, fLo: number, fHi: number): number {
  const i0 = Math.max(0, Math.floor(t0 * SR));
  const i1 = Math.min(buf.length, Math.floor(t1 * SR));
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const N = 16384;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  let power = 0;
  let frames = 0;
  for (let s = i0; s + N <= i1; s += N / 4) {
    for (let i = 0; i < N; i++) {
      re[i] = ((L[s + i] + R[s + i]) / 2) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      im[i] = 0;
    }
    fft(re, im);
    for (let k = Math.ceil((fLo * N) / SR); k <= Math.floor((fHi * N) / SR); k++) power += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  // Scale so a full-scale sine inside the band reads about 0.707: the Hann window
  // has a coherent gain of N/2 and spreads a tone over a few bins (sum of squares 1.5).
  return frames ? Math.sqrt((power / frames) * (2 / 1.5)) / (N / 2) : 0;
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Hand a stretch of the output to the runner as a 16-bit stereo WAV. */
/**
 * How hard the master limiter works over a stretch: its gain reduction,
 * 10 ms at a time, from the output against the mix before it (channels 2-3),
 * against what it passes at low levels (`unity`). The median, the 95th
 * percentile, and the share of the time it takes off more than 2 dB.
 */
function limiting(buf: AudioBuffer, t0: number, t1: number, unity: number): { median: number; p95: number; over2: number } {
  const out = [buf.getChannelData(0), buf.getChannelData(1)];
  const pre = [buf.getChannelData(2), buf.getChannelData(3)];
  const step = Math.round(SR * 0.01);
  const gr: number[] = [];
  for (let i = Math.floor(t0 * SR); i + step < Math.min(buf.length, t1 * SR); i += step) {
    let o = 0;
    let p = 0;
    for (let c = 0; c < 2; c++) for (let j = i; j < i + step; j++) {
      o += out[c][j] * out[c][j];
      p += pre[c][j] * pre[c][j];
    }
    if (p > 1e-8) gr.push(Math.max(0, -10 * Math.log10(o / p / (unity * unity))));
  }
  gr.sort((a, b) => a - b);
  const at = (q: number) => gr[Math.min(gr.length - 1, Math.floor(q * gr.length))] ?? 0;
  return { median: at(0.5), p95: at(0.95), over2: gr.filter((g) => g > 2).length / Math.max(1, gr.length) };
}

async function dump(name: string, buf: AudioBuffer, t0: number, t1: number): Promise<void> {
  if (!DUMP || !window.__audioDump) return;
  const i0 = Math.max(0, Math.floor(t0 * SR));
  const n = Math.min(buf.length, Math.floor(t1 * SR)) - i0;
  const bytes = new Uint8Array(44 + n * 4);
  const v = new DataView(bytes.buffer);
  const text = (o: number, s: string): void => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  v.setUint32(4, 36 + n * 4, true);
  text(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, SR, true);
  v.setUint32(28, SR * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, n * 4, true);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 4, Math.round(Math.max(-1, Math.min(1, L[i0 + i])) * 32767), true);
    v.setInt16(46 + i * 4, Math.round(Math.max(-1, Math.min(1, R[i0 + i])) * 32767), true);
  }
  await window.__audioDump(name, base64(bytes));
}

async function offlineSfx(): Promise<void> {
  log('--- offline: sound effects ---');
  const SLOT = 3.6;
  const extras: Array<[string, SfxName, SfxOptions]> = [
    ['hit_light pan -1', 'hit_light', { pan: -1 }],
    ['hit_light pan +1', 'hit_light', { pan: 1 }],
    ['block volume 0.5', 'block', { volume: 0.5 }],
    ['lock pitch 2', 'lock', { pitch: 2 }],
    ['lock pitch 0.5', 'lock', { pitch: 0.5 }],
    ['bump volume 0', 'bump', { volume: 0 }],
    // The game raises the pitch of the gate chimes as charges are banked.
    ['gate pitch 1.25', 'gate', { pitch: 1.25 }],
    ['gate pitch 1.5', 'gate', { pitch: 1.5 }],
    ['cells_full pitch 1.5', 'cells_full', { pitch: 1.5 }],
  ];
  const plays: Array<[string, SfxName, SfxOptions | undefined]> = [...SFX_NAMES.map((n): [string, SfxName, undefined] => [n, n, undefined]), ...extras];
  // The carbine is fired three times, 5 ticks apart.
  // The compressor takes a moment to settle when a context starts; begin after that.
  const LEAD = 1;
  const burstAt = LEAD + plays.length * SLOT;
  const cues: Cue[] = plays.map(([, name, opts], i) => ({ t: LEAD + i * SLOT + 0.1, run: (a) => a.play(name, opts) }));
  for (let k = 0; k < 3; k++) cues.push({ t: burstAt + 0.1 + k * 0.1, run: (a) => a.play('shot_carbine') });
  let maxVoices = 0;
  const { buf, warnings, audio } = await render(burstAt + SLOT, cues, () => OFF, (_t, a) => {
    maxVoices = Math.max(maxVoices, a.debugInfo().voices);
  });
  if (warnings) fail(`the engine swallowed ${warnings} Web Audio error(s) while rendering sound effects`);
  if (audio.debugInfo().voices !== 0) fail('voices still alive at the end of the sound-effect render');

  const stats = new Map<string, Stats>();
  for (let i = 0; i < plays.length; i++) {
    const [label, name] = plays[i];
    const at = LEAD + i * SLOT;
    const s = analyse(buf, at, at + SLOT);
    stats.set(label, s);
    if (i < SFX_NAMES.length) {
      // Gain through the limiter: 0 dB means it was left alone.
      const through = s.prePeak > 1e-6 ? db(s.peak / (s.prePeak * VOL.master)) : 0;
      table('sfx (offline, default volumes)').push({
        name,
        peak: r3(s.peak),
        dBFS: db(s.peak),
        'rms dBFS': db(s.rms),
        'pre-limiter': r3(s.prePeak),
        'limiter dB': through,
        'length (s)': r3(s.dur),
        'centre (Hz)': Math.round(s.centroid),
        'low/mid/high %': `${Math.round(s.low * 100)}/${Math.round(s.mid * 100)}/${Math.round(s.high * 100)}`,
      });
      if (s.peak < SILENT) fail(`sfx ${name} is silent offline (peak ${s.peak.toFixed(4)})`);
      if (s.peak >= CLIP) fail(`sfx ${name} clips offline (peak ${s.peak.toFixed(3)})`);
      if (s.prePeak < 0.3 && Math.abs(through) > 0.3) fail(`limiter is not unity for quiet sound ${name}: ${through} dB`);
      await dump(`sfx-${name}`, buf, at, at + Math.min(SLOT, s.onset + s.dur + 0.5));
    } else if (label.includes('pitch')) {
      await dump(`sfx-${label.replace(/ /g, '-')}`, buf, at, at + Math.min(SLOT, s.onset + s.dur + 0.5));
    }
  }
  const get = (k: string): Stats => stats.get(k) as Stats;

  // Options.
  const pl = get('hit_light pan -1');
  const pr = get('hit_light pan +1');
  const half = get('block volume 0.5');
  const up = get('lock pitch 2');
  const down = get('lock pitch 0.5');
  table('sfx options (offline)').push(
    { option: 'pan -1', result: `left ${r3(pl.left)}, right ${r3(pl.right)}` },
    { option: 'pan +1', result: `left ${r3(pr.left)}, right ${r3(pr.right)}` },
    { option: 'volume 0.5', result: `peak ${r3(half.peak)} against ${r3(get('block').peak)} at full` },
    { option: 'pitch 2', result: `centre ${Math.round(up.centroid)} Hz, length ${r3(up.dur)} s (plain: ${Math.round(get('lock').centroid)} Hz, ${r3(get('lock').dur)} s)` },
    { option: 'pitch 0.5', result: `centre ${Math.round(down.centroid)} Hz, length ${r3(down.dur)} s` },
    ...['gate pitch 1.25', 'gate pitch 1.5', 'cells_full pitch 1.5'].map((k) => {
      const hi = get(k);
      const plain = get(k.split(' ')[0]);
      return { option: k, result: `peak ${r3(hi.peak)}, centre ${Math.round(hi.centroid)} Hz, ${Math.round(hi.high * 100)}% above 2.5 kHz, length ${r3(hi.dur)} s (plain: ${r3(plain.peak)}, ${Math.round(plain.centroid)} Hz, ${Math.round(plain.high * 100)}%, ${r3(plain.dur)} s)` };
    }),
    { option: 'volume 0', result: `peak ${r3(get('bump volume 0').peak)}` },
    { option: 'carbine burst x3', result: `peak ${r3(analyse(buf, burstAt, burstAt + SLOT).peak)} against ${r3(get('shot_carbine').peak)} for one shot` },
    { option: 'most voices at once', result: maxVoices },
  );
  if (!(pl.left > pl.right * 8)) fail('pan -1 does not put the sound on the left');
  if (!(pr.right > pr.left * 8)) fail('pan +1 does not put the sound on the right');
  const ratio = half.prePeak / get('block').prePeak;
  if (Math.abs(ratio - 0.5) > 0.08) fail(`volume 0.5 scales the pre-limiter peak by ${ratio.toFixed(2)}, expected 0.5`);
  if (!(up.centroid > get('lock').centroid * 1.5 && down.centroid < get('lock').centroid / 1.5)) fail('pitch option does not move the spectrum');
  if (get('bump volume 0').peak > 0.0005) fail('volume 0 is not silent');
  // Raised in pitch, the gate chimes should be as loud as they are plain: no louder, no weaker.
  for (const k of ['gate pitch 1.25', 'gate pitch 1.5', 'cells_full pitch 1.5']) {
    const change = db(get(k).peak) - db(get(k.split(' ')[0]).peak);
    if (Math.abs(change) > 2) fail(`${k} peaks ${change.toFixed(1)} dB away from the plain sound`);
  }

  // Every sound should be recognisably its own: no two alike in length, pitch and balance at once.
  for (let i = 0; i < SFX_NAMES.length; i++) {
    for (let j = i + 1; j < SFX_NAMES.length; j++) {
      const a = get(SFX_NAMES[i]);
      const b = get(SFX_NAMES[j]);
      const dLen = Math.abs(Math.log2((a.dur + 0.01) / (b.dur + 0.01)));
      const dCen = Math.abs(Math.log2((a.centroid + 1) / (b.centroid + 1)));
      const dBal = Math.abs(a.low - b.low) + Math.abs(a.high - b.high);
      if (dLen < 0.12 && dCen < 0.12 && dBal < 0.08) report.notes.push(`sfx ${SFX_NAMES[i]} and ${SFX_NAMES[j]} measure alike (length, spectral centre and balance all within about 8%); tell them apart by ear`);
    }
  }
}

async function offlineLayers(): Promise<void> {
  log('--- offline: continuous layer ---');
  const SLOT = 3.2;
  const caseAt = (t: number): number => Math.min(LAYER_CASES.length - 1, Math.floor(t / SLOT + 1e-9));
  const sceneAt = (t: number): AudioScene => LAYER_CASES[caseAt(t)].scene;
  // Each layer on its own, read from the engine's taps and scaled to the output.
  const meters = new TapMeters();
  const scale = VOL.sfx * VOL.master;
  let current = 0;
  const { buf, warnings } = await render(LAYER_CASES.length * SLOT, [], sceneAt, (t, a, ctx) => {
    const i = caseAt(t);
    if (i !== current) {
      const got = meters.take(scale, 'layer.');
      const row: Row = { scene: LAYER_CASES[current].name };
      for (const [k, v] of Object.entries(got)) row[k] = v.rms > 1e-5 ? db(v.rms) : '-';
      table('continuous layer, each part alone (offline, rms dBFS at the output)').push(row);
      current = i;
    }
    meters.poll(a, ctx, t - i * SLOT >= 1.6);
  });
  if (warnings) fail(`the engine swallowed ${warnings} Web Audio error(s) while rendering the continuous layer`);
  const seen = new Map<string, Stats>();
  LAYER_CASES.forEach((c, i) => {
    const s = analyse(buf, i * SLOT + 1.6, (i + 1) * SLOT);
    seen.set(c.name, s);
    const base = c.vs ? seen.get(c.vs) : undefined;
    const row: Row = {
      scene: c.name,
      peak: r3(s.peak),
      'rms dBFS': db(s.rms),
      'layer alone dBFS': base ? db(Math.sqrt(Math.max(0, s.rms ** 2 - base.rms ** 2))) : '',
      'change dB': base ? Math.round((db(s.rms) - db(base.rms)) * 10) / 10 : '',
      'centre (Hz)': Math.round(s.centroid),
      'low/mid/high %': `${Math.round(s.low * 100)}/${Math.round(s.mid * 100)}/${Math.round(s.high * 100)}`,
      'left-right dB': c.silent ? '' : Math.round((db(s.rmsLeft) - db(s.rmsRight)) * 10) / 10,
    };
    table('continuous layer (offline, default volumes)').push(row);
    if (!c.silent && Math.abs(db(s.rmsLeft) - db(s.rmsRight)) > 2) fail(`continuous layer leans to one side in scene "${c.name}"`);
    if (c.silent && s.peak > 0.002) fail(`continuous layer not silent when racing is false (${c.name}: peak ${s.peak.toFixed(4)})`);
    if (!c.silent && s.rms < 0.002) fail(`continuous layer inaudible in scene "${c.name}"`);
    if (s.peak >= CLIP) fail(`continuous layer clips in scene "${c.name}"`);
    if (base && c.name !== '+battle' && c.name !== '+drafting' && !(s.rms > base.rms * 1.03)) fail(`flag ${c.name} adds nothing measurable`);
  });
  const battle = seen.get('+battle') as Stats;
  const before = seen.get('pre-battle (100, 0.6)') as Stats;
  if (!(battle.rms < before.rms * 0.95)) fail('battle does not duck the engine');
  const draft = seen.get('+drafting') as Stats;
  const clean = seen.get('limiter (110)') as Stats;
  if (Math.abs(draft.centroid - clean.centroid) < 15 && Math.abs(db(draft.rms) - db(clean.rms)) < 0.5) fail('drafting changes nothing measurable');
  // Engine pitch should rise with speed.
  const idle = seen.get('idle (speed 0)') as Stats;
  const fast = seen.get('flat out (160)') as Stats;
  if (!(fast.centroid > idle.centroid * 1.5)) fail('engine does not get brighter with speed');

  // The alarm: count beeps over the three seconds of the critical scene.
  const ci = LAYER_CASES.findIndex((c) => c.name === '+critical');
  let beeps = 0;
  let on = false;
  let top = 0;
  const env: number[] = [];
  for (let t = ci * SLOT; t < (ci + 1) * SLOT - 0.02; t += 0.02) {
    const v = toneLevel(buf, t, t + 0.02, 659.3);
    env.push(v);
    top = Math.max(top, v);
  }
  for (const v of env) {
    if (!on && v > top * 0.5) {
      on = true;
      beeps++;
    } else if (on && v < top * 0.2) on = false;
  }
  const rate = beeps / SLOT;
  table('alarm (offline)').push({ 'beeps in 3.2 s': beeps, 'per second': r3(rate), 'beep level': r3(top) });
  // A short warning when armour goes critical, then quiet: three beeps, not a beep that runs all race.
  if (beeps !== 3) fail(`critical alarm gave ${beeps} beeps in ${SLOT} s, expected 3 and then quiet`);
  await dump('layers', buf, 0, LAYER_CASES.length * SLOT);
}

/**
 * Frequency of a steady tone between two frequencies, to a fraction of a hertz:
 * the strongest one, or with `lowest` the first that is at least a quarter as
 * strong as the strongest. Needs 1.4 s of signal.
 */
function toneFreq(buf: AudioBuffer, t0: number, fLo: number, fHi: number, lowest = false): number {
  const N = 65536;
  const i0 = Math.max(0, Math.min(buf.length - N, Math.floor(t0 * SR)));
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = ((L[i0 + i] + R[i0 + i]) / 2) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  fft(re, im);
  const mag = (k: number): number => Math.hypot(re[k], im[k]);
  const k0 = Math.max(2, Math.ceil((fLo * N) / SR));
  const k1 = Math.floor((fHi * N) / SR);
  let best = k0;
  for (let k = k0; k <= k1; k++) if (mag(k) > mag(best)) best = k;
  if (lowest) {
    const floor = mag(best) * 0.25;
    for (let k = k0; k < best; k++) {
      if (mag(k) > floor && mag(k) >= mag(k - 1) && mag(k) >= mag(k + 1)) {
        best = k;
        break;
      }
    }
  }
  // A parabola through the peak and its neighbours, on a log scale, finds the true top between bins.
  const a = Math.log(mag(best - 1) + 1e-30);
  const b = Math.log(mag(best) + 1e-30);
  const c = Math.log(mag(best + 1) + 1e-30);
  const off = a - 2 * b + c < 0 ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
  return ((best + off) * SR) / N;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** Nearest note and how far off it is, such as "A2 +5c". */
function noteName(freq: number): string {
  const midi = 69 + 12 * Math.log2(freq / 440);
  const near = Math.round(midi);
  const cents = Math.round((midi - near) * 100);
  return `${NOTE_NAMES[((near % 12) + 12) % 12]}${Math.floor(near / 12) - 1} ${cents < 0 ? '' : '+'}${cents}c`;
}

/**
 * Speeds worth looking at: rest, half pace, the two limiters, a defender and a
 * forward flat out on the speed lap, a forward boosting, then Overdrive and the
 * brief peak it can reach with a tow.
 */
const SPEEDS: Array<[number, string]> = [
  [0, 'rest'],
  [55, 'half pace'],
  [110, 'lap 1 limiter'],
  [125, 'lap 2 limiter'],
  [145, 'defender, lap 3'],
  [160, 'forward, lap 3'],
  [192, 'forward boosting'],
  [200, ''],
  [208, 'Overdrive'],
  [250, 'Overdrive peak'],
];

const PARTS = ['engine', 'whine', 'wind', 'road'];

/** How the turbine, wind and road follow speed alone: full throttle, no boost, nothing else going on. */
async function offlineSpeeds(): Promise<void> {
  log('--- offline: speed sweep ---');
  const SLOT = 3.2;
  const slot = (t: number): number => Math.min(SPEEDS.length - 1, Math.floor(t / SLOT + 1e-9));
  const meters = new TapMeters();
  const scale = VOL.sfx * VOL.master;
  const parts: Array<Record<string, { rms: number; peak: number }>> = [];
  let current = 0;
  const { buf, warnings } = await render(SPEEDS.length * SLOT + 0.1, [], (t) => ({ ...BASE, speed: SPEEDS[slot(t)][0] }), (t, a, ctx) => {
    const i = t >= SPEEDS.length * SLOT - 1e-6 ? SPEEDS.length : slot(t);
    if (i !== current) {
      parts.push(meters.take(scale, 'layer.'));
      current = i;
    }
    meters.poll(a, ctx, i < SPEEDS.length && t - i * SLOT >= 1.6);
  });
  if (warnings) fail(`the engine swallowed ${warnings} Web Audio error(s) while rendering the speed sweep`);
  interface Point {
    speed: number;
    f0: number;
    whine: number[];
    s: Stats;
    /** Level above 2.5 kHz and above 5 kHz, as RMS. */
    harsh: number;
    hiss: number;
    parts: Record<string, { rms: number; peak: number }>;
  }
  const points: Point[] = [];
  SPEEDS.forEach(([speed, what], i) => {
    const t0 = i * SLOT + 1.6;
    const s = analyse(buf, t0, (i + 1) * SLOT);
    // The two saws beat against each other, so the turbine's pitch is read from
    // the sine an octave under them: the lowest partial, and the one that never wavers.
    const f0 = 2 * toneFreq(buf, t0, 15, 400, true);
    const whine = [toneFreq(buf, t0, f0 * 5.6, f0 * 6.4), toneFreq(buf, t0, f0 * 8.6, f0 * 9.4)];
    const harsh = bandLevel(buf, t0, (i + 1) * SLOT, 2500, 20000);
    const hiss = bandLevel(buf, t0, (i + 1) * SLOT, 5000, 20000);
    points.push({ speed, f0, whine, s, harsh, hiss, parts: parts[i] ?? {} });
    const ref = points.find((p) => p.speed === BASE.speed);
    const row: Row = {
      'speed (u/s)': speed,
      what,
      'turbine (Hz)': r3(f0),
      note: noteName(f0),
      'whine (Hz)': speed > 0 ? `${Math.round(whine[0])}, ${Math.round(whine[1])}` : '',
      peak: r3(s.peak),
      'rms dBFS': db(s.rms),
      'against lap 1 dB': ref ? Math.round((db(s.rms) - db(ref.s.rms)) * 10) / 10 : '',
      'centre (Hz)': Math.round(s.centroid),
      'low/mid/high %': `${Math.round(s.low * 100)}/${Math.round(s.mid * 100)}/${Math.round(s.high * 100)}`,
      'above 2.5 kHz dBFS': db(harsh),
      'above 5 kHz dBFS': db(hiss),
    };
    for (const k of PARTS) {
      const v = parts[i]?.[k];
      row[k] = v && v.rms > 1e-5 ? db(v.rms) : '-';
    }
    table('speed sweep (offline, default volumes; full throttle, nothing else on; parts are rms dBFS at the output)').push(row);
    if (s.peak >= CLIP) fail(`continuous layer clips at ${speed} u/s`);
  });
  const at = (speed: number): Point => points.find((p) => p.speed === speed) as Point;
  const cents = (freq: number, midi: number): number => 1200 * Math.log2(freq / mtof(midi));

  // The notes the turbine is tuned to (see IDLE_HZ in layers.ts): A2 at the
  // first limiter with the whine on E5 and B5, then B2, D3, E3 and A3.
  for (const [speed, midi] of [[110, 45], [125, 47], [145, 50], [160, 52], [208, 57]]) {
    const off = cents(at(speed).f0, midi);
    if (Math.abs(off) > 25) fail(`turbine at ${speed} u/s is ${Math.round(off)} cents from ${noteName(mtof(midi)).split(' ')[0]}: ${noteName(at(speed).f0)}`);
  }
  const lim = at(BASE.speed);
  if (Math.abs(cents(lim.whine[0], 76)) > 25 || Math.abs(cents(lim.whine[1], 83)) > 25) fail(`whine at the limiter is not on E5 and B5: ${noteName(lim.whine[0])}, ${noteName(lim.whine[1])}`);

  // Each step up in speed has to be heard: higher, louder and brighter.
  const steps = [110, 125, 160, 200, 250];
  for (let i = 1; i < steps.length; i++) {
    const a = at(steps[i - 1]);
    const b = at(steps[i]);
    const louder = db(b.s.rms) - db(a.s.rms);
    const higher = 12 * Math.log2(b.f0 / a.f0);
    if (louder < 0.5 || higher < 1.5 || b.s.centroid <= a.s.centroid) fail(`no clear step from ${a.speed} to ${b.speed} u/s: ${louder.toFixed(1)} dB louder, ${higher.toFixed(1)} semitones higher, centre ${Math.round(a.s.centroid)} to ${Math.round(b.s.centroid)} Hz`);
  }
  // And no part may stop growing at the first limiter, or anywhere short of a boost.
  for (const [lo, hi] of [[110, 160], [160, 200]]) {
    for (const k of PARTS) {
      const gain = db(at(hi).parts[k]?.rms ?? 0) - db(at(lo).parts[k]?.rms ?? 0);
      if (gain < 0.5) fail(`${k} does not grow from ${lo} to ${hi} u/s (${gain.toFixed(1)} dB)`);
    }
  }

  // The top end must not turn shrill: the whine stays under 2.5 kHz and what
  // there is above that sits well below the body of the sound.
  for (const speed of [200, 250]) {
    const p = at(speed);
    const top = db(p.harsh) - db(p.s.rms);
    const air = db(p.hiss) - db(p.s.rms);
    if (top > -9 || air > -18) fail(`continuous layer is too bright at ${speed} u/s: ${top.toFixed(1)} dB above 2.5 kHz and ${air.toFixed(1)} dB above 5 kHz, against the whole`);
    if (p.whine[1] > 2500) fail(`turbine whine reaches ${Math.round(p.whine[1])} Hz at ${speed} u/s`);
  }
  await dump('speeds', buf, 0, SPEEDS.length * SLOT);
}

async function offlineMusic(): Promise<void> {
  log('--- offline: music ---');
  // Menu, then a race whose lap phase changes in the middle of a bar, then silence.
  const T_RACE = 30;
  const T_P2 = T_RACE + 37.3;
  const T_P3 = T_P2 + 37.4;
  const T_NULL = T_P3 + 37.2;
  const T_END = T_NULL + 3;
  const sceneAt = (t: number): AudioScene => ({ ...OFF, lapPhase: t >= T_P3 ? 3 : t >= T_P2 ? 2 : 1 });
  const cues: Cue[] = [
    { t: 0, run: (a) => a.setMusic('menu') },
    { t: T_RACE, run: (a) => a.setMusic('race') },
    { t: T_NULL, run: (a) => a.setMusic(null) },
  ];
  interface Change {
    phase: number;
    at: number;
    start: number;
    bar: number;
  }
  const changes: Change[] = [];
  let lastPhase = 1;
  let tracksLeft = -1;
  const meters = new TapMeters();
  const scale = VOL.music * VOL.master;
  const marks: Array<[number, string]> = [[T_RACE, 'menu'], [T_P2, 'race, phase 1'], [T_P3, 'race, phase 2'], [T_NULL, 'race, phase 3']];
  let mark = 0;
  const { buf, warnings } = await render(T_END, cues, sceneAt, (t, a, ctx) => {
    if (mark < marks.length && t >= marks[mark][0] - 1e-6) {
      const got = meters.take(scale, 'music.');
      const row: Row = { state: marks[mark][1] };
      for (const [k, v] of Object.entries(got)) row[k] = v.rms > 1e-5 ? `${db(v.rms)} (${r3(v.peak)})` : '-';
      table('music, each part alone (offline, rms dBFS and peak at the output)').push(row);
      mark++;
    }
    // Skip the first bars after each change so cross-fades are not counted.
    const since = t - (mark > 0 ? marks[mark - 1][0] : 0);
    meters.poll(a, ctx, since > 4);
    const d = a.debugInfo();
    const m = d.music;
    if (m && m.name === 'race' && m.phase !== lastPhase) {
      lastPhase = m.phase;
      changes.push({ phase: m.phase, at: m.changeAt, start: m.startTime, bar: m.barDur });
    }
    if (t > T_END - 0.2) tracksLeft = (m ? 1 : 0) + d.fadingTracks;
  });
  if (warnings) fail(`the engine swallowed ${warnings} Web Audio error(s) while rendering music`);
  if (tracksLeft !== 0) fail(`${tracksLeft} music track(s) still alive 3 s after setMusic(null)`);

  const p2 = changes.find((c) => c.phase === 2);
  const p3 = changes.find((c) => c.phase === 3);
  const sections: Array<[string, number, number]> = [
    ['menu', 2, T_RACE],
    ['race, phase 1', T_RACE + 2, T_P2],
    ['race, phase 2', (p2?.at ?? T_P2 + 2) + 0.05, T_P3],
    ['race, phase 3', (p3?.at ?? T_P3 + 2) + 0.05, T_NULL],
  ];
  const got = new Map<string, Stats>();
  for (const [name, t0, t1] of sections) {
    const s = analyse(buf, t0, t1);
    got.set(name, s);
    table('music (offline, default volumes)').push({
      state: name,
      peak: r3(s.peak),
      'rms dBFS': db(s.rms),
      'pre-limiter peak': r3(s.prePeak),
      'centre (Hz)': Math.round(s.centroid),
      'low/mid/high %': `${Math.round(s.low * 100)}/${Math.round(s.mid * 100)}/${Math.round(s.high * 100)}`,
      'left-right dB': Math.round((db(s.rmsLeft) - db(s.rmsRight)) * 10) / 10,
    });
    const lim = limiting(buf, t0, t1, VOL.master);
    table('music: the master limiter (offline)').push({ state: name, 'median / 95% (dB)': `${lim.median.toFixed(1)} / ${lim.p95.toFixed(1)}`, 'over 2 dB': `${Math.round(lim.over2 * 100)}%` });
    if (s.rms < 0.004) fail(`music state "${name}" is inaudible`);
    if (s.peak >= CLIP) fail(`music state "${name}" clips`);
    if (Math.abs(db(s.rmsLeft) - db(s.rmsRight)) > 2) fail(`music state "${name}" leans to one side by ${(db(s.rmsLeft) - db(s.rmsRight)).toFixed(1)} dB`);
  }
  const cross = analyse(buf, T_RACE, T_RACE + 1.5);
  const gone = analyse(buf, T_NULL + 1.5, T_END);
  table('music (offline, default volumes)').push(
    { state: 'menu to race cross-fade (1.5 s)', peak: r3(cross.peak), 'rms dBFS': db(cross.rms), 'pre-limiter peak': r3(cross.prePeak), 'centre (Hz)': '', 'low/mid/high %': '', 'left-right dB': '' },
    { state: 'null, 1.5 s after the call', peak: r3(gone.peak), 'rms dBFS': db(gone.rms), 'pre-limiter peak': r3(gone.prePeak), 'centre (Hz)': '', 'low/mid/high %': '', 'left-right dB': '' },
  );
  if (gone.peak > 0.003) fail(`music still audible 1.5 s after setMusic(null) (peak ${gone.peak.toFixed(4)})`);
  if (cross.rms < 0.002) fail('silence between menu and race music: the cross-fade has a hole');

  // Arrangement changes must land on bar lines, soon after they are asked for.
  for (const [want, asked] of [[2, T_P2], [3, T_P3]]) {
    const c = changes.find((x) => x.phase === want);
    if (!c) {
      fail(`race music never reached phase ${want}`);
      continue;
    }
    const bars = (c.at - c.start) / c.bar;
    const wait = c.at - asked;
    const lowBefore = bandLevel(buf, c.at - c.bar, c.at, 35, 110);
    const lowAfter = bandLevel(buf, c.at, c.at + c.bar, 35, 110);
    // The first chord of every phase is the tonic: A before the speed lap, B after.
    const a2 = Math.hypot(bandLevel(buf, c.at, c.at + c.bar, 107, 113), bandLevel(buf, c.at, c.at + c.bar, 216, 224));
    const b2 = Math.hypot(bandLevel(buf, c.at, c.at + c.bar, 120.5, 126.5), bandLevel(buf, c.at, c.at + c.bar, 243, 251));
    table('race music phase changes (offline)').push({
      'to phase': want,
      'asked at (s)': r3(asked),
      'changed at (s)': r3(c.at),
      'bars from start': r3(bars),
      'wait (bars)': r3(wait / c.bar),
      'below 110 Hz, bar before / after': `${db(lowBefore)} / ${db(lowAfter)} dBFS`,
      'bass on A / B in first bar': `${db(a2)} / ${db(b2)} dBFS`,
    });
    if (Math.abs(bars - Math.round(bars)) > 1e-3) fail(`phase ${want} began ${bars.toFixed(3)} bars in: not on a bar line`);
    // Steps are queued a fraction of a second ahead, so a request can just miss the next bar line.
    if (wait < -0.5 || wait > c.bar + 0.5) fail(`phase ${want} began ${wait.toFixed(2)} s after it was asked for`);
    if (want === 2 && !(lowAfter > lowBefore * 2)) fail('no kick drum energy arrives with the battle lap');
    if (want === 2 && !(a2 > b2 * 1.5)) fail('the battle lap is not in A minor (bass not on A)');
    if (want === 3 && !(b2 > a2 * 1.5)) fail('the speed lap does not lift the key (bass still on A)');
  }
  const s1 = got.get('race, phase 1') as Stats;
  const s2 = got.get('race, phase 2') as Stats;
  const s3 = got.get('race, phase 3') as Stats;
  if (!(s2.rms > s1.rms && s3.rms >= s2.rms * 0.95)) fail('race music does not build with the lap phase');

  // Loudness bar by bar, to see the arrangement breathe.
  const barDur = p2?.bar ?? 60 / 138;
  const start = p2?.start ?? T_RACE + 0.1;
  const bars: number[] = [];
  for (let t = start; t + barDur <= T_NULL; t += barDur) bars.push(Math.round(db(analyse(buf, t, t + barDur).rms)));
  report.notes.push(`race music, RMS dBFS per bar: ${bars.join(' ')}`);
  const menuBars: number[] = [];
  for (let t = 0.1; t + 2.4 <= T_RACE; t += 2.4) menuBars.push(Math.round(db(analyse(buf, t, t + 2.4).rms)));
  report.notes.push(`menu music, RMS dBFS per bar: ${menuBars.join(' ')}`);
  await dump('music-menu', buf, 0, T_RACE);
  await dump('music-race-1', buf, T_RACE, T_P2 + 2);
  await dump('music-race-2', buf, T_P2 + 2, T_P3 + 2);
  await dump('music-race-3', buf, T_P3 + 2, T_END);
}

/**
 * The recorded song (?music=suno) through the whole engine, offline: a race
 * whose lap phase changes mid-bar, long enough to loop, then the finish.
 * Every change has to land on its bar line with the files lined up to the
 * sample: around each one, the render is compared with the layers summed by
 * hand at the levels for each lap, and has to match on both sides.
 */
async function offlineSong(): Promise<void> {
  log('--- offline: recorded song ---');
  const T_RACE = 0.5;
  const T_P2 = 30.37;
  const T_P3 = 95.21;
  const T_FIN = 160.83;
  // Long enough for the ending to play out and the menu music to take over.
  const T_END = T_FIN + 16;
  const sceneAt = (t: number): AudioScene => ({ ...OFF, lapPhase: t >= T_P3 ? 3 : t >= T_P2 ? 2 : 1, finished: t >= T_FIN });
  let info: SongInfo | null = null;
  let menuAt = NaN;
  const { buf, audio, warnings } = await render(T_END, [{ t: T_RACE, run: (a) => a.setMusic('race', 'meridian') }], sceneAt, (t, a) => {
    const music = a.debugInfo().music;
    info = music?.song ?? info;
    if (music?.name === 'menu' && Number.isNaN(menuAt)) menuAt = t;
  }, undefined, true, { meridian: '/music/meridian/' });
  if (warnings) fail(`the engine swallowed ${warnings} Web Audio error(s) while playing the song`);
  const src = audio.debugSongs().get('meridian');
  const song = info as SongInfo | null;
  if (!src || src.state !== 'ready' || !src.manifest || !song) {
    fail(`the song did not load (${src?.state ?? 'no song'})`);
    return;
  }
  const m = src.manifest;
  const when = (what: RegExp) => song.log.find((e) => what.test(e.what))?.at ?? NaN;
  const start = when(/^start/);
  const lap2 = when(/^lap 2/);
  const lap3 = when(/^lap 3/);
  const seam = when(/^loop/);
  const ending = when(/^ending/);
  for (const e of song.log) table('recorded song: what it did (offline)').push({ at: r3(e.at), what: e.what, bar: e.bar });
  // Each change on a bar line: the song position at that moment is a bar line.
  const posAt = (t: number) => (t < seam ? t - start : t < ending ? m.loop[0] + (t - seam) : m.ending + (t - ending));
  for (const [name, t, asked] of [['lap 2', lap2, T_P2], ['lap 3', lap3, T_P3], ['ending', ending, T_FIN]] as const) {
    if (!Number.isFinite(t)) {
      fail(`the song never did its ${name}`);
      continue;
    }
    // (Where the song had got to: for the ending, in the loop it cuts short.)
    const p = posAt(t - 1e-6);
    const onBar = m.bars.some((b) => Math.abs(b - p) < 0.0005);
    if (!onBar) fail(`the song's ${name} is not on a bar line (song position ${p.toFixed(4)} s)`);
    if (t < asked || t > asked + 0.3 + 1.8) fail(`the song's ${name} came ${(t - asked).toFixed(2)} s after it was asked for`);
  }
  if (Math.abs(seam - (start + m.loop[1])) > 0.001) fail(`the loop came at ${seam}, not at the loop's end (${start + m.loop[1]})`);

  // The render against the layers summed by hand, either side of each change.
  const scale = VOL.music * MUSIC_TRIM * 10 ** (m.level / 20);
  const gain = (id: string, lap: number) => {
    const g = m.laps[id]?.[lap - 1];
    return g === null || g === undefined ? 0 : 10 ** (g / 20);
  };
  const chans = src.buffers.map((b) => [b.getChannelData(0), b.getChannelData(1)]);
  const rate = src.buffers[0].sampleRate;
  if (rate !== SR) fail(`the song was decoded at ${rate} Hz, not the render's ${SR}`);
  const out = [buf.getChannelData(2), buf.getChannelData(3)];
  const side = (t0: number, t1: number, pos0: number, lap: number) => {
    // pos0: file position at t0. Compare over [t0, t1] at lags of up to 5 ms.
    const n = Math.floor((t1 - t0) * SR);
    const i0 = Math.round(t0 * SR);
    const j0 = Math.round((pos0 + src.shift) * rate);
    const want = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      let v = 0;
      for (let l = 0; l < m.layers.length; l++) v += gain(m.layers[l].id, lap) * (chans[l][0][j0 + k] ?? 0);
      want[k] = v * scale;
    }
    let best = 0;
    let bestScore = -Infinity;
    for (let lag = -240; lag <= 240; lag++) {
      let s2 = 0;
      for (let k = 0; k < n; k++) s2 += want[k] * (out[0][i0 + k + lag] ?? 0);
      if (s2 > bestScore) {
        bestScore = s2;
        best = lag;
      }
    }
    let res = 0;
    let sig = 0;
    for (let k = 0; k < n; k++) {
      const d = out[0][i0 + k + best] - want[k];
      res += d * d;
      sig += want[k] * want[k];
    }
    return { lag: best, residual: sig > 0 ? 10 * Math.log10(res / sig + 1e-12) : NaN };
  };
  const checks: Array<[string, number, number, number, number, number]> = [
    // name, change time, file position just before (NaN: not compared), lap before, file position just after, lap after
    // (A layer heard through a filter is not modelled here: then only after the change is compared.)
    ['lap 2 comes in', lap2, m.filter ? NaN : lap2 - start, 1, lap2 - start, 2],
    ['lap 3 comes in', lap3, lap3 - start, 2, lap3 - start, 3],
    ['the loop', seam, m.loop[1], 3, m.loop[0], 3],
    ['the ending', ending, posAt(ending - 1e-6), 3, m.ending, 3],
  ];
  for (const [name, t, before, lapB, after, lapA] of checks) {
    if (!Number.isFinite(t)) continue;
    const a = Number.isFinite(before) ? side(t - 0.4, t - XFADE - 0.002, before - 0.4, lapB) : { lag: 0, residual: -Infinity };
    const b = side(t + 0.03, t + 0.4, after + 0.03, lapA);
    table('recorded song: each change against the layers summed by hand (offline)').push({
      change: name,
      'at (s)': r3(t),
      'before: lag (samples)': Number.isFinite(before) ? a.lag : '-',
      'before: residual (dB)': Number.isFinite(before) ? Math.round(a.residual * 10) / 10 : '-',
      'after: lag (samples)': b.lag,
      'after: residual (dB)': Math.round(b.residual * 10) / 10,
    });
    // (A sample either way is the rounding of the window's start, not the song's.)
    if (Math.abs(a.lag) > 1 || Math.abs(b.lag) > 1) fail(`${name}: the render is ${a.lag} / ${b.lag} samples off the files either side`);
    if (a.residual > -60 || b.residual > -60) fail(`${name}: the render does not match the layers summed by hand (${a.residual.toFixed(1)} / ${b.residual.toFixed(1)} dB)`);
  }
  // No clicks at the joins: the biggest step between samples there, against the biggest elsewhere nearby.
  const step = (t0: number, t1: number) => {
    let mx = 0;
    for (let i = Math.round(t0 * SR); i < Math.round(t1 * SR); i++) mx = Math.max(mx, Math.abs(out[0][i] - out[0][i - 1]), Math.abs(out[1][i] - out[1][i - 1]));
    return mx;
  };
  for (const [name, t] of [['the loop', seam], ['the ending', ending]] as const) {
    if (!Number.isFinite(t)) continue;
    const at = step(t - XFADE - 0.002, t + 0.002);
    const around = step(t - 1, t + 1);
    table('recorded song: the joins (offline)').push({ join: name, 'largest step at the join': r3(at), 'largest within a second of it': r3(around) });
    if (at > around * 1.01 && at > 0.02) fail(`${name}: a click at the join (step ${at.toFixed(3)}, ${around.toFixed(3)} around it)`);
  }
  for (const [name, a, b] of [['lap 1', start + 2, lap2], ['lap 2', lap2 + 0.5, lap3], ['lap 3', lap3 + 0.5, seam], ['ending', ending + 0.1, ending + (m.end - m.ending) - 0.5]] as const) {
    const st = analyse(buf, a, b);
    const lim = limiting(buf, a, b, VOL.master);
    table('recorded song: level (offline, default volumes)').push({ stretch: name, 'rms dBFS': db(st.rms), peak: r3(st.peak), 'pre-limiter peak': r3(st.prePeak), 'limiter: median / 95% (dB)': `${lim.median.toFixed(1)} / ${lim.p95.toFixed(1)}`, 'limiter over 2 dB': `${Math.round(lim.over2 * 100)}%` });
    if (st.peak >= CLIP) fail(`the song clips (${name})`);
  }

  // Once the ending has played out, the menu music, with no long silence first.
  const endOfSong = ending + (m.end - m.ending);
  if (!(menuAt >= endOfSong && menuAt <= endOfSong + 1)) fail(`the menu music did not follow the song's ending (it ends at ${r3(endOfSong)}, menu at ${r3(menuAt)})`);
  let quiet = 0;
  let longest = 0;
  for (let t = endOfSong; t < endOfSong + 4; t += 0.05) {
    quiet = analyse(buf, t, t + 0.05).rms < 0.001 ? quiet + 0.05 : 0;
    longest = Math.max(longest, quiet);
  }
  const menu = analyse(buf, menuAt + 1, menuAt + 4);
  table('recorded song: after the ending (offline)').push({ 'song ends (s)': r3(endOfSong), 'menu music from (s)': r3(menuAt), 'longest silence (s)': r3(longest), 'menu music, rms dBFS': db(menu.rms) });
  if (longest > 1.2) fail(`${longest.toFixed(2)} s of silence after the song's ending`);
  if (menu.rms < 0.004) fail('the menu music after the song is inaudible');
  await dump('song', buf, 0, T_END);
}

async function offlineStyles(): Promise<void> {
  log('--- offline: each circuit\'s race music ---');
  // Every circuit's race music through its three lap phases, then a change
  // of circuit while the race music plays: it has to cross-fade to the new
  // style, not carry on with the old one.
  const PH = 24;
  for (const style of ['meridian', 'canyon', 'helios']) {
    const T2 = PH;
    const T3 = PH * 2;
    const T_SWAP = PH * 3;
    const T_END = T_SWAP + 6;
    const other = style === 'canyon' ? 'helios' : 'canyon';
    const cues: Cue[] = [
      { t: 0, run: (a) => a.setMusic('race', style) },
      { t: T_SWAP, run: (a) => a.setMusic('race', other) },
    ];
    const sceneAt = (t: number): AudioScene => ({ ...OFF, lapPhase: t >= T3 ? 3 : t >= T2 ? 2 : 1 });
    const seen = new Set<string>();
    let reached = 0;
    let swapped = '';
    const { buf, warnings } = await render(T_END, cues, sceneAt, (t, a) => {
      const m = a.debugInfo().music;
      if (!m) return;
      if (t < T_SWAP) {
        seen.add(m.style);
        reached = Math.max(reached, m.phase);
      } else if (t > T_SWAP + 1) {
        swapped = m.style;
      }
    });
    if (warnings) fail(`the engine swallowed ${warnings} Web Audio error(s) rendering the ${style} race music`);
    const rows: Array<[string, number, number]> = [
      ['phase 1', 2, T2],
      ['phase 2', T2 + 3, T3],
      ['phase 3', T3 + 3, T_SWAP],
    ];
    const rms: number[] = [];
    for (const [name, t0, t1] of rows) {
      const st = analyse(buf, t0, t1);
      rms.push(st.rms);
      table('race music by circuit (offline, default volumes)').push({
        circuit: style,
        state: name,
        peak: r3(st.peak),
        'rms dBFS': db(st.rms),
        'centre (Hz)': Math.round(st.centroid),
        'low/mid/high %': `${Math.round(st.low * 100)}/${Math.round(st.mid * 100)}/${Math.round(st.high * 100)}`,
        'left-right dB': Math.round((db(st.rmsLeft) - db(st.rmsRight)) * 10) / 10,
      });
      if (st.rms < 0.004) fail(`${style} race music, ${name}, is inaudible`);
      if (st.peak >= CLIP) fail(`${style} race music, ${name}, clips`);
      if (Math.abs(db(st.rmsLeft) - db(st.rmsRight)) > 2) fail(`${style} race music, ${name}, leans to one side`);
    }
    if (seen.size !== 1 || !seen.has(style)) fail(`asked for the ${style} race music, got ${[...seen].join(', ')}`);
    if (reached !== 3) fail(`${style} race music never reached the speed lap (phase ${reached})`);
    if (!(rms[1] > rms[0] && rms[2] >= rms[1] * 0.9)) fail(`${style} race music does not build with the lap phase`);
    if (swapped !== other) fail(`changing circuit from ${style} to ${other} left the ${swapped || 'no'} race music playing`);
    const cross = analyse(buf, T_SWAP, T_SWAP + 1.5);
    if (cross.rms < 0.002) fail(`silence when the race music changes from ${style} to ${other}`);
    await dump(`music-${style}`, buf, 0, T_END);
  }
}

async function offlineStack(): Promise<void> {
  log('--- offline: worst case ---');
  // The speed lap at the peak of an Overdrive with everything going wrong, and
  // a burst of the ten loudest sounds landing together every 0.4 s.
  const loud: SfxName[] = ['ko', 'hit_heavy', 'shot_scatter', 'guard_break', 'wall', 'parry', 'block', 'lap_phase', 'overdrive', 'pulse'];
  const scene: AudioScene = { ...BASE, speed: 250, boosting: true, surge: true, onStrip: true, scraping: true, critical: true, lapPhase: 3 };
  for (const [label, vol] of [['default volumes', undefined], ['all volumes at 1', [1, 1, 1]]] as Array<[string, [number, number, number] | undefined]>) {
    const cues: Cue[] = [{ t: 0, run: (a) => a.setMusic('race') }];
    for (let t = 3; t < 11; t += 0.4) cues.push({ t, run: (a) => loud.forEach((n) => a.play(n)) });
    // Then twice the voice limit in one frame.
    cues.push({ t: 11.5, run: (a) => { for (let k = 0; k < 2; k++) for (const n of SFX_NAMES) a.play(n, { pan: k ? 0.5 : -0.5 }); } });
    let most = 0;
    const { buf, warnings, audio } = await render(18, cues, () => scene, (_t, a) => {
      most = Math.max(most, a.debugInfo().voices);
    }, vol);
    if (warnings) fail(`the engine swallowed ${warnings} Web Audio error(s) in the worst-case render`);
    const calm = analyse(buf, 1, 3);
    const s = analyse(buf, 3, 18);
    const master = vol ? vol[0] : VOL.master;
    // How often the soft clipper had to work.
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(1);
    let bent = 0;
    const knee = MASTER.clipKnee * master;
    for (let i = 3 * SR; i < buf.length; i++) if (Math.abs(L[i]) > knee || Math.abs(R[i]) > knee) bent++;
    table('worst case (offline)').push({
      volumes: label,
      'music + engine only: peak': r3(calm.peak),
      'rms dBFS': db(calm.rms),
      'with bursts: peak': r3(s.peak),
      'burst rms dBFS': db(s.rms),
      'pre-limiter peak': r3(s.prePeak),
      'ceiling': r3(MASTER.clipCeiling * master),
      'samples in the clipper %': Math.round((bent / (buf.length - 3 * SR)) * 10000) / 100,
      'most voices': most,
      'voices at end': audio.debugInfo().voices,
    });
    if (s.peak >= CLIP) fail(`worst case clips with ${label} (peak ${s.peak.toFixed(3)})`);
    if (s.peak > MASTER.clipCeiling * master + 1e-3) fail(`output passed the limiter ceiling with ${label}`);
    if (most > MAX_VOICES) fail(`${most} voices alive in the worst case, limit is ${MAX_VOICES}`);
    if (audio.debugInfo().voices !== 0) fail('voices were not released after the worst case');
    if (!vol) await dump('worst-case', buf, 0, 18);
  }
}

/** A whole five-minute race, start lights to results screen, to catch anything that only shows up over time. */
async function offlineRace(): Promise<void> {
  log('--- offline: a five-minute race ---');
  const LAP = 96;
  const T_GO = 4;
  const T_FINISH = T_GO + LAP * 3;
  const T_RESULTS = T_FINISH + 5;
  const T_END = T_RESULTS + 5;
  // A cheap repeatable random source for the script of events.
  let seed = 12345;
  const rnd = (): number => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 4294967296;
  };
  const lapAt = (t: number): number => Math.max(1, Math.min(3, 1 + Math.floor((t - T_GO) / LAP)));
  const cues: Cue[] = [{ t: 0, run: (a) => a.setMusic('race') }];
  for (let n = 3; n >= 1; n--) cues.push({ t: T_GO - n, run: (a) => a.play('count_beep') });
  cues.push({ t: T_GO, run: (a) => a.play('count_go') }, { t: T_GO + 0.05, run: (a) => a.play('launch') });
  cues.push({ t: T_GO + LAP, run: (a) => a.play('lap_phase') }, { t: T_GO + LAP + 0.4, run: (a) => a.play('lap') });
  cues.push({ t: T_GO + LAP * 2, run: (a) => a.play('final_lap') }, { t: T_GO + LAP * 2 + 0.4, run: (a) => a.play('lap') });
  cues.push({ t: T_FINISH, run: (a) => a.play('finish') }, { t: T_FINISH + 2.2, run: (a) => a.play('win') }, { t: T_RESULTS, run: (a) => a.setMusic('menu') });
  // Gates are lit on the formation lap; the abilities they pay for are spent in the fights and the sprint.
  const calm: SfxName[] = ['dash', 'bump', 'boost', 'comms', 'command', 'wall', 'gate', 'gate', 'cells_full'];
  const fight: SfxName[] = ['lock', 'swing_light', 'swing_heavy', 'hit_light', 'hit_heavy', 'block', 'parry', 'shot_carbine', 'shot_carbine', 'shot_scatter', 'bullet_hit', 'bullet_hit', 'guard_break', 'dash', 'bump', 'wall', 'unlock', 'denied', 'ko', 'critical', 'snare_shot', 'snared', 'pulse', 'ram', 'aegis', 'breakaway'];
  const sprint: SfxName[] = ['dash', 'bump', 'boost', 'boost', 'comms', 'command', 'wall', 'overdrive', 'snare_shot', 'snared', 'ram'];
  let plays = 0;
  for (let t = T_GO + 1; t < T_FINISH; ) {
    const lap = lapAt(t);
    const pool = lap === 2 ? fight : lap === 3 ? sprint : calm;
    const name = pool[Math.floor(rnd() * pool.length)];
    const opts: SfxOptions = { volume: 0.3 + 0.7 * rnd(), pan: rnd() * 2 - 1 };
    // The gate chimes are played higher as charges are banked.
    if (name === 'gate' || name === 'cells_full') opts.pitch = 1 + 0.5 * rnd();
    cues.push({ t, run: (a) => a.play(name, opts) });
    plays++;
    t += (lap === 2 ? 0.16 : lap === 3 ? 0.6 : 1.5) * (0.3 + 1.4 * rnd());
  }
  const sceneAt = (t: number): AudioScene => {
    if (t < T_GO || t >= T_RESULTS) return { ...OFF, lapPhase: t < T_GO ? 1 : 3 };
    const lap = lapAt(t);
    const u = t - T_GO;
    // Four seconds of Overdrive now and then on the speed lap, a short boost every so often otherwise.
    const surge = lap === 3 && u % 43 > 39;
    const boosting = surge || (lap !== 2 && u % 23 < 2.5);
    const battle = lap === 2 && u % 17 < 9;
    // The limiters of the first two laps, then a forward's top speed.
    const cap = lap === 1 ? 110 : lap === 2 ? 125 : 160;
    return {
      racing: true,
      speed: (Math.min(cap, cap - 6 + 10 * Math.sin(u * 0.7)) * (surge ? 1.3 + 0.2 * Math.sin(u * 2) ** 2 : boosting ? 1.2 : 1) - (battle ? 25 : 0)) * Math.min(1, u / 4),
      throttle: battle ? 0.6 : 0.6 + 0.4 * Math.sin(u * 1.3) ** 2,
      boosting,
      surge,
      battle,
      lapPhase: lap,
      onStrip: u % 31 < 1.5,
      drafting: u % 13 > 9,
      scraping: u % 41 > 40.2,
      critical: lap === 3 && u > LAP * 2 + 60,
    };
  };
  let most = 0;
  let voiceSum = 0;
  let ticks = 0;
  const t0 = performance.now();
  const { buf, warnings, audio } = await render(T_END, cues, sceneAt, (_t, a) => {
    const v = a.debugInfo().voices;
    most = Math.max(most, v);
    voiceSum += v;
    ticks++;
  }, undefined, false);
  const took = (performance.now() - t0) / 1000;
  if (warnings) fail(`the engine swallowed ${warnings} Web Audio error(s) during the long race`);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const span = (name: string, a: number, b: number): void => {
    let peak = 0;
    let sum = 0;
    let bent = 0;
    const i0 = Math.floor(a * SR);
    const i1 = Math.min(buf.length, Math.floor(b * SR));
    const knee = MASTER.clipKnee * VOL.master;
    for (let i = i0; i < i1; i++) {
      const x = Math.abs(L[i]);
      const y = Math.abs(R[i]);
      if (x > peak) peak = x;
      if (y > peak) peak = y;
      if (x > knee || y > knee) bent++;
      sum += (x * x + y * y) / 2;
    }
    table('five-minute race (offline, default volumes)').push({ part: name, peak: r3(peak), 'rms dBFS': db(Math.sqrt(sum / Math.max(1, i1 - i0))), 'samples in the clipper %': Math.round((bent / Math.max(1, i1 - i0)) * 100000) / 1000 });
    if (peak >= CLIP) fail(`the long race clips during ${name} (peak ${peak.toFixed(3)})`);
  };
  span('countdown', 0, T_GO);
  span('lap 1, formation', T_GO, T_GO + LAP);
  span('lap 2, battle', T_GO + LAP, T_GO + LAP * 2);
  span('lap 3, speed', T_GO + LAP * 2, T_FINISH);
  span('finish and win jingle', T_FINISH, T_RESULTS);
  span('results (menu music)', T_RESULTS, T_END);
  const d = audio.debugInfo();
  table('five-minute race, engine load (offline)').push({
    'sounds played': plays,
    'most voices': most,
    'mean voices': r3(voiceSum / Math.max(1, ticks)),
    'voices at end': d.voices,
    'music at end': d.music ? d.music.name : 'none',
    'old tracks alive': d.fadingTracks,
    'rendered (s)': Math.round(T_END),
    'took (s)': r3(took),
    'times real time': Math.round(T_END / took),
  });
  if (most > MAX_VOICES) fail(`${most} voices alive in the long race, limit is ${MAX_VOICES}`);
  if (d.voices !== 0) fail('voices still alive at the end of the long race');
  if (d.fadingTracks !== 0 || d.music?.name !== 'menu') fail('music tracks were not handed over cleanly at the end of the long race');
  await dump('race-lap1-start', buf, 0, 40);
  await dump('race-lap2-start', buf, T_GO + LAP - 5, T_GO + LAP + 35);
  await dump('race-lap3-start', buf, T_GO + LAP * 2 - 5, T_GO + LAP * 2 + 35);
  await dump('race-finish', buf, T_FINISH - 10, T_END);
}

async function main(): Promise<void> {
  const parts: Array<[string, () => Promise<void>]> = [
    ['sfx', offlineSfx],
    ['layers', offlineLayers],
    ['speeds', offlineSpeeds],
    ['music', offlineMusic],
    ['song', offlineSong],
    ['styles', offlineStyles],
    ['stack', offlineStack],
    ['race', offlineRace],
    ['realtime', realtime],
  ];
  try {
    for (const [name, run] of parts) {
      if (ONLY ? ONLY.includes(name) : !(QUICK && name === 'realtime')) await run();
    }
  } catch (err) {
    fail(`audio check crashed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  }
  report.done = true;
  log(report.failures.length ? `${report.failures.length} failure(s)` : 'all checks passed');
}

void main();
