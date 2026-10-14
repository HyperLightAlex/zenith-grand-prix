// The Vector, the midfielder: a motorsport machine. Smooth wedge bodywork,
// the pilot under a glass canopy on a nose-cone chest, a helmet with one wide
// wrap-around visor and a fin along the crown, teardrop shoulder pods
// carrying the race number, long shin fairings with calf fins, and skate
// boards under the feet. It carries its carbine in its right hand, the
// Snare launcher rides on the left forearm, and the Disruptor's emitter dish
// sits on the power unit. An original design. Model space: +z forward,
// +y up, +x to the mech's left.
import { decal } from './decals';
import { Kit } from './kit';
import { fist, numberDecal, wheels, type FrameCtx } from './parts';

export function buildVector(c: FrameCtx, number: string): void {
  const { rig, livery } = c;
  const J = rig.joints;
  const d = rig.dims;
  // A little broader than the forward it was first drawn as.
  const b = 1.12;

  // ---- pelvis: compact, with a race-car diffuser behind -------------------------
  {
    const k = new Kit(livery);
    k.box('K', 1.2 * b, 0.62, 0.9 * b, { at: [0, 0.02, 0] });
    k.box('F', 1.34 * b, 0.16, 0.98 * b, { at: [0, 0.34, 0] });
    for (const s of [1, -1]) k.ball('K', 0.34, { at: [s * d.hipX, -d.hipDrop, 0] });
    k.prism('S', [[0.05, 0.26], [0.55, 0.16], [0.46, -0.32], [0.1, -0.52]], 0.5 * b);
    k.box('T', 0.5 * b, 0.06, 0.3, { at: [0, 0.2, 0.42], rot: [-0.2, 0, 0] });
    for (const s of [1, -1]) k.box('P', 0.13, 0.66, 0.86 * b, { at: [s * (d.hipX + 0.4), -0.08, 0.02], taper: [1, 0.7], rot: [0, 0, s * 0.26] });
    k.prism('P', [[-0.1, 0.3], [-0.62, 0.2], [-0.68, -0.16], [-0.2, -0.3]], 1.1 * b);
    for (const x of [-0.36, 0, 0.36]) k.box('T', 0.04, 0.32, 0.34, { at: [x * b, -0.16, -0.62], bevel: 0.01 });
    c.put(J.hips, k);
  }

  // ---- waist ------------------------------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.42 * b, 0.5 * b, d.spineY + d.chestY, 10, { at: [0, (d.chestY - d.spineY) / 2 + 0.05, 0] });
    k.box('D', 0.9 * b, 0.15, 0.8 * b, { at: [0, 0.22, 0] });
    k.box('D', 0.86 * b, 0.15, 0.78 * b, { at: [0, 0.56, 0] });
    k.prism('S', [[0.34, 0.0], [0.56, 0.22], [0.52, 0.72], [0.32, 0.76]], 0.56 * b);
    c.put(J.spine, k);
  }

  // ---- chest: bodywork, nose cone and canopy -------------------------------------
  {
    const k = new Kit(livery);
    const cw = d.shoulderX - 0.42;
    k.box('K', 1.5 * b, 1.35, 1.2 * b, { at: [0, 0.78, -0.1] });
    k.plate('P', [[-0.62, 0.1], [0.62, 0.1], [cw, 0.64], [cw + 0.05, 1.14], [0.66, 1.52], [-0.66, 1.52], [-cw - 0.05, 1.14], [-cw, 0.64]], 1.42 * b, { at: [0, 0, -0.06] });
    // Nose cone tapering forward and down, a trim splitter under it, the glass canopy behind.
    k.box('S', 1.1, 0.8, 0.88, { at: [0, 0.66, 0.95], rot: [1.3, 0, 0], taper: [0.58, 0.5] });
    k.box('T', 1.16, 0.06, 0.66, { at: [0, 0.27, 0.94], rot: [0.12, 0, 0] });
    k.prism('C', [[0.55, 1.0], [0.94, 0.94], [0.8, 1.32], [0.48, 1.44]], 0.68);
    k.box('G', 0.32, 0.04, 0.02, { at: [0, 0.57, 1.36], rot: [0.3, 0, 0] });
    // Side pods with intakes.
    for (const s of [1, -1]) {
      k.box('P', 0.36, 0.76, 1.2 * b, { at: [s * (cw + 0.02), 0.62, 0.02], taper: [0.8, 0.9] });
      k.vent(0.32, 0.5, 4, { at: [s * (cw + 0.0), 0.62, 0.66 * b], depth: 0.1 });
      k.cyl('D', 0.38, 0.38, 0.5, 10, { axis: 'x', at: [s * (d.shoulderX - 0.28), d.shoulderY, 0] });
    }
    k.box('F', 1.1, 0.28, 1.0, { at: [0, 1.6, -0.08], taper: [0.82, 0.85] });
    // Dorsal fin behind the head, the power unit and its nozzles, and the Disruptor dish.
    k.prism('S', [[-0.6, 1.2], [-1.55, 2.5], [-1.82, 2.42], [-1.2, 1.0]], 0.15);
    k.prism('T', [[-1.37, 2.26], [-1.55, 2.5], [-1.82, 2.42], [-1.6, 2.17]], 0.17);
    k.box('F', 1.4, 1.1, 0.62, { at: [0, 0.84, -0.98], taper: [0.84, 0.9] });
    for (const s of [1, -1]) {
      k.cyl('K', 0.29, 0.29, 0.28, 10, { axis: 'z', at: [s * 0.44, 0.5, -1.27], rot: [-0.25, 0, 0] });
      k.nozzle(0.26, 0.46, { at: [s * 0.44, 0.5, -1.34], rot: [-0.25, 0, 0] });
    }
    k.lathe('F', [[0, 0], [0.5, 0.06], [0.6, 0.2], [0.56, 0.24], [0.44, 0.14], [0, 0.1]], 12, { at: [0, 1.42, -1.04], rot: [-0.5, 0, 0] });
    k.cyl('G', 0.12, 0.12, 0.08, 8, { at: [0, 1.5, -1.0], rot: [-0.5, 0, 0] });
    c.put(J.chest, k);
    for (const s of [1, -1]) c.flame(J.chest, [s * 0.44, 0.39, -1.79], [-0.25, 0, 0], 0.24, 3.2, 'main');
    decal(J.chest, livery, 'stripes', [0, 0.86, 1.15], [-1.0, 0, Math.PI / 2], 0.52, 0.44);
    decal(J.chest, livery, 'stencil', [0, 0.84, -1.3], [0, Math.PI, 0], 0.42);
    // Hazard chevrons between the nozzles, pointing down the exhaust.
    decal(J.chest, livery, 'chevrons', [0, 0.44, -1.3], [0, Math.PI, -Math.PI / 2], 0.32, 0.14);
  }

  // ---- canards ------------------------------------------------------------------------
  for (const s of [1, -1] as const) {
    const k = new Kit(livery);
    k.cyl('K', 0.13, 0.13, 0.28, 8, { axis: 'y' });
    k.prism('S', [[0.05, 0.12], [-1.7, 0.52], [-2.0, 0.44], [-0.7, -0.1]], 0.11);
    k.prism('T', [[-1.42, 0.5], [-1.7, 0.52], [-2.0, 0.44], [-1.62, 0.37]], 0.13);
    k.prism('G', [[-0.3, 0.06], [-1.3, 0.35], [-1.35, 0.29], [-0.35, 0.0]], 0.13);
    const wing = s === 1 ? J.wingL : J.wingR;
    wing.position.set(s * 0.72, 1.0, -1.06);
    c.put(wing, k);
  }

  // ---- head: racing helmet with a wrap visor -------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.21, 0.25, 0.38, 8, { at: [0, -0.08, -0.04] });
    k.lathe('P', [[0, 0], [0.31, 0.02], [0.38, 0.24], [0.35, 0.48], [0.21, 0.64], [0, 0.68]], 12, { scale: [1, 1, 1.25], at: [0, 0, 0.02] });
    // Visor: one sweep of tinted glass round the front and sides, a lit line behind it.
    k.lathe('C', [[0.37, 0.25], [0.4, 0.33], [0.39, 0.43], [0.36, 0.47]], 14, { scale: [1, 1, 1.25], at: [0, 0, 0.03] });
    k.box('G', 0.46, 0.03, 0.03, { at: [0, 0.37, 0.5] });
    k.lathe('P', [[0, 0.0], [0.29, 0.0], [0.34, 0.12], [0.35, 0.24], [0, 0.24]], 12, { scale: [0.95, 1, 1.22], at: [0, -0.02, 0.05] });
    // A trim stripe over the crown, the fin, and two short antennae.
    k.box('T', 0.12, 0.05, 0.86, { at: [0, 0.66, 0.0], rot: [0.05, 0, 0], bevel: 0.01 });
    k.prism('S', [[0.28, 0.62], [-0.64, 0.94], [-0.68, 0.82], [-0.2, 0.62]], 0.06);
    for (const s of [1, -1]) k.box('K', 0.03, 0.03, 0.52, { at: [s * 0.22, 0.55, -0.44], rot: [0.4, 0, 0], bevel: 0 });
    c.put(J.head, k);
  }

  // ---- arms ------------------------------------------------------------------------
  for (const s of [1, -1] as const) {
    const sh = s === 1 ? J.shL : J.shR;
    const el = s === 1 ? J.elL : J.elR;
    const wr = s === 1 ? J.wrL : J.wrR;
    {
      const k = new Kit(livery);
      k.ball('K', 0.38);
      k.cyl('K', 0.25, 0.29, d.upperArm - 0.25, 8, { at: [0, -d.upperArm / 2 - 0.05, 0] });
      k.box('P', 0.46, d.upperArm * 0.55, 0.58, { at: [s * 0.08, -d.upperArm * 0.6, 0], taper: [1.08, 1.05] });
      // Teardrop pod over the shoulder, a coloured band round its waist, an intake at its nose.
      k.lathe('P', [[0, -0.74], [0.3, -0.56], [0.42, -0.1], [0.4, 0.26], [0.23, 0.56], [0, 0.65]], 12, { axis: 'z', at: [s * 0.44, 0.22, 0], scale: [1.1, 1, 1] });
      k.cyl('S', 0.45, 0.43, 0.18, 12, { axis: 'z', at: [s * 0.44, 0.22, -0.18], scale: [1.1, 1, 1] });
      k.box('D', 0.24, 0.22, 0.06, { at: [s * 0.44, 0.22, 0.62], bevel: 0.01 });
      c.put(sh, k);
      // The race number on the outside of each pod.
      const num = numberDecal(number, livery);
      num.scale.setScalar(0.56);
      num.position.set(s * 0.92, 0.24, 0.02);
      num.rotation.y = (s * Math.PI) / 2;
      sh.add(num);
    }
    {
      const k = new Kit(livery);
      const fl = d.foreArm;
      k.cyl('D', 0.28, 0.28, 0.56, 10, { axis: 'x' });
      k.box('P', 0.58, fl - 0.15, 0.68, { at: [0, -fl / 2 - 0.05, 0.02], taper: [1.1, 1.08] });
      k.box('S', 0.06, fl * 0.6, 0.44, { at: [s * 0.31, -fl * 0.52, 0.02] });
      k.box('F', 0.5, 0.2, 0.56, { at: [0, -fl + 0.04, 0.02] });
      if (s === 1) {
        // Snare launcher on the left forearm: a short tube with a lit muzzle.
        k.box('F', 0.22, 0.7, 0.36, { at: [0.42, -fl * 0.5, 0.06] });
        k.cyl('S', 0.12, 0.12, 0.8, 8, { at: [0.42, -fl * 0.62, 0.22] });
        k.cyl('G', 0.07, 0.07, 0.02, 8, { at: [0.42, -fl * 0.62 - 0.41, 0.22] });
      }
      c.put(el, k);
    }
    {
      const k = new Kit(livery);
      fist(k, s, 1.05);
      if (s === -1) {
        // The carbine, gripped in the right fist: stock back toward the elbow,
        // barrel forward (down the line of the forearm), sight on top.
        k.box('F', 0.26, 1.5, 0.36, { at: [0, -0.5, 0.42] });
        k.box('S', 0.3, 0.7, 0.42, { at: [0, -0.62, 0.44], taper: [0.9, 0.9] });
        k.box('K', 0.2, 0.55, 0.3, { at: [0, 0.42, 0.36], taper: [1, 0.8] });
        k.box('K', 0.16, 0.42, 0.26, { at: [0, -1.02, 0.2], rot: [0.25, 0, 0] });
        k.cyl('D', 0.08, 0.09, 1.0, 8, { at: [0, -1.72, 0.46] });
        k.cyl('T', 0.12, 0.12, 0.16, 8, { at: [0, -2.2, 0.46] });
        k.box('K', 0.12, 0.34, 0.14, { at: [0, -0.48, 0.66] });
        k.box('G', 0.04, 0.24, 0.02, { at: [0.15, -0.6, 0.44] });
      }
      c.put(wr, k);
    }
    const hand = s === 1 ? rig.handL : rig.handR;
    hand.position.set(0, -0.2, 0.3);
    if (s === -1) {
      rig.muzzle.position.set(0, -2.32, 0.46);
      wr.add(rig.muzzle);
    }
  }

  // ---- legs ------------------------------------------------------------------------
  for (const s of [1, -1] as const) {
    const hip = s === 1 ? J.hipL : J.hipR;
    const knee = s === 1 ? J.kneeL : J.kneeR;
    const ankle = s === 1 ? J.ankleL : J.ankleR;
    {
      const k = new Kit(livery);
      k.box('K', 0.56, d.thigh - 0.3, 0.6, { at: [0, -d.thigh / 2 - 0.05, -0.02], taper: [1.18, 1.12] });
      k.prism('P', [[0.13, -0.3], [0.52, -0.6], [0.5, -d.thigh + 0.45], [0.31, -d.thigh + 0.2], [-0.05, -d.thigh + 0.35], [-0.13, -0.42]], 0.76);
      k.prism('P', [[-0.1, -0.5], [-0.38, -0.7], [-0.36, -1.6], [-0.13, -1.8]], 0.56);
      c.put(hip, k);
      decal(hip, livery, 'stripes', [0, -d.thigh * 0.5, 0.53], [0, 0, Math.PI / 2], 1.0, 0.4);
    }
    {
      const k = new Kit(livery);
      k.cyl('D', 0.31, 0.31, 0.62, 10, { axis: 'x' });
      k.prism('P', [[0.18, 0.34], [0.56, 0.12], [0.52, -0.24], [0.2, -0.32]], 0.62);
      // Shin fairing, swept smooth, with a calf fin trailing behind.
      k.box('K', 0.5, d.shin - 0.4, 0.52, { at: [0, -d.shin / 2, -0.06] });
      k.prism('P', [[0.45, -0.2], [0.66, -0.9], [0.62, -d.shin + 0.55], [0.38, -d.shin + 0.2], [-0.38, -d.shin + 0.3], [-0.56, -1.0], [-0.34, -0.2]], 0.78);
      k.prism('S', [[0.55, -0.5], [0.68, -0.95], [0.64, -d.shin + 0.6], [0.55, -d.shin + 0.62], [0.57, -0.95], [0.47, -0.52]], 0.34);
      k.prism('T', [[-0.4, -0.3], [-1.08, -0.6], [-1.04, -0.76], [-0.5, -1.1]], 0.08);
      k.nozzle(0.17, 0.28, { at: [0, -1.3, -0.54], rot: [0.9, 0, 0] }, 8);
      c.put(knee, k);
      c.flame(knee, [0, -1.52, -0.75], [0.9, 0, 0], 0.2, 1.6, 'leg');
      if (s === 1) decal(knee, livery, 'warning', [0.45, -0.75, -0.1], [0, Math.PI / 2, 0], 0.2);
    }
    {
      const k = new Kit(livery);
      const ay = d.ankleY;
      k.ball('K', 0.3);
      // Boot, then the board: a long deck with an upturned nose and a tail fin.
      k.prism('P', [[-0.55, -ay + 0.66], [-0.44, 0.16], [0.4, 0.13], [0.88, -ay + 0.7], [0.66, -ay + 0.64]], 0.66);
      k.prism('S', [[-1.25, -ay + 0.32], [1.85, -ay + 0.32], [2.12, -ay + 0.45], [1.98, -ay + 0.6], [-1.1, -ay + 0.6]], 0.74);
      k.prism('T', [[1.76, -ay + 0.45], [2.12, -ay + 0.45], [1.98, -ay + 0.6], [1.64, -ay + 0.6]], 0.76, { bevel: 0.015 });
      k.prism('T', [[-1.04, -ay + 0.32], [-1.3, -ay + 0.13], [-1.15, -ay + 0.13], [-0.78, -ay + 0.32]], 0.07);
      wheels(k, ay, [-0.66, 0.38, 1.42], 0.32, 0.34);
      c.put(ankle, k);
    }
  }
}
