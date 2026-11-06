import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The studio card in index.html, as tools/brand/layers.py writes it: the
// pictures, the pen's two stretches and the drip's measurements agree.
const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const attr = (name: string): string => {
  const m = page.match(new RegExp(`\\s${name}="([^"]*)"`));
  if (!m) throw new Error(`index.html has no ${name}`);
  return m[1];
};
const points = (d: string): number[][] => d.replace(/^M/, '').split(' ').map((p) => p.split(',').map(Number));
const length = (pts: number[][]): number => pts.slice(1).reduce((t, p, i) => t + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

describe('the studio card', () => {
  it('carries its pictures in the page', () => {
    for (const name of ['ink1', 'ink2', 'dot', 'words']) {
      const m = page.match(new RegExp(`<img class="${name}" src="data:image/webp;base64,([A-Za-z0-9+/=]+)"`));
      expect(m, name).not.toBeNull();
      expect(m![1].length, name).toBeGreaterThan(1000);
    }
  });

  it("has a pen whose two stretches keep step along the whole line", () => {
    const total = Number(attr('data-length'));
    const width = Number(attr('data-width'));
    const from2 = Number(attr('data-from2'));
    const pen1 = points(attr('data-pen1'));
    const pen2 = points(attr('data-pen2'));
    expect(pen1.flat().every(Number.isFinite) && pen2.flat().every(Number.isFinite)).toBe(true);
    // The second starts half a stroke before the first ends, and runs to the end.
    expect(Math.abs(length(pen1) - (from2 + width / 2))).toBeLessThan(width / 10);
    expect(Math.abs(from2 + length(pen2) - total)).toBeLessThan(1);
    // A stroke wide enough to cover the line (some 80 wide in the logo's frame).
    expect(width).toBeGreaterThan(90);
    expect(width).toBeLessThan(160);
  });

  it('knows where the hook ends and the dot sits', () => {
    const [dx, dy, dr, bottom] = attr('data-drip').split(' ').map(Number);
    const tail = points('M' + attr('data-tail'));
    expect(tail.length).toBeGreaterThan(10);
    // The outline reaches down to the hook's bottom, and the dot hangs under it, clear of it.
    expect(Math.max(...tail.map(([, y]) => y))).toBeCloseTo(bottom, 1);
    expect(dy - dr).toBeGreaterThan(bottom);
    expect(Math.abs(dx - tail.filter(([, y]) => y > bottom - 1.5).reduce((t, [x], _, a) => t + x / a.length, 0))).toBeLessThan(dr / 2);
  });

  it('is read by the script under the names it is written with', () => {
    for (const name of ['length', 'width', 'from2', 'pen1', 'pen2', 'drip', 'tail']) expect(page).toContain(`dataset.${name}`);
  });
});
