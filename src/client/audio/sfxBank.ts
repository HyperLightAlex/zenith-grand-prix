// Recorded sound effects (with ?music=suno): takes made in Suno, built by
// tools/sfx/build.py into public/sfx/ as manifest.json and one small file a
// take. A sound with recordings plays one of them, a different take from
// last time where there are several; a sound without plays its synthesised
// recipe (sfx.ts), so they can come in a few at a time. Either way the
// engine treats it the same: its level, reverb send, pan, pitch spread,
// voice priority and ducking all come from SFX_META.
//
// The files are fetched as soon as the bank is made, and all decoded once
// there is an audio context: together they are small (a few seconds each).

import type { SfxName } from './audio';
import type { Rng } from './dsp';
import { decodeOne } from './song';

/** Where the built sounds are. */
export const SFX_BASE = 'sfx/';

/** What tools/sfx/build.py writes as manifest.json. */
export interface SfxBankManifest {
  /**
   * Per sound: its takes, and the gain in dB that brings them (each built
   * to the same loudness) to the level of the synthesised sound they stand
   * in for.
   */
  sounds: Record<string, { gain: number; files: string[] }>;
}

export interface Take {
  buffer: AudioBuffer;
  /** Seconds into the buffer the sound starts: past any silence the browser's decoder put in front. */
  start: number;
}

interface Sound {
  /** Linear. */
  gain: number;
  takes: Take[];
  /** The take played last, so the next is another one. */
  last: number;
}

/** A sample below this fraction of the take's peak (-50 dB) counts as silence at its start. */
const ONSET = 10 ** (-50 / 20);
/** How far into a take to look for its start. Encoders' priming is a few tens of milliseconds. */
const ONSET_SEARCH = 0.15;

/**
 * Where the sound in `buf` begins, in seconds. The build starts every take on
 * its first sound, so anything quiet in front of it is the encoder's priming,
 * which some browsers' decoders leave in and some take out. Half a
 * millisecond is kept before it, so the attack is not clipped.
 */
export function onset(buf: AudioBuffer): number {
  const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  let peak = 0;
  for (const d of chans) for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak === 0) return 0;
  const floor = peak * ONSET;
  const n = Math.min(buf.length, Math.round(ONSET_SEARCH * buf.sampleRate));
  for (let i = 0; i < n; i++) {
    for (const d of chans) if (Math.abs(d[i]) > floor) return Math.max(0, i - Math.round(0.0005 * buf.sampleRate)) / buf.sampleRate;
  }
  return 0;
}

export class SfxBank {
  state: 'loading' | 'ready' | 'failed' = 'loading';
  private readonly sounds = new Map<string, Sound>();
  private readonly files: Promise<{ manifest: SfxBankManifest; data: Map<string, ArrayBuffer> }>;
  private decoding = false;

  constructor(readonly base = SFX_BASE) {
    this.files = (async () => {
      const res = await fetch(base + 'manifest.json');
      // None built yet: every sound is synthesised, and that is no failure. (A
      // dev server answers a missing file with the page itself.)
      if (res.status === 404 || res.headers?.get('content-type')?.includes('text/html')) return { manifest: { sounds: {} }, data: new Map<string, ArrayBuffer>() };
      if (!res.ok) throw new Error(`${base}manifest.json: ${res.status}`);
      const manifest = (await res.json()) as SfxBankManifest;
      const names = [...new Set(Object.values(manifest.sounds).flatMap((s) => s.files))];
      const data = new Map<string, ArrayBuffer>();
      await Promise.all(
        names.map(async (f) => {
          const r = await fetch(base + f);
          if (!r.ok) throw new Error(`${base}${f}: ${r.status}`);
          data.set(f, await r.arrayBuffer());
        }),
      );
      return { manifest, data };
    })();
    this.files.catch((err) => this.fail(err));
  }

  /** Decode every take for `ctx`, unless that is done or under way. */
  decode(ctx: BaseAudioContext): void {
    if (this.decoding || this.state !== 'loading') return;
    this.decoding = true;
    void (async () => {
      const { manifest, data } = await this.files;
      const decoded = new Map<string, Take>();
      // A few at a time: they are short, and this runs while the game plays.
      const names = [...data.keys()];
      for (let i = 0; i < names.length; i += 4) {
        await Promise.all(
          names.slice(i, i + 4).map(async (f) => {
            const buffer = await decodeOne(ctx, data.get(f)!);
            decoded.set(f, { buffer, start: onset(buffer) });
          }),
        );
      }
      for (const [name, s] of Object.entries(manifest.sounds)) {
        const takes = s.files.map((f) => decoded.get(f)).filter((t): t is Take => !!t);
        if (takes.length) this.sounds.set(name, { gain: 10 ** (s.gain / 20), takes, last: -1 });
      }
      this.state = 'ready';
    })().catch((err) => this.fail(err));
  }

  /** Whether `name` has recordings ready. */
  has(name: SfxName): boolean {
    return this.sounds.has(name);
  }

  /** The sounds with recordings ready. */
  names(): string[] {
    return [...this.sounds.keys()];
  }

  /** A take of `name` and its gain, or null if it has none (synthesise it). Never the take played last, where there is another. */
  pick(name: SfxName, rng: Rng): { take: Take; gain: number } | null {
    const s = this.sounds.get(name);
    if (!s) return null;
    const n = s.takes.length;
    let i = 0;
    if (n > 1 && s.last < 0) i = Math.min(n - 1, Math.floor(rng.next() * n));
    else if (n > 1) {
      i = Math.min(n - 2, Math.floor(rng.next() * (n - 1)));
      if (i >= s.last) i++;
    }
    s.last = i;
    return { take: s.takes[i], gain: s.gain };
  }

  private fail(err: unknown): void {
    if (this.state === 'failed') return;
    this.state = 'failed';
    console.warn('Recorded sound effects unavailable; synthesising them', err);
  }
}
