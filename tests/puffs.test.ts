import { describe, expect, it } from 'vitest';
import { maxPuffs, puffsAt, type Puff, type PuffSource } from '../src/client/render/puffs';

const stack: PuffSource = { x: 100, y: 600, z: -40, kind: 'smoke' };
const pour: PuffSource = { x: 0, y: 50, z: 0, kind: 'steam' };

const at = (src: PuffSource, t: number, seed = 7) => {
  const out: Puff[] = [];
  puffsAt(src, seed, t, out);
  return out;
};

describe('drawn smoke and steam puffs', () => {
  it('follow from the time alone', () => {
    expect(at(stack, 42.5)).toEqual(at(stack, 42.5));
    expect(at(stack, 42.5, 8)).not.toEqual(at(stack, 42.5, 7));
  });

  it('keep a full stream going, never more than there is room for', () => {
    for (const src of [stack, pour]) {
      let least = Infinity;
      for (let t = 0; t < 60; t += 0.37) {
        const n = at(src, t).length;
        expect(n).toBeLessThanOrEqual(maxPuffs(src.kind));
        least = Math.min(least, n);
      }
      // Already full at the start of a race, and never thinning out.
      expect(least).toBeGreaterThan(maxPuffs(src.kind) * 0.5);
    }
  });

  it('climb and swell from the source, lit by the fire only near it', () => {
    const puffs = at(stack, 30);
    for (const p of puffs) {
      expect(p.y).toBeGreaterThan(stack.y);
      expect(p.cell).toBeGreaterThanOrEqual(0);
      expect(p.cell).toBeLessThan(6);
      expect(p.glow).toBeGreaterThanOrEqual(0);
      expect(p.glow).toBeLessThanOrEqual(1);
    }
    const low = puffs.reduce((a, b) => (b.y < a.y ? b : a));
    const high = puffs.reduce((a, b) => (b.y > a.y ? b : a));
    expect(high.y - stack.y).toBeGreaterThan(80);
    expect(low.glow).toBeGreaterThan(0.5);
    expect(high.glow).toBeLessThan(0.05);
  });

  it('move a little from one drawing to the next, not jump', () => {
    const a = at(stack, 20);
    const b = at(stack, 20 + 1 / 12);
    // The same puffs, matched by being nearest: none moves more than a few units.
    for (const p of b) {
      const d = Math.min(...a.map((q) => Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z)));
      expect(d).toBeLessThan(25);
    }
  });
});
