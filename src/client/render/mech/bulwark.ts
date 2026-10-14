// The Bulwark, the defender: a loud, spiky super robot. A massive V torso
// with a fanged grille across the chest and a lit core behind the teeth, a
// scowling head under a crown of swept flame spikes, huge horned shoulders,
// gauntlets with saw-toothed fins for the Breaker and the scatter cannon slung
// under the right one, pointed knee caps, flared boots with spurs, flame-cut
// skirts and stabilisers cut like flames. An original design. Model space:
// +z forward, +y up, +x to the mech's left.
import { decal } from './decals';
import { Kit } from './kit';
import { mirrorX, numberDecal, wheels, type FrameCtx } from './parts';

export function buildBulwark(c: FrameCtx, number: string): void {
  const { rig, livery } = c;
  const J = rig.joints;
  const d = rig.dims;
  const b = 1.38;

  // ---- pelvis: a big buckle and flame-cut skirts --------------------------------
  {
    const k = new Kit(livery);
    k.box('K', 1.25 * b, 0.66, 0.95 * b, { at: [0, 0.02, -0.02], taper: [1.12, 1.05] });
    k.box('S', 1.4 * b, 0.24, 1.05 * b, { at: [0, 0.38, -0.02] });
    for (const s of [1, -1]) k.ball('K', 0.44, { at: [s * d.hipX, -d.hipDrop, 0] });
    // Buckle: a downward chevron with a lit centre.
    k.plate('T', [[-0.56, 0.22], [0.56, 0.22], [0, -0.52]], 0.2, { at: [0, 0.14, 0.7] });
    k.plate('G', [[-0.18, 0.14], [0.18, 0.14], [0, -0.15]], 0.03, { at: [0, 0.14, 0.81] });
    for (const s of [1, -1]) {
      k.box('P', 0.18, 1.1, 1.2 * b, { at: [s * (d.hipX + 0.62), -0.2, 0.02], taper: [1, 0.75], rot: [0, 0, s * 0.22] });
      k.box('T', 0.2, 0.14, 1.1 * b, { at: [s * (d.hipX + 0.72), 0.24, 0.02], rot: [0, 0, s * 0.22] });
    }
    c.put(J.hips, k);
    for (const s of [1, -1] as const) {
      const sk = s === 1 ? rig.skirts.l : rig.skirts.r;
      sk.position.set(s * 0.52, 0.24, 0.62);
      const f = new Kit(livery);
      f.cyl('K', 0.08, 0.08, 0.6, 8, { axis: 'x' });
      // A flame tongue: three points down the front of the thigh.
      f.plate('P', [[-0.36, 0.04], [0.36, 0.04], [0.34, -0.6], [0.2, -1.08], [0.08, -0.72], [-0.05, -1.22], [-0.16, -0.78], [-0.34, -0.96]], 0.14, { at: [0, 0, 0.1], rot: [-0.12, 0, 0] });
      f.plate('S', [[-0.24, -0.14], [0.24, -0.14], [0.16, -0.48], [-0.16, -0.48]], 0.05, { at: [0, 0, 0.19], rot: [-0.12, 0, 0] });
      c.put(sk, f);
    }
  }

  // ---- waist ------------------------------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.48 * b, 0.58 * b, d.spineY + d.chestY, 10, { at: [0, (d.chestY - d.spineY) / 2 + 0.05, 0] });
    k.box('D', 1.0 * b, 0.17, 0.9 * b, { at: [0, 0.24, 0] });
    k.box('D', 0.96 * b, 0.17, 0.88 * b, { at: [0, 0.6, 0] });
    k.plate('P', [[-0.42, 0.0], [0.42, 0.0], [0.34, 0.78], [-0.34, 0.78]], 0.18, { at: [0, 0.02, 0.62] });
    c.put(J.spine, k);
  }

  // ---- chest: a massive V with a fanged grille -------------------------------------
  {
    const k = new Kit(livery);
    const cw = d.shoulderX - 0.45;
    k.box('K', 2.1, 1.55, 1.5, { at: [0, 0.82, -0.1] });
    k.plate('P', [[-0.8, 0.05], [0.8, 0.05], [cw, 0.9], [cw + 0.06, 1.44], [0.9, 1.74], [-0.9, 1.74], [-cw - 0.06, 1.44], [-cw, 0.9]], 1.8, { at: [0, 0, -0.08] });
    // The grille: a wide chevron with teeth, a lit core glowing behind them.
    k.plate('S', [[-1.15, 1.42], [1.15, 1.42], [0.8, 0.66], [0, 0.18], [-0.8, 0.66]], 0.28, { at: [0, 0, 0.88] });
    k.plate('G', [[-0.78, 1.24], [0.78, 1.24], [0.52, 0.76], [0, 0.42], [-0.52, 0.76]], 0.02, { at: [0, 0, 1.03] });
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.27;
      const top = 1.28;
      const len = 0.52 - Math.abs(i - 2) * 0.08;
      const low = 0.5 + Math.abs(i - 2) * 0.17;
      k.plate('F', [[x - 0.1, top], [x + 0.1, top], [x, top - len]], 0.1, { at: [0, 0, 1.06] });
      k.plate('F', [[x - 0.09, low], [x, low + len * 0.75], [x + 0.09, low]], 0.1, { at: [0, 0, 1.06] });
    }
    k.box('T', 2.36, 0.12, 0.32, { at: [0, 1.48, 0.88] });
    for (const s of [1, -1]) {
      k.cyl('D', 0.5, 0.5, 0.6, 10, { axis: 'x', at: [s * (d.shoulderX - 0.34), d.shoulderY, 0] });
      k.vent(0.4, 0.5, 4, { at: [s * (cw - 0.1), 0.62, 0.92], rot: [0, s * 0.35, 0], depth: 0.1 });
    }
    k.box('F', 1.4, 0.34, 1.2, { at: [0, 1.82, -0.1], taper: [0.82, 0.85] });
    // Backpack with twin nozzles under swept fins.
    k.box('F', 2.4, 1.6, 1.0, { at: [0, 0.95, -1.25], taper: [0.86, 0.82] });
    k.box('P', 1.5, 0.5, 0.52, { at: [0, 1.78, -1.22] });
    for (const s of [1, -1]) {
      k.nozzle(0.42, 0.66, { at: [s * 0.72, 0.56, -1.72], rot: [-0.25, 0, 0] });
      k.prism('T', [[-1.05, 1.4], [-1.9, 2.25], [-1.95, 2.08], [-1.4, 1.05]], 0.14, { at: [s * 0.78, 0, 0] });
    }
    c.put(J.chest, k);
    for (const s of [1, -1]) c.flame(J.chest, [s * 0.72, 0.4, -2.36], [-0.25, 0, 0], 0.4, 3.0, 'main');
    // The number on the backpack's face (it sat inside it, out of sight),
    // above the nozzles, on a roundel; hazard chevrons between the nozzles.
    const num = numberDecal(number, livery);
    num.scale.setScalar(0.85);
    num.position.set(0, 1.22, -1.77);
    num.rotation.y = Math.PI;
    num.renderOrder = 3;
    J.chest.add(num);
    decal(J.chest, livery, 'roundel', [0, 1.22, -1.765], [0, Math.PI, 0], 0.95);
    decal(J.chest, livery, 'chevrons', [0, 0.42, -1.765], [0, Math.PI, -Math.PI / 2], 0.5, 0.2);
    decal(J.chest, livery, 'caution', [0, 1.78, -1.49], [0, Math.PI, 0], 1.1, 0.4);
  }

  // ---- flame stabilisers ---------------------------------------------------------------
  for (const s of [1, -1] as const) {
    const k = new Kit(livery);
    k.cyl('K', 0.18, 0.18, 0.4, 8, { axis: 'y' });
    k.prism('S', [[0.05, 0.3], [-0.6, 0.9], [-1.4, 1.6], [-1.2, 1.05], [-2.0, 1.25], [-1.55, 0.6], [-2.2, 0.5], [-1.1, 0.0], [0, -0.3]], 0.2);
    k.prism('T', [[-1.05, 1.3], [-1.4, 1.6], [-1.2, 1.05]], 0.22, { bevel: 0.01 });
    k.prism('G', [[-0.3, 0.05], [-1.35, 0.5], [-1.4, 0.4], [-0.35, -0.05]], 0.24);
    const wing = s === 1 ? J.wingL : J.wingR;
    wing.position.set(s * 1.4, 1.25, -1.3);
    c.put(wing, k);
  }

  // ---- head: scowling, crowned with flame spikes --------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.28, 0.34, 0.42, 8, { at: [0, -0.08, -0.05] });
    k.prism('P', [[-0.5, 0.06], [0.2, 0.04], [0.52, 0.24], [0.5, 0.62], [0.08, 0.82], [-0.46, 0.74], [-0.6, 0.4]], 0.96);
    // Heavy brow over angry slanted eyes.
    k.box('D', 0.74, 0.18, 0.12, { at: [0, 0.44, 0.47] });
    const eye: Array<[number, number]> = [[0.05, 0.4], [0.3, 0.45], [0.28, 0.51], [0.06, 0.45]];
    k.plate('G', eye, 0.03, { at: [0, 0, 0.54] });
    k.plate('G', mirrorX(eye), 0.03, { at: [0, 0, 0.54] });
    const brow: Array<[number, number]> = [[0.0, 0.51], [0.46, 0.62], [0.46, 0.72], [0.0, 0.6]];
    k.plate('S', brow, 0.24, { at: [0, 0, 0.44] });
    k.plate('S', mirrorX(brow), 0.24, { at: [0, 0, 0.44] });
    // Mouthguard with slots.
    k.prism('F', [[0.18, 0.02], [0.54, 0.14], [0.54, 0.34], [0.22, 0.34]], 0.6);
    for (const x of [-0.15, 0, 0.15]) k.box('D', 0.05, 0.14, 0.04, { at: [x, 0.2, 0.54], bevel: 0 });
    // Crown: three swept flame spikes, and one more off each side.
    for (const [x, h, back] of [[0, 1.2, 1.0], [0.24, 0.94, 0.82], [-0.24, 0.94, 0.82]] as const) {
      k.prism('T', [[0.24, 0.7], [-back, 0.7 + h], [-back + 0.14, 0.7 + h * 0.6], [-0.26, 0.66]], 0.1, { at: [x, 0, 0] });
    }
    for (const s of [1, -1]) k.prism('T', [[0.12, 0.4], [-0.58, 0.92], [-0.52, 0.7], [-0.12, 0.28]], 0.09, { at: [s * 0.48, 0, 0], rot: [0, 0, s * -0.3] });
    c.put(J.head, k);
  }

  // ---- arms: horned shoulders, gauntlets ------------------------------------------
  for (const s of [1, -1] as const) {
    const sh = s === 1 ? J.shL : J.shR;
    const el = s === 1 ? J.elL : J.elR;
    const wr = s === 1 ? J.wrL : J.wrR;
    {
      const k = new Kit(livery);
      k.ball('K', 0.52);
      k.cyl('K', 0.34, 0.4, d.upperArm - 0.25, 8, { at: [0, -d.upperArm / 2 - 0.05, 0] });
      k.box('P', 0.6, d.upperArm * 0.6, 0.78, { at: [s * 0.1, -d.upperArm * 0.58, 0], taper: [1.08, 1.05] });
      // Huge rounded shoulder, a band round it, and a horn sweeping back and up.
      k.lathe('P', [[0, -0.66], [0.6, -0.56], [0.78, -0.12], [0.72, 0.34], [0.42, 0.62], [0, 0.66]], 10, { at: [s * 0.62, 0.26, 0], scale: [1, 0.9, 1.15] });
      k.cyl('S', 0.8, 0.8, 0.22, 10, { at: [s * 0.62, 0.12, 0], scale: [1, 1, 1.15] });
      k.prism('T', [[0.35, 0.36], [-1.2, 1.6], [-1.12, 1.35], [-0.28, 0.22]], 0.16, { at: [s * 1.0, 0, 0], rot: [0, 0, s * -0.2] });
      c.put(sh, k);
      decal(sh, livery, s === 1 ? 'emblem' : 'caution', [s * 1.43, 0.14, 0.02], [0, (s * Math.PI) / 2, 0], 0.7, s === 1 ? 0.7 : 0.32);
    }
    {
      const k = new Kit(livery);
      const fl = d.foreArm;
      k.cyl('D', 0.4, 0.4, 0.8, 10, { axis: 'x' });
      // Gauntlet: big, blunt and banded, a saw-toothed fin along the outside.
      k.box('P', 1.1, fl + 0.2, 1.2, { at: [0, -fl / 2 - 0.1, 0], taper: [0.82, 0.82] });
      k.box('S', 1.16, 0.28, 1.26, { at: [0, -fl * 0.3, 0] });
      k.box('T', 1.16, 0.18, 1.26, { at: [0, -fl + 0.15, 0] });
      const saw: Array<[number, number]> = [[0.3, 0.0], [0.56, -0.2], [0.44, -0.55], [0.62, -0.7], [0.46, -1.1], [0.64, -1.25], [0.42, -fl - 0.1], [0.1, -fl], [0.0, -0.4]];
      k.prism('T', saw, 0.14, { at: [s * 0.62, 0, 0] });
      k.prism('G', [[0.46, -0.55], [0.52, -0.55], [0.5, -1.2], [0.44, -1.2]], 0.16, { at: [s * 0.62, 0, 0] });
      if (s === -1) {
        // Scatter cannon slung under the right gauntlet.
        for (const [ox, oz] of [[0.25, 0], [-0.25, 0], [0, 0.3]] as const) {
          k.cyl('D', 0.2, 0.2, 1.5, 8, { at: [s * 0.78 + ox * 0.9, -fl * 0.75, oz * 0.9 + 0.1] });
          k.cyl('G', 0.13, 0.13, 0.05, 8, { at: [s * 0.78 + ox * 0.9, -fl * 0.75 - 0.77, oz * 0.9 + 0.1] });
        }
        k.box('F', 0.9, 0.9, 0.9, { at: [s * 0.75, -fl * 0.35, 0.15] });
        k.box('T', 0.94, 0.12, 0.94, { at: [s * 0.75, -fl * 0.35 + 0.3, 0.15] });
      }
      c.put(el, k);
    }
    {
      // An armoured fist, the Breaker.
      const k = new Kit(livery);
      k.box('K', 0.84, 0.62, 0.86, { at: [0, -0.34, 0.06] });
      k.box('P', 0.96, 0.4, 0.4, { at: [0, -0.28, -0.32], taper: [0.92, 1] });
      for (let i = 0; i < 4; i++) k.box('K', 0.18, 0.34, 0.3, { at: [(i - 1.5) * 0.21, -0.66, 0.24], rot: [0.35, 0, 0], bevel: 0.025 });
      k.box('S', 0.92, 0.2, 0.32, { at: [0, -0.5, 0.42] });
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

  // ---- legs: pointed knees, flared boots --------------------------------------------
  for (const s of [1, -1] as const) {
    const hip = s === 1 ? J.hipL : J.hipR;
    const knee = s === 1 ? J.kneeL : J.kneeR;
    const ankle = s === 1 ? J.ankleL : J.ankleR;
    {
      const k = new Kit(livery);
      k.box('K', 0.7 * b, d.thigh - 0.3, 0.74 * b, { at: [0, -d.thigh / 2 - 0.05, -0.02], taper: [1.2, 1.15] });
      k.prism('P', [[0.16, -0.28], [0.68, -0.46], [0.64, -d.thigh + 0.48], [0.4, -d.thigh + 0.22], [-0.08, -d.thigh + 0.5], [-0.16, -0.38]], 1.0 * b);
      k.prism('P', [[-0.16, -0.42], [-0.54, -0.55], [-0.52, -1.6], [-0.18, -1.8]], 0.8 * b);
      k.box('S', 0.16, d.thigh * 0.45, 0.66, { at: [s * 0.54 * b, -d.thigh * 0.5, 0.04] });
      c.put(hip, k);
    }
    {
      const k = new Kit(livery);
      k.cyl('D', 0.44, 0.44, 0.86, 10, { axis: 'x' });
      // Knee cap drawn to a point.
      k.prism('P', [[0.22, 0.58], [1.28, 0.14], [0.82, -0.36], [0.34, -0.6], [0.12, -0.14]], 0.84);
      k.prism('T', [[0.94, 0.24], [1.28, 0.14], [0.98, -0.12]], 0.28, { bevel: 0.01 });
      k.box('K', 0.7, d.shin - 0.4, 0.72, { at: [0, -d.shin / 2, -0.08] });
      // Shin flaring out to a heavy boot top.
      k.prism('P', [[0.6, -0.3], [0.68, -1.1], [0.9, -d.shin + 0.45], [0.58, -d.shin + 0.15], [-0.64, -d.shin + 0.3], [-0.84, -0.75], [-0.38, -0.22]], 1.0);
      k.box('P', 1.2, 0.56, 1.36, { at: [0, -d.shin + 0.42, 0.06], taper: [0.82, 0.8] });
      k.box('T', 1.24, 0.12, 1.4, { at: [0, -d.shin + 0.66, 0.06] });
      k.vent(0.4, 0.5, 3, { at: [s * 0.62, -0.9, -0.1], rot: [0, (s * Math.PI) / 2, 0], depth: 0.1, lit: true });
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
      k.prism('S', [[0.25, 0.24], [0.76, 0.18], [len - 1.25, -ay + 0.76], [0.62, -ay + 0.74]], 0.72);
      // Spur behind the heel.
      k.prism('T', [[-0.86, -ay + 0.52], [-1.6, -ay + 0.68], [-1.55, -ay + 0.54], [-0.96, -ay + 0.42]], 0.14);
      k.box('K', 0.68, 0.18, len - 0.2, { at: [0, -ay + 0.4, (len - 1.85) / 2] });
      wheels(k, ay, [-0.6, 0.2, len - 1.35], 0.36, 0.5);
      c.put(ankle, k);
    }
  }
}
