// Shapes for armour that the kit's primitives don't make on their own, built
// with its loft: a cuirass, a lame, a curved plate, a swept band. Shared by
// the factions' designs.
import type { Kit } from './kit';

type P3 = [number, number, number];

/**
 * A cuirass: slices up the torso, each (y, half-width, front, back), the
 * front drawn to a keel down the middle `keel` proud of the rest.
 */
export function cuirass(k: Kit, slot: 'P' | 'S' | 'T', slices: Array<[number, number, number, number]>, keel = 0.08): void {
  k.loft(
    slot,
    slices.map(([y, w, f, b]): P3[] => [
      [0, y, f + keel],
      [w * 0.5, y, f],
      [w, y, f - (f - b) * 0.3],
      [w * 0.92, y, b],
      [-w * 0.92, y, b],
      [-w, y, f - (f - b) * 0.3],
      [-w * 0.5, y, f],
    ]),
  );
}

/**
 * A lame: a band of plate curving round a vertical axis through `c`, from
 * angle a0 to a1 (0 toward +x, turning toward +z), from height y0 down to
 * y1, its radius r0 at the top flaring to r1 at the bottom, `t` thick.
 */
export function lame(k: Kit, slot: 'P' | 'S' | 'T', c: P3, r0: number, r1: number, y0: number, y1: number, a0: number, a1: number, t = 0.07): void {
  const rings: P3[][] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const at = (r: number, y: number): P3 => [c[0] + ca * r, c[1] + y, c[2] + sa * r];
    rings.push([at(r0 + t, y0), at(r1 + t, y1), at(r1, y1), at(r0, y0)]);
  }
  k.loft(slot, rings);
}

/**
 * Rings for a loft along a path in the (z, y) plane at `x`: at each point
 * (z, y, hx, hn) a rectangle `hx` each side across and `hn` each side along
 * the path's normal, set square to the path. Plumes, horns, quills.
 */
export function sweep(path: Array<[number, number, number, number]>, x = 0): P3[][] {
  return path.map(([z, y, hx, hn], i) => {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    let tz = b[0] - a[0];
    let ty = b[1] - a[1];
    const l = Math.hypot(tz, ty) || 1;
    tz /= l;
    ty /= l;
    const at = (u: number, v: number): P3 => [x + u, y + v * tz, z - v * ty];
    return [at(hx, hn), at(hx, -hn), at(-hx, -hn), at(-hx, hn)];
  });
}

/**
 * A curved plate: part of a cylinder `r` round a vertical axis through `c`,
 * centred on angle `a` (0 toward +x, turning toward +z), `t` thick, its
 * outline given as rows down it, each (height, half-angle). Shields.
 */
export function curvedPlate(k: Kit, slot: 'P' | 'S' | 'T', c: P3, r: number, a: number, rows: Array<[number, number]>, t = 0.08, n = 8): void {
  k.loft(
    slot,
    rows.map(([y, h]) => {
      const pts: P3[] = [];
      for (let i = 0; i <= n; i++) {
        const g = a - h + (2 * h * i) / n;
        pts.push([c[0] + Math.cos(g) * (r + t), c[1] + y, c[2] + Math.sin(g) * (r + t)]);
      }
      for (let i = n; i >= 0; i--) {
        const g = a - h + (2 * h * i) / n;
        pts.push([c[0] + Math.cos(g) * r, c[1] + y, c[2] + Math.sin(g) * r]);
      }
      return pts;
    }),
  );
}
