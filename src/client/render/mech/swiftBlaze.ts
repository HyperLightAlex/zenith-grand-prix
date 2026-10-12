// Swift concept C, "Blaze": loud, spiky, flamboyant. A heroic V torso with a
// fanged grille across the chest and a lit core behind the teeth, a scowling
// head under a crest of swept flame spikes, horned shoulders, saw-toothed
// blades flaring off the forearms, pointed knee caps, flared boots with
// spurs, and wings cut like flames. Original design. Model space: +z forward,
// +y up, +x to the mech's left.
import { decal } from './decals';
import { Kit } from './kit';
import { fist, mirrorX, numberDecal, wheels, type FrameCtx } from './parts';

export function buildSwiftBlaze(c: FrameCtx, number: string): void {
  const { rig, livery } = c;
  const J = rig.joints;
  const d = rig.dims;

  // ---- pelvis: a big buckle and flame-cut skirts --------------------------------
  {
    const k = new Kit(livery);
    k.box('K', 1.2, 0.6, 0.9, { at: [0, 0.02, -0.02], taper: [1.12, 1.05] });
    k.box('S', 1.36, 0.22, 1.0, { at: [0, 0.34, -0.02] });
    for (const s of [1, -1]) k.ball('K', 0.34, { at: [s * d.hipX, -d.hipDrop, 0] });
    // Buckle: a downward chevron with a lit centre.
    k.plate('T', [[-0.42, 0.2], [0.42, 0.2], [0, -0.42]], 0.18, { at: [0, 0.12, 0.52] });
    k.plate('G', [[-0.14, 0.12], [0.14, 0.12], [0, -0.12]], 0.03, { at: [0, 0.12, 0.62] });
    for (const s of [1, -1]) k.box('P', 0.14, 0.9, 0.86, { at: [s * (d.hipX + 0.46), -0.16, 0.02], taper: [1, 0.75], rot: [0, 0, s * 0.22] });
    c.put(J.hips, k);
    for (const s of [1, -1] as const) {
      const sk = s === 1 ? rig.skirts.l : rig.skirts.r;
      sk.position.set(s * 0.4, 0.22, 0.44);
      const f = new Kit(livery);
      f.cyl('K', 0.06, 0.06, 0.46, 8, { axis: 'x' });
      // A flame tongue: three points down the front of the thigh.
      f.plate('P', [[-0.28, 0.04], [0.28, 0.04], [0.26, -0.5], [0.16, -0.92], [0.06, -0.62], [-0.04, -1.05], [-0.12, -0.66], [-0.26, -0.82]], 0.12, { at: [0, 0, 0.08], rot: [-0.12, 0, 0] });
      f.plate('S', [[-0.18, -0.12], [0.18, -0.12], [0.12, -0.4], [-0.12, -0.4]], 0.04, { at: [0, 0, 0.16], rot: [-0.12, 0, 0] });
      c.put(sk, f);
    }
  }

  // ---- waist ------------------------------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.44, 0.54, d.spineY + d.chestY, 10, { at: [0, (d.chestY - d.spineY) / 2 + 0.05, 0] });
    k.box('D', 0.92, 0.15, 0.82, { at: [0, 0.2, 0] });
    k.box('D', 0.88, 0.15, 0.8, { at: [0, 0.5, 0] });
    k.plate('P', [[-0.38, 0.0], [0.38, 0.0], [0.3, 0.68], [-0.3, 0.68]], 0.16, { at: [0, 0.02, 0.44] });
    c.put(J.spine, k);
  }

  // ---- chest: a heroic V with a fanged grille --------------------------------------
  {
    const k = new Kit(livery);
    k.box('K', 1.6, 1.4, 1.15, { at: [0, 0.76, -0.08] });
    k.plate('P', [[-0.6, 0.05], [0.6, 0.05], [1.32, 0.86], [1.38, 1.36], [0.7, 1.62], [-0.7, 1.62], [-1.38, 1.36], [-1.32, 0.86]], 1.44, { at: [0, 0, -0.06] });
    // The grille: a wide chevron plate with teeth, a lit core glowing behind them.
    const jaw: Array<[number, number]> = [[-0.9, 1.3], [0.9, 1.3], [0.62, 0.62], [0, 0.22], [-0.62, 0.62]];
    k.plate('S', jaw, 0.24, { at: [0, 0, 0.72] });
    k.plate('G', [[-0.6, 1.14], [0.6, 1.14], [0.4, 0.72], [0, 0.42], [-0.4, 0.72]], 0.02, { at: [0, 0, 0.855] });
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.2;
      const top = 1.18;
      const len = 0.42 - Math.abs(i - 2) * 0.07;
      const low = 0.5 + Math.abs(i - 2) * 0.13;
      k.plate('F', [[x - 0.08, top], [x + 0.08, top], [x, top - len]], 0.08, { at: [0, 0, 0.89] });
      k.plate('F', [[x - 0.07, low], [x, low + len * 0.75], [x + 0.07, low]], 0.08, { at: [0, 0, 0.89] });
    }
    k.box('T', 1.92, 0.1, 0.28, { at: [0, 1.35, 0.72] });
    for (const s of [1, -1]) k.cyl('D', 0.38, 0.38, 0.5, 10, { axis: 'x', at: [s * (d.shoulderX - 0.28), d.shoulderY, 0] });
    k.box('F', 1.14, 0.3, 1.0, { at: [0, 1.66, -0.08], taper: [0.82, 0.85] });
    // Backpack with twin nozzles under swept fins.
    k.box('F', 1.3, 1.25, 0.6, { at: [0, 0.9, -0.94], taper: [0.82, 0.88] });
    for (const s of [1, -1]) {
      k.nozzle(0.27, 0.5, { at: [s * 0.4, 0.5, -1.26], rot: [-0.3, 0, 0] });
      k.prism('T', [[-0.95, 1.2], [-1.6, 1.85], [-1.64, 1.7], [-1.2, 0.9]], 0.1, { at: [s * 0.52, 0, 0] });
    }
    c.put(J.chest, k);
    for (const s of [1, -1]) c.flame(J.chest, [s * 0.4, 0.36, -1.74], [-0.3, 0, 0], 0.25, 3.4, 'main');
    const num = numberDecal(number, livery);
    num.scale.setScalar(0.7);
    num.position.set(0, 1.12, -1.25);
    num.rotation.y = Math.PI;
    J.chest.add(num);
  }

  // ---- flame wings ------------------------------------------------------------------
  for (const s of [1, -1] as const) {
    const k = new Kit(livery);
    k.cyl('K', 0.14, 0.14, 0.3, 8, { axis: 'y' });
    k.prism('S', [[0.05, 0.25], [-0.9, 0.9], [-2.0, 1.75], [-1.7, 1.15], [-2.9, 1.5], [-2.2, 0.75], [-3.2, 0.7], [-1.6, 0.1], [0, -0.25]], 0.12);
    k.prism('T', [[-1.6, 1.42], [-2.0, 1.75], [-1.7, 1.15]], 0.14, { bevel: 0.01 });
    k.prism('G', [[-0.3, 0.05], [-1.9, 0.62], [-1.95, 0.52], [-0.35, -0.04]], 0.16);
    const wing = s === 1 ? J.wingL : J.wingR;
    wing.position.set(s * 0.66, 1.08, -1.0);
    c.put(wing, k);
  }

  // ---- head: scowling, crowned with flame spikes --------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.22, 0.27, 0.38, 8, { at: [0, -0.08, -0.05] });
    k.prism('P', [[-0.42, 0.08], [0.16, 0.06], [0.42, 0.22], [0.4, 0.56], [0.06, 0.74], [-0.38, 0.66], [-0.5, 0.36]], 0.74);
    // Heavy brow over angry slanted eyes.
    k.box('D', 0.58, 0.16, 0.1, { at: [0, 0.4, 0.38] });
    const eye: Array<[number, number]> = [[0.04, 0.36], [0.24, 0.4], [0.22, 0.46], [0.05, 0.4]];
    k.plate('G', eye, 0.03, { at: [0, 0, 0.44] });
    k.plate('G', mirrorX(eye), 0.03, { at: [0, 0, 0.44] });
    const brow: Array<[number, number]> = [[0.0, 0.46], [0.36, 0.56], [0.36, 0.64], [0.0, 0.54]];
    k.plate('S', brow, 0.2, { at: [0, 0, 0.36] });
    k.plate('S', mirrorX(brow), 0.2, { at: [0, 0, 0.36] });
    // Mouthguard with slots.
    k.prism('F', [[0.14, 0.02], [0.44, 0.12], [0.44, 0.3], [0.18, 0.3]], 0.46);
    for (const x of [-0.12, 0, 0.12]) k.box('D', 0.04, 0.12, 0.04, { at: [x, 0.18, 0.44], bevel: 0 });
    // Crown: three swept flame spikes and one either side.
    for (const [x, h, back] of [[0, 1.1, 0.9], [0.18, 0.86, 0.75], [-0.18, 0.86, 0.75]] as const) {
      k.prism('T', [[0.2, 0.62], [-back, 0.62 + h], [-back + 0.12, 0.62 + h * 0.6], [-0.22, 0.58]], 0.08, { at: [x, 0, 0] });
    }
    for (const s of [1, -1]) k.prism('T', [[0.1, 0.36], [-0.5, 0.82], [-0.45, 0.62], [-0.1, 0.24]], 0.07, { at: [s * 0.38, 0, 0], rot: [0, 0, s * -0.3] });
    c.put(J.head, k);
  }

  // ---- arms: horned shoulders, saw-tooth blades ------------------------------------
  for (const s of [1, -1] as const) {
    const sh = s === 1 ? J.shL : J.shR;
    const el = s === 1 ? J.elL : J.elR;
    const wr = s === 1 ? J.wrL : J.wrR;
    {
      const k = new Kit(livery);
      k.ball('K', 0.38);
      k.cyl('K', 0.26, 0.3, d.upperArm - 0.25, 8, { at: [0, -d.upperArm / 2 - 0.05, 0] });
      k.box('P', 0.46, d.upperArm * 0.6, 0.6, { at: [s * 0.08, -d.upperArm * 0.58, 0], taper: [1.08, 1.05] });
      // Rounded shoulder with a trim band and a horn sweeping back and up.
      k.lathe('P', [[0, -0.5], [0.42, -0.42], [0.55, -0.1], [0.5, 0.25], [0.3, 0.46], [0, 0.5]], 10, { at: [s * 0.36, 0.2, 0], scale: [1, 0.9, 1.15] });
      k.cyl('S', 0.56, 0.56, 0.16, 10, { at: [s * 0.36, 0.1, 0], scale: [1, 1, 1.15] });
      k.prism('T', [[0.25, 0.3], [-0.9, 1.25], [-0.85, 1.05], [-0.2, 0.2]], 0.12, { at: [s * 0.62, 0, 0], rot: [0, 0, s * -0.2] });
      c.put(sh, k);
      decal(sh, livery, s === 1 ? 'emblem' : 'caution', [s * 0.92, 0.12, 0.02], [0, (s * Math.PI) / 2, 0], 0.5, s === 1 ? 0.5 : 0.24);
    }
    {
      const k = new Kit(livery);
      const fl = d.foreArm;
      k.cyl('D', 0.28, 0.28, 0.56, 10, { axis: 'x' });
      k.box('P', 0.62, fl - 0.12, 0.72, { at: [0, -fl / 2 - 0.04, 0.02], taper: [1.15, 1.12] });
      k.box('S', 0.66, 0.22, 0.76, { at: [0, -fl * 0.25, 0.02] });
      k.box('F', 0.5, 0.2, 0.56, { at: [0, -fl + 0.04, 0.02] });
      // Saw-tooth blade flaring off the outside of the forearm.
      const saw: Array<[number, number]> = [[0.15, 0.1], [0.42, -0.1], [0.36, -0.6], [0.5, -0.75], [0.34, -1.25], [0.48, -1.4], [0.3, -fl - 1.6], [0.12, -fl - 1.9], [0.04, -fl - 0.8], [0.0, -0.3]];
      k.prism('T', saw, 0.1, { at: [s * 0.44, 0, 0] });
      k.prism('G', [[0.3, -1.5], [0.36, -1.5], [0.26, -fl - 1.6], [0.14, -fl - 1.88], [0.2, -fl - 1.55]], 0.05, { at: [s * 0.44, 0, 0] });
      c.put(el, k);
    }
    {
      const k = new Kit(livery);
      fist(k, s, 1.05);
      c.put(wr, k);
    }
    const hand = s === 1 ? rig.handL : rig.handR;
    hand.position.set(0, -0.2, 0.3);
    if (s === -1) {
      rig.muzzle.position.set(0, -d.foreArm - 1.5, 0.4);
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
      k.box('K', 0.56, d.thigh - 0.3, 0.6, { at: [0, -d.thigh / 2 - 0.05, -0.02], taper: [1.2, 1.15] });
      k.prism('P', [[0.14, -0.28], [0.5, -0.46], [0.48, -d.thigh + 0.48], [0.3, -d.thigh + 0.22], [-0.06, -d.thigh + 0.5], [-0.12, -0.38]], 0.74);
      k.prism('P', [[-0.12, -0.42], [-0.4, -0.55], [-0.38, -1.72], [-0.14, -1.92]], 0.58);
      k.box('S', 0.12, d.thigh * 0.45, 0.5, { at: [s * 0.4, -d.thigh * 0.5, 0.04] });
      c.put(hip, k);
    }
    {
      const k = new Kit(livery);
      k.cyl('D', 0.32, 0.32, 0.62, 10, { axis: 'x' });
      // Knee cap drawn to a point.
      k.prism('P', [[0.18, 0.46], [0.95, 0.12], [0.6, -0.28], [0.26, -0.48], [0.1, -0.12]], 0.6);
      k.prism('T', [[0.7, 0.2], [0.95, 0.12], [0.72, -0.08]], 0.2, { bevel: 0.01 });
      k.box('K', 0.5, d.shin - 0.4, 0.52, { at: [0, -d.shin / 2, -0.08] });
      // Shin flaring out to the boot top.
      k.prism('P', [[0.44, -0.28], [0.5, -1.2], [0.66, -d.shin + 0.45], [0.42, -d.shin + 0.15], [-0.48, -d.shin + 0.3], [-0.62, -0.75], [-0.28, -0.22]], 0.72);
      k.box('P', 0.86, 0.5, 1.0, { at: [0, -d.shin + 0.38, 0.06], taper: [0.82, 0.8] });
      k.box('T', 0.9, 0.1, 1.04, { at: [0, -d.shin + 0.6, 0.06] });
      k.nozzle(0.17, 0.3, { at: [0, -1.25, -0.6], rot: [0.9, 0, 0] }, 8);
      c.put(knee, k);
      c.flame(knee, [0, -1.47, -0.82], [0.9, 0, 0], 0.2, 1.6, 'leg');
    }
    {
      const k = new Kit(livery);
      const ay = d.ankleY;
      const len = 2.6;
      k.ball('K', 0.3);
      k.prism('P', [[-0.85, -ay + 0.5], [-0.6, 0.18], [0.5, 0.14], [len - 0.95, -ay + 0.6], [len - 0.85, -ay + 0.42], [-0.95, -ay + 0.42]], 0.82);
      k.prism('S', [[0.25, 0.22], [0.7, 0.16], [len - 1.25, -ay + 0.72], [0.6, -ay + 0.7]], 0.54);
      // Spur behind the heel.
      k.prism('T', [[-0.8, -ay + 0.5], [-1.45, -ay + 0.62], [-1.4, -ay + 0.5], [-0.9, -ay + 0.4]], 0.1);
      k.box('K', 0.5, 0.16, len - 0.2, { at: [0, -ay + 0.38, (len - 1.85) / 2] });
      wheels(k, ay, [-0.55, 0.15, len - 1.35], 0.34, 0.36);
      c.put(ankle, k);
    }
  }
}
