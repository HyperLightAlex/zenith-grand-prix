// Aurora's Longbow, the Vector-class midfielder: a tall archer in plate. A
// sallet with a long swept tail, a narrow lit visor and a pearl bevor, a
// pearl plume rising from its crown through a floating halo; a ridged cuirass,
// pearl below a silver band and violet above, the team's sigil (a sword
// through a halo) on the breast;
// lamed pauldrons; a split surcoat that swings with the legs; a crossbow for
// the Snare launcher on the left forearm; a slender lance-rifle behind a
// silver vamplate in the right hand; two pearl cape fins hanging either side
// of the power unit; the Disruptor a halo on its back; poleyns, greaves and
// pointed sabatons. On the Vector's skeleton, with the Vector's weapons and
// thrusters in the same places. An original design. Model space: +z forward,
// +y up, +x to the mech's left.
import * as THREE from 'three';
import { decal } from '../decals';
import { Kit } from '../kit';
import { arc, fist, mirrorX, numberDecal, wheels, type FrameCtx } from '../parts';
import { cuirass, halo, lame, sabaton, sigil, sweep } from './motifs';

export function buildLongbow(c: FrameCtx, number: string): void {
  const { rig, livery } = c;
  const J = rig.joints;
  const d = rig.dims;
  const b = 1.12;

  // ---- pelvis: a silver belt with the sigil at its buckle, lames over the thighs, the surcoat ----
  {
    const k = new Kit(livery);
    k.box('K', 1.15 * b, 0.6, 0.88 * b, { at: [0, 0.02, 0], taper: [1.12, 1.08] });
    k.box('T', 1.2 * b, 0.14, 0.94 * b, { at: [0, 0.32, 0] });
    sigil(k, 0.13, [0, 0.33, 0.55]);
    for (const s of [1, -1]) {
      const a = s === 1 ? 0 : Math.PI;
      k.ball('K', 0.34, { at: [s * d.hipX, -d.hipDrop, 0] });
      lame(k, 'P', [s * d.hipX, 0, 0], 0.44, 0.5, 0.16, -0.26, a - 1.0, a + 1.0);
      lame(k, 'S', [s * d.hipX, 0, 0], 0.48, 0.54, -0.22, -0.62, a - 0.9, a + 0.9);
    }
    c.put(J.hips, k);
    // The surcoat: two front panels that swing with the legs, and one behind.
    const tilt: [number, number, number] = [-0.06, 0, 0];
    for (const s of [1, -1] as const) {
      const sk = s === 1 ? rig.skirts.l : rig.skirts.r;
      sk.position.set(s * 0.3, 0.24, 0.5);
      const f = new Kit(livery);
      f.cyl('K', 0.06, 0.06, 0.6, 8, { axis: 'x' });
      f.plate('P', [[-0.3, 0.04], [0.3, 0.04], [0.31, -1.2], [0, -1.36], [-0.31, -1.2]], 0.08, { at: [0, 0, 0.06], rot: tilt });
      f.plate('S', [[-0.23, 0.0], [0.23, 0.0], [0.24, -1.12], [0, -1.26], [-0.24, -1.12]], 0.1, { at: [0, 0, 0.07], rot: tilt });
      c.put(sk, f);
    }
    {
      const sk = rig.skirts.back;
      sk.position.set(0, 0.24, -0.52);
      const f = new Kit(livery);
      f.cyl('K', 0.06, 0.06, 0.8, 8, { axis: 'x' });
      f.plate('P', [[-0.6, 0.04], [0.6, 0.04], [0.62, -1.2], [0, -1.4], [-0.62, -1.2]], 0.08, { at: [0, 0, -0.06], rot: [0.06, 0, 0] });
      f.plate('S', [[-0.52, 0.0], [0.52, 0.0], [0.54, -1.12], [0, -1.3], [-0.54, -1.12]], 0.1, { at: [0, 0, -0.07], rot: [0.06, 0, 0] });
      c.put(sk, f);
    }
  }

  // ---- waist ----------------------------------------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.4 * b, 0.46 * b, d.spineY + d.chestY, 10, { at: [0, (d.chestY - d.spineY) / 2 + 0.05, 0] });
    for (const y of [0.16, 0.5]) k.cyl('T', 0.5 * b, 0.5 * b, 0.08, 10, { at: [0, y, 0] });
    lame(k, 'S', [0, 0, 0], 0.54, 0.6, 0.42, 0.18, 0.4, Math.PI - 0.4);
    lame(k, 'P', [0, 0, 0], 0.52, 0.58, 0.68, 0.42, 0.45, Math.PI - 0.45);
    c.put(J.spine, k);
  }

  // ---- chest: the cuirass, the sigil, the power unit and its halo -----------------------------
  {
    const k = new Kit(livery);
    const cw = d.shoulderX - 0.42;
    k.box('K', 1.45 * b, 1.3, 1.15 * b, { at: [0, 0.78, -0.1] });
    cuirass(k, 'S', [[0.1, 0.62, 0.5, -0.66], [0.55, 1.0, 0.64, -0.72], [0.66, 1.08, 0.66, -0.73]], 0.1);
    cuirass(k, 'T', [[0.62, 1.07, 0.665, -0.735], [0.7, 1.12, 0.68, -0.745]], 0.11);
    cuirass(k, 'P', [[0.66, 1.08, 0.66, -0.73], [1.0, 1.3, 0.7, -0.74], [1.35, 1.38, 0.62, -0.74], [1.66, 0.95, 0.38, -0.6]], 0.1);
    sigil(k, 0.32, [0, 1.08, 0.81]);
    k.cyl('T', 0.4, 0.5, 0.24, 10, { at: [0, 1.72, -0.08] });
    for (const s of [1, -1]) {
      k.box('K', 0.5, 0.42, 0.62, { at: [s * cw, d.shoulderY + 0.02, -0.04] });
      k.cyl('D', 0.38, 0.38, 0.5, 10, { axis: 'x', at: [s * (d.shoulderX - 0.28), d.shoulderY, 0] });
    }
    // The power unit, its nozzles, the Disruptor (a halo on its back), and the capes' mounts either side.
    k.box('F', 1.36, 1.1, 0.62, { at: [0, 0.84, -0.98], taper: [0.8, 0.88] });
    k.box('T', 1.22, 0.08, 0.62, { at: [0, 1.18, -0.98] });
    for (const s of [1, -1]) {
      k.cyl('K', 0.29, 0.29, 0.28, 10, { axis: 'z', at: [s * 0.44, 0.5, -1.27], rot: [-0.25, 0, 0] });
      k.nozzle(0.26, 0.46, { at: [s * 0.44, 0.5, -1.34], rot: [-0.25, 0, 0] });
      k.box('K', 0.3, 0.32, 0.3, { at: [s * 1.1, 1.24, -0.86] });
    }
    halo(k, 0.3, [0, 1.06, -1.33]);
    c.put(J.chest, k);
    for (const s of [1, -1]) c.flame(J.chest, [s * 0.44, 0.39, -1.79], [-0.25, 0, 0], 0.24, 3.2, 'main');
    decal(J.chest, livery, 'chevrons', [0, 0.44, -1.3], [0, Math.PI, -Math.PI / 2], 0.32, 0.14);
  }

  // ---- capes: two pearl fins hanging either side of the power unit -----------------------------
  for (const s of [1, -1] as const) {
    const k = new Kit(livery);
    const side = (p: Array<[number, number]>) => (s === 1 ? p : mirrorX(p));
    k.cyl('K', 0.13, 0.13, 0.26, 8, { axis: 'x' });
    k.plate('S', side([[-0.18, 0.24], [0.32, 0.34], [0.6, -0.2], [0.68, -1.7], [0.42, -2.2], [0.2, -1.95], [-0.02, -2.25], [-0.18, -1.8]]), 0.08);
    k.plate('P', side([[-0.1, 0.16], [0.28, 0.24], [0.52, -0.2], [0.58, -1.62], [0.4, -2.05], [0.2, -1.84], [0.0, -2.1], [-0.1, -1.74]]), 0.1);
    k.plate('T', side([[-0.18, 0.24], [0.32, 0.34], [0.36, 0.22], [-0.16, 0.12]]), 0.11);
    sigil(k, 0.22, [s * 0.24, -0.6, -0.06], [0, Math.PI, 0], 0.05);
    // The poses turn the wing joint, so the capes' own hang rides on a group inside it.
    const wing = s === 1 ? J.wingL : J.wingR;
    wing.position.set(s * 1.1, 1.26, -0.96);
    const hang = new THREE.Group();
    hang.rotation.set(0.08, s * 0.55, 0);
    wing.add(hang);
    c.put(hang, k);
  }

  // ---- head: the sallet, its plume and the halo it rises through ---------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.2, 0.24, 0.42, 8, { at: [0, -0.06, -0.04] });
    // The sallet: a round bowl drawn back into a long tail over the neck, edged in silver.
    k.ball('P', 0.36, { at: [0, 0.36, -0.06], scale: [0.95, 0.9, 1.15] });
    k.prism('P', [[-0.12, 0.5], [-0.56, 0.36], [-0.95, 0.12], [-0.64, 0.08], [-0.2, 0.14]], 0.62);
    k.prism('T', [[-0.56, 0.37], [-0.95, 0.13], [-0.9, 0.08], [-0.54, 0.31]], 0.64);
    // The visor, a narrow lit slit, a silver line, and the pearl bevor pointed at the chin.
    k.box('P', 0.62, 0.2, 0.24, { at: [0, 0.44, 0.24], taper: [0.9, 0.85] });
    k.box('D', 0.54, 0.05, 0.04, { at: [0, 0.37, 0.35] });
    k.box('G', 0.48, 0.03, 0.04, { at: [0, 0.37, 0.365] });
    k.box('S', 0.56, 0.26, 0.28, { at: [0, 0.2, 0.2], taper: [1.06, 1] });
    k.plate('S', [[-0.28, 0.08], [0.28, 0.08], [0.12, -0.12], [0, -0.18], [-0.12, -0.12]], 0.22, { at: [0, 0.06, 0.24] });
    k.box('T', 0.6, 0.04, 0.3, { at: [0, 0.335, 0.22] });
    // The plume: a long pearl feather rising from the crown and curving back, a silver quill down it.
    const plume: Array<[number, number, number, number]> = [[-0.04, 0.6, 0.03, 0.05], [-0.08, 0.86, 0.035, 0.12], [-0.2, 1.1, 0.035, 0.16], [-0.42, 1.28, 0.03, 0.16], [-0.7, 1.36, 0.03, 0.13], [-0.98, 1.3, 0.025, 0.08], [-1.16, 1.18, 0.02, 0.02]];
    k.loft('S', sweep(plume));
    k.loft('T', sweep(plume.map(([z, y, hx, hn]) => [z, y, hx + 0.012, Math.min(hn, 0.025)] as [number, number, number, number])));
    // The halo, floating over the helm and tipped toward the front, the plume rising through it.
    halo(k, 0.36, [0, 1.0, -0.12], [Math.PI / 2 - 0.6, 0, 0], 0.07, 0.06);
    const head = new THREE.Group();
    head.position.set(0, 0.12, 0.08);
    head.scale.setScalar(1.35);
    J.head.add(head);
    c.put(head, k);
  }

  // ---- arms: lamed pauldrons, the crossbow, the lance-rifle ---------------------------------------
  for (const s of [1, -1] as const) {
    const sh = s === 1 ? J.shL : J.shR;
    const el = s === 1 ? J.elL : J.elR;
    const wr = s === 1 ? J.wrL : J.wrR;
    const a = s === 1 ? 0 : Math.PI;
    {
      const k = new Kit(livery);
      k.ball('K', 0.38);
      k.box('P', 0.5, d.upperArm - 0.2, 0.56, { at: [0, -d.upperArm / 2 - 0.05, 0], taper: [0.84, 0.84] });
      k.box('S', 0.1, d.upperArm * 0.42, 0.44, { at: [s * 0.28, -d.upperArm * 0.62, 0] });
      k.lathe('P', [[0, -0.3], [0.46, -0.24], [0.56, 0.02], [0.42, 0.3], [0, 0.36]], 10, { at: [s * 0.2, 0.16, 0], scale: [1, 0.9, 1.15] });
      lame(k, 'T', [s * 0.12, 0, 0], 0.56, 0.58, 0.06, -0.04, a - 1.5, a + 1.5, 0.06);
      lame(k, 'S', [s * 0.12, 0, 0], 0.54, 0.6, -0.02, -0.28, a - 1.45, a + 1.45);
      lame(k, 'P', [s * 0.12, 0, 0], 0.5, 0.56, -0.24, -0.5, a - 1.35, a + 1.35);
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
      k.cyl('T', 0.24, 0.24, 0.06, 10, { axis: 'x', at: [s * 0.3, 0, 0] });
      k.box('P', 0.56, fl - 0.15, 0.64, { at: [0, -fl / 2 - 0.05, 0.02], taper: [0.8, 0.8] });
      k.box('S', 0.3, fl * 0.42, 0.06, { at: [0, -fl * 0.55, 0.31], taper: [0.8, 1] });
      k.cyl('T', 0.36, 0.36, 0.08, 10, { at: [0, -fl + 0.08, 0.02] });
      if (s === 1) {
        // The Snare launcher: a crossbow, its silver bow swept back from the rail, the string lit, a bolt laid.
        const yb = -fl * 0.62 - 0.42;
        k.box('F', 0.2, 0.9, 0.3, { at: [0.42, -fl * 0.55, 0.12] });
        k.box('S', 0.12, 0.8, 0.12, { at: [0.46, -fl * 0.62, 0.3] });
        k.prism('T', arc(0.5, 0.58, -Math.PI / 2 - 0.95, -Math.PI / 2 + 0.95, 0.3, yb + 0.55), 0.08, { at: [0.46, 0, 0] });
        k.box('G', 0.03, 0.03, 0.86, { at: [0.46, yb + 0.21, 0.3] });
        k.box('T', 0.04, 0.5, 0.04, { at: [0.46, yb - 0.02, 0.3] });
        k.box('G', 0.06, 0.08, 0.06, { at: [0.46, yb - 0.3, 0.3] });
      }
      c.put(el, k);
    }
    {
      const k = new Kit(livery);
      fist(k, s, 1.05);
      k.cyl('T', 0.24, 0.24, 0.1, 10, { at: [0, -0.04, 0] });
      if (s === -1) {
        // The lance-rifle: a grip and pommel above the hand, a silver vamplate, a long pearl lance banded in silver.
        k.cyl('F', 0.08, 0.08, 0.86, 8, { at: [0, 0.1, 0.46] });
        k.ball('T', 0.12, { at: [0, 0.56, 0.46] });
        k.cyl('T', 0.42, 0.13, 0.46, 12, { at: [0, -0.62, 0.46] });
        k.cyl('S', 0.13, 0.03, 1.95, 10, { at: [0, -1.82, 0.46] });
        for (const [y, r] of [[-1.15, 0.13], [-1.6, 0.105], [-2.05, 0.08]] as const) k.cyl('T', r, r, 0.06, 10, { at: [0, y, 0.46] });
        k.cyl('G', 0.035, 0, 0.1, 6, { at: [0, -2.83, 0.46], bevel: 0 });
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

  // ---- legs: cuisses, poleyns, greaves, pointed sabatons ---------------------------------------------
  for (const s of [1, -1] as const) {
    const hip = s === 1 ? J.hipL : J.hipR;
    const knee = s === 1 ? J.kneeL : J.kneeR;
    const ankle = s === 1 ? J.ankleL : J.ankleR;
    {
      const k = new Kit(livery);
      k.box('K', 0.54, d.thigh - 0.3, 0.58, { at: [0, -d.thigh / 2 - 0.05, -0.02], taper: [1.16, 1.1] });
      k.box('P', 0.62, d.thigh - 0.45, 0.68, { at: [0, -d.thigh / 2 - 0.1, 0.02], taper: [1.1, 1.06] });
      k.box('S', 0.36, d.thigh * 0.5, 0.06, { at: [0, -d.thigh * 0.55, 0.37] });
      k.box('S', 0.08, d.thigh * 0.5, 0.36, { at: [s * 0.34, -d.thigh * 0.55, 0.04] });
      c.put(hip, k);
      if (s === 1) decal(hip, livery, 'emblem', [0.385, -d.thigh * 0.55, 0.04], [0, Math.PI / 2, 0], 0.3);
    }
    {
      const k = new Kit(livery);
      k.cyl('D', 0.31, 0.31, 0.62, 10, { axis: 'x' });
      k.lathe('S', [[0, -0.04], [0.36, -0.04], [0.34, 0.05], [0.25, 0.16], [0, 0.2]], 10, { axis: 'z', at: [0, 0.02, 0.3] });
      k.prism('T', [[0.26, 0.26], [-0.08, 0.32], [-0.3, 0.1], [-0.1, -0.22], [0.22, -0.16]], 0.05, { at: [s * 0.34, 0, 0] });
      k.box('P', 0.64, d.shin - 0.3, 0.68, { at: [0, -d.shin / 2 + 0.02, -0.04], taper: [0.78, 0.8] });
      k.box('S', 0.34, d.shin * 0.58, 0.06, { at: [0, -d.shin * 0.5, 0.28], taper: [0.78, 1] });
      k.box('T', 0.04, d.shin * 0.58, 0.07, { at: [0, -d.shin * 0.5, 0.31] });
      k.nozzle(0.17, 0.28, { at: [0, -1.3, -0.54], rot: [0.9, 0, 0] }, 8);
      c.put(knee, k);
      c.flame(knee, [0, -1.52, -0.75], [0.9, 0, 0], 0.2, 1.6, 'leg');
    }
    {
      const k = new Kit(livery);
      const ay = d.ankleY;
      k.ball('K', 0.3);
      sabaton(k, -ay + 0.38, -0.66, 1.8, 0.32, 0.32);
      k.box('K', 0.4, 0.12, 2.4, { at: [0, -ay + 0.36, 0.36] });
      wheels(k, ay, [-0.66, 0.38, 1.42], 0.32, 0.34);
      c.put(ankle, k);
    }
  }
}
