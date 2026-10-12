// The Swift, the forward: a slim interceptor in the real-robot style. Twin
// eyes under a brow and a swept twin crest, a broad chest with intakes,
// boxy shoulders with verniers, hinged skirt armour, an inner frame showing
// at every joint, blades folded along both forearms, and swept wing binders.
// An original design. Model space: +z forward, +y up, +x to the mech's left.
import { decal } from './decals';
import { Kit } from './kit';
import { fist, mirrorX, numberDecal, type FrameCtx } from './parts';

export function buildSwift(c: FrameCtx, number: string): void {
  const { rig, livery } = c;
  const J = rig.joints;
  const d = rig.dims;

  // ---- pelvis and skirts ------------------------------------------------------
  {
    const k = new Kit(livery);
    k.box('K', 1.3, 0.62, 0.95, { at: [0, 0.02, -0.02], taper: [1.1, 1.05] });
    k.box('F', 1.42, 0.18, 1.06, { at: [0, 0.36, -0.02] });
    // Crotch block with a trim chevron.
    k.prism('S', [[0.1, 0.3], [0.56, 0.2], [0.5, -0.38], [0.22, -0.6], [-0.1, -0.5]], 0.5);
    k.plate('T', [[-0.2, 0.08], [0, -0.2], [0.2, 0.08], [0.12, 0.08], [0, -0.07], [-0.12, 0.08]], 0.05, { at: [0, -0.02, 0.54], rot: [-0.18, 0, 0] });
    // Hip joints.
    for (const s of [1, -1]) k.ball('K', 0.36, { at: [s * d.hipX, -d.hipDrop, 0] });
    // Side skirts, splayed clear of the thighs, each with a small vernier.
    for (const s of [1, -1]) {
      k.box('P', 0.14, 0.95, 0.9, { at: [s * (d.hipX + 0.5), -0.18, 0.02], taper: [1, 0.8], rot: [0, 0, s * 0.2] });
      k.box('S', 0.06, 0.72, 0.5, { at: [s * (d.hipX + 0.59), -0.2, 0.04], rot: [0, 0, s * 0.2] });
      k.nozzle(0.09, 0.18, { at: [s * (d.hipX + 0.5), 0.1, -0.44] }, 8);
    }
    c.put(J.hips, k);

    // Front skirts, hinged at the waist band.
    for (const s of [1, -1] as const) {
      const sk = s === 1 ? rig.skirts.l : rig.skirts.r;
      sk.position.set(s * 0.42, 0.26, 0.46);
      const f = new Kit(livery);
      f.cyl('K', 0.07, 0.07, 0.5, 8, { axis: 'x' });
      f.prism('P', [[0.02, 0.06], [0.18, 0.02], [0.13, -0.98], [-0.06, -0.92]], 0.58, { at: [s * 0.04, 0, 0] });
      f.prism('T', [[0.13, -0.72], [0.155, -0.72], [0.14, -0.86], [0.11, -0.86]], 0.6, { at: [s * 0.04, 0, 0.01], bevel: 0 });
      c.put(sk, f);
    }
    // Rear skirt.
    rig.skirts.back.position.set(0, 0.24, -0.5);
    const r = new Kit(livery);
    r.cyl('K', 0.07, 0.07, 0.8, 8, { axis: 'x' });
    r.prism('P', [[0.04, 0.04], [-0.14, 0.02], [-0.16, -0.78], [0.02, -0.74]], 1.0);
    r.prism('S', [[-0.15, -0.45], [-0.18, -0.45], [-0.19, -0.7], [-0.16, -0.7]], 0.56, { bevel: 0 });
    c.put(rig.skirts.back, r);
  }

  // ---- waist ----------------------------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.46, 0.56, d.spineY + d.chestY, 10, { at: [0, (d.chestY - d.spineY) / 2 + 0.05, 0] });
    k.box('D', 0.95, 0.16, 0.86, { at: [0, 0.18, 0.0] });
    k.box('D', 0.9, 0.16, 0.82, { at: [0, 0.48, 0.0] });
    // Armoured abdomen: two plates over the frame.
    k.box('S', 0.62, 0.26, 0.2, { at: [0, 0.16, 0.42], rot: [-0.1, 0, 0] });
    k.box('S', 0.66, 0.26, 0.2, { at: [0, 0.48, 0.44], rot: [-0.1, 0, 0] });
    c.put(J.spine, k);
  }

  // ---- chest and backpack ------------------------------------------------------
  {
    const k = new Kit(livery);
    const cw = 1.24; // half width at the shoulders
    k.box('K', 1.6, 1.4, 1.2, { at: [0, 0.75, -0.08] });
    // Main shell: a broad V from the waist to the shoulders.
    k.plate('P', [[-0.62, 0.06], [0.62, 0.06], [cw, 0.72], [cw, 1.24], [0.56, 1.58], [-0.56, 1.58], [-cw, 1.24], [-cw, 0.72]], 1.42, { at: [0, 0, -0.06] });
    // Upper chest plates, sloping back to the collar.
    for (const s of [1, -1]) k.box('P', 0.9, 0.2, 1.0, { at: [s * 0.62, 1.42, 0.12], rot: [-0.32, 0, s * 0.18], taper: [0.92, 1] });
    // Cockpit block, standing proud of the chest: faceted, with its hatch seam and lamp.
    k.plate('S', [[-0.36, 0.3], [0.36, 0.3], [0.5, 0.7], [0.44, 1.22], [-0.44, 1.22], [-0.5, 0.7]], 0.5, { at: [0, 0, 0.78] });
    k.prism('S', [[0.52, 1.22], [1.02, 1.12], [1.04, 0.7], [0.52, 0.66]], 0.7);
    k.box('K', 0.82, 0.035, 0.05, { at: [0, 0.92, 1.04], bevel: 0 });
    k.box('G', 0.36, 0.05, 0.02, { at: [0, 0.48, 1.04] });
    // Intakes either side of the cockpit: trim housings round dark grilles.
    for (const s of [1, -1]) {
      k.box('T', 0.5, 0.56, 0.24, { at: [s * 0.8, 1.06, 0.66], rot: [0.16, s * 0.12, 0] });
      k.vent(0.36, 0.4, 4, { at: [s * 0.8, 1.06, 0.79], rot: [0.16, s * 0.12, 0], depth: 0.1 });
    }
    // Collar and neck guard.
    k.box('F', 1.12, 0.3, 1.0, { at: [0, 1.62, -0.06], taper: [0.82, 0.85] });
    k.box('P', 0.24, 0.42, 0.7, { at: [0, 1.7, -0.36], taper: [0.6, 0.8] });
    // Flanks.
    for (const s of [1, -1]) {
      k.box('S', 0.16, 0.86, 0.92, { at: [s * 1.22, 0.62, -0.1], taper: [1, 0.85] });
      k.cyl('D', 0.36, 0.36, 0.5, 10, { axis: 'x', at: [s * (d.shoulderX - 0.28), d.shoulderY, 0] });
    }
    // Backpack: a block between the shoulder blades, two main nozzles, verniers on top.
    k.box('F', 1.34, 1.32, 0.6, { at: [0, 0.92, -0.94], taper: [0.8, 0.86] });
    k.box('S', 0.92, 0.5, 0.18, { at: [0, 1.28, -1.26], taper: [0.8, 1] });
    k.box('K', 0.5, 0.82, 0.3, { at: [0, 0.7, -1.28] });
    // Main nozzles angled down and back, under armoured housings.
    for (const s of [1, -1]) {
      k.box('S', 0.5, 0.36, 0.5, { at: [s * 0.42, 0.86, -1.3], taper: [0.9, 1], lean: -0.05 });
      k.cyl('K', 0.3, 0.3, 0.3, 10, { axis: 'z', at: [s * 0.42, 0.56, -1.22], rot: [-0.3, 0, 0] });
      k.nozzle(0.26, 0.5, { at: [s * 0.42, 0.55, -1.32], rot: [-0.3, 0, 0] });
      k.nozzle(0.1, 0.2, { at: [s * 0.5, 1.5, -1.18], rot: [-0.6, 0, 0] }, 8);
    }
    c.put(J.chest, k);
    for (const s of [1, -1]) c.flame(J.chest, [s * 0.42, 0.4, -1.8], [-0.3, 0, 0], 0.24, 3.4, 'main');
    const num = numberDecal(number, livery);
    num.scale.setScalar(0.7);
    num.position.set(0, 1.28, -1.36);
    num.rotation.y = Math.PI;
    J.chest.add(num);
    decal(J.chest, livery, 'caution', [0, 0.18, -1.44], [0, Math.PI, 0], 0.5, 0.2);
    decal(J.chest, livery, 'stencil', [0.62, 0.42, 0.56], [-0.05, 0.62, 0], 0.32);
  }

  // ---- wing binders ------------------------------------------------------------
  for (const s of [1, -1] as const) {
    const k = new Kit(livery);
    k.cyl('K', 0.14, 0.14, 0.3, 8, { axis: 'y' });
    // Spar, then the swept panel hung off it, a trim tip and a lit stripe.
    k.prism('K', [[0.05, 0.12], [-3.1, 1.32], [-3.2, 1.2], [-0.05, -0.08]], 0.2);
    k.prism('S', [[0, 0.22], [-0.5, 0.5], [-3.5, 1.46], [-3.8, 1.32], [-1.2, -0.08], [0, -0.24]], 0.12);
    k.prism('T', [[-2.7, 1.2], [-3.5, 1.46], [-3.8, 1.32], [-3.0, 1.06]], 0.14);
    k.prism('G', [[-0.4, 0.0], [-2.2, 0.6], [-2.3, 0.5], [-0.5, -0.1]], 0.16);
    k.nozzle(0.07, 0.14, { at: [0, 1.36, -3.55], rot: [0, 0, 0] }, 6);
    const wing = s === 1 ? J.wingL : J.wingR;
    wing.position.set(s * 0.62, 1.05, -0.96);
    c.put(wing, k);
  }

  // ---- head --------------------------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.2, 0.26, 0.4, 8, { at: [0, -0.1, -0.06] });
    // Helmet.
    k.prism('P', [[-0.44, 0.1], [0.1, 0.08], [0.38, 0.24], [0.36, 0.62], [0.04, 0.84], [-0.38, 0.74], [-0.5, 0.4]], 0.72);
    // Dark band the eyes sit in, and the eyes: two sharp, swept lenses.
    k.box('D', 0.56, 0.16, 0.1, { at: [0, 0.43, 0.38] });
    const eye: Array<[number, number]> = [[0.03, 0.37], [0.22, 0.4], [0.2, 0.47], [0.05, 0.44]];
    k.plate('G', eye, 0.03, { at: [0, 0, 0.44] });
    k.plate('G', mirrorX(eye), 0.03, { at: [0, 0, 0.44] });
    // Brow over the eyes, and a faceplate with a pointed chin.
    k.prism('P', [[0.22, 0.5], [0.5, 0.49], [0.47, 0.6], [0.18, 0.64]], 0.68);
    k.prism('P', [[0.18, 0.05], [0.42, 0.14], [0.46, 0.33], [0.3, 0.34], [0.1, 0.1]], 0.46);
    k.prism('S', [[0.38, 0.06], [0.48, 0.1], [0.44, 0.18], [0.34, 0.16]], 0.18, { bevel: 0.015 });
    // Cheek guards and ear sensors.
    for (const s of [1, -1]) {
      k.box('P', 0.1, 0.36, 0.42, { at: [s * 0.36, 0.28, 0.16], rot: [0, s * 0.25, 0] });
      k.cyl('F', 0.15, 0.15, 0.16, 10, { axis: 'x', at: [s * 0.38, 0.42, -0.06] });
      k.cyl('T', 0.1, 0.12, 0.06, 10, { axis: 'x', at: [s * 0.48, 0.42, -0.06] });
    }
    // Twin crest swept up and out from a forehead sensor, and a short rear fin.
    k.box('S', 0.2, 0.14, 0.12, { at: [0, 0.62, 0.42], taper: [0.7, 1] });
    k.box('G', 0.08, 0.06, 0.02, { at: [0, 0.62, 0.49] });
    const blade: Array<[number, number]> = [[0.02, 0.0], [0.09, -0.03], [0.66, 0.5], [0.63, 0.56]];
    k.plate('T', blade, 0.05, { at: [0, 0.64, 0.44], rot: [-0.28, 0, 0] });
    k.plate('T', mirrorX(blade), 0.05, { at: [0, 0.64, 0.44], rot: [-0.28, 0, 0] });
    k.prism('S', [[-0.2, 0.8], [-0.62, 0.92], [-0.66, 0.84], [-0.34, 0.7]], 0.08);
    c.put(J.head, k);
  }

  // ---- arms --------------------------------------------------------------------
  for (const s of [1, -1] as const) {
    const sh = s === 1 ? J.shL : J.shR;
    const el = s === 1 ? J.elL : J.elR;
    const wr = s === 1 ? J.wrL : J.wrR;
    {
      const k = new Kit(livery);
      k.ball('K', 0.38);
      // Upper arm: frame and an outer armour shell.
      k.cyl('K', 0.26, 0.3, d.upperArm - 0.25, 8, { at: [0, -d.upperArm / 2 - 0.05, 0] });
      k.box('P', 0.46, d.upperArm * 0.62, 0.6, { at: [s * 0.08, -d.upperArm * 0.58, 0], taper: [1.08, 1.05] });
      // Shoulder armour: a sloped block with a trim edge and a vernier behind.
      k.box('P', 0.92, 0.82, 1.22, { at: [s * 0.32, 0.16, 0], taper: [0.8, 0.9], rot: [0, 0, s * -0.16] });
      k.box('S', 1.0, 0.16, 1.3, { at: [s * 0.28, 0.6, 0], taper: [0.86, 0.92], rot: [0, 0, s * -0.3] });
      k.box('T', 0.14, 0.12, 1.26, { at: [s * 0.76, 0.5, 0], rot: [0, 0, s * -0.16] });
      k.vent(0.32, 0.22, 2, { at: [s * 0.5, -0.02, 0.62], depth: 0.08 });
      k.nozzle(0.12, 0.22, { at: [s * 0.38, 0.2, -0.62] }, 8);
      c.put(sh, k);
      if (s === 1) decal(sh, livery, 'emblem', [0.8, 0.08, 0.05], [0, Math.PI / 2, 0], 0.55);
      else decal(sh, livery, 'stripes', [-0.8, 0.08, 0.05], [0, -Math.PI / 2, 0], 0.6, 0.36);
    }
    {
      const k = new Kit(livery);
      const fl = d.foreArm;
      k.cyl('D', 0.28, 0.28, 0.56, 10, { axis: 'x' });
      // Elbow guard behind the joint.
      k.prism('F', [[-0.08, 0.2], [-0.4, 0.04], [-0.34, -0.34], [-0.04, -0.28]], 0.46);
      // Forearm armour, fuller at the elbow, a panel stripe down the outside.
      k.box('P', 0.6, fl - 0.15, 0.68, { at: [0, -fl / 2 - 0.05, 0.02], taper: [1.12, 1.1] });
      k.box('S', 0.08, fl * 0.62, 0.46, { at: [s * 0.32, -fl * 0.52, 0.02] });
      k.box('F', 0.5, 0.2, 0.56, { at: [0, -fl + 0.04, 0.02] });
      // The forearm blade, folded along the outside: a trim body with a lit edge.
      k.box('K', 0.12, 0.5, 0.3, { at: [s * 0.38, -0.32, 0.05] });
      k.prism('T', [[0.18, 0.2], [0.36, 0.05], [0.36, -fl - 1.7], [0.22, -fl - 2.25], [0.12, -fl - 1.4]], 0.1, { at: [s * 0.46, 0, 0] });
      k.prism('G', [[0.34, 0.0], [0.42, 0.0], [0.42, -fl - 1.66], [0.25, -fl - 2.3], [0.32, -fl - 1.7]], 0.05, { at: [s * 0.46, 0, 0] });
      c.put(el, k);
    }
    {
      const k = new Kit(livery);
      fist(k, s, 1);
      c.put(wr, k);
    }
    const hand = s === 1 ? rig.handL : rig.handR;
    hand.position.set(0, -0.2, 0.3);
    if (s === -1) {
      rig.muzzle.position.set(0, -d.foreArm - 1.5, 0.4);
      el.add(rig.muzzle);
    }
  }

  // ---- legs ----------------------------------------------------------------------
  for (const s of [1, -1] as const) {
    const hip = s === 1 ? J.hipL : J.hipR;
    const knee = s === 1 ? J.kneeL : J.kneeR;
    const ankle = s === 1 ? J.ankleL : J.ankleR;
    {
      const k = new Kit(livery);
      // Thigh frame, and armour wrapped round the front and outside.
      k.box('K', 0.56, d.thigh - 0.3, 0.6, { at: [0, -d.thigh / 2 - 0.05, -0.02], taper: [1.2, 1.15] });
      k.prism('P', [[0.16, -0.28], [0.5, -0.46], [0.48, -d.thigh + 0.48], [0.3, -d.thigh + 0.22], [-0.06, -d.thigh + 0.5], [-0.12, -0.38]], 0.76);
      k.box('S', 0.12, d.thigh * 0.5, 0.5, { at: [s * 0.4, -d.thigh * 0.5, 0.04] });
      k.box('T', 0.08, 0.1, 0.52, { at: [s * 0.41, -d.thigh * 0.24, 0.04], bevel: 0.015 });
      // Rear thigh plate.
      k.prism('P', [[-0.12, -0.42], [-0.4, -0.55], [-0.38, -1.72], [-0.14, -1.92]], 0.6);
      c.put(hip, k);
      decal(hip, livery, 'text', [s * 0.47, -d.thigh * 0.62, 0.04], [0, (s * Math.PI) / 2, 0], 0.4);
    }
    {
      const k = new Kit(livery);
      k.cyl('D', 0.32, 0.32, 0.64, 10, { axis: 'x' });
      // Pointed knee guard with a trim notch.
      k.prism('P', [[0.18, 0.48], [0.62, 0.2], [0.6, -0.26], [0.3, -0.5], [0.1, -0.12]], 0.66);
      k.prism('T', [[0.5, 0.05], [0.63, 0.0], [0.61, -0.12], [0.5, -0.08]], 0.3, { bevel: 0.015 });
      // Shin armour, a stripe down the front, frame showing behind.
      k.box('K', 0.5, d.shin - 0.4, 0.52, { at: [0, -d.shin / 2, -0.08] });
      k.prism('P', [[0.46, -0.28], [0.56, -d.shin + 0.55], [0.4, -d.shin + 0.25], [-0.4, -d.shin + 0.4], [-0.6, -0.75], [-0.28, -0.22]], 0.74);
      k.prism('S', [[0.5, -0.42], [0.6, -d.shin + 0.7], [0.55, -d.shin + 0.66], [0.45, -0.44]], 0.36);
      // Vents on the outside of the calf, lit when the leg thrusters burn.
      k.vent(0.3, 0.5, 3, { at: [s * 0.38, -1.0, -0.08], rot: [0, (s * Math.PI) / 2, 0], depth: 0.08, lit: true });
      // Calf thruster.
      k.nozzle(0.17, 0.3, { at: [0, -1.25, -0.6], rot: [0.9, 0, 0] }, 8);
      c.put(knee, k);
      c.flame(knee, [0, -1.47, -0.82], [0.9, 0, 0], 0.2, 1.6, 'leg');
      if (s === 1) decal(knee, livery, 'warning', [s * 0.39, -0.62, 0.12], [0, Math.PI / 2, 0], 0.22);
    }
    {
      const k = new Kit(livery);
      const ay = d.ankleY;
      const len = 2.6;
      k.ball('K', 0.32);
      for (const sx of [1, -1]) k.box('F', 0.1, 0.42, 0.5, { at: [sx * 0.34, -0.08, 0.04] });
      // Skate boot: armoured upper, toe cap, heel spur, sole.
      k.prism('P', [[-0.85, -ay + 0.5], [-0.6, 0.22], [0.5, 0.18], [len - 0.95, -ay + 0.6], [len - 0.85, -ay + 0.42], [-0.95, -ay + 0.42]], 0.8);
      k.prism('S', [[0.25, 0.26], [0.7, 0.2], [len - 1.25, -ay + 0.72], [0.6, -ay + 0.7]], 0.52);
      k.prism('T', [[-0.95, -ay + 0.45], [-1.15, -ay + 0.35], [-1.0, -ay + 0.6], [-0.8, -ay + 0.6]], 0.3);
      k.box('K', 0.5, 0.16, len - 0.2, { at: [0, -ay + 0.38, (len - 1.85) / 2] });
      // Inline wheels with lit hubs.
      for (const wz of [-0.55, 0.15, len - 1.35]) {
        k.cyl('D', 0.34, 0.34, 0.36, 12, { axis: 'x', at: [0, -ay + 0.34, wz] });
        k.cyl('G', 0.14, 0.14, 0.4, 6, { axis: 'x', at: [0, -ay + 0.34, wz] });
      }
      c.put(ankle, k);
    }
  }
}
