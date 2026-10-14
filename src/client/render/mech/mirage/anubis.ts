// Mirage's Anubis, the Swift-class forward: a slender jackal-headed runner.
// A long-snouted head with tall ears for antennas and striped headdress
// lappets falling behind it to the shoulders; a broad jewelled collar of gold,
// rust and sand across the chest with a lit scarab at its heart; a pleated
// kilt; tapering obelisk limbs bound with gold bands; sickle-sword blades
// along the forearms; and two slender obelisk fins standing off the back. On
// the Swift's skeleton, with the Swift's weapons and thrusters in the same
// places. An original design. Model space: +z forward, +y up, +x to the
// mech's left.
import * as THREE from 'three';
import { decal } from '../decals';
import { Kit } from '../kit';
import { clawHand, numberDecal, wheels, type FrameCtx } from '../parts';
import { band, broadCollar, kilt } from './motifs';

export function buildAnubis(c: FrameCtx, number: string): void {
  const { rig, livery } = c;
  const J = rig.joints;
  const d = rig.dims;

  // ---- pelvis: a pleated kilt ------------------------------------------------------
  {
    const k = new Kit(livery);
    k.box('K', 0.95, 0.56, 0.7, { at: [0, 0.02, 0], taper: [1.12, 1.1] });
    k.box('T', 1.04, 0.14, 0.78, { at: [0, 0.3, 0] });
    for (const s of [1, -1]) k.ball('K', 0.3, { at: [s * d.hipX, -d.hipDrop, 0] });
    kilt(k, 0.5, 0.6, 0.95, 0.38);
    c.put(J.hips, k);
  }

  // ---- waist: slim, ringed with gold ------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.28, 0.34, d.spineY + d.chestY, 8, { at: [0, (d.chestY - d.spineY) / 2 + 0.05, 0] });
    for (const y of [0.14, 0.4, 0.66]) band(k, 0.38, y);
    c.put(J.spine, k);
  }

  // ---- chest: a tapering torso under a broad jewelled collar -------------------------
  {
    const k = new Kit(livery);
    k.box('K', 1.15, 1.15, 0.9, { at: [0, 0.78, -0.08], taper: [1.18, 1] });
    k.plate('P', [[-0.3, 0.12], [0.3, 0.12], [0.86, 0.9], [1.06, 1.42], [0.6, 1.56], [-0.6, 1.56], [-1.06, 1.42], [-0.86, 0.9]], 1.0, { at: [0, 0, -0.08] });
    k.plate('S', [[-0.2, 0.2], [0.2, 0.2], [0.36, 0.86], [-0.36, 0.86]], 0.12, { at: [0, 0, 0.44] });
    broadCollar(k, 0.96, 1.5, 0.5);
    for (const s of [1, -1]) {
      k.box('K', 0.54, 0.4, 0.6, { at: [s * (d.shoulderX - 0.42), d.shoulderY + 0.02, -0.04] });
      k.cyl('D', 0.32, 0.32, 0.48, 8, { axis: 'x', at: [s * (d.shoulderX - 0.2), d.shoulderY, 0] });
    }
    k.box('F', 0.62, 0.22, 0.56, { at: [0, 1.56, -0.1], taper: [0.8, 0.85] });
    // The back: a slim power unit with two nozzles, gold-banded.
    k.box('F', 0.84, 0.92, 0.44, { at: [0, 0.72, -0.72], taper: [0.78, 0.9] });
    k.box('T', 0.86, 0.1, 0.46, { at: [0, 1.1, -0.72] });
    for (const s of [1, -1]) k.nozzle(0.2, 0.4, { at: [s * 0.26, 0.38, -0.94], rot: [-0.35, 0, 0] });
    c.put(J.chest, k);
    for (const s of [1, -1]) c.flame(J.chest, [s * 0.26, 0.24, -1.32], [-0.35, 0, 0], 0.2, 3.4, 'main');
    const num = numberDecal(number, livery);
    num.scale.setScalar(0.5);
    num.position.set(0, 0.78, -0.946);
    num.rotation.y = Math.PI;
    num.renderOrder = 3;
    J.chest.add(num);
    decal(J.chest, livery, 'roundel', [0, 0.78, -0.942], [0, Math.PI, 0], 0.6);
    decal(J.chest, livery, 'chevrons', [0, 0.45, -0.942], [0, Math.PI, 0], 0.4, 0.11);
  }

  // ---- obelisk fins: two slender tapering stones off the back, gold-capped -----------
  for (const s of [1, -1] as const) {
    const k = new Kit(livery);
    k.ball('K', 0.14);
    k.box('P', 0.18, 2.1, 0.36, { at: [0, 1.05, -0.1], taper: [0.5, 0.55] });
    k.box('S', 0.2, 0.26, 0.38, { at: [0, 0.3, -0.1] });
    k.plate('T', [[-0.06, 0], [0.06, 0], [0, 0.32]], 0.22, { at: [0, 2.08, -0.1] });
    k.box('G', 0.04, 1.2, 0.04, { at: [0, 1.05, 0.08] });
    // The poses turn the wing joint, so the fin's own lean rides on a group inside it.
    const wing = s === 1 ? J.wingL : J.wingR;
    wing.position.set(s * 0.44, 1.1, -0.84);
    const fin = new THREE.Group();
    fin.rotation.set(-0.55, 0, s * -0.12);
    wing.add(fin);
    c.put(fin, k);
  }

  // ---- head: the jackal ---------------------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.16, 0.2, 0.44, 8, { at: [0, -0.06, -0.06] });
    // The skull, and the long snout tapering forward.
    k.box('P', 0.56, 0.5, 0.62, { at: [0, 0.26, -0.02], taper: [0.82, 0.85] });
    k.box('P', 0.3, 0.26, 0.74, { at: [0, 0.14, 0.6], taper: [0.7, 0.7], lean: -0.02 });
    k.box('F', 0.22, 0.08, 0.6, { at: [0, 0.01, 0.62] });
    k.box('D', 0.12, 0.08, 0.06, { at: [0, 0.18, 0.98] });
    // Amber eyes, lined in dark paint.
    for (const s of [1, -1]) {
      k.box('D', 0.2, 0.07, 0.04, { at: [s * 0.18, 0.34, 0.31], rot: [0, s * 0.35, s * -0.2] });
      k.box('G', 0.11, 0.045, 0.04, { at: [s * 0.18, 0.34, 0.33], rot: [0, s * 0.35, s * -0.2] });
    }
    // The ears: tall, pointed, standing straight up, gold inside.
    for (const s of [1, -1]) {
      k.plate('P', [[-0.14, 0], [0.14, 0], [0.02, 0.92]], 0.12, { at: [s * 0.2, 0.46, -0.08], rot: [0.1, 0, s * -0.12] });
      k.plate('T', [[-0.07, 0.06], [0.07, 0.06], [0.01, 0.66]], 0.04, { at: [s * 0.2, 0.46, -0.0], rot: [0.1, 0, s * -0.12] });
    }
    // Headdress lappets: striped panels falling behind the ears to the shoulders.
    for (const s of [1, -1]) {
      for (let i = 0; i < 5; i++) k.box(i % 2 ? 'S' : 'T', 0.1, 0.16, 0.34, { at: [s * 0.32, 0.18 - i * 0.16, -0.22], rot: [0.1, 0, s * 0.12] });
    }
    const head = new THREE.Group();
    head.scale.setScalar(1.15);
    J.head.add(head);
    c.put(head, k);
  }

  // ---- arms: tapering and banded, with sickle swords ------------------------------------
  for (const s of [1, -1] as const) {
    const sh = s === 1 ? J.shL : J.shR;
    const el = s === 1 ? J.elL : J.elR;
    const wr = s === 1 ? J.wrL : J.wrR;
    {
      const k = new Kit(livery);
      k.ball('K', 0.34);
      k.box('P', 0.42, d.upperArm - 0.2, 0.42, { at: [0, -d.upperArm / 2 - 0.05, 0], taper: [0.78, 0.78] });
      band(k, 0.27, -d.upperArm * 0.7);
      // A round pauldron edged with the collar's gold.
      k.lathe('P', [[0, -0.36], [0.4, -0.3], [0.5, 0.0], [0.38, 0.28], [0, 0.34]], 10, { at: [s * 0.22, 0.12, 0], scale: [1, 0.9, 1.15] });
      k.cyl('T', 0.5, 0.5, 0.1, 10, { at: [s * 0.22, 0.0, 0], scale: [1, 1, 1.15] });
      c.put(sh, k);
      decal(sh, livery, s === 1 ? 'emblem' : 'warning', [s * 0.3, -d.upperArm * 0.45, 0], [0, (s * Math.PI) / 2, 0], 0.3);
    }
    {
      const k = new Kit(livery);
      const fl = d.foreArm;
      k.cyl('D', 0.22, 0.22, 0.44, 8, { axis: 'x' });
      k.box('P', 0.44, fl - 0.1, 0.48, { at: [0, -fl / 2 - 0.02, 0.02], taper: [0.8, 0.8] });
      band(k, 0.27, -fl * 0.2);
      band(k, 0.24, -fl * 0.85);
      // The sickle sword: a straight blade down the forearm, hooked at its end.
      k.prism('T', [[-0.06, -0.1], [0.14, -0.2], [0.18, -fl - 0.6], [0.5, -fl - 1.2], [0.58, -fl - 1.75], [0.4, -fl - 2.05], [0.3, -fl - 1.8], [0.32, -fl - 1.35], [0.02, -fl - 0.75], [-0.08, -fl * 0.5]], 0.06, { at: [s * 0.3, 0, 0] });
      k.prism('G', [[0.18, -0.4], [0.22, -0.4], [0.26, -fl - 0.55], [0.22, -fl - 0.55]], 0.07, { at: [s * 0.3, 0, 0] });
      c.put(el, k);
    }
    {
      const k = new Kit(livery);
      clawHand(k, s, 1);
      band(k, 0.2, -0.06);
      c.put(wr, k);
    }
    const hand = s === 1 ? rig.handL : rig.handR;
    hand.position.set(0, -0.2, 0.3);
    if (s === -1) {
      rig.muzzle.position.set(0, -d.foreArm - 1.5, 0.4);
      el.add(rig.muzzle);
    }
  }

  // ---- legs: obelisk shins, gold at knee and ankle --------------------------------------
  for (const s of [1, -1] as const) {
    const hip = s === 1 ? J.hipL : J.hipR;
    const knee = s === 1 ? J.kneeL : J.kneeR;
    const ankle = s === 1 ? J.ankleL : J.ankleR;
    {
      const k = new Kit(livery);
      k.box('P', 0.56, d.thigh - 0.2, 0.6, { at: [0, -d.thigh / 2 - 0.05, 0.02], taper: [0.82, 0.85] });
      k.box('S', 0.08, d.thigh * 0.5, 0.3, { at: [s * 0.27, -d.thigh * 0.55, 0.06] });
      c.put(hip, k);
    }
    {
      const k = new Kit(livery);
      k.cyl('D', 0.26, 0.26, 0.5, 8, { axis: 'x' });
      band(k, 0.32, 0.0, 0.16);
      // The shin: a tall tapering obelisk, its front face in rust.
      k.box('P', 0.6, d.shin - 0.2, 0.64, { at: [0, -d.shin / 2 + 0.02, -0.02], taper: [0.68, 0.7] });
      k.box('S', 0.32, d.shin * 0.6, 0.06, { at: [0, -d.shin * 0.45, 0.29], taper: [0.7, 1] });
      band(k, 0.24, -d.shin + 0.4);
      k.nozzle(0.13, 0.24, { at: [0, -1.3, -0.36], rot: [0.9, 0, 0] }, 8);
      c.put(knee, k);
      c.flame(knee, [0, -1.48, -0.54], [0.9, 0, 0], 0.16, 1.6, 'leg');
    }
    {
      const k = new Kit(livery);
      const ay = d.ankleY;
      k.ball('K', 0.24);
      // A long, flat foot like a sandal, gold straps across it.
      k.prism('P', [[-0.6, -ay + 0.5], [-0.3, 0.06], [0.28, 0.06], [1.3, -ay + 0.5], [1.3, -ay + 0.38], [-0.66, -ay + 0.38]], 0.46);
      for (const z of [0.1, 0.6]) k.box('T', 0.5, 0.08, 0.14, { at: [0, -ay + 0.58 + (0.6 - z) * 0.3, z] });
      k.box('K', 0.36, 0.12, 2.2, { at: [0, -ay + 0.34, 0.35] });
      wheels(k, ay, [-0.5, 0.35, 1.2], 0.28, 0.3);
      c.put(ankle, k);
    }
  }
}
