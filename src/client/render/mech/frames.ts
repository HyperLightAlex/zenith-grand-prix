// The three frames: Swift (forward), Vector (midfielder), Bulwark (defender).
// Original designs, built part by part with the kit. Model space: +z forward,
// +y up, +x to the mech's left.
import * as THREE from 'three';
import { ROLE, type Role } from '../../../sim/config';
import type { Livery } from '../palette';
import { Kit, glowMaterial } from './kit';
import { frameCtx, numberDecal } from './parts';
import { MechRig, type FrameDims } from './rig';
import { buildSwift } from './swift';

const DIMS: Record<Role, FrameDims> = {
  [ROLE.FW]: { hipY: 5.5, hipX: 0.72, hipDrop: 0.25, thigh: 2.35, shin: 2.3, ankleY: 0.6, spineY: 0.4, chestY: 0.8, shoulderX: 1.5, shoulderY: 0.95, headY: 1.5, headZ: 0.15, upperArm: 1.5, foreArm: 1.45, height: 8.8 },
  [ROLE.MF]: { hipY: 5.25, hipX: 0.82, hipDrop: 0.25, thigh: 2.2, shin: 2.15, ankleY: 0.65, spineY: 0.45, chestY: 0.85, shoulderX: 1.75, shoulderY: 1.0, headY: 1.55, headZ: 0.12, upperArm: 1.5, foreArm: 1.5, height: 8.7 },
  [ROLE.DF]: { hipY: 5.05, hipX: 1.0, hipDrop: 0.3, thigh: 2.05, shin: 2.0, ankleY: 0.7, spineY: 0.5, chestY: 0.95, shoulderX: 2.25, shoulderY: 1.05, headY: 1.55, headZ: 0.2, upperArm: 1.55, foreArm: 1.6, height: 8.7 },
};

export function buildFrame(role: Role, livery: Livery, number: string): MechRig {
  const d = DIMS[role];
  const rig = new MechRig(d);
  const ctx = frameCtx(rig, livery);
  if (role === ROLE.FW) {
    buildSwift(ctx, number);
    return rig;
  }
  const J = rig.joints;
  const FW = false as boolean;
  const DF = role === ROLE.DF;
  // Bulk multiplier: how chunky the limbs are.
  const b = FW ? 1 : DF ? 1.42 : 1.16;
  const put = (joint: THREE.Object3D, k: Kit): void => ctx.put(joint, k);
  const flame = ctx.flame;

  // ---- pelvis --------------------------------------------------------------
  {
    const k = new Kit(livery);
    k.box('F', 1.5 * b, 0.75, 1.05 * b, { at: [0, 0.05, 0], taper: [1.15, 1.05] });
    // Codpiece wedge and rear plate.
    k.prism('P', [[0.3, 0.35], [0.95 * b, 0.1], [0.75 * b, -0.75], [0.3, -0.55]], 0.62 * b);
    k.prism('S', [[-0.3, 0.3], [-0.85 * b, 0.15], [-0.7 * b, -0.6], [-0.3, -0.45]], 0.7 * b);
    // Hip joints.
    k.cyl('D', 0.4 * b, 0.4 * b, d.hipX * 2 + 0.5, 8, { axis: 'x', at: [0, -d.hipDrop, 0] });
    for (const s of [1, -1]) {
      // Side skirts.
      k.box(DF ? 'P' : 'S', 0.22, 1.05, 1.15 * b, { at: [s * (d.hipX + 0.5 * b), -0.25, 0], taper: [1, 0.7], rot: [0, 0, s * -0.12] });
      if (!FW) k.box('T', 0.24, 0.16, 1.0 * b, { at: [s * (d.hipX + 0.52 * b), 0.2, 0] });
    }
    put(J.hips, k);
  }

  // ---- waist ---------------------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('F', 0.5 * b, 0.62 * b, d.spineY + d.chestY + 0.1, 8, { at: [0, (d.chestY - d.spineY) / 2 + 0.05, 0] });
    k.box('D', 0.9 * b, 0.22, 0.95 * b, { at: [0, 0.15, 0.02] });
    k.box('D', 0.84 * b, 0.2, 0.9 * b, { at: [0, 0.5, 0.02] });
    k.prism('P', [[0.35 * b, 0.0], [0.62 * b, 0.25], [0.5 * b, 0.75], [0.3 * b, 0.7]], 0.5 * b);
    put(J.spine, k);
  }

  // ---- chest ---------------------------------------------------------------
  {
    const k = new Kit(livery);
    const cw = d.shoulderX - 0.25; // half width at the shoulders
    const ww = 0.62 * b; // half width at the waist
    // Main shell, front profile: a broad V.
    k.plate('P', [[-ww, 0.05], [ww, 0.05], [cw, 0.85], [cw * 0.92, 1.4], [0.5, 1.55], [-0.5, 1.55], [-cw * 0.92, 1.4], [-cw, 0.85]], 1.5 * b, { at: [0, 0, -0.05] });
    // Cockpit nose: a canopy wedge thrusting forward.
    k.prism('S', [[0.6 * b, 0.25], [1.25 * b, 0.6], [1.15 * b, 1.05], [0.6 * b, 1.4]], 1.05 * b);
    k.prism('C', [[1.0 * b, 0.72], [1.27 * b, 0.68], [1.17 * b, 1.02], [0.82 * b, 1.3]], 0.62 * b);
    k.box('G', 0.66 * b, 0.07, 0.07, { at: [0, 0.66, 1.26 * b] });
    // Collar and intakes.
    k.box('F', 1.3, 0.3, 1.2 * b, { at: [0, 1.6, -0.05], taper: [0.8, 0.85] });
    for (const s of [1, -1]) {
      k.box('D', 0.3, 0.55, 0.5, { at: [s * (cw - 0.35), 0.95, 0.72 * b], rot: [0.25, 0, 0] });
      k.box('T', 0.34, 0.08, 0.54, { at: [s * (cw - 0.35), 1.24, 0.66 * b], rot: [0.25, 0, 0] });
      // Shoulder mounts.
      k.cyl('D', 0.42 * b, 0.42 * b, 0.6, 8, { axis: 'x', at: [s * (d.shoulderX - 0.3), d.shoulderY, 0] });
    }
    // Backpack.
    if (FW) {
      k.box('F', 1.3, 1.3, 0.7, { at: [0, 0.85, -1.0], taper: [0.75, 0.8] });
      k.box('S', 0.5, 1.0, 0.3, { at: [0, 0.95, -1.42] });
      for (const s of [1, -1]) {
        k.cyl('D', 0.3, 0.36, 0.9, 8, { axis: 'z', at: [s * 0.45, 0.45, -1.35] });
        k.cyl('G', 0.24, 0.24, 0.06, 8, { axis: 'z', at: [s * 0.45, 0.45, -1.81] });
      }
    } else if (DF) {
      k.box('F', 2.6, 1.7, 1.1, { at: [0, 0.9, -1.25], taper: [0.85, 0.8] });
      k.box('P', 1.5, 0.5, 0.5, { at: [0, 1.75, -1.2] });
      for (const s of [1, -1]) {
        k.cyl('D', 0.5, 0.58, 1.1, 8, { axis: 'z', at: [s * 0.75, 0.55, -1.75] });
        k.cyl('G', 0.4, 0.4, 0.06, 8, { axis: 'z', at: [s * 0.75, 0.55, -2.31] });
        k.box('T', 0.2, 1.4, 0.2, { at: [s * 1.25, 0.95, -1.75] });
      }
    } else {
      k.box('F', 1.9, 1.4, 0.85, { at: [0, 0.9, -1.1], taper: [0.8, 0.8] });
      for (const s of [1, -1]) {
        k.cyl('S', 0.38, 0.46, 1.4, 8, { axis: 'z', at: [s * 0.7, 0.75, -1.45], rot: [0.12, 0, 0] });
        k.cyl('D', 0.32, 0.32, 0.2, 8, { axis: 'z', at: [s * 0.7, 0.66, -2.2], rot: [0.12, 0, 0] });
        k.cyl('G', 0.26, 0.26, 0.06, 8, { axis: 'z', at: [s * 0.7, 0.65, -2.31], rot: [0.12, 0, 0] });
      }
    }
    put(J.chest, k);
    const fy = FW ? 0.45 : DF ? 0.55 : 0.64;
    const fx = FW ? 0.45 : DF ? 0.75 : 0.7;
    const fz = FW ? -1.84 : DF ? -2.34 : -2.34;
    const fwid = FW ? 0.26 : DF ? 0.44 : 0.3;
    for (const s of [1, -1]) flame(J.chest, [s * fx, fy, fz], [0, 0, 0], fwid, FW ? 3.4 : DF ? 3.0 : 3.2, 'main');
    // Team number across the back plate.
    const decal = numberDecal(number, livery);
    decal.scale.setScalar(DF ? 1.3 : 0.95);
    decal.position.set(0, FW ? 1.05 : DF ? 1.76 : 1.2, FW ? -1.58 : DF ? -1.46 : -1.54);
    decal.rotation.y = Math.PI;
    J.chest.add(decal);
  }

  // ---- wings / stabilisers ------------------------------------------------
  for (const s of [1, -1] as const) {
    const k = new Kit(livery);
    if (FW) {
      // Long swept blades, like a swallow's tail.
      k.prism('S', [[0, 0.25], [-0.5, 0.55], [-3.6, 1.5], [-3.9, 1.35], [-1.2, -0.05], [0, -0.25]], 0.12);
      k.prism('T', [[-1.4, 0.72], [-3.6, 1.5], [-3.9, 1.35], [-3.3, 1.12]], 0.14);
      k.prism('G', [[-0.4, 0.0], [-2.2, 0.62], [-2.3, 0.52], [-0.5, -0.1]], 0.16);
    } else if (DF) {
      k.prism('P', [[0, 0.5], [-1.4, 0.9], [-1.7, 0.2], [0, -0.5]], 0.3);
      k.prism('T', [[-1.1, 0.82], [-1.4, 0.9], [-1.7, 0.2], [-1.45, 0.18]], 0.32);
    } else {
      k.prism('S', [[0, 0.3], [-0.6, 0.55], [-2.5, 1.0], [-2.7, 0.75], [-0.8, -0.1], [0, -0.3]], 0.16);
      k.prism('G', [[-0.5, 0.05], [-1.8, 0.42], [-1.85, 0.3], [-0.55, -0.06]], 0.2);
    }
    const wing = s === 1 ? J.wingL : J.wingR;
    wing.position.set(s * (FW ? 0.62 : DF ? 1.55 : 1.05), FW ? 1.05 : 1.2, FW ? -0.95 : DF ? -1.2 : -1.0);
    put(wing, k);
  }

  // ---- head ----------------------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('D', 0.26, 0.3, 0.35, 6, { at: [0, -0.12, -0.05] });
    if (FW) {
      // Sleek helmet with a long crest.
      k.prism('P', [[-0.55, 0.05], [0.3, 0.0], [0.72, 0.22], [0.5, 0.62], [-0.2, 0.8], [-0.7, 0.55]], 0.78);
      k.prism('G', [[0.36, 0.3], [0.74, 0.27], [0.56, 0.52], [0.3, 0.5]], 0.8);
      k.prism('S', [[0.3, 0.62], [-0.2, 0.82], [-2.2, 1.35], [-2.3, 1.2], [-0.6, 0.55]], 0.14);
      k.prism('T', [[0.72, 0.22], [1.0, 0.1], [0.6, 0.02]], 0.2);
      for (const s of [1, -1]) k.box('F', 0.14, 0.3, 0.5, { at: [s * 0.44, 0.32, -0.1] });
    } else if (DF) {
      // Low, armoured dome with a mono-eye slit.
      k.prism('P', [[-0.7, 0.0], [0.55, 0.0], [0.8, 0.3], [0.6, 0.75], [-0.4, 0.85], [-0.8, 0.5]], 1.25);
      k.box('G', 0.9, 0.14, 0.1, { at: [0, 0.4, 0.74] });
      k.box('F', 1.4, 0.3, 0.9, { at: [0, 0.05, -0.05] });
      k.box('T', 0.2, 0.5, 1.2, { at: [0, 0.82, -0.1], taper: [1, 0.6] });
      for (const s of [1, -1]) k.box('F', 0.2, 0.55, 0.7, { at: [s * 0.72, 0.38, -0.1] });
    } else {
      // Classic helm: face plate, twin antennae.
      k.prism('P', [[-0.6, 0.02], [0.4, 0.0], [0.7, 0.25], [0.55, 0.7], [-0.3, 0.85], [-0.7, 0.5]], 0.95);
      k.prism('G', [[0.42, 0.34], [0.71, 0.3], [0.6, 0.52], [0.4, 0.52]], 0.97);
      k.box('S', 0.3, 0.3, 0.3, { at: [0, 0.78, 0.35], rot: [0.5, 0, 0] });
      for (const s of [1, -1]) {
        k.prism('T', [[0.2, 0.0], [-0.1, 0.0], [-0.75, 1.3], [-0.65, 1.32]], 0.07, { at: [s * 0.2, 0.8, 0.35], rot: [0, 0, s * -0.5] });
        k.box('F', 0.16, 0.36, 0.56, { at: [s * 0.54, 0.34, -0.1] });
      }
    }
    put(J.head, k);
  }

  // ---- arms ----------------------------------------------------------------
  for (const s of [1, -1] as const) {
    const sh = s === 1 ? J.shL : J.shR;
    const el = s === 1 ? J.elL : J.elR;
    const wr = s === 1 ? J.wrL : J.wrR;
    {
      const k = new Kit(livery);
      k.ball('D', 0.48 * b);
      k.box('F', 0.55 * b, d.upperArm - 0.3, 0.6 * b, { at: [0, -d.upperArm / 2, 0], taper: [1.15, 1.15] });
      k.box('P', 0.2, d.upperArm * 0.6, 0.66 * b, { at: [s * 0.34 * b, -d.upperArm * 0.5, 0] });
      // Pauldron.
      if (FW) {
        k.prism('S', [[0.7, 0.1], [0.3, 0.6], [-1.5, 0.95], [-1.7, 0.75], [-0.6, -0.2], [0.4, -0.3]], 0.75, { at: [s * 0.3, 0.2, 0], rot: [0, 0, s * -0.25] });
        k.prism('T', [[-0.9, 0.82], [-1.5, 0.95], [-1.7, 0.75], [-1.2, 0.5]], 0.78, { at: [s * 0.3, 0.2, 0], rot: [0, 0, s * -0.25] });
      } else if (DF) {
        // Slab shield over each shoulder.
        k.box('P', 1.7, 0.6, 2.0, { at: [s * 0.55, 0.55, 0], taper: [0.8, 0.75], rot: [0, 0, s * -0.22] });
        k.box('P', 0.4, 2.0, 2.2, { at: [s * 1.25, -0.3, 0], taper: [1, 0.72], rot: [0, 0, s * -0.1] });
        k.box('T', 0.44, 0.22, 2.24, { at: [s * 1.28, 0.55, 0], rot: [0, 0, s * -0.1] });
        k.box('S', 0.46, 0.9, 1.0, { at: [s * 1.27, -0.45, 0], rot: [0, 0, s * -0.1] });
      } else {
        k.box('P', 1.25, 0.75, 1.3, { at: [s * 0.35, 0.3, 0], taper: [0.7, 0.75], rot: [0, 0, s * -0.3] });
        k.box('S', 0.3, 0.9, 1.1, { at: [s * 0.82, -0.1, 0], taper: [1, 0.8], rot: [0, 0, s * -0.12] });
        k.box('T', 0.34, 0.12, 1.14, { at: [s * 0.86, 0.34, 0], rot: [0, 0, s * -0.12] });
      }
      put(sh, k);
    }
    {
      const k = new Kit(livery);
      k.cyl('D', 0.36 * b, 0.36 * b, 0.7 * b, 8, { axis: 'x' });
      const fl = d.foreArm;
      if (DF) {
        // Gauntlets: big, blunt, banded.
        k.box('P', 1.05, fl + 0.2, 1.15, { at: [0, -fl / 2 - 0.1, 0], taper: [0.8, 0.8] });
        k.box('T', 1.12, 0.2, 1.22, { at: [0, -fl + 0.15, 0] });
        k.box('S', 1.2, 0.55, 1.3, { at: [0, -fl - 0.25, 0.05] });
        k.box('D', 0.9, 0.4, 0.2, { at: [0, -fl - 0.3, 0.72] });
        if (s === -1) {
          // Scatter cannon slung under the right forearm.
          for (const [ox, oz] of [[0.25, 0], [-0.25, 0], [0, 0.3]] as const) {
            k.cyl('D', 0.2, 0.2, 1.5, 6, { at: [s * 0.75 + ox * 0.9, -fl * 0.75, oz * 0.9 + 0.1] });
            k.cyl('G', 0.14, 0.14, 0.05, 6, { at: [s * 0.75 + ox * 0.9, -fl * 0.75 - 0.77, oz * 0.9 + 0.1] });
          }
          k.box('F', 0.9, 0.9, 0.9, { at: [s * 0.72, -fl * 0.35, 0.15] });
        }
      } else {
        k.box('P', 0.6 * b, fl, 0.7 * b, { at: [0, -fl / 2, 0], taper: [0.82, 0.82] });
        k.box('S', 0.2, fl * 0.7, 0.5 * b, { at: [s * 0.32 * b, -fl * 0.5, 0] });
        k.box('D', 0.45 * b, 0.4, 0.5 * b, { at: [0, -fl - 0.2, 0.02] });
        if (FW) {
          // Forearm blade: runs past the fist, edge lit.
          k.prism('T', [[0.2, 0.3], [0.5, 0.2], [0.5, -fl - 1.9], [0.32, -fl - 2.5], [0.2, -fl - 1.6]], 0.1, { at: [s * 0.42, 0, 0] });
          k.prism('G', [[0.46, 0.1], [0.56, 0.1], [0.56, -fl - 1.85], [0.36, -fl - 2.55], [0.46, -fl - 1.9]], 0.05, { at: [s * 0.42, 0, 0] });
        } else if (s === -1) {
          // Arm carbine: receiver alongside the forearm, barrel past the fist.
          k.box('F', 0.42, 1.5, 0.5, { at: [s * 0.46, -fl * 0.6, 0.05] });
          k.box('S', 0.46, 0.5, 0.56, { at: [s * 0.46, -fl * 0.35, 0.05] });
          k.box('F', 0.3, 1.5, 0.34, { at: [s * 0.46, -fl - 0.6, 0.05] });
          k.cyl('D', 0.12, 0.12, 1.3, 6, { at: [s * 0.46, -fl - 1.9, 0.05] });
          k.box('T', 0.22, 0.26, 0.22, { at: [s * 0.46, -fl - 2.5, 0.05] });
          k.box('G', 0.06, 0.9, 0.3, { at: [s * 0.69, -fl * 0.7, 0.05] });
        } else {
          // Sensor shield on the left forearm.
          k.box('S', 0.16, 1.5, 1.0, { at: [s * 0.5, -fl * 0.5, 0], taper: [1, 0.7] });
          k.box('G', 0.18, 0.5, 0.12, { at: [s * 0.52, -fl * 0.5, 0.3] });
        }
      }
      put(el, k);
    }
    // Hand anchor and, on the gun arm, the muzzle.
    const hand = s === 1 ? rig.handL : rig.handR;
    hand.position.set(0, DF ? -0.3 : -0.2, DF ? 0.6 : 0.3);
    if (s === -1) {
      if (role === ROLE.MF) rig.muzzle.position.set(-0.46, -d.foreArm - 2.7, 0.05);
      else if (DF) rig.muzzle.position.set(-0.75, -d.foreArm * 0.75 - 0.9, 0.1);
      else rig.muzzle.position.set(0, -d.foreArm - 1.5, 0.4);
      el.add(rig.muzzle);
    }
    void wr;
  }

  // ---- legs ----------------------------------------------------------------
  for (const s of [1, -1] as const) {
    const hip = s === 1 ? J.hipL : J.hipR;
    const knee = s === 1 ? J.kneeL : J.kneeR;
    const ankle = s === 1 ? J.ankleL : J.ankleR;
    {
      const k = new Kit(livery);
      k.box('F', 0.62 * b, d.thigh - 0.2, 0.7 * b, { at: [0, -d.thigh / 2, 0], taper: [1.3, 1.25] });
      // Sculpted thigh armour: fuller at the front, cut away behind.
      k.prism('P', [[0.2, -0.15], [0.62 * b, -0.35], [0.58 * b, -d.thigh + 0.5], [0.3, -d.thigh + 0.25], [-0.1, -d.thigh + 0.6], [-0.15, -0.3]], 0.86 * b);
      k.box('S', 0.2, d.thigh * 0.55, 0.6 * b, { at: [s * 0.44 * b, -d.thigh * 0.5, 0.05] });
      if (DF) k.box('T', 0.9 * b, 0.14, 0.8 * b, { at: [0, -d.thigh * 0.28, 0.05] });
      put(hip, k);
    }
    {
      const k = new Kit(livery);
      // Knee cap.
      k.cyl('D', 0.38 * b, 0.38 * b, 0.8 * b, 8, { axis: 'x' });
      k.prism(DF ? 'P' : 'S', [[0.25, 0.45], [0.75 * b, 0.15], [0.7 * b, -0.45], [0.3, -0.35]], 0.7 * b);
      // Shin: blade down the front, calf block behind.
      k.prism('P', [[0.5 * b, -0.3], [0.62 * b, -d.shin + 0.55], [0.35, -d.shin + 0.1], [-0.45 * b, -d.shin + 0.2], [-0.7 * b, -0.7], [-0.35 * b, -0.2]], 0.74 * b);
      k.prism('T', [[0.52 * b, -0.45], [0.66 * b, -d.shin + 0.6], [0.58 * b, -d.shin + 0.5], [0.46 * b, -0.5]], 0.2 * b);
      // Calf vent.
      k.box('D', 0.5 * b, 0.9, 0.3, { at: [0, -0.95, -0.62 * b], rot: [0.18, 0, 0] });
      k.box('G', 0.36 * b, 0.12, 0.05, { at: [0, -0.75, -0.8 * b], rot: [0.18, 0, 0] });
      k.box('G', 0.36 * b, 0.12, 0.05, { at: [0, -1.05, -0.74 * b], rot: [0.18, 0, 0] });
      put(knee, k);
      flame(knee, [0, -1.3, -0.72 * b], [0.9, 0, 0], 0.2 * b, 1.6, 'leg');
    }
    {
      const k = new Kit(livery);
      const ay = d.ankleY;
      const len = DF ? 2.9 : 2.6;
      k.ball('D', 0.36 * b);
      // Skate boot: long toe, short heel.
      k.prism('P', [[-0.85, -ay + 0.5], [-0.6, 0.25], [0.55, 0.2], [len - 0.95, -ay + 0.62], [len - 0.85, -ay + 0.42], [-0.95, -ay + 0.42]], 0.82 * b);
      k.prism('S', [[0.2, 0.3], [0.75, 0.22], [len - 1.25, -ay + 0.72], [0.6, -ay + 0.7]], 0.5 * b);
      k.box('F', 0.5 * b, 0.16, len - 0.2, { at: [0, -ay + 0.38, (len - 1.85) / 2] });
      // Inline wheels with lit hubs.
      for (const wz of [-0.55, len - 1.35]) {
        k.cyl('D', 0.36, 0.36, 0.42 * b, 10, { axis: 'x', at: [0, -ay + 0.36, wz] });
        k.cyl('G', 0.16, 0.16, 0.46 * b, 6, { axis: 'x', at: [0, -ay + 0.36, wz] });
      }
      put(ankle, k);
    }
  }

  return rig;
}

/** The flame time uniform is on the team's shared flame material; update it for a rig's flames. */
export function setFlameTime(rig: MechRig, t: number): void {
  if (rig.flames.length) (rig.flames[0].mesh.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
}

export { glowMaterial };
