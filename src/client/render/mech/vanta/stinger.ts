// Vanta's Stinger, the Vector-class midfielder: a beak-headed gunner. A broad,
// hunched torso of layered angular plates under a high collar, a hooked beak
// with a single eye riding a rail above it, spiked pauldrons, a barbed Snare
// launcher on the left forearm, and in the right hand a long rifle with a drum
// magazine; short swept blade fins off the back and a three-pronged Disruptor
// emitter on the power unit. On the Vector's skeleton, with the Vector's
// weapons and thrusters in the same places. An original design. Model space:
// +z forward, +y up, +x to the mech's left.
import * as THREE from 'three';
import { decal } from '../decals';
import { Kit } from '../kit';
import { fist, mirrorX, numberDecal, wheels, type FrameCtx } from '../parts';

export function buildStinger(c: FrameCtx, number: string): void {
  const { rig, livery } = c;
  const J = rig.joints;
  const d = rig.dims;
  const b = 1.12;

  // ---- pelvis: layered tassets ------------------------------------------------------
  {
    const k = new Kit(livery);
    k.box('K', 1.15 * b, 0.6, 0.88 * b, { at: [0, 0.02, 0], taper: [1.12, 1.08] });
    for (const s of [1, -1]) {
      k.ball('K', 0.34, { at: [s * d.hipX, -d.hipDrop, 0] });
      for (let i = 0; i < 2; i++) {
        k.prism(i ? 'S' : 'P', [[0.4, 0.2 - i * 0.3], [-0.36, 0.26 - i * 0.3], [-0.46, -0.3 - i * 0.3], [0.28, -0.42 - i * 0.3]], 0.12, { at: [s * (d.hipX + 0.38 + i * 0.05), -0.02, 0], rot: [0, 0, s * (0.2 + i * 0.1)] });
      }
    }
    k.plate('S', [[-0.36, 0.26], [0.36, 0.26], [0.12, -0.5], [-0.12, -0.5]], 0.22, { at: [0, 0, 0.42] });
    k.plate('T', [[-0.1, 0.2], [0.1, 0.2], [0, -0.3]], 0.06, { at: [0, 0, 0.55] });
    k.prism('P', [[-0.1, 0.3], [-0.64, 0.18], [-0.7, -0.2], [-0.2, -0.3]], 1.0 * b);
    c.put(J.hips, k);
  }

  // ---- waist --------------------------------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('D', 0.4 * b, 0.46 * b, d.spineY + d.chestY, 10, { at: [0, (d.chestY - d.spineY) / 2 + 0.05, 0] });
    for (const y of [0.16, 0.48]) k.cyl('K', 0.52 * b, 0.56 * b, 0.14, 10, { at: [0, y, 0] });
    k.prism('S', [[0.3, 0.0], [0.56, 0.2], [0.5, 0.7], [0.3, 0.74]], 0.5 * b);
    c.put(J.spine, k);
  }

  // ---- chest: broad and hunched, layered plates, a high collar -------------------------
  {
    const k = new Kit(livery);
    const cw = d.shoulderX - 0.42;
    k.box('K', 1.45 * b, 1.3, 1.15 * b, { at: [0, 0.78, -0.1] });
    k.plate('P', [[-0.42, 0.1], [0.42, 0.1], [cw, 0.7], [cw + 0.08, 1.3], [0.7, 1.6], [-0.7, 1.6], [-cw - 0.08, 1.3], [-cw, 0.7]], 1.36 * b, { at: [0, 0, -0.06] });
    // Layered chevrons down the front, crimson between dark.
    for (let i = 0; i < 3; i++) {
      const y = 1.32 - i * 0.32;
      k.plate(i === 1 ? 'S' : 'F', [[-0.78 + i * 0.14, y], [-0.6 + i * 0.14, y + 0.08], [0, y - 0.3], [0.6 - i * 0.14, y + 0.08], [0.78 - i * 0.14, y], [0, y - 0.46]], 0.14, { at: [0, 0, 0.74 - i * 0.03] });
    }
    k.vent(0.5, 0.26, 3, { at: [0, 0.32, 0.66], rot: [0.25, 0, 0], depth: 0.1, lit: true });
    // The collar: high plates rising round the back and sides of the neck.
    k.prism('P', [[-0.22, 1.4], [-0.26, 1.92], [-0.6, 2.06], [-0.76, 1.5]], 1.2);
    for (const s of [1, -1]) {
      const wing: Array<[number, number]> = [[0.32, 1.42], [0.62, 1.9], [0.56, 2.0], [0.28, 1.62]];
      k.plate('T', s === 1 ? wing : mirrorX(wing), 0.5, { at: [0, 0, -0.1] });
      k.cyl('D', 0.38, 0.38, 0.5, 10, { axis: 'x', at: [s * (d.shoulderX - 0.28), d.shoulderY, 0] });
    }
    // The power unit, its nozzles, and the Disruptor: three prongs round a lit core.
    k.box('F', 1.36, 1.1, 0.62, { at: [0, 0.84, -0.98], taper: [0.8, 0.88] });
    for (const s of [1, -1]) {
      k.cyl('K', 0.29, 0.29, 0.28, 10, { axis: 'z', at: [s * 0.44, 0.5, -1.27], rot: [-0.25, 0, 0] });
      k.nozzle(0.26, 0.46, { at: [s * 0.44, 0.5, -1.34], rot: [-0.25, 0, 0] });
    }
    k.cyl('F', 0.26, 0.34, 0.3, 8, { at: [0, 1.5, -1.0], rot: [-0.5, 0, 0] });
    k.cyl('G', 0.12, 0.12, 0.08, 8, { at: [0, 1.66, -0.92], rot: [-0.5, 0, 0] });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.plate('T', [[-0.06, 0], [0.06, 0], [0, 0.62]], 0.08, { at: [Math.sin(a) * 0.28, 1.6, -1.0 + Math.cos(a) * 0.2], rot: [-0.5 + Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.6] });
    }
    c.put(J.chest, k);
    for (const s of [1, -1]) c.flame(J.chest, [s * 0.44, 0.39, -1.79], [-0.25, 0, 0], 0.24, 3.2, 'main');
    decal(J.chest, livery, 'stencil', [0, 0.92, -1.3], [0, Math.PI, 0], 0.42);
    decal(J.chest, livery, 'chevrons', [0, 0.44, -1.3], [0, Math.PI, -Math.PI / 2], 0.32, 0.14);
  }

  // ---- blade fins: short, swept, like a wasp's wings --------------------------------
  for (const s of [1, -1] as const) {
    const k = new Kit(livery);
    k.cyl('K', 0.13, 0.13, 0.28, 8, { axis: 'y' });
    k.prism('P', [[0.05, 0.12], [-0.8, 0.5], [-1.7, 0.6], [-1.55, 0.36], [-1.3, 0.3], [-1.4, 0.1], [-0.6, -0.12]], 0.1);
    k.prism('S', [[-0.3, 0.12], [-1.2, 0.42], [-1.24, 0.34], [-0.34, 0.04]], 0.12);
    k.prism('T', [[-1.45, 0.56], [-1.7, 0.6], [-1.55, 0.44]], 0.12, { bevel: 0.01 });
    const wing = s === 1 ? J.wingL : J.wingR;
    wing.position.set(s * 0.72, 1.05, -1.06);
    wing.rotation.set(0, 0, s * -0.15);
    c.put(wing, k);
  }

  // ---- head: a hooked beak, a single eye on a rail above it ---------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.2, 0.24, 0.38, 8, { at: [0, -0.08, -0.04] });
    k.box('P', 0.62, 0.5, 0.74, { at: [0, 0.3, 0.0], taper: [0.75, 0.8] });
    // The beak: hooked forward and down from under the brow.
    k.prism('P', [[0.26, 0.34], [0.72, 0.22], [0.86, -0.04], [0.74, -0.08], [0.6, 0.06], [0.24, 0.06]], 0.32);
    k.prism('S', [[0.3, 0.12], [0.64, 0.08], [0.6, 0.0], [0.28, 0.02]], 0.34);
    // The rail across the brow and the eye on it.
    k.box('D', 0.56, 0.12, 0.2, { at: [0, 0.42, 0.34] });
    k.box('C', 0.5, 0.05, 0.04, { at: [0, 0.43, 0.445] });
    k.box('G', 0.12, 0.08, 0.05, { at: [-0.12, 0.43, 0.455] });
    // A crimson crest and two swept horns.
    k.prism('S', [[0.1, 0.56], [-0.62, 0.84], [-0.68, 0.74], [-0.1, 0.5]], 0.08);
    for (const s of [1, -1]) k.prism('T', [[-0.05, 0.46], [-0.5, 0.82], [-0.56, 0.74], [-0.18, 0.38]], 0.06, { at: [s * 0.26, 0, 0], rot: [0, s * 0.2, s * -0.3] });
    const head = new THREE.Group();
    head.position.set(0, 0.12, 0.12);
    head.scale.setScalar(1.15);
    J.head.add(head);
    c.put(head, k);
  }

  // ---- arms: spiked pauldrons, a barbed Snare launcher, the rifle -----------------------
  for (const s of [1, -1] as const) {
    const sh = s === 1 ? J.shL : J.shR;
    const el = s === 1 ? J.elL : J.elR;
    const wr = s === 1 ? J.wrL : J.wrR;
    {
      const k = new Kit(livery);
      k.ball('K', 0.38);
      k.cyl('K', 0.25, 0.29, d.upperArm - 0.25, 8, { at: [0, -d.upperArm / 2 - 0.05, 0] });
      k.box('P', 0.46, d.upperArm * 0.5, 0.58, { at: [s * 0.08, -d.upperArm * 0.62, 0], taper: [1.08, 1.05] });
      // The pauldron: two layered angular plates and a spike.
      k.box('P', 0.86, 0.32, 1.02, { at: [s * 0.36, 0.3, 0], rot: [0, 0, s * -0.42], taper: [0.8, 0.9] });
      k.box('S', 0.78, 0.2, 0.92, { at: [s * 0.48, 0.02, 0], rot: [0, 0, s * -0.62] });
      k.plate('T', [[-0.09, 0], [0.09, 0], [0, 0.72]], 0.18, { at: [s * 0.46, 0.4, -0.1], rot: [0, 0, s * -0.5] });
      c.put(sh, k);
      const num = numberDecal(number, livery);
      num.scale.setScalar(0.46);
      num.position.set(s * 0.36, -d.upperArm * 0.62, 0);
      num.rotation.y = (s * Math.PI) / 2;
      sh.add(num);
    }
    {
      const k = new Kit(livery);
      const fl = d.foreArm;
      k.cyl('D', 0.28, 0.28, 0.56, 10, { axis: 'x' });
      k.box('P', 0.56, fl - 0.15, 0.66, { at: [0, -fl / 2 - 0.05, 0.02], taper: [1.12, 1.08] });
      k.box('S', 0.58, 0.14, 0.68, { at: [0, -fl * 0.62, 0.02] });
      k.box('F', 0.5, 0.2, 0.56, { at: [0, -fl + 0.04, 0.02] });
      if (s === 1) {
        // The Snare launcher: a barbed spike of a tube on the left forearm.
        k.box('F', 0.22, 0.7, 0.36, { at: [0.42, -fl * 0.5, 0.06] });
        k.cyl('S', 0.13, 0.08, 0.9, 8, { at: [0.42, -fl * 0.62, 0.22] });
        for (const y of [-0.36, -0.62]) k.plate('T', [[-0.04, 0], [0.04, 0], [0, 0.26]], 0.06, { at: [0.52, y - fl * 0.3, 0.22], rot: [0, 0, -2.4] });
        k.cyl('G', 0.06, 0.06, 0.02, 8, { at: [0.42, -fl * 0.62 - 0.46, 0.22] });
      }
      c.put(el, k);
    }
    {
      const k = new Kit(livery);
      fist(k, s, 1.05);
      if (s === -1) {
        // The rifle: a long barrel, a drum magazine under the receiver, a spike at the muzzle.
        k.box('F', 0.26, 1.5, 0.36, { at: [0, -0.5, 0.42] });
        k.box('S', 0.3, 0.6, 0.42, { at: [0, -0.58, 0.44], taper: [0.9, 0.9] });
        k.box('K', 0.2, 0.55, 0.3, { at: [0, 0.42, 0.36], taper: [1, 0.8] });
        k.cyl('D', 0.3, 0.3, 0.24, 12, { axis: 'x', at: [0, -0.86, 0.2] });
        k.cyl('S', 0.16, 0.16, 0.26, 10, { axis: 'x', at: [0, -0.86, 0.2] });
        k.cyl('D', 0.08, 0.09, 1.6, 8, { at: [0, -2.02, 0.46] });
        k.cyl('K', 0.12, 0.12, 0.5, 8, { at: [0, -1.5, 0.46] });
        k.plate('T', [[-0.05, 0], [0.05, 0], [0, -0.42]], 0.05, { at: [0, -2.78, 0.62] });
        k.box('K', 0.12, 0.34, 0.14, { at: [0, -0.48, 0.66] });
        k.box('G', 0.04, 0.24, 0.02, { at: [0.15, -0.6, 0.44] });
      }
      c.put(wr, k);
    }
    const hand = s === 1 ? rig.handL : rig.handR;
    hand.position.set(0, -0.2, 0.3);
    if (s === -1) {
      rig.muzzle.position.set(0, -2.86, 0.46);
      wr.add(rig.muzzle);
    }
  }

  // ---- legs: angular plates, a spike at the knee, a blade at the calf ------------------
  for (const s of [1, -1] as const) {
    const hip = s === 1 ? J.hipL : J.hipR;
    const knee = s === 1 ? J.kneeL : J.kneeR;
    const ankle = s === 1 ? J.ankleL : J.ankleR;
    {
      const k = new Kit(livery);
      k.box('K', 0.54, d.thigh - 0.3, 0.58, { at: [0, -d.thigh / 2 - 0.05, -0.02], taper: [1.16, 1.1] });
      k.prism('P', [[0.13, -0.3], [0.54, -0.66], [0.46, -d.thigh + 0.4], [0.2, -d.thigh + 0.2], [-0.06, -0.42]], 0.72);
      k.prism('S', [[0.34, -1.2], [0.5, -1.5], [0.44, -1.8], [0.26, -1.6]], 0.74);
      c.put(hip, k);
    }
    {
      const k = new Kit(livery);
      k.cyl('D', 0.31, 0.31, 0.62, 10, { axis: 'x' });
      k.prism('T', [[0.24, 0.36], [1.02, 0.14], [0.3, -0.12]], 0.22);
      k.box('K', 0.5, d.shin - 0.4, 0.5, { at: [0, -d.shin / 2, -0.06] });
      k.prism('P', [[0.42, -0.2], [0.58, -1.0], [0.48, -d.shin + 0.45], [0.3, -d.shin + 0.2], [-0.4, -d.shin + 0.34], [-0.62, -1.1], [-0.36, -0.2]], 0.74);
      k.prism('S', [[0.5, -0.5], [0.6, -1.0], [0.52, -1.5], [0.44, -1.0]], 0.76);
      // A blade fin at the back of the calf.
      k.prism('T', [[-0.42, -0.3], [-1.2, -0.5], [-1.08, -0.72], [-0.56, -1.2]], 0.08);
      k.nozzle(0.17, 0.28, { at: [0, -1.3, -0.54], rot: [0.9, 0, 0] }, 8);
      c.put(knee, k);
      c.flame(knee, [0, -1.52, -0.75], [0.9, 0, 0], 0.2, 1.6, 'leg');
      if (s === 1) decal(knee, livery, 'warning', [0.46, -0.75, -0.1], [0, Math.PI / 2, 0], 0.2);
    }
    {
      const k = new Kit(livery);
      const ay = d.ankleY;
      k.ball('K', 0.3);
      k.prism('P', [[-0.6, -ay + 0.62], [-0.42, 0.16], [0.4, 0.13], [1.0, -ay + 0.66], [0.9, -ay + 0.5], [-0.66, -ay + 0.46]], 0.62);
      for (const x of [0.16, -0.16]) k.prism('T', [[0.9, -ay + 0.6], [1.7, -ay + 0.44], [1.55, -ay + 0.32], [0.9, -ay + 0.42]], 0.12, { at: [x, 0, 0], rot: [0, x * 1.2, 0] });
      k.prism('T', [[-0.55, -ay + 0.56], [-1.2, -ay + 0.78], [-1.28, -ay + 0.56], [-0.62, -ay + 0.42]], 0.1);
      k.box('K', 0.4, 0.12, 2.4, { at: [0, -ay + 0.36, 0.36] });
      wheels(k, ay, [-0.66, 0.38, 1.42], 0.32, 0.34);
      c.put(ankle, k);
    }
  }
}
