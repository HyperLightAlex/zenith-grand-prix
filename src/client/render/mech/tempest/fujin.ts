// Tempest's Fujin, the Vector-class midfielder: the wind god as a storm
// machine. A storm helm crested with a small gold war fan, a lit visor over a
// black faceplate; a jade cuirass, a black breast plate edged in gold, a
// lightning bolt lit on it; a bold shoulder plate a side with a turbine
// breathing from its face; tassets cut jagged like lightning that swing with
// the legs; a chain and weight on a spool on the left forearm for the Snare
// launcher; a long storm rifle ringed with lit coils and forked at the muzzle;
// a turbine on its back for the Disruptor; and a billowing wind sash arching
// from behind either shoulder up over the head. On the Vector's skeleton,
// with the Vector's weapons and thrusters in the same places. An original
// design. Model space: +z forward, +y up, +x to the mech's left.
import * as THREE from 'three';
import { decal } from '../decals';
import { Kit } from '../kit';
import { fist, numberDecal, wheels, type FrameCtx } from '../parts';
import { cuirass, lame, sweepXY } from '../shapes';
import { band, bolt, shoulderPlate, stormHelm, streak, tasset, turbine } from './motifs';

/** A disc in a front profile: `r` across, round (cx, cy). */
function disc(r: number, cx = 0, cy = 0, n = 18): Array<[number, number]> {
  return Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r] as [number, number]);
}

export function buildFujin(c: FrameCtx, number: string): void {
  const { rig, livery } = c;
  const J = rig.joints;
  const d = rig.dims;
  const b = 1.12;

  // ---- pelvis: a black sash knotted in gold, a jade plate over each hip, tassets that swing with the legs ----
  {
    const k = new Kit(livery);
    k.box('K', 1.15 * b, 0.6, 0.88 * b, { at: [0, 0.02, 0], taper: [1.12, 1.08] });
    k.box('S', 1.2 * b, 0.16, 0.94 * b, { at: [0, 0.32, 0] });
    k.box('T', 0.24, 0.22, 0.06, { at: [0, 0.32, 0.54] });
    for (const s of [1, -1]) {
      const a = s === 1 ? 0 : Math.PI;
      k.ball('K', 0.34, { at: [s * d.hipX, -d.hipDrop, 0] });
      lame(k, 'P', [s * d.hipX, 0, 0], 0.44, 0.54, 0.18, -0.5, a - 1.0, a + 1.0, 0.08);
      lame(k, 'T', [s * d.hipX, 0, 0], 0.54, 0.56, -0.48, -0.54, a - 0.98, a + 0.98, 0.07);
    }
    c.put(J.hips, k);
    for (const s of [1, -1] as const) {
      const sk = s === 1 ? rig.skirts.l : rig.skirts.r;
      sk.position.set(s * 0.3, 0.24, 0.5);
      const f = new Kit(livery);
      f.cyl('K', 0.05, 0.05, 0.54, 8, { axis: 'x' });
      tasset(f, 0.28, 0.9, -0.08, 1);
      c.put(sk, f);
    }
    {
      const sk = rig.skirts.back;
      sk.position.set(0, 0.24, -0.5);
      const f = new Kit(livery);
      f.cyl('K', 0.05, 0.05, 0.9, 8, { axis: 'x' });
      tasset(f, 0.54, 0.9, 0.08, -1);
      c.put(sk, f);
    }
  }

  // ---- waist ----------------------------------------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.4 * b, 0.46 * b, d.spineY + d.chestY, 10, { at: [0, (d.chestY - d.spineY) / 2 + 0.05, 0] });
    for (const y of [0.16, 0.5]) k.cyl('S', 0.5 * b, 0.5 * b, 0.1, 10, { at: [0, y, 0] });
    c.put(J.spine, k);
  }

  // ---- chest: the cuirass, the bolt, the power unit and its turbine, the wind sash -------------------
  {
    const k = new Kit(livery);
    const cw = d.shoulderX - 0.42;
    k.box('K', 1.45 * b, 1.3, 1.15 * b, { at: [0, 0.78, -0.1] });
    const DO: Array<[number, number, number, number]> = [[0.1, 0.62, 0.5, -0.66], [0.55, 1.0, 0.64, -0.72], [1.0, 1.3, 0.7, -0.74], [1.35, 1.38, 0.62, -0.74], [1.66, 0.95, 0.38, -0.6]];
    cuirass(k, 'P', DO, 0.05);
    band(k, 'S', DO, 1.25, 1.6, 0.02, 0.05);
    band(k, 'T', DO, 1.2, 1.26, 0.03, 0.05);
    bolt(k, 'G', 0.64, [0, 0.72, 0.71]);
    k.cyl('S', 0.4, 0.5, 0.24, 10, { at: [0, 1.72, -0.08] });
    for (const s of [1, -1]) {
      k.box('K', 0.5, 0.42, 0.62, { at: [s * cw, d.shoulderY + 0.02, -0.04] });
      k.cyl('D', 0.38, 0.38, 0.5, 10, { axis: 'x', at: [s * (d.shoulderX - 0.28), d.shoulderY, 0] });
    }
    k.box('F', 1.36, 1.1, 0.62, { at: [0, 0.84, -0.98], taper: [0.8, 0.88] });
    k.box('S', 1.22, 0.1, 0.62, { at: [0, 1.18, -0.98] });
    for (const s of [1, -1]) {
      k.cyl('K', 0.29, 0.29, 0.28, 10, { axis: 'z', at: [s * 0.44, 0.5, -1.27], rot: [-0.25, 0, 0] });
      k.nozzle(0.26, 0.46, { at: [s * 0.44, 0.5, -1.34], rot: [-0.25, 0, 0] });
      k.box('K', 0.3, 0.3, 0.34, { at: [s * 1.02, 1.22, -0.86] });
    }
    // The wind sash: a billowing band, black-edged jade, arching from behind either shoulder up over the head.
    const arch: Array<[number, number, number]> = [[1.02, 1.12, 0.16], [1.18, 1.6, 0.26], [1.34, 2.1, 0.3], [1.2, 2.6, 0.26], [0.72, 2.98, 0.22], [0, 3.12, 0.26], [-0.72, 2.98, 0.22], [-1.2, 2.6, 0.26], [-1.34, 2.1, 0.3], [-1.18, 1.6, 0.26], [-1.02, 1.12, 0.16]];
    k.loft('S', sweepXY(arch.map(([x, y, w]) => [x, y, w + 0.04, 0.035] as [number, number, number, number]), -1.0));
    k.loft('P', sweepXY(arch.map(([x, y, w]) => [x, y, w, 0.05] as [number, number, number, number]), -1.0));
    for (const s of [1, -1]) k.loft('T', sweepXY([[s * 1.0, 1.06, 0.2, 0.06], [s * 1.04, 1.2, 0.2, 0.06]], -1.0));
    // A streak of lightning jagging along the sash's face.
    const zig: Array<[number, number, number, number]> = [];
    for (let i = 1; i < arch.length - 1; i++) {
      for (const f of [0, 0.5]) {
        const [x0, y0] = arch[i];
        const [x1, y1] = arch[i + 1];
        const x = x0 + (x1 - x0) * f;
        const y = y0 + (y1 - y0) * f;
        const l = Math.hypot(x1 - x0, y1 - y0);
        const side = (zig.length % 2 ? -1 : 1) * 0.08;
        zig.push([x - ((y1 - y0) / l) * side, y + ((x1 - x0) / l) * side, 0.028, 0.03]);
      }
    }
    k.loft('G', sweepXY(zig.slice(0, -1), -0.95));
    // The Disruptor: a turbine set in the back of the power unit, facing behind.
    turbine(k, 0.36, [0, 1.12, -1.36], [0, Math.PI, 0]);
    c.put(J.chest, k);
    for (const s of [1, -1]) c.flame(J.chest, [s * 0.44, 0.39, -1.79], [-0.25, 0, 0], 0.24, 3.2, 'main');
    decal(J.chest, livery, 'chevrons', [0, 0.44, -1.3], [0, Math.PI, -Math.PI / 2], 0.32, 0.14);
  }

  // ---- head: the storm helm, a lit visor, a black faceplate, a small gold war fan on the brow ----------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.2, 0.24, 0.42, 8, { at: [0, -0.06, -0.04] });
    stormHelm(k, 0.38, 0.26, -0.04);
    k.box('D', 0.56, 0.14, 0.34, { at: [0, 0.3, 0.19] });
    for (const s of [1, -1]) k.box('G', 0.15, 0.045, 0.04, { at: [s * 0.13, 0.31, 0.36], rot: [0, 0, s * -0.15] });
    k.box('S', 0.52, 0.26, 0.36, { at: [0, 0.1, 0.18], taper: [1.06, 1] });
    for (let i = 0; i < 3; i++) k.box('D', 0.2, 0.025, 0.04, { at: [0, 0.04 + i * 0.05, 0.36] });
    k.plate('S', [[-0.22, 0.0], [0.22, 0.0], [0.08, -0.16], [-0.08, -0.16]], 0.26, { at: [0, -0.02, 0.19] });
    k.box('T', 0.05, 0.16, 0.05, { at: [0, 0.74, 0.36] });
    k.plate('T', disc(0.15, 0, 0.92), 0.05, { at: [0, 0, 0.36] });
    k.plate('S', disc(0.08, 0, 0.92), 0.06, { at: [0, 0, 0.36] });
    const head = new THREE.Group();
    head.position.set(0, 0.15, 0.06);
    head.scale.setScalar(1.25);
    J.head.add(head);
    c.put(head, k);
  }

  // ---- arms: shoulder plates and their turbines, the chain and weight, the storm rifle --------------------
  for (const s of [1, -1] as const) {
    const sh = s === 1 ? J.shL : J.shR;
    const el = s === 1 ? J.elL : J.elR;
    const wr = s === 1 ? J.wrL : J.wrR;
    const a = s === 1 ? 0 : Math.PI;
    {
      const k = new Kit(livery);
      k.ball('K', 0.38);
      k.box('F', 0.48, d.upperArm - 0.2, 0.52, { at: [0, -d.upperArm / 2 - 0.05, 0], taper: [0.86, 0.86] });
      shoulderPlate(k, [0, 0, 0], a, 0.56, 0.28, -0.62, 0.88);
      turbine(k, 0.22, [s * 0.69, -0.06, 0], [0, (s * Math.PI) / 2, 0], 6);
      c.put(sh, k);
      const num = numberDecal(number, livery);
      num.scale.setScalar(0.3);
      num.position.set(s * 0.68, -0.46, 0);
      num.rotation.y = (s * Math.PI) / 2;
      sh.add(num);
    }
    {
      const k = new Kit(livery);
      const fl = d.foreArm;
      k.cyl('D', 0.28, 0.28, 0.56, 10, { axis: 'x' });
      k.cyl('T', 0.22, 0.22, 0.06, 10, { axis: 'x', at: [s * 0.29, 0, 0] });
      k.box('P', 0.56, fl - 0.15, 0.62, { at: [0, -fl / 2 - 0.05, 0.02], taper: [0.84, 0.84] });
      for (const y of [-fl * 0.12, -fl * 0.9]) k.cyl('T', 0.33, 0.33, 0.06, 10, { at: [0, y, 0.02] });
      streak(k, [[-0.03, -0.32], [0.05, -0.55], [-0.05, -0.8], [0.04, -1.05], [-0.03, -1.25]], 0.05, [0, 0, 0.32]);
      if (s === 1) {
        // The Snare launcher: a gold spool on the forearm, its chain hanging to a black weight lit at the tip.
        k.cyl('T', 0.22, 0.22, 0.14, 12, { axis: 'x', at: [0.46, -fl * 0.4, 0.12] });
        k.cyl('S', 0.14, 0.14, 0.18, 12, { axis: 'x', at: [0.46, -fl * 0.4, 0.12] });
        for (let i = 0; i < 5; i++) k.box('T', 0.05, 0.1, 0.07, { at: [0.48, -fl * 0.4 - 0.26 - i * 0.13, 0.24], rot: [0, i % 2 ? Math.PI / 2 : 0, 0] });
        k.box('S', 0.18, 0.26, 0.18, { at: [0.48, -fl * 0.4 - 1.0, 0.24], rot: [0, Math.PI / 4, 0] });
        k.cyl('G', 0.05, 0.05, 0.03, 8, { at: [0.48, -fl * 0.4 - 1.14, 0.24] });
      }
      c.put(el, k);
    }
    {
      const k = new Kit(livery);
      fist(k, s, 1.05);
      k.cyl('S', 0.24, 0.24, 0.1, 10, { at: [0, -0.04, 0] });
      if (s === -1) {
        // The storm rifle: a black stock edged in gold, a long barrel ringed with lit coils, forked at the muzzle.
        k.box('S', 0.18, 0.9, 0.3, { at: [0, 0.28, 0.42], taper: [1, 0.8] });
        k.box('T', 0.19, 0.6, 0.04, { at: [0, 0.3, 0.58] });
        k.box('P', 0.2, 1.0, 0.2, { at: [0, -0.75, 0.42] });
        k.cyl('F', 0.08, 0.08, 2.4, 8, { at: [0, -1.5, 0.46] });
        for (const y of [-1.4, -1.75, -2.1]) {
          k.cyl('T', 0.15, 0.15, 0.1, 10, { at: [0, y, 0.46] });
          k.cyl('G', 0.16, 0.16, 0.04, 10, { at: [0, y, 0.46] });
        }
        for (const x of [-0.07, 0.07]) k.box('T', 0.04, 0.3, 0.06, { at: [x, -2.66, 0.46], rot: [0, 0, x > 0 ? 0.2 : -0.2] });
        k.cyl('G', 0.05, 0.05, 0.03, 8, { at: [0, -2.82, 0.46] });
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

  // ---- legs: jade thigh plates, gold knee cops, lightning down the greaves -----------------------------------
  for (const s of [1, -1] as const) {
    const hip = s === 1 ? J.hipL : J.hipR;
    const knee = s === 1 ? J.kneeL : J.kneeR;
    const ankle = s === 1 ? J.ankleL : J.ankleR;
    {
      const k = new Kit(livery);
      k.box('F', 0.56, d.thigh - 0.3, 0.6, { at: [0, -d.thigh / 2 - 0.05, -0.02], taper: [1.14, 1.1] });
      k.box('P', 0.64, d.thigh * 0.6, 0.1, { at: [0, -d.thigh * 0.42, 0.33], taper: [1.06, 1] });
      k.box('P', 0.1, d.thigh * 0.5, 0.56, { at: [s * 0.33, -d.thigh * 0.5, 0.02] });
      c.put(hip, k);
      if (s === 1) decal(hip, livery, 'emblem', [0.385, -d.thigh * 0.5, 0.02], [0, Math.PI / 2, 0], 0.3);
    }
    {
      const k = new Kit(livery);
      k.cyl('D', 0.31, 0.31, 0.62, 10, { axis: 'x' });
      k.lathe('T', [[0, -0.04], [0.3, -0.04], [0.28, 0.05], [0.2, 0.14], [0, 0.17]], 10, { axis: 'z', at: [0, 0.0, 0.3] });
      k.box('F', 0.54, d.shin - 0.3, 0.58, { at: [0, -d.shin / 2 + 0.02, -0.04] });
      k.box('P', 0.62, d.shin - 0.5, 0.64, { at: [0, -d.shin / 2 - 0.05, -0.01], taper: [0.84, 0.86] });
      k.box('T', 0.66, 0.06, 0.68, { at: [0, -d.shin + 0.46, -0.01] });
      streak(k, [[0.04, -0.4], [-0.06, -0.72], [0.06, -1.04], [-0.05, -1.36], [0.03, -1.6]], 0.055, [0, 0, 0.32]);
      k.prism('P', [[-0.3, -0.26], [-0.88, -0.46], [-0.8, -0.6], [-0.32, -0.9]], 0.07);
      k.prism('T', [[-0.76, -0.44], [-0.88, -0.46], [-0.8, -0.6]], 0.08);
      k.nozzle(0.17, 0.28, { at: [0, -1.3, -0.54], rot: [0.9, 0, 0] }, 8);
      c.put(knee, k);
      c.flame(knee, [0, -1.52, -0.75], [0.9, 0, 0], 0.2, 1.6, 'leg');
    }
    {
      const k = new Kit(livery);
      const ay = d.ankleY;
      k.ball('K', 0.3);
      k.prism('P', [[-0.66, -ay + 0.56], [-0.4, 0.12], [0.36, 0.1], [1.4, -ay + 0.54], [1.4, -ay + 0.4], [-0.7, -ay + 0.42]], 0.56);
      k.prism('T', [[1.05, -ay + 0.66], [1.4, -ay + 0.54], [1.4, -ay + 0.4], [1.05, -ay + 0.4]], 0.58);
      k.box('S', 0.58, 0.06, 0.14, { at: [0, -0.08, 0.36] });
      k.box('K', 0.4, 0.12, 2.4, { at: [0, -ay + 0.36, 0.36] });
      wheels(k, ay, [-0.66, 0.38, 1.42], 0.32, 0.34);
      c.put(ankle, k);
    }
  }
}
