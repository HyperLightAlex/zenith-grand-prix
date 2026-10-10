// Track geometry.
//
// A track is a closed centripetal Catmull-Rom spline through 3D control
// points, resampled at a uniform spacing. Everything in the simulation lives
// in "track coordinates":
//
//   s  distance along the centreline, in units (0 at the start line)
//   d  lateral offset from the centreline, positive to the right
//
// The simulation only needs curvature, width and the charge strips. The
// renderer uses the same samples to turn (s, d, height) into world space, so
// the two can never disagree about where the road is.

import { clamp } from './math';

export interface StripDef {
  /** Start of the strip as a fraction of the lap (0..1). */
  at: number;
  /** Length in units. */
  len: number;
  /** Lateral centre of the strip. */
  d: number;
  /** Half width of the strip. */
  halfW: number;
}

/** One piece of the plan: a straight, or an arc (positive angle turns right). */
export type Segment = { straight: number } | { arc: [radius: number, degrees: number] };

export interface TrackDef {
  id: string;
  name: string;
  /** Lap length in units. The plan is scaled to hit it exactly. */
  length: number;
  halfWidth: number;
  /**
   * The plan, driven in order from the start line. Arc angles must add up to
   * 360 degrees. Forward at the start is -z and right is +x.
   */
  segments: Segment[];
  /**
   * Indices of two straights (not parallel) whose lengths the builder may
   * change so the loop closes exactly.
   */
  closeWith: [number, number];
  /** Height keys as [fraction of lap, height]. Linear, then smoothed. */
  heights: Array<[number, number]>;
  strips: StripDef[];
  /** Radians of bank per unit of curvature, and the cap. */
  bankGain: number;
  maxBank: number;
}

export interface Strip {
  s0: number;
  s1: number;
  d: number;
  halfW: number;
}

export interface Track {
  def: TrackDef;
  length: number;
  halfWidth: number;
  /** Number of samples and the spacing between them. */
  n: number;
  ds: number;
  /** Centreline position. */
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  /** Unit tangent (driving direction). */
  tx: Float32Array;
  ty: Float32Array;
  tz: Float32Array;
  /** Unit right vector, banked. */
  rx: Float32Array;
  ry: Float32Array;
  rz: Float32Array;
  /** Unit up vector, banked. */
  ux: Float32Array;
  uy: Float32Array;
  uz: Float32Array;
  /** Signed curvature in 1/units. Positive bends to the right. */
  kappa: Float32Array;
  /** Bank angle in radians. Positive drops the right-hand side. */
  bank: Float32Array;
  /** Suggested lateral offset for AI pilots (a simple racing line). */
  line: Float32Array;
  /** Largest |curvature| over the next ~200 units, for AI braking. */
  kappaAhead: Float32Array;
  strips: Strip[];
}

type V3 = [number, number, number];

/** Walk the plan and return a dense polyline in the x/z plane (y = 0). */
function walkPlan(segments: Segment[], step: number): { poly: V3[]; end: V3; endYaw: number } {
  let x = 0;
  let z = 0;
  let yaw = 0; // 0 faces -z, grows turning right
  const poly: V3[] = [];
  for (const seg of segments) {
    if ('straight' in seg) {
      const len = seg.straight;
      const steps = Math.max(1, Math.round(len / step));
      const fx = Math.sin(yaw);
      const fz = -Math.cos(yaw);
      for (let i = 0; i < steps; i++) {
        poly.push([x + (fx * len * i) / steps, 0, z + (fz * len * i) / steps]);
      }
      x += fx * len;
      z += fz * len;
    } else {
      const [radius, deg] = seg.arc;
      const ang = (deg * Math.PI) / 180;
      const dir = ang >= 0 ? 1 : -1;
      // Centre of the arc sits to the right (dir = 1) or left of the heading.
      const cx = x + Math.cos(yaw) * radius * dir;
      const cz = z + Math.sin(yaw) * radius * dir;
      const steps = Math.max(2, Math.round((radius * Math.abs(ang)) / step));
      for (let i = 0; i < steps; i++) {
        const a = yaw + (ang * i) / steps;
        poly.push([cx - Math.cos(a) * radius * dir, 0, cz - Math.sin(a) * radius * dir]);
      }
      yaw += ang;
      x = cx - Math.cos(yaw) * radius * dir;
      z = cz - Math.sin(yaw) * radius * dir;
    }
  }
  return { poly, end: [x, 0, z], endYaw: yaw };
}

/** Heading of each segment's start, for the closure solve. */
function headingAt(segments: Segment[], index: number): number {
  let yaw = 0;
  for (let i = 0; i < index; i++) {
    const seg = segments[i];
    if ('arc' in seg) yaw += (seg.arc[1] * Math.PI) / 180;
  }
  return yaw;
}

/** Lengthen or shorten two straights so the plan ends where it began. */
function closePlan(def: TrackDef): Segment[] {
  const segs: Segment[] = def.segments.map((s) => ('straight' in s ? { straight: s.straight } : { arc: [s.arc[0], s.arc[1]] }));
  const total = segs.reduce((a, s) => a + ('arc' in s ? s.arc[1] : 0), 0);
  if (Math.abs(total - 360) > 1e-6) throw new Error(`track ${def.id}: arcs add up to ${total}, not 360`);
  const [ia, ib] = def.closeWith;
  const sa = segs[ia];
  const sb = segs[ib];
  if (!('straight' in sa) || !('straight' in sb)) throw new Error('closeWith must name straights');
  const { end } = walkPlan(segs, 4);
  const ya = headingAt(segs, ia);
  const yb = headingAt(segs, ib);
  // Solve a*fa + b*fb = -end for the two length changes.
  const ax = Math.sin(ya);
  const az = -Math.cos(ya);
  const bx = Math.sin(yb);
  const bz = -Math.cos(yb);
  const det = ax * bz - az * bx;
  if (Math.abs(det) < 0.05) throw new Error('closeWith straights are too close to parallel');
  const da = (-end[0] * bz + end[2] * bx) / det;
  const db = (-ax * end[2] + az * end[0]) / det;
  sa.straight += da;
  sb.straight += db;
  if (sa.straight < 40 || sb.straight < 40) {
    throw new Error(`track ${def.id}: closing the loop needs straights of ${sa.straight.toFixed(0)} and ${sb.straight.toFixed(0)}`);
  }
  return segs;
}

function polylineLength(poly: V3[]): number {
  let len = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    len += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return len;
}

function smoothPoly(poly: V3[], radius: number, passes: number): V3[] {
  const n = poly.length;
  let a = poly;
  for (let p = 0; p < passes; p++) {
    const b: V3[] = new Array(n);
    for (let i = 0; i < n; i++) {
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let k = -radius; k <= radius; k++) {
        const q = a[(i + k + n * 8) % n];
        sx += q[0];
        sy += q[1];
        sz += q[2];
      }
      const w = radius * 2 + 1;
      b[i] = [sx / w, sy / w, sz / w];
    }
    a = b;
  }
  return a;
}

function heightAt(keys: Array<[number, number]>, f: number): number {
  const n = keys.length;
  for (let i = 0; i < n; i++) {
    const a = keys[i];
    const b = keys[(i + 1) % n];
    const fa = a[0];
    const fb = i === n - 1 ? b[0] + 1 : b[0];
    const ff = f < keys[0][0] ? f + 1 : f;
    if (ff >= fa && ff <= fb) {
      const t = fb > fa ? (ff - fa) / (fb - fa) : 0;
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return keys[0][1];
}

function smoothRing(src: Float32Array, radius: number, passes = 1): Float32Array {
  const n = src.length;
  let a = src;
  for (let p = 0; p < passes; p++) {
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += a[(i + k + n * 8) % n];
      b[i] = sum / (radius * 2 + 1);
    }
    a = b;
  }
  return a;
}

export function buildTrack(def: TrackDef): Track {
  // 1. Walk the plan, close the loop, round off the joins between straights
  //    and arcs, scale to the target lap length, then add height.
  const closed = closePlan(def);
  let dense = walkPlan(closed, 2).poly;
  dense = smoothPoly(dense, 24, 2);
  for (let iter = 0; iter < 4; iter++) {
    const k = def.length / polylineLength(dense);
    dense = dense.map((p) => [p[0] * k, p[1], p[2] * k]);
    // Heights by fraction of plan length, then smoothed into hills.
    const m = dense.length;
    let h: V3[] = dense.map((p, i) => [0, heightAt(def.heights, i / m), 0]);
    h = smoothPoly(h, 90, 2);
    dense = dense.map((p, i) => [p[0], h[i][1], p[2]]);
  }
  const total = polylineLength(dense);

  // 2. Resample at a uniform spacing.
  const n = Math.round(def.length / 4);
  const ds = total / n;
  const px = new Float32Array(n);
  const py = new Float32Array(n);
  const pz = new Float32Array(n);
  {
    let seg = 0;
    let segStart = 0;
    let segLen = Math.hypot(
      dense[1][0] - dense[0][0],
      dense[1][1] - dense[0][1],
      dense[1][2] - dense[0][2],
    );
    for (let i = 0; i < n; i++) {
      const target = i * ds;
      while (segStart + segLen < target && seg < dense.length - 1) {
        segStart += segLen;
        seg++;
        const a = dense[seg];
        const b = dense[(seg + 1) % dense.length];
        segLen = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      }
      const a = dense[seg];
      const b = dense[(seg + 1) % dense.length];
      const f = segLen > 0 ? (target - segStart) / segLen : 0;
      px[i] = a[0] + (b[0] - a[0]) * f;
      py[i] = a[1] + (b[1] - a[1]) * f;
      pz[i] = a[2] + (b[2] - a[2]) * f;
    }
  }

  // 3. Tangents and signed curvature in plan view.
  const tx = new Float32Array(n);
  const ty = new Float32Array(n);
  const tz = new Float32Array(n);
  const yaw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    let x = px[b] - px[a];
    let y = py[b] - py[a];
    let z = pz[b] - pz[a];
    const l = Math.hypot(x, y, z) || 1;
    x /= l;
    y /= l;
    z /= l;
    tx[i] = x;
    ty[i] = y;
    tz[i] = z;
    // Yaw grows when turning right (forward is -z, right is +x).
    yaw[i] = Math.atan2(x, -z);
  }
  let kappa: Float32Array = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n;
    const b = (i + 1) % n;
    let dy = yaw[b] - yaw[a];
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    kappa[i] = dy / (2 * ds);
  }
  kappa = smoothRing(kappa, 3, 2);

  // 4. Banking follows curvature, smoothed so it rolls in gently.
  const bankRaw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    bankRaw[i] = clamp(kappa[i] * def.bankGain, -def.maxBank, def.maxBank);
  }
  const bank = smoothRing(bankRaw, 14, 2);

  // 5. Frames.
  const rx = new Float32Array(n);
  const ry = new Float32Array(n);
  const rz = new Float32Array(n);
  const ux = new Float32Array(n);
  const uy = new Float32Array(n);
  const uz = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // Flat normal: world up with the tangent component removed.
    const dot = ty[i];
    let nx = -dot * tx[i];
    let ny = 1 - dot * ty[i];
    let nz = -dot * tz[i];
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    // Flat right = T x N.
    const fx = ty[i] * nz - tz[i] * ny;
    const fy = tz[i] * nx - tx[i] * nz;
    const fz = tx[i] * ny - ty[i] * nx;
    const c = Math.cos(bank[i]);
    const s = Math.sin(bank[i]);
    rx[i] = fx * c - nx * s;
    ry[i] = fy * c - ny * s;
    rz[i] = fz * c - nz * s;
    ux[i] = nx * c + fx * s;
    uy[i] = ny * c + fy * s;
    uz[i] = nz * c + fz * s;
  }

  // 6. AI helpers: a racing line that drifts to the inside of upcoming
  //    corners, and the sharpest curvature coming up for braking.
  const wide = smoothRing(kappa, 36, 2);
  const line = new Float32Array(n);
  const lead = 14; // samples of anticipation
  const maxOff = def.halfWidth - 7;
  for (let i = 0; i < n; i++) {
    line[i] = clamp(wide[(i + lead) % n] * 7000, -maxOff, maxOff);
  }
  const kappaAhead = new Float32Array(n);
  const look = Math.round(220 / ds);
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let k = 0; k < look; k += 2) m = Math.max(m, Math.abs(kappa[(i + k) % n]));
    kappaAhead[i] = m;
  }

  const strips: Strip[] = def.strips.map((sd) => ({
    s0: sd.at * total,
    s1: sd.at * total + sd.len,
    d: sd.d,
    halfW: sd.halfW,
  }));

  return {
    def,
    length: total,
    halfWidth: def.halfWidth,
    n,
    ds,
    px,
    py,
    pz,
    tx,
    ty,
    tz,
    rx,
    ry,
    rz,
    ux,
    uy,
    uz,
    kappa,
    bank,
    line,
    kappaAhead,
    strips,
  };
}

/** Wrap a distance into [0, length). */
export function wrapS(track: Track, s: number): number {
  const L = track.length;
  s = s % L;
  if (s < 0) s += L;
  // A hair behind the line, s + L rounds up to L itself.
  return s >= L ? 0 : s;
}

/** Shortest signed distance along the track from b to a (a - b), wrapped. */
export function deltaS(track: Track, a: number, b: number): number {
  const L = track.length;
  let d = (a - b) % L;
  if (d > L / 2) d -= L;
  else if (d < -L / 2) d += L;
  return d;
}

function sampleArray(track: Track, arr: Float32Array, s: number): number {
  const f = wrapS(track, s) / track.ds;
  const i = Math.floor(f) % track.n;
  const j = (i + 1) % track.n;
  const t = f - Math.floor(f);
  return arr[i] + (arr[j] - arr[i]) * t;
}

export function kappaAt(track: Track, s: number): number {
  return sampleArray(track, track.kappa, s);
}

export function lineAt(track: Track, s: number): number {
  return sampleArray(track, track.line, s);
}

export function kappaAheadAt(track: Track, s: number): number {
  return track.kappaAhead[Math.floor(wrapS(track, s) / track.ds) % track.n];
}

export function bankAt(track: Track, s: number): number {
  return sampleArray(track, track.bank, s);
}

/** Is the point (s, d) on a charge strip? */
export function onStrip(track: Track, s: number, d: number): boolean {
  const ws = wrapS(track, s);
  for (let i = 0; i < track.strips.length; i++) {
    const st = track.strips[i];
    if (Math.abs(d - st.d) > st.halfW) continue;
    if (ws >= st.s0 && ws <= st.s1) return true;
    // A strip may straddle the start line.
    if (st.s1 > track.length && ws <= st.s1 - track.length) return true;
  }
  return false;
}

export interface Frame {
  px: number;
  py: number;
  pz: number;
  tx: number;
  ty: number;
  tz: number;
  rx: number;
  ry: number;
  rz: number;
  ux: number;
  uy: number;
  uz: number;
}

export function makeFrame(): Frame {
  return { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: -1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0 };
}

/** Interpolated centreline frame at distance s. */
export function frameAt(track: Track, s: number, out: Frame): Frame {
  const f = wrapS(track, s) / track.ds;
  const i = Math.floor(f) % track.n;
  const j = (i + 1) % track.n;
  const t = f - Math.floor(f);
  const u = 1 - t;
  out.px = track.px[i] * u + track.px[j] * t;
  out.py = track.py[i] * u + track.py[j] * t;
  out.pz = track.pz[i] * u + track.pz[j] * t;
  out.tx = track.tx[i] * u + track.tx[j] * t;
  out.ty = track.ty[i] * u + track.ty[j] * t;
  out.tz = track.tz[i] * u + track.tz[j] * t;
  out.rx = track.rx[i] * u + track.rx[j] * t;
  out.ry = track.ry[i] * u + track.ry[j] * t;
  out.rz = track.rz[i] * u + track.rz[j] * t;
  out.ux = track.ux[i] * u + track.ux[j] * t;
  out.uy = track.uy[i] * u + track.uy[j] * t;
  out.uz = track.uz[i] * u + track.uz[j] * t;
  return out;
}
