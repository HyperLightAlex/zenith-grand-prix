// The space round the road that scenery must leave empty: the road's own slab
// and barriers, the mechs on it and the chase camera behind them. Used to fit
// the fallen titan of Titan's Rest to the road (the exports for Blender, the
// check of its model, the placeholder titan). Everything is measured in the
// road's own frame at each sample, so it follows the road through loops,
// rolls and corkscrews; a fork's two routes each get their own box, moved
// across and up as the track draws them.
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

/** The boxes at sample `i`: one for plain road, one for each route through a fork. */
export function keepBoxes(track: Track, i: number, up: number = KEEP_OUT.up): KeepBox[] {
  const hw = track.hw[i] + KEEP_OUT.side;
  const sL = track.shiftL[i], rL = track.riseL[i], sR = track.shiftR[i], rR = track.riseR[i];
  if (track.median[i] < 0.01 && sL === 0 && sR === 0 && rL === 0 && rR === 0) {
    return [{ d0: -hw, d1: hw, h0: -KEEP_OUT.down, h1: up }];
  }
  // Each route from its outer edge to a little past the middle.
  return [
    { d0: -hw + sL, d1: KEEP_OUT.side + sL, h0: -KEEP_OUT.down + rL, h1: up + rL },
    { d0: -KEEP_OUT.side + sR, d1: hw + sR, h0: -KEEP_OUT.down + rR, h1: up + rR },
  ];
}

/** A lookup of the samples near a point, for testing many points against the road. */
export class RoadIndex {
  private cells = new Map<number, number[]>();
  private readonly cell = 64;
  /** The farthest any box reaches from its sample's centreline, so nothing near is missed. */
  readonly reach: number;
  constructor(readonly track: Track) {
    let reach = 0;
    for (let i = 0; i < track.n; i++) {
      for (const b of keepBoxes(track, i, KEEP_OUT.sky)) {
        reach = Math.max(reach, Math.hypot(Math.max(-b.d0, b.d1), Math.max(-b.h0, b.h1)));
      }
      const k = this.key(track.px[i], track.pz[i]);
      let list = this.cells.get(k);
      if (!list) this.cells.set(k, (list = []));
      list.push(i);
    }
    this.reach = reach + track.ds;
  }
  private key(x: number, z: number): number {
    return (Math.floor(x / this.cell) + 4096) * 8192 + (Math.floor(z / this.cell) + 4096);
  }
  /** The samples within the reach of (x, z) in plan. */
  near(x: number, z: number, out: number[] = []): number[] {
    out.length = 0;
    const r = Math.ceil(this.reach / this.cell);
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    for (let a = -r; a <= r; a++) {
      for (let b = -r; b <= r; b++) {
        const list = this.cells.get((cx + a + 4096) * 8192 + (cz + b + 4096));
        if (list) for (const i of list) out.push(i);
      }
    }
    return out;
  }
  /**
   * Where a point is in the space round the road: the sample it is in, or -1.
   * `up` is how far above the deck counts (KEEP_OUT.up, or KEEP_OUT.sky for the soft limit).
   */
  hit(x: number, y: number, z: number, up: number = KEEP_OUT.up, scratch: number[] = []): number {
    const t = this.track;
    // Each sample owns a slab along the road a sample either way, so the slabs overlap and leave no gaps on the outside of a bend.
    const half = t.ds;
    for (const i of this.near(x, z, scratch)) {
      const vx = x - t.px[i], vy = y - t.py[i], vz = z - t.pz[i];
      const along = vx * t.tx[i] + vy * t.ty[i] + vz * t.tz[i];
      if (along < -half || along > half) continue;
      const d = vx * t.rx[i] + vy * t.ry[i] + vz * t.rz[i];
      const h = vx * t.ux[i] + vy * t.uy[i] + vz * t.uz[i];
      for (const b of keepBoxes(t, i, up)) {
        if (d >= b.d0 && d <= b.d1 && h >= b.h0 && h <= b.h1) return i;
      }
    }
    return -1;
  }
}
