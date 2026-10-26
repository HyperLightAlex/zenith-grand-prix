import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { bestLag, firstLayers, SCREEN_SONGS, SONGS, SongPlan, SongSource, syncShift, type SongManifest } from '../src/client/audio/song';

// A song with a bar every 2 s from 1 s: bar 3 (7 s) to bar 10 (21 s) loops,
// and the ending sits in the files just after the loop's end.
const bars = Array.from({ length: 11 }, (_, i) => 1 + 2 * i);
const map = { bars, loop: [7, 21] as [number, number], ending: 21.05, end: 29 };

describe('the song timeline', () => {
  it('plays from the start, then loops from the end of its loop, queued ahead', () => {
    const plan = new SongPlan(map);
    plan.start(100);
    expect(plan.posAt(100.5)).toBeCloseTo(0.5);
    expect(plan.barAt(100.5)).toBe(-1);
    expect(plan.barAt(101)).toBe(0);
    expect(plan.extend(118)).toEqual([]);
    const [pass] = plan.extend(121.5);
    expect(pass).toEqual({ at: 121, from: 7, until: 21, kind: 'body' });
    expect(plan.posAt(120.9)).toBeCloseTo(20.9);
    expect(plan.posAt(121.5)).toBeCloseTo(7.5);
    expect(plan.barAt(121.5)).toBe(3);
    // Queued as far ahead as asked: passes at 135 and 149.
    expect(plan.extend(150).map((s) => s.at)).toEqual([135, 149]);
  });

  it('finds the next bar line, across the loop', () => {
    const plan = new SongPlan(map);
    plan.start(100);
    plan.extend(130);
    expect(plan.nextBar(100.2)).toEqual({ at: 101, bar: 0 });
    expect(plan.nextBar(101)).toEqual({ at: 101, bar: 0 });
    // Just before the loop's end, the bar line is the end itself (where the loop starts again).
    expect(plan.nextBar(119.5)).toEqual({ at: 121, bar: 10 });
    expect(plan.nextBar(121.2)).toEqual({ at: 123, bar: 4 });
  });

  it('goes to its ending on the next bar line, dropping the pass queued after it', () => {
    const plan = new SongPlan(map);
    plan.start(100);
    plan.extend(122);
    const done = plan.finish(119.5)!;
    expect(done.ending).toEqual({ at: 121, from: 21.05, until: 29, kind: 'ending' });
    expect(done.dropped.map((s) => s.at)).toEqual([121]);
    expect(done.cut!.until).toBeCloseTo(21);
    expect(plan.posAt(120.5)).toBeCloseTo(20.5);
    expect(plan.posAt(121.5)).toBeCloseTo(21.55);
    expect(plan.barAt(121.5)).toBe(-1);
    // Nothing more is queued once the ending is on, and it plays to the end.
    expect(plan.extend(200)).toEqual([]);
    expect(plan.posAt(128.9)).toBeCloseTo(28.95);
    expect(plan.posAt(129.1)).toBeNull();
  });

  it('cuts the loop short mid-pass for the ending', () => {
    const plan = new SongPlan(map);
    plan.start(100);
    plan.extend(136);
    const done = plan.finish(126.1)!;
    // Pass from 121 at position 7: 126.1 is position 12.1, so the next bar line is 13, at 127.
    expect(done.ending.at).toBeCloseTo(127);
    expect(done.cut!.until).toBeCloseTo(13);
    expect(done.dropped.map((s) => s.at)).toEqual([135]);
    expect(plan.posAt(126.9)).toBeCloseTo(12.9);
    expect(plan.posAt(127.5)).toBeCloseTo(21.55);
  });

  it('jumps on a bar line to another stretch, and loops that from then on', () => {
    // A finale after the loop: bars at 30, 32 ... 38 in the files, looping 32 to 38.
    const plan = new SongPlan({ ...map, bars: [...bars, 30, 32, 34, 36, 38], ending: 40.05, end: 48 });
    plan.start(100);
    plan.extend(123);
    // At 112.6 (position 12.6) the next bar line is 13 (bar 6), at 113: on to position 30 + (6 % 2) * 2.
    const done = plan.jump(112.6, (bar) => 30 + (bar % 2) * 2, [32, 38])!;
    expect(done.seg).toEqual({ at: 113, from: 30, until: 38, kind: 'body' });
    expect(done.cut!.until).toBeCloseTo(13);
    expect(done.dropped.map((s) => s.at)).toEqual([121]);
    expect(plan.posAt(112.9)).toBeCloseTo(12.9);
    expect(plan.posAt(113.5)).toBeCloseTo(30.5);
    expect(plan.barAt(113.5)).toBe(11);
    // From then on it loops the new stretch: 32 to 38, from 121.
    expect(plan.extend(122).map((s) => [s.at, s.from, s.until])).toEqual([[121, 32, 38]]);
    expect(plan.posAt(121.5)).toBeCloseTo(32.5);
    expect(plan.nextBar(126.5)).toEqual({ at: 127, bar: 15 });
    // And the finish still goes to the ending from there.
    const end = plan.finish(126.5)!;
    expect(end.ending).toEqual({ at: 127, from: 40.05, until: 48, kind: 'ending' });
  });

  it('forgets what has finished, keeping the last', () => {
    const plan = new SongPlan(map);
    plan.start(100);
    plan.extend(150);
    plan.prune(140);
    expect(plan.segs.map((s) => s.at)).toEqual([135, 149]);
  });
});

describe("the decoder check", () => {
  // A level envelope (dB above -90, one value a millisecond) with a few hits.
  const ref = Array.from({ length: 2000 }, (_, i) => (i % 213 < 6 ? 80 : 20 + (i % 37)));
  const fakeBuffer = (lateMs: number, rate = 48000) => {
    const data = new Float32Array(Math.round(rate * 2.2));
    for (let i = 0; i < ref.length; i++) {
      const v = 10 ** ((ref[i] - 90) / 20);
      const at = Math.ceil(((i + lateMs) * rate) / 1000);
      if (at >= 0 && at < data.length) data[at] = v;
    }
    return { sampleRate: rate, length: data.length, numberOfChannels: 1, getChannelData: () => data } as unknown as AudioBuffer;
  };
  const b64 = Buffer.from(Uint8Array.from(ref)).toString('base64');

  it('finds how much later a decoder starts the audio, at any sample rate', () => {
    expect(syncShift(fakeBuffer(0), b64)).toBe(0);
    expect(syncShift(fakeBuffer(0, 44100), b64)).toBe(0);
    expect(syncShift(fakeBuffer(7, 44100), b64)).toBeCloseTo(0.007);
    expect(syncShift(fakeBuffer(21), b64)).toBeCloseTo(0.021);
    expect(syncShift(fakeBuffer(-12), b64)).toBeCloseTo(-0.012);
  });

  it('lines up two envelopes', () => {
    const env = [0, 0, 0, ...ref];
    expect(bestLag(ref, env)).toBe(3);
  });
});

describe('holding one song at a time', () => {
  // A song of four layers, served by a stand-in fetch, decoded by a stand-in
  // context that checks it is given data it can have (the browser takes over
  // what it decodes, so the source has to hand over a copy). Its first lap
  // plays a and b (the decoder check is on a); c comes in on lap 2, d on 3.
  const manifest = {
    layers: ['a', 'b', 'c', 'd'].map((id) => ({ id, file: `${id}.mp3` })),
    laps: { a: [-3, 0, 0], b: [-3, 0, 0], c: [null, 0, 0], d: [null, null, 0] },
    sync: { layer: 'a', env: Buffer.from([0, 0, 0]).toString('base64') },
  };
  const fakeFetch = async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => manifest,
    // (Each layer's download a size of its own: a 8 bytes, b 16, c 24, d 32.)
    arrayBuffer: async () => new ArrayBuffer(8 * ('abcd'.indexOf(url.slice(-5, -4)) + 1)),
  });
  const buffer = { sampleRate: 48000, length: 48000, numberOfChannels: 1, getChannelData: () => new Float32Array(48000) };
  const ctx = (decoded: number[], wait?: Promise<void>) =>
    ({
      sampleRate: 48000,
      decodeAudioData: (data: ArrayBuffer, ok: (b: unknown) => void) => {
        expect(data.byteLength).toBeGreaterThan(0);
        decoded.push(data.byteLength);
        // (The browser's way: the callback, and a promise too.)
        const p = (async () => {
          if (wait) await wait;
          return buffer;
        })();
        void p.then(ok);
        return p;
      },
    }) as unknown as BaseAudioContext;
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('decodes when asked, lets go, and decodes again from the download it kept', async () => {
    vi.stubGlobal('fetch', fakeFetch);
    try {
      const src = new SongSource('music/x/');
      await settle();
      expect(src.state).toBe('loading');
      const decoded: number[] = [];
      src.decode(ctx(decoded));
      await vi.waitFor(() => expect(src.state).toBe('ready'));
      expect(src.buffers).toHaveLength(4);
      src.release();
      expect(src.state).toBe('loading');
      expect(src.buffers).toHaveLength(0);
      src.decode(ctx(decoded));
      await vi.waitFor(() => expect(src.state).toBe('ready'));
      expect(decoded).toEqual([8, 16, 24, 32, 8, 16, 24, 32]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('downloads nothing until it is wanted', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', (url: string) => (urls.push(url), fakeFetch(url)));
    try {
      const src = new SongSource('music/x/');
      await settle();
      expect(urls).toEqual([]);
      expect(src.fetched).toBe(false);
      src.decode(ctx([]));
      await vi.waitFor(() => expect(src.state).toBe('ready'));
      expect(urls).toEqual(['music/x/song.json', 'music/x/a.mp3', 'music/x/b.mp3', 'music/x/c.mp3', 'music/x/d.mp3']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('forgets its download when told, and fetches it again when wanted', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', (url: string) => (urls.push(url), fakeFetch(url)));
    try {
      const src = new SongSource('music/x/');
      src.decode(ctx([]));
      await vi.waitFor(() => expect(src.state).toBe('ready'));
      src.forget();
      expect(src.state).toBe('loading');
      expect(src.buffers).toHaveLength(0);
      expect(src.fetched).toBe(false);
      src.decode(ctx([]));
      await vi.waitFor(() => expect(src.state).toBe('ready'));
      expect(urls.filter((u) => u.endsWith('song.json'))).toHaveLength(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('calls off a download under way when forgotten', async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal('fetch', (_url: string, init?: { signal?: AbortSignal }) => {
      if (init?.signal) signals.push(init.signal);
      return new Promise((_ok, fail) => init?.signal?.addEventListener('abort', () => fail(new Error('aborted'))));
    });
    try {
      const src = new SongSource('music/x/');
      src.prefetch().catch(() => {});
      await settle();
      expect(signals.length).toBe(1);
      src.forget();
      expect(signals[0].aborted).toBe(true);
      await settle();
      // Called off is not failed: it can be asked for again.
      expect(src.state).toBe('loading');
      expect(src.fetched).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('tries a song that failed to load again once forgotten', async () => {
    let up = false;
    vi.stubGlobal('fetch', (url: string) => (up ? fakeFetch(url) : Promise.reject(new Error('offline'))));
    try {
      const src = new SongSource('music/x/');
      src.decode(ctx([]));
      await vi.waitFor(() => expect(src.state).toBe('failed'));
      expect(src.failedAt).toBeGreaterThan(-Infinity);
      // Still failed if only decoded again (the race plays its synthesised music)...
      src.decode(ctx([]));
      expect(src.state).toBe('failed');
      // ...but forgotten, it loads afresh.
      up = true;
      src.forget();
      src.decode(ctx([]));
      await vi.waitFor(() => expect(src.state).toBe('ready'));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("starts on the first lap's layers, decoded together; the later laps' follow, two at a time", async () => {
    vi.stubGlobal('fetch', fakeFetch);
    try {
      const src = new SongSource('music/x/');
      let go = () => {};
      const gate = new Promise<void>((r) => (go = r));
      const decoded: number[] = [];
      // a and b decode at once; c and d wait at the gate.
      const c = ctx(decoded);
      const slow = ctx(decoded, gate);
      const both = { ...c, decodeAudioData: (d: ArrayBuffer, ok: (b: unknown) => void, no: (e: unknown) => void) => (d.byteLength <= 16 ? c : slow).decodeAudioData(d, ok, no) } as unknown as BaseAudioContext;
      src.decode(both);
      await vi.waitFor(() => expect(src.startable).toBe(true));
      expect(src.state).toBe('loading');
      expect(src.buffers.map((x) => x !== null)).toEqual([true, true, false, false]);
      await vi.waitFor(() => expect(decoded).toEqual([8, 16, 24, 32]));
      go();
      await vi.waitFor(() => expect(src.state).toBe('ready'));
      expect(src.buffers.every((x) => x !== null)).toBe(true);
      // Let go of, it can start no longer.
      src.release();
      expect(src.startable).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("downloads the first lap's layers first, and the others once those are in", async () => {
    const asked: string[] = [];
    const hold: Record<string, () => void> = {};
    vi.stubGlobal('fetch', (url: string) => {
      asked.push(url.slice(8));
      if (url.endsWith('.json')) return fakeFetch(url);
      return new Promise((ok) => (hold[url.slice(8)] = () => ok(fakeFetch(url))));
    });
    try {
      const src = new SongSource('music/x/');
      src.prefetch().catch(() => {});
      await vi.waitFor(() => expect(asked).toEqual(['song.json', 'a.mp3', 'b.mp3']));
      hold['a.mp3']();
      await settle();
      expect(asked).toHaveLength(3);
      hold['b.mp3']();
      await vi.waitFor(() => expect(asked).toEqual(['song.json', 'a.mp3', 'b.mp3', 'c.mp3', 'd.mp3']));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('drops a decode let go of halfway', async () => {
    vi.stubGlobal('fetch', fakeFetch);
    try {
      const src = new SongSource('music/x/');
      let go = () => {};
      const decoded: number[] = [];
      src.decode(ctx(decoded, new Promise((r) => (go = r))));
      // The first lap's two under way.
      await vi.waitFor(() => expect(decoded).toEqual([8, 16]));
      src.release();
      go();
      await settle();
      await settle();
      expect(src.state).toBe('loading');
      expect(decoded).toEqual([8, 16]);
      // And it can be asked for again.
      src.decode(ctx(decoded));
      await vi.waitFor(() => expect(src.state).toBe('ready'));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('the songs shipped', () => {
  for (const [style, base] of Object.entries({ ...SONGS, ...SCREEN_SONGS })) {
    it(`${style}: its files are there, and its map makes sense`, () => {
      const dir = `public/${base}`;
      const m = JSON.parse(readFileSync(`${dir}song.json`, 'utf8')) as SongManifest;
      for (const l of m.layers) expect(existsSync(dir + l.file), l.file).toBe(true);
      // It can start on the first lap's layers: the decoder check is on one of them.
      expect(m.laps[m.sync.layer]?.[0], `the decoder check (${m.sync.layer}) is on a layer the first lap plays`).not.toBeNull();
      expect(firstLayers(m)).toEqual(m.layers.map((l, i) => (m.laps[l.id][0] !== null ? i : -1)).filter((i) => i >= 0));
      // Bars in order, the loop on two of them, the ending after the loop.
      for (let i = 1; i < m.bars.length; i++) expect(m.bars[i]).toBeGreaterThan(m.bars[i - 1]);
      expect(m.bars).toContain(m.loop[0]);
      // The bars run to the loop's end, then the finale's, if there is one.
      const f = m.finale;
      expect(m.bars[m.bars.length - 1]).toBe(f ? f.loop[1] : m.loop[1]);
      expect(m.bars).toContain(m.loop[1]);
      expect(m.ending).toBeGreaterThan(f ? f.loop[1] : m.loop[1]);
      if (f) {
        // Somewhere to land for every place in the cycle, each on one of its bar lines, after the loop.
        expect(f.entry).toHaveLength(f.cycle);
        for (const e of [...f.entry, ...f.loop]) {
          expect(m.bars).toContain(e);
          expect(e).toBeGreaterThan(m.loop[1]);
        }
        expect(f.loop[1]).toBeGreaterThan(f.loop[0]);
        expect([2, 3]).toContain(f.lap);
        if (f.phrase) {
          expect(f.phrase.bars).toBeGreaterThanOrEqual(1);
          // From a phrase's first bar line, it goes in at the finale's start.
          expect(f.entry[((f.phrase.first % f.cycle) + f.cycle) % f.cycle]).toBe(Math.min(...f.entry));
        }
      }
      if (m.stingers) for (const v of Object.values(m.stingers)) expect(Math.abs(v)).toBeLessThanOrEqual(12);
      expect(m.end).toBeGreaterThan(m.ending + 2);
      expect(m.end).toBeCloseTo(m.frames / m.rate, 3);
      // Every layer has a level on each lap, something plays on lap 1, and everything on lap 3.
      for (const l of m.layers) expect(m.laps[l.id]).toHaveLength(3);
      expect(m.layers.some((l) => m.laps[l.id][0] !== null)).toBe(true);
      expect(m.layers.every((l) => m.laps[l.id][2] !== null)).toBe(true);
      expect(Number.isFinite(m.level)).toBe(true);
      expect(m.layers.map((l) => l.id)).toContain(m.sync.layer);
      if (m.lowShelf) {
        for (const id of m.lowShelf.layers) expect(m.layers.map((l) => l.id)).toContain(id);
        expect(m.lowShelf.db).toHaveLength(3);
        expect(m.lowShelf.hz).toBeGreaterThan(20);
      }
      expect(Buffer.from(m.sync.env, 'base64').length).toBeGreaterThan(1000);
    });
  }
});
