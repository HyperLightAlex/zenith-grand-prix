import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bestLag, SONGS, SongPlan, syncShift, type SongManifest } from '../src/client/audio/song';

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

describe('the songs shipped', () => {
  for (const [style, base] of Object.entries(SONGS)) {
    it(`${style}: its files are there, and its map makes sense`, () => {
      const dir = `public/${base}`;
      const m = JSON.parse(readFileSync(`${dir}song.json`, 'utf8')) as SongManifest;
      for (const l of m.layers) expect(existsSync(dir + l.file), l.file).toBe(true);
      // Bars in order, the loop on two of them, the ending after the loop.
      for (let i = 1; i < m.bars.length; i++) expect(m.bars[i]).toBeGreaterThan(m.bars[i - 1]);
      expect(m.bars).toContain(m.loop[0]);
      expect(m.bars[m.bars.length - 1]).toBe(m.loop[1]);
      expect(m.ending).toBeGreaterThan(m.loop[1]);
      expect(m.end).toBeGreaterThan(m.ending + 2);
      expect(m.end).toBeCloseTo(m.frames / m.rate, 3);
      // Every layer has a level on each lap, something plays on lap 1, and everything on lap 3.
      for (const l of m.layers) expect(m.laps[l.id]).toHaveLength(3);
      expect(m.layers.some((l) => m.laps[l.id][0] !== null)).toBe(true);
      expect(m.layers.every((l) => m.laps[l.id][2] !== null)).toBe(true);
      expect(Number.isFinite(m.level)).toBe(true);
      expect(m.layers.map((l) => l.id)).toContain(m.sync.layer);
      expect(Buffer.from(m.sync.env, 'base64').length).toBeGreaterThan(1000);
    });
  }
});
