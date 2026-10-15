// Solstice's Sunhawk, the Swift-class forward, built to its model sheet
// (art/model-sheets, S1): the robot on the title screen's cover, seen whole.
// A heroic racer. A broad, faceted breastplate edged in gold with a lit
// diamond core and three blue slashes either side; two tall white towers on
// the shoulders, banded in blue and capped in gold; a long, flat bird's head
// with one lit eye slit and two gold blades swept back from its crown; white
// plates over a dark undersuit on every limb, the shins flaring wide below
// the knee and narrowing to the ankle; a long gold blade down the outside of
// each forearm; big calf thrusters; clawed skates; and two long fins, blue
// over gold, swept back and down from the shoulders. On the Swift's
// skeleton, with its weapons and thrusters, so the poses carry over. An
// original design. Model space: +z forward, +y up, +x to the mech's left.
import * as THREE from 'three';
import { decal } from '../decals';
import { Kit } from '../kit';
import { clawHand, mirrorX, numberDecal, wheels, type FrameCtx } from '../parts';

type P3 = [number, number, number];
type Slice = [number, number, number, number];

/**
 * A faceted plate round a limb or torso: slices up it, each (y, half width,
 * front, back), the front drawn to a ridge `keel` proud down the middle, the
 * whole moved to `at`. (The shared cuirass, with a place to put it.)
 */
function facet(k: Kit, slot: 'P' | 'S' | 'T', slices: Slice[], keel: number, at: P3 = [0, 0, 0]): void {
  k.loft(
    slot,
    slices.map(([y, w, f, b]): P3[] => [
      [0, y, f + keel],
      [w * 0.5, y, f],
      [w, y, f - (f - b) * 0.3],
      [w * 0.92, y, b],
      [-w * 0.92, y, b],
      [-w, y, f - (f - b) * 0.3],
      [-w * 0.5, y, f],
    ]),
    { at },
  );
}

/**
 * A rim for a faceted plate: its face's outline a little larger and just
 * behind it, with a short band at the edge, so only a border shows round the
 * plate, never across its face or down its sides.
 */
function rim(k: Kit, slot: 'P' | 'S' | 'T', slices: Slice[], keel: number, grow: number, at: P3 = [0, 0, 0]): void {
  k.loft(
    slot,
    slices.map(([y, w, f, b], i): P3[] => {
      const edge = f - (f - b) * 0.3;
      const W = w + grow;
      const yy = y + (i === 0 ? -grow : i === slices.length - 1 ? grow : 0);
      return [
        [0, yy, f - 0.06 + keel],
        [W * 0.5, yy, f - 0.06],
        [W, yy, edge - 0.04],
        [W, yy, edge - 0.16],
        [-W, yy, edge - 0.16],
        [-W, yy, edge - 0.04],
        [-W * 0.5, yy, f - 0.06],
      ];
    }),
    { at },
  );
}

/** A ring round the head at depth z: its half width, top and bottom. */
function headRing(z: number, hw: number, top: number, bot: number): P3[] {
  const mid = (top + bot) / 2 + 0.04;
  return [
    [0, top, z],
    [hw * 0.75, top - 0.03, z],
    [hw, mid, z],
    [hw * 0.8, bot, z],
    [-hw * 0.8, bot, z],
    [-hw, mid, z],
    [-hw * 0.75, top - 0.03, z],
  ];
}

/** A band hugging the head's sides at depth z, from y0 up to y1. */
function bandRing(z: number, hw: number, y0: number, y1: number): P3[] {
  return [
    [hw, y1, z],
    [hw, y0, z],
    [-hw, y0, z],
    [-hw, y1, z],
  ];
}

export function buildSunhawk(c: FrameCtx, number: string): void {
  const { rig, livery } = c;
  const J = rig.joints;
  const d = rig.dims;

  // ---- pelvis: a pointed plate front and back -----------------------------------------
  {
    const k = new Kit(livery);
    k.box('K', 0.86, 0.56, 0.72, { at: [0, 0, 0], taper: [1.12, 1.05] });
    for (const s of [1, -1]) k.ball('K', 0.28, { at: [s * d.hipX, -d.hipDrop, 0] });
    k.plate('P', [[-0.3, 0.32], [0.3, 0.32], [0.24, -0.45], [0, -0.82], [-0.24, -0.45]], 0.28, { at: [0, 0, 0.46], rot: [-0.08, 0, 0], bevel: 0.07 });
    k.plate('P', [[-0.07, 0.3], [0.07, 0.3], [0.04, -0.6], [-0.04, -0.6]], 0.06, { at: [0, 0, 0.62], rot: [-0.08, 0, 0], bevel: 0.02 });
    c.put(J.hips, k);
    // A broad plate over each hip, turned a little outward, riding up with its thigh.
    for (const s of [1, -1] as const) {
      const sk = s === 1 ? rig.skirts.l : rig.skirts.r;
      sk.position.set(s * 0.62, 0.16, 0.26);
      const f = new Kit(livery);
      const out: Array<[number, number]> = [[-0.18, 0.06], [0.22, 0.06], [0.28, -0.62], [0.08, -0.82], [-0.16, -0.56]];
      f.plate('P', s === 1 ? out : mirrorX(out), 0.12, { at: [0, 0, 0], rot: [-0.06, s * 0.75, s * 0.1], bevel: 0.04 });
      c.put(sk, f);
    }
    // The rear plate rides up as a leg swings back.
    const back = rig.skirts.back;
    back.position.set(0, 0.12, -0.36);
    const r = new Kit(livery);
    r.plate('P', [[-0.26, 0], [0.26, 0], [0.22, -0.6], [0, -0.88], [-0.22, -0.6]], 0.22, { at: [0, 0, -0.08], bevel: 0.06 });
    c.put(back, r);
  }

  // ---- waist: a broad, ribbed belly ------------------------------------------------------
  {
    const k = new Kit(livery);
    k.cyl('K', 0.36, 0.36, 0.95, 8, { at: [0, 0.4, 0] });
    for (const y of [0.06, 0.26, 0.46, 0.64]) k.cyl('D', 0.55, 0.5, 0.16, 10, { at: [0, y, 0.02], scale: [1, 1, 0.7] });
    c.put(J.spine, k);
  }

  // ---- chest: the faceted breastplate edged in gold, the diamond core, the slashes -------
  {
    const k = new Kit(livery);
    k.box('K', 1.5, 1.25, 1.2, { at: [0, 0.55, -0.05], taper: [1, 0.95] });
    // (y, half width, front, back), bottom to top.
    const plate: Slice[] = [[-0.2, 0.2, 0.94, 0.35], [-0.1, 0.36, 0.98, 0.32], [0.05, 0.7, 1.04, 0.24], [0.3, 1.0, 1.1, 0.18], [0.88, 1.05, 1.14, 0.15], [1.08, 0.97, 1.1, 0.2], [1.14, 0.9, 1.0, 0.25]];
    facet(k, 'P', plate, 0.07);
    rim(k, 'T', plate, 0.07, 0.04);
    // The core: a lit diamond in a dark setting.
    k.plate('D', [[0, 0], [0.34, 0.45], [0, 0.92], [-0.34, 0.45]], 0.16, { at: [0, 0, 1.15] });
    k.plate('G', [[0, 0.1], [0.2, 0.45], [0, 0.8], [-0.2, 0.45]], 0.04, { at: [0, 0, 1.24] });
    for (const s of [1, -1]) {
      // Three blue slashes either side, rising outward, on the slope of the plate.
      for (const y of [0.97, 0.75, 0.53]) k.box('S', 0.36, 0.085, 0.08, { at: [s * 0.63, y, 1.09], rot: [0, s * 0.25, s * 0.2], bevel: 0.02 });
      // The collar either side of the neck, and the shoulder joints under the towers.
      k.box('P', 0.4, 0.3, 0.7, { at: [s * 0.55, 1.26, 0.3], rot: [0, 0, -s * 0.25] });
      k.box('K', 0.45, 0.5, 0.7, { at: [s * 1.1, d.shoulderY, -0.05] });
      k.cyl('D', 0.28, 0.28, 0.36, 8, { axis: 'x', at: [s * (d.shoulderX - 0.22), d.shoulderY, 0] });
    }
    k.box('S', 0.38, 0.1, 0.25, { at: [0, -0.2, 0.92] });
    k.box('K', 0.56, 0.3, 0.56, { at: [0, 1.28, 0.32] });
    // The back: a dark power unit between white plates, two nozzles.
    k.box('F', 1.15, 1.15, 0.5, { at: [0, 0.55, -0.72], taper: [0.85, 1] });
    for (const s of [1, -1]) {
      k.box('P', 0.26, 1.0, 0.42, { at: [s * 0.5, 0.5, -0.72] });
      k.nozzle(0.23, 0.4, { at: [s * 0.28, 0.12, -0.96], rot: [-0.35, 0, 0] });
    }
    c.put(J.chest, k);
    for (const s of [1, -1]) c.flame(J.chest, [s * 0.28, -0.02, -1.34], [-0.35, 0, 0], 0.22, 3.4, 'main');
    const num = numberDecal(number, livery);
    num.scale.setScalar(0.5);
    num.position.set(0, 0.88, -0.976);
    num.rotation.y = Math.PI;
    num.renderOrder = 3;
    J.chest.add(num);
    decal(J.chest, livery, 'roundel', [0, 0.88, -0.972], [0, Math.PI, 0], 0.6);
  }

  // ---- fins: blue over gold, swept back and down from the shoulders ---------------------
  for (const s of [1, -1] as const) {
    const k = new Kit(livery);
    k.box('K', 0.22, 0.4, 0.44, { at: [0, 0, -0.05] });
    // Laid out pointing straight back; the group below swings it down and out.
    k.prism('S', [[0.05, 0.26], [-1.9, 0.04], [-2.35, -0.08], [-1.6, -0.06], [0.05, -0.02]], 0.08);
    k.prism('T', [[0.05, -0.02], [-1.6, -0.06], [-2.35, -0.08], [-1.5, -0.26], [0.05, -0.28]], 0.08);
    k.prism('G', [[-0.1, 0.0], [-1.6, -0.045], [-1.6, -0.075], [-0.1, -0.04]], 0.1);
    const wing = s === 1 ? J.wingL : J.wingR;
    wing.position.set(s * 0.62, 1.05, -0.74);
    // The poses turn the wing joint, so the fin's own hang rides on a group inside it.
    const fin = new THREE.Group();
    fin.rotation.set(-0.72, -s * 0.38, 0, 'YXZ');
    wing.add(fin);
    c.put(fin, k);
  }

  // ---- head: a long, flat bird's head, one lit eye slit, two gold blades -----------------
  {
    const k = new Kit(livery);
    k.loft('P', [headRing(-0.05, 0.3, 0.34, -0.16), headRing(0.35, 0.36, 0.4, -0.18), headRing(0.85, 0.27, 0.3, -0.06), headRing(1.45, 0.03, 0.1, 0.06)]);
    // The visor: a dark band round the face, the eye lit along it.
    k.loft('D', [bandRing(0.25, 0.37, 0.1, 0.25), bandRing(0.75, 0.31, 0.08, 0.22), bandRing(1.15, 0.18, 0.07, 0.17)]);
    for (const s of [1, -1]) k.box('G', 0.02, 0.04, 0.36, { at: [s * 0.32, 0.16, 0.75], rot: [0, s * 0.14, 0] });
    k.box('G', 0.18, 0.035, 0.02, { at: [0, 0.12, 1.155] });
    k.prism('D', [[-0.05, -0.28], [0.75, -0.14], [0.7, -0.05], [0.0, -0.1]], 0.4);
    for (const s of [1, -1]) k.prism('T', [[0.45, 0.26], [0.5, 0.42], [-0.7, 0.86], [-0.78, 0.78]], 0.07, { at: [s * 0.17, 0, 0], rot: [0, -s * 0.15, 0] });
    // The neck, leaning the head forward over the breastplate.
    k.cyl('K', 0.2, 0.24, 0.7, 8, { at: [0, -0.4, 0.1], rot: [0.45, 0, 0] });
    for (const y of [-0.55, -0.35]) k.cyl('D', 0.27, 0.27, 0.08, 8, { at: [0, y, 0.04 + (y + 0.55) * 0.3], rot: [0.45, 0, 0] });
    // A touch bigger than drawn and set a little higher: from the chase and garage cameras it reads small.
    const head = new THREE.Group();
    head.position.set(0, 0.24, -0.04);
    head.scale.setScalar(1.18);
    J.head.add(head);
    c.put(head, k);
  }

  // ---- arms: the towers, plated arms, a gold blade down each forearm ---------------------
  for (const s of [1, -1] as const) {
    const sh = s === 1 ? J.shL : J.shR;
    const el = s === 1 ? J.elL : J.elR;
    const wr = s === 1 ? J.wrL : J.wrR;
    const tx = -s * 0.15;
    {
      const k = new Kit(livery);
      k.ball('K', 0.3);
      // The tower: white, tapering, a broad blue band low down, a gold cap.
      k.box('P', 0.8, 1.05, 1.0, { at: [tx, 1.04, -0.1], taper: [0.66, 0.52], bevel: 0.08 });
      k.box('S', 0.86, 0.42, 1.1, { at: [tx, 0.3, -0.1], bevel: 0.09 });
      k.box('T', 0.56, 0.2, 0.56, { at: [tx, 1.66, -0.1], taper: [0.92, 0.92] });
      k.box('K', 0.56, 0.25, 0.66, { at: [tx * 0.6, 0.0, -0.05] });
      // The upper arm: a white plate over the dark frame.
      k.cyl('F', 0.22, 0.22, 1.2, 8, { at: [0, -0.75, 0] });
      k.box('P', 0.54, 0.7, 0.6, { at: [-s * 0.1, -0.62, -0.06], taper: [1.08, 1.06] });
      c.put(sh, k);
      // The sun on the front of the right tower, the warning triangle on the left.
      decal(sh, livery, s === -1 ? 'emblem' : 'warning', [tx, 0.95, 0.305], [-0.225, 0, 0], 0.36);
    }
    {
      const k = new Kit(livery);
      const fl = d.foreArm;
      k.cyl('D', 0.24, 0.24, 0.48, 8, { axis: 'x' });
      facet(k, 'P', [[-fl + 0.1, 0.3, 0.3, -0.3], [-fl * 0.45, 0.34, 0.36, -0.34], [-0.15, 0.3, 0.32, -0.3]], 0.12);
      // The blade: gold, from the elbow to well past the hand, a blue strip inside and a lit edge.
      k.prism('T', [[-0.12, 0.38], [0.06, 0.45], [0.16, 0.15], [0.16, -fl - 0.75], [0.02, -fl - 1.37], [-0.14, -fl - 0.85], [-0.15, 0.05]], 0.1, { at: [s * 0.5, 0, 0] });
      k.prism('S', [[-0.08, 0.15], [0.1, 0.15], [0.1, -fl - 0.55], [-0.08, -fl - 0.55]], 0.05, { at: [s * 0.43, 0, 0] });
      k.prism('G', [[0.15, 0.1], [0.185, 0.1], [0.185, -fl - 0.7], [0.04, -fl - 1.3], [0.02, -fl - 1.25], [0.15, -fl - 0.7]], 0.04, { at: [s * 0.48, 0, 0] });
      c.put(el, k);
    }
    {
      const k = new Kit(livery);
      clawHand(k, s, 1.2);
      c.put(wr, k);
    }
    const hand = s === 1 ? rig.handL : rig.handR;
    hand.position.set(0, -0.24, 0.32);
    if (s === -1) {
      rig.muzzle.position.set(0, -d.foreArm - 1.5, 0.4);
      el.add(rig.muzzle);
    }
  }

  // ---- legs: plated thighs, a knee guard, flaring shins, calf thrusters, clawed skates -----
  for (const s of [1, -1] as const) {
    const hip = s === 1 ? J.hipL : J.hipR;
    const knee = s === 1 ? J.kneeL : J.kneeR;
    const ankle = s === 1 ? J.ankleL : J.ankleR;
    {
      const k = new Kit(livery);
      k.cyl('F', 0.3, 0.26, 2.0, 8, { at: [-s * 0.08, -1.1, -0.04] });
      facet(k, 'P', [[-1.55, 0.23, 0.32, -0.2], [-1.1, 0.29, 0.4, -0.26], [-0.3, 0.34, 0.44, -0.28], [0.25, 0.3, 0.38, -0.26]], 0.14, [s * 0.08, 0, 0.02]);
      k.plate('P', [[-0.3, 0.1], [0.3, 0.1], [0.28, -1.15], [0.04, -1.72], [-0.24, -1.2]], 0.14, { at: [s * 0.08, 0, 0.44], rot: [-0.03, 0, 0], bevel: 0.05 });
      k.box('G', 0.03, 0.6, 0.04, { at: [-s * 0.3, -1.0, 0.24] });
      c.put(hip, k);
    }
    {
      const k = new Kit(livery);
      k.cyl('D', 0.26, 0.26, 0.5, 8, { axis: 'x' });
      // The knee guard, standing proud in front of the knee.
      k.plate('P', [[-0.24, 0.9], [0.24, 0.9], [0.33, 0.72], [0.33, 0.0], [0, -0.42], [-0.33, 0.0], [-0.33, 0.72]], 0.38, { at: [s * 0.06, 0, 0.64], rot: [0.12, 0, 0], bevel: 0.08 });
      facet(k, 'P', [[-1.9, 0.26, 0.42, -0.16], [-1.3, 0.32, 0.52, -0.22], [-0.5, 0.41, 0.6, -0.28], [0.12, 0.35, 0.5, -0.24]], 0.16, [s * 0.08, 0, 0.02]);
      k.prism('P', [[0.4, -0.15], [0.42, -1.05], [0.05, -1.55], [-0.24, -1.05], [-0.22, -0.3]], 0.1, { at: [s * 0.44, 0, 0], rot: [0, 0, -s * 0.07] });
      k.box('K', 0.5, 1.5, 0.56, { at: [-s * 0.1, -0.9, -0.28] });
      k.box('G', 0.03, 0.8, 0.04, { at: [-s * 0.3, -1.15, 0.3] });
      // The spur behind the knee, and the big calf thruster.
      k.prism('T', [[-0.2, 0.05], [-0.45, 0.0], [-0.9, 0.72], [-0.84, 0.8], [-0.25, 0.38]], 0.1);
      k.nozzle(0.24, 0.3, { at: [0, -0.62, -0.62] }, 10);
      c.put(knee, k);
      c.flame(knee, [0, -0.62, -0.95], [0, 0, 0], 0.2, 1.6, 'leg');
    }
    {
      const k = new Kit(livery);
      const ay = d.ankleY;
      k.ball('K', 0.26);
      // A big, wedged foot.
      k.prism('P', [[-0.62, -0.05], [-0.35, 0.24], [0.3, 0.28], [1.2, -0.02], [1.28, -0.22], [1.0, -0.38], [-0.6, -0.38]], 0.82);
      k.prism('P', [[-0.3, 0.3], [0.25, 0.34], [0.95, 0.06], [0.9, -0.05], [-0.3, 0.1]], 0.5);
      for (const [x, yaw] of [[0, 0], [0.28, 0.32], [-0.28, -0.32]] as const) {
        k.prism('T', [[0.95, -0.06], [1.7, -0.46], [1.66, -0.55], [0.95, -0.3]], 0.12, { at: [x, 0, 0], rot: [0, yaw, 0] });
      }
      k.prism('T', [[-0.4, 0.06], [-1.15, 0.38], [-1.12, 0.28], [-0.5, -0.12]], 0.12);
      k.box('K', 0.34, 0.12, 1.5, { at: [0, -0.28, 0.22] });
      wheels(k, ay, [-0.34, 0.23, 0.77], 0.26, 0.32);
      c.put(ankle, k);
    }
  }
}
