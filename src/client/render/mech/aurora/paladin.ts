// Aurora's Paladin, the Bulwark-class defender: a crowned knight behind tower
// shields. A great helm, tall and flat-topped, its pearl face crossed by a
// lit eye slit and a silver bar, breaths pierced below, a silver crown round
// its top and a great halo behind it; a massive ridged cuirass, pearl below a
// silver band and violet above, the team's sigil (a sword through a halo)
// on the breast and a high
// gorget; a tower shield hung on each shoulder, violet in a pearl border with
// the sigil; vambraces flaring to the wrist and armoured fists with
// gadlings on the knuckles for the Breaker, the scatter cannon slung in a
// silver housing under the right; a surcoat that swings with the legs; a
// backpack with two spires; two banners on poles either side of it; poleyns,
// greaves and pointed sabatons. On the Bulwark's skeleton, with the Bulwark's
// weapons and thrusters in the same places. An original design. Model space:
// +z forward, +y up, +x to the mech's left.
import * as THREE from 'three';
import { decal } from '../decals';
import { Kit } from '../kit';
import { mirrorX, numberDecal, wheels, type FrameCtx } from '../parts';
import { cuirass, curvedPlate, halo, lame, sabaton, sigil } from './motifs';

export function buildPaladin(c: FrameCtx, number: string): void {
  const { rig, livery } = c;
  const J = rig.joints;
  const d = rig.dims;
  const b = 1.38;

  // ---- pelvis: a silver belt with the sigil at its buckle, lames over the thighs, the surcoat ----
  {
    const k = new Kit(livery);
    k.box('K', 1.25 * b, 0.68, 0.95 * b, { at: [0, 0.02, -0.02], taper: [1.12, 1.05] });
    k.box('T', 1.38 * b, 0.22, 1.04 * b, { at: [0, 0.38, -0.02] });
    sigil(k, 0.17, [0, 0.39, 0.72]);
    for (const s of [1, -1]) {
      const a = s === 1 ? 0 : Math.PI;
      k.ball('K', 0.44, { at: [s * d.hipX, -d.hipDrop, 0] });
      lame(k, 'P', [s * d.hipX, 0, 0], 0.58, 0.66, 0.2, -0.3, a - 1.0, a + 1.0, 0.09);
      lame(k, 'S', [s * d.hipX, 0, 0], 0.62, 0.7, -0.24, -0.7, a - 0.9, a + 0.9, 0.09);
      lame(k, 'T', [s * d.hipX, 0, 0], 0.68, 0.72, -0.64, -0.76, a - 0.85, a + 0.85, 0.08);
    }
    c.put(J.hips, k);
    const tilt: [number, number, number] = [-0.08, 0, 0];
    for (const s of [1, -1] as const) {
      const sk = s === 1 ? rig.skirts.l : rig.skirts.r;
      sk.position.set(s * 0.46, 0.24, 0.62);
      const f = new Kit(livery);
      f.cyl('K', 0.08, 0.08, 0.7, 8, { axis: 'x' });
      f.plate('P', [[-0.42, 0.04], [0.42, 0.04], [0.42, -1.1], [0, -1.3], [-0.42, -1.1]], 0.1, { at: [0, 0, 0.08], rot: tilt });
      f.plate('S', [[-0.34, 0.0], [0.34, 0.0], [0.34, -1.02], [0, -1.2], [-0.34, -1.02]], 0.12, { at: [0, 0, 0.09], rot: tilt });
      c.put(sk, f);
    }
    {
      const sk = rig.skirts.back;
      sk.position.set(0, 0.24, -0.7);
      const f = new Kit(livery);
      f.cyl('K', 0.08, 0.08, 1.0, 8, { axis: 'x' });
      f.plate('P', [[-0.8, 0.04], [0.8, 0.04], [0.82, -1.1], [0, -1.32], [-0.82, -1.1]], 0.1, { at: [0, 0, -0.08], rot: [0.08, 0, 0] });
      f.plate('S', [[-0.72, 0.0], [0.72, 0.0], [0.74, -1.02], [0, -1.22], [-0.74, -1.02]], 0.12, { at: [0, 0, -0.09], rot: [0.08, 0, 0] });
      c.put(sk, f);
    }
  }

  // ---- waist ------------------------------------------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.48 * b, 0.58 * b, d.spineY + d.chestY, 10, { at: [0, (d.chestY - d.spineY) / 2 + 0.05, 0] });
    for (const y of [0.24, 0.6]) k.cyl('T', 0.66 * b, 0.66 * b, 0.1, 12, { at: [0, y, 0] });
    lame(k, 'S', [0, 0, 0], 0.82, 0.88, 0.5, 0.22, 0.45, Math.PI - 0.45, 0.09);
    lame(k, 'P', [0, 0, 0], 0.78, 0.84, 0.82, 0.52, 0.5, Math.PI - 0.5, 0.09);
    c.put(J.spine, k);
  }

  // ---- chest: the cuirass, the sigil, the gorget; the backpack, its spires and the banners' mounts ----
  {
    const k = new Kit(livery);
    const cw = d.shoulderX - 0.45;
    k.box('K', 2.1, 1.55, 1.5, { at: [0, 0.82, -0.1] });
    cuirass(k, 'S', [[0.05, 0.85, 0.72, -0.98], [0.5, 1.45, 0.86, -1.0], [0.66, 1.58, 0.88, -1.0]], 0.12);
    cuirass(k, 'T', [[0.62, 1.57, 0.885, -1.005], [0.72, 1.64, 0.9, -1.015]], 0.13);
    cuirass(k, 'P', [[0.66, 1.58, 0.88, -1.0], [1.05, 1.86, 0.92, -1.0], [1.45, 1.95, 0.84, -1.0], [1.86, 1.2, 0.52, -0.9]], 0.12);
    sigil(k, 0.46, [0, 1.16, 1.02], [0, 0, 0], 0.08);
    k.cyl('T', 0.6, 0.72, 0.38, 12, { at: [0, 1.98, 0.0] });
    for (const s of [1, -1]) {
      k.box('K', 0.6, 0.5, 0.8, { at: [s * (cw - 0.05), d.shoulderY + 0.02, -0.06] });
      k.cyl('D', 0.5, 0.5, 0.6, 10, { axis: 'x', at: [s * (d.shoulderX - 0.34), d.shoulderY, 0] });
    }
    k.box('F', 2.2, 1.6, 1.0, { at: [0, 0.95, -1.25], taper: [0.86, 0.82] });
    k.box('T', 2.0, 0.1, 0.88, { at: [0, 1.62, -1.25] });
    for (const s of [1, -1]) {
      k.nozzle(0.42, 0.66, { at: [s * 0.72, 0.56, -1.72], rot: [-0.25, 0, 0] });
      k.box('S', 0.44, 0.24, 0.44, { at: [s * 0.62, 1.8, -1.25] });
      k.cyl('T', 0, 0.2, 0.8, 4, { at: [s * 0.62, 2.32, -1.25], bevel: 0 });
      k.box('K', 0.34, 0.4, 0.34, { at: [s * 1.3, 1.5, -1.18] });
    }
    c.put(J.chest, k);
    for (const s of [1, -1]) c.flame(J.chest, [s * 0.72, 0.4, -2.36], [-0.25, 0, 0], 0.4, 3.0, 'main');
    const num = numberDecal(number, livery);
    num.scale.setScalar(0.85);
    num.position.set(0, 1.22, -1.7);
    num.rotation.y = Math.PI;
    num.renderOrder = 3;
    J.chest.add(num);
    decal(J.chest, livery, 'roundel', [0, 1.22, -1.695], [0, Math.PI, 0], 0.95);
    decal(J.chest, livery, 'chevrons', [0, 0.42, -1.74], [0, Math.PI, -Math.PI / 2], 0.5, 0.2);
  }

  // ---- banners: on poles either side of the backpack, hung from crossbars --------------------
  for (const s of [1, -1] as const) {
    const k = new Kit(livery);
    const side = (p: Array<[number, number]>) => (s === 1 ? p : mirrorX(p));
    k.cyl('K', 0.12, 0.12, 0.3, 8);
    k.cyl('T', 0.06, 0.06, 2.3, 8, { at: [0, 0.85, 0] });
    k.cyl('T', 0, 0.1, 0.26, 4, { at: [0, 2.13, 0], bevel: 0 });
    k.cyl('T', 0.05, 0.05, 1.0, 8, { axis: 'x', at: [s * 0.5, 1.8, 0] });
    k.plate('S', side([[0.06, 1.78], [0.96, 1.78], [0.96, 0.24], [0.51, 0.54], [0.06, 0.24]]), 0.06);
    k.plate('P', side([[0.13, 1.71], [0.89, 1.71], [0.89, 0.36], [0.51, 0.63], [0.13, 0.36]]), 0.08);
    sigil(k, 0.34, [s * 0.51, 1.14, 0], [0, 0, 0], 0.1);
    // The poses turn the wing joint: at speed the banners swing round to stream behind.
    const wing = s === 1 ? J.wingL : J.wingR;
    wing.position.set(s * 1.36, 1.5, -1.3);
    const pole = new THREE.Group();
    pole.rotation.set(0, s * 0.12, 0);
    wing.add(pole);
    c.put(pole, k);
  }

  // ---- head: the great helm, crowned, a great halo behind -------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.34, 0.4, 0.5, 8, { at: [0, -0.05, -0.05] });
    // The helm: a tall barrel, chamfered at its corners, flat on top.
    const ring = (y: number, hx: number, hz: number): Array<[number, number, number]> => [
      [hx, y, hz * 0.7], [hx * 0.7, y, hz], [-hx * 0.7, y, hz], [-hx, y, hz * 0.7],
      [-hx, y, -hz * 0.7], [-hx * 0.7, y, -hz], [hx * 0.7, y, -hz], [hx, y, -hz * 0.7],
    ];
    k.loft('P', [ring(0.0, 0.44, 0.46), ring(0.5, 0.47, 0.49), ring(0.86, 0.45, 0.47), ring(1.0, 0.38, 0.4), ring(1.06, 0.26, 0.28)]);
    // The face: pearl, crossed by the lit eye slit and a silver bar, breaths pierced either side below.
    k.plate('S', [[-0.33, 0.06], [0.33, 0.06], [0.34, 0.84], [-0.34, 0.84]], 0.06, { at: [0, 0, 0.5] });
    k.box('D', 0.62, 0.09, 0.04, { at: [0, 0.6, 0.54] });
    k.box('G', 0.56, 0.045, 0.04, { at: [0, 0.6, 0.555] });
    k.box('T', 0.1, 0.48, 0.05, { at: [0, 0.3, 0.55] });
    k.box('T', 0.1, 0.18, 0.05, { at: [0, 0.77, 0.55] });
    for (const x of [-0.2, 0.2]) for (const y of [0.18, 0.3, 0.42]) k.box('D', 0.07, 0.04, 0.04, { at: [x, y, 0.54] });
    // The crown: a silver band round the top, its points standing up all round.
    k.loft('T', [ring(0.82, 0.475, 0.495), ring(0.95, 0.455, 0.475)]);
    for (const x of [-0.26, 0, 0.26]) {
      for (const f of [1, -1]) k.plate('T', [[-0.07, 0], [0.07, 0], [0, 0.22]], 0.04, { at: [x, 0.93, f * 0.47] });
    }
    for (const z of [-0.2, 0.2]) {
      for (const f of [1, -1]) k.plate('T', [[-0.07, 0], [0.07, 0], [0, 0.22]], 0.04, { at: [f * 0.455, 0.93, z], rot: [0, Math.PI / 2, 0] });
    }
    halo(k, 0.74, [0, 0.62, -0.62], [-0.12, 0, 0], 0.1, 0.08);
    const head = new THREE.Group();
    head.position.set(0, 0.34, 0.12);
    head.scale.setScalar(1.2);
    J.head.add(head);
    c.put(head, k);
  }

  // ---- arms: tower shields, flared vambraces, armoured fists ------------------------------------------
  for (const s of [1, -1] as const) {
    const sh = s === 1 ? J.shL : J.shR;
    const el = s === 1 ? J.elL : J.elR;
    const wr = s === 1 ? J.wrL : J.wrR;
    const a = s === 1 ? 0 : Math.PI;
    {
      const k = new Kit(livery);
      k.ball('K', 0.52);
      k.cyl('K', 0.34, 0.4, d.upperArm - 0.25, 8, { at: [0, -d.upperArm / 2 - 0.05, 0] });
      k.box('P', 0.6, d.upperArm * 0.6, 0.78, { at: [s * 0.1, -d.upperArm * 0.58, 0], taper: [1.08, 1.05] });
      k.cyl('T', 0.44, 0.44, 0.12, 10, { at: [0, -d.upperArm + 0.26, 0] });
      // The tower shield, hung on the shoulder's outside: violet in a pearl border, the sigil on it.
      curvedPlate(k, 'S', [0, 0, 0], 0.88, a, [[1.08, 0.69], [0.2, 0.73], [-0.8, 0.73], [-1.34, 0.54], [-1.7, 0.27], [-1.84, 0.04]], 0.06);
      curvedPlate(k, 'P', [0, 0, 0], 0.92, a, [[1.0, 0.62], [0.2, 0.66], [-0.8, 0.66], [-1.3, 0.48], [-1.62, 0.22], [-1.74, 0.03]], 0.06);
      sigil(k, 0.42, [s * 0.995, -0.42, 0], [0, (s * Math.PI) / 2, 0], 0.1);
      c.put(sh, k);
      if (s === 1) decal(sh, livery, 'emblem', [0.99, 0.42, 0], [0, Math.PI / 2, 0], 0.5);
    }
    {
      const k = new Kit(livery);
      const fl = d.foreArm;
      k.cyl('D', 0.4, 0.4, 0.8, 10, { axis: 'x' });
      k.cyl('T', 0.34, 0.34, 0.08, 10, { axis: 'x', at: [s * 0.44, 0, 0] });
      // The vambrace, flaring to the wrist, pearl down its front, a silver cuff.
      k.box('P', 1.0, fl + 0.1, 1.08, { at: [0, -fl / 2 - 0.08, 0], taper: [0.82, 0.82] });
      k.box('S', 0.6, fl * 0.5, 0.08, { at: [0, -fl * 0.5, 0.5], taper: [0.82, 1] });
      k.box('T', 1.06, 0.12, 1.14, { at: [0, -fl + 0.02, 0] });
      if (s === -1) {
        // The scatter cannon, slung under the right vambrace: three pearl barrels in a silver-banded housing.
        k.box('F', 0.7, 0.7, 0.7, { at: [s * 0.82, -0.5, 0.1] });
        for (const [ox, oz] of [[0.22, -0.08], [-0.22, -0.08], [0, 0.24]] as const) {
          k.cyl('S', 0.18, 0.18, 1.3, 8, { at: [s * 1.02 + ox, -1.25, 0.1 + oz] });
          k.cyl('T', 0.21, 0.21, 0.08, 8, { at: [s * 1.02 + ox, -1.86, 0.1 + oz] });
          k.cyl('G', 0.12, 0.12, 0.05, 8, { at: [s * 1.02 + ox, -1.92, 0.1 + oz] });
        }
        k.box('P', 0.82, 0.42, 0.82, { at: [s * 1.02, -1.0, 0.12] });
        k.box('T', 0.86, 0.06, 0.86, { at: [s * 1.02, -0.78, 0.12] });
        sigil(k, 0.2, [s * 1.02, -1.0, 0.55]);
      }
      c.put(el, k);
    }
    {
      // The Breaker: an armoured fist, gadlings on its knuckles.
      const k = new Kit(livery);
      k.box('K', 0.84, 0.62, 0.86, { at: [0, -0.34, 0.06] });
      k.box('P', 0.96, 0.42, 0.42, { at: [0, -0.28, -0.32], taper: [0.92, 1] });
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * 0.21;
        k.box('K', 0.18, 0.34, 0.3, { at: [x, -0.66, 0.24], rot: [0.35, 0, 0], bevel: 0.025 });
        k.cyl('T', 0, 0.06, 0.16, 4, { axis: 'z', at: [x, -0.5, 0.66], bevel: 0 });
      }
      k.box('T', 0.94, 0.18, 0.36, { at: [0, -0.5, 0.42] });
      k.box('K', 0.2, 0.38, 0.24, { at: [-s * 0.42, -0.42, 0.34], rot: [0.2, 0, s * 0.5], bevel: 0.025 });
      k.cyl('T', 0.5, 0.5, 0.12, 10, { at: [0, 0.0, 0] });
      c.put(wr, k);
    }
    const hand = s === 1 ? rig.handL : rig.handR;
    hand.position.set(0, -0.3, 0.6);
    if (s === -1) {
      rig.muzzle.position.set(s * 1.02, -2.0, 0.1);
      el.add(rig.muzzle);
    }
  }

  // ---- legs: cuisses, poleyns, greaves, pointed sabatons ---------------------------------------------
  for (const s of [1, -1] as const) {
    const hip = s === 1 ? J.hipL : J.hipR;
    const knee = s === 1 ? J.kneeL : J.kneeR;
    const ankle = s === 1 ? J.ankleL : J.ankleR;
    {
      const k = new Kit(livery);
      k.box('K', 0.7 * b, d.thigh - 0.3, 0.74 * b, { at: [0, -d.thigh / 2 - 0.05, -0.02], taper: [1.2, 1.15] });
      k.box('P', 0.82 * b, d.thigh - 0.55, 0.86 * b, { at: [0, -d.thigh / 2 - 0.12, 0.0], taper: [1.12, 1.08] });
      k.box('S', 0.6, d.thigh * 0.5, 0.08, { at: [0, -d.thigh * 0.55, 0.63] });
      k.cyl('T', 0.62, 0.62, 0.12, 12, { at: [0, -d.thigh + 0.3, 0] });
      c.put(hip, k);
    }
    {
      const k = new Kit(livery);
      k.cyl('D', 0.44, 0.44, 0.86, 10, { axis: 'x' });
      k.lathe('S', [[0, -0.06], [0.46, -0.06], [0.44, 0.06], [0.32, 0.2], [0, 0.26]], 12, { axis: 'z', at: [0, 0.02, 0.42] });
      for (const t of [1, -1]) k.prism('T', [[0.3, 0.36], [-0.1, 0.42], [-0.38, 0.14], [-0.14, -0.28], [0.26, -0.2]], 0.06, { at: [t * 0.46, 0, 0] });
      k.box('K', 0.7, d.shin - 0.4, 0.72, { at: [0, -d.shin / 2, -0.08] });
      k.box('P', 1.0, d.shin - 0.5, 1.06, { at: [0, -d.shin / 2 - 0.12, -0.04], taper: [0.78, 0.8] });
      k.box('S', 0.46, d.shin * 0.42, 0.08, { at: [0, -d.shin * 0.58, 0.46], taper: [0.8, 1] });
      k.box('T', 0.05, d.shin * 0.42, 0.09, { at: [0, -d.shin * 0.58, 0.5] });
      k.nozzle(0.22, 0.36, { at: [0, -1.1, -0.82], rot: [0.9, 0, 0] }, 8);
      c.put(knee, k);
      c.flame(knee, [0, -1.36, -1.08], [0.9, 0, 0], 0.26, 1.6, 'leg');
      if (s === 1) decal(knee, livery, 'warning', [0.46, -1.0, -0.04], [0, Math.PI / 2, 0], 0.24);
    }
    {
      const k = new Kit(livery);
      const ay = d.ankleY;
      k.ball('K', 0.4);
      sabaton(k, -ay + 0.47, -0.95, 2.15, 0.5, 0.42);
      k.box('K', 0.68, 0.18, 2.7, { at: [0, -ay + 0.4, 0.52] });
      wheels(k, ay, [-0.6, 0.2, 1.55], 0.36, 0.5);
      c.put(ankle, k);
    }
  }
}
