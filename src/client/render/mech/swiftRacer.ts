// Swift concept A, "Racer": a motorsport athlete. Smooth wedge fairings
// like a race car's bodywork, the pilot under a glass canopy on a nose-cone
// chest, a helmet with one wide wrap-around visor and a dorsal fin, teardrop
// shoulder pods carrying the race number, long shin fairings with calf fins,
// and full-length skate boards under the feet. Original design; Model space:
// +z forward, +y up, +x to the mech's left.
import { decal } from './decals';
import { Kit } from './kit';
import { fist, numberDecal, wheels, type FrameCtx } from './parts';

export function buildSwiftRacer(c: FrameCtx, number: string): void {
  const { rig, livery } = c;
  const J = rig.joints;
  const d = rig.dims;

  // ---- pelvis: compact, with a race-car diffuser behind -------------------------
  {
    const k = new Kit(livery);
    k.box('K', 1.1, 0.6, 0.85, { at: [0, 0.02, 0] });
    k.box('F', 1.22, 0.16, 0.92, { at: [0, 0.34, 0] });
    for (const s of [1, -1]) k.ball('K', 0.32, { at: [s * d.hipX, -d.hipDrop, 0] });
    k.prism('S', [[0.05, 0.26], [0.5, 0.16], [0.42, -0.32], [0.1, -0.5]], 0.46);
    for (const s of [1, -1]) k.box('P', 0.12, 0.62, 0.8, { at: [s * (d.hipX + 0.36), -0.06, 0.02], taper: [1, 0.7], rot: [0, 0, s * 0.26] });
    k.prism('P', [[-0.1, 0.3], [-0.58, 0.2], [-0.64, -0.16], [-0.2, -0.28]], 1.0);
    for (const x of [-0.32, 0, 0.32]) k.box('T', 0.04, 0.3, 0.32, { at: [x, -0.16, -0.58], bevel: 0.01 });
    c.put(J.hips, k);
  }

  // ---- waist ------------------------------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.38, 0.46, d.spineY + d.chestY, 10, { at: [0, (d.chestY - d.spineY) / 2 + 0.05, 0] });
    k.box('D', 0.82, 0.14, 0.72, { at: [0, 0.2, 0] });
    k.box('D', 0.78, 0.14, 0.7, { at: [0, 0.5, 0] });
    k.prism('S', [[0.3, 0.0], [0.5, 0.2], [0.46, 0.66], [0.28, 0.7]], 0.5);
    c.put(J.spine, k);
  }

  // ---- chest: bodywork, nose cone and canopy -------------------------------------
  {
    const k = new Kit(livery);
    k.box('K', 1.3, 1.3, 1.1, { at: [0, 0.75, -0.1] });
    k.plate('P', [[-0.55, 0.1], [0.55, 0.1], [1.05, 0.62], [1.1, 1.12], [0.6, 1.48], [-0.6, 1.48], [-1.1, 1.12], [-1.05, 0.62]], 1.3, { at: [0, 0, -0.06] });
    // Nose cone tapering forward and down, a trim splitter under it, and the glass canopy behind.
    k.box('S', 1.0, 0.72, 0.82, { at: [0, 0.64, 0.86], rot: [1.3, 0, 0], taper: [0.58, 0.5] });
    k.box('T', 1.06, 0.06, 0.62, { at: [0, 0.27, 0.86], taper: [1, 1], rot: [0.12, 0, 0] });
    k.prism('C', [[0.5, 0.98], [0.86, 0.92], [0.74, 1.28], [0.44, 1.4]], 0.62);
    k.box('G', 0.3, 0.04, 0.02, { at: [0, 0.56, 1.24], rot: [0.3, 0, 0] });
    // Side pods with intakes.
    for (const s of [1, -1]) {
      k.box('P', 0.32, 0.72, 1.1, { at: [s * 1.08, 0.62, 0.02], taper: [0.8, 0.9] });
      k.vent(0.3, 0.46, 4, { at: [s * 1.06, 0.62, 0.58], depth: 0.1 });
      k.cyl('D', 0.34, 0.34, 0.46, 10, { axis: 'x', at: [s * (d.shoulderX - 0.26), d.shoulderY, 0] });
    }
    k.box('F', 1.0, 0.26, 0.9, { at: [0, 1.58, -0.08], taper: [0.82, 0.85] });
    // Dorsal fin rising behind the head, and the power unit with its nozzles.
    k.prism('S', [[-0.55, 1.15], [-1.5, 2.55], [-1.76, 2.48], [-1.15, 0.95]], 0.14);
    k.prism('T', [[-1.32, 2.3], [-1.5, 2.55], [-1.76, 2.48], [-1.56, 2.22]], 0.16);
    k.box('F', 1.06, 1.0, 0.55, { at: [0, 0.82, -0.9], taper: [0.82, 0.9] });
    for (const s of [1, -1]) {
      k.cyl('K', 0.27, 0.27, 0.26, 10, { axis: 'z', at: [s * 0.32, 0.5, -1.16], rot: [-0.25, 0, 0] });
      k.nozzle(0.24, 0.44, { at: [s * 0.32, 0.5, -1.22], rot: [-0.25, 0, 0] });
    }
    c.put(J.chest, k);
    for (const s of [1, -1]) c.flame(J.chest, [s * 0.32, 0.39, -1.65], [-0.25, 0, 0], 0.22, 3.4, 'main');
    decal(J.chest, livery, 'stripes', [0, 0.82, 1.06], [-1.0, 0, Math.PI / 2], 0.5, 0.42);
    decal(J.chest, livery, 'stencil', [0, 0.82, -1.18], [0, Math.PI, 0], 0.4);
  }

  // ---- canards ------------------------------------------------------------------------
  for (const s of [1, -1] as const) {
    const k = new Kit(livery);
    k.cyl('K', 0.12, 0.12, 0.26, 8, { axis: 'y' });
    k.prism('S', [[0.05, 0.12], [-1.55, 0.5], [-1.85, 0.42], [-0.65, -0.1]], 0.1);
    k.prism('T', [[-1.3, 0.48], [-1.55, 0.5], [-1.85, 0.42], [-1.5, 0.36]], 0.12);
    k.prism('G', [[-0.3, 0.06], [-1.2, 0.34], [-1.25, 0.28], [-0.35, 0.0]], 0.12);
    const wing = s === 1 ? J.wingL : J.wingR;
    wing.position.set(s * 0.58, 0.95, -0.98);
    c.put(wing, k);
  }

  // ---- head: racing helmet with a wrap visor -------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.2, 0.24, 0.36, 8, { at: [0, -0.08, -0.04] });
    k.lathe('P', [[0, 0], [0.3, 0.02], [0.37, 0.24], [0.34, 0.48], [0.2, 0.63], [0, 0.67]], 10, { scale: [1, 1, 1.25], at: [0, 0, 0.02] });
    // The visor: one sweep of tinted glass across the front and round the sides, a lit line behind it.
    k.lathe('C', [[0.36, 0.25], [0.39, 0.33], [0.38, 0.43], [0.35, 0.47]], 14, { scale: [1, 1, 1.25], at: [0, 0, 0.03] });
    k.box('G', 0.44, 0.03, 0.03, { at: [0, 0.37, 0.48] });
    // Jaw fairing, the fin along the crown, and two short antennae.
    k.lathe('P', [[0, 0.0], [0.28, 0.0], [0.33, 0.12], [0.34, 0.24], [0, 0.24]], 10, { scale: [0.95, 1, 1.22], at: [0, -0.02, 0.05] });
    k.prism('T', [[0.28, 0.6], [-0.62, 0.92], [-0.66, 0.8], [-0.2, 0.62]], 0.06);
    for (const s of [1, -1]) k.box('K', 0.03, 0.03, 0.5, { at: [s * 0.2, 0.55, -0.42], rot: [0.4, 0, 0], bevel: 0 });
    c.put(J.head, k);
  }

  // ---- arms ------------------------------------------------------------------------
  for (const s of [1, -1] as const) {
    const sh = s === 1 ? J.shL : J.shR;
    const el = s === 1 ? J.elL : J.elR;
    const wr = s === 1 ? J.wrL : J.wrR;
    {
      const k = new Kit(livery);
      k.ball('K', 0.34);
      k.cyl('K', 0.22, 0.26, d.upperArm - 0.25, 8, { at: [0, -d.upperArm / 2 - 0.05, 0] });
      k.box('P', 0.4, d.upperArm * 0.55, 0.52, { at: [s * 0.08, -d.upperArm * 0.6, 0], taper: [1.08, 1.05] });
      // Teardrop pod over the shoulder, a trim band round its waist.
      k.lathe('P', [[0, -0.66], [0.26, -0.5], [0.37, -0.1], [0.35, 0.24], [0.2, 0.5], [0, 0.58]], 12, { axis: 'z', at: [s * 0.4, 0.2, 0], scale: [1.1, 1, 1] });
      k.cyl('S', 0.395, 0.38, 0.16, 12, { axis: 'z', at: [s * 0.4, 0.2, -0.16], scale: [1.1, 1, 1] });
      k.box('D', 0.22, 0.2, 0.06, { at: [s * 0.4, 0.2, 0.55], bevel: 0.01 });
      c.put(sh, k);
      // The race number on the outside of each pod.
      const num = numberDecal(number, livery);
      num.scale.setScalar(0.5);
      num.position.set(s * 0.82, 0.22, 0.02);
      num.rotation.y = (s * Math.PI) / 2;
      sh.add(num);
    }
    {
      const k = new Kit(livery);
      const fl = d.foreArm;
      k.cyl('D', 0.25, 0.25, 0.5, 10, { axis: 'x' });
      k.box('P', 0.5, fl - 0.15, 0.6, { at: [0, -fl / 2 - 0.05, 0.02], taper: [1.1, 1.08] });
      k.box('S', 0.06, fl * 0.6, 0.4, { at: [s * 0.27, -fl * 0.52, 0.02] });
      k.box('F', 0.44, 0.18, 0.5, { at: [0, -fl + 0.04, 0.02] });
      // Blade as a fin along the outside of the forearm, its edge lit.
      k.prism('T', [[0.1, 0.1], [0.3, -0.05], [0.28, -fl - 1.5], [0.12, -fl - 2.0], [0.0, -fl - 1.2]], 0.08, { at: [s * 0.36, 0, 0] });
      k.prism('G', [[0.27, -0.1], [0.34, -0.1], [0.32, -fl - 1.48], [0.15, -fl - 2.05], [0.24, -fl - 1.5]], 0.04, { at: [s * 0.36, 0, 0] });
      c.put(el, k);
    }
    {
      const k = new Kit(livery);
      fist(k, s, 0.92);
      c.put(wr, k);
    }
    const hand = s === 1 ? rig.handL : rig.handR;
    hand.position.set(0, -0.2, 0.3);
    if (s === -1) {
      rig.muzzle.position.set(0, -d.foreArm - 1.5, 0.4);
      el.add(rig.muzzle);
    }
  }

  // ---- legs ------------------------------------------------------------------------
  for (const s of [1, -1] as const) {
    const hip = s === 1 ? J.hipL : J.hipR;
    const knee = s === 1 ? J.kneeL : J.kneeR;
    const ankle = s === 1 ? J.ankleL : J.ankleR;
    {
      const k = new Kit(livery);
      k.box('K', 0.5, d.thigh - 0.3, 0.54, { at: [0, -d.thigh / 2 - 0.05, -0.02], taper: [1.18, 1.12] });
      k.prism('P', [[0.12, -0.3], [0.46, -0.6], [0.44, -d.thigh + 0.45], [0.28, -d.thigh + 0.2], [-0.05, -d.thigh + 0.35], [-0.12, -0.42]], 0.68);
      k.prism('P', [[-0.1, -0.5], [-0.34, -0.7], [-0.32, -1.7], [-0.12, -1.9]], 0.5);
      c.put(hip, k);
      decal(hip, livery, 'stripes', [0, -d.thigh * 0.5, 0.47], [0, 0, Math.PI / 2], 1.0, 0.36);
    }
    {
      const k = new Kit(livery);
      k.cyl('D', 0.28, 0.28, 0.56, 10, { axis: 'x' });
      k.prism('P', [[0.16, 0.32], [0.5, 0.12], [0.46, -0.22], [0.18, -0.3]], 0.56);
      // Shin fairing, swept smooth, with a calf fin trailing behind.
      k.box('K', 0.44, d.shin - 0.4, 0.46, { at: [0, -d.shin / 2, -0.06] });
      k.prism('P', [[0.4, -0.2], [0.6, -0.9], [0.56, -d.shin + 0.55], [0.34, -d.shin + 0.2], [-0.34, -d.shin + 0.3], [-0.5, -1.0], [-0.3, -0.2]], 0.7);
      k.prism('S', [[0.5, -0.5], [0.62, -0.95], [0.58, -d.shin + 0.6], [0.5, -d.shin + 0.62], [0.52, -0.95], [0.42, -0.52]], 0.3);
      k.prism('T', [[-0.36, -0.3], [-0.98, -0.6], [-0.94, -0.76], [-0.46, -1.1]], 0.07);
      k.nozzle(0.15, 0.26, { at: [0, -1.35, -0.48], rot: [0.9, 0, 0] }, 8);
      c.put(knee, k);
      c.flame(knee, [0, -1.55, -0.68], [0.9, 0, 0], 0.18, 1.6, 'leg');
    }
    {
      const k = new Kit(livery);
      const ay = d.ankleY;
      k.ball('K', 0.28);
      // Boot, then the board: a long deck with an upturned nose and a tail fin.
      k.prism('P', [[-0.5, -ay + 0.62], [-0.4, 0.15], [0.36, 0.12], [0.8, -ay + 0.66], [0.6, -ay + 0.6]], 0.6);
      k.prism('S', [[-1.15, -ay + 0.3], [1.7, -ay + 0.3], [1.95, -ay + 0.42], [1.82, -ay + 0.56], [-1.0, -ay + 0.56]], 0.68);
      k.prism('T', [[1.62, -ay + 0.42], [1.95, -ay + 0.42], [1.82, -ay + 0.56], [1.5, -ay + 0.56]], 0.7, { bevel: 0.015 });
      k.prism('T', [[-0.95, -ay + 0.3], [-1.2, -ay + 0.12], [-1.05, -ay + 0.12], [-0.7, -ay + 0.3]], 0.06);
      wheels(k, ay, [-0.6, 0.35, 1.3], 0.3, 0.32);
      c.put(ankle, k);
    }
  }
}
