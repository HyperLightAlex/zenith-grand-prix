// Aurora's shared motifs: the halo, the sigil (a sword through a halo) and
// the pointed sabaton (the cuirass, lames, curved plates and swept bands are
// in ../shapes). Each adds parts to a
// kit, in the space of the part it is building.
import type { Kit } from '../kit';
import { arc } from '../parts';

export { cuirass, curvedPlate, lame, sweep } from '../shapes';

type P3 = [number, number, number];

/** A halo: a silver ring `r` across, its inner edge lit, facing +z until turned by `rot`. */
export function halo(k: Kit, r: number, at: P3, rot: P3 = [0, 0, 0], w = 0.08, d = 0.07): void {
  const ring = (rr: number, ww: number, dd: number): P3[][] => {
    const rings: P3[][] = [];
    const n = 32;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const lo = rr - ww / 2;
      const hi = rr + ww / 2;
      rings.push([[c * lo, s * lo, -dd / 2], [c * hi, s * hi, -dd / 2], [c * hi, s * hi, dd / 2], [c * lo, s * lo, dd / 2]]);
    }
    return rings;
  };
  k.loft('T', ring(r, w, d), { at, rot });
  k.loft('G', ring(r - w / 2 - 0.012, 0.03, d * 0.7), { at, rot });
}

/**
 * Aurora's sigil, as on its emblem: an upright sword, point up, a halo round
 * it where the blade meets the crossguard and swept wings behind. `R` from the
 * crossing to the point; facing +z until turned by `rot`; `depth` thick.
 */
export function sigil(k: Kit, R: number, at: P3, rot: P3 = [0, 0, 0], depth = 0.06): void {
  // Each part a plate, thicker the nearer the front it stands.
  const put = (slot: 'S' | 'T' | 'G', pts: Array<[number, number]>, d: number) => k.plate(slot, pts.map(([x, y]) => [x * R, y * R] as [number, number]), depth * d, { at, rot });
  for (const s of [1, -1]) {
    const wing: Array<[number, number]> = [[0.12, -0.02], [0.55, 0.28], [0.8, 0.62], [0.5, 0.3], [0.28, 0.16], [0.42, 0.42], [0.18, 0.12]];
    put('S', s === 1 ? wing : wing.map(([x, y]) => [-x, y] as [number, number]).reverse(), 0.6);
  }
  put('S', [[-0.1, -0.04], [0.1, -0.04], [0.1, 0.74], [0, 1], [-0.1, 0.74]], 1);
  put('G', [[-0.025, 0.06], [0.025, 0.06], [0.025, 0.7], [-0.025, 0.7]], 1.08);
  put('T', arc(0.28, 0.35, 0, Math.PI, 0, -0.07), 1.12);
  put('T', arc(0.28, 0.35, Math.PI, Math.PI * 2, 0, -0.07), 1.12);
  put('T', [[-0.44, -0.13], [0.44, -0.13], [0.4, -0.02], [-0.4, -0.02]], 1.2);
  put('T', [[-0.05, -0.13], [0.05, -0.13], [0.05, -0.42], [-0.05, -0.42]], 1.1);
  put('T', [[0, -0.42], [0.09, -0.48], [0.09, -0.56], [0, -0.62], [-0.09, -0.56], [-0.09, -0.48]], 1.2);
}

/**
 * The pointed sabaton: a foot of plate from the heel to a point past the
 * toes, `w` its half-width at the ball, its sole at `sole`, `tall` its
 * height over the instep, its tip silver and a pearl lame across the instep.
 */
export function sabaton(k: Kit, sole: number, heel: number, toe: number, w: number, tall: number): void {
  const at = (f: number) => heel + (toe - heel) * f;
  const sec = (z: number, ww: number, top: number, bot: number): P3[] => {
    const sh = top - (top - bot) * 0.3;
    return [[ww * 0.6, top, z], [ww, sh, z], [ww, bot, z], [-ww, bot, z], [-ww, sh, z], [-ww * 0.6, top, z]];
  };
  // Along the foot: (how far, half-width, height over the sole).
  const S: Array<[number, number, number]> = [
    [0, 0.8, 1],
    [0.18, 0.95, 1.05],
    [0.4, 1, 1],
    [0.62, 0.86, 0.75],
    [0.8, 0.55, 0.5],
    [0.94, 0.22, 0.3],
    [1, 0.06, 0.16],
  ];
  k.loft('P', S.map(([f, ww, h]) => sec(at(f), w * ww, sole + tall * h, sole)));
  k.loft('T', S.slice(4).map(([f, ww, h]) => sec(at(f), w * ww + 0.015, sole + tall * h + 0.015, sole - 0.005)));
  k.loft('S', [sec(at(0.46), w + 0.02, sole + tall * 0.95 + 0.02, sole + 0.02), sec(at(0.56), w * 0.94 + 0.02, sole + tall * 0.86 + 0.02, sole + 0.02)]);
}
