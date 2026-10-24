// Where one stretch of a circuit's road comes into the space another needs:
// its slab and barriers (the deck down to the slab's underside, across its
// width and barriers) inside the space round another stretch (KEEP_OUT: the
// mechs over it, the camera, its own slab), for stretches far apart along the
// lap. Roads that cross over and under one another, ring and loop roads and
// fork routes, must leave each other that much room.
//
//   npx tsx tools/road-clearance.ts [track|all]
import { buildTrack, type Track } from '../src/sim/track';
import { TRACKS, trackById } from '../src/sim/tracks/index';
import { pieceStarts, type CircuitDef } from '../src/sim/circuit';
import { KEEP_OUT, keepBoxes, RoadIndex } from '../src/client/render/titan/keepout';

/** Stretches this close along the lap are the same stretch. */
const APART = 80;
const SLAB = 6.2;

export function clashes(track: Track): Array<{ i: number; j: number; h: number; d: number }> {
  const index = new RoadIndex(track);
  const out: Array<{ i: number; j: number; h: number; d: number }> = [];
  const scratch: number[] = [];
  const apart = Math.round(APART / track.ds);
  for (let i = 0; i < track.n; i++) {
    // (A jump's gap has no slab.)
    if (!track.roadL[i] && !track.roadR[i]) continue;
    // Points over sample i's slab: its top and underside, across its width and barriers.
    for (const b of keepBoxes(track, i, 0, SLAB)) {
      for (const h of [0, -SLAB]) {
        for (let d = b.d0; d <= b.d1 + 1e-6; d += Math.max(1, (b.d1 - b.d0) / 12)) {
          const x = track.px[i] + track.rx[i] * d + track.ux[i] * h;
          const y = track.py[i] + track.ry[i] * d + track.uy[i] * h;
          const z = track.pz[i] + track.rz[i] * d + track.uz[i] * h;
          for (const j of index.near(x, z, scratch)) {
            const gap = Math.abs(i - j);
            if (Math.min(gap, track.n - gap) < apart) continue;
            const vx = x - track.px[j], vy = y - track.py[j], vz = z - track.pz[j];
            const along = vx * track.tx[j] + vy * track.ty[j] + vz * track.tz[j];
            if (Math.abs(along) > track.ds) continue;
            const dd = vx * track.rx[j] + vy * track.ry[j] + vz * track.rz[j];
            const hh = vx * track.ux[j] + vy * track.uy[j] + vz * track.uz[j];
            for (const k of keepBoxes(track, j)) if (dd >= k.d0 && dd <= k.d1 && hh >= k.h0 && hh <= k.h1) out.push({ i, j, h: hh, d: dd });
          }
        }
      }
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2] ?? 'all';
  for (const def of arg === 'all' ? TRACKS : [trackById(arg)]) {
    if (!('pieces' in def)) continue;
    const track = buildTrack(def);
    const starts = pieceStarts(def as CircuitDef);
    const name = (s: number) => {
      let p = 0;
      for (let k = 0; k < starts.length; k++) if (starts[k] <= s) p = k;
      return `${p} ${(def as CircuitDef).pieces[p].name ?? ''}`.trim();
    };
    const c = clashes(track);
    const pairs = new Map<string, { n: number; h: number }>();
    for (const x of c) {
      const k = `${name(x.i * track.ds)} (s ${Math.round(x.i * track.ds / 50) * 50}) in the space of ${name(x.j * track.ds)}`;
      const e = pairs.get(k) ?? { n: 0, h: -1e9 };
      e.n++;
      e.h = Math.max(e.h, x.h);
      pairs.set(k, e);
    }
    console.log(`== ${def.id}: ${c.length} points of road in another stretch's space (up ${KEEP_OUT.up}, slab ${SLAB})`);
    for (const [k, e] of [...pairs].sort((a, b) => b[1].n - a[1].n).slice(0, 30)) console.log(`  ${e.n} points, up to ${e.h.toFixed(1)} over its deck: ${k}`);
  }
}
