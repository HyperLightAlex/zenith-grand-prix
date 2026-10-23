// Ground that lies under the road: a flat top (Frostline's shelf and glacier)
// dug down wherever a road comes close to it, so the deck is never under the
// ground. A banked turn's low edge, close over a flat top, would otherwise go
// into it: the ground dips under the road's whole space (the deck across its
// width and the barrier past each edge, keepout.ts) and rises again beyond it
// as a bank of snow. And the top drawn to match: a grid, fine where it is
// dug and coarse where it is flat, cut to the outline.
import * as THREE from 'three';
import type { Track } from '../../sim/track';
import { keepBoxes, type KeepBox } from './titan/keepout';

/** How far under the deck the ground keeps, across the road's space. */
export const UNDER_DECK = 1.5;
/** How steeply the ground rises again beyond the road's space (1 in 2), from this far past it (a grid cell and more, so the drawn ground, straight between its vertices, keeps under the road's space too). */
const BANK = 0.5;
const FLAT_PAST = 9;
/** No dip deeper than this: a road further down is meant to stand clear of the ground (Frostline's climb in its slot). */
const DEEPEST = 18;
const CELL = 32;

interface Dip {
  i: number;
  boxes: KeepBox[];
  /** In plan: how far from the sample the dip reaches. */
  reach: number;
}

/** Where a flat top at `flatY` has to dip for the road, and how low it goes. */
export class Dips {
  private readonly cells = new Map<number, Dip[]>();
  readonly list: Dip[] = [];
  constructor(
    readonly track: Track,
    readonly flatY: number,
  ) {
    const t = track;
    for (let i = 0; i < t.n; i++) {
      // Only upright road lies over the ground (the bottom of a loop does; its sides and top do not).
      if (t.uy[i] < 0.7) continue;
      const boxes = keepBoxes(t, i, 0, 0);
      let low = Infinity;
      let far = 0;
      for (const b of boxes) {
        low = Math.min(low, t.py[i] + t.uy[i] * b.h0 + Math.min(t.ry[i] * b.d0, t.ry[i] * b.d1));
        far = Math.max(far, Math.abs(b.d0), Math.abs(b.d1));
      }
      const depth = flatY - (low - UNDER_DECK);
      if (depth <= 0 || depth > DEEPEST) continue;
      const dip: Dip = { i, boxes, reach: far * Math.hypot(t.rx[i], t.rz[i]) + FLAT_PAST + depth / BANK + t.ds };
      this.list.push(dip);
      const r = Math.ceil(dip.reach / CELL);
      const cx = Math.floor(t.px[i] / CELL);
      const cz = Math.floor(t.pz[i] / CELL);
      for (let a = -r; a <= r; a++) {
        for (let b = -r; b <= r; b++) {
          const k = this.key(cx + a, cz + b);
          let l = this.cells.get(k);
          if (!l) this.cells.set(k, (l = []));
          l.push(dip);
        }
      }
    }
  }
  private key(a: number, b: number): number {
    return (a + 4096) * 8192 + (b + 4096);
  }
  /** The ground's height at (x, z): the flat top, or lower where a road needs it. */
  at(x: number, z: number): number {
    const l = this.cells.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!l) return this.flatY;
    const t = this.track;
    let h = this.flatY;
    for (const { i, boxes } of l) {
      const vx = x - t.px[i];
      const vz = z - t.pz[i];
      const tl = Math.hypot(t.tx[i], t.tz[i]) || 1;
      const along = (vx * t.tx[i] + vz * t.tz[i]) / tl;
      if (along < -t.ds || along > t.ds) continue;
      const rl = Math.hypot(t.rx[i], t.rz[i]) || 1;
      const d = (vx * t.rx[i] + vz * t.rz[i]) / (rl * rl);
      for (const b of boxes) {
        const dc = Math.min(b.d1, Math.max(b.d0, d));
        const y = t.py[i] + t.ry[i] * dc + t.uy[i] * b.h0 - UNDER_DECK + Math.max(0, Math.abs(d - dc) * rl - FLAT_PAST) * BANK;
        if (y < h) h = y;
      }
    }
    return h;
  }
  /** Whether any dip reaches into the rectangle (grown by `pad`). */
  touches(x0: number, z0: number, x1: number, z1: number, pad: number): boolean {
    const t = this.track;
    for (const { i, reach } of this.list) {
      const r = reach + pad;
      const dx = Math.max(x0 - t.px[i], 0, t.px[i] - x1);
      const dz = Math.max(z0 - t.pz[i], 0, t.pz[i] - z1);
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }
}

/** Whether (x, z) is inside the outline. */
export function insideOutline(poly: ReadonlyArray<readonly [number, number]>, x: number, z: number): boolean {
  let inn = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inn = !inn;
  }
  return inn;
}

/** The part of a polygon inside an axis-aligned rectangle (Sutherland–Hodgman, the rectangle convex). */
function clipToRect(poly: Array<[number, number]>, x0: number, z0: number, x1: number, z1: number): Array<[number, number]> {
  let out = poly;
  const planes: Array<[(p: [number, number]) => number]> = [[(p) => p[0] - x0], [(p) => x1 - p[0]], [(p) => p[1] - z0], [(p) => z1 - p[1]]];
  for (const [side] of planes) {
    const input = out;
    out = [];
    for (let k = 0; k < input.length; k++) {
      const a = input[k];
      const b = input[(k + 1) % input.length];
      const sa = side(a);
      const sb = side(b);
      if (sa >= 0) out.push(a);
      if (sa >= 0 !== sb >= 0) {
        const f = sa / (sa - sb);
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      }
    }
    if (out.length < 3) return [];
  }
  return out;
}

/**
 * The top of an outline as a heightfield: `heightAt` at every vertex, the
 * grid `coarse` units square where `fine` says the ground is flat, `fineCell`
 * where it is not, cut to the outline at its edge. A coarse cell is fine if a
 * dip reaches into it at all, so a coarse cell's edges are all flat, and
 * where the two sizes meet no crack opens.
 */
export function topSurface(
  outline: ReadonlyArray<readonly [number, number]>,
  heightAt: (x: number, z: number) => number,
  fine: (x0: number, z0: number, x1: number, z1: number) => boolean,
  coarse = 48,
  fineCell = 6,
): THREE.BufferGeometry {
  const poly = outline.map(([x, z]) => [x, z] as [number, number]);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of poly) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const nx = Math.ceil((maxX - minX) / coarse);
  const nz = Math.ceil((maxZ - minZ) / coarse);
  // Which coarse cells the outline's edges cross.
  const crossed = new Set<number>();
  for (let k = 0; k < poly.length; k++) {
    const [ax, az] = poly[k];
    const [bx, bz] = poly[(k + 1) % poly.length];
    const steps = Math.max(1, Math.ceil((Math.hypot(bx - ax, bz - az) / coarse) * 4));
    for (let q = 0; q <= steps; q++) {
      const x = ax + ((bx - ax) * q) / steps;
      const z = az + ((bz - az) * q) / steps;
      const a = Math.floor((x - minX) / coarse);
      const b = Math.floor((z - minZ) / coarse);
      for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) crossed.add((a + da) * 100000 + (b + db));
    }
  }
  const pos: number[] = [];
  const tri = (pts: Array<[number, number]>, a: number, b: number, c: number) => {
    // Wound to face up (+y), whichever way the triangulation gave it.
    const [p, q, r] = [pts[a], pts[b], pts[c]];
    const cross = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const order = cross < 0 ? [p, q, r] : [p, r, q];
    for (const [x, z] of order) pos.push(x, heightAt(x, z), z);
  };
  const cellInto = (x0: number, z0: number, x1: number, z1: number, edgy: boolean) => {
    if (!edgy) {
      const quad: Array<[number, number]> = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
      tri(quad, 0, 1, 2);
      tri(quad, 0, 2, 3);
      return;
    }
    const part = clipToRect(poly, x0, z0, x1, z1);
    if (part.length < 3) return;
    const faces = THREE.ShapeUtils.triangulateShape(part.map(([x, z]) => new THREE.Vector2(x, z)), []);
    for (const [a, b, c] of faces) tri(part, a, b, c);
  };
  for (let a = 0; a < nx; a++) {
    for (let b = 0; b < nz; b++) {
      const x0 = minX + a * coarse;
      const z0 = minZ + b * coarse;
      const x1 = x0 + coarse;
      const z1 = z0 + coarse;
      const edgy = crossed.has(a * 100000 + b);
      if (!edgy && !insideOutline(poly, (x0 + x1) / 2, (z0 + z1) / 2)) continue;
      if (!fine(x0, z0, x1, z1)) {
        cellInto(x0, z0, x1, z1, edgy);
        continue;
      }
      const m = Math.max(1, Math.round(coarse / fineCell));
      const w = coarse / m;
      for (let i = 0; i < m; i++) {
        for (let j = 0; j < m; j++) cellInto(x0 + i * w, z0 + j * w, x0 + (i + 1) * w, z0 + (j + 1) * w, edgy);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
