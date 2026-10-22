// The open-pit mine Neon Crucible is built in and over, worked out from the
// circuit itself: the Coil, the haul road climbing round the pit wall, is
// cut into the wall as its benches, so the wall is wherever the Coil is.
// Each turn of it stands on rock, a sheer face drops from its inside edge to
// the turn below (the floor, below the first), and the plateau round the pit
// starts outside the top turn. Both the scenery (world.ts) and the road's
// supports (trackMesh.ts) ask it where the ground is.
import { pieceStarts, type CircuitDef } from '../../sim/circuit';
import type { Track } from '../../sim/track';

const TAU = Math.PI * 2;

export interface Pit {
  /** The pit's middle, in plan. */
  cx: number;
  cz: number;
  /** The plateau round it, and the molten floor. */
  rim: number;
  floor: number;
  /** The Coil's samples, in order: index into the track, and angle round the middle from where it starts (radians, increasing). */
  idx: number[];
  phi: number[];
  /** How far round the Coil goes, in all (radians). */
  total: number;
  /** Radius of the floor, out to under the first turn. */
  floorRadius: number;
  /** The sample on the Coil at angle `phi` (fractional, between samples), or -1 off either end. */
  at(phi: number): number;
  /** The angle round the middle of a point, measured the Coil's way from its start, 0..2pi. */
  angleOf(x: number, z: number): number;
  /** Height of the ground at a point: the plateau, a bench (the road on it), or the floor. */
  groundAt(x: number, z: number): number;
}

const cache = new WeakMap<Track, Pit | null>();

/** The pit, if this circuit is built in one (it has a Coil); null otherwise. */
export function pitOf(track: Track): Pit | null {
  if (cache.has(track)) return cache.get(track)!;
  const pit = findPit(track);
  cache.set(track, pit);
  return pit;
}

function findPit(track: Track): Pit | null {
  const def = track.def as CircuitDef;
  if (!('pieces' in def)) return null;
  const starts = pieceStarts(def);
  const coil = def.pieces.map((p, i) => (p.name?.startsWith('the Coil') ? i : -1)).filter((i) => i >= 0);
  if (coil.length === 0) return null;
  const s0 = starts[coil[0]];
  const last = coil[coil.length - 1];
  const s1 = last + 1 < starts.length ? starts[last + 1] : track.length;
  const i0 = Math.ceil(s0 / track.ds);
  const i1 = Math.floor(s1 / track.ds);
  // The middle: where the Coil's curvature centres gather.
  let sx = 0;
  let sz = 0;
  let k = 0;
  for (let i = i0; i < i1; i++) {
    const kp = track.kappa[i];
    if (Math.abs(kp) < 1e-5) continue;
    const l = Math.hypot(track.rx[i], track.rz[i]) || 1;
    sx += track.px[i] + track.rx[i] / l / kp;
    sz += track.pz[i] + track.rz[i] / l / kp;
    k++;
  }
  if (k === 0) return null;
  const cx = sx / k;
  const cz = sz / k;
  // Angle round the middle, unwound, increasing.
  const idx: number[] = [];
  const raw: number[] = [];
  let prev = 0;
  let acc = 0;
  for (let i = i0; i < i1; i++) {
    const a = Math.atan2(track.pz[i] - cz, track.px[i] - cx);
    if (idx.length > 0) {
      let d = a - prev;
      d -= Math.round(d / TAU) * TAU;
      acc += d;
    }
    prev = a;
    idx.push(i);
    raw.push(acc);
  }
  const dir = raw[raw.length - 1] >= 0 ? 1 : -1;
  const phi = raw.map((v) => v * dir);
  const total = phi[phi.length - 1];
  const a0 = Math.atan2(track.pz[i0] - cz, track.px[i0] - cx);
  const n = idx.length;
  const end = idx[n - 1];
  const rim = track.py[end] - 8;
  const floor = track.py[idx[0]] - 3;
  const radius = (i: number) => Math.hypot(track.px[i] - cx, track.pz[i] - cz);
  let floorRadius = 1e9;
  for (let q = 0; q < n && phi[q] < TAU; q++) floorRadius = Math.min(floorRadius, radius(idx[q]));
  floorRadius += 4;

  const at = (p: number): number => {
    if (p < 0 || p > total) return -1;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (phi[mid] <= p) lo = mid;
      else hi = mid;
    }
    const span = phi[hi] - phi[lo];
    return lo + (span > 1e-9 ? (p - phi[lo]) / span : 0);
  };
  const angleOf = (x: number, z: number): number => {
    const a = (Math.atan2(z - cz, x - cx) - a0) * dir;
    return ((a % TAU) + TAU) % TAU;
  };
  const lerp = (arr: Float32Array, f: number) => {
    const q = Math.floor(f);
    const t = f - q;
    const a = idx[q];
    const b = idx[Math.min(q + 1, n - 1)];
    return arr[a] * (1 - t) + arr[b] * t;
  };
  const groundAt = (x: number, z: number): number => {
    const rho = Math.hypot(x - cx, z - cz);
    const th = angleOf(x, z);
    // Each turn of the Coil at this angle, from the bottom up: the ground is
    // the outermost one whose inside edge is inside this point.
    let y = floor;
    let top = -1;
    for (let p = th; p <= total; p += TAU) {
      const f = at(p);
      if (f < 0) continue;
      top = f;
      const r = Math.hypot(lerp(track.px, f) - cx, lerp(track.pz, f) - cz);
      if (rho >= r - lerp(track.hw, f)) y = lerp(track.py, f);
    }
    if (top >= 0) {
      const r = Math.hypot(lerp(track.px, top) - cx, lerp(track.pz, top) - cz);
      if (rho > r + lerp(track.hw, top) + 2) return rim;
    } else if (rho > floorRadius) return rim;
    return y;
  };
  return { cx, cz, rim, floor, idx, phi, total, floorRadius, at, angleOf, groundAt };
}
