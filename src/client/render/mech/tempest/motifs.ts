// Tempest's shared motifs: storm machines with a samurai's touch. Lightning
// (bolts, and jagged lit streaks running over the armour like veins), wind
// (crescent blades, ducted turbines), lightning rods; and for the samurai, a
// crest on the brow and one bold shoulder plate, black under jade, edged in
// gold. Each adds parts to a kit, in the space of the part it is building.
import type { Kit } from '../kit';
import { cuirass, curvedPlate, hoop, lame } from '../shapes';

type P3 = [number, number, number];

/** A lightning bolt pointing down, `h` tall, facing +z until turned by `rot`. */
export function bolt(k: Kit, slot: 'P' | 'S' | 'T' | 'G', h: number, at: P3, rot: P3 = [0, 0, 0], depth = 0.04): void {
  const pts: Array<[number, number]> = [[-0.1, 0.5], [0.24, 0.5], [0.06, 0.1], [0.3, 0.1], [-0.18, -0.5], [-0.02, -0.04], [-0.26, -0.04]];
  k.plate(slot, pts.map(([x, y]) => [x * h, y * h] as [number, number]), depth, { at, rot });
}

/**
 * A streak of lightning: a jagged lit line through the points of a profile,
 * `w` wide, laid on a face (facing +z until turned by `rot`).
 */
export function streak(k: Kit, pts: Array<[number, number]>, w: number, at: P3, rot: P3 = [0, 0, 0], depth = 0.03): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const l = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = (-(y1 - y0) / l) * (w / 2);
    const ny = ((x1 - x0) / l) * (w / 2);
    const ex = ((x1 - x0) / l) * (w / 2);
    const ey = ((y1 - y0) / l) * (w / 2);
    k.plate('G', [[x0 + nx - ex, y0 + ny - ey], [x1 + nx + ex, y1 + ny + ey], [x1 - nx + ex, y1 - ny + ey], [x0 - nx - ex, y0 - ny - ey]], depth, { at, rot });
  }
}

/**
 * A crescent in a profile: a blade curving along an arc `R` round (cx, cy)
 * from angle a0 to a1, widest (`w` across) a little before its middle and
 * drawn to a point at both ends. Wind blades, crests.
 */
export function crescent(R: number, a0: number, a1: number, w: number, cx: number, cy: number, n = 14): Array<[number, number]> {
  const outer: Array<[number, number]> = [];
  const inner: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + (a1 - a0) * t;
    const half = (w / 2) * Math.sin(Math.PI * Math.pow(t, 0.8));
    outer.push([cx + Math.cos(a) * (R + half), cy + Math.sin(a) * (R + half)]);
    inner.push([cx + Math.cos(a) * (R - half), cy + Math.sin(a) * (R - half)]);
  }
  return [...outer, ...inner.reverse().slice(1, -1)];
}

/**
 * The storm helm, in head space: a smooth jade shell `r` across sitting at
 * height `y` on z `z`, a black brow drawn to a point over the visor, one jade
 * plate flaring round the back of the neck, and a gold vane swept back from
 * each temple like a lightning rod, lit at its tip. The visor, face and crest
 * are each design's own.
 */
export function stormHelm(k: Kit, r: number, y: number, z: number): void {
  k.lathe('P', [[0, 0], [r, 0], [r * 0.99, r * 0.45], [r * 0.88, r * 0.78], [r * 0.6, r * 0.98], [0, r * 1.06]], 12, { at: [0, y, z], scale: [0.94, 1, 1.12] });
  k.plate('S', [[-r * 0.92, r * 0.62], [r * 0.92, r * 0.62], [r * 0.82, r * 0.4], [0, r * 0.22], [-r * 0.82, r * 0.4]], r * 0.4, { at: [0, y, z + r * 0.86] });
  k.plate('T', [[-r * 0.9, r * 0.66], [r * 0.9, r * 0.66], [r * 0.88, r * 0.6], [-r * 0.88, r * 0.6]], r * 0.42, { at: [0, y, z + r * 0.86] });
  lame(k, 'P', [0, y, z], r * 1.02, r * 1.24, -r * 0.02, -r * 0.34, Math.PI / 2 + 1.1, Math.PI / 2 + Math.PI * 2 - 1.1, 0.05);
  for (const s of [1, -1]) {
    k.prism('T', [[r * 0.3, r * 0.5], [-r * 0.5, r * 0.9], [-r * 1.1, r * 1.12], [-r * 0.9, r * 0.92], [-r * 0.3, r * 0.6], [r * 0.25, r * 0.38]], 0.05, { at: [s * r * 0.9, y, z], rot: [0, 0, s * -0.25] });
    k.ball('G', 0.035, { at: [s * (r * 0.9 + r * 1.1 * 0.25), y + r * 1.12, z - r * 1.1] });
  }
}

/**
 * The shoulder plate: one bold curved plate hung on the outside of the upper
 * arm (round a vertical axis through `c`, centred on angle `a`), jade over a
 * black plate that shows below it, gold along its top, a streak of lightning
 * down its face.
 */
export function shoulderPlate(k: Kit, c: P3, a: number, r: number, top: number, bottom: number, half: number): void {
  curvedPlate(k, 'S', c, r - 0.03, a, [[top - 0.1, half * 0.92], [bottom - 0.16, half * 0.82], [bottom - 0.26, half * 0.5]], 0.07);
  curvedPlate(k, 'P', c, r, a, [[top, half], [(top + bottom) / 2, half * 1.02], [bottom, half * 0.9], [bottom - 0.1, half * 0.55]], 0.09);
  curvedPlate(k, 'T', c, r + 0.08, a, [[top + 0.02, half * 1.02], [top - 0.06, half * 1.02]], 0.03);
  // A streak of lightning down the plate's face, laid flat on the middle of its curve.
  const zig: Array<[number, number]> = [];
  for (let i = 0; i <= 6; i++) zig.push([(i % 2 ? -1 : 1) * 0.07, top - 0.14 - ((top - bottom - 0.08) * i) / 6]);
  streak(k, zig, 0.05, [c[0] + Math.cos(a) * (r + 0.1), c[1], c[2] + Math.sin(a) * (r + 0.1)], [0, Math.atan2(Math.cos(a), Math.sin(a)), 0]);
}

/** A lightning rod: a thin gold mast `len` long standing from `base`, leaning `lean` toward -x, a lit ball at its tip. */
export function rod(k: Kit, base: P3, len: number, lean = 0): void {
  const dx = -Math.sin(lean);
  const dy = Math.cos(lean);
  k.cyl('T', 0.03, 0.05, len, 6, { at: [base[0] + (dx * len) / 2, base[1] + (dy * len) / 2, base[2]], rot: [0, 0, lean], bevel: 0 });
  k.ball('G', 0.07, { at: [base[0] + dx * (len + 0.04), base[1] + dy * (len + 0.04), base[2]] });
}

/**
 * A ducted turbine: a gold ring `r` across facing +z (until turned by
 * `rot`), a black hub lit at its heart, and jade blades swept round between.
 */
export function turbine(k: Kit, r: number, at: P3, rot: P3 = [0, 0, 0], blades = 7): void {
  hoop(k, 'T', r, at, rot, r * 0.18, r * 0.5);
  k.cyl('S', r * 0.86, r * 0.86, r * 0.2, 16, { axis: 'z', at, rot });
  k.cyl('S', r * 0.3, r * 0.3, r * 0.42, 10, { axis: 'z', at, rot });
  k.cyl('G', r * 0.14, r * 0.14, r * 0.46, 8, { axis: 'z', at, rot });
  for (let i = 0; i < blades; i++) {
    const t = (i / blades) * Math.PI * 2;
    const pts: Array<[number, number]> = [[r * 0.26, -r * 0.06], [r * 0.82, -r * 0.14], [r * 0.82, r * 0.12], [r * 0.26, r * 0.1]];
    const rotated = pts.map(([x, y]) => [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)] as [number, number]);
    k.plate('P', rotated, r * 0.26, { at, rot });
  }
}

type Slice = [number, number, number, number];

/** A slice of a cuirass (see `cuirass`) at height y, between the slices given, grown by `g`. */
function sliceAt(S: Slice[], y: number, g: number): Slice {
  for (let i = 0; i + 1 < S.length; i++) {
    if (y <= S[i + 1][0]) {
      const t = Math.max(0, (y - S[i][0]) / (S[i + 1][0] - S[i][0]));
      const m = (j: 1 | 2 | 3) => S[i][j] + (S[i + 1][j] - S[i][j]) * t;
      return [y, m(1) + g, m(2) + g, m(3) - g];
    }
  }
  const l = S[S.length - 1];
  return [y, l[1] + g, l[2] + g, l[3] - g];
}

/** A band round a cuirass made of `S`, from y0 to y1, standing `g` proud of it. */
export function band(k: Kit, slot: 'P' | 'S' | 'T', S: Slice[], y0: number, y1: number, g: number, keel: number): void {
  cuirass(k, slot, [sliceAt(S, y0, g), sliceAt(S, (y0 + y1) / 2, g), sliceAt(S, y1, g)], keel);
}

/**
 * A tasset: a plate hanging from y = 0 in a skirt's own space, `w` wide each
 * side and `h` deep, its hem cut jagged like lightning and edged in gold, a
 * small bolt lit on it. `tilt` leans it out at the bottom; `f` is which way
 * it faces (1 forward, -1 back).
 */
export function tasset(k: Kit, w: number, h: number, tilt: number, f: 1 | -1): void {
  const hem = (d: number): Array<[number, number]> => [[-w, 0], [w, 0], [w, -h * 0.78 - d], [w * 0.35, -h * 0.92 - d], [w * 0.1, -h * 0.74 - d], [-w * 0.45, -h - d], [-w, -h * 0.82 - d]];
  const o = { at: [0, 0, f * 0.05] as P3, rot: [tilt, 0, 0] as P3 };
  k.plate('T', hem(0.04), 0.05, o);
  k.plate('P', hem(0), 0.07, { at: [0, 0, f * 0.06], rot: o.rot });
  bolt(k, 'G', h * 0.4, [w * 0.2, -h * 0.4, f * 0.1], o.rot, 0.03);
}
