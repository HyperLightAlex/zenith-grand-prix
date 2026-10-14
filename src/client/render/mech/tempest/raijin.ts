// Tempest's Raijin, the Bulwark-class defender: the thunder god as a storm
// machine. A broad storm helm with two gold horns curving up from the brow, a
// black faceplate with gold fangs, its mouth and eyes lit like lightning; a
// massive jade cuirass, a black breast plate edged in gold, a great lightning
// bolt lit down it; a bold shoulder plate a side, lightning streaking down it
// and lightning rods standing on it; tassets cut jagged like lightning that
// swing with the legs; gauntlets ringed with lit coils, the scatter cannon in
// a black housing under the right; and behind it all a gold hoop hung with
// eight thunder drums, standing round the back like a halo. On the Bulwark's
// skeleton, with the Bulwark's weapons and thrusters in the same places. An
// original design. Model space: +z forward, +y up, +x to the mech's left.
import * as THREE from 'three';
import { decal } from '../decals';
import { Kit } from '../kit';
import { numberDecal, wheels, type FrameCtx } from '../parts';
import { cuirass, hoop, lame, sweepXY } from '../shapes';
import { band, bolt, rod, shoulderPlate, stormHelm, streak, tasset } from './motifs';

export function buildRaijin(c: FrameCtx, number: string): void {
  const { rig, livery } = c;
  const J = rig.joints;
  const d = rig.dims;
  const b = 1.38;

  // ---- pelvis: a black sash knotted in gold, a jade plate over each hip, tassets that swing with the legs ----
  {
    const k = new Kit(livery);
    k.box('K', 1.25 * b, 0.68, 0.95 * b, { at: [0, 0.02, -0.02], taper: [1.12, 1.05] });
    k.box('S', 1.38 * b, 0.22, 1.04 * b, { at: [0, 0.38, -0.02] });
    k.box('T', 0.32, 0.3, 0.08, { at: [0, 0.38, 0.71] });
    for (const s of [1, -1]) {
      const a = s === 1 ? 0 : Math.PI;
      k.ball('K', 0.44, { at: [s * d.hipX, -d.hipDrop, 0] });
      lame(k, 'P', [s * d.hipX, 0, 0], 0.58, 0.7, 0.22, -0.6, a - 1.0, a + 1.0, 0.1);
      lame(k, 'T', [s * d.hipX, 0, 0], 0.7, 0.72, -0.58, -0.66, a - 0.98, a + 0.98, 0.08);
    }
    c.put(J.hips, k);
    for (const s of [1, -1] as const) {
      const sk = s === 1 ? rig.skirts.l : rig.skirts.r;
      sk.position.set(s * 0.46, 0.24, 0.66);
      const f = new Kit(livery);
      f.cyl('K', 0.07, 0.07, 0.8, 8, { axis: 'x' });
      tasset(f, 0.42, 1.0, -0.08, 1);
      c.put(sk, f);
    }
    {
      const sk = rig.skirts.back;
      sk.position.set(0, 0.24, -0.7);
      const f = new Kit(livery);
      f.cyl('K', 0.07, 0.07, 1.2, 8, { axis: 'x' });
      tasset(f, 0.82, 1.0, 0.08, -1);
      c.put(sk, f);
    }
  }

  // ---- waist ------------------------------------------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.48 * b, 0.58 * b, d.spineY + d.chestY, 10, { at: [0, (d.chestY - d.spineY) / 2 + 0.05, 0] });
    for (const y of [0.24, 0.6]) k.cyl('S', 0.66 * b, 0.66 * b, 0.12, 12, { at: [0, y, 0] });
    c.put(J.spine, k);
  }

  // ---- chest: the cuirass and its bolt; the backpack; the hoop of thunder drums ---------------------
  {
    const k = new Kit(livery);
    const cw = d.shoulderX - 0.45;
    k.box('K', 2.1, 1.55, 1.5, { at: [0, 0.82, -0.1] });
    const DO: Array<[number, number, number, number]> = [[0.05, 0.85, 0.72, -0.98], [0.5, 1.45, 0.86, -1.0], [1.05, 1.86, 0.92, -1.0], [1.45, 1.95, 0.84, -1.0], [1.86, 1.2, 0.52, -0.9]];
    cuirass(k, 'P', DO, 0.06);
    band(k, 'S', DO, 1.3, 1.7, 0.022, 0.06);
    band(k, 'T', DO, 1.24, 1.31, 0.035, 0.06);
    bolt(k, 'G', 1.0, [0, 0.72, 0.97]);
    k.cyl('S', 0.6, 0.72, 0.36, 12, { at: [0, 1.96, 0.0] });
    for (const s of [1, -1]) {
      k.box('K', 0.6, 0.5, 0.8, { at: [s * (cw - 0.05), d.shoulderY + 0.02, -0.06] });
      k.cyl('D', 0.5, 0.5, 0.6, 10, { axis: 'x', at: [s * (d.shoulderX - 0.34), d.shoulderY, 0] });
    }
    k.box('F', 2.2, 1.6, 1.0, { at: [0, 0.95, -1.25], taper: [0.86, 0.82] });
    k.box('S', 2.0, 0.12, 0.88, { at: [0, 1.62, -1.25] });
    for (const s of [1, -1]) k.nozzle(0.42, 0.66, { at: [s * 0.72, 0.56, -1.72], rot: [-0.25, 0, 0] });
    // The hoop behind the backpack, held on four struts, and its eight drums: black lacquered
    // barrels, gold rims, black heads with a lit heart.
    const R = 2.0;
    const cy = 1.6;
    const cz = -1.98;
    hoop(k, 'T', R, [0, cy, cz], [0, 0, 0], 0.13, 0.1);
    for (const t of [0, Math.PI, -Math.PI / 3, (-2 * Math.PI) / 3]) k.box('T', 0.95, 0.09, 0.09, { at: [Math.cos(t) * 1.47, cy + Math.sin(t) * 1.47, cz + 0.1], rot: [0, 0, t] });
    for (let i = 0; i < 8; i++) {
      const t = Math.PI / 2 + (i * Math.PI) / 4;
      const at: [number, number, number] = [Math.cos(t) * R, cy + Math.sin(t) * R, cz];
      k.lathe('S', [[0, -0.19], [0.3, -0.19], [0.37, 0], [0.3, 0.19], [0, 0.19]], 12, { axis: 'z', at });
      for (const f of [1, -1]) {
        k.cyl('T', 0.32, 0.32, 0.03, 12, { axis: 'z', at: [at[0], at[1], at[2] + f * 0.19] });
        k.cyl('S', 0.24, 0.24, 0.04, 12, { axis: 'z', at: [at[0], at[1], at[2] + f * 0.2] });
        k.cyl('G', 0.07, 0.07, 0.05, 8, { axis: 'z', at: [at[0], at[1], at[2] + f * 0.205] });
      }
    }
    c.put(J.chest, k);
    for (const s of [1, -1]) c.flame(J.chest, [s * 0.72, 0.4, -2.36], [-0.25, 0, 0], 0.4, 3.0, 'main');
    const num = numberDecal(number, livery);
    num.scale.setScalar(0.85);
    num.position.set(0, 1.12, -1.705);
    num.rotation.y = Math.PI;
    num.renderOrder = 3;
    J.chest.add(num);
    decal(J.chest, livery, 'roundel', [0, 1.12, -1.7], [0, Math.PI, 0], 0.95);
    decal(J.chest, livery, 'chevrons', [0, 0.42, -1.74], [0, Math.PI, -Math.PI / 2], 0.5, 0.2);
  }

  // ---- head: the horned storm helm and the fanged faceplate ---------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.34, 0.4, 0.5, 8, { at: [0, -0.05, -0.05] });
    stormHelm(k, 0.5, 0.3, -0.04);
    // The horns: gold, rising from the brow and curving out and up.
    for (const s of [1, -1]) {
      const path: Array<[number, number, number, number]> = [[0.2, 0.62, 0.09, 0.07], [0.4, 0.9, 0.08, 0.065], [0.58, 1.24, 0.065, 0.055], [0.63, 1.54, 0.045, 0.04], [0.55, 1.8, 0.015, 0.015]];
      k.loft('T', sweepXY(path.map(([x, y, hw, ht]) => [s * x, y, hw, ht] as [number, number, number, number]), 0.34));
    }
    // The face under the brim: dark, two lit eyes slanting down to the middle, gold brows.
    k.box('D', 0.72, 0.22, 0.42, { at: [0, 0.24, 0.2] });
    for (const s of [1, -1]) {
      k.box('G', 0.18, 0.045, 0.04, { at: [s * 0.17, 0.26, 0.42], rot: [0, 0, s * 0.3] });
      k.box('T', 0.24, 0.05, 0.06, { at: [s * 0.17, 0.33, 0.42], rot: [0, 0, s * 0.35] });
    }
    // The faceplate: black, a wide mouth lit inside, gold fangs top and bottom.
    k.box('S', 0.72, 0.36, 0.44, { at: [0, 0.06, 0.2], taper: [1.06, 1] });
    k.box('D', 0.48, 0.13, 0.04, { at: [0, -0.04, 0.43] });
    k.box('G', 0.42, 0.05, 0.03, { at: [0, -0.04, 0.435] });
    for (const s of [1, -1]) {
      k.cyl('T', 0.05, 0, 0.14, 5, { at: [s * 0.17, 0.0, 0.45], bevel: 0 });
      k.cyl('T', 0, 0.045, 0.12, 5, { at: [s * 0.08, -0.08, 0.45], bevel: 0 });
    }
    k.plate('S', [[-0.34, 0.0], [0.34, 0.0], [0.14, -0.22], [-0.14, -0.22]], 0.34, { at: [0, -0.16, 0.24] });
    const head = new THREE.Group();
    head.position.set(0, 0.34, 0.1);
    head.scale.setScalar(1.3);
    J.head.add(head);
    c.put(head, k);
  }

  // ---- arms: shoulder plates and their lightning rods, coiled gauntlets, armoured fists ---------------------
  for (const s of [1, -1] as const) {
    const sh = s === 1 ? J.shL : J.shR;
    const el = s === 1 ? J.elL : J.elR;
    const wr = s === 1 ? J.wrL : J.wrR;
    const a = s === 1 ? 0 : Math.PI;
    {
      const k = new Kit(livery);
      k.ball('K', 0.52);
      k.cyl('K', 0.34, 0.4, d.upperArm - 0.25, 8, { at: [0, -d.upperArm / 2 - 0.05, 0] });
      k.box('F', 0.6, d.upperArm * 0.6, 0.78, { at: [s * 0.1, -d.upperArm * 0.58, 0], taper: [1.08, 1.05] });
      shoulderPlate(k, [0, 0, 0], a, 0.82, 0.36, -1.0, 0.8);
      for (const z of [-0.36, 0, 0.36]) rod(k, [s * 0.7, 0.3, z], z === 0 ? 1.0 : 0.72, s * -0.32);
      c.put(sh, k);
      if (s === 1) decal(sh, livery, 'emblem', [0.93, -0.62, 0], [0, Math.PI / 2, 0], 0.38);
    }
    {
      const k = new Kit(livery);
      const fl = d.foreArm;
      k.cyl('D', 0.4, 0.4, 0.8, 10, { axis: 'x' });
      k.cyl('T', 0.34, 0.34, 0.08, 10, { axis: 'x', at: [s * 0.44, 0, 0] });
      // The gauntlet: jade, flaring to the wrist, ringed with two lit coils, a bolt lit on its outside.
      k.box('P', 1.0, fl + 0.1, 1.08, { at: [0, -fl / 2 - 0.08, 0], taper: [0.82, 0.82] });
      for (const y of [-fl * 0.32, -fl * 0.62]) {
        k.box('T', 0.98, 0.12, 1.06, { at: [0, y, 0] });
        k.box('G', 1.0, 0.04, 1.08, { at: [0, y, 0] });
      }
      bolt(k, 'G', 0.5, [s * 0.47, -fl * 0.47, 0], [0, (s * Math.PI) / 2, 0], 0.04);
      k.box('T', 1.06, 0.12, 1.14, { at: [0, -fl + 0.02, 0] });
      if (s === -1) {
        // The scatter cannon, slung under the right gauntlet: three barrels in a black lacquered, gold-banded housing.
        k.box('F', 0.7, 0.7, 0.7, { at: [s * 0.82, -0.5, 0.1] });
        for (const [ox, oz] of [[0.22, -0.08], [-0.22, -0.08], [0, 0.24]] as const) {
          k.cyl('F', 0.18, 0.18, 1.3, 8, { at: [s * 1.02 + ox, -1.25, 0.1 + oz] });
          k.cyl('T', 0.21, 0.21, 0.08, 8, { at: [s * 1.02 + ox, -1.86, 0.1 + oz] });
          k.cyl('G', 0.12, 0.12, 0.05, 8, { at: [s * 1.02 + ox, -1.92, 0.1 + oz] });
        }
        k.box('S', 0.82, 0.42, 0.82, { at: [s * 1.02, -1.0, 0.12] });
        for (const y of [-0.82, -1.18]) k.box('T', 0.86, 0.05, 0.86, { at: [s * 1.02, y, 0.12] });
      }
      c.put(el, k);
    }
    {
      // The Breaker: a heavy armoured fist, a gold plate across the knuckles.
      const k = new Kit(livery);
      k.box('K', 0.84, 0.62, 0.86, { at: [0, -0.34, 0.06] });
      k.box('P', 0.96, 0.42, 0.42, { at: [0, -0.28, -0.32], taper: [0.92, 1] });
      for (let i = 0; i < 4; i++) k.box('K', 0.18, 0.34, 0.3, { at: [(i - 1.5) * 0.21, -0.66, 0.24], rot: [0.35, 0, 0], bevel: 0.025 });
      k.box('T', 0.94, 0.18, 0.36, { at: [0, -0.5, 0.42] });
      k.box('K', 0.2, 0.38, 0.24, { at: [-s * 0.42, -0.42, 0.34], rot: [0.2, 0, s * 0.5], bevel: 0.025 });
      k.cyl('S', 0.5, 0.5, 0.12, 10, { at: [0, 0.0, 0] });
      c.put(wr, k);
    }
    const hand = s === 1 ? rig.handL : rig.handR;
    hand.position.set(0, -0.3, 0.6);
    if (s === -1) {
      rig.muzzle.position.set(s * 1.02, -2.0, 0.1);
      el.add(rig.muzzle);
    }
  }

  // ---- legs: jade thigh plates, gold knee cops, lightning down the greaves -----------------------------------
  for (const s of [1, -1] as const) {
    const hip = s === 1 ? J.hipL : J.hipR;
    const knee = s === 1 ? J.kneeL : J.kneeR;
    const ankle = s === 1 ? J.ankleL : J.ankleR;
    {
      const k = new Kit(livery);
      k.box('F', 0.7 * b, d.thigh - 0.3, 0.74 * b, { at: [0, -d.thigh / 2 - 0.05, -0.02], taper: [1.2, 1.15] });
      k.box('P', 0.82 * b, d.thigh * 0.62, 0.12, { at: [0, -d.thigh * 0.42, 0.6], taper: [1.06, 1] });
      k.box('P', 0.12, d.thigh * 0.52, 0.86 * b, { at: [s * 0.6, -d.thigh * 0.5, 0.0] });
      c.put(hip, k);
    }
    {
      const k = new Kit(livery);
      k.cyl('D', 0.44, 0.44, 0.86, 10, { axis: 'x' });
      k.lathe('T', [[0, -0.06], [0.44, -0.06], [0.42, 0.06], [0.3, 0.18], [0, 0.22]], 12, { axis: 'z', at: [0, 0.02, 0.42] });
      k.box('F', 0.7, d.shin - 0.4, 0.72, { at: [0, -d.shin / 2, -0.08] });
      k.box('P', 1.0, d.shin - 0.5, 1.06, { at: [0, -d.shin / 2 - 0.12, -0.04], taper: [0.8, 0.82] });
      k.box('T', 1.06, 0.08, 1.1, { at: [0, -d.shin + 0.5, -0.04] });
      streak(k, [[0.06, -0.5], [-0.1, -0.82], [0.1, -1.14], [-0.08, -1.42]], 0.07, [0, 0, 0.5]);
      k.nozzle(0.22, 0.36, { at: [0, -1.1, -0.82], rot: [0.9, 0, 0] }, 8);
      c.put(knee, k);
      c.flame(knee, [0, -1.36, -1.08], [0.9, 0, 0], 0.26, 1.6, 'leg');
    }
    {
      const k = new Kit(livery);
      const ay = d.ankleY;
      const len = 2.9;
      k.ball('K', 0.4);
      k.prism('P', [[-0.9, -ay + 0.5], [-0.62, 0.2], [0.56, 0.16], [len - 0.95, -ay + 0.64], [len - 0.85, -ay + 0.44], [-1.0, -ay + 0.44]], 1.1);
      k.prism('T', [[len - 1.4, -ay + 0.76], [len - 0.95, -ay + 0.64], [len - 0.85, -ay + 0.44], [len - 1.4, -ay + 0.44]], 1.12);
      k.box('S', 1.12, 0.08, 0.2, { at: [0, -0.1, 0.5] });
      k.box('K', 0.68, 0.18, len - 0.2, { at: [0, -ay + 0.4, (len - 1.85) / 2] });
      wheels(k, ay, [-0.6, 0.2, len - 1.35], 0.36, 0.5);
      c.put(ankle, k);
    }
  }
}
