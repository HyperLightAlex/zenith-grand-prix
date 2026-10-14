// Mirage's Horus, the Vector-class midfielder: falcon-headed. A round-browed
// falcon's head with a short hooked beak, the falcon's dark stripe under each
// eye, crowned with a sun disc and a rearing cobra; the broad jewelled collar
// across a broad chest; round pauldrons fringed with feathers; folded falcon
// wings hanging down the back like a cloak; a rearing cobra of a Snare
// launcher on the left forearm; and in the right hand a staff of a rifle
// crowned with a sun disc held in gold horns. The Disruptor on the back is the
// falcon's eye, lit. Taloned feet. On the Vector's skeleton, with the
// Vector's weapons and thrusters in the same places. An original design.
// Model space: +z forward, +y up, +x to the mech's left.
import * as THREE from 'three';
import { decal } from '../decals';
import { Kit } from '../kit';
import { fist, numberDecal, wheels, type FrameCtx } from '../parts';
import { arc, band, broadCollar, headdress, kilt, sunDisc } from './motifs';

export function buildHorus(c: FrameCtx, number: string): void {
  const { rig, livery } = c;
  const J = rig.joints;
  const d = rig.dims;
  const b = 1.12;

  // ---- pelvis: a pleated kilt between feathered tassets ------------------------------
  {
    const k = new Kit(livery);
    k.box('K', 1.15 * b, 0.6, 0.88 * b, { at: [0, 0.02, 0], taper: [1.12, 1.08] });
    k.box('T', 1.2 * b, 0.14, 0.94 * b, { at: [0, 0.32, 0] });
    for (const s of [1, -1]) {
      k.ball('K', 0.34, { at: [s * d.hipX, -d.hipDrop, 0] });
      for (let i = 0; i < 2; i++) {
        k.prism(i ? 'S' : 'P', [[0.36, 0.26], [-0.36, 0.26], [-0.3, -0.36], [0, -0.6], [0.3, -0.36]], 0.12, { at: [s * (d.hipX + 0.4 + i * 0.07), 0.04 - i * 0.24, 0], rot: [0, 0, s * (0.2 + i * 0.08)] });
      }
    }
    kilt(k, 0.62, 0.74, 1.05, 0.47);
    c.put(J.hips, k);
  }

  // ---- waist: ringed with gold ------------------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.4 * b, 0.46 * b, d.spineY + d.chestY, 10, { at: [0, (d.chestY - d.spineY) / 2 + 0.05, 0] });
    for (const y of [0.16, 0.48]) band(k, 0.5 * b, y, 0.14);
    c.put(J.spine, k);
  }

  // ---- chest: broad, under the jewelled collar ------------------------------------------
  {
    const k = new Kit(livery);
    const cw = d.shoulderX - 0.42;
    k.box('K', 1.45 * b, 1.3, 1.15 * b, { at: [0, 0.78, -0.1] });
    k.plate('P', [[-0.42, 0.1], [0.42, 0.1], [cw, 0.7], [cw + 0.08, 1.3], [0.7, 1.6], [-0.7, 1.6], [-cw - 0.08, 1.3], [-cw, 0.7]], 1.36 * b, { at: [0, 0, -0.06] });
    k.plate('S', [[-0.34, 0.12], [0.34, 0.12], [0.5, 0.56], [-0.5, 0.56]], 0.1, { at: [0, 0, 0.7] });
    broadCollar(k, 1.12, 1.58, 0.72, -0.18);
    for (const s of [1, -1]) {
      k.box('K', 0.5, 0.42, 0.62, { at: [s * cw, d.shoulderY + 0.02, -0.04] });
      k.cyl('D', 0.38, 0.38, 0.5, 10, { axis: 'x', at: [s * (d.shoulderX - 0.28), d.shoulderY, 0] });
    }
    k.box('F', 0.66, 0.24, 0.6, { at: [0, 1.64, -0.1], taper: [0.8, 0.85] });
    // The power unit, its nozzles, and the mounts the wings hang from.
    k.box('F', 1.36, 1.1, 0.62, { at: [0, 0.84, -0.98], taper: [0.8, 0.88] });
    k.box('T', 1.22, 0.1, 0.62, { at: [0, 1.18, -0.98] });
    for (const s of [1, -1]) {
      k.cyl('K', 0.29, 0.29, 0.28, 10, { axis: 'z', at: [s * 0.44, 0.5, -1.27], rot: [-0.25, 0, 0] });
      k.nozzle(0.26, 0.46, { at: [s * 0.44, 0.5, -1.34], rot: [-0.25, 0, 0] });
    }
    for (const s of [1, -1]) k.box('K', 0.34, 0.3, 0.4, { at: [s * 0.72, 1.0, -1.06] });
    // The Disruptor: the falcon's eye on the back of the power unit, lit, its
    // brow above it, the falcon's stripe falling from it and its tail curling.
    {
      const e = new Kit(livery);
      e.plate('T', [[-0.38, 0], [-0.2, 0.14], [0.08, 0.17], [0.38, 0.02], [0.1, -0.13], [-0.2, -0.13]], 0.05);
      e.plate('D', [[-0.3, 0], [-0.17, 0.1], [0.07, 0.12], [0.3, 0.02], [0.08, -0.09], [-0.17, -0.09]], 0.07);
      e.cyl('G', 0.09, 0.09, 0.1, 12, { axis: 'z', at: [0, 0.01, 0] });
      e.plate('T', [[-0.4, 0.22], [0, 0.28], [0.4, 0.24], [0.4, 0.3], [0, 0.35], [-0.4, 0.29]], 0.05);
      e.plate('T', [[-0.06, -0.1], [0.02, -0.1], [-0.02, -0.44], [-0.1, -0.44]], 0.05);
      e.plate('T', [[0.04, -0.11], [0.12, -0.11], [0.3, -0.3], [0.22, -0.3]], 0.05);
      e.plate('T', arc(0.06, 0.12, Math.PI * 0.9, Math.PI * 2.4, 0.3, -0.38), 0.05);
      const eye = new THREE.Group();
      eye.position.set(0, 0.98, -1.31);
      eye.rotation.y = Math.PI;
      J.chest.add(eye);
      c.put(eye, e);
    }
    c.put(J.chest, k);
    for (const s of [1, -1]) c.flame(J.chest, [s * 0.44, 0.39, -1.79], [-0.25, 0, 0], 0.24, 3.2, 'main');
    decal(J.chest, livery, 'chevrons', [0, 0.44, -1.3], [0, Math.PI, -Math.PI / 2], 0.32, 0.14);
  }

  // ---- wings: a falcon's, folded, hanging down the back like a cloak ----------------------
  for (const s of [1, -1] as const) {
    const k = new Kit(livery);
    k.cyl('K', 0.14, 0.14, 0.3, 8, { axis: 'x' });
    k.prism('P', [[0.1, 0.1], [-0.05, 0.45], [-0.4, 0.6], [-0.78, 0.35], [-0.98, -0.3], [-1.02, -1.3], [-0.92, -2.15], [-0.76, -1.8], [-0.66, -2.05], [-0.48, -1.68], [-0.38, -1.88], [-0.2, -1.45], [-0.1, -1.6], [0.04, -1.1], [0.1, -0.5]], 0.1);
    // The coverts in rust, edged with a lit line; gold lines down the long feathers.
    k.prism('S', [[0.0, 0.36], [-0.4, 0.5], [-0.74, 0.3], [-0.9, -0.3], [-0.62, -0.46], [-0.3, -0.34], [0.02, -0.24]], 0.13);
    k.prism('G', [[0.02, -0.26], [-0.3, -0.36], [-0.62, -0.48], [-0.9, -0.32], [-0.9, -0.38], [-0.62, -0.54], [-0.3, -0.42], [0.02, -0.32]], 0.14);
    for (const z of [-0.26, -0.5, -0.74]) k.prism('T', [[z + 0.03, -0.5], [z - 0.03, -0.5], [z - 0.03, -1.5 + z * 0.4], [z + 0.03, -1.5 + z * 0.4]], 0.13);
    k.prism('T', [[0.1, 0.1], [-0.05, 0.45], [-0.4, 0.6], [-0.4, 0.5], [-0.1, 0.36], [0.02, 0.06]], 0.14);
    // The poses turn the wing joint, so the wing's own hang rides on a group inside it.
    const wing = s === 1 ? J.wingL : J.wingR;
    wing.position.set(s * 0.84, 1.0, -1.06);
    const hang = new THREE.Group();
    hang.rotation.set(0.16, s * -0.4, s * 0.1);
    wing.add(hang);
    c.put(hang, k);
  }

  // ---- head: the falcon --------------------------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.2, 0.24, 0.44, 8, { at: [0, -0.1, -0.04] });
    // The skull: round, a heavy brow over the eyes.
    k.ball('P', 0.36, { at: [0, 0.3, -0.04], scale: [0.92, 0.9, 1.05] });
    k.box('P', 0.6, 0.14, 0.34, { at: [0, 0.45, 0.14], taper: [0.9, 0.8] });
    // The beak: hooked and dark, a gold cere at its root.
    k.prism('F', [[0.24, 0.4], [0.5, 0.38], [0.7, 0.28], [0.78, 0.1], [0.72, -0.04], [0.64, 0.06], [0.56, 0.14], [0.36, 0.14], [0.24, 0.2]], 0.24);
    k.box('T', 0.28, 0.12, 0.16, { at: [0, 0.38, 0.32] });
    // Amber eyes, the falcon's dark stripe falling under each.
    for (const s of [1, -1]) {
      k.box('D', 0.2, 0.12, 0.05, { at: [s * 0.2, 0.33, 0.27], rot: [0, s * 0.55, 0] });
      k.box('G', 0.12, 0.08, 0.05, { at: [s * 0.2, 0.33, 0.29], rot: [0, s * 0.55, 0] });
      k.box('D', 0.06, 0.26, 0.05, { at: [s * 0.23, 0.14, 0.24], rot: [0, s * 0.55, s * 0.12] });
    }
    // The headdress: striped lappets down to the shoulders, a gold band round the crown.
    headdress(k, 0.33, 0.36, 0.86, -0.14, 6);
    k.box('T', 0.5, 0.1, 0.5, { at: [0, 0.6, -0.08] });
    // The crown: a sun disc, a rearing cobra at its foot.
    k.box('S', 0.22, 0.14, 0.2, { at: [0, 0.7, -0.1] });
    sunDisc(k, 0.3, [0, 1.02, -0.1]);
    k.plate('T', [[-0.07, 0], [0.07, 0], [0.1, 0.12], [0, 0.24], [-0.1, 0.12]], 0.05, { at: [0, 0.7, 0.0] });
    k.box('G', 0.035, 0.035, 0.02, { at: [0, 0.82, 0.035] });
    const head = new THREE.Group();
    head.position.set(0, 0.3, 0.16);
    head.scale.setScalar(1.2);
    J.head.add(head);
    c.put(head, k);
  }

  // ---- arms: feathered pauldrons, the cobra launcher, the staff rifle ----------------------
  for (const s of [1, -1] as const) {
    const sh = s === 1 ? J.shL : J.shR;
    const el = s === 1 ? J.elL : J.elR;
    const wr = s === 1 ? J.wrL : J.wrR;
    {
      const k = new Kit(livery);
      k.ball('K', 0.38);
      k.box('P', 0.5, d.upperArm - 0.2, 0.56, { at: [0, -d.upperArm / 2 - 0.05, 0], taper: [0.84, 0.84] });
      k.box('S', 0.1, d.upperArm * 0.42, 0.44, { at: [s * 0.28, -d.upperArm * 0.62, 0] });
      band(k, 0.29, -d.upperArm + 0.22);
      // The pauldron: a round dome, gold-rimmed, a fringe of feathers round its outside.
      k.lathe('P', [[0, -0.3], [0.44, -0.24], [0.54, 0.02], [0.4, 0.3], [0, 0.36]], 10, { at: [s * 0.2, 0.16, 0], scale: [1, 0.9, 1.15] });
      k.cyl('T', 0.56, 0.56, 0.1, 10, { at: [s * 0.2, 0.0, 0], scale: [1, 1, 1.15] });
      for (let i = 0; i < 5; i++) {
        const phi = (i / 4 - 0.5) * 2.2;
        const dx = s * Math.cos(phi);
        const dz = Math.sin(phi);
        k.plate(i % 2 ? 'S' : 'P', [[-0.13, 0], [0.13, 0], [0.11, -0.46], [0, -0.6], [-0.11, -0.46]], 0.08, { at: [s * 0.2 + dx * 0.5, -0.02, dz * 0.58], rot: [0, Math.atan2(dx, dz), 0] });
      }
      c.put(sh, k);
      const num = numberDecal(number, livery);
      num.scale.setScalar(0.42);
      num.position.set(s * 0.345, -d.upperArm * 0.62, 0);
      num.rotation.y = (s * Math.PI) / 2;
      sh.add(num);
    }
    {
      const k = new Kit(livery);
      const fl = d.foreArm;
      k.cyl('D', 0.28, 0.28, 0.56, 10, { axis: 'x' });
      k.box('P', 0.56, fl - 0.15, 0.64, { at: [0, -fl / 2 - 0.05, 0.02], taper: [0.8, 0.8] });
      k.box('S', 0.3, fl * 0.42, 0.06, { at: [0, -fl * 0.55, 0.31], taper: [0.8, 1] });
      band(k, 0.33, -fl * 0.2, 0.14);
      band(k, 0.36, -fl * 0.9);
      if (s === 1) {
        // The Snare launcher: a gold-banded tube rearing into a cobra's hood, its eyes lit.
        k.box('F', 0.22, 0.7, 0.36, { at: [0.42, -fl * 0.5, 0.06] });
        k.cyl('S', 0.12, 0.1, 0.9, 8, { at: [0.46, -fl * 0.62, 0.22] });
        for (const y of [-0.62, -0.86, -1.1]) k.cyl('T', 0.14, 0.14, 0.06, 8, { at: [0.46, y, 0.22] });
        k.prism('T', [[0.0, -0.98], [0.18, -1.02], [0.3, -1.2], [0.26, -1.42], [0.0, -1.5], [-0.2, -1.42], [-0.26, -1.2], [-0.14, -1.02]], 0.06, { at: [0.6, 0, 0.22] });
        k.prism('S', [[0.0, -1.06], [0.16, -1.1], [0.22, -1.22], [0.18, -1.38], [0.0, -1.42], [-0.16, -1.36], [-0.18, -1.22], [-0.1, -1.1]], 0.07, { at: [0.6, 0, 0.22] });
        for (const z of [0.12, 0.32]) k.box('G', 0.06, 0.05, 0.05, { at: [0.64, -1.18, z] });
        k.cyl('G', 0.06, 0.06, 0.02, 8, { at: [0.46, -fl * 0.62 - 0.46, 0.22] });
      }
      c.put(el, k);
    }
    {
      const k = new Kit(livery);
      fist(k, s, 1.05);
      band(k, 0.24, -0.04);
      if (s === -1) {
        // The staff: a long shaft through the fist, a gold cap above the hand.
        k.cyl('F', 0.08, 0.08, 3.3, 8, { at: [0, -1.05, 0.46] });
        k.cyl('T', 0.12, 0.1, 0.18, 8, { at: [0, 0.64, 0.46] });
        // The receiver, gripped: rust, gold-banded, a lit sight along it.
        k.box('S', 0.28, 0.66, 0.4, { at: [0, -0.62, 0.44], taper: [0.9, 0.9] });
        k.box('T', 0.32, 0.08, 0.44, { at: [0, -0.3, 0.44] });
        k.box('G', 0.04, 0.3, 0.02, { at: [0.15, -0.66, 0.44] });
        for (const y of [-1.3, -1.7]) k.cyl('T', 0.12, 0.12, 0.08, 8, { at: [0, y, 0.46] });
        // The crown: a sun disc held in gold horns, the barrel running through it.
        k.cyl('T', 0.3, 0.3, 0.08, 16, { axis: 'x', at: [0, -2.4, 0.46] });
        k.cyl('G', 0.17, 0.17, 0.1, 16, { axis: 'x', at: [0, -2.4, 0.46] });
        k.prism('T', arc(0.34, 0.42, -Math.PI * 0.28, Math.PI * 1.28, 0.46, -2.4), 0.07);
        k.cyl('T', 0.1, 0.12, 0.14, 8, { at: [0, -2.74, 0.46] });
        k.cyl('G', 0.06, 0.06, 0.04, 8, { at: [0, -2.82, 0.46] });
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

  // ---- legs: obelisk shins, feathered calves, talons ----------------------------------------
  for (const s of [1, -1] as const) {
    const hip = s === 1 ? J.hipL : J.hipR;
    const knee = s === 1 ? J.kneeL : J.kneeR;
    const ankle = s === 1 ? J.ankleL : J.ankleR;
    {
      const k = new Kit(livery);
      k.box('K', 0.54, d.thigh - 0.3, 0.58, { at: [0, -d.thigh / 2 - 0.05, -0.02], taper: [1.16, 1.1] });
      k.box('P', 0.62, d.thigh - 0.45, 0.68, { at: [0, -d.thigh / 2 - 0.1, 0.02], taper: [1.1, 1.06] });
      k.box('S', 0.08, d.thigh * 0.5, 0.36, { at: [s * 0.34, -d.thigh * 0.55, 0.04] });
      band(k, 0.37, -d.thigh + 0.34);
      c.put(hip, k);
      if (s === 1) decal(hip, livery, 'emblem', [0.385, -d.thigh * 0.55, 0.04], [0, Math.PI / 2, 0], 0.3);
    }
    {
      const k = new Kit(livery);
      k.cyl('D', 0.31, 0.31, 0.62, 10, { axis: 'x' });
      k.prism('T', [[0.22, 0.36], [0.6, 0.2], [0.56, -0.2], [0.3, -0.32]], 0.42);
      // The shin: an obelisk, rust down its face, gold at its foot.
      k.box('P', 0.64, d.shin - 0.3, 0.68, { at: [0, -d.shin / 2 + 0.02, -0.04], taper: [0.72, 0.74] });
      k.box('S', 0.34, d.shin * 0.55, 0.06, { at: [0, -d.shin * 0.5, 0.28], taper: [0.72, 1] });
      band(k, 0.36, -d.shin + 0.42);
      // Feathers down the back of the calf, like a falcon's leg.
      for (let i = 0; i < 2; i++) k.prism(i ? 'S' : 'P', [[-0.28, -0.18 - i * 0.42], [-0.6, -0.34 - i * 0.42], [-0.66, -0.7 - i * 0.42], [-0.28, -0.62 - i * 0.42]], 0.46 - i * 0.06);
      k.nozzle(0.17, 0.28, { at: [0, -1.3, -0.54], rot: [0.9, 0, 0] }, 8);
      c.put(knee, k);
      c.flame(knee, [0, -1.52, -0.75], [0.9, 0, 0], 0.2, 1.6, 'leg');
    }
    {
      const k = new Kit(livery);
      const ay = d.ankleY;
      k.ball('K', 0.3);
      k.cyl('T', 0.34, 0.34, 0.12, 10, { at: [0, 0.02, 0] });
      k.prism('P', [[-0.6, -ay + 0.62], [-0.42, 0.16], [0.4, 0.13], [1.0, -ay + 0.66], [0.9, -ay + 0.5], [-0.66, -ay + 0.46]], 0.62);
      // The talons: three gold claws curling forward and down, a spur behind.
      for (const x of [-0.2, 0, 0.2]) k.prism('T', [[0.86, -ay + 0.64], [1.5, -ay + 0.6], [1.76, -ay + 0.42], [1.66, -ay + 0.3], [1.52, -ay + 0.44], [0.86, -ay + 0.46]], 0.13, { at: [x, 0, 0], rot: [0, x * 1.2, 0] });
      k.prism('T', [[-0.55, -ay + 0.56], [-1.1, -ay + 0.5], [-1.22, -ay + 0.34], [-1.1, -ay + 0.26], [-1.0, -ay + 0.4], [-0.62, -ay + 0.42]], 0.12);
      k.box('K', 0.4, 0.12, 2.4, { at: [0, -ay + 0.36, 0.36] });
      wheels(k, ay, [-0.66, 0.38, 1.42], 0.32, 0.34);
      c.put(ankle, k);
    }
  }
}
