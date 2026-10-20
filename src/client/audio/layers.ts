// The continuous sounds of a mech at speed: turbine, wind, afterburner, charge
// strip, slipstream, barrier scrape and the low-armour alarm. Every node is
// made once. Each frame only moves AudioParams; the one exception is that a
// layer is unplugged from the mix a moment after it falls silent and plugged
// back in when it is next needed, because an unplugged layer costs no CPU.

import type { AudioScene } from './audio';
import type { Ctx } from './dsp';
import { PACE } from '../../sim/config';
import { clamp, Patch, perBlock } from './dsp';

/** Mix levels. The audio check prints what each layer measures at the output. */
const LEVEL = {
  engine: 0.19,
  whine: 0.032,
  wind: 0.27,
  road: 0.155,
  draft: 1,
  boostNoise: 0.8,
  strip: 0.12,
  scrape: 1.6,
  carveHiss: 0.5,
  carveHum: 0.05,
  alarm: 0.08,
};

/** The carve's hum for each tier: a root, then its fifth, octave and the fifth above. */
const CARVE_HUM_HZ = [220, 330, 440, 660];
/** ...and its shimmer, faster with each tier. */
const CARVE_SHIMMER_HZ = [5, 8, 11, 15];

/**
 * The player's own mix of the continuous layers, 0..1 each (the tuning
 * panel's Sound tab). Multiplies the levels above.
 */
export interface LayerMix {
  engine: number;
  wind: number;
  afterburner: number;
  strip: number;
  slipstream: number;
  scrape: number;
  alarm: number;
}

export const DEFAULT_LAYER_MIX: Readonly<LayerMix> = Object.freeze({ engine: 1, wind: 1, afterburner: 1, strip: 1, slipstream: 1, scrape: 1, alarm: 1 });

/** Beeps the low-armour alarm gives when armour first goes critical. It does not keep going. */
const ALARM_BEEPS = 3;

/**
 * Speed at the formation lap's limiter; the scene's speed is divided by this.
 * On that scale the battle lap's limiter is 1.14, a defender flat out on the
 * speed lap 1.32 and a forward 1.45. A boost takes a forward to 1.75, an
 * Overdrive to 1.9, and one with a tow and a shove behind it to 2.3 for a moment.
 */
const LIMIT_SPEED = PACE;

/** Fastest speed the layers follow, in units per second. Anything beyond sounds the same. */
const MAX_SPEED = 260;

/**
 * A forward's top speed on the speed lap, on that scale: the most any mech
 * holds for long. Up to here every layer follows speed directly. Beyond it
 * lie boost and Overdrive, and there each extra unit of speed counts for less
 * than the one before, adding no more than EASE in all, so the top end still
 * climbs but nothing runs away into a shriek.
 */
const TOP = 1.45;
const EASE = 0.6;

/**
 * Turbine pitch at rest, in hertz. Chosen so that flat out at the formation
 * lap's limiter the fundamental sits on A2 (110 Hz) and the two whine partials
 * on E5 and B5: in tune with the race music's A minor rather than a semitone
 * off its bass. From there the same law puts the battle lap's limiter a whole
 * tone up, close to B2, a defender flat out on the speed lap on D3 and a
 * forward on E3, all notes that A minor shares with the speed lap's B minor,
 * and brings a forward in Overdrive to rest an octave up, on A3. The audio
 * check's speed sweep prints the pitch at each of these.
 */
const IDLE_HZ = 43.2;

/** How long a layer stays plugged in after it is asked to stop, so its fade can finish. */
const TAIL = 1.5;

/** An AudioParam that glides to its target and ignores changes too small to hear. */
class Glide {
  private last: number;
  constructor(
    private readonly p: AudioParam,
    private readonly tau: number,
    initial: number,
  ) {
    p.value = initial;
    this.last = initial;
  }
  to(v: number, now: number, tau = this.tau): void {
    const d = Math.abs(v - this.last);
    if (d <= 0.002 * Math.max(Math.abs(v), Math.abs(this.last)) || d < 1e-5) return;
    this.last = v;
    this.p.setTargetAtTime(v, now, tau);
  }
}

export class EngineLayers {
  /** Each layer's own output, so the audio check can measure them one by one. */
  readonly taps: Record<string, AudioNode>;

  private readonly srcs: AudioScheduledSourceNode[] = [];
  /** Everything passes through this gain, which closes when no race is on screen. */
  private readonly out: GainNode;
  private readonly gate: Glide;
  private readonly all: Patch;
  private readonly f0: Glide[];
  private readonly ratios: number[];
  private readonly engCut: Glide;
  private readonly engGain: Glide;
  private readonly whineGain: Glide;
  private readonly windCut: Glide;
  private readonly windGain: Glide;
  private readonly roadGain: Glide;
  private readonly draftGain: Glide;
  private readonly draftPatch: Patch;
  private readonly boostCut: Glide;
  private readonly boostNoise: Glide;
  private readonly boostPatch: Patch;
  private readonly stripFreq: Glide[];
  private readonly stripGain: Glide;
  private readonly stripPatch: Patch;
  private readonly scrapeGain: Glide;
  private readonly scrapePatch: Patch;
  private readonly carvePatch: Patch;
  private readonly carveHiss: Glide;
  private readonly carveHissCut: Glide;
  private readonly carveHum: Glide;
  private readonly carveHumF: Glide[];
  private readonly carveShimmer: Glide;
  private readonly alarmGain: AudioParam;
  private readonly alarmPatch: Patch;

  private boostT = 0;
  private stripT = 0;
  private alarmOn = false;
  private alarmNext = 0;
  private alarmLeft = 0;
  private mix: LayerMix = { ...DEFAULT_LAYER_MIX };

  constructor(
    private readonly ctx: Ctx,
    white: AudioBuffer,
    pink: AudioBuffer,
    dest: AudioNode,
  ) {
    const out = (this.out = ctx.createGain());
    this.gate = new Glide(out.gain, 0.12, 0);
    this.all = new Patch(out, dest);

    // --- turbine: two detuned saws and a sub through a lowpass, plus two
    // sine partials well up the series for the whine.
    const engLp = this.filter('lowpass', 200, 1.1);
    this.engCut = new Glide(engLp.frequency, 0.1, 200);
    const engG = this.gain(0, out);
    this.engGain = new Glide(engG.gain, 0.12, 0);
    engLp.connect(engG);
    const whineG = this.gain(0, out);
    this.whineGain = new Glide(whineG.gain, 0.15, 0);

    const parts: Array<[OscillatorType, number, number, number, AudioNode]> = [
      // wave, frequency ratio, level, pan, destination
      // Unequal levels, so the slow beating between the saws never cancels
      // completely; the louder one sits nearer the middle to keep the sides even.
      ['sawtooth', 1, 0.56, -0.2, engLp],
      ['sawtooth', 1.007, 0.38, 0.5, engLp],
      ['sine', 0.5, 0.22, 0, engLp],
      ['sine', 6, 1, -0.2, whineG],
      ['sine', 9.03, 0.55, 0.2, whineG],
    ];
    this.f0 = [];
    this.ratios = [];
    for (const [wave, ratio, level, pan, to] of parts) {
      const o = this.osc(wave, IDLE_HZ * ratio);
      o.connect(this.gain(level, this.pan(pan, to)));
      this.f0.push(new Glide(o.frequency, 0.09, IDLE_HZ * ratio));
      this.ratios.push(ratio);
    }

    // --- air and road: one pink loop feeding three filters.
    const air = this.loop(pink);
    const windHp = this.filter('highpass', 160, 0.7);
    const windLp = this.filter('lowpass', 300, 0.6);
    this.windCut = new Glide(windLp.frequency, 0.15, 300);
    const windG = this.gain(0, out);
    this.windGain = new Glide(windG.gain, 0.15, 0);
    air.connect(windHp);
    windHp.connect(windLp);
    windLp.connect(windG);

    const roadLp = this.filter('lowpass', 210, 0.7);
    const roadG = this.gain(0, out);
    this.roadGain = new Glide(roadG.gain, 0.2, 0);
    air.connect(roadLp);
    roadLp.connect(roadG);

    // Slipstream: a narrow, slowly wandering band, like wind across a pipe.
    const draftBp = this.filter('bandpass', 390, 4.5);
    this.osc('sine', 0.7).connect(this.gain(70, draftBp.frequency));
    const draftG = this.gain(0, null);
    this.draftGain = new Glide(draftG.gain, 0.2, 0);
    this.draftPatch = new Patch(draftG, out);
    air.connect(draftBp);
    draftBp.connect(draftG);

    // --- afterburner: a low, fluttering band of white noise. (Version 0.2 had
    // a sawtooth tone that climbed for as long as the boost burned; players
    // found it shrill and it was taken out.)
    const hiss = this.loop(white);
    const boostOut = this.gain(1, null);
    this.boostPatch = new Patch(boostOut, out);
    const boostBp = this.filter('bandpass', 320, 0.9);
    this.boostCut = new Glide(boostBp.frequency, 0.1, 320);
    const boostNG = this.gain(0, boostOut);
    this.boostNoise = new Glide(boostNG.gain, 0.04, 0);
    // A fast flutter on the noise sets it apart from plain wind.
    const flutter = this.gain(0.7, boostNG);
    this.osc('triangle', 34).connect(this.gain(0.3, flutter.gain));
    hiss.connect(boostBp);
    boostBp.connect(flutter);

    // --- charge strip: two partials with a fast tremolo, pitch rising while you ride it.
    const trem = this.gain(0.65, null);
    this.osc('triangle', 12).connect(this.gain(0.35, trem.gain));
    const stripG = this.gain(0, null);
    this.stripGain = new Glide(stripG.gain, 0.06, 0);
    this.stripPatch = new Patch(stripG, out);
    trem.connect(stripG);
    const s1 = this.osc('triangle', 587);
    const s2 = this.osc('sine', 587 * 2.007);
    s1.connect(this.gain(1, this.pan(-0.4, trem)));
    s2.connect(this.gain(0.5, this.pan(0.4, trem)));
    this.stripFreq = [new Glide(s1.frequency, 0.08, 587), new Glide(s2.frequency, 0.08, 587 * 2.007)];

    // --- barrier scrape: two bands of white noise chopped at a rough rate.
    const rough = this.gain(0.55, null);
    this.osc('sawtooth', 53).connect(this.gain(0.45, rough.gain));
    const scrapeG = this.gain(0, null);
    this.scrapeGain = new Glide(scrapeG.gain, 0.04, 0);
    this.scrapePatch = new Patch(scrapeG, out);
    rough.connect(scrapeG);
    for (const [f, q, g] of [[2100, 2.5, 1], [760, 3, 0.8]]) {
      const bp = this.filter('bandpass', f, q);
      hiss.connect(bp);
      bp.connect(this.gain(g, rough));
    }

    // --- carving: the skates' edges hissing on the road, and under it a soft
    // hum that steps up a fifth or a fourth with each tier of charge, its
    // shimmer quickening. Kept low and round: the afterburner's old climbing
    // tone was taken out for being shrill.
    const carveOut = this.gain(1, null);
    this.carvePatch = new Patch(carveOut, out);
    const edgeBp = this.filter('bandpass', 3800, 1.6);
    this.carveHissCut = new Glide(edgeBp.frequency, 0.1, 3800);
    const edgeG = this.gain(0, carveOut);
    this.carveHiss = new Glide(edgeG.gain, 0.05, 0);
    hiss.connect(edgeBp);
    edgeBp.connect(edgeG);
    const humLp = this.filter('lowpass', 1400, 0.7);
    const shimmer = this.gain(0.75, null);
    const shimOsc = this.osc('sine', CARVE_SHIMMER_HZ[0]);
    shimOsc.connect(this.gain(0.25, shimmer.gain));
    this.carveShimmer = new Glide(shimOsc.frequency, 0.08, CARVE_SHIMMER_HZ[0]);
    const humG = this.gain(0, carveOut);
    this.carveHum = new Glide(humG.gain, 0.08, 0);
    humLp.connect(shimmer);
    shimmer.connect(humG);
    const h1 = this.osc('triangle', CARVE_HUM_HZ[0]);
    const h2 = this.osc('sine', CARVE_HUM_HZ[0] * 2.003);
    h1.connect(this.gain(1, this.pan(-0.25, humLp)));
    h2.connect(this.gain(0.35, this.pan(0.25, humLp)));
    this.carveHumF = [new Glide(h1.frequency, 0.05, CARVE_HUM_HZ[0]), new Glide(h2.frequency, 0.05, CARVE_HUM_HZ[0] * 2.003)];

    // --- low-armour alarm: a soft beep, scheduled ahead like the music.
    const alarmG = this.gain(0, null);
    this.alarmGain = alarmG.gain;
    this.alarmPatch = new Patch(alarmG, out);
    this.osc('sine', 659.3).connect(alarmG);
    this.osc('sine', 1318.5).connect(this.gain(0.25, alarmG));

    this.taps = { engine: engG, whine: whineG, wind: windG, road: roadG, draft: draftG, boostNoise: boostNG, strip: stripG, scrape: scrapeG, carveHiss: edgeG, carveHum: humG, alarm: alarmG };
  }

  /** The player's mix of the layers. Values are 0..1; anything else is ignored. */
  setMix(mix: Partial<LayerMix>): void {
    for (const k of Object.keys(DEFAULT_LAYER_MIX) as Array<keyof LayerMix>) {
      const v = mix[k];
      if (typeof v === 'number' && Number.isFinite(v)) this.mix[k] = clamp(v, 0, 1);
    }
  }

  /** Pitches here only ever glide, so one value per render block is plenty. */
  private osc(type: OscillatorType, freq: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    perBlock(o.frequency);
    o.start();
    this.srcs.push(o);
    return o;
  }

  private loop(buf: AudioBuffer): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.start();
    this.srcs.push(s);
    return s;
  }

  private filter(type: BiquadFilterType, freq: number, q: number): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    perBlock(f.frequency);
    return f;
  }

  private gain(value: number, dest: AudioNode | AudioParam | null): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    if (dest instanceof AudioParam) g.connect(dest);
    else if (dest) g.connect(dest);
    return g;
  }

  /** A node that pans whatever is connected to it on its way to `dest`. */
  private pan(p: number, dest: AudioNode): AudioNode {
    if (p === 0 || typeof this.ctx.createStereoPanner !== 'function') return dest;
    const n = this.ctx.createStereoPanner();
    n.pan.value = p;
    n.connect(dest);
    return n;
  }

  /** `ahead` is how far past `now` timed events (the alarm beeps) should be queued. */
  update(now: number, dt: number, s: AudioScene, ahead: number): void {
    // On the grid the engine runs on the revs (and only the engine: nothing moves).
    const rev = s.rev !== undefined && Number.isFinite(s.rev) ? clamp(s.rev, 0, 1) : -1;
    const grid = rev >= 0;
    const on = s.racing || grid;
    const x = clamp(Number.isFinite(s.speed) ? s.speed : 0, 0, MAX_SPEED) / LIMIT_SPEED;
    const x1 = Math.min(1, x);
    // Speed as the layers hear it: the real thing up to TOP, easing off above (see TOP).
    const xs = x <= TOP ? x : TOP + EASE * (1 - Math.exp(-(x - TOP) / EASE));
    const thr = clamp(Number.isFinite(s.throttle) ? s.throttle : 0, 0, 1);

    this.all.set(on, now, TAIL);
    this.gate.to(on ? 1 : 0, now, on ? 0.1 : 0.22);

    const surge = on && s.surge === true;
    const burn = on && (s.boosting || surge);
    this.boostT = burn ? this.boostT + dt : Math.max(0, this.boostT - dt * 3);
    this.stripT = s.onStrip && on ? this.stripT + dt : Math.max(0, this.stripT - dt * 2);

    // Turbine. Pitch climbs an octave and a bit from rest to the limiter and
    // a fifth more to a forward's top speed, then eases off under boost and
    // Overdrive; the filter opens with speed and throttle. Below the limiter
    // the level follows throttle more than speed. Above it the turbine goes
    // on getting louder, the body by half the extra speed and the whine by
    // all of it, or the wind would bury them both.
    // Locked on and fighting, it is turned down and darkened.
    // (On the grid: the revs as the speed, a full gauge a little past the
    // formation lap's limiter; past the redline it bounces off the limiter.)
    const xe = grid ? rev * 1.15 : xs;
    const xe1 = grid ? Math.min(1, rev * 1.15) : x1;
    const limiter = grid && rev > 0.97 && Math.sin(now * 56) > 0 ? 0.92 : 1;
    const f0 = IDLE_HZ * 2 ** (1.3 * xe) * (1 + 0.035 * thr) * limiter;
    for (let i = 0; i < this.f0.length; i++) this.f0[i].to(f0 * this.ratios[i], now);
    const over = Math.max(0, xe - 1);
    this.engCut.to((170 + 950 * xe ** 1.2 * (0.5 + 0.5 * thr)) * (s.battle ? 0.6 : 1), now);
    const mix = this.mix;
    this.engGain.to(on ? LEVEL.engine * mix.engine * (0.45 + 0.35 * thr + 0.2 * xe1) * (1 + 0.5 * over) * (s.battle ? 0.68 : 1) * (limiter < 1 ? 0.8 : 1) : 0, now);
    // The whine only grows a little past the formation lap's limiter: at the
    // speeds of laps 2 and 3 it was getting shrill.
    this.whineGain.to(on ? LEVEL.whine * mix.engine * xe1 ** 1.5 * (1 + 0.2 * over) * (0.5 + 0.5 * thr) * (s.battle ? 0.5 : 1) : 0, now);

    // Air and road. In a slipstream the broad rush drops and a hollow band takes over.
    const draft = on && s.drafting;
    this.windCut.to((300 + 1700 * xs) * (draft ? 0.7 : 1), now);
    this.windGain.to(on ? LEVEL.wind * mix.wind * xs ** 1.8 * (draft ? 0.6 : 1) : 0, now);
    this.roadGain.to(on ? LEVEL.road * mix.wind * xs : 0, now);
    this.draftPatch.set(draft, now, TAIL);
    this.draftGain.to(draft ? LEVEL.draft * mix.slipstream * xs ** 1.2 : 0, now);

    // Afterburner: a low roar that opens a little as it burns. An Overdrive is
    // a touch fuller than a boost, but no higher.
    this.boostPatch.set(burn, now, TAIL);
    this.boostCut.to(320 + (surge ? 480 : 360) * Math.min(1, this.boostT / 1.2), now);
    this.boostNoise.to(burn ? LEVEL.boostNoise * mix.afterburner * (surge ? 1.15 : 1) : 0, now, burn ? 0.06 : 0.25);

    // Charge strip.
    const strip = on && s.onStrip;
    this.stripPatch.set(strip, now, TAIL);
    const sf = 587 * (1 + 0.7 * (1 - Math.exp(-this.stripT)));
    this.stripFreq[0].to(sf, now);
    this.stripFreq[1].to(sf * 2.007, now);
    this.stripGain.to(strip ? LEVEL.strip * mix.strip : 0, now, strip ? 0.06 : 0.18);

    // Scrape.
    const scrape = on && s.scraping;
    this.scrapePatch.set(scrape, now, TAIL);
    this.scrapeGain.to(scrape ? LEVEL.scrape * mix.scrape * (0.5 + 0.5 * x1) : 0, now, scrape ? 0.03 : 0.08);

    // Carving. The hiss follows how tight the carve is held; the hum's pitch
    // and shimmer step with the tier.
    const carveAmt = on && !s.battle ? clamp(Number.isFinite(s.carve) ? (s.carve as number) : 0, 0, 1) : 0;
    const tier = clamp(Math.round(Number.isFinite(s.carveTier) ? (s.carveTier as number) : 0), 0, 3);
    const carving = carveAmt > 0;
    this.carvePatch.set(carving, now, TAIL);
    this.carveHissCut.to(3000 + 2200 * carveAmt + 400 * tier, now);
    this.carveHiss.to(carving ? LEVEL.carveHiss * mix.scrape * (0.35 + 0.65 * carveAmt) * (0.4 + 0.6 * x1) : 0, now, carving ? 0.04 : 0.1);
    this.carveHumF[0].to(CARVE_HUM_HZ[tier], now);
    this.carveHumF[1].to(CARVE_HUM_HZ[tier] * 2.003, now);
    this.carveShimmer.to(CARVE_SHIMMER_HZ[tier], now);
    this.carveHum.to(carving ? LEVEL.carveHum * mix.strip * (0.5 + 0.5 * (tier / 3)) : 0, now, carving ? 0.06 : 0.12);

    // Alarm: a few soft beeps when armour first goes critical, queued ahead of
    // the clock like the music, and then quiet. (It used to beep twice a
    // second for the rest of the race.)
    const alarm = on && s.critical;
    this.alarmPatch.set(alarm, now, TAIL);
    if (alarm) {
      if (!this.alarmOn) {
        this.alarmNext = now + 0.03;
        this.alarmLeft = ALARM_BEEPS;
      }
      while (this.alarmLeft > 0 && this.alarmNext < now + ahead) {
        const t = Math.max(this.alarmNext, now);
        this.alarmGain.setTargetAtTime(LEVEL.alarm * mix.alarm, t, 0.008);
        this.alarmGain.setTargetAtTime(0, t + 0.1, 0.03);
        this.alarmNext = t + 0.5;
        this.alarmLeft--;
      }
    } else if (this.alarmOn) {
      this.alarmGain.cancelScheduledValues(now);
      this.alarmGain.setTargetAtTime(0, now, 0.03);
    }
    this.alarmOn = alarm;
  }
}
