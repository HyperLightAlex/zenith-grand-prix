// The synthesiser behind the AudioEngine interface. Everything is generated at
// run time with the Web Audio API: no samples, no worklets.
//
//   music.ts   tracks ─► musicIn (ducking) ─► musicBus ─┐
//   song.ts    (or a recorded song, with ?music=suno)    │
//   sfx.ts     voices ─► [pan] ───────────► sfxBus ────┤
//   layers.ts  engine, wind, alarm ───────► engineBus ─┼─► mix ─► compressor ─► soft clip ─► master ─► out
//   reverb sends (music, sfx) ─► convolver ─► return ──┘
//
// Nothing here touches Web Audio until unlock() is called from a user gesture.
//
// Levels were set by measurement, not by ear: `node tools/audio-check.mjs`
// renders every sound, layer and music state and prints its peak, loudness and
// spectrum (add --dump <dir> to get WAV files to listen to).

import type { AudioEngine, AudioScene, SfxName, SfxOptions } from './audio';
import type { Ctx } from './dsp';
import { clamp, compressorFullRangeGain, makeImpulse, makeNoise, Rng, softClipCurve } from './dsp';
import { EngineLayers, type LayerMix } from './layers';
import type { MusicTrack, TrackInfo, TrackName } from './music';
import { createTrack, RACE_STYLES } from './music';
import { SongSource, SongTrack } from './song';
import type { Voice } from './sfx';
import { buildSfx, SFX_META } from './sfx';

/**
 * Master limiter. Below the threshold the chain is exactly unity, so a level
 * of 1 anywhere upstream means full scale at the output. Above it the
 * compressor leans in, and a steady signal can climb no higher than `ceiling`.
 * Fast transients that slip past the compressor's attack meet a soft clipper
 * that starts at `clipKnee` and can never exceed `clipCeiling`.
 */
export const MASTER = {
  threshold: -18,
  knee: 10,
  ratio: 6,
  attack: 0.003,
  release: 0.14,
  ceiling: 0.84,
  clipKnee: 0.85,
  clipCeiling: 0.95,
} as const;

/** Seconds a circuit has to stay named (prepareMusic) before its song is decoded. */
const PREPARE_AFTER = 1;

/** How far ahead of the audio clock music is queued, before allowing for the frame rate. */
const LOOKAHEAD = 0.2;

/** Most one-shot sounds that may play at once. */
export const MAX_VOICES = 16;

const REVERB_SECONDS = 1.3;
const REVERB_RETURN = 2;

/** Overall trim on the music so that, at the default volumes, it sits under the effects. */
export const MUSIC_TRIM = 0.8;

interface Playing {
  voice: Voice;
  level: number;
  prio: number;
  /** Everything to disconnect once the sound has finished. */
  nodes: AudioNode[];
}

interface Graph {
  ctx: Ctx;
  /** The same context when it is a real-time one; null when rendering offline in the audio check. */
  live: AudioContext | null;
  rng: Rng;
  white: AudioBuffer;
  pink: AudioBuffer;
  master: GainNode;
  mix: GainNode;
  musicBus: GainNode;
  musicSend: GainNode;
  musicIn: GainNode;
  musicWetIn: GainNode;
  sfxBus: GainNode;
  sfxSend: GainNode;
  engineBus: GainNode;
  layers: EngineLayers;
}

export interface AudioDebugInfo {
  state: string;
  time: number;
  voices: number;
  music: TrackInfo | null;
  fadingTracks: number;
}

const finite = (v: number | undefined, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export class SynthAudio implements AudioEngine {
  private g: Graph | null = null;
  private dead = false;
  private warned = false;
  private readonly vol = { master: 0.8, music: 0.45, sfx: 0.9 };

  private voices: Playing[] = [];
  private fading: Playing[] = [];
  private readonly lastPlay = new Map<SfxName, number>();

  private want: TrackName | null = null;
  /** Which circuit's race music, when `want` is 'race'. */
  private wantStyle = 'meridian';
  private track: MusicTrack | null = null;
  private dying: Array<{ track: MusicTrack; at: number }> = [];
  private lapPhase = 1;
  private finished = false;
  /** Recorded songs by circuit, when there are any (see song.ts). */
  private readonly songs = new Map<string, SongSource>();
  /** The circuit prepareMusic named, to decode its song (after PREPARE_AFTER, and once there is a context). */
  private nextSong: string | null = null;
  private prepareTimer: ReturnType<typeof setTimeout> | null = null;
  private lastUpdate = -1;
  /** Recent worst-case time between update() calls, in seconds of audio clock. */
  private frameGap = 0;
  private duckUntil = 0;
  private duckLevel = 1;

  /**
   * `songs`: recorded race music, by circuit (style), as the folder each one's
   * files are in. Their download starts now; each is decoded when a race on
   * its circuit starts (one at a time: see prepareSong), and a circuit with
   * one plays it instead of its synthesised music.
   */
  constructor(opts: { songs?: Record<string, string> } = {}) {
    for (const [style, base] of Object.entries(opts.songs ?? {})) this.songs.set(style, new SongSource(base));
  }

  // ---- AudioEngine ----------------------------------------------------------

  unlock(): void {
    this.guard(() => {
      if (!this.g && !this.dead) {
        if (typeof window === 'undefined') return;
        const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
        const AC = w.AudioContext ?? w.webkitAudioContext;
        if (!AC) {
          this.dead = true;
          return;
        }
        const ctx = new AC({ latencyHint: 'interactive' });
        try {
          this.boot(ctx, ctx);
        } catch (err) {
          this.dead = true;
          void ctx.close().catch(() => {});
          throw err;
        }
        // The game only reports its first gesture, so listen for later ones
        // too: a phone can suspend the context whenever it likes.
        document.addEventListener('visibilitychange', this.onVisibility);
        window.addEventListener('pointerdown', this.wake, { passive: true });
        window.addEventListener('keydown', this.wake, { passive: true });
      }
      this.wake();
    });
  }

  setVolumes(master: number, music: number, sfx: number): void {
    this.guard(() => {
      this.vol.master = clamp(finite(master, this.vol.master), 0, 1);
      this.vol.music = clamp(finite(music, this.vol.music), 0, 1);
      this.vol.sfx = clamp(finite(sfx, this.vol.sfx), 0, 1);
      const g = this.g;
      if (!g) return;
      const now = g.ctx.currentTime;
      g.master.gain.setTargetAtTime(this.vol.master, now, 0.03);
      g.musicBus.gain.setTargetAtTime(this.vol.music, now, 0.03);
      g.musicSend.gain.setTargetAtTime(this.vol.music, now, 0.03);
      g.sfxBus.gain.setTargetAtTime(this.vol.sfx, now, 0.03);
      g.sfxSend.gain.setTargetAtTime(this.vol.sfx, now, 0.03);
      g.engineBus.gain.setTargetAtTime(this.vol.sfx, now, 0.03);
    });
  }

  /** Kept until the audio graph exists, then handed on. */
  private layerMix: Partial<LayerMix> = {};

  setLayerMix(mix: Partial<LayerMix>): void {
    this.guard(() => {
      this.layerMix = { ...this.layerMix, ...mix };
      this.g?.layers.setMix(this.layerMix);
    });
  }

  update(dt: number, scene: AudioScene): void {
    const g = this.g;
    if (!g) return;
    // Called every frame, so no closure here: just set parameters and run the sequencer.
    try {
      const now = g.ctx.currentTime;
      // Notes are queued a little ahead of the audio clock: a quarter of a
      // second when frames come quickly, more when they have been coming
      // slowly, so a low frame rate does not punch holes in the music.
      const gap = this.lastUpdate < 0 ? 0 : now - this.lastUpdate;
      this.lastUpdate = now;
      if (gap > 0) this.frameGap = Math.max(Math.min(gap, 0.5), this.frameGap * 0.97);
      const ahead = LOOKAHEAD + 2 * this.frameGap;
      this.lapPhase = finite(scene.lapPhase, 1);
      this.finished = scene.finished === true;
      g.layers.update(now, clamp(finite(dt, 0), 0, 0.25), scene, ahead);
      if (this.track) {
        this.track.schedule(now, this.lapPhase, ahead, this.finished);
        if (this.track.broken) {
          // A song that could not be loaded: the synthesised music instead.
          this.track.dispose();
          this.track = null;
          this.applyMusic();
        } else if (this.track.done && this.want === 'race') {
          this.afterSong(now, ahead);
        }
      }
      if (this.voices.length || this.fading.length || this.dying.length) this.sweep(now);
    } catch (err) {
      this.report(err);
    }
  }

  play(name: SfxName, opts?: SfxOptions): void {
    this.guard(() => {
      const g = this.g;
      if (!g) return;
      this.wake();
      const meta = SFX_META[name];
      if (!meta) return;
      const volume = clamp(finite(opts?.volume, 1), 0, 1);
      if (volume < 0.004) return;
      const now = g.ctx.currentTime;
      this.sweep(now);
      // While the context is suspended its clock stands still, and whatever is
      // queued would all go off together on resume. Keep that to a few sounds.
      if (g.live && g.live.state !== 'running' && this.voices.length >= 4) return;
      const last = this.lastPlay.get(name);
      if (last !== undefined && now - last < meta.gap && now >= last) return;
      const level = volume * meta.level;
      if (this.voices.length >= MAX_VOICES && !this.makeRoom(level, meta.prio, now)) return;
      this.lastPlay.set(name, now);

      const spread = meta.vary > 0 ? 1 + (g.rng.next() * 2 - 1) * meta.vary : 1;
      const pitch = clamp(finite(opts?.pitch, 1), 0.5, 2) * spread;
      const voice = buildSfx(g, name, now + 0.004, pitch);
      voice.out.gain.value = level;
      const nodes: AudioNode[] = [voice.out];
      let tail: AudioNode = voice.out;
      const pan = clamp(finite(opts?.pan, 0), -1, 1);
      if (pan !== 0 && typeof g.ctx.createStereoPanner === 'function') {
        const p = g.ctx.createStereoPanner();
        p.pan.value = pan;
        tail.connect(p);
        tail = p;
        nodes.push(p);
      }
      tail.connect(g.sfxBus);
      if (meta.send > 0) {
        const send = g.ctx.createGain();
        send.gain.value = meta.send;
        tail.connect(send);
        send.connect(g.sfxSend);
        nodes.push(send);
      }
      this.voices.push({ voice, level, prio: meta.prio, nodes });
      if (meta.duck) this.duck(meta.duck[0] * Math.min(1, volume * 1.5), meta.duck[1], now);
    });
  }

  setMusic(track: 'menu' | 'race' | null, style = 'meridian'): void {
    this.guard(() => {
      this.want = track === 'menu' || track === 'race' ? track : null;
      this.wantStyle = style;
      this.applyMusic(true);
    });
  }

  prepareMusic(style: string): void {
    this.guard(() => {
      // Once it has been settled on for a moment: flicking through the
      // circuits on a menu should not start decoding each one.
      if (this.prepareTimer !== null) {
        if (this.nextSong === style) return;
        clearTimeout(this.prepareTimer);
      }
      this.nextSong = style;
      this.prepareTimer = setTimeout(() => {
        this.prepareTimer = null;
        this.guard(() => {
          if (this.nextSong) this.prepareSong(this.nextSong);
        });
      }, PREPARE_AFTER * 1000);
    });
  }

  stingerKey(): Partial<Record<SfxName, number>> | null {
    return this.track instanceof SongTrack ? (this.track.stingers as Partial<Record<SfxName, number>> | null) : null;
  }

  // ---- hooks for tools/audio-check ------------------------------------------

  /** The last node before the speakers. Tap an AnalyserNode here to measure. */
  get output(): AudioNode | null {
    return this.g ? this.g.master : null;
  }

  /** The mix before the limiter, at the same scale as the output. */
  get preLimiter(): AudioNode | null {
    return this.g ? this.g.mix : null;
  }

  get context(): BaseAudioContext | null {
    return this.g ? this.g.ctx : null;
  }

  /**
   * Build the graph in a context supplied by the caller instead of opening
   * one in unlock(). The audio check uses this to render offline, faster than
   * real time and sample-exact.
   */
  debugAttach(ctx: BaseAudioContext): void {
    if (this.g || this.dead) return;
    this.boot(ctx, null);
  }

  /**
   * Individual layers and music parts, before their bus: "layer.wind",
   * "music.kick" and so on. Multiply by the bus and master volumes to compare
   * with the output.
   */
  debugTaps(): Record<string, AudioNode> {
    const taps: Record<string, AudioNode> = {};
    const g = this.g;
    if (!g) return taps;
    for (const [k, n] of Object.entries(g.layers.taps)) taps[`layer.${k}`] = n;
    if (this.track) for (const [k, n] of Object.entries(this.track.taps)) taps[`music.${k}`] = n;
    return taps;
  }

  /** The recorded songs, by circuit, for the audio check. */
  debugSongs(): ReadonlyMap<string, SongSource> {
    return this.songs;
  }

  /** Decodes every recorded song now (after debugAttach), and resolves once each is ready or has failed. */
  async debugSongsLoaded(): Promise<void> {
    const g = this.g;
    if (g) for (const s of this.songs.values()) s.decode(g.ctx);
    while ([...this.songs.values()].some((s) => s.state === 'loading')) await new Promise((r) => setTimeout(r, 50));
  }

  debugInfo(): AudioDebugInfo {
    const g = this.g;
    return {
      state: g ? g.ctx.state : this.dead ? 'dead' : 'locked',
      time: g ? g.ctx.currentTime : 0,
      voices: this.voices.length,
      music: this.track ? this.track.info() : null,
      fadingTracks: this.dying.length,
    };
  }

  // ---- internals ------------------------------------------------------------

  /** Run `fn`, and never let a Web Audio failure reach the game loop. */
  private guard(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      this.report(err);
    }
  }

  /** One warning for the first failure, then silence: sound is never worth a broken frame. */
  private report(err: unknown): void {
    if (this.warned) return;
    this.warned = true;
    console.warn('[audio] a Web Audio call failed; carrying on without it:', err);
  }

  private readonly wake = (): void => {
    const live = this.g?.live;
    if (live && live.state !== 'running' && live.state !== 'closed' && !document.hidden) live.resume().catch(() => {});
  };

  /** Stop sounding while the page is hidden: the game loop is not running to steer it. */
  private readonly onVisibility = (): void => {
    const live = this.g?.live;
    if (!live || live.state === 'closed') return;
    if (document.hidden) live.suspend().catch(() => {});
    else live.resume().catch(() => {});
  };

  private boot(ctx: Ctx, live: AudioContext | null): void {
    const rng = new Rng();
    const white = makeNoise(ctx, 2.0, false, rng);
    const pink = makeNoise(ctx, 2.7, true, rng);
    const gain = (value: number, dest: AudioNode): GainNode => {
      const n = ctx.createGain();
      n.gain.value = value;
      n.connect(dest);
      return n;
    };

    // Master chain, built back to front.
    const master = gain(this.vol.master, ctx.destination);
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve(MASTER.clipKnee, MASTER.clipCeiling);
    clip.connect(master);
    // The compressor adds its own make-up gain of full ** -0.6. `drive` and
    // `post` are chosen so that quiet signals pass at unity and a full-scale
    // signal into the compressor comes out at the ceiling. The clipper's
    // curve spans -2..2, hence the extra half.
    const full = compressorFullRangeGain(MASTER.threshold, MASTER.knee, MASTER.ratio);
    const post = gain((MASTER.ceiling / full ** 0.4) * 0.5, clip);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = MASTER.threshold;
    comp.knee.value = MASTER.knee;
    comp.ratio.value = MASTER.ratio;
    comp.attack.value = MASTER.attack;
    comp.release.value = MASTER.release;
    comp.connect(post);
    const drive = gain(full / MASTER.ceiling, comp);
    const mix = gain(1, drive);

    // Buses.
    const musicBus = gain(this.vol.music, mix);
    const sfxBus = gain(this.vol.sfx, mix);
    const engineBus = gain(this.vol.sfx, mix);
    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(ctx, REVERB_SECONDS, rng);
    // The browser normalises the impulse response, which leaves the reverb about
    // 10 dB under its input; the return gain brings a full send to about -4 dB.
    reverb.connect(gain(REVERB_RETURN, mix));
    const musicSend = gain(this.vol.music, reverb);
    const sfxSend = gain(this.vol.sfx, reverb);
    const musicIn = gain(1, musicBus);
    const musicWetIn = gain(1, musicSend);

    const layers = new EngineLayers(ctx, white, pink, engineBus);
    layers.setMix(this.layerMix);
    this.g = { ctx, live, rng, white, pink, master, mix, musicBus, musicSend, musicIn, musicWetIn, sfxBus, sfxSend, engineBus, layers };
    // A song is decoded for the circuit named ahead (prepareMusic), or when a race asks for one.
    if (this.nextSong) this.prepareSong(this.nextSong);
    this.applyMusic();
  }

  /** Disconnect sounds that have finished. Their sources have already stopped themselves. */
  private sweep(now: number): void {
    if (this.voices.length) this.voices = this.reap(this.voices, now);
    if (this.fading.length) this.fading = this.reap(this.fading, now);
    if (this.dying.length) {
      this.dying = this.dying.filter((d) => {
        if (now < d.at) return true;
        d.track.dispose();
        return false;
      });
    }
  }

  private reap(list: Playing[], now: number): Playing[] {
    let done = false;
    for (const p of list) if (now > p.voice.end + 0.06) done = true;
    if (!done) return list;
    return list.filter((p) => {
      if (now <= p.voice.end + 0.06) return true;
      for (const n of p.nodes) n.disconnect();
      return false;
    });
  }

  /**
   * At the voice limit: give up the quietest sound of the lowest priority,
   * oldest first, if the newcomer matters at least as much. Returns false if
   * the newcomer should be dropped instead.
   */
  private makeRoom(level: number, prio: number, now: number): boolean {
    let pick = -1;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      if (v.prio > prio || (v.prio === prio && v.level > level && prio < 2)) continue;
      if (pick < 0) {
        pick = i;
        continue;
      }
      const b = this.voices[pick];
      if (v.prio < b.prio || (v.prio === b.prio && (v.level < b.level || (v.level === b.level && v.voice.t0 < b.voice.t0)))) pick = i;
    }
    if (pick < 0) return false;
    const [victim] = this.voices.splice(pick, 1);
    const g = victim.voice.out.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(0, now, 0.006);
    for (const s of victim.voice.srcs) {
      try {
        s.stop(now + 0.04);
      } catch {
        /* already stopped */
      }
    }
    victim.voice.end = now + 0.04;
    this.fading.push(victim);
    return true;
  }

  /** Turn the music down by `amount` for `hold` seconds so a jingle or blast reads clearly. */
  private duck(amount: number, hold: number, now: number): void {
    const g = this.g;
    if (!g) return;
    let level = 1 - clamp(amount, 0, 0.9);
    if (now < this.duckUntil) level = Math.min(level, this.duckLevel);
    this.duckLevel = level;
    this.duckUntil = Math.max(this.duckUntil, now + hold);
    for (const p of [g.musicIn.gain, g.musicWetIn.gain]) {
      p.cancelScheduledValues(now);
      p.setTargetAtTime(level, now, 0.03);
      p.setTargetAtTime(1, this.duckUntil, 0.25);
    }
  }

  /**
   * A song has played its ending while the race is still on screen (the
   * player is over the line, the others are not): on to the menu music, as
   * the results will want, so the wait is not silent. When the results then
   * ask for the menu music, it is already playing and carries on.
   */
  private afterSong(now: number, ahead: number): void {
    const g = this.g;
    if (!g || !this.track) return;
    this.track.fade(0, now, 0.05);
    this.dying.push({ track: this.track, at: now + 0.5 });
    const t = createTrack('menu', g.ctx, g.white, now);
    t.dry.connect(g.musicIn);
    t.wet.connect(g.musicWetIn);
    t.fade(MUSIC_TRIM, now, 0.5);
    this.track = t;
    t.schedule(now, this.lapPhase, ahead);
  }

  /**
   * A race on a circuit with a recorded song, coming or starting: decode it,
   * and let go of any other circuit's, so only one song is held decoded
   * (each takes over 200 MB). The game names the circuit as soon as it builds
   * it (prepareMusic), which is often well before the race; when it is not,
   * the song starts once decoded, a second or two into the countdown.
   */
  private prepareSong(style: string): void {
    const g = this.g;
    const song = this.songs.get(style);
    if (!g || !song) return;
    // Never the song of the race on now, for one coming after it.
    if (this.want === 'race' && this.raceStyle() !== style && this.songs.has(this.raceStyle())) return;
    for (const [s, other] of this.songs) if (s !== style) other.release();
    song.decode(g.ctx);
  }

  private raceStyle(): string {
    return RACE_STYLES.includes(this.wantStyle) ? this.wantStyle : 'meridian';
  }

  /** `fresh`: asked for by a race starting, so a recorded song starts again from its top. */
  private applyMusic(fresh = false): void {
    const g = this.g;
    if (!g) return;
    // Racing on a different circuit is a change of music too.
    const style = this.want === 'race' ? this.raceStyle() : 'menu';
    if (this.want === 'race') this.prepareSong(style);
    const same = (this.track ? this.track.name : null) === this.want && (!this.track || this.track.style === style);
    if (same && !(fresh && this.track?.restartsWithRace)) return;
    const now = g.ctx.currentTime;
    if (this.track) {
      // Fade the old track out over about a second, then tear it down.
      this.track.fade(0, now, 0.22);
      this.dying.push({ track: this.track, at: now + 1.4 });
      this.track = null;
    }
    if (this.want) {
      const song = this.want === 'race' ? this.songs.get(style) : undefined;
      const t = song && song.state !== 'failed' ? new SongTrack(g.ctx, song, style) : createTrack(this.want, g.ctx, g.white, now, this.wantStyle);
      t.dry.connect(g.musicIn);
      t.wet.connect(g.musicWetIn);
      t.fade(MUSIC_TRIM, now, 0.2);
      this.track = t;
      // (A new race is not finished, whatever the last one was.)
      t.schedule(now, this.lapPhase, LOOKAHEAD + 2 * this.frameGap, false);
    }
  }
}
