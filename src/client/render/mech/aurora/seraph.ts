// Aurora's Seraph, the Swift-class forward: a slender duellist in plate. A
// swept helm with a pearl visor drawn to a point, a lit slit across it, a
// silver crest and small swept wings at the temples, a halo standing behind
// it; a ridged cuirass, pearl below a silver band and violet above, the
// team's sigil (a sword through a halo) on the breast;
// pauldrons of layered lames; tabards front and back; a rapier along each
// forearm with a cup guard at the wrist; poleyns, greaves and pointed
// sabatons; and three long feathered fins a side, fanned out either side of
// the power unit like a seraph's wings. On the Swift's skeleton, with the
// Swift's weapons and thrusters in the same places. An original design.
// Model space: +z forward, +y up, +x to the mech's left.
import * as THREE from 'three';
import { decal } from '../decals';
import { Kit } from '../kit';
import { clawHand, mirrorX, numberDecal, wheels, type FrameCtx } from '../parts';
import { cuirass, halo, lame, sabaton, sigil } from './motifs';

export function buildSeraph(c: FrameCtx, number: string): void {
  const { rig, livery } = c;
  const J = rig.joints;
  const d = rig.dims;

  // ---- pelvis: a silver belt, tabards front and back, lames over the thighs ---------------
  {
    const k = new Kit(livery);
    k.box('K', 0.95, 0.56, 0.7, { at: [0, 0.02, 0], taper: [1.12, 1.1] });
    k.box('T', 1.04, 0.12, 0.78, { at: [0, 0.3, 0] });
    for (const s of [1, -1]) k.ball('K', 0.3, { at: [s * d.hipX, -d.hipDrop, 0] });
    for (const f of [1, -1]) {
      k.plate('P', [[-0.32, 0.24], [0.32, 0.24], [0.34, -0.8], [0, -1.04], [-0.34, -0.8]], 0.08, { at: [0, 0, f * 0.38] });
      k.plate('S', [[-0.25, 0.2], [0.25, 0.2], [0.27, -0.74], [0, -0.94], [-0.27, -0.74]], 0.1, { at: [0, 0, f * 0.39] });
    }
    sigil(k, 0.22, [0, -0.36, 0.45]);
    for (const s of [1, -1]) {
      const a = s === 1 ? 0 : Math.PI;
      lame(k, 'P', [s * d.hipX, 0, 0], 0.4, 0.46, 0.14, -0.26, a - 1.0, a + 1.0);
      lame(k, 'S', [s * d.hipX, 0, 0], 0.44, 0.5, -0.22, -0.58, a - 0.9, a + 0.9);
    }
    c.put(J.hips, k);
  }

  // ---- waist: slim, silver-ringed, a fauld of lames in front ----------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.26, 0.32, d.spineY + d.chestY, 8, { at: [0, (d.chestY - d.spineY) / 2 + 0.05, 0] });
    for (const y of [0.16, 0.52]) k.cyl('T', 0.34, 0.34, 0.08, 10, { at: [0, y, 0] });
    lame(k, 'S', [0, 0, 0], 0.34, 0.4, 0.42, 0.2, 0.35, Math.PI - 0.35);
    lame(k, 'P', [0, 0, 0], 0.32, 0.37, 0.66, 0.42, 0.4, Math.PI - 0.4);
    c.put(J.spine, k);
  }

  // ---- chest: the cuirass, pearl below and violet above, the sigil --------------------------
  {
    const k = new Kit(livery);
    k.box('K', 1.1, 1.1, 0.86, { at: [0, 0.78, -0.08], taper: [1.18, 1] });
    // The cuirass: pearl below a silver band, violet above.
    cuirass(k, 'S', [[0.12, 0.42, 0.34, -0.5], [0.5, 0.7, 0.46, -0.56], [0.62, 0.78, 0.48, -0.57]], 0.09);
    cuirass(k, 'T', [[0.58, 0.77, 0.485, -0.575], [0.66, 0.82, 0.5, -0.585]], 0.1);
    cuirass(k, 'P', [[0.62, 0.78, 0.48, -0.57], [0.95, 0.96, 0.52, -0.6], [1.32, 1.04, 0.46, -0.6], [1.58, 0.74, 0.28, -0.5]], 0.09);
    sigil(k, 0.26, [0, 1.06, 0.6]);
    k.cyl('T', 0.32, 0.4, 0.2, 10, { at: [0, 1.62, -0.06] });
    for (const s of [1, -1]) {
      k.box('K', 0.54, 0.4, 0.6, { at: [s * (d.shoulderX - 0.42), d.shoulderY + 0.02, -0.06] });
      k.cyl('D', 0.32, 0.32, 0.48, 8, { axis: 'x', at: [s * (d.shoulderX - 0.2), d.shoulderY, 0] });
    }
    // The back: a slim power unit with two nozzles, silver-banded, and the wings' mounts either side.
    k.box('F', 0.84, 0.92, 0.44, { at: [0, 0.72, -0.72], taper: [0.78, 0.9] });
    k.box('T', 0.86, 0.08, 0.46, { at: [0, 1.1, -0.72] });
    for (const s of [1, -1]) {
      k.nozzle(0.2, 0.4, { at: [s * 0.26, 0.38, -0.94], rot: [-0.35, 0, 0] });
      k.box('K', 0.26, 0.3, 0.32, { at: [s * 0.6, 1.12, -0.7] });
    }
    c.put(J.chest, k);
    for (const s of [1, -1]) c.flame(J.chest, [s * 0.26, 0.24, -1.32], [-0.35, 0, 0], 0.2, 3.4, 'main');
    const num = numberDecal(number, livery);
    num.scale.setScalar(0.5);
    num.position.set(0, 0.78, -0.946);
    num.rotation.y = Math.PI;
    num.renderOrder = 3;
    J.chest.add(num);
    decal(J.chest, livery, 'roundel', [0, 0.78, -0.942], [0, Math.PI, 0], 0.6);
  }

  // ---- wings: three long feathered fins a side, fanned up and out -------------------------
  for (const s of [1, -1] as const) {
    const k = new Kit(livery);
    k.ball('K', 0.15);
    const side = (p: Array<[number, number]>) => (s === 1 ? p : mirrorX(p));
    const fins: Array<[number, number, 'P' | 'S']> = [[0.62, 2.3, 'S'], [0.3, 2.0, 'P'], [0.0, 1.6, 'P']];
    fins.forEach(([lift, len, slot], i) => {
      const o = { at: [0, 0, -i * 0.07] as [number, number, number], rot: [0, 0, s * lift] as [number, number, number] };
      k.plate(slot, side([[0, -0.07], [0, 0.07], [len * 0.7, 0.16], [len, 0.02], [len * 0.72, -0.1]]), 0.07, o);
      k.plate('T', side([[len * 0.15, 0.085], [len * 0.7, 0.17], [len, 0.02], [len * 0.68, 0.13], [len * 0.15, 0.045]]), 0.09, o);
      k.plate('G', side([[len * 0.2, -0.015], [len * 0.66, 0.045], [len * 0.66, 0.015], [len * 0.2, -0.04]]), 0.09, o);
    });
    // The poses turn the wing joint, so the wings' own sweep rides on a group inside it.
    const wing = s === 1 ? J.wingL : J.wingR;
    wing.position.set(s * 0.64, 1.14, -0.82);
    const fan = new THREE.Group();
    fan.rotation.set(0, s * 0.55, 0);
    wing.add(fan);
    c.put(fan, k);
  }

  // ---- head: the swept helm, its visor lit, a halo behind ------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.16, 0.2, 0.44, 8, { at: [0, -0.06, -0.06] });
    k.ball('P', 0.34, { at: [0, 0.32, -0.06], scale: [0.88, 1.0, 1.12] });
    // The visor: pearl, drawn to a point at the chin, a lit slit across it, a silver ridge below.
    k.box('S', 0.5, 0.36, 0.24, { at: [0, 0.32, 0.2], taper: [0.88, 0.8] });
    k.plate('S', [[-0.25, 0.14], [0.25, 0.14], [0.1, -0.1], [0, -0.16], [-0.1, -0.1]], 0.2, { at: [0, 0, 0.22] });
    k.box('D', 0.46, 0.07, 0.04, { at: [0, 0.36, 0.31] });
    k.box('G', 0.4, 0.035, 0.04, { at: [0, 0.36, 0.325] });
    k.box('T', 0.04, 0.36, 0.05, { at: [0, 0.12, 0.32] });
    // A silver crest along the crown and the helm's tail swept back over the neck.
    k.prism('T', [[0.24, 0.6], [0.0, 0.72], [-0.4, 0.74], [-0.78, 0.62], [-0.4, 0.62], [0.0, 0.6]], 0.06);
    k.prism('P', [[-0.2, 0.5], [-0.62, 0.38], [-0.88, 0.18], [-0.6, 0.16], [-0.2, 0.06]], 0.46);
    // Small swept wings at the temples.
    for (const s of [1, -1]) k.prism('T', [[0.05, 0.36], [-0.32, 0.54], [-0.66, 0.62], [-0.46, 0.48], [-0.14, 0.28]], 0.05, { at: [s * 0.3, 0, 0], rot: [0, 0, s * -0.2] });
    halo(k, 0.46, [0, 0.46, -0.42], [-0.25, 0, 0]);
    const head = new THREE.Group();
    head.position.set(0, 0.08, 0.1);
    head.scale.setScalar(1.22);
    J.head.add(head);
    c.put(head, k);
  }

  // ---- arms: lamed pauldrons, rapiers along the forearms ---------------------------------------
  for (const s of [1, -1] as const) {
    const sh = s === 1 ? J.shL : J.shR;
    const el = s === 1 ? J.elL : J.elR;
    const wr = s === 1 ? J.wrL : J.wrR;
    const a = s === 1 ? 0 : Math.PI;
    {
      const k = new Kit(livery);
      k.ball('K', 0.34);
      k.box('P', 0.42, d.upperArm - 0.2, 0.44, { at: [0, -d.upperArm / 2 - 0.05, 0], taper: [0.85, 0.85] });
      k.box('S', 0.06, d.upperArm * 0.34, 0.32, { at: [s * 0.22, -d.upperArm * 0.6, 0] });
      // The pauldron: a dome over the shoulder, a silver rim, two lames below.
      k.lathe('P', [[0, -0.28], [0.42, -0.22], [0.5, 0.02], [0.38, 0.28], [0, 0.34]], 10, { at: [s * 0.16, 0.12, 0], scale: [1, 0.9, 1.1] });
      lame(k, 'T', [s * 0.1, 0, 0], 0.5, 0.52, 0.06, -0.04, a - 1.5, a + 1.5, 0.06);
      lame(k, 'S', [s * 0.1, 0, 0], 0.48, 0.54, -0.02, -0.26, a - 1.4, a + 1.4);
      lame(k, 'P', [s * 0.1, 0, 0], 0.44, 0.5, -0.22, -0.46, a - 1.3, a + 1.3);
      c.put(sh, k);
      decal(sh, livery, s === 1 ? 'emblem' : 'warning', [s * 0.255, -d.upperArm * 0.6, 0], [0, (s * Math.PI) / 2, 0], 0.28);
    }
    {
      const k = new Kit(livery);
      const fl = d.foreArm;
      k.cyl('D', 0.22, 0.22, 0.44, 8, { axis: 'x' });
      k.cyl('T', 0.2, 0.2, 0.06, 10, { axis: 'x', at: [s * 0.24, 0, 0] });
      k.box('P', 0.44, fl - 0.1, 0.48, { at: [0, -fl / 2 - 0.02, 0.02], taper: [0.8, 0.8] });
      k.box('S', 0.3, fl * 0.5, 0.06, { at: [0, -fl * 0.55, 0.25], taper: [0.8, 1] });
      k.cyl('T', 0.28, 0.28, 0.08, 10, { at: [0, -fl + 0.08, 0.02] });
      // The rapier: a needle of a blade down the forearm's outside, its edge lit, a cup guard at the wrist.
      k.prism('T', [[0.02, -0.25], [0.1, -0.25], [0.08, -fl - 1.7], [0.0, -fl - 2.05], [-0.04, -fl - 1.7], [-0.04, -0.5]], 0.05, { at: [s * 0.3, 0, 0] });
      k.prism('G', [[0.05, -0.4], [0.07, -0.4], [0.05, -fl - 1.6], [0.03, -fl - 1.6]], 0.06, { at: [s * 0.3, 0, 0] });
      k.cyl('T', 0.17, 0.12, 0.08, 10, { at: [s * 0.31, -fl + 0.02, 0.03] });
      c.put(el, k);
    }
    {
      const k = new Kit(livery);
      clawHand(k, s, 1);
      k.cyl('T', 0.2, 0.2, 0.1, 10, { at: [0, -0.06, 0] });
      c.put(wr, k);
    }
    const hand = s === 1 ? rig.handL : rig.handR;
    hand.position.set(0, -0.2, 0.3);
    if (s === -1) {
      rig.muzzle.position.set(0, -d.foreArm - 1.5, 0.4);
      el.add(rig.muzzle);
    }
  }

  // ---- legs: cuisses, poleyns, greaves, pointed sabatons ---------------------------------------
  for (const s of [1, -1] as const) {
    const hip = s === 1 ? J.hipL : J.hipR;
    const knee = s === 1 ? J.kneeL : J.kneeR;
    const ankle = s === 1 ? J.ankleL : J.ankleR;
    {
      const k = new Kit(livery);
      k.box('K', 0.5, d.thigh - 0.25, 0.54, { at: [0, -d.thigh / 2 - 0.05, 0], taper: [1.1, 1.06] });
      k.box('P', 0.56, d.thigh - 0.4, 0.6, { at: [0, -d.thigh / 2 - 0.08, 0.03], taper: [1.06, 1.04] });
      k.box('S', 0.34, d.thigh * 0.5, 0.06, { at: [0, -d.thigh * 0.55, 0.32] });
      c.put(hip, k);
    }
    {
      const k = new Kit(livery);
      k.cyl('D', 0.26, 0.26, 0.5, 8, { axis: 'x' });
      // The poleyn: a pearl cop over the knee, a silver fan on its outside.
      k.lathe('S', [[0, -0.04], [0.32, -0.04], [0.3, 0.04], [0.22, 0.14], [0, 0.18]], 10, { axis: 'z', at: [0, 0.02, 0.26] });
      k.prism('T', [[0.24, 0.24], [-0.08, 0.3], [-0.28, 0.1], [-0.1, -0.2], [0.2, -0.14]], 0.05, { at: [s * 0.3, 0, 0] });
      // The greave: narrow at the knee, pearl down its front with a silver ridge.
      k.box('P', 0.56, d.shin - 0.3, 0.6, { at: [0, -d.shin / 2 + 0.02, -0.02], taper: [0.8, 0.82] });
      k.box('S', 0.3, d.shin * 0.6, 0.06, { at: [0, -d.shin * 0.5, 0.27], taper: [0.8, 1] });
      k.box('T', 0.04, d.shin * 0.6, 0.07, { at: [0, -d.shin * 0.5, 0.3] });
      k.nozzle(0.13, 0.24, { at: [0, -1.3, -0.36], rot: [0.9, 0, 0] }, 8);
      c.put(knee, k);
      c.flame(knee, [0, -1.48, -0.54], [0.9, 0, 0], 0.16, 1.6, 'leg');
    }
    {
      const k = new Kit(livery);
      const ay = d.ankleY;
      k.ball('K', 0.24);
      sabaton(k, -ay + 0.38, -0.62, 1.6, 0.28, 0.3);
      k.box('K', 0.36, 0.12, 2.2, { at: [0, -ay + 0.34, 0.35] });
      wheels(k, ay, [-0.5, 0.35, 1.2], 0.28, 0.3);
      c.put(ankle, k);
    }
  }
}
