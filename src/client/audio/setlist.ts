// The hangar's music (with ?music=suno): a setlist of finished songs played
// one after another under the hangar screens, like the pit crew's radio,
// rather than one track on repeat. Each plays through once; the order is
// shuffled and goes round them all before any comes again; the player can
// skip to the next. Leaving the hangar and coming back carries on with the
// next one. Built by tools/music/setlist.py.
//
// Only what is playing, and the next track in its last moments, is held
// decoded (a 3-minute track is about 70 MB). The next track's file is
// fetched as soon as one starts (so a skip only waits for the decoding),
// and kept, so it is not fetched twice.

import type { MusicTrack, TrackInfo } from './music';
import { decodeInto, decodeOne } from './song';

/** The setlists there are, by what plays them: where each one's files are. */
export const SETLISTS: Record<string, string> = {
  hangar: 'music/hangar/',
};

/** What tools/music/setlist.py writes as setlist.json. */
export interface SetlistManifest {
  id: string;
  /** Lengths in seconds; gain in dB, to bring each to the setlist's loudness. */
  tracks: Array<{ id: string; title: string; file: string; length: number; gain: number }>;
}

/** The quiet between one track's end and the next one's start. */
export const GAP = 1.5;
/** How long before a track ends the next one is fetched and decoded. */
const PREPARE = 20;
/** A skipped track fades out over this. */
export const SKIP_FADE = 0.4;

/**
 * A shuffled order that plays every track once before any comes again, and
 * never the same one twice running (across the turn of the bag either).
 */
export class ShuffleBag {
  private order: number[] = [];
  private last = -1;
  constructor(
    private readonly n: number,
    private readonly random: () => number = Math.random,
  ) {}

  next(): number {
    if (this.n <= 0) return -1;
    if (!this.order.length) {
      this.order = Array.from({ length: this.n }, (_, i) => i);
      for (let i = this.n - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
      }
      if (this.n > 1 && this.order[0] === this.last) [this.order[0], this.order[this.n - 1]] = [this.order[this.n - 1], this.order[0]];
    }
    this.last = this.order.shift()!;
    return this.last;
  }
}

/** A setlist's files: the list fetched as soon as this is made, each track when it is next up. */
export class Setlist {
  state: 'loading' | 'ready' | 'failed' = 'loading';
  manifest: SetlistManifest | null = null;
  bag: ShuffleBag | null = null;
  private readonly files = new Map<number, Promise<ArrayBuffer>>();

  constructor(readonly base: string) {
    void (async () => {
      const res = await fetch(base + 'setlist.json');
      if (!res.ok) throw new Error(`${base}setlist.json: ${res.status}`);
      const manifest = (await res.json()) as SetlistManifest;
      if (!manifest.tracks?.length) throw new Error(`${base}setlist.json: no tracks`);
      this.manifest = manifest;
      this.bag = new ShuffleBag(manifest.tracks.length);
      this.state = 'ready';
    })().catch((err) => {
      this.state = 'failed';
      console.warn(`[audio] the setlist in ${base} could not be loaded; the menu music plays instead:`, err);
    });
  }

  /** Track `i`'s file, fetched the first time it is asked for (and kept). */
  fetch(i: number): Promise<ArrayBuffer> {
    const t = this.manifest!.tracks[i];
    let file = this.files.get(i);
    if (!file) {
      file = fetch(this.base + t.file).then((r) => {
        if (!r.ok) throw new Error(`${this.base}${t.file}: ${r.status}`);
        return r.arrayBuffer();
      });
      this.files.set(i, file);
      file.catch(() => this.files.delete(i));
    }
    return file;
  }

  /** Track `i`, decoded for `ctx`. */
  async decode(i: number, ctx: BaseAudioContext): Promise<AudioBuffer> {
    // (A copy: the browser takes over the data it decodes.)
    return decodeOne(decodeInto(ctx), (await this.fetch(i)).slice(0));
  }
}

/** What the hangar's music is doing, for the screen and the checks. */
export interface SetlistInfo {
  id: string;
  title: string;
  /** 'loading' until the first track can start; 'between' in the quiet after one. */
  state: 'loading' | 'playing' | 'between';
  /** Seconds into the track, and its length (0 when none). */
  pos: number;
  length: number;
  /** The next track is being decoded. */
  decoding: boolean;
  log: Array<{ what: string; at: number; id: string }>;
}

interface Playing {
  i: number;
  src: AudioBufferSourceNode;
  gain: GainNode;
  start: number;
  /** When it stops: its end, or soon after a skip. */
  end: number;
  skipped: boolean;
}

/** The setlist as a music track: each track through once, then the next. */
export class SetlistTrack implements MusicTrack {
  readonly name = 'hangar' as const;
  readonly style = 'hangar';
  readonly dry: GainNode;
  readonly wet: GainNode;
  readonly taps: Record<string, AudioNode> = {};
  readonly restartsWithRace = false;
  broken = false;

  private playing: Playing | null = null;
  private ended: Playing[] = [];
  /** The track up next: chosen (and its file fetched) as one starts; decoding once `decoding`, ready once `buffer` is set. */
  private next: { i: number; decoding: boolean; buffer: AudioBuffer | null } | null = null;
  private failures = 0;
  private disposed = false;
  private readonly log: SetlistInfo['log'] = [];

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly list: Setlist,
  ) {
    this.dry = ctx.createGain();
    this.dry.gain.value = 0;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0;
    this.taps.setlist = this.dry;
  }

  schedule(now: number): void {
    if (this.disposed) return;
    if (this.list.state === 'failed') this.broken = true;
    if (this.list.state !== 'ready') return;
    const cur = this.playing;
    // The next track: chosen (its file on its way) at once; decoded at once
    // when nothing plays, else near this one's end, or on a skip.
    if (!this.next) this.choose();
    if (this.next && !this.next.decoding && (!cur || cur.skipped || now >= cur.end - PREPARE)) this.decodeNext();
    // On to it, in the quiet after this one (straight in after a skip).
    const at = cur ? cur.end + (cur.skipped ? 0 : GAP) : now + 0.05;
    if (this.next?.buffer && now >= at - 0.3) this.start(Math.max(at, now + 0.02));
    // Let go of what has finished.
    for (const p of this.ended.splice(0)) {
      if (now > p.end + 0.5) this.release(p);
      else this.ended.push(p);
    }
  }

  /** On to the next track now: this one fades out, and the next comes in as soon as it is ready. */
  skip(now: number): void {
    const cur = this.playing;
    if (cur && !cur.skipped) {
      cur.gain.gain.cancelScheduledValues(now);
      cur.gain.gain.setTargetAtTime(0, now, SKIP_FADE / 4);
      try {
        cur.src.stop(now + SKIP_FADE);
      } catch {
        /* not started yet */
      }
      cur.end = Math.min(cur.end, now + SKIP_FADE * 0.5);
      cur.skipped = true;
      this.note('skip', now, cur.i);
    } else if (this.next && !this.next.buffer) {
      // Skipped again before the next was ready: that one too.
      this.next = null;
    }
  }

  fade(to: number, now: number, tau: number): void {
    const g = this.dry.gain;
    g.cancelScheduledValues(now);
    if (!this.playing && to > 0) g.setValueAtTime(to, now);
    else g.setTargetAtTime(to, now, tau);
  }

  dispose(): void {
    this.disposed = true;
    if (this.playing) this.release(this.playing);
    for (const p of this.ended) this.release(p);
    this.playing = null;
    this.ended = [];
    this.next = null;
    this.dry.disconnect();
    this.wet.disconnect();
  }

  /** What plays now (or null between tracks, or before the first). */
  current(): { id: string; title: string } | null {
    const m = this.list.manifest;
    const p = this.playing;
    if (!m || !p || p.skipped || this.ctx.currentTime >= p.end) return null;
    return { id: m.tracks[p.i].id, title: m.tracks[p.i].title };
  }

  info(): TrackInfo {
    const now = this.ctx.currentTime;
    const m = this.list.manifest;
    const p = this.playing;
    const on = !!p && now >= p.start && now < p.end;
    const t = p && m ? m.tracks[p.i] : null;
    return {
      name: this.name,
      style: this.style,
      phase: 1,
      bar: -1,
      startTime: p ? p.start : -1,
      barDur: 0,
      changeAt: -1,
      setlist: {
        id: t?.id ?? '',
        title: t?.title ?? '',
        state: !p ? 'loading' : on ? 'playing' : 'between',
        pos: on ? now - p.start : 0,
        length: t?.length ?? 0,
        decoding: !!this.next?.decoding && !this.next.buffer,
        log: this.log.slice(),
      },
    };
  }

  // ---- internals ----

  private note(what: string, at: number, i: number): void {
    this.log.push({ what, at, id: this.list.manifest?.tracks[i]?.id ?? '' });
    if (this.log.length > 24) this.log.shift();
  }

  /** The next track: picked, and its file fetched. */
  private choose(): void {
    const i = this.list.bag!.next();
    this.next = { i, decoding: false, buffer: null };
    this.list.fetch(i).catch(() => {
      /* reported when it is decoded */
    });
  }

  private decodeNext(): void {
    const next = this.next!;
    next.decoding = true;
    const i = next.i;
    this.list.decode(i, this.ctx).then(
      (buffer) => {
        if (this.next === next && !this.disposed) next.buffer = buffer;
      },
      (err) => {
        console.warn(`[audio] a track of the setlist could not be loaded; on to the next:`, err);
        if (this.next === next) this.next = null;
        // Every one of them failing: the menu music instead.
        if (++this.failures >= this.list.manifest!.tracks.length) this.broken = true;
      },
    );
  }

  private start(at: number): void {
    const nx = this.next!;
    this.next = null;
    const t = this.list.manifest!.tracks[nx.i];
    const src = this.ctx.createBufferSource();
    src.buffer = nx.buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = 10 ** (t.gain / 20);
    src.connect(gain);
    gain.connect(this.dry);
    src.start(at);
    if (this.playing) this.ended.push(this.playing);
    this.playing = { i: nx.i, src, gain, start: at, end: at + nx.buffer!.duration, skipped: false };
    this.failures = 0;
    this.note('play', at, nx.i);
  }

  private release(p: Playing): void {
    try {
      p.src.stop();
    } catch {
      /* already stopped */
    }
    p.src.disconnect();
    p.gain.disconnect();
  }
}
