// Vanta's Maul, the Bulwark-class defender: a brute. A massive, hunched slab
// of a torso with a high collar round its head like a fanged maw, so the head
// peers out from between the teeth, a single eye riding a rail across it;
// layered slab pauldrons bristling with spikes, heavy gauntlets with spiked
// knuckles for the Breaker and the scatter cannon slung under the right one,
// spiked knees and boots, and broad blade fins off the back. On the Bulwark's
// skeleton, with the Bulwark's weapons and thrusters in the same places. An
// original design. Model space: +z forward, +y up, +x to the mech's left.
import * as THREE from 'three';
import { decal } from '../decals';
import { Kit } from '../kit';
import { mirrorX, numberDecal, wheels, type FrameCtx } from '../parts';

export function buildMaul(c: FrameCtx, number: string): void {
  const { rig, livery } = c;
  const J = rig.joints;
  const d = rig.dims;
  const b = 1.38;

  // ---- pelvis: heavy, spiked tassets -----------------------------------------------
  {
    const k = new Kit(livery);
    k.box('K', 1.25 * b, 0.68, 0.95 * b, { at: [0, 0.02, -0.02], taper: [1.12, 1.05] });
    k.box('F', 1.38 * b, 0.22, 1.04 * b, { at: [0, 0.38, -0.02] });
    for (const s of [1, -1]) k.ball('K', 0.44, { at: [s * d.hipX, -d.hipDrop, 0] });
    k.plate('S', [[-0.6, 0.24], [0.6, 0.24], [0.22, -0.56], [-0.22, -0.56]], 0.22, { at: [0, 0.12, 0.7] });
    k.plate('T', [[-0.16, 0.16], [0.16, 0.16], [0, -0.3]], 0.06, { at: [0, 0.12, 0.82] });
    for (const s of [1, -1]) {
      k.box('P', 0.2, 1.06, 1.24 * b, { at: [s * (d.hipX + 0.62), -0.2, 0.02], taper: [1, 0.72], rot: [0, 0, s * 0.24] });
      k.plate('T', [[-0.07, 0], [0.07, 0], [0, 0.42]], 0.12, { at: [s * (d.hipX + 0.86), 0.3, 0.02], rot: [0, 0, s * -0.9] });
    }
    c.put(J.hips, k);
    for (const s of [1, -1] as const) {
      const sk = s === 1 ? rig.skirts.l : rig.skirts.r;
      sk.position.set(s * 0.52, 0.24, 0.62);
      const f = new Kit(livery);
      f.cyl('K', 0.08, 0.08, 0.6, 8, { axis: 'x' });
      f.plate('P', [[-0.36, 0.04], [0.36, 0.04], [0.3, -0.72], [0, -1.04], [-0.3, -0.72]], 0.14, { at: [0, 0, 0.1], rot: [-0.12, 0, 0] });
      f.plate('S', [[-0.22, -0.2], [0.22, -0.2], [0, -0.62]], 0.05, { at: [0, 0, 0.19], rot: [-0.12, 0, 0] });
      c.put(sk, f);
    }
  }

  // ---- waist ------------------------------------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.48 * b, 0.58 * b, d.spineY + d.chestY, 10, { at: [0, (d.chestY - d.spineY) / 2 + 0.05, 0] });
    k.box('D', 1.0 * b, 0.17, 0.9 * b, { at: [0, 0.24, 0] });
    k.box('D', 0.96 * b, 0.17, 0.88 * b, { at: [0, 0.6, 0] });
    k.plate('S', [[-0.42, 0.0], [0.42, 0.0], [0.3, 0.78], [-0.3, 0.78]], 0.18, { at: [0, 0.02, 0.62] });
    c.put(J.spine, k);
  }

  // ---- chest: a hunched slab, the maw of a collar round the head --------------------
  {
    const k = new Kit(livery);
    const cw = d.shoulderX - 0.45;
    k.box('K', 2.1, 1.55, 1.5, { at: [0, 0.82, -0.1] });
    k.plate('P', [[-0.7, 0.05], [0.7, 0.05], [cw, 0.86], [cw + 0.1, 1.5], [0.86, 1.86], [-0.86, 1.86], [-cw - 0.1, 1.5], [-cw, 0.86]], 1.8, { at: [0, 0, -0.08] });
    // Layered chevrons down the front, crimson between dark.
    for (let i = 0; i < 3; i++) {
      const y = 1.28 - i * 0.36;
      k.plate(i === 1 ? 'S' : 'F', [[-1.1 + i * 0.18, y], [-0.86 + i * 0.18, y + 0.1], [0, y - 0.36], [0.86 - i * 0.18, y + 0.1], [1.1 - i * 0.18, y], [0, y - 0.56]], 0.16, { at: [0, 0, 0.9 - i * 0.02] });
    }
    for (const s of [1, -1]) {
      k.cyl('D', 0.5, 0.5, 0.6, 10, { axis: 'x', at: [s * (d.shoulderX - 0.34), d.shoulderY, 0] });
      k.vent(0.38, 0.5, 4, { at: [s * (cw - 0.1), 0.56, 0.92], rot: [0, s * 0.35, 0], depth: 0.1, lit: true });
    }
    // The maw: a high collar round the head, open at the front: a wall behind,
    // a wall each side, an overhanging upper jaw, and fangs along both jaws.
    k.prism('P', [[-0.24, 1.7], [-0.18, 2.5], [-0.56, 2.78], [-0.9, 2.44], [-0.9, 1.7]], 1.7);
    k.prism('S', [[-0.3, 2.42], [0.66, 2.34], [0.62, 2.5], [-0.3, 2.7]], 1.5);
    for (const s of [1, -1]) {
      const side: Array<[number, number]> = [[0.62, 1.8], [0.9, 1.84], [0.86, 2.56], [0.6, 2.44]];
      k.plate('P', s === 1 ? side : mirrorX(side), 1.1, { at: [0, 0, -0.2] });
    }
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.3;
      // Upper fangs hanging from the jaw's lip, lower ones rising from the chest's edge.
      k.plate('T', [[x - 0.1, 2.38], [x + 0.1, 2.38], [x, 2.1]], 0.1, { at: [0, 0, 0.6] });
      k.plate('T', [[x + 0.06, 1.64], [x + 0.15, 1.9], [x + 0.24, 1.64]], 0.1, { at: [0, 0, 0.72] });
    }
    // The backpack: twin nozzles under broad fins.
    k.box('F', 2.4, 1.6, 1.0, { at: [0, 0.95, -1.25], taper: [0.86, 0.82] });
    k.box('P', 1.6, 0.5, 0.6, { at: [0, 1.8, -1.2] });
    for (const s of [1, -1]) k.nozzle(0.42, 0.66, { at: [s * 0.72, 0.56, -1.72], rot: [-0.25, 0, 0] });
    c.put(J.chest, k);
    for (const s of [1, -1]) c.flame(J.chest, [s * 0.72, 0.4, -2.36], [-0.25, 0, 0], 0.4, 3.0, 'main');
    const num = numberDecal(number, livery);
    num.scale.setScalar(0.85);
    num.position.set(0, 1.22, -1.77);
    num.rotation.y = Math.PI;
    num.renderOrder = 3;
    J.chest.add(num);
    decal(J.chest, livery, 'roundel', [0, 1.22, -1.765], [0, Math.PI, 0], 0.95);
    decal(J.chest, livery, 'chevrons', [0, 0.42, -1.765], [0, Math.PI, -Math.PI / 2], 0.5, 0.2);
  }

  // ---- blade fins off the back ----------------------------------------------------------
  for (const s of [1, -1] as const) {
    const k = new Kit(livery);
    k.cyl('K', 0.18, 0.18, 0.4, 8, { axis: 'y' });
    k.prism('P', [[0.05, 0.3], [-0.7, 1.1], [-1.9, 1.9], [-1.8, 1.4], [-2.2, 1.2], [-1.6, 0.8], [-2.0, 0.5], [-1.0, 0.0], [0, -0.3]], 0.2);
    k.prism('S', [[-0.3, 0.3], [-1.3, 1.1], [-1.4, 0.98], [-0.4, 0.16]], 0.22);
    k.prism('T', [[-1.6, 1.62], [-1.9, 1.9], [-1.8, 1.5]], 0.22, { bevel: 0.01 });
    const wing = s === 1 ? J.wingL : J.wingR;
    wing.position.set(s * 1.4, 1.25, -1.3);
    c.put(wing, k);
  }

  // ---- head: small and low, peering out of the maw --------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.3, 0.36, 0.42, 8, { at: [0, -0.08, -0.05] });
    k.box('P', 0.82, 0.62, 0.86, { at: [0, 0.3, 0.02], taper: [0.82, 0.8] });
    k.box('D', 0.74, 0.14, 0.3, { at: [0, 0.38, 0.36] });
    k.box('C', 0.66, 0.06, 0.04, { at: [0, 0.39, 0.52] });
    k.box('G', 0.14, 0.09, 0.05, { at: [0.14, 0.39, 0.53] });
    k.prism('F', [[0.2, 0.0], [0.5, 0.06], [0.5, 0.26], [0.24, 0.28]], 0.6);
    k.prism('S', [[0.1, 0.62], [-0.5, 0.72], [-0.56, 0.6], [-0.06, 0.52]], 0.1);
    const head = new THREE.Group();
    head.position.set(0, 0.05, 0.12);
    J.head.add(head);
    c.put(head, k);
  }

  // ---- arms: slab pauldrons bristling with spikes, spiked gauntlets ---------------------
  for (const s of [1, -1] as const) {
    const sh = s === 1 ? J.shL : J.shR;
    const el = s === 1 ? J.elL : J.elR;
    const wr = s === 1 ? J.wrL : J.wrR;
    {
      const k = new Kit(livery);
      k.ball('K', 0.52);
      k.cyl('K', 0.34, 0.4, d.upperArm - 0.25, 8, { at: [0, -d.upperArm / 2 - 0.05, 0] });
      k.box('P', 0.6, d.upperArm * 0.6, 0.78, { at: [s * 0.1, -d.upperArm * 0.58, 0], taper: [1.08, 1.05] });
      // Three layered slabs, and spikes along the top one.
      k.box('P', 1.3, 0.5, 1.5, { at: [s * 0.58, 0.42, 0], rot: [0, 0, s * -0.3], taper: [0.82, 0.86] });
      k.box('S', 1.24, 0.24, 1.4, { at: [s * 0.74, 0.04, 0], rot: [0, 0, s * -0.5] });
      k.box('P', 1.1, 0.24, 1.26, { at: [s * 0.86, -0.26, 0], rot: [0, 0, s * -0.7] });
      for (const z of [-0.44, 0.0, 0.44]) {
        k.plate('T', [[-0.11, 0], [0.11, 0], [0, 0.9 - Math.abs(z) * 0.6]], 0.22, { at: [s * 0.74, 0.66, z], rot: [0, 0, s * -0.42] });
      }
      c.put(sh, k);
      decal(sh, livery, s === 1 ? 'emblem' : 'caution', [s * 0.42, -d.upperArm * 0.58, 0], [0, (s * Math.PI) / 2, 0], 0.5, s === 1 ? 0.5 : 0.24);
    }
    {
      const k = new Kit(livery);
      const fl = d.foreArm;
      k.cyl('D', 0.4, 0.4, 0.8, 10, { axis: 'x' });
      // The gauntlet: angular and banded, with spikes along its outside.
      k.box('P', 1.1, fl + 0.2, 1.2, { at: [0, -fl / 2 - 0.1, 0], taper: [0.84, 0.84] });
      k.box('S', 1.16, 0.28, 1.26, { at: [0, -fl * 0.32, 0] });
      k.box('F', 1.16, 0.18, 1.26, { at: [0, -fl + 0.15, 0] });
      for (const y of [-0.4, -0.95, -1.5]) k.plate('T', [[-0.09, 0], [0.09, 0], [0, 0.6]], 0.16, { at: [s * 0.6, y, 0], rot: [0, 0, s * -1.6] });
      if (s === -1) {
        // The scatter cannon, slung under the right gauntlet.
        for (const [ox, oz] of [[0.25, 0], [-0.25, 0], [0, 0.3]] as const) {
          k.cyl('D', 0.2, 0.2, 1.5, 8, { at: [s * 0.78 + ox * 0.9, -fl * 0.75, oz * 0.9 + 0.1] });
          k.cyl('G', 0.13, 0.13, 0.05, 8, { at: [s * 0.78 + ox * 0.9, -fl * 0.75 - 0.77, oz * 0.9 + 0.1] });
        }
        k.box('F', 0.9, 0.9, 0.9, { at: [s * 0.75, -fl * 0.35, 0.15] });
        k.box('S', 0.94, 0.12, 0.94, { at: [s * 0.75, -fl * 0.35 + 0.3, 0.15] });
      }
      c.put(el, k);
    }
    {
      // The Breaker: an armoured fist with a spike on every knuckle.
      const k = new Kit(livery);
      k.box('K', 0.84, 0.62, 0.86, { at: [0, -0.34, 0.06] });
      k.box('P', 0.96, 0.4, 0.4, { at: [0, -0.28, -0.32], taper: [0.92, 1] });
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * 0.21;
        k.box('K', 0.18, 0.34, 0.3, { at: [x, -0.66, 0.24], rot: [0.35, 0, 0], bevel: 0.025 });
        k.plate('T', [[-0.06, 0], [0.06, 0], [0, 0.34]], 0.12, { at: [x, -0.52, 0.48], rot: [1.3, 0, 0] });
      }
      k.box('S', 0.92, 0.2, 0.32, { at: [0, -0.48, 0.42] });
      k.box('K', 0.2, 0.38, 0.24, { at: [-s * 0.42, -0.42, 0.34], rot: [0.2, 0, s * 0.5], bevel: 0.025 });
      c.put(wr, k);
    }
    const hand = s === 1 ? rig.handL : rig.handR;
    hand.position.set(0, -0.3, 0.6);
    if (s === -1) {
      rig.muzzle.position.set(-0.75, -d.foreArm * 0.75 - 0.9, 0.1);
      el.add(rig.muzzle);
    }
  }

  // ---- legs: spiked knees, heavy boots ---------------------------------------------------
  for (const s of [1, -1] as const) {
    const hip = s === 1 ? J.hipL : J.hipR;
    const knee = s === 1 ? J.kneeL : J.kneeR;
    const ankle = s === 1 ? J.ankleL : J.ankleR;
    {
      const k = new Kit(livery);
      k.box('K', 0.7 * b, d.thigh - 0.3, 0.74 * b, { at: [0, -d.thigh / 2 - 0.05, -0.02], taper: [1.2, 1.15] });
      k.prism('P', [[0.16, -0.28], [0.7, -0.5], [0.6, -d.thigh + 0.42], [0.3, -d.thigh + 0.2], [-0.1, -d.thigh + 0.5], [-0.16, -0.38]], 1.0 * b);
      k.prism('S', [[0.42, -1.0], [0.66, -1.24], [0.6, -1.56], [0.36, -1.4]], 1.02 * b);
      c.put(hip, k);
    }
    {
      const k = new Kit(livery);
      k.cyl('D', 0.44, 0.44, 0.86, 10, { axis: 'x' });
      // A knee spike jutting forward, and two more off the sides.
      k.prism('P', [[0.2, 0.5], [0.8, 0.3], [0.62, -0.4], [0.12, -0.5]], 0.84);
      k.prism('T', [[0.66, 0.3], [1.5, 0.12], [0.7, -0.08]], 0.3);
      for (const t of [1, -1]) k.plate('T', [[-0.07, 0], [0.07, 0], [0, 0.48]], 0.14, { at: [t * 0.44, 0.0, 0.1], rot: [0, 0, t * -1.5] });
      k.box('K', 0.7, d.shin - 0.4, 0.72, { at: [0, -d.shin / 2, -0.08] });
      k.prism('P', [[0.6, -0.3], [0.7, -1.1], [0.86, -d.shin + 0.45], [0.56, -d.shin + 0.15], [-0.66, -d.shin + 0.3], [-0.86, -0.8], [-0.4, -0.22]], 1.0);
      k.prism('S', [[0.66, -0.6], [0.74, -1.0], [0.7, -1.3], [0.6, -1.0]], 1.02);
      k.box('P', 1.2, 0.56, 1.36, { at: [0, -d.shin + 0.42, 0.06], taper: [0.82, 0.8] });
      k.box('F', 1.24, 0.12, 1.4, { at: [0, -d.shin + 0.66, 0.06] });
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
      // Toe spikes and a spur behind the heel.
      for (const x of [0.3, -0.3]) k.prism('T', [[len - 1.1, -ay + 0.6], [len - 0.3, -ay + 0.46], [len - 0.5, -ay + 0.36], [len - 1.1, -ay + 0.44]], 0.16, { at: [x, 0, 0] });
      k.prism('T', [[-0.86, -ay + 0.52], [-1.6, -ay + 0.72], [-1.62, -ay + 0.54], [-0.96, -ay + 0.42]], 0.16);
      k.box('K', 0.68, 0.18, len - 0.2, { at: [0, -ay + 0.4, (len - 1.85) / 2] });
      wheels(k, ay, [-0.6, 0.2, len - 1.35], 0.36, 0.5);
      c.put(ankle, k);
    }
  }
}
