// Vanta's Razor, the Swift-class forward: a lean, long-armed stalker. Hunched
// over a jutting breastplate, its head sunk low between two tall shoulder
// blades, a single eye riding a rail across its visor; layered angular
// pauldrons with spikes, serrated cleaver blades along the forearms, raptor
// shins and taloned feet, and two long tail fins trailing from the small of
// its back. On the Swift's skeleton, with the Swift's weapons and thrusters
// in the same places. An original design. Model space: +z forward, +y up,
// +x to the mech's left.
import * as THREE from 'three';
import { decal } from '../decals';
import { Kit } from '../kit';
import { clawHand, mirrorX, numberDecal, wheels, type FrameCtx } from '../parts';

export function buildRazor(c: FrameCtx, number: string): void {
  const { rig, livery } = c;
  const J = rig.joints;
  const d = rig.dims;

  // ---- pelvis: narrow, blades folded down over the hips -----------------------
  {
    const k = new Kit(livery);
    k.box('K', 0.95, 0.56, 0.72, { at: [0, 0.02, 0], taper: [1.15, 1.1] });
    for (const s of [1, -1]) {
      k.ball('K', 0.3, { at: [s * d.hipX, -d.hipDrop, 0] });
      k.prism('P', [[0.34, 0.22], [-0.12, 0.32], [-0.52, -0.2], [-0.24, -0.78], [0.18, -0.4]], 0.11, { at: [s * (d.hipX + 0.34), -0.04, 0], rot: [0, 0, s * 0.16] });
      k.prism('S', [[0.2, -0.36], [-0.2, -0.72], [-0.26, -0.64], [0.12, -0.3]], 0.12, { at: [s * (d.hipX + 0.36), -0.04, 0], rot: [0, 0, s * 0.16] });
    }
    k.plate('S', [[-0.3, 0.26], [0.3, 0.26], [0, -0.64]], 0.2, { at: [0, 0, 0.38] });
    k.plate('T', [[-0.12, 0.2], [0.12, 0.2], [0, -0.22]], 0.06, { at: [0, 0, 0.5] });
    c.put(J.hips, k);
  }

  // ---- waist: a ribbed spine ---------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('D', 0.26, 0.32, d.spineY + d.chestY, 8, { at: [0, (d.chestY - d.spineY) / 2 + 0.05, 0] });
    for (const y of [0.1, 0.34, 0.58]) k.cyl('K', 0.38, 0.42, 0.12, 8, { at: [0, y, 0] });
    for (const y of [0.1, 0.34, 0.58]) k.prism('S', [[-0.3, 0.06], [-0.62, 0.14], [-0.56, -0.04]], 0.16, { at: [0, y, 0] });
    c.put(J.spine, k);
  }

  // ---- chest: hunched, a V of a torso with a jutting keel ------------------------
  {
    const k = new Kit(livery);
    k.box('K', 1.1, 1.1, 0.9, { at: [0, 0.78, -0.08], taper: [1.2, 1] });
    // The torso, wide at the shoulders and narrowing to a point at the waist.
    k.plate('P', [[-0.25, 0.12], [0.25, 0.12], [0.8, 0.62], [1.12, 1.2], [1.1, 1.42], [0.62, 1.6], [-0.62, 1.6], [-1.1, 1.42], [-1.12, 1.2], [-0.8, 0.62]], 1.02, { at: [0, 0, -0.08] });
    // The keel: a narrow ridge jutting forward and down the middle of it.
    k.prism('S', [[0.3, 0.2], [0.72, 0.62], [0.62, 1.28], [0.3, 1.46]], 0.5);
    k.prism('T', [[0.66, 0.6], [0.76, 0.66], [0.68, 1.22], [0.6, 1.2]], 0.16);
    // A slatted jaw under the keel.
    k.vent(0.46, 0.3, 4, { at: [0, 0.36, 0.46], rot: [0.3, 0, 0], depth: 0.1, lit: true });
    for (const s of [1, -1]) {
      // The shoulder: a yoke out from the torso to a joint the arm hangs from.
      k.box('K', 0.56, 0.42, 0.62, { at: [s * (d.shoulderX - 0.42), d.shoulderY + 0.02, -0.04], taper: [0.9, 0.9] });
      k.cyl('D', 0.34, 0.34, 0.5, 8, { axis: 'x', at: [s * (d.shoulderX - 0.2), d.shoulderY, 0] });
      // Layered plates either side of the keel.
      const layer: Array<[number, number]> = [[0, 0], [0.44, 0.14], [0.36, 0.3], [0, 0.18]];
      k.plate('S', s === 1 ? layer : mirrorX(layer), 0.9, { at: [s * 0.36, 1.18, -0.1], rot: [0, 0, s * -0.3] });
    }
    // A hump behind the neck: the head sits low in front of it.
    k.prism('P', [[-0.1, 1.5], [-0.3, 1.92], [-0.78, 1.86], [-0.9, 1.4]], 0.86);
    k.box('F', 0.62, 0.2, 0.5, { at: [0, 1.55, 0.06], taper: [0.8, 0.85] });
    // The back: a slim power unit with two nozzles under a ridge of plates.
    for (let i = 0; i < 3; i++) k.prism('S', [[-0.46, 1.36 - i * 0.3], [-0.84, 1.5 - i * 0.3], [-0.86, 1.38 - i * 0.3], [-0.52, 1.16 - i * 0.3]], 0.12);
    k.box('F', 0.84, 0.92, 0.44, { at: [0, 0.72, -0.72], taper: [0.78, 0.9] });
    for (const s of [1, -1]) k.nozzle(0.2, 0.4, { at: [s * 0.26, 0.38, -0.94], rot: [-0.35, 0, 0] });
    c.put(J.chest, k);
    for (const s of [1, -1]) c.flame(J.chest, [s * 0.26, 0.24, -1.32], [-0.35, 0, 0], 0.2, 3.4, 'main');
    const num = numberDecal(number, livery);
    num.scale.setScalar(0.5);
    num.position.set(0, 1.0, -0.946);
    num.rotation.y = Math.PI;
    num.renderOrder = 3;
    J.chest.add(num);
    decal(J.chest, livery, 'roundel', [0, 1.0, -0.942], [0, Math.PI, 0], 0.6);
    decal(J.chest, livery, 'chevrons', [0, 0.665, -0.942], [0, Math.PI, 0], 0.5, 0.13);
  }

  // ---- blade fins: two broad blades off the shoulder blades, standing up behind
  // the head at rest and swept back at speed ----------------------------------------
  for (const s of [1, -1] as const) {
    const k = new Kit(livery);
    k.ball('K', 0.16);
    // A broad blade, its trailing edge cut in steps.
    k.prism('P', [[0.1, 0.0], [-0.1, 0.6], [-0.5, 1.8], [-0.9, 2.5], [-1.05, 2.3], [-0.9, 1.9], [-1.0, 1.5], [-0.82, 1.2], [-0.9, 0.8], [-0.6, 0.1]], 0.12);
    k.prism('S', [[-0.12, 0.62], [-0.5, 1.72], [-0.62, 1.66], [-0.3, 0.6]], 0.14);
    k.prism('T', [[-0.82, 2.2], [-0.92, 2.52], [-1.06, 2.32]], 0.14, { bevel: 0.01 });
    k.prism('G', [[0.0, 0.1], [-0.2, 0.6], [-0.24, 0.6], [-0.04, 0.1]], 0.16);
    const wing = s === 1 ? J.wingL : J.wingR;
    wing.position.set(s * 0.5, 1.3, -0.62);
    wing.rotation.set(0, 0, s * -0.38);
    c.put(wing, k);
  }

  // ---- head: low and long, a visor rail with a single eye -----------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.17, 0.21, 0.42, 8, { at: [0, -0.06, -0.06] });
    // A long helm tapering to a snout.
    k.box('P', 0.6, 0.42, 0.9, { at: [0, 0.22, 0.12], taper: [0.7, 0.75], lean: 0.05 });
    k.box('P', 0.34, 0.24, 0.5, { at: [0, 0.16, 0.66], taper: [0.6, 0.7] });
    // The rail: a dark band across the face, and the eye riding it, off to one side.
    k.box('D', 0.52, 0.12, 0.34, { at: [0, 0.24, 0.5] });
    k.box('C', 0.48, 0.05, 0.04, { at: [0, 0.25, 0.675] });
    k.box('G', 0.12, 0.08, 0.05, { at: [0.1, 0.25, 0.685] });
    // Mandibles under the snout, and a crimson crest raking back.
    for (const s of [1, -1]) k.prism('T', [[0.24, 0.04], [0.86, -0.08], [0.8, -0.16], [0.18, -0.06]], 0.07, { at: [s * 0.2, 0, 0], rot: [0, s * -0.1, 0] });
    k.prism('S', [[0.1, 0.42], [-0.8, 0.62], [-0.86, 0.54], [0.0, 0.34]], 0.07);
    // Sunk low and forward, ahead of the hump.
    const head = new THREE.Group();
    head.position.set(0, -0.32, 0.22);
    head.scale.setScalar(1.12);
    J.head.add(head);
    c.put(head, k);
  }

  // ---- arms: long, with spiked pauldrons and cleaver blades ------------------------
  for (const s of [1, -1] as const) {
    const sh = s === 1 ? J.shL : J.shR;
    const el = s === 1 ? J.elL : J.elR;
    const wr = s === 1 ? J.wrL : J.wrR;
    {
      const k = new Kit(livery);
      k.ball('K', 0.36);
      k.cyl('D', 0.2, 0.24, d.upperArm - 0.2, 8, { at: [0, -d.upperArm / 2 - 0.05, 0] });
      k.box('P', 0.16, d.upperArm * 0.45, 0.38, { at: [s * 0.22, -d.upperArm * 0.52, 0], taper: [1.1, 1] });
      // The pauldron: three layered plates, the top one spiked.
      for (let i = 0; i < 3; i++) {
        k.box(i === 1 ? 'S' : 'P', 0.74 - i * 0.06, 0.2, 0.84 - i * 0.1, { at: [s * (0.16 + i * 0.08), 0.3 - i * 0.2, 0], rot: [0, 0, s * (-0.32 - i * 0.15)] });
      }
      for (const [z, h] of [[-0.24, 0.7], [0.12, 0.5]] as const) {
        k.plate('T', [[-0.07, 0], [0.07, 0], [0, h]], 0.14, { at: [s * 0.36, 0.34, z], rot: [0, 0, s * -0.55] });
      }
      c.put(sh, k);
      decal(sh, livery, s === 1 ? 'emblem' : 'warning', [s * 0.36, -d.upperArm * 0.52, 0], [0, (s * Math.PI) / 2, 0], 0.32);
    }
    {
      const k = new Kit(livery);
      const fl = d.foreArm;
      k.cyl('D', 0.22, 0.22, 0.44, 8, { axis: 'x' });
      k.cyl('D', 0.21, 0.17, fl - 0.1, 8, { at: [0, -fl / 2, 0] });
      k.box('P', 0.38, fl * 0.5, 0.46, { at: [0, -fl * 0.32, 0.03], taper: [1.15, 1.1] });
      k.box('S', 0.4, 0.12, 0.48, { at: [0, -fl * 0.62, 0.03] });
      // The cleaver: a broad blade down the outside of the forearm, its front edge serrated.
      const blade: Array<[number, number]> = [[-0.12, 0.0], [0.3, -0.2]];
      for (let i = 0; i < 6; i++) {
        const y = -0.45 - i * 0.48;
        blade.push([0.52, y], [0.4, y - 0.2]);
      }
      blade.push([0.46, -fl - 1.75], [0.16, -fl - 2.05], [-0.08, -fl - 1.2], [-0.16, -0.4]);
      k.prism('T', blade, 0.06, { at: [s * 0.32, 0, 0] });
      k.prism('G', [[-0.04, -0.3], [0.0, -0.3], [-0.02, -fl - 1.15], [-0.06, -fl - 1.15]], 0.07, { at: [s * 0.32, 0, 0] });
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

  // ---- legs: raptor shins, a spike at the knee, taloned feet --------------------------
  for (const s of [1, -1] as const) {
    const hip = s === 1 ? J.hipL : J.hipR;
    const knee = s === 1 ? J.kneeL : J.kneeR;
    const ankle = s === 1 ? J.ankleL : J.ankleR;
    {
      const k = new Kit(livery);
      k.cyl('D', 0.3, 0.23, d.thigh - 0.2, 8, { at: [0, -d.thigh / 2 - 0.05, 0] });
      k.prism('P', [[0.16, -0.24], [0.42, -0.6], [0.34, -1.5], [0.1, -1.62], [-0.06, -0.5]], 0.46);
      k.prism('S', [[0.3, -1.1], [0.38, -1.48], [0.14, -1.56], [0.08, -1.2]], 0.48);
      c.put(hip, k);
    }
    {
      const k = new Kit(livery);
      k.cyl('D', 0.26, 0.26, 0.5, 8, { axis: 'x' });
      // A spike jutting forward from the knee.
      k.prism('T', [[0.2, 0.32], [0.95, 0.14], [0.28, -0.08]], 0.18);
      k.cyl('D', 0.22, 0.17, d.shin - 0.3, 8, { at: [0, -d.shin / 2, -0.04] });
      // The shin swept back into a deep calf, like a raptor's.
      k.prism('P', [[0.3, -0.2], [0.36, -1.2], [0.24, -d.shin + 0.35], [-0.2, -d.shin + 0.6], [-0.62, -1.1], [-0.4, -0.3]], 0.42);
      k.prism('S', [[-0.42, -0.5], [-0.66, -1.08], [-0.5, -1.3], [-0.3, -0.8]], 0.44);
      k.nozzle(0.13, 0.24, { at: [0, -1.3, -0.48], rot: [0.9, 0, 0] }, 8);
      c.put(knee, k);
      c.flame(knee, [0, -1.48, -0.66], [0.9, 0, 0], 0.16, 1.6, 'leg');
    }
    {
      const k = new Kit(livery);
      const ay = d.ankleY;
      k.ball('K', 0.24);
      k.prism('P', [[-0.62, -ay + 0.48], [-0.32, 0.1], [0.3, 0.08], [1.1, -ay + 0.5], [1.06, -ay + 0.36], [-0.66, -ay + 0.36]], 0.44);
      // Two talons ahead, a hooked spur behind.
      for (const x of [0.13, -0.13]) k.prism('T', [[0.95, -ay + 0.5], [1.8, -ay + 0.36], [1.62, -ay + 0.26], [0.95, -ay + 0.34]], 0.1, { at: [x, 0, 0], rot: [0, x * 1.4, 0] });
      k.prism('T', [[-0.55, -ay + 0.46], [-1.2, -ay + 0.72], [-1.3, -ay + 0.5], [-0.62, -ay + 0.36]], 0.1);
      k.box('K', 0.36, 0.12, 2.2, { at: [0, -ay + 0.34, 0.35] });
      wheels(k, ay, [-0.5, 0.35, 1.2], 0.28, 0.3);
      c.put(ankle, k);
    }
  }
}
