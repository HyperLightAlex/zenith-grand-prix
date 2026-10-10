// Small building blocks shared by the synthesiser: a seeded random source,
// pre-rendered noise and reverb buffers, and the maths for the master limiter.

/** Real-time in the game, offline in the audio check. */
export type Ctx = BaseAudioContext;

export const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** MIDI note number to frequency in hertz. */
export const mtof = (m: number): number => 440 * 2 ** ((m - 69) / 12);

/** Frames in one Web Audio render block. */
export const BLOCK = 128;

/**
 * Ask for a parameter to be worked out once per render block rather than for
 * every sample. For a filter cutoff that is the difference between a handful
 * of trig calls per block and a handful per sample, with nothing to hear for it.
 */
export function perBlock(p: AudioParam): void {
  try {
    p.automationRate = 'k-rate';
  } catch {
    /* not settable in this browser: stays per-sample, which only costs CPU */
  }
}

/**
 * A connection that is only made while something is sounding through it. The
 * browser renders by pulling from the output, so oscillators and filters
 * behind an unplugged Patch cost nothing at all. Unplugging is put off for
 * `tail` seconds after the last use, to let fades and echoes finish.
 */
export class Patch {
  private plugged = false;
  private unplugAt = -1;
  constructor(
    private readonly from: AudioNode,
    private readonly to: AudioNode,
  ) {}
  /** `now` only has to be a clock that keeps moving; `wanted` says whether the path is in use. */
  set(wanted: boolean, now: number, tail: number): void {
    if (wanted) {
      this.unplugAt = -1;
      if (!this.plugged) {
        this.from.connect(this.to);
        this.plugged = true;
      }
    } else if (this.plugged) {
      if (this.unplugAt < 0) this.unplugAt = now + tail;
      else if (now >= this.unplugAt) {
        this.from.disconnect(this.to);
        this.plugged = false;
        this.unplugAt = -1;
      }
    }
  }
}

/** Deterministic random numbers, so two runs of the audio check measure the same thing. */
export class Rng {
  private s: number;
  constructor(seed = 0x2f6e2b1) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next();
  }
}

/**
 * A stereo noise loop. The two channels are unrelated, which makes filtered
 * noise sound wide for free, and the ends are cross-faded so the loop point
 * cannot be heard.
 */
export function makeNoise(ctx: Ctx, seconds: number, pink: boolean, rng: Rng): AudioBuffer {
  const n = Math.max(4096, Math.floor(seconds * ctx.sampleRate));
  const fade = 2048;
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  const tmp = new Float32Array(n + fade);
  for (let ch = 0; ch < 2; ch++) {
    if (pink) {
      // Paul Kellet's pink filter, run in for a moment before the take starts.
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      let sum = 0;
      for (let i = -2048; i < tmp.length; i++) {
        const w = rng.next() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        const y = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
        b6 = w * 0.115926;
        if (i >= 0) {
          tmp[i] = y;
          sum += y * y;
        }
      }
      // Level it to a known loudness (RMS 0.2) and keep stray peaks in range.
      const k = 0.2 / Math.sqrt(sum / tmp.length);
      for (let i = 0; i < tmp.length; i++) tmp[i] = clamp(tmp[i] * k, -1, 1);
    } else {
      // Uniform white noise, RMS about 0.35.
      for (let i = 0; i < tmp.length; i++) tmp[i] = (rng.next() * 2 - 1) * 0.6;
    }
    const d = buf.getChannelData(ch);
    d.set(tmp.subarray(0, n));
    for (let i = 0; i < fade; i++) {
      const w = i / fade;
      d[i] = tmp[i] * Math.sqrt(w) + tmp[n + i] * Math.sqrt(1 - w);
    }
  }
  return buf;
}

/** Impulse response for the shared reverb: decaying noise that darkens as it fades. */
export function makeImpulse(ctx: Ctx, seconds: number, rng: Rng): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(seconds * sr);
  const pre = Math.floor(0.012 * sr);
  const buf = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / (n - pre);
      const c = 0.85 - 0.65 * t;
      lp += (rng.next() * 2 - 1 - lp) * c;
      // -60 dB by the end, with a short fade so the tail does not stop dead.
      d[i] = lp * Math.exp(-6.9 * t) * Math.min(1, (1 - t) * 12);
    }
  }
  return buf;
}

/**
 * Transfer curve for the safety clipper after the compressor. The shaper is
 * fed at half level so the curve covers inputs from -2 to 2: straight through
 * up to `knee`, then bending over so the output never passes `ceiling`.
 */
export function softClipCurve(knee: number, ceiling: number, points = 4097): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points);
  const span = ceiling - knee;
  for (let i = 0; i < points; i++) {
    const u = ((i / (points - 1)) * 2 - 1) * 2;
    const a = Math.abs(u);
    const y = a <= knee ? a : knee + span * Math.tanh((a - knee) / span);
    curve[i] = u < 0 ? -y : y;
  }
  return curve;
}

/**
 * What a DynamicsCompressorNode does to a steady full-scale signal, as a
 * linear gain, before its built-in make-up gain. Browsers share one
 * implementation of the static curve (it started in WebKit) and apply a
 * make-up gain of (1 / this) ** 0.6, so knowing this number lets the master
 * chain be set to exact unity below the threshold.
 */
export function compressorFullRangeGain(thresholdDb: number, kneeDb: number, ratio: number): number {
  const toLin = (db: number): number => 10 ** (db / 20);
  const toDb = (x: number): number => 20 * Math.log10(x);
  const linT = toLin(thresholdDb);
  const kneeCurve = (x: number, k: number): number => (x < linT ? x : linT + (1 - Math.exp(-k * (x - linT))) / k);
  const slopeAt = (x: number, k: number): number => {
    if (x < linT) return 1;
    const x2 = x * 1.001;
    return (toDb(kneeCurve(x2, k)) - toDb(kneeCurve(x, k))) / (toDb(x2) - toDb(x));
  };
  const kneeEndDb = thresholdDb + kneeDb;
  const kneeEnd = toLin(kneeEndDb);
  let lo = 0.1;
  let hi = 10000;
  let k = 5;
  for (let i = 0; i < 15; i++) {
    if (slopeAt(kneeEnd, k) < 1 / ratio) hi = k;
    else lo = k;
    k = Math.sqrt(lo * hi);
  }
  if (1 < kneeEnd) return kneeCurve(1, k);
  return toLin(toDb(kneeCurve(kneeEnd, k)) + (0 - kneeEndDb) / ratio);
}
