import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SETLISTS, ShuffleBag, type SetlistManifest } from '../src/client/audio/setlist';

/** A repeatable stand-in for Math.random. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('the hangar music order', () => {
  it('plays every track once before any comes again', () => {
    const bag = new ShuffleBag(8, seeded(3));
    for (let round = 0; round < 5; round++) {
      const seen = Array.from({ length: 8 }, () => bag.next());
      expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    }
  });

  it('never plays the same track twice running, across the turn of the order either', () => {
    for (let seed = 1; seed < 200; seed++) {
      const bag = new ShuffleBag(3, seeded(seed));
      let last = -1;
      for (let k = 0; k < 30; k++) {
        const i = bag.next();
        expect(i).not.toBe(last);
        last = i;
      }
    }
  });

  it('copes with one track, and with none', () => {
    const one = new ShuffleBag(1);
    expect([one.next(), one.next()]).toEqual([0, 0]);
    expect(new ShuffleBag(0).next()).toBe(-1);
  });
});

describe('the setlists shipped', () => {
  for (const [id, base] of Object.entries(SETLISTS)) {
    it(`${id}: its files are there, each with a title, a length and a gain`, () => {
      const dir = `public/${base}`;
      const m = JSON.parse(readFileSync(`${dir}setlist.json`, 'utf8')) as SetlistManifest;
      expect(m.tracks.length).toBeGreaterThan(1);
      expect(new Set(m.tracks.map((t) => t.id)).size).toBe(m.tracks.length);
      for (const t of m.tracks) {
        expect(existsSync(dir + t.file), t.file).toBe(true);
        expect(t.title.length).toBeGreaterThan(0);
        expect(t.length).toBeGreaterThan(20);
        expect(Math.abs(t.gain)).toBeLessThan(18);
      }
    });
  }
});
