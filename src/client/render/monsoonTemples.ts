// Monsoon Ruins' temples, built up in the round: the stepped pyramids at
// the line and about the jungle, each tier a sloping face (a talud) under a
// carved band, a stair up its front between balustrades, a shrine on top
// with a dark doorway, a sloping carved upper face, a cornice and a roof
// comb; and the pieces the summit temple and the halls are made of. Every
// piece is closed (no open ends to see through) and casts its moldings'
// shadow lines, so they read as stone rather than as boxes.
//
// Pieces are handed to `put` with their kind: plain stone, carved stone (the
// friezes, painted with sheet J4's frieze) or dark (doorways and the space
// behind them).
import * as THREE from 'three';

export type StoneKind = 'stone' | 'carved' | 'dark';
/** Keeps a piece (unless it stands in the road's space): false if it was left out. */
export type Put = (g: THREE.BufferGeometry, colour: THREE.Color, kind: StoneKind) => boolean;

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** A box `w` across `ax`, `h` up `ay`, `d` along `az`, centred on `c`. */
export function box(c: THREE.Vector3, ax: THREE.Vector3, ay: THREE.Vector3, az: THREE.Vector3, w: number, h: number, d: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.deleteAttribute('uv');
  // (Axes the wrong way round would turn it inside out, seen through from outside.)
  const x = ax.clone().normalize(), y = ay.clone().normalize(), z = az.clone().normalize();
  if (x.clone().cross(y).dot(z) < 0) z.negate();
  g.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z).setPosition(c));
  return g;
}

/** Triangles from corner quads (a, b, c, d in order round), flat shaded. */
export function quadsOf(list: THREE.Vector3[][]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const [a, b, c, d] of list) for (const p of [a, b, c, a, c, d]) pos.push(p.x, p.y, p.z);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * A closed frustum standing on `c` (the middle of its foot): `w0` by `d0`
 * at the foot, `w1` by `d1` at the top, `h` tall (a talud, a sloping roof).
 */
export function frustum(c: THREE.Vector3, ax: THREE.Vector3, az: THREE.Vector3, w0: number, d0: number, w1: number, d1: number, h: number): THREE.BufferGeometry {
  const up = v3(0, 1, 0);
  const at = (w: number, d: number, y: number, sx: number, sz: number) => c.clone().addScaledVector(ax, (sx * w) / 2).addScaledVector(az, (sz * d) / 2).addScaledVector(up, y);
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const lo = corners.map(([x, z]) => at(w0, d0, 0, x, z));
  const hi = corners.map(([x, z]) => at(w1, d1, h, x, z));
  const list: THREE.Vector3[][] = [];
  for (let k = 0; k < 4; k++) {
    const n = (k + 1) % 4;
    list.push([lo[k], lo[n], hi[n], hi[k]]);
  }
  list.push([hi[3], hi[2], hi[1], hi[0]]);
  list.push([lo[0], lo[1], lo[2], lo[3]]);
  return orient(quadsOf(list), c.clone().addScaledVector(up, h / 2));
}

/** Turns every triangle of `g` to face away from `inside` (so a closed solid is lit from outside). */
function orient(g: THREE.BufferGeometry, inside: THREE.Vector3): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute;
  const a = v3(), b = v3(), c = v3(), n = v3(), m = v3();
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(m.subVectors(c, a));
    m.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(inside);
    if (n.dot(m) < 0) {
      p.setXYZ(i + 1, c.x, c.y, c.z);
      p.setXYZ(i + 2, b.x, b.y, b.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** Tone `k` of a colour (for each molding a shade off the face it stands on). */
const shade = (c: THREE.Color, k: number) => c.clone().multiplyScalar(k);

/**
 * A stair up a slope: from `foot` (its lowest step's front edge, middle)
 * along `fwd` (horizontal, up the slope) and up, `rise` up over `run` along,
 * `width` across, in steps about `step` high; balustrades either side, as
 * sloping blocks a little higher than the steps.
 */
export function stair(put: Put, foot: THREE.Vector3, fwd: THREE.Vector3, across: THREE.Vector3, rise: number, run: number, width: number, tone: THREE.Color, step = 1.3): void {
  const up = v3(0, 1, 0);
  const n = Math.max(2, Math.round(rise / step));
  const sr = rise / n;
  const sd = run / n;
  for (let k = 0; k < n; k++) {
    // Each step a block from the ground to its tread (so the stair is solid).
    const top = sr * (k + 1);
    const c = foot.clone().addScaledVector(fwd, sd * (k + 0.5)).addScaledVector(up, top / 2);
    put(box(c, across, up, fwd, width, top, sd), shade(tone, k % 2 ? 0.94 : 1.0), 'stone');
  }
  // The balustrades: sloping slabs along each side.
  const len = Math.hypot(rise, run);
  const along = fwd.clone().multiplyScalar(run).addScaledVector(up, rise).normalize();
  const norm = v3().crossVectors(across, along).normalize();
  for (const side of [-1, 1]) {
    const c = foot
      .clone()
      .addScaledVector(across, side * (width / 2 + 1.1))
      .addScaledVector(fwd, run / 2)
      .addScaledVector(up, rise / 2 + 0.6);
    put(box(c, across, norm, along, 2.2, 3.2, len + 1.5), shade(tone, 0.82), 'carved');
  }
}

/**
 * A shrine on a platform: walls with a molding at their foot and a medial
 * one, a dark doorway on its front (`fwd`), a sloping carved upper face, a
 * cornice, and (with `comb`) a roof comb, its open lattice in three slabs.
 */
export function shrine(put: Put, c: THREE.Vector3, fwd: THREE.Vector3, w: number, d: number, h: number, tone: THREE.Color, comb: boolean): void {
  const up = v3(0, 1, 0);
  const across = v3().crossVectors(up, fwd).normalize();
  const wallH = h * 0.55;
  // Foot molding, the walls, the medial molding.
  put(box(c.clone().addScaledVector(up, 0.6), across, up, fwd, w + 1.6, 1.2, d + 1.6), shade(tone, 0.86), 'stone');
  put(box(c.clone().addScaledVector(up, wallH / 2), across, up, fwd, w, wallH, d), tone, 'stone');
  put(box(c.clone().addScaledVector(up, wallH + 0.5), across, up, fwd, w + 1.4, 1.0, d + 1.4), shade(tone, 0.8), 'stone');
  // The doorway: dark, inset into the front, with a carved lintel over it.
  const doorW = Math.min(w * 0.3, 5);
  const doorH = wallH * 0.72;
  put(box(c.clone().addScaledVector(fwd, d / 2 - 0.6).addScaledVector(up, doorH / 2 + 0.2), across, up, fwd, doorW, doorH, 1.6), new THREE.Color(0x10140f), 'dark');
  put(box(c.clone().addScaledVector(fwd, d / 2 + 0.25).addScaledVector(up, doorH + 1.0), across, up, fwd, doorW + 2.4, 1.4, 0.7), shade(tone, 0.9), 'carved');
  // Side doors on the long sides of a wide shrine.
  if (w > 16) {
    for (const s of [-1, 1]) {
      put(box(c.clone().addScaledVector(fwd, d / 2 - 0.6).addScaledVector(across, s * w * 0.3).addScaledVector(up, doorH * 0.4 + 0.2), across, up, fwd, doorW * 0.6, doorH * 0.8, 1.6), new THREE.Color(0x10140f), 'dark');
    }
  }
  // The upper face, sloping in, carved, and the cornice on it.
  const base = c.clone().addScaledVector(up, wallH + 1.0);
  const upperH = h * 0.3;
  put(frustum(base, across, fwd, w + 0.8, d + 0.8, w * 0.82, d * 0.7, upperH), tone, 'carved');
  put(box(base.clone().addScaledVector(up, upperH + 0.45), across, up, fwd, w * 0.86, 0.9, d * 0.74), shade(tone, 0.78), 'stone');
  if (comb) {
    // The roof comb: three tall slabs standing one behind another, each
    // with a gap in it (its lattice), and a crest over them.
    const combBase = base.clone().addScaledVector(up, upperH + 0.9);
    const ch = h * 0.55;
    const cw = w * 0.62;
    for (const [k, off] of [
      [0, -d * 0.12],
      [1, 0],
      [2, d * 0.12],
    ] as const) {
      const cc = combBase.clone().addScaledVector(fwd, off);
      const width = cw * (k === 1 ? 1 : 0.86);
      // Two piers and a bar across: an opening between them.
      for (const s of [-1, 1]) put(box(cc.clone().addScaledVector(across, (s * width) / 3).addScaledVector(up, ch / 2), across, up, fwd, width / 3, ch, 1.1), shade(tone, k === 1 ? 0.92 : 0.84), 'carved');
      put(box(cc.clone().addScaledVector(up, ch * 0.62), across, up, fwd, width, ch * 0.14, 1.1), shade(tone, 0.88), 'carved');
      put(box(cc.clone().addScaledVector(up, ch * 0.92), across, up, fwd, width * 0.9, ch * 0.16, 1.1), shade(tone, 0.9), 'carved');
    }
  }
}

/**
 * A stepped pyramid: `tiers` tiers from `c` (the middle of its foot on the
 * ground), `w` wide at the foot (and `w * depth` deep), each a sloping face
 * under a carved band, set back as it climbs; a stair up the front (`fwd`)
 * and a shrine on top. Returns the top's middle.
 */
export function steppedPyramid(
  put: Put,
  c: THREE.Vector3,
  fwd: THREE.Vector3,
  o: { w: number; depth?: number; tiers: number; tierH: number; setback: number; tone: THREE.Color; stair?: boolean; shrine?: boolean; comb?: boolean; ruined?: number; rnd?: () => number },
): THREE.Vector3 {
  const up = v3(0, 1, 0);
  const across = v3().crossVectors(up, fwd).normalize();
  const depth = o.depth ?? 1;
  const rnd = o.rnd ?? Math.random;
  let w = o.w;
  let y = 0;
  for (let t = 0; t < o.tiers; t++) {
    const d = w * depth;
    const talud = o.tierH * 0.7;
    const band = o.tierH - talud;
    const lean = Math.min(o.setback * 0.6, talud * 0.25);
    const base = c.clone().addScaledVector(up, y);
    // A ruin's upper tiers are crumbled: skip a tier's band, or the shrine, now and then.
    const tone = shade(o.tone, t % 2 ? 0.93 : 1.0);
    put(frustum(base, across, fwd, w, d, w - lean * 2, d - lean * 2, talud), tone, 'stone');
    if (!(o.ruined && rnd() < o.ruined)) put(box(base.clone().addScaledVector(up, talud + band / 2), across, up, fwd, w - lean * 2 + 0.6, band, d - lean * 2 + 0.6), shade(tone, 0.9), 'carved');
    y += o.tierH;
    w -= o.setback * 2;
  }
  const top = c.clone().addScaledVector(up, y);
  if (o.stair !== false) {
    // From the ground in front of the first tier to the top's front edge.
    const d0 = o.w * depth;
    const dTop = (w + o.setback * 2) * depth - o.setback * 2;
    const run = d0 / 2 + 2 - dTop / 2;
    stair(put, c.clone().addScaledVector(fwd, d0 / 2 + 2), fwd.clone().negate(), across, y, run, Math.max(5, o.w * 0.18), shade(o.tone, 1.04));
  }
  if (o.shrine !== false && !(o.ruined && rnd() < o.ruined * 0.5)) {
    const sw = Math.max(6, w + o.setback * 2 - 2);
    shrine(put, top, fwd, sw, sw * depth * 0.7, Math.max(10, sw * 0.9), o.tone, o.comb ?? true);
  }
  return top;
}

/** A square column from `foot` up `h`: a plinth, the shaft, a capital (and the abacus on it). */
export function column(put: Put, foot: THREE.Vector3, ax: THREE.Vector3, az: THREE.Vector3, w: number, h: number, tone: THREE.Color): void {
  const up = v3(0, 1, 0);
  put(box(foot.clone().addScaledVector(up, 0.5), ax, up, az, w + 1.0, 1.0, w + 1.0), shade(tone, 0.86), 'stone');
  put(box(foot.clone().addScaledVector(up, h / 2), ax, up, az, w, h - 2, w), tone, 'stone');
  put(box(foot.clone().addScaledVector(up, h - 1.2), ax, up, az, w + 0.8, 1.0, w + 0.8), shade(tone, 0.84), 'carved');
  put(box(foot.clone().addScaledVector(up, h - 0.4), ax, up, az, w + 1.4, 0.8, w + 1.4), shade(tone, 0.9), 'stone');
}
