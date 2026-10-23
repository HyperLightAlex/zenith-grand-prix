// The fallen titan of Titan's Rest as simple shapes: its proportions taken
// from its model sheet (art/model-sheets/model-g1-titan.png, 1300 m from crown
// to soles, about 1.82 m a pixel), laid on its back in the desert the way the
// road needs it. This is the pose the road is laid to and the Blender model is
// posed to (art/blender/titan/README.txt), and the shapes are the game's
// placeholder until that model is in.
//
// World axes are the game's: x east, y up, z south. The titan lies with its
// head to the west and its feet to the east, face up; its right side is to
// the south. Its right arm is flung out south across the sand (the road
// climbs it), its left elbow is raised over the road along its north side,
// its halo has broken off and stands past its crown, and its sword is driven
// into the sand south of its chest.
import { pieceStarts, type CircuitDef } from '../../../sim/circuit';
import type { Track } from '../../../sim/track';

export type V3 = [number, number, number];
export type TitanMat = 'armour' | 'red' | 'slate' | 'gold' | 'frame' | 'visor' | 'blade';

interface Base {
  /** Which part of the titan (its rig's bone). */
  part: string;
  mat: TitanMat;
}
/** A limb: a round piece from a to b, radius r0 at a and r1 at b. */
export interface Capsule extends Base {
  kind: 'capsule';
  a: V3;
  b: V3;
  r0: number;
  r1: number;
}
/** A box or an ellipsoid: centre, three unit axes, half sizes along them. */
export interface Solid extends Base {
  kind: 'box' | 'ellipsoid';
  c: V3;
  axes: [V3, V3, V3];
  half: V3;
}
/** A ring: centre, the axis it faces along, outer radius, radial width and thickness along the axis. */
export interface Ring extends Base {
  kind: 'ring';
  c: V3;
  axis: V3;
  R: number;
  width: number;
  depth: number;
}
export type TitanShape = Capsule | Solid | Ring;

/**
 * Standing, from G1 at 1300 m: h is the height above the soles, lat the
 * distance to its right of its centreline, dep the distance forward of its
 * back (the back plate, without the vents).
 */
export const STANDING = {
  height: 1300,
  crown: 1300,
  chin: 1211,
  shoulder: { h: 1124, lat: 273, dep: 173 },
  upperArm: 282,
  foreArm: 246,
  hand: 181,
  head: { h: 1255, dep: 222, half: [45, 86, 45] as V3 },
  faceDep: 309,
  neck: { h: 1180, dep: 164, r: 45 },
  chest: { h: 997, dep: 178, half: [183, 178, 218] as V3 },
  pauldron: { h: 1141, lat: 278, dep: 145, half: [72, 145, 78] as V3 },
  abdomen: { h: 757, dep: 150, half: [62, 140, 155] as V3 },
  pelvis: { h: 650, dep: 150, half: [52, 140, 236] as V3 },
  hip: { h: 687, lat: 136, dep: 145 },
  knee: { h: 460, lat: 150, dep: 155 },
  ankle: { h: 124, lat: 190, dep: 145 },
  /** The boots: heel to toe along dep, ankle to sole along h, across. */
  foot: { dep0: -120, dep1: 400, lat: 165 },
  radii: { upperArm: 55, foreArm: 75, neck: 45, thigh: 115, shin: 125 },
  /** The hand: half length, half width, half thickness (palm up). */
  handHalf: [90, 42, 24] as V3,
  halo: { R: 150, width: 34, depth: 26 },
} as const;

/** Where and how it lies. */
export interface TitanPose {
  /** x of its shoulder joints. */
  x0: number;
  /** z of its centreline. */
  zc: number;
  /** How deep its back lies under the sand. */
  burial: number;
  /** The right arm's direction from the shoulder (flung out south across the sand). */
  rightArm: V3;
  /** Where its left elbow is (raised over the road along its north side), and the forearm's direction from it. */
  leftElbow: V3;
  leftForeArm: V3;
  /** The halo's centre: torn off, standing upright past the crown, facing along x. */
  halo: V3;
  /** The sword: the point where the blade meets the guard, and the blade's direction toward its point. */
  swordGuard: V3;
  swordDir: V3;
  /** Blade length, width and thickness. */
  /** Blade length, width and thickness; the stump of the grip left above the guard (it snapped off); the guard's span. */
  sword: { blade: number; width: number; thick: number; grip: number; guard: number };
}

export const TITAN_POSE: TitanPose = {
  x0: 0,
  zc: -1422,
  burial: 120,
  rightArm: [0, -0.06, 1],
  leftElbow: [-215, 150, -1850],
  leftForeArm: [-0.45, -0.35, -0.82],
  halo: [-330, 195, -1422],
  swordGuard: [230, 205, -1000],
  swordDir: [0, -0.47, 0.88],
  sword: { blade: 480, width: 26, thick: 10, grip: 26, guard: 90 },
};

/**
 * The pose with the parts the road runs through placed by the road itself:
 * the halo centred on the middle of the Halo roll, and the sword's blade
 * along the line the Sword corkscrews round, its guard just above where the
 * road starts round it.
 */
export function fitToRoad(pose: TitanPose, track: Track): TitanPose {
  const def = track.def as CircuitDef;
  if (!('pieces' in def)) return pose;
  const st = pieceStarts(def);
  const at = (s: number) => Math.round(s / track.ds) % track.n;
  const out = { ...pose };
  const h = def.pieces.findIndex((p) => p.name === 'the Halo');
  if (h >= 0) {
    const i = at((st[h] + st[h + 1]) / 2);
    out.halo = [track.px[i], track.py[i], track.pz[i]];
  }
  const k = def.pieces.findIndex((p) => p.name === 'the Sword');
  const pc = def.pieces[k];
  if (k >= 0 && 'barrel' in pc) {
    const R = Math.abs(pc.barrel[2]);
    const axis = (i: number): V3 => [track.px[i] - track.ux[i] * R, track.py[i] - track.uy[i] * R, track.pz[i] - track.uz[i] * R];
    const a0 = axis(at(st[k]));
    const a1 = axis(at(st[k + 1]));
    const dir = norm(sub(a1, a0));
    out.swordGuard = add(a0, scale(dir, -12));
    out.swordDir = dir;
  }
  return out;
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => scale(a, 1 / (len(a) || 1));
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Its axes lying down: up its body (toward the head), forward (out of its chest), to its right. */
const UP: V3 = [-1, 0, 0];
const FWD: V3 = [0, 1, 0];
const RIGHT: V3 = [0, 0, 1];

/** A standing point (h, lat, dep) where it lies. */
export function lying(pose: TitanPose, h: number, lat: number, dep: number): V3 {
  return [pose.x0 + (STANDING.shoulder.h - h), dep - pose.burial, pose.zc + lat];
}

/** Its joints where they lie. */
export function titanJoints(pose: TitanPose = TITAN_POSE): Record<string, V3> {
  const S = STANDING;
  const j: Record<string, V3> = {};
  j.shoulderR = lying(pose, S.shoulder.h, S.shoulder.lat, S.shoulder.dep);
  j.shoulderL = lying(pose, S.shoulder.h, -S.shoulder.lat, S.shoulder.dep);
  const ra = norm(pose.rightArm);
  j.elbowR = add(j.shoulderR, scale(ra, S.upperArm));
  j.wristR = add(j.elbowR, scale(ra, S.foreArm));
  j.fingertipR = add(j.wristR, scale(ra, S.hand));
  // The left upper arm reaches from the shoulder toward the elbow's place, at its own length.
  j.elbowL = add(j.shoulderL, scale(norm(sub(pose.leftElbow, j.shoulderL)), S.upperArm));
  const lf = norm(pose.leftForeArm);
  j.wristL = add(j.elbowL, scale(lf, S.foreArm));
  j.fingertipL = add(j.wristL, scale(lf, S.hand));
  j.neck = lying(pose, S.neck.h, 0, S.neck.dep);
  j.head = lying(pose, S.head.h, 0, S.head.dep);
  for (const [side, k] of [['R', 1], ['L', -1]] as const) {
    j[`hip${side}`] = lying(pose, S.hip.h, k * S.hip.lat, S.hip.dep);
    j[`knee${side}`] = lying(pose, S.knee.h, k * S.knee.lat, S.knee.dep);
    j[`ankle${side}`] = lying(pose, S.ankle.h, k * S.ankle.lat, S.ankle.dep);
  }
  return j;
}

/** A box or ellipsoid lying with the body: half sizes along its up, forward and right. */
function bodySolid(kind: 'box' | 'ellipsoid', part: string, mat: TitanMat, c: V3, half: V3): Solid {
  return { kind, part, mat, c, axes: [UP, FWD, RIGHT], half };
}

/** The titan as simple shapes, where it lies. */
export function titanShapes(pose: TitanPose = TITAN_POSE): TitanShape[] {
  const S = STANDING;
  const j = titanJoints(pose);
  const out: TitanShape[] = [];
  const cap = (part: string, mat: TitanMat, a: V3, b: V3, r0: number, r1 = r0) => out.push({ kind: 'capsule', part, mat, a, b, r0, r1 });

  // The body.
  out.push(bodySolid('ellipsoid', 'chest', 'armour', lying(pose, S.chest.h, 0, S.chest.dep), S.chest.half));
  out.push(bodySolid('ellipsoid', 'spine', 'armour', lying(pose, S.abdomen.h, 0, S.abdomen.dep), S.abdomen.half));
  out.push(bodySolid('box', 'pelvis', 'armour', lying(pose, S.pelvis.h, 0, S.pelvis.dep), S.pelvis.half));
  for (const [side, k] of [['R', 1], ['L', -1]] as const) {
    out.push(bodySolid('box', `shoulder.${side}`, 'gold', lying(pose, S.pauldron.h, k * S.pauldron.lat, S.pauldron.dep), S.pauldron.half));
  }
  // The neck and head, face up.
  cap('neck', 'slate', lying(pose, 1124, 0, S.neck.dep), j.neck, S.radii.neck);
  out.push(bodySolid('ellipsoid', 'head', 'armour', j.head, S.head.half));
  // The dark visor band across its face.
  out.push(bodySolid('box', 'head', 'visor', lying(pose, S.head.h - 15, 0, S.faceDep - 14), [10, 10, 36]));
  for (const k of [1, -1]) {
    const root = lying(pose, S.head.h + 25, k * 38, S.head.dep + 40);
    const tip = lying(pose, S.crown + 95, k * 95, S.head.dep - 10);
    cap('head', 'gold', root, tip, 16, 4);
  }
  // The arms.
  cap('upper_arm.R', 'armour', j.shoulderR, j.elbowR, S.radii.upperArm);
  cap('forearm.R', 'armour', j.elbowR, j.wristR, S.radii.foreArm, S.radii.foreArm * 0.85);
  cap('upper_arm.L', 'armour', j.shoulderL, j.elbowL, S.radii.upperArm);
  cap('forearm.L', 'armour', j.elbowL, j.wristL, S.radii.foreArm, S.radii.foreArm * 0.85);
  for (const [side, w, f] of [['R', j.wristR, j.fingertipR], ['L', j.wristL, j.fingertipL]] as const) {
    const along = norm(sub(f, w));
    // Palm up: its width lies across, level.
    const across = norm(cross(along, [0, 1, 0]));
    const up = cross(across, along);
    out.push({ kind: 'box', part: `hand.${side}`, mat: 'armour', c: add(w, scale(along, S.handHalf[0])), axes: [along, up, across], half: [S.handHalf[0], S.handHalf[2], S.handHalf[1]] });
  }
  // Faded red bands round the arms and shins.
  const band = (part: string, a: V3, b: V3, at: number, r: number) => {
    const d = norm(sub(b, a));
    const p = add(a, scale(sub(b, a), at));
    cap(part, 'red', add(p, scale(d, -9)), add(p, scale(d, 9)), r * 1.06);
  };
  band('upper_arm.R', j.shoulderR, j.elbowR, 0.45, S.radii.upperArm);
  band('forearm.R', j.elbowR, j.wristR, 0.55, S.radii.foreArm * 0.92);
  band('upper_arm.L', j.shoulderL, j.elbowL, 0.45, S.radii.upperArm);
  band('forearm.L', j.elbowL, j.wristL, 0.55, S.radii.foreArm * 0.92);
  for (const side of ['R', 'L'] as const) band(`shin.${side}`, j[`knee${side}`], j[`ankle${side}`], 0.45, S.radii.shin);
  // The legs, and the boots standing toes up.
  for (const side of ['R', 'L'] as const) {
    cap(`thigh.${side}`, 'armour', j[`hip${side}`], j[`knee${side}`], S.radii.thigh);
    cap(`shin.${side}`, 'armour', j[`knee${side}`], j[`ankle${side}`], S.radii.shin);
    const a = j[`ankle${side}`];
    const k = side === 'R' ? 1 : -1;
    const c = lying(pose, S.ankle.h * 0.5, k * S.ankle.lat, (S.foot.dep0 + S.foot.dep1) / 2);
    out.push(bodySolid('box', `foot.${side}`, 'gold', [c[0], c[1], a[2]], [S.ankle.h * 0.5 + 10, (S.foot.dep1 - S.foot.dep0) / 2, S.foot.lat]));
  }
  // The halo, torn off, upright past the crown, and the stumps of its three struts.
  out.push({ kind: 'ring', part: 'halo', mat: 'gold', c: pose.halo, axis: [1, 0, 0], R: S.halo.R, width: S.halo.width, depth: S.halo.depth });
  for (const a of [Math.PI * 0.75, Math.PI, Math.PI * 1.25]) {
    const p: V3 = [pose.halo[0] + 18, pose.halo[1] + Math.cos(a) * (S.halo.R - S.halo.width), pose.halo[2] + Math.sin(a) * (S.halo.R - S.halo.width)];
    cap('halo', 'gold', p, [p[0] + 30, Math.min(p[1], 0) - 5, p[2] + Math.sin(a) * 30], 9, 7);
  }
  // The sword: the blade from the guard toward the point, the grip and pommel the other way.
  const sw = pose.sword;
  const dir = norm(pose.swordDir);
  const across = norm(cross(dir, [0, 1, 0]));
  const flat = cross(across, dir);
  const g = pose.swordGuard;
  out.push({ kind: 'box', part: 'sword', mat: 'blade', c: add(g, scale(dir, sw.blade / 2)), axes: [dir, flat, across], half: [sw.blade / 2, sw.thick / 2, sw.width / 2] });
  out.push({ kind: 'box', part: 'sword', mat: 'gold', c: g, axes: [dir, flat, across], half: [6, 7, sw.guard / 2] });
  cap('sword', 'red', g, add(g, scale(dir, -sw.grip)), 6);
  // The rest of the grip and the pommel, broken off, lying in the sand east of the blade.
  const lie: V3 = add(add(g, scale(dir, sw.blade * 0.55)), scale(across, -120));
  const fl: V3 = [lie[0], 4, lie[2]];
  cap('sword', 'red', fl, add(fl, scale(norm([dir[0], 0, dir[2]]), -70)), 6);
  cap('sword', 'gold', add(fl, scale(norm([dir[0], 0, dir[2]]), -70)), add(fl, scale(norm([dir[0], 0, dir[2]]), -92)), 14, 14);
  return out;
}

/**
 * Points over a shape's surface about `step` apart, for testing it against
 * the road and drawing it. Not exact: enough to find where it reaches.
 */
export function surfacePoints(s: TitanShape, step: number): V3[] {
  const pts: V3[] = [];
  if (s.kind === 'capsule') {
    const ax = sub(s.b, s.a);
    const L = len(ax);
    const d = norm(ax);
    const u = norm(Math.abs(d[1]) < 0.9 ? cross(d, [0, 1, 0]) : cross(d, [1, 0, 0]));
    const v = cross(d, u);
    const nL = Math.max(1, Math.ceil(L / step));
    for (let i = 0; i <= nL; i++) {
      const t = i / nL;
      const r = s.r0 + (s.r1 - s.r0) * t;
      const c = add(s.a, scale(ax, t));
      const nA = Math.max(6, Math.ceil((2 * Math.PI * r) / step));
      for (let k = 0; k < nA; k++) {
        const a = (k / nA) * Math.PI * 2;
        pts.push(add(c, add(scale(u, Math.cos(a) * r), scale(v, Math.sin(a) * r))));
      }
    }
    // The rounded ends.
    for (const [c, r, sgn] of [[s.a, s.r0, -1], [s.b, s.r1, 1]] as const) {
      const nA = Math.max(6, Math.ceil((2 * Math.PI * r) / step));
      for (let la = 1; la <= 3; la++) {
        const e = (la / 4) * (Math.PI / 2);
        for (let k = 0; k < nA; k++) {
          const a = (k / nA) * Math.PI * 2;
          pts.push(add(c, add(scale(d, sgn * Math.sin(e) * r), add(scale(u, Math.cos(a) * Math.cos(e) * r), scale(v, Math.sin(a) * Math.cos(e) * r)))));
        }
      }
      pts.push(add(c, scale(d, sgn * r)));
    }
  } else if (s.kind === 'ring') {
    const ax = norm(s.axis);
    const u = norm(Math.abs(ax[1]) < 0.9 ? cross(ax, [0, 1, 0]) : cross(ax, [1, 0, 0]));
    const v = cross(ax, u);
    const nA = Math.ceil((2 * Math.PI * s.R) / step);
    for (let k = 0; k < nA; k++) {
      const a = (k / nA) * Math.PI * 2;
      const dir = add(scale(u, Math.cos(a)), scale(v, Math.sin(a)));
      for (const r of [s.R, s.R - s.width]) for (const z of [-s.depth / 2, s.depth / 2]) pts.push(add(s.c, add(scale(dir, r), scale(ax, z))));
    }
  } else {
    // A box's faces, or an ellipsoid's surface, on a grid.
    const [A, B, C] = s.axes;
    const [ha, hb, hc] = s.half;
    const at = (x: number, y: number, z: number): V3 => add(s.c, add(scale(A, x), add(scale(B, y), scale(C, z))));
    if (s.kind === 'box') {
      const grid = (n0: number, n1: number) => [Math.max(1, Math.ceil((2 * n0) / step)), Math.max(1, Math.ceil((2 * n1) / step))];
      for (const sgn of [-1, 1]) {
        let [m, n] = grid(hb, hc);
        for (let i = 0; i <= m; i++) for (let k = 0; k <= n; k++) pts.push(at(sgn * ha, -hb + (2 * hb * i) / m, -hc + (2 * hc * k) / n));
        [m, n] = grid(ha, hc);
        for (let i = 0; i <= m; i++) for (let k = 0; k <= n; k++) pts.push(at(-ha + (2 * ha * i) / m, sgn * hb, -hc + (2 * hc * k) / n));
        [m, n] = grid(ha, hb);
        for (let i = 0; i <= m; i++) for (let k = 0; k <= n; k++) pts.push(at(-ha + (2 * ha * i) / m, -hb + (2 * hb * k) / n, sgn * hc));
      }
    } else {
      const big = Math.max(ha, hb, hc);
      const nT = Math.max(8, Math.ceil((Math.PI * big) / step));
      for (let i = 0; i <= nT; i++) {
        const th = (i / nT) * Math.PI;
        const nP = Math.max(8, Math.ceil((2 * Math.PI * big * Math.sin(th)) / step));
        for (let k = 0; k < nP; k++) {
          const ph = (k / nP) * Math.PI * 2;
          pts.push(at(ha * Math.cos(th), hb * Math.sin(th) * Math.cos(ph), hc * Math.sin(th) * Math.sin(ph)));
        }
      }
    }
  }
  return pts;
}
