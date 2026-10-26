// The space round the road that scenery must leave empty: the road's own slab
// and barriers, the mechs on it and the chase camera behind them. Used to fit
// the fallen titan of Titan's Rest to the road (the exports for Blender, the
// check of its model, the placeholder titan). Everything is measured in the
// road's own frame at each sample, so it follows the road through loops,
// rolls and corkscrews; a fork's two routes each get their own box, moved
// across and up as the track draws them.
import type * as THREE from 'three';
import type { Track } from '../../../sim/track';

/** How far the space reaches past the road's edge, above its deck and below it. */
export const KEEP_OUT = {
  /** Past the road's edge: the barrier (2.3) and a margin. */
  side: 3.8,
  /** Above the deck: a mech (8.8 tall), the chase camera over it, and room to jump. */
  up: 18,
  /** Below the deck: the slab under the road (6.2) and a margin. */
  down: 6.5,
  /** Above the deck, the sky that should stay open except where a part is meant to pass over (a soft limit). */
  sky: 40,
} as const;

/** One box in a sample's road frame: across (d, right positive) and up (h). */
export interface KeepBox {
  d0: number;
  d1: number;
  h0: number;
  h1: number;
}

/**
 * The boxes at sample `i`: one for plain road, one for each route through a
 * fork. `down` is how far under the deck counts (KEEP_OUT.down; the scenery
 * check takes only a sliver under it, as ground may lie against the slab).
 */
export function keepBoxes(track: Track, i: number, up: number = KEEP_OUT.up, down: number = KEEP_OUT.down): KeepBox[] {
  const hw = track.hw[i] + KEEP_OUT.side;
  const sL = track.shiftL[i], rL = track.riseL[i], sR = track.shiftR[i], rR = track.riseR[i];
  if (track.median[i] < 0.01 && sL === 0 && sR === 0 && rL === 0 && rR === 0) {
    return [{ d0: -hw, d1: hw, h0: -down, h1: up }];
  }
  // Each route from its outer edge to the back of the wall down the middle
  // (its inner edge, the median, less the wall and a margin, as past each
  // edge); as wide again as the route moves across in half a sample either
  // way, for the road between this sample and the next as a route parts.
  const m = track.median[i] - KEEP_OUT.side;
  const a = (i - 1 + track.n) % track.n;
  const b = (i + 1) % track.n;
  const wL = Math.abs(track.shiftL[b] - track.shiftL[a]) / 4;
  const wR = Math.abs(track.shiftR[b] - track.shiftR[a]) / 4;
  return [
    { d0: -hw + sL - wL, d1: -m + sL + wL, h0: -down + rL, h1: up + rL },
    { d0: m + sR - wR, d1: hw + sR + wR, h0: -down + rR, h1: up + rR },
  ];
}

/**
 * A lookup of the samples near a point, for testing many points against the
 * road: each sample is listed in every cell its own space (to the sky, and a
 * sample along) can reach into, so a point need only look in its cell.
 */
export class RoadIndex {
  private cells = new Map<number, number[]>();
  private readonly cell = 24;
  /** How far each sample's space reaches from its centreline (to the sky), and a sample along. */
  private readonly reachOf: Float32Array;
  /** The farthest any sample's space reaches. */
  readonly reach: number;
  constructor(readonly track: Track) {
    let reach = 0;
    this.reachOf = new Float32Array(track.n);
    for (let i = 0; i < track.n; i++) {
      let r = 0;
      for (const b of keepBoxes(track, i, KEEP_OUT.sky)) r = Math.max(r, Math.hypot(Math.max(-b.d0, b.d1), Math.max(-b.h0, b.h1)));
      r += track.ds;
      this.reachOf[i] = r;
      reach = Math.max(reach, r);
      const c = this.cell;
      for (let a = Math.floor((track.px[i] - r) / c); a <= Math.floor((track.px[i] + r) / c); a++) {
        for (let b = Math.floor((track.pz[i] - r) / c); b <= Math.floor((track.pz[i] + r) / c); b++) {
          // Only cells the disc reaches.
          const dx = Math.max(a * c - track.px[i], 0, track.px[i] - (a + 1) * c);
          const dz = Math.max(b * c - track.pz[i], 0, track.pz[i] - (b + 1) * c);
          if (dx * dx + dz * dz > r * r) continue;
          const k = (a + 4096) * 8192 + (b + 4096);
          let list = this.cells.get(k);
          if (!list) this.cells.set(k, (list = []));
          list.push(i);
        }
      }
    }
    this.reach = reach;
  }
  /** The samples whose space could reach (x, z) in plan. */
  near(x: number, z: number, out: number[] = []): number[] {
    out.length = 0;
    const list = this.cells.get((Math.floor(x / this.cell) + 4096) * 8192 + (Math.floor(z / this.cell) + 4096));
    if (list) for (const i of list) out.push(i);
    return out;
  }
  /** Whether any sample could reach into the box (in plan x0..x1, z0..z1, up y0..y1). */
  anyNear(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): boolean {
    const t = this.track;
    for (let a = Math.floor(x0 / this.cell); a <= Math.floor(x1 / this.cell); a++) {
      for (let b = Math.floor(z0 / this.cell); b <= Math.floor(z1 / this.cell); b++) {
        const list = this.cells.get((a + 4096) * 8192 + (b + 4096));
        if (!list) continue;
        for (const i of list) {
          const r = this.reachOf[i];
          if (t.py[i] + r >= y0 && t.py[i] - r <= y1) return true;
        }
      }
    }
    return false;
  }
  /**
   * Where a point is in the space round the road: the sample it is in, or -1.
   * `up` is how far above the deck counts (KEEP_OUT.up, or KEEP_OUT.sky for the soft limit), `down` how far under it.
   */
  hit(x: number, y: number, z: number, up: number = KEEP_OUT.up, scratch: number[] = [], down: number = KEEP_OUT.down): number {
    const t = this.track;
    // Each sample owns a slab along the road a sample either way, so the slabs overlap and leave no gaps on the outside of a bend.
    const half = t.ds;
    for (const i of this.near(x, z, scratch)) {
      const vx = x - t.px[i], vy = y - t.py[i], vz = z - t.pz[i];
      if (vy > this.reachOf[i] || vy < -this.reachOf[i]) continue;
      const along = vx * t.tx[i] + vy * t.ty[i] + vz * t.tz[i];
      if (along < -half || along > half) continue;
      const d = vx * t.rx[i] + vy * t.ry[i] + vz * t.rz[i];
      const h = vx * t.ux[i] + vy * t.uy[i] + vz * t.uz[i];
      // keepBoxes(t, i, up, down), without making them.
      const hw = t.hw[i] + KEEP_OUT.side;
      const sL = t.shiftL[i], rL = t.riseL[i], sR = t.shiftR[i], rR = t.riseR[i];
      if (t.median[i] < 0.01 && sL === 0 && sR === 0 && rL === 0 && rR === 0) {
        if (d >= -hw && d <= hw && h >= -down && h <= up) return i;
        continue;
      }
      const m = t.median[i] - KEEP_OUT.side;
      if (d >= -hw + sL && d <= -m + sL && h >= -down + rL && h <= up + rL) return i;
      if (d >= m + sR && d <= hw + sR && h >= -down + rR && h <= up + rR) return i;
    }
    return -1;
  }
}

/**
 * Whether any of a geometry (world space, as built) reaches into the space
 * round the road: its vertices and points across each triangle about `step`
 * apart. Ground may lie against the slab under the deck, not within `down`
 * of its top. For scenery placed at random: a piece that would stand in the
 * road is not placed.
 */
export function inRoadSpace(index: RoadIndex, g: THREE.BufferGeometry, step = 3, up: number = KEEP_OUT.up, down = 0.5): boolean {
  if (g.index) throw new Error('inRoadSpace takes a non-indexed geometry');
  const p = g.attributes.position.array;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let k = 0; k + 2 < p.length; k += 3) {
    x0 = Math.min(x0, p[k]); x1 = Math.max(x1, p[k]);
    y0 = Math.min(y0, p[k + 1]); y1 = Math.max(y1, p[k + 1]);
    z0 = Math.min(z0, p[k + 2]); z1 = Math.max(z1, p[k + 2]);
  }
  if (!index.anyNear(x0, z0, x1, z1, y0, y1)) return false;
  const scratch: number[] = [];
  for (let k = 0; k + 8 < p.length; k += 9) if (triangleInRoad(index, p, k, step, up, down, scratch)) return true;
  return false;
}

/** Whether the triangle at `p[k..k+8]` reaches into the space round the road: its corners and points across it about `step` apart. */
export function triangleInRoad(index: RoadIndex, p: ArrayLike<number>, k: number, step: number, up: number, down: number, scratch: number[] = []): boolean {
  const ax = p[k], ay = p[k + 1], az = p[k + 2];
  const bx = p[k + 3] - ax, by = p[k + 4] - ay, bz = p[k + 5] - az;
  const cx = p[k + 6] - ax, cy = p[k + 7] - ay, cz = p[k + 8] - az;
  const longest = Math.max(Math.hypot(bx, by, bz), Math.hypot(cx, cy, cz), Math.hypot(cx - bx, cy - by, cz - bz));
  const n = Math.max(1, Math.min(200, Math.ceil(longest / step)));
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n - i; j++) {
      const u = i / n, v = j / n;
      if (index.hit(ax + bx * u + cx * v, ay + by * u + cy * v, az + bz * u + cz * v, up, scratch, down) >= 0) return true;
    }
  }
  return false;
}
