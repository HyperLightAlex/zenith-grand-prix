import { describe, expect, it } from 'vitest';
import {
  MERIDIAN,
  bankAt,
  buildTrack,
  deltaS,
  frameAt,
  kappaAheadAt,
  kappaAt,
  lineAt,
  makeFrame,
  onStrip,
  wrapS,
} from '../src/sim/index';
import type { TrackDef } from '../src/sim/index';
import { TRACK } from './helpers';

const T = TRACK;
const L = T.length;

describe('track geometry', () => {
  it('has the lap length of its definition', () => {
    expect(L).toBeCloseTo(MERIDIAN.length, 5);
    expect(T.halfWidth).toBe(MERIDIAN.halfWidth);
    expect(T.n).toBe(Math.round(MERIDIAN.length / 4));
    expect(T.ds * T.n).toBeCloseTo(L, 9);
    for (const arr of [T.px, T.py, T.pz, T.tx, T.ty, T.tz, T.rx, T.ry, T.rz, T.ux, T.uy, T.uz, T.kappa, T.bank, T.line, T.kappaAhead]) {
      expect(arr.length).toBe(T.n);
    }
  });

  it('holds only finite numbers', () => {
    for (const arr of [T.px, T.py, T.pz, T.tx, T.ty, T.tz, T.rx, T.ry, T.rz, T.ux, T.uy, T.uz, T.kappa, T.bank, T.line, T.kappaAhead]) {
      for (let i = 0; i < arr.length; i++) {
        if (!Number.isFinite(arr[i])) throw new Error(`non-finite sample at ${i}`);
      }
    }
  });

  it('closes: samples are evenly spaced all the way round, seam included', () => {
    let sum = 0;
    let worst = 0;
    for (let i = 0; i < T.n; i++) {
      const j = (i + 1) % T.n;
      const step = Math.hypot(T.px[j] - T.px[i], T.py[j] - T.py[i], T.pz[j] - T.pz[i]);
      sum += step;
      worst = Math.max(worst, Math.abs(step - T.ds));
    }
    // Chords cut the corners a hair short of the arc length.
    expect(worst).toBeLessThan(T.ds * 0.001);
    expect(sum).toBeGreaterThan(L - 0.5);
    expect(sum).toBeLessThanOrEqual(L + 1e-6);
    // The seam itself: last sample to first.
    const seam = Math.hypot(T.px[0] - T.px[T.n - 1], T.py[0] - T.py[T.n - 1], T.pz[0] - T.pz[T.n - 1]);
    expect(seam).toBeCloseTo(T.ds, 3);
  });

  it('has unit tangents that turn smoothly, seam included', () => {
    let worst = 0;
    for (let i = 0; i < T.n; i++) {
      const j = (i + 1) % T.n;
      expect(Math.hypot(T.tx[i], T.ty[i], T.tz[i])).toBeCloseTo(1, 5);
      const dot = T.tx[i] * T.tx[j] + T.ty[i] * T.ty[j] + T.tz[i] * T.tz[j];
      worst = Math.max(worst, Math.acos(Math.min(1, dot)));
    }
    // 4 units of the tightest corner (the Harbour Hairpin, radius ~108) turn
    // about 0.037 rad.
    expect(worst).toBeLessThan(0.045);
    const seam = T.tx[0] * T.tx[T.n - 1] + T.ty[0] * T.ty[T.n - 1] + T.tz[0] * T.tz[T.n - 1];
    expect(Math.acos(Math.min(1, seam))).toBeLessThan(0.001);
  });

  it('tangents point from each sample to the next', () => {
    for (let i = 0; i < T.n; i += 7) {
      const j = (i + 1) % T.n;
      const dx = T.px[j] - T.px[i];
      const dy = T.py[j] - T.py[i];
      const dz = T.pz[j] - T.pz[i];
      const along = (dx * T.tx[i] + dy * T.ty[i] + dz * T.tz[i]) / Math.hypot(dx, dy, dz);
      expect(along).toBeGreaterThan(0.999);
    }
  });

  it('starts facing -z with +x on the right and +y up', () => {
    expect(T.tx[0]).toBeCloseTo(0, 5);
    expect(T.tz[0]).toBeCloseTo(-1, 5);
    expect(T.rx[0]).toBeCloseTo(1, 5);
    expect(T.uy[0]).toBeCloseTo(1, 5);
  });

  it('frames are orthonormal and right-handed', () => {
    for (let i = 0; i < T.n; i++) {
      const t = [T.tx[i], T.ty[i], T.tz[i]];
      const r = [T.rx[i], T.ry[i], T.rz[i]];
      const u = [T.ux[i], T.uy[i], T.uz[i]];
      const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const bad =
        Math.abs(dot(t, t) - 1) > 1e-5 ||
        Math.abs(dot(r, r) - 1) > 1e-5 ||
        Math.abs(dot(u, u) - 1) > 1e-5 ||
        Math.abs(dot(t, r)) > 1e-5 ||
        Math.abs(dot(t, u)) > 1e-5 ||
        Math.abs(dot(r, u)) > 1e-5;
      // right = tangent x up
      const cx = t[1] * u[2] - t[2] * u[1];
      const cy = t[2] * u[0] - t[0] * u[2];
      const cz = t[0] * u[1] - t[1] * u[0];
      const handed = Math.hypot(cx - r[0], cy - r[1], cz - r[2]) < 1e-5;
      if (bad || !handed) throw new Error(`frame ${i} is not orthonormal/right-handed`);
    }
  });

  it('keeps every corner wider than a 100 unit radius', () => {
    let maxK = 0;
    for (let i = 0; i < T.n; i++) maxK = Math.max(maxK, Math.abs(T.kappa[i]));
    expect(maxK).toBeGreaterThan(1 / 400); // there are real corners
    // The carving corners are tight on purpose; none is a kink.
    expect(1 / maxK).toBeGreaterThan(100);
  });

  it('turns through exactly one clockwise lap', () => {
    let turn = 0;
    for (let i = 0; i < T.n; i++) turn += T.kappa[i] * T.ds;
    expect(turn).toBeCloseTo(Math.PI * 2, 2);
  });

  it('curvature matches how fast the tangent actually turns', () => {
    // Plan-view yaw rate by central difference, compared against the table
    // (which is smoothed over a few samples, hence the tolerance).
    for (let i = 0; i < T.n; i += 5) {
      const a = (i - 1 + T.n) % T.n;
      const b = (i + 1) % T.n;
      let dy = Math.atan2(T.tx[b], -T.tz[b]) - Math.atan2(T.tx[a], -T.tz[a]);
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      expect(Math.abs(dy / (2 * T.ds) - T.kappa[i])).toBeLessThan(4e-4);
    }
  });

  it('is straight along the Grand Straight either side of the start line', () => {
    for (let s = -250; s <= 600; s += 25) expect(Math.abs(kappaAt(T, s))).toBeLessThan(1e-6);
  });

  it('banks into the corners and never past the cap', () => {
    let maxBank = 0;
    for (let i = 0; i < T.n; i++) {
      maxBank = Math.max(maxBank, Math.abs(T.bank[i]));
      // Where the road bends hard, the bank leans the same way.
      if (Math.abs(T.kappa[i]) > 0.003) expect(Math.sign(T.bank[i])).toBe(Math.sign(T.kappa[i]));
    }
    expect(maxBank).toBeLessThanOrEqual(MERIDIAN.maxBank + 1e-6);
    expect(maxBank).toBeGreaterThan(0.1);
  });

  it('keeps the AI racing line on the road and the look-ahead consistent', () => {
    for (let i = 0; i < T.n; i++) {
      expect(Math.abs(T.line[i])).toBeLessThanOrEqual(T.halfWidth - 7 + 1e-4);
      expect(T.kappaAhead[i]).toBeGreaterThanOrEqual(Math.abs(T.kappa[i]) - 1e-9);
    }
  });

  it('builds the same track every time', () => {
    const again = buildTrack(MERIDIAN);
    expect(again.length).toBe(T.length);
    for (const key of ['px', 'py', 'pz', 'tx', 'tz', 'rx', 'uy', 'kappa', 'bank', 'line', 'kappaAhead'] as const) {
      expect(Array.from(again[key])).toEqual(Array.from(T[key]));
    }
    expect(again.strips).toEqual(T.strips);
  });

  it('rejects plans that cannot close', () => {
    const open: TrackDef = { ...MERIDIAN, segments: MERIDIAN.segments.slice(0, -2) };
    expect(() => buildTrack(open)).toThrow(/360/);
    const badClose: TrackDef = { ...MERIDIAN, closeWith: [1, 11] };
    expect(() => buildTrack(badClose)).toThrow(/straights/);
    // Straights 0 and 16 are the two halves of the Grand Straight: parallel.
    const parallel: TrackDef = { ...MERIDIAN, closeWith: [0, 16] };
    expect(() => buildTrack(parallel)).toThrow(/parallel/);
  });
});

describe('wrapS and deltaS', () => {
  it('wrapS maps any distance into [0, length)', () => {
    expect(wrapS(T, 0)).toBe(0);
    expect(wrapS(T, 10)).toBe(10);
    expect(wrapS(T, L)).toBe(0);
    expect(wrapS(T, L + 10)).toBeCloseTo(10, 9);
    expect(wrapS(T, 3 * L + 10)).toBeCloseTo(10, 6);
    expect(wrapS(T, -10)).toBeCloseTo(L - 10, 9);
    expect(wrapS(T, -L - 10)).toBeCloseTo(L - 10, 6);
    for (const s of [-3 * L, -L - 1e-9, -L, -34, -1, -1e-6, 0, 1e-6, L - 1e-6, L, 2.5 * L, 1e7]) {
      const w = wrapS(T, s);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThan(L);
    }
  });

  it('wrapS never returns the lap length itself, even a hair behind the line', () => {
    // -1e-13 + L rounds to exactly L in floating point.
    for (const s of [-1e-13, -1e-15, -Number.MIN_VALUE]) {
      const w = wrapS(T, s);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThan(L);
    }
  });

  it('table lookups stay in range right at the seam', () => {
    for (const s of [-1e-13, L - 1e-9, L, 0, -0]) {
      expect(Number.isFinite(kappaAt(T, s))).toBe(true);
      expect(Number.isFinite(lineAt(T, s))).toBe(true);
      expect(Number.isFinite(bankAt(T, s))).toBe(true);
      expect(Number.isFinite(kappaAheadAt(T, s))).toBe(true);
      const f = frameAt(T, s, makeFrame());
      expect(Number.isFinite(f.px + f.py + f.pz + f.tx + f.ty + f.tz + f.rx + f.ry + f.rz + f.ux + f.uy + f.uz)).toBe(true);
    }
  });

  it('deltaS is the short way round, signed', () => {
    expect(deltaS(T, 30, 10)).toBe(20);
    expect(deltaS(T, 10, 30)).toBe(-20);
    // Across the start line, in both directions.
    expect(deltaS(T, 5, L - 5)).toBeCloseTo(10, 9);
    expect(deltaS(T, L - 5, 5)).toBeCloseTo(-10, 9);
    // The grid sits behind the line, at negative s.
    expect(deltaS(T, 5, -10)).toBeCloseTo(15, 9);
    // Unwrapped distances on different laps.
    expect(deltaS(T, 2 * L + 5, L - 5)).toBeCloseTo(10, 6);
    expect(deltaS(T, 5, 2 * L - 5)).toBeCloseTo(10, 6);
    expect(deltaS(T, 3 * L + 100, 100)).toBeCloseTo(0, 6);
  });

  it('deltaS never exceeds half a lap and is antisymmetric', () => {
    const samples = [-34, 0, 1, 250, L / 2 - 1, L / 2 + 1, L - 1, L + 77, 2 * L + 4000, 3 * L - 0.5];
    for (const a of samples) {
      for (const b of samples) {
        const d = deltaS(T, a, b);
        expect(Math.abs(d)).toBeLessThanOrEqual(L / 2 + 1e-9);
        // Antisymmetric, except exactly half a lap apart where both are valid.
        if (Math.abs(Math.abs(d) - L / 2) > 1e-6) expect(deltaS(T, b, a)).toBeCloseTo(-d, 6);
        // And it really is a - b, modulo whole laps.
        const laps = (a - b - d) / L;
        expect(Math.abs(laps - Math.round(laps))).toBeLessThan(1e-9);
      }
    }
  });
});

describe('frameAt', () => {
  it('returns the stored frame at a sample and blends between samples', () => {
    const f = makeFrame();
    frameAt(T, 100 * T.ds, f);
    expect(f.px).toBeCloseTo(T.px[100], 3);
    expect(f.pz).toBeCloseTo(T.pz[100], 3);
    frameAt(T, 100.5 * T.ds, f);
    expect(f.px).toBeCloseTo((T.px[100] + T.px[101]) / 2, 3);
    expect(f.pz).toBeCloseTo((T.pz[100] + T.pz[101]) / 2, 3);
  });

  it('is continuous across the start line and periodic over a lap', () => {
    const a = frameAt(T, L - 0.01, makeFrame());
    const b = frameAt(T, 0.01, makeFrame());
    expect(Math.hypot(a.px - b.px, a.py - b.py, a.pz - b.pz)).toBeLessThan(0.05);
    expect(a.tx * b.tx + a.ty * b.ty + a.tz * b.tz).toBeGreaterThan(0.9999);
    const c = frameAt(T, 1234.5, makeFrame());
    const d = frameAt(T, 1234.5 + 2 * L, makeFrame());
    expect(Math.hypot(c.px - d.px, c.py - d.py, c.pz - d.pz)).toBeLessThan(1e-3);
    const e = frameAt(T, 1234.5 - L, makeFrame());
    expect(Math.hypot(c.px - e.px, c.py - e.py, c.pz - e.pz)).toBeLessThan(1e-3);
  });

  it('stays close to orthonormal between samples', () => {
    const f = makeFrame();
    for (let s = 1; s < L; s += 37.3) {
      frameAt(T, s, f);
      expect(Math.hypot(f.tx, f.ty, f.tz)).toBeCloseTo(1, 3);
      expect(Math.hypot(f.rx, f.ry, f.rz)).toBeCloseTo(1, 3);
      expect(Math.abs(f.tx * f.rx + f.ty * f.ry + f.tz * f.rz)).toBeLessThan(1e-3);
    }
  });
});

describe('charge strips', () => {
  it('resolve from lap fractions to distances', () => {
    expect(T.strips.length).toBe(MERIDIAN.strips.length);
    T.strips.forEach((st, i) => {
      const def = MERIDIAN.strips[i];
      expect(st.s0).toBeCloseTo(def.at * L, 6);
      expect(st.s1 - st.s0).toBeCloseTo(def.len, 6);
      expect(st.d).toBe(def.d);
      expect(st.halfW).toBe(def.halfW);
      // On the road, and on this track none reaches the start line.
      expect(Math.abs(st.d) + st.halfW).toBeLessThanOrEqual(T.halfWidth);
      expect(st.s0).toBeGreaterThanOrEqual(0);
      expect(st.s1).toBeLessThan(L);
    });
  });

  it('onStrip is true on a strip and false around it', () => {
    for (const st of T.strips) {
      const mid = (st.s0 + st.s1) / 2;
      expect(onStrip(T, mid, st.d)).toBe(true);
      expect(onStrip(T, st.s0 + 0.01, st.d)).toBe(true);
      expect(onStrip(T, st.s1 - 0.01, st.d)).toBe(true);
      expect(onStrip(T, mid, st.d + st.halfW - 0.01)).toBe(true);
      expect(onStrip(T, mid, st.d - st.halfW + 0.01)).toBe(true);
      // Just off the sides and the ends.
      expect(onStrip(T, mid, st.d + st.halfW + 0.01)).toBe(false);
      expect(onStrip(T, mid, st.d - st.halfW - 0.01)).toBe(false);
      expect(onStrip(T, st.s0 - 0.5, st.d)).toBe(false);
      expect(onStrip(T, st.s1 + 0.5, st.d)).toBe(false);
    }
  });

  it('onStrip works on any lap and behind the start line', () => {
    const st = T.strips[0];
    const mid = (st.s0 + st.s1) / 2;
    expect(onStrip(T, mid + L, st.d)).toBe(true);
    expect(onStrip(T, mid + 2 * L, st.d)).toBe(true);
    expect(onStrip(T, mid - L, st.d)).toBe(true);
    // Nothing on the grid or at the line itself.
    for (const s of [-34, -22, -10, -1e-13, 0, 1, L, 2 * L]) {
      for (const d of [-20, -9, 0, 9, 20]) expect(onStrip(T, s, d)).toBe(false);
    }
  });

  it('a strip may straddle the start line', () => {
    const def: TrackDef = { ...MERIDIAN, strips: [{ at: 0.99, len: 200, d: 4, halfW: 5 }] };
    const t = buildTrack(def);
    const s0 = 0.99 * t.length; // 86.4 before the line, so 113.6 past it
    expect(t.strips[0].s1).toBeGreaterThan(t.length);
    expect(onStrip(t, s0 + 1, 4)).toBe(true);
    expect(onStrip(t, t.length - 1, 4)).toBe(true);
    expect(onStrip(t, 0, 4)).toBe(true);
    expect(onStrip(t, 50, 4)).toBe(true);
    expect(onStrip(t, 113, 4)).toBe(true);
    expect(onStrip(t, 114, 4)).toBe(false);
    expect(onStrip(t, s0 - 1, 4)).toBe(false);
    // Unwrapped and negative distances either side of the line.
    expect(onStrip(t, -1, 4)).toBe(true);
    expect(onStrip(t, -80, 4)).toBe(true);
    expect(onStrip(t, -90, 4)).toBe(false);
    expect(onStrip(t, 2 * t.length + 50, 4)).toBe(true);
    expect(onStrip(t, 50, 10)).toBe(false);
  });
});
