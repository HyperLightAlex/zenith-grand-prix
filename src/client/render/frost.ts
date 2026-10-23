// The ground Frostline is laid on, worked out from the circuit itself: an
// ice shelf standing out of the sea under every low stretch of road, and the
// glacier on top of it under the high ones. The glacier's south face is cut
// where the Calving leaves it (the road's ramp juts out over the drop), and a
// slot runs up into it for the climb, the Ice Barrel's tube lying in it. Both
// the scenery (world.ts) and the road's supports (trackMesh.ts) ask it where
// the ground is.
import { pieceStarts, type CircuitDef } from '../../sim/circuit';
import type { Track } from '../../sim/track';

export interface Frost {
  /** Tops of the shelf and of the glacier; the sea is at 0. */
  shelfY: number;
  glacierY: number;
  /** Outlines in plan, as (x, z), going round one way. */
  shelf: Array<[number, number]>;
  glacier: Array<[number, number]>;
  /** The climb: the samples from the glacier's foot to its top, and the slot it runs in. */
  climb: [number, number];
  /** Height of the ground at a point: the glacier, the shelf, or the sea. */
  groundAt(x: number, z: number): number;
}

const cache = new WeakMap<Track, Frost | null>();

/** Frostline's ice, if this is Frostline (it has an Ice Barrel); null otherwise. */
export function frostOf(track: Track): Frost | null {
  if (cache.has(track)) return cache.get(track)!;
  const frost = findFrost(track);
  cache.set(track, frost);
  return frost;
}

/** Whether (x, z) is inside the outline. */
export function inside(poly: Array<[number, number]>, x: number, z: number): boolean {
  let inn = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inn = !inn;
  }
  return inn;
}

/** The convex hull of the points, counter-clockwise. */
function hull(pts: Array<[number, number]>): Array<[number, number]> {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Array<[number, number]> = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function findFrost(track: Track): Frost | null {
  const def = track.def as CircuitDef;
  if (!('pieces' in def)) return null;
  const starts = pieceStarts(def);
  const named = (name: string) => def.pieces.findIndex((p) => p.name === name);
  const span = (i: number): [number, number] => [Math.ceil(starts[i] / track.ds), Math.floor((i + 1 < starts.length ? starts[i + 1] : track.length) / track.ds)];
  const into = named('into the glacier');
  const top = named('out on top');
  const crest = named('the crest');
  const ramp = named('ramp');
  if (into < 0 || top < 0 || crest < 0 || ramp < 0) return null;
  const [c0] = span(into);
  const [, c1] = span(top);
  const climbX = track.px[c0];
  const portalZ = track.pz[c0] - 30;
  const topZ = track.pz[c1] - 14;
  const slot = track.hw[Math.floor((c0 + c1) / 2)] + 18;
  const [k0, k1] = span(crest);
  let crestX = 0;
  for (let i = k0; i < k1; i++) crestX += track.px[i];
  crestX /= Math.max(1, k1 - k0);
  const faceZ = track.pz[span(ramp)[0]];
  // The roads on top: from the top of the climb to the Calving's ramp.
  let north = Infinity;
  let east = -Infinity;
  let glacierRoad = Infinity;
  for (let i = c1; i < span(ramp)[0]; i++) {
    north = Math.min(north, track.pz[i] - track.hw[i]);
    east = Math.max(east, track.px[i] + track.hw[i]);
    glacierRoad = Math.min(glacierRoad, track.py[i]);
  }
  const glacierY = glacierRoad - 6.5;
  const west = crestX - 120;
  const corners: Array<[number, number]> = [
    [west, faceZ],
    [crestX + 120, faceZ],
    [climbX - slot, portalZ],
    [climbX - slot, topZ],
    [climbX + slot, topZ],
    [climbX + slot, portalZ],
    [Math.max(east + 90, climbX + slot + 100), portalZ],
    [Math.max(east + 90, climbX + slot + 100), north - 110],
    [west, north - 110],
  ];
  // Ragged, every 30 units along each side: in and out where there is room,
  // only ever in where a road passes close (the face over the Split, the
  // slot round the climb), so no road is buried.
  const roadNear = (x: number, z: number) => {
    let best = Infinity;
    for (let i = 0; i < track.n; i += 2) {
      if (track.py[i] > glacierY + 20) continue;
      best = Math.min(best, Math.hypot(track.px[i] - x, track.pz[i] - z) - track.hw[i]);
    }
    return best;
  };
  let gseed = 11;
  const grnd = () => {
    gseed = (gseed * 16807) % 2147483647;
    return gseed / 2147483647;
  };
  const glacier: Array<[number, number]> = [];
  for (let k = 0; k < corners.length; k++) {
    const [ax, az] = corners[k];
    const [bx, bz] = corners[(k + 1) % corners.length];
    const len = Math.hypot(bx - ax, bz - az);
    // The slot's walls stay straight: the climb's tube lies close inside them.
    const straight = (k >= 2 && k <= 4) || len < 60;
    const steps = straight ? 1 : Math.max(1, Math.round(len / 30));
    // Outward is to the right of a side going round the way the corners do (they run clockwise seen from above).
    const ox = -(bz - az) / len;
    const oz = (bx - ax) / len;
    for (let q = 0; q < steps; q++) {
      const f = q / steps;
      let x = ax + (bx - ax) * f;
      let z = az + (bz - az) * f;
      if (q > 0) {
        let j = (grnd() - 0.5) * 36;
        if (j > 0 && roadNear(x + ox * j, z + oz * j) < 30) j = -Math.abs(j) * 0.6;
        x += ox * j;
        z += oz * j;
      }
      glacier.push([x, z]);
    }
  }

  // The shelf: round every low stretch of road and under the glacier, its
  // coast a little ragged.
  const low: Array<[number, number]> = [];
  let shelfRoad = Infinity;
  for (let i = 0; i < track.n; i += 3) {
    if (track.py[i] > glacierY - 40) continue;
    low.push([track.px[i], track.pz[i]]);
    shelfRoad = Math.min(shelfRoad, track.py[i]);
  }
  const ring = hull([...low, ...glacier]);
  let cx = 0;
  let cz = 0;
  for (const [x, z] of ring) {
    cx += x;
    cz += z;
  }
  cx /= ring.length;
  cz /= ring.length;
  // Out from the hull by a margin that wanders, every 40 units along it.
  const shelf: Array<[number, number]> = [];
  let seed = 3;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let k = 0; k < ring.length; k++) {
    const [ax, az] = ring[k];
    const [bx, bz] = ring[(k + 1) % ring.length];
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.round(len / 40));
    for (let q = 0; q < steps; q++) {
      const f = q / steps;
      const x = ax + (bx - ax) * f;
      const z = az + (bz - az) * f;
      const l = Math.hypot(x - cx, z - cz) || 1;
      const out = 85 + rnd() * 40;
      shelf.push([x + ((x - cx) / l) * out, z + ((z - cz) / l) * out]);
    }
  }
  const shelfY = shelfRoad - 3;
  const groundAt = (x: number, z: number) => (inside(glacier, x, z) ? glacierY : inside(shelf, x, z) ? shelfY : 0);
  return { shelfY, glacierY, shelf, glacier, climb: [c0, c1], groundAt };
}
