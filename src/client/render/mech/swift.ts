// The Swift, the forward: gaunt and biomechanical. Armour plates laid over a
// dark undersuit with lit seams running down the limbs like veins, a waist
// like a spine, tall pylons standing up off the shoulders, a narrow snouted
// head with a cluster of small eyes and blades swept back from it,
// long-fingered hands, spurred knees, clawed feet, and two long trailing
// tendrils for wings. An original design. Model space: +z forward, +y up,
// +x to the mech's left.
import * as THREE from 'three';
import { decal } from './decals';
import { Kit } from './kit';
import { clawHand, numberDecal, wheels, type FrameCtx } from './parts';

export function buildSwift(c: FrameCtx, number: string): void {
  const { rig, livery } = c;
  const J = rig.joints;
  const d = rig.dims;

  // ---- pelvis --------------------------------------------------------------------
  {
    const k = new Kit(livery);
    k.box('K', 1.0, 0.58, 0.7, { at: [0, 0.02, 0], taper: [1.15, 1.1] });
    for (const s of [1, -1]) {
      k.ball('K', 0.3, { at: [s * d.hipX, -d.hipDrop, 0] });
      // Curved hip plates, like a carapace.
      k.prism('P', [[0.32, 0.3], [0.1, 0.36], [-0.32, 0.2], [-0.36, -0.3], [0.0, -0.52], [0.34, -0.3]], 0.12, { at: [s * (d.hipX + 0.34), -0.06, 0], rot: [0, 0, s * 0.18] });
    }
    // A narrow plate dropping to a point in front, and a ridge behind.
    k.plate('P', [[-0.26, 0.28], [0.26, 0.28], [0.18, -0.3], [0, -0.62], [-0.18, -0.3]], 0.24, { at: [0, 0, 0.36] });
    k.prism('S', [[-0.3, 0.3], [-0.5, 0.15], [-0.48, -0.25], [-0.32, -0.3]], 0.2);
    c.put(J.hips, k);
  }

  // ---- waist: a segmented spine -------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('D', 0.28, 0.34, d.spineY + d.chestY, 8, { at: [0, (d.chestY - d.spineY) / 2 + 0.05, 0] });
    for (const y of [0.12, 0.38, 0.64]) k.cyl('D', 0.4, 0.44, 0.13, 8, { at: [0, y, 0] });
    for (const y of [0.12, 0.38, 0.64]) k.box('P', 0.14, 0.14, 0.2, { at: [0, y, -0.42], rot: [-0.4, 0, 0] });
    c.put(J.spine, k);
  }

  // ---- chest: ribcage under a pointed breastplate, a lit core ------------------
  {
    const k = new Kit(livery);
    k.box('K', 1.25, 1.2, 0.92, { at: [0, 0.78, -0.1], taper: [1.15, 1] });
    k.plate('P', [[0, -0.05], [0.48, 0.22], [0.98, 0.72], [1.02, 1.2], [0.5, 1.46], [-0.5, 1.46], [-1.02, 1.2], [-0.98, 0.72], [-0.48, 0.22]], 1.05, { at: [0, 0, -0.05] });
    // The core: a lit diamond sunk in the sternum.
    k.plate('D', [[0, 0.42], [0.22, 0.78], [0, 1.12], [-0.22, 0.78]], 0.2, { at: [0, 0, 0.5] });
    k.plate('G', [[0, 0.52], [0.13, 0.78], [0, 1.02], [-0.13, 0.78]], 0.04, { at: [0, 0, 0.6] });
    // Ribs either side of the core.
    for (const s of [1, -1]) {
      for (const y of [0.55, 0.78, 1.01]) k.box('S', 0.4, 0.07, 0.1, { at: [s * 0.46, y, 0.5], rot: [0, s * -0.35, s * 0.35] });
      k.cyl('D', 0.3, 0.3, 0.44, 8, { axis: 'x', at: [s * (d.shoulderX - 0.26), d.shoulderY, 0] });
    }
    k.box('F', 0.7, 0.24, 0.66, { at: [0, 1.55, -0.1], taper: [0.8, 0.85] });
    // Dorsal plates down the back, and a slim power unit.
    for (let i = 0; i < 4; i++) k.prism('S', [[-0.42, 1.4 - i * 0.32], [-0.82, 1.6 - i * 0.32], [-0.84, 1.46 - i * 0.32], [-0.5, 1.2 - i * 0.32]], 0.1);
    k.box('F', 0.8, 0.9, 0.42, { at: [0, 0.72, -0.72], taper: [0.8, 0.9] });
    for (const s of [1, -1]) k.nozzle(0.2, 0.4, { at: [s * 0.26, 0.38, -0.94], rot: [-0.35, 0, 0] });
    c.put(J.chest, k);
    for (const s of [1, -1]) c.flame(J.chest, [s * 0.26, 0.24, -1.32], [-0.35, 0, 0], 0.2, 3.4, 'main');
    const num = numberDecal(number, livery);
    num.scale.setScalar(0.5);
    num.position.set(0, 1.0, -0.94);
    num.rotation.y = Math.PI;
    J.chest.add(num);
  }

  // ---- tendrils ------------------------------------------------------------------------
  for (const s of [1, -1] as const) {
    const k = new Kit(livery);
    k.ball('K', 0.14);
    // Three tapering segments trailing back and down, a lit seam along them.
    k.prism('K', [[0, 0.1], [-1.2, 0.35], [-1.22, 0.18], [0, -0.08]], 0.16);
    k.prism('S', [[-1.15, 0.36], [-2.4, 0.3], [-2.42, 0.16], [-1.15, 0.16]], 0.12);
    k.prism('T', [[-2.35, 0.3], [-3.5, 0.0], [-3.52, -0.06], [-2.35, 0.16]], 0.08);
    k.prism('G', [[-0.2, 0.12], [-2.3, 0.26], [-2.3, 0.22], [-0.2, 0.08]], 0.18);
    const wing = s === 1 ? J.wingL : J.wingR;
    wing.position.set(s * 0.42, 1.2, -0.8);
    wing.rotation.set(0, s * 0.25, 0);
    c.put(wing, k);
  }

  // ---- head: narrow snout, clustered eyes, swept blades ----------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.16, 0.2, 0.5, 8, { at: [0, -0.06, -0.08] });
    k.prism('P', [[-0.36, 0.06], [0.22, 0.02], [0.66, 0.16], [0.58, 0.32], [0.1, 0.46], [-0.38, 0.4]], 0.48);
    // Lower jaw, set slightly apart from the head.
    k.prism('K', [[-0.2, -0.04], [0.5, 0.06], [0.46, 0.13], [-0.1, 0.08]], 0.34);
    // Eyes: two small lenses a side, stacked, in a dark socket band.
    k.box('D', 0.5, 0.16, 0.3, { at: [0, 0.27, 0.36], rot: [0, 0, 0] });
    for (const s of [1, -1]) {
      k.box('G', 0.09, 0.06, 0.04, { at: [s * 0.13, 0.31, 0.53], rot: [0, 0, s * 0.3] });
      k.box('G', 0.06, 0.045, 0.04, { at: [s * 0.21, 0.23, 0.5], rot: [0, 0, s * 0.3] });
    }
    // Blades swept back from the sides of the head.
    const blade: Array<[number, number]> = [[0.05, 0.36], [-1.0, 0.82], [-1.05, 0.7], [-0.12, 0.24]];
    for (const s of [1, -1]) k.prism('T', blade, 0.06, { at: [s * 0.24, 0, 0], rot: [0, s * 0.18, s * -0.12] });
    k.plate('S', [[-0.09, 0.42], [0.09, 0.42], [0, 0.62]], 0.05, { at: [0, 0, 0.2], rot: [-0.5, 0, 0] });
    // A touch bigger than drawn: the head reads small against the pylons.
    const head = new THREE.Group();
    head.scale.setScalar(1.2);
    J.head.add(head);
    c.put(head, k);
  }

  // ---- arms: thin, plated, with pylons standing off the shoulders --------------------
  for (const s of [1, -1] as const) {
    const sh = s === 1 ? J.shL : J.shR;
    const el = s === 1 ? J.elL : J.elR;
    const wr = s === 1 ? J.wrL : J.wrR;
    {
      const k = new Kit(livery);
      k.ball('K', 0.3);
      k.cyl('D', 0.21, 0.25, d.upperArm - 0.2, 8, { at: [0, -d.upperArm / 2 - 0.05, 0] });
      k.box('P', 0.14, d.upperArm * 0.42, 0.36, { at: [s * 0.22, -d.upperArm * 0.5, 0], taper: [1.1, 1] });
      k.box('G', 0.03, d.upperArm * 0.6, 0.04, { at: [s * 0.08, -d.upperArm * 0.55, 0.23] });
      // Pylon: a tall plate rising past the head, a trim cap, a lit slot.
      k.box('P', 0.42, 1.55, 0.86, { at: [s * 0.5, 0.75, -0.02], taper: [0.7, 0.75], rot: [0, 0, s * -0.12] });
      k.box('S', 0.44, 0.5, 0.88, { at: [s * 0.44, 0.2, -0.02], rot: [0, 0, s * -0.12] });
      k.box('T', 0.32, 0.12, 0.68, { at: [s * 0.58, 1.55, -0.02], rot: [0, 0, s * -0.12] });
      k.box('G', 0.03, 0.8, 0.06, { at: [s * 0.74, 0.85, 0.2], rot: [0, 0, s * -0.12] });
      c.put(sh, k);
      decal(sh, livery, s === 1 ? 'emblem' : 'warning', [s * 0.72, 0.62, -0.02], [0, (s * Math.PI) / 2, s * 0.12], 0.42);
    }
    {
      const k = new Kit(livery);
      const fl = d.foreArm;
      k.cyl('D', 0.22, 0.22, 0.44, 8, { axis: 'x' });
      k.cyl('D', 0.21, 0.17, fl - 0.1, 8, { at: [0, -fl / 2, 0] });
      k.box('P', 0.36, fl * 0.45, 0.44, { at: [0, -fl * 0.3, 0.04], taper: [1.15, 1.1] });
      k.box('G', 0.03, fl * 0.5, 0.04, { at: [s * 0.1, -fl * 0.72, 0.2] });
      // A long spike along the outside of the forearm, lit along its edge.
      k.prism('T', [[0.06, 0.05], [0.2, -0.1], [0.12, -fl - 2.0], [0.02, -fl - 2.1], [-0.04, -fl * 0.6]], 0.06, { at: [s * 0.3, 0, 0] });
      k.prism('G', [[0.18, -0.15], [0.23, -0.15], [0.14, -fl - 2.0], [0.1, -fl - 2.0]], 0.03, { at: [s * 0.3, 0, 0] });
      c.put(el, k);
    }
    {
      const k = new Kit(livery);
      clawHand(k, s, 1);
      c.put(wr, k);
    }
    const hand = s === 1 ? rig.handL : rig.handR;
    hand.position.set(0, -0.2, 0.3);
    if (s === -1) {
      rig.muzzle.position.set(0, -d.foreArm - 1.5, 0.4);
      el.add(rig.muzzle);
    }
  }

  // ---- legs: lean, spurred at the knee ---------------------------------------------
  for (const s of [1, -1] as const) {
    const hip = s === 1 ? J.hipL : J.hipR;
    const knee = s === 1 ? J.kneeL : J.kneeR;
    const ankle = s === 1 ? J.ankleL : J.ankleR;
    {
      const k = new Kit(livery);
      k.cyl('D', 0.31, 0.24, d.thigh - 0.2, 8, { at: [0, -d.thigh / 2 - 0.05, 0] });
      k.prism('P', [[0.12, -0.3], [0.38, -0.5], [0.36, -1.35], [0.16, -1.5], [0.02, -0.4]], 0.44);
      k.box('G', 0.03, d.thigh * 0.5, 0.04, { at: [s * 0.29, -d.thigh * 0.6, 0.02] });
      k.box('G', 0.03, d.thigh * 0.4, 0.04, { at: [0, -d.thigh * 0.7, 0.29] });
      c.put(hip, k);
    }
    {
      const k = new Kit(livery);
      k.cyl('D', 0.26, 0.26, 0.5, 8, { axis: 'x' });
      k.prism('P', [[0.14, 0.3], [0.42, 0.06], [0.36, -0.26], [0.14, -0.2]], 0.44);
      // The spur behind the knee.
      k.prism('T', [[-0.1, 0.2], [-0.95, 0.5], [-0.95, 0.38], [-0.2, -0.25]], 0.1);
      k.cyl('D', 0.23, 0.18, d.shin - 0.3, 8, { at: [0, -d.shin / 2, -0.04] });
      k.prism('P', [[0.26, -0.3], [0.4, -1.3], [0.3, -d.shin + 0.35], [0.1, -d.shin + 0.45], [0.08, -0.4]], 0.4);
      k.box('G', 0.03, d.shin * 0.55, 0.04, { at: [s * 0.22, -d.shin * 0.5, -0.04] });
      k.nozzle(0.13, 0.24, { at: [0, -1.3, -0.32], rot: [0.9, 0, 0] }, 8);
      c.put(knee, k);
      c.flame(knee, [0, -1.48, -0.5], [0.9, 0, 0], 0.16, 1.6, 'leg');
    }
    {
      const k = new Kit(livery);
      const ay = d.ankleY;
      k.ball('K', 0.24);
      // A narrow, sculpted foot ending in three claws, a spur at the heel.
      k.prism('P', [[-0.6, -ay + 0.5], [-0.36, 0.12], [0.25, 0.1], [1.15, -ay + 0.56], [1.1, -ay + 0.4], [-0.66, -ay + 0.38]], 0.46);
      k.prism('S', [[0.0, 0.06], [0.3, 0.04], [0.9, -ay + 0.6], [0.6, -ay + 0.62]], 0.3);
      for (const [x, yaw] of [[0, 0], [0.17, 0.22], [-0.17, -0.22]] as const) {
        k.prism('T', [[1.0, -ay + 0.52], [1.75, -ay + 0.4], [1.72, -ay + 0.33], [1.0, -ay + 0.38]], 0.08, { at: [x, 0, 0], rot: [0, yaw, 0] });
      }
      k.prism('T', [[-0.55, -ay + 0.5], [-1.15, -ay + 0.62], [-1.12, -ay + 0.52], [-0.62, -ay + 0.4]], 0.08);
      k.box('K', 0.36, 0.12, 2.2, { at: [0, -ay + 0.34, 0.35] });
      wheels(k, ay, [-0.5, 0.35, 1.2], 0.28, 0.3);
      c.put(ankle, k);
    }
  }
}
