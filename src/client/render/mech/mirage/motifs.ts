// Mirage's shared motifs: the broad jewelled collar, the pleated kilt panel,
// the gold bands round the limbs, the striped headdress and the sun disc.
// Each adds parts to a kit, in the space of the part it is building.
import type { Kit } from '../kit';

/** An annular sector in a front profile (x, y): radii r0 < r1, angles a0..a1 round (cx, cy). */
export function arc(r0: number, r1: number, a0: number, a1: number, cx: number, cy: number, n = 14): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(a) * r0, cy + Math.sin(a) * r0]);
  }
  return pts;
}

/**
 * The broad collar: concentric bands of gold, rust, sand and gold hanging
 * from the neck across the chest (`r` its outer radius, `y` the neck's
 * height, `z` the face of the chest it lies on, `w` how broad its bands
 * are), studded with lit gems, a lit scarab at its heart.
 */
export function broadCollar(k: Kit, r: number, y: number, z: number, tilt = -0.28, w = 1): void {
  const bands: Array<['T' | 'S' | 'P', number]> = [['T', 0.1 * w], ['S', 0.14 * w], ['P', 0.1 * w], ['T', 0.07 * w]];
  let outer = r;
  const lo = Math.PI * 1.08;
  const hi = Math.PI * 1.92;
  bands.forEach(([slot, w], i) => {
    k.plate(slot, arc(outer - w, outer, lo, hi, 0, 0), 0.07 + i * 0.01, { at: [0, y, z + i * 0.012], rot: [tilt, 0, 0] });
    outer -= w;
  });
  // A point on the collar's face, tipped with it.
  const on = (px: number, py: number, lift: number): [number, number, number] => [px, y + py * Math.cos(tilt) - lift * Math.sin(tilt), z + py * Math.sin(tilt) + lift * Math.cos(tilt)];
  // Gems round the outer gold band.
  for (let i = 0; i < 7; i++) {
    const a = lo + ((hi - lo) * (i + 0.5)) / 7;
    const rr = r - 0.05 * w;
    k.box('G', 0.05 * w, 0.05 * w, 0.03, { at: on(Math.cos(a) * rr, Math.sin(a) * rr, 0.05), rot: [tilt, 0, a] });
  }
  // The scarab: a gold oval with a lit slit down its back, just under the collar.
  k.cyl('T', 0.17 * w, 0.17 * w, 0.08, 10, { axis: 'z', at: on(0, -r - 0.1 * w, 0.02), scale: [0.8, 1, 1], rot: [tilt, 0, 0] });
  k.box('G', 0.03 * w, 0.22 * w, 0.04, { at: on(0, -r - 0.1 * w, 0.07), rot: [tilt, 0, 0] });
}

/**
 * The kilt: a pleated panel hanging between the legs from the belt (`topW`
 * and `botW` its widths, `len` its length, `z` the front of the hips),
 * gold pleats down it.
 */
export function kilt(k: Kit, topW: number, botW: number, len: number, z: number): void {
  const top = 0.16;
  k.plate('P', [[-topW / 2, top], [topW / 2, top], [botW / 2, top - len], [0, top - len - 0.12], [-botW / 2, top - len]], 0.1, { at: [0, 0, z] });
  for (const f of [-0.6, -0.2, 0.2, 0.6]) {
    const x0 = (f * topW) / 2;
    const x1 = (f * botW) / 2;
    k.plate('T', [[x0 - 0.025, top - 0.04], [x0 + 0.025, top - 0.04], [x1 + 0.025, top - len + 0.04], [x1 - 0.025, top - len + 0.04]], 0.03, { at: [0, 0, z + 0.06] });
  }
  k.plate('S', [[-topW / 2 - 0.02, top + 0.06], [topW / 2 + 0.02, top + 0.06], [topW / 2, top - 0.08], [-topW / 2, top - 0.08]], 0.12, { at: [0, 0, z + 0.01] });
}

/** A gold band round a limb or the waist: radius `r`, at height `y`. */
export function band(k: Kit, r: number, y: number, h = 0.12): void {
  k.cyl('T', r, r, h, 10, { at: [0, y, 0] });
}

/**
 * The headdress: striped lappets falling from behind the head's sides down to
 * the shoulders (`w` how far apart, `y` where they start, `len` their length),
 * gold and rust in turn.
 */
export function headdress(k: Kit, w: number, y: number, len: number, z = -0.1, stripes = 6): void {
  const h = len / stripes;
  for (const s of [1, -1]) {
    for (let i = 0; i < stripes; i++) k.box(i % 2 ? 'S' : 'T', 0.12, h * 0.98, 0.4, { at: [s * w, y - h * (i + 0.5), z], rot: [0.08, 0, s * 0.1] });
  }
}

/** A sun disc: a gold disc with a lit centre, facing +z, radius `r`, at `at`. */
export function sunDisc(k: Kit, r: number, at: [number, number, number], rot: [number, number, number] = [0, 0, 0]): void {
  k.cyl('T', r, r, 0.1, 16, { axis: 'z', at, rot });
  k.cyl('G', r * 0.55, r * 0.55, 0.12, 16, { axis: 'z', at, rot });
}
