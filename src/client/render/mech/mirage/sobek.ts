// Mirage's Sobek, the Bulwark-class defender: crocodile-headed and built like
// a temple. A long, flat crocodile's head with gold teeth along its jaws and
// amber eyes raised on its brow, under a striped headdress; the broad
// jewelled collar across a massive chest; pauldrons like a temple's pylon
// gateways, battered walls under a flared cornice; gauntlets like papyrus
// columns, the scatter cannon slung under the right one in a toothed housing;
// a scarab's shell for a backpack, with a scarab's outspread feathered wings;
// a pleated kilt; pylon-walled boots on clawed feet. On the Bulwark's
// skeleton, with the Bulwark's weapons and thrusters in the same places. An
// original design. Model space: +z forward, +y up, +x to the mech's left.
import * as THREE from 'three';
import { decal } from '../decals';
import { Kit } from '../kit';
import { mirrorX, numberDecal, wheels, type FrameCtx } from '../parts';
import { band, broadCollar, headdress, sunDisc } from './motifs';

export function buildSobek(c: FrameCtx, number: string): void {
  const { rig, livery } = c;
  const J = rig.joints;
  const d = rig.dims;
  const b = 1.38;

  // ---- pelvis: a gold belt, banded tassets, the kilt's two panels ------------------------
  {
    const k = new Kit(livery);
    k.box('K', 1.25 * b, 0.68, 0.95 * b, { at: [0, 0.02, -0.02], taper: [1.12, 1.05] });
    k.box('T', 1.38 * b, 0.22, 1.04 * b, { at: [0, 0.38, -0.02] });
    k.box('S', 0.5, 0.26, 0.1, { at: [0, 0.38, 0.72] });
    for (const s of [1, -1]) {
      k.ball('K', 0.44, { at: [s * d.hipX, -d.hipDrop, 0] });
      k.box('P', 0.22, 1.06, 1.24 * b, { at: [s * (d.hipX + 0.62), -0.2, 0.02], taper: [1, 0.72], rot: [0, 0, s * 0.24] });
      k.box('T', 0.26, 0.1, 1.0 * b, { at: [s * (d.hipX + 0.58), 0.12, 0.02], rot: [0, 0, s * 0.24] });
      k.box('S', 0.26, 0.14, 1.22 * b, { at: [s * (d.hipX + 0.7), -0.58, 0.02], rot: [0, 0, s * 0.24] });
    }
    c.put(J.hips, k);
    // The kilt: two pleated panels that swing with the legs.
    for (const s of [1, -1] as const) {
      const sk = s === 1 ? rig.skirts.l : rig.skirts.r;
      sk.position.set(s * 0.46, 0.24, 0.62);
      const f = new Kit(livery);
      const tilt: [number, number, number] = [-0.1, 0, 0];
      f.cyl('K', 0.08, 0.08, 0.7, 8, { axis: 'x' });
      f.plate('P', [[-0.42, 0.04], [0.42, 0.04], [0.4, -1.0], [-0.4, -1.0]], 0.12, { at: [0, 0, 0.1], rot: tilt });
      for (const x of [-0.24, 0, 0.24]) f.plate('T', [[x - 0.025, -0.06], [x + 0.025, -0.06], [x + 0.025, -0.86], [x - 0.025, -0.86]], 0.03, { at: [0, 0, 0.17], rot: tilt });
      f.plate('S', [[-0.42, -0.84], [0.42, -0.84], [0.42, -1.0], [-0.42, -1.0]], 0.15, { at: [0, 0, 0.1], rot: tilt });
      c.put(sk, f);
    }
  }

  // ---- waist ------------------------------------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.48 * b, 0.58 * b, d.spineY + d.chestY, 10, { at: [0, (d.chestY - d.spineY) / 2 + 0.05, 0] });
    for (const y of [0.24, 0.6]) band(k, 0.68 * b, y, 0.17);
    k.plate('S', [[-0.42, 0.0], [0.42, 0.0], [0.3, 0.78], [-0.3, 0.78]], 0.18, { at: [0, 0.02, 0.66] });
    c.put(J.spine, k);
  }

  // ---- chest: massive, under a broad collar; the scarab's shell behind ----------------------
  {
    const k = new Kit(livery);
    const cw = d.shoulderX - 0.45;
    k.box('K', 2.1, 1.55, 1.5, { at: [0, 0.82, -0.1] });
    k.plate('P', [[-0.7, 0.05], [0.7, 0.05], [cw, 0.86], [cw + 0.1, 1.5], [0.86, 1.86], [-0.86, 1.86], [-cw - 0.1, 1.5], [-cw, 0.86]], 1.8, { at: [0, 0, -0.08] });
    k.plate('S', [[-0.5, 0.08], [0.5, 0.08], [0.72, 0.5], [-0.72, 0.5]], 0.1, { at: [0, 0, 0.82] });
    broadCollar(k, 1.5, 1.86, 0.84, -0.16, 1.3);
    for (const s of [1, -1]) {
      k.box('K', 0.6, 0.5, 0.8, { at: [s * (cw - 0.05), d.shoulderY + 0.02, -0.06] });
      k.cyl('D', 0.5, 0.5, 0.6, 10, { axis: 'x', at: [s * (d.shoulderX - 0.34), d.shoulderY, 0] });
      k.vent(0.34, 0.4, 3, { at: [s * (cw - 0.12), 0.5, 0.86], rot: [0, s * 0.35, 0], depth: 0.1, lit: true });
    }
    // The backpack: a core between the twin nozzles, under the scarab's domed shell.
    k.box('F', 2.0, 1.5, 0.6, { at: [0, 0.95, -1.1], taper: [0.86, 0.9] });
    for (const s of [1, -1]) k.nozzle(0.42, 0.66, { at: [s * 0.72, 0.56, -1.72], rot: [-0.25, 0, 0] });
    const zc = -1.2;
    const cy = 1.25;
    const A = 1.02;
    const B = 1.12;
    const D = 0.75;
    const dome: Array<[number, number]> = [];
    for (let i = 0; i <= 7; i++) {
      const a = (i / 7) * (Math.PI / 2);
      dome.push([A * Math.sin(a), -D * Math.cos(a)]);
    }
    k.lathe('P', dome, 14, { axis: 'z', at: [0, cy, zc], scale: [1, B / A, 1] });
    // The seam between the wing cases, and the line under the thorax, in gold.
    const depth = (x: number, t: number) => D * Math.sqrt(Math.max(0, 1 - (x / A) ** 2 - t * t));
    const seam: Array<[number, number]> = [];
    const ts = [0.36, 0.2, 0, -0.2, -0.4, -0.6, -0.78, -0.92];
    for (const t of ts) seam.push([zc - depth(0, t) - 0.03, cy + B * t]);
    for (const t of [...ts].reverse()) seam.push([zc - depth(0, t) + 0.06, cy + B * t]);
    k.prism('T', seam, 0.09);
    const t0 = 0.36;
    const xr = A * Math.sqrt(1 - t0 * t0) * 0.97;
    const line: Array<[number, number]> = [];
    for (let i = 0; i <= 10; i++) {
      const x = -xr + (2 * xr * i) / 10;
      line.push([x, -(zc - depth(x, t0) - 0.03)]);
    }
    for (let i = 10; i >= 0; i--) {
      const x = -xr + (2 * xr * i) / 10;
      line.push([x, -(zc - depth(x, t0) + 0.06)]);
    }
    k.plate('T', line, 0.09, { at: [0, cy + B * t0, 0], rot: [-Math.PI / 2, 0, 0] });
    // The scarab's head at the top of the shell, its eyes lit.
    k.cyl('T', 0.34, 0.34, 0.2, 12, { axis: 'z', at: [0, cy + B * 0.97, zc - 0.12], scale: [1, 0.45, 1] });
    for (const s of [1, -1]) k.box('G', 0.08, 0.05, 0.04, { at: [s * 0.18, cy + B * 0.97, zc - 0.23] });
    c.put(J.chest, k);
    for (const s of [1, -1]) c.flame(J.chest, [s * 0.72, 0.4, -2.36], [-0.25, 0, 0], 0.4, 3.0, 'main');
    // The number on the thorax, tipped with the shell.
    const tn = 0.6;
    const tip = Math.atan((D * tn) / (B * Math.sqrt(1 - tn * tn)));
    const zn = zc - depth(0, tn) - 0.01;
    decal(J.chest, livery, 'roundel', [0, cy + B * tn, zn], [tip, Math.PI, 0], 0.56);
    const num = numberDecal(number, livery);
    num.scale.setScalar(0.48);
    num.position.set(0, cy + B * tn, zn - 0.005);
    num.rotation.set(tip, Math.PI, 0);
    num.renderOrder = 3;
    J.chest.add(num);
  }

  // ---- wings: the scarab's, outspread and feathered, swept back ---------------------------
  for (const s of [1, -1] as const) {
    const k = new Kit(livery);
    k.cyl('K', 0.18, 0.18, 0.4, 8, { axis: 'y' });
    const feathers: Array<[number, number]> = [[0, 0.3], [0.6, 0.55], [1.3, 0.62], [1.9, 0.5], [2.25, 0.2], [2.2, -0.05], [1.98, -0.4], [1.84, -0.12], [1.62, -0.5], [1.48, -0.18], [1.24, -0.54], [1.1, -0.2], [0.86, -0.52], [0.72, -0.18], [0.46, -0.42], [0.3, -0.12], [0, -0.22]];
    const coverts: Array<[number, number]> = [[0.02, 0.2], [0.6, 0.42], [1.3, 0.5], [1.86, 0.38], [2.1, 0.12], [1.5, 0.0], [0.8, 0.02], [0.02, -0.08]];
    const edge: Array<[number, number]> = [[0, 0.3], [0.6, 0.55], [1.3, 0.62], [1.9, 0.5], [2.25, 0.2], [2.12, 0.2], [1.82, 0.42], [1.28, 0.52], [0.58, 0.45], [0, 0.2]];
    const lit: Array<[number, number]> = [[0.1, -0.06], [0.8, 0.04], [1.5, 0.02], [2.06, 0.1], [2.04, 0.04], [1.5, -0.04], [0.8, -0.03], [0.1, -0.12]];
    const side = (p: Array<[number, number]>) => (s === 1 ? p : mirrorX(p));
    k.plate('P', side(feathers), 0.12);
    k.plate('S', side(coverts), 0.15);
    k.plate('T', side(edge), 0.17);
    k.plate('G', side(lit), 0.17);
    for (const x of [0.6, 1.0, 1.4, 1.8]) k.plate('T', side([[x - 0.025, -0.06], [x + 0.025, -0.06], [x + 0.025, -0.38], [x - 0.025, -0.38]]), 0.14);
    // The poses turn the wing joint, so the wing's own sweep rides on a group inside it.
    const wing = s === 1 ? J.wingL : J.wingR;
    wing.position.set(s * 0.92, 1.9, -1.5);
    const spread = new THREE.Group();
    spread.rotation.set(0, s * 0.72, s * 0.34);
    wing.add(spread);
    c.put(spread, k);
  }

  // ---- head: the crocodile ----------------------------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.3, 0.36, 0.42, 8, { at: [0, -0.08, -0.05] });
    k.box('P', 0.82, 0.5, 0.8, { at: [0, 0.26, -0.05], taper: [0.85, 0.85] });
    // The upper jaw: long, flat and tapering, nostrils at its tip; the lower jaw a little open.
    k.box('P', 0.56, 1.1, 0.2, { at: [0, 0.26, 0.86], rot: [Math.PI / 2, 0, 0], taper: [0.68, 1] });
    k.box('D', 0.16, 0.06, 0.1, { at: [0, 0.37, 1.32] });
    k.box('F', 0.5, 1.0, 0.12, { at: [0, 0.04, 0.78], rot: [Math.PI / 2 + 0.16, 0, 0], taper: [0.7, 1] });
    for (const s of [1, -1]) {
      for (let i = 0; i < 5; i++) {
        const z = 0.48 + i * 0.2;
        const x = 0.27 - (z - 0.31) * 0.08;
        k.plate('T', [[-0.04, 0], [0.04, 0], [0, -0.13]], 0.04, { at: [s * x, 0.16, z], rot: [0, (s * Math.PI) / 2, 0] });
        // The lower teeth stand on the lower jaw, where it has opened away from the upper.
        const zl = z - 0.1;
        if (i > 0) k.plate('T', [[-0.035, 0], [0.035, 0], [0, 0.1]], 0.04, { at: [s * (0.25 - (zl - 0.28) * 0.075), 0.1 - (zl - 0.78) * 0.16, zl], rot: [0, (s * Math.PI) / 2, 0] });
      }
    }
    // The eyes, raised on the brow, amber.
    for (const s of [1, -1]) {
      k.box('P', 0.2, 0.16, 0.26, { at: [s * 0.22, 0.54, 0.16] });
      k.box('D', 0.16, 0.07, 0.04, { at: [s * 0.22, 0.56, 0.29] });
      k.box('G', 0.1, 0.05, 0.04, { at: [s * 0.22, 0.56, 0.305] });
    }
    // The headdress, and a sun disc crest.
    headdress(k, 0.46, 0.38, 0.78, -0.2, 5);
    k.box('T', 0.7, 0.1, 0.6, { at: [0, 0.54, -0.16] });
    sunDisc(k, 0.24, [0, 0.86, -0.22]);
    const head = new THREE.Group();
    head.position.set(0, 0.3, 0.18);
    J.head.add(head);
    c.put(head, k);
  }

  // ---- arms: pylon pauldrons, column gauntlets ----------------------------------------------------
  for (const s of [1, -1] as const) {
    const sh = s === 1 ? J.shL : J.shR;
    const el = s === 1 ? J.elL : J.elR;
    const wr = s === 1 ? J.wrL : J.wrR;
    {
      const k = new Kit(livery);
      k.ball('K', 0.52);
      k.cyl('K', 0.34, 0.4, d.upperArm - 0.25, 8, { at: [0, -d.upperArm / 2 - 0.05, 0] });
      k.box('P', 0.6, d.upperArm * 0.6, 0.78, { at: [s * 0.1, -d.upperArm * 0.58, 0], taper: [1.08, 1.05] });
      band(k, 0.44, -d.upperArm + 0.26, 0.14);
      // The pylon: battered walls, a gold torus, a flared cornice; a dark gateway in its face and a sun disc on its side.
      k.box('P', 1.3, 0.9, 1.4, { at: [s * 0.62, 0.36, 0], taper: [0.8, 0.86] });
      k.box('T', 1.12, 0.1, 1.26, { at: [s * 0.62, 0.84, 0] });
      k.box('S', 1.14, 0.24, 1.3, { at: [s * 0.62, 1.0, 0], taper: [1.18, 1.14] });
      k.box('T', 1.4, 0.06, 1.52, { at: [s * 0.62, 1.15, 0] });
      k.box('D', 0.34, 0.5, 0.08, { at: [s * 0.62, 0.22, 0.66] });
      k.cyl('T', 0.2, 0.2, 0.06, 12, { axis: 'x', at: [s * 1.19, 0.46, 0], rot: [0, 0, s * 0.14] });
      k.cyl('G', 0.1, 0.1, 0.08, 12, { axis: 'x', at: [s * 1.2, 0.46, 0], rot: [0, 0, s * 0.14] });
      c.put(sh, k);
      decal(sh, livery, s === 1 ? 'emblem' : 'caution', [s * 0.42, -d.upperArm * 0.58, 0], [0, (s * Math.PI) / 2, 0], 0.5, s === 1 ? 0.5 : 0.24);
    }
    {
      const k = new Kit(livery);
      const fl = d.foreArm;
      k.cyl('D', 0.4, 0.4, 0.8, 10, { axis: 'x' });
      // The column: an open papyrus capital at the elbow, a fluted shaft, a banded base at the wrist.
      k.lathe('P', [[0, -fl - 0.05], [0.56, -fl - 0.05], [0.58, -fl + 0.12], [0.48, -fl + 0.26], [0.45, -0.62], [0.52, -0.45], [0.66, -0.22], [0.7, -0.08], [0, -0.08]], 12);
      for (const y of [-0.6, -0.7, -0.8]) band(k, 0.48, y, 0.06);
      band(k, 0.6, -fl + 0.06, 0.1);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        k.box('S', 0.07, fl - 1.12, 0.07, { at: [Math.sin(a) * 0.46, (-fl + 0.26 - 0.86) / 2, Math.cos(a) * 0.46] });
      }
      if (s === -1) {
        // The scatter cannon, slung under the right column in a housing toothed like a jaw.
        k.box('F', 0.7, 0.7, 0.7, { at: [s * 0.8, -0.5, 0.1] });
        for (const [ox, oz] of [[0.22, -0.08], [-0.22, -0.08], [0, 0.24]] as const) {
          k.cyl('D', 0.18, 0.18, 1.3, 8, { at: [s * 1.0 + ox, -1.25, 0.1 + oz] });
          k.cyl('G', 0.12, 0.12, 0.05, 8, { at: [s * 1.0 + ox, -1.92, 0.1 + oz] });
        }
        k.box('S', 0.84, 0.5, 0.84, { at: [s * 1.0, -1.4, 0.12] });
        k.box('T', 0.88, 0.08, 0.88, { at: [s * 1.0, -1.14, 0.12] });
        for (let i = 0; i < 5; i++) k.plate('T', [[-0.05, 0], [0.05, 0], [0, -0.16]], 0.04, { at: [s * 1.0 + (i - 2) * 0.17, -1.64, 0.55] });
        for (let i = 0; i < 3; i++) k.plate('T', [[-0.05, 0], [0.05, 0], [0, -0.16]], 0.04, { at: [s * 1.43, -1.64, 0.12 + (i - 1) * 0.24], rot: [0, Math.PI / 2, 0] });
      }
      c.put(el, k);
    }
    {
      // The Breaker: a heavy fist with a gold bar across the knuckles.
      const k = new Kit(livery);
      k.box('K', 0.84, 0.62, 0.86, { at: [0, -0.34, 0.06] });
      k.box('P', 0.96, 0.42, 0.42, { at: [0, -0.28, -0.32], taper: [0.92, 1] });
      for (let i = 0; i < 4; i++) k.box('K', 0.18, 0.34, 0.3, { at: [(i - 1.5) * 0.21, -0.66, 0.24], rot: [0.35, 0, 0], bevel: 0.025 });
      k.box('T', 0.94, 0.18, 0.36, { at: [0, -0.5, 0.42] });
      k.box('K', 0.2, 0.38, 0.24, { at: [-s * 0.42, -0.42, 0.34], rot: [0.2, 0, s * 0.5], bevel: 0.025 });
      band(k, 0.5, 0.0, 0.12);
      c.put(wr, k);
    }
    const hand = s === 1 ? rig.handL : rig.handR;
    hand.position.set(0, -0.3, 0.6);
    if (s === -1) {
      rig.muzzle.position.set(s * 1.0, -2.0, 0.1);
      el.add(rig.muzzle);
    }
  }

  // ---- legs: pylon-walled boots, clawed feet --------------------------------------------------
  for (const s of [1, -1] as const) {
    const hip = s === 1 ? J.hipL : J.hipR;
    const knee = s === 1 ? J.kneeL : J.kneeR;
    const ankle = s === 1 ? J.ankleL : J.ankleR;
    {
      const k = new Kit(livery);
      k.box('K', 0.7 * b, d.thigh - 0.3, 0.74 * b, { at: [0, -d.thigh / 2 - 0.05, -0.02], taper: [1.2, 1.15] });
      k.box('P', 0.82 * b, d.thigh - 0.55, 0.86 * b, { at: [0, -d.thigh / 2 - 0.12, 0.0], taper: [1.12, 1.08] });
      k.box('S', 0.1, d.thigh * 0.5, 0.5, { at: [s * 0.6, -d.thigh * 0.55, 0.02] });
      band(k, 0.6, -d.thigh + 0.3, 0.14);
      c.put(hip, k);
    }
    {
      const k = new Kit(livery);
      k.cyl('D', 0.44, 0.44, 0.86, 10, { axis: 'x' });
      // A round knee plate, gold-rimmed.
      k.cyl('P', 0.42, 0.42, 0.16, 12, { axis: 'z', at: [0, 0.0, 0.5] });
      k.cyl('T', 0.46, 0.46, 0.08, 12, { axis: 'z', at: [0, 0.0, 0.45] });
      k.cyl('S', 0.2, 0.2, 0.18, 12, { axis: 'z', at: [0, 0.0, 0.52] });
      // The boot: battered walls rising to a flared cornice under the knee.
      k.box('K', 0.7, d.shin - 0.4, 0.72, { at: [0, -d.shin / 2, -0.08] });
      k.box('P', 1.0, d.shin - 0.5, 1.06, { at: [0, -d.shin / 2 - 0.12, -0.04], taper: [0.78, 0.8] });
      k.box('S', 0.86, 0.2, 0.92, { at: [0, -0.28, -0.04], taper: [1.12, 1.1] });
      k.box('T', 0.98, 0.05, 1.04, { at: [0, -0.16, -0.04] });
      k.box('S', 0.42, d.shin * 0.42, 0.06, { at: [0, -d.shin * 0.6, 0.46], taper: [0.8, 1] });
      k.box('P', 1.2, 0.5, 1.36, { at: [0, -d.shin + 0.42, 0.06], taper: [0.84, 0.82] });
      k.box('T', 1.24, 0.1, 1.4, { at: [0, -d.shin + 0.68, 0.06] });
      k.nozzle(0.22, 0.36, { at: [0, -1.1, -0.82], rot: [0.9, 0, 0] }, 8);
      c.put(knee, k);
      c.flame(knee, [0, -1.36, -1.08], [0.9, 0, 0], 0.26, 1.6, 'leg');
      if (s === 1) decal(knee, livery, 'warning', [0.46, -1.0, -0.04], [0, Math.PI / 2, 0], 0.24);
    }
    {
      const k = new Kit(livery);
      const ay = d.ankleY;
      const len = 2.9;
      k.ball('K', 0.4);
      k.prism('P', [[-0.9, -ay + 0.5], [-0.62, 0.2], [0.56, 0.16], [len - 0.95, -ay + 0.64], [len - 0.85, -ay + 0.44], [-1.0, -ay + 0.44]], 1.1);
      k.box('T', 1.14, 0.1, 0.5, { at: [0, -ay + 0.62, 0.0] });
      // Four gold claws, and a spur behind the heel.
      for (const x of [-0.39, -0.13, 0.13, 0.39]) k.prism('T', [[len - 1.1, -ay + 0.6], [len - 0.45, -ay + 0.54], [len - 0.3, -ay + 0.38], [len - 0.42, -ay + 0.3], [len - 0.56, -ay + 0.42], [len - 1.1, -ay + 0.44]], 0.14, { at: [x, 0, 0], rot: [0, x * 0.5, 0] });
      k.prism('T', [[-0.86, -ay + 0.52], [-1.5, -ay + 0.6], [-1.58, -ay + 0.42], [-0.96, -ay + 0.42]], 0.16);
      k.box('K', 0.68, 0.18, len - 0.2, { at: [0, -ay + 0.4, (len - 1.85) / 2] });
      wheels(k, ay, [-0.6, 0.2, len - 1.35], 0.36, 0.5);
      c.put(ankle, k);
    }
  }
}
