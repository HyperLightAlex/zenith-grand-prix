// Tempest's Kamaitachi, the Swift-class forward: a lean storm duellist. A
// smooth storm helm with gold vanes swept back from the temples, a lit visor
// and a small gold crescent on the brow; a jade cuirass, a black breast plate
// edged in gold, a lightning bolt lit on it; one bold shoulder plate a side
// with lightning streaking down it; tassets cut jagged like lightning that
// swing with the legs; dark curved blades along the forearms, their edges lit
// like lightning; lightning streaking down the greaves, a wind vane at each
// calf; and a pair of crescent wind blades a side, swept out either side of
// the power unit. On the Swift's skeleton, with the Swift's weapons and
// thrusters in the same places. An original design. Model space: +z
// forward, +y up, +x to the mech's left.
import * as THREE from 'three';
import { decal } from '../decals';
import { Kit } from '../kit';
import { clawHand, mirrorX, numberDecal, wheels, type FrameCtx } from '../parts';
import { cuirass, lame } from '../shapes';
import { band, bolt, crescent, shoulderPlate, stormHelm, streak, tasset } from './motifs';

export function buildKamaitachi(c: FrameCtx, number: string): void {
  const { rig, livery } = c;
  const J = rig.joints;
  const d = rig.dims;

  // ---- pelvis: a black sash knotted in gold, a jade plate over each hip, tassets that swing with the legs ----
  {
    const k = new Kit(livery);
    k.box('K', 0.95, 0.56, 0.7, { at: [0, 0.02, 0], taper: [1.12, 1.1] });
    k.box('S', 1.04, 0.16, 0.78, { at: [0, 0.3, 0] });
    k.box('T', 0.2, 0.2, 0.06, { at: [0, 0.3, 0.4] });
    for (const s of [1, -1]) {
      const a = s === 1 ? 0 : Math.PI;
      k.ball('K', 0.3, { at: [s * d.hipX, -d.hipDrop, 0] });
      lame(k, 'P', [s * d.hipX, 0, 0], 0.4, 0.5, 0.16, -0.46, a - 1.0, a + 1.0, 0.08);
      lame(k, 'T', [s * d.hipX, 0, 0], 0.5, 0.52, -0.44, -0.5, a - 0.98, a + 0.98, 0.07);
    }
    c.put(J.hips, k);
    for (const s of [1, -1] as const) {
      const sk = s === 1 ? rig.skirts.l : rig.skirts.r;
      sk.position.set(s * 0.26, 0.22, 0.38);
      const f = new Kit(livery);
      f.cyl('K', 0.05, 0.05, 0.46, 8, { axis: 'x' });
      tasset(f, 0.24, 0.78, -0.08, 1);
      c.put(sk, f);
    }
    {
      const sk = rig.skirts.back;
      sk.position.set(0, 0.22, -0.38);
      const f = new Kit(livery);
      f.cyl('K', 0.05, 0.05, 0.7, 8, { axis: 'x' });
      tasset(f, 0.4, 0.78, 0.08, -1);
      c.put(sk, f);
    }
  }

  // ---- waist ----------------------------------------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.26, 0.32, d.spineY + d.chestY, 8, { at: [0, (d.chestY - d.spineY) / 2 + 0.05, 0] });
    for (const y of [0.16, 0.52]) k.cyl('S', 0.34, 0.34, 0.1, 10, { at: [0, y, 0] });
    c.put(J.spine, k);
  }

  // ---- chest: a jade cuirass, the black breast plate edged in gold, the bolt ------------------------
  {
    const k = new Kit(livery);
    k.box('K', 1.1, 1.1, 0.86, { at: [0, 0.78, -0.08], taper: [1.18, 1] });
    const DO: Array<[number, number, number, number]> = [[0.12, 0.42, 0.34, -0.5], [0.5, 0.72, 0.46, -0.56], [0.95, 0.96, 0.52, -0.6], [1.32, 1.02, 0.46, -0.6], [1.58, 0.72, 0.28, -0.5]];
    cuirass(k, 'P', DO, 0.05);
    band(k, 'S', DO, 1.2, 1.5, 0.02, 0.05);
    band(k, 'T', DO, 1.16, 1.21, 0.03, 0.05);
    bolt(k, 'G', 0.56, [0, 0.72, 0.55]);
    k.cyl('S', 0.32, 0.4, 0.2, 10, { at: [0, 1.62, -0.06] });
    for (const s of [1, -1]) {
      k.box('K', 0.54, 0.4, 0.6, { at: [s * (d.shoulderX - 0.42), d.shoulderY + 0.02, -0.06] });
      k.cyl('D', 0.32, 0.32, 0.48, 8, { axis: 'x', at: [s * (d.shoulderX - 0.2), d.shoulderY, 0] });
    }
    // The back: a slim power unit with two nozzles, a black band, and the wind blades' mounts either side.
    k.box('F', 0.84, 0.92, 0.44, { at: [0, 0.72, -0.72], taper: [0.78, 0.9] });
    k.box('S', 0.86, 0.1, 0.46, { at: [0, 1.1, -0.72] });
    for (const s of [1, -1]) {
      k.nozzle(0.2, 0.4, { at: [s * 0.26, 0.38, -0.94], rot: [-0.35, 0, 0] });
      k.box('K', 0.26, 0.3, 0.32, { at: [s * 0.6, 1.12, -0.7] });
    }
    c.put(J.chest, k);
    for (const s of [1, -1]) c.flame(J.chest, [s * 0.26, 0.24, -1.32], [-0.35, 0, 0], 0.2, 3.4, 'main');
    const num = numberDecal(number, livery);
    num.scale.setScalar(0.5);
    num.position.set(0, 0.78, -0.946);
    num.rotation.y = Math.PI;
    num.renderOrder = 3;
    J.chest.add(num);
    decal(J.chest, livery, 'roundel', [0, 0.78, -0.942], [0, Math.PI, 0], 0.6);
  }

  // ---- wind blades: two crescents a side, swept out from either side of the power unit --------------
  for (const s of [1, -1] as const) {
    const k = new Kit(livery);
    const side = (p: Array<[number, number]>) => (s === 1 ? p : mirrorX(p));
    k.ball('K', 0.15);
    const blades: Array<[number, number, number, 'P' | 'S', number]> = [
      [2.0, 2.72, 1.72, 'P', 0],
      [1.6, 2.62, 1.86, 'S', -0.08],
    ];
    for (const [R, a0, a1, slot, z] of blades) {
      const cx = 1.8;
      const cy = -0.8;
      const sc = R / 2.0;
      const o = { at: [0, 0, z] as [number, number, number] };
      const pts = (rr: number, w: number) => crescent(rr * sc, a0, a1, w, cx * sc, cy * sc).map(([x, y]) => [x, y + 0.05] as [number, number]);
      k.plate(slot, side(pts(2.0, 0.34)), 0.07, o);
      k.plate('T', side(pts(2.13, 0.06)), 0.09, o);
      k.plate('G', side(pts(1.97, 0.03)), 0.09, o);
    }
    // The poses turn the wing joint, so the blades' own sweep rides on a group inside it.
    const wing = s === 1 ? J.wingL : J.wingR;
    wing.position.set(s * 0.64, 1.14, -0.82);
    const fan = new THREE.Group();
    fan.rotation.set(0, s * 0.5, 0);
    wing.add(fan);
    c.put(fan, k);
  }

  // ---- head: the storm helm, a lit visor, a black faceplate, a small gold crescent on the brow ----------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.16, 0.2, 0.44, 8, { at: [0, -0.06, -0.06] });
    stormHelm(k, 0.34, 0.24, -0.04);
    k.box('D', 0.5, 0.13, 0.3, { at: [0, 0.27, 0.18] });
    for (const s of [1, -1]) k.box('G', 0.13, 0.04, 0.04, { at: [s * 0.11, 0.28, 0.33], rot: [0, 0, s * -0.15] });
    k.box('S', 0.46, 0.24, 0.32, { at: [0, 0.08, 0.16], taper: [1.06, 1] });
    k.plate('S', [[-0.2, 0.0], [0.2, 0.0], [0.06, -0.16], [-0.06, -0.16]], 0.24, { at: [0, -0.04, 0.17] });
    k.box('T', 0.035, 0.26, 0.05, { at: [0, 0.04, 0.32] });
    k.plate('T', crescent(0.26, Math.PI + 0.25, Math.PI * 2 - 0.25, 0.08, 0, 0.74), 0.04, { at: [0, 0, 0.36] });
    const head = new THREE.Group();
    head.position.set(0, 0.08, 0.08);
    head.scale.setScalar(1.24);
    J.head.add(head);
    c.put(head, k);
  }

  // ---- arms: the shoulder plates, lightning down the bracers, the blades ------------------------------
  for (const s of [1, -1] as const) {
    const sh = s === 1 ? J.shL : J.shR;
    const el = s === 1 ? J.elL : J.elR;
    const wr = s === 1 ? J.wrL : J.wrR;
    const a = s === 1 ? 0 : Math.PI;
    {
      const k = new Kit(livery);
      k.ball('K', 0.34);
      k.box('F', 0.4, d.upperArm - 0.2, 0.42, { at: [0, -d.upperArm / 2 - 0.05, 0], taper: [0.86, 0.86] });
      k.box('P', 0.08, d.upperArm * 0.4, 0.34, { at: [s * 0.24, -d.upperArm * 0.72, 0] });
      shoulderPlate(k, [0, 0, 0], a, 0.5, 0.26, -0.48, 0.9);
      c.put(sh, k);
      if (s === 1) decal(sh, livery, 'emblem', [0.29, -d.upperArm * 0.72, 0], [0, Math.PI / 2, 0], 0.26);
    }
    {
      const k = new Kit(livery);
      const fl = d.foreArm;
      k.cyl('D', 0.22, 0.22, 0.44, 8, { axis: 'x' });
      k.cyl('T', 0.18, 0.18, 0.06, 10, { axis: 'x', at: [s * 0.23, 0, 0] });
      // The bracer: jade, gold at the elbow and wrist, lightning streaking down its outside.
      k.box('P', 0.44, fl - 0.1, 0.48, { at: [0, -fl / 2 - 0.02, 0.02], taper: [0.84, 0.84] });
      for (const y of [-fl * 0.12, -fl * 0.9]) k.cyl('T', 0.27, 0.27, 0.06, 10, { at: [0, y, 0.02] });
      streak(k, [[0.02, -0.3], [-0.05, -0.5], [0.05, -0.72], [-0.04, -0.98], [0.03, -1.2]], 0.045, [s * 0.235, 0, 0.02], [0, (s * Math.PI) / 2, 0]);
      // The blade: dark, curving back to its point, its edge lit; a gold guard at the wrist.
      k.prism('S', [[0.06, -0.3], [0.1, -0.8], [0.1, -fl - 0.6], [0.04, -fl - 1.4], [-0.08, -fl - 1.95], [-0.1, -fl - 1.7], [-0.04, -fl - 1.2], [-0.02, -fl - 0.4], [-0.04, -0.5]], 0.05, { at: [s * 0.3, 0, 0] });
      k.prism('G', [[0.075, -0.8], [0.105, -0.8], [0.105, -fl - 0.6], [0.045, -fl - 1.4], [-0.07, -fl - 1.93], [0.02, -fl - 1.4], [0.075, -fl - 0.6]], 0.06, { at: [s * 0.3, 0, 0] });
      k.cyl('T', 0.15, 0.15, 0.05, 10, { at: [s * 0.3, -fl + 0.02, 0.0] });
      c.put(el, k);
    }
    {
      const k = new Kit(livery);
      clawHand(k, s, 1);
      k.cyl('S', 0.2, 0.2, 0.1, 10, { at: [0, -0.06, 0] });
      c.put(wr, k);
    }
    const hand = s === 1 ? rig.handL : rig.handR;
    hand.position.set(0, -0.2, 0.3);
    if (s === -1) {
      rig.muzzle.position.set(0, -d.foreArm - 1.5, 0.4);
      el.add(rig.muzzle);
    }
  }

  // ---- legs: jade thigh plates, gold knee cops, lightning down the greaves, a wind vane at each calf --------
  for (const s of [1, -1] as const) {
    const hip = s === 1 ? J.hipL : J.hipR;
    const knee = s === 1 ? J.kneeL : J.kneeR;
    const ankle = s === 1 ? J.ankleL : J.ankleR;
    {
      const k = new Kit(livery);
      k.box('F', 0.5, d.thigh - 0.25, 0.54, { at: [0, -d.thigh / 2 - 0.05, 0], taper: [1.1, 1.06] });
      k.box('P', 0.56, d.thigh * 0.6, 0.1, { at: [0, -d.thigh * 0.42, 0.3], taper: [1.06, 1] });
      k.box('P', 0.1, d.thigh * 0.5, 0.5, { at: [s * 0.28, -d.thigh * 0.5, 0.02] });
      c.put(hip, k);
    }
    {
      const k = new Kit(livery);
      k.cyl('D', 0.26, 0.26, 0.5, 8, { axis: 'x' });
      k.lathe('T', [[0, -0.04], [0.26, -0.04], [0.24, 0.04], [0.18, 0.12], [0, 0.15]], 10, { axis: 'z', at: [0, 0.0, 0.26] });
      k.box('F', 0.5, d.shin - 0.3, 0.54, { at: [0, -d.shin / 2 + 0.02, -0.02] });
      k.box('P', 0.56, d.shin - 0.5, 0.58, { at: [0, -d.shin / 2 - 0.05, 0.0], taper: [0.84, 0.86] });
      k.box('T', 0.6, 0.06, 0.62, { at: [0, -d.shin + 0.46, 0.0] });
      streak(k, [[0.04, -0.4], [-0.06, -0.75], [0.06, -1.1], [-0.05, -1.45], [0.03, -1.7]], 0.05, [0, 0, 0.29]);
      k.prism('P', [[-0.26, -0.28], [-0.82, -0.5], [-0.74, -0.62], [-0.28, -0.92]], 0.06);
      k.prism('T', [[-0.7, -0.48], [-0.82, -0.5], [-0.74, -0.62]], 0.07);
      k.nozzle(0.13, 0.24, { at: [0, -1.3, -0.36], rot: [0.9, 0, 0] }, 8);
      c.put(knee, k);
      c.flame(knee, [0, -1.48, -0.54], [0.9, 0, 0], 0.16, 1.6, 'leg');
    }
    {
      const k = new Kit(livery);
      const ay = d.ankleY;
      k.ball('K', 0.24);
      k.prism('P', [[-0.6, -ay + 0.5], [-0.3, 0.06], [0.28, 0.06], [1.25, -ay + 0.5], [1.25, -ay + 0.38], [-0.66, -ay + 0.38]], 0.46);
      k.prism('T', [[0.95, -ay + 0.6], [1.25, -ay + 0.5], [1.25, -ay + 0.38], [0.95, -ay + 0.38]], 0.48);
      k.box('S', 0.48, 0.06, 0.12, { at: [0, -0.06, 0.32] });
      k.box('K', 0.36, 0.12, 2.2, { at: [0, -ay + 0.34, 0.35] });
      wheels(k, ay, [-0.5, 0.35, 1.2], 0.28, 0.3);
      c.put(ankle, k);
    }
  }
}
