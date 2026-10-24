// The files the Blender side fits the fallen titan to (art/blender/titan/fit/):
//   road.json       the road every sample (4 m): where it is, its frame, its width, its forks
//   road.obj        the road's deck and barriers, to see it by
//   keepout.obj     the space round the road the titan must leave empty (KEEP_OUT.up over the deck)
//   sky.obj         the sky over the road that should stay open too (KEEP_OUT.sky), bar what is meant to pass over
//   guide.obj       the titan where each part goes: with --model, the Blender model posed
//                   as the wreck (tools/titan/pose_model.py's posed.glb); else the placeholder (pose.ts)
//   pose.json       its joints and the parts the road places (the halo, the sword), and the limits
//   stretches.json  where the road runs on the titan and where it goes through it
// All in the game's axes and metres: x east, y up, z south. Imported into
// Blender as OBJ with Y up and -Z forward (its importer's default), a game
// point (x, y, z) lands at Blender (x, -z, y), and glTF exported from
// Blender with +Y up (its default) comes back to the game's axes.
//   npx tsx tools/titan/export.ts [out dir] [--model posed.glb]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readTitanLevel } from '../../src/client/render/titan/read';
import { join } from 'node:path';
import { buildTrack, type Track } from '../../src/sim/track';
import { trackById } from '../../src/sim/tracks/index';
import { pieceStarts, type CircuitDef } from '../../src/sim/circuit';
import { KEEP_OUT, keepBoxes, RoadIndex } from '../../src/client/render/titan/keepout';
import { fitToRoad, STANDING, titanJoints, titanShapes, TITAN_POSE, type V3 } from '../../src/client/render/titan/pose';
import { shapeGeometry } from '../../src/client/render/titan/placeholder';

const args = process.argv.slice(2);
const modelAt = args.indexOf('--model');
const model = modelAt >= 0 ? args.splice(modelAt, 2)[1] : null;
const out = args[0] ?? 'art/blender/titan/fit';
mkdirSync(out, { recursive: true });
const def = trackById('titan') as CircuitDef;
const t = buildTrack(def);
const starts = pieceStarts(def);
const ranges = def.pieces.map((p, k) => ({ k, name: p.name ?? '', s0: starts[k], s1: k + 1 < starts.length ? starts[k + 1] : t.length }));
const pieceAt = (s: number) => {
  let k = 0;
  while (k + 1 < ranges.length && ranges[k + 1].s0 <= s) k++;
  return k;
};
const r1 = (v: number) => Math.round(v * 1000) / 1000;
const toBlender = (p: V3): V3 => [r1(p[0]), r1(-p[2]), r1(p[1])];

// ---- road.json -------------------------------------------------------------------
const samples = [];
for (let i = 0; i < t.n; i++) {
  samples.push({
    i,
    s: r1(i * t.ds),
    piece: pieceAt(i * t.ds),
    p: [t.px[i], t.py[i], t.pz[i]].map(r1),
    t: [t.tx[i], t.ty[i], t.tz[i]].map(r1),
    r: [t.rx[i], t.ry[i], t.rz[i]].map(r1),
    u: [t.ux[i], t.uy[i], t.uz[i]].map(r1),
    hw: r1(t.hw[i]),
    road: [t.roadL[i], t.roadR[i]],
    wall: [t.wallL[i], t.wallR[i]],
    median: r1(t.median[i]),
    shift: [r1(t.shiftL[i]), r1(t.shiftR[i])],
    rise: [r1(t.riseL[i]), r1(t.riseR[i])],
    held: t.mag[i],
  });
}
writeFileSync(
  join(out, 'road.json'),
  JSON.stringify({
    about:
      "Titan's Rest's road, one sample every ds metres round the lap. Game axes, metres: x east, y up, z south (Blender: (x, -z, y)). p is the centreline, t the direction of travel, r to the right, u up out of the deck (all banked and rolled with the road). hw is the half width; road says whether there is deck on the left and right (no deck over the Crown Drop's gap); wall whether a barrier stands on each edge; through the Hull's fork each route is drawn moved across by shift and up by rise from the centreline, with a wall of half width median between them. The space the titan must leave empty is, at each sample, from KEEP_OUT.side past each edge and from KEEP_OUT.down below the deck to KEEP_OUT.up above it (each route of the fork its own box), along the road a sample either way.",
    ds: r1(t.ds),
    length: r1(t.length),
    KEEP_OUT,
    pieces: ranges.map((r) => ({ index: r.k, name: r.name, s0: r1(r.s0), s1: r1(r.s1) })),
    samples,
  }),
);

// ---- OBJ writing -----------------------------------------------------------------
class Obj {
  lines: string[] = [];
  private n = 0;
  object(name: string) {
    this.lines.push(`o ${name}`);
  }
  /** A quad (or triangle) from points, in order round it. */
  face(...pts: V3[]) {
    for (const p of pts) this.lines.push(`v ${r1(p[0])} ${r1(p[1])} ${r1(p[2])}`);
    const ids = pts.map((_, k) => this.n + k + 1);
    this.n += pts.length;
    this.lines.push(`f ${ids.join(' ')}`);
  }
  write(path: string, header: string) {
    writeFileSync(path, `# ${header}\n# Game axes, metres: x east, y up, z south. Import into Blender with Y up and -Z forward.\n${this.lines.join('\n')}\n`);
  }
}
/** A point in sample i's frame: across d (with that side's fork offset), up h. */
const at = (tr: Track, i: number, d: number, h: number, side: number): V3 => {
  const sh = side < 0 ? tr.shiftL[i] : side > 0 ? tr.shiftR[i] : 0;
  const rh = side < 0 ? tr.riseL[i] : side > 0 ? tr.riseR[i] : 0;
  return [
    tr.px[i] + tr.rx[i] * (d + sh) + tr.ux[i] * (h + rh),
    tr.py[i] + tr.ry[i] * (d + sh) + tr.uy[i] * (h + rh),
    tr.pz[i] + tr.rz[i] * (d + sh) + tr.uz[i] * (h + rh),
  ];
};
const next = (i: number) => (i + 1) % t.n;

// ---- road.obj --------------------------------------------------------------------
{
  const o = new Obj();
  o.object('road_deck');
  for (let i = 0; i < t.n; i++) {
    const j = next(i);
    for (const side of [-1, 1]) {
      if ((side < 0 ? t.roadL[i] && t.roadL[j] : t.roadR[i] && t.roadR[j]) === 0) continue;
      const a0 = side * t.median[i], a1 = side * t.hw[i], b0 = side * t.median[j], b1 = side * t.hw[j];
      const q = [at(t, i, a0, 0, side), at(t, i, a1, 0, side), at(t, j, b1, 0, side), at(t, j, b0, 0, side)];
      o.face(...(side < 0 ? q : [q[0], q[3], q[2], q[1]]));
      // The slab under it.
      const u = [at(t, i, a0, -6.2, side), at(t, i, a1, -6.2, side), at(t, j, b1, -6.2, side), at(t, j, b0, -6.2, side)];
      o.face(...(side < 0 ? [u[0], u[3], u[2], u[1]] : u));
    }
  }
  o.object('road_barriers');
  for (let i = 0; i < t.n; i++) {
    const j = next(i);
    for (const side of [-1, 1]) {
      if ((side < 0 ? t.wallL[i] && t.wallL[j] : t.wallR[i] && t.wallR[j]) === 0) continue;
      const w0 = side * t.hw[i], w1 = side * t.hw[j];
      o.face(at(t, i, w0, 0, side), at(t, j, w1, 0, side), at(t, j, w1, 3, side), at(t, i, w0, 3, side));
    }
  }
  o.write(join(out, 'road.obj'), "Titan's Rest: the road's deck, the slab under it and its barriers.");
}

// ---- keepout.obj, sky.obj: a closed box between each pair of samples ---------------------
for (const [file, up, what] of [
  ['keepout.obj', KEEP_OUT.up, `the space round the road the titan must leave empty: ${KEEP_OUT.side} m past each edge, ${KEEP_OUT.down} m below the deck to ${KEEP_OUT.up} m above it`],
  ['sky.obj', KEEP_OUT.sky, `the sky over the road (up to ${KEEP_OUT.sky} m) that should stay open, bar what is meant to pass over it`],
] as const) {
  const o = new Obj();
  o.object(file.replace('.obj', ''));
  for (let i = 0; i < t.n; i++) {
    const j = next(i);
    const A = keepBoxes(t, i, up), B = keepBoxes(t, j, up);
    for (let k = 0; k < Math.min(A.length, B.length); k++) {
      const a = A[k], b = B[k];
      // Each box's corners already carry the fork offsets.
      const ca = [at(t, i, a.d0, a.h0, 0), at(t, i, a.d1, a.h0, 0), at(t, i, a.d1, a.h1, 0), at(t, i, a.d0, a.h1, 0)];
      const cb = [at(t, j, b.d0, b.h0, 0), at(t, j, b.d1, b.h0, 0), at(t, j, b.d1, b.h1, 0), at(t, j, b.d0, b.h1, 0)];
      for (let e = 0; e < 4; e++) o.face(ca[e], cb[e], cb[(e + 1) % 4], ca[(e + 1) % 4]);
      o.face(ca[3], ca[2], ca[1], ca[0]);
      o.face(cb[0], cb[1], cb[2], cb[3]);
    }
  }
  o.write(join(out, file), `Titan's Rest: ${what}. Closed boxes, one from each sample to the next.`);
}

// ---- guide.obj and pose.json ------------------------------------------------------
const pose = fitToRoad(TITAN_POSE, t);
{
  const o = new Obj();
  const tri = (p: ArrayLike<number>) => {
    for (let k = 0; k < p.length; k += 9) o.face([p[k], p[k + 1], p[k + 2]], [p[k + 3], p[k + 4], p[k + 5]], [p[k + 6], p[k + 7], p[k + 8]]);
  };
  if (model) {
    const bytes = readFileSync(model);
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    for (const [part, geo] of readTitanLevel(gltf.scene)) {
      for (const [slot, g] of Object.entries(geo)) {
        o.object(`guide/${part}/${slot}`);
        tri(g!.attributes.position.array as Float32Array);
      }
    }
    o.write(join(out, 'guide.obj'), "Titan's Rest: the titan's Blender model posed as the wreck (tools/titan/pose_model.py), where each part goes. Unbroken: the openings and the damage are still to make.");
  } else {
    for (const s of titanShapes(pose)) {
      o.object(`guide/${s.part}/${s.mat}`);
      tri(shapeGeometry(s, 24).attributes.position.array as Float32Array);
    }
    o.write(join(out, 'guide.obj'), "Titan's Rest: the titan as simple shapes where each part goes (src/client/render/titan/pose.ts). A guide, not a design.");
  }
}
// How far out from a line any of the road's space reaches, between two distances along the road.
const reach = (s0: number, s1: number, a: V3, dir: V3, up: number, nearest: boolean) => {
  let best = nearest ? Infinity : 0;
  for (let i = Math.floor(s0 / t.ds); i <= Math.floor(s1 / t.ds); i++) {
    for (const b of keepBoxes(t, i % t.n, up)) {
      for (let d = b.d0; d <= b.d1 + 1e-6; d += (b.d1 - b.d0) / 12) {
        for (const h of [b.h0, b.h1]) {
          const p = at(t, i % t.n, d, h, 0);
          const v: V3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
          const along = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2];
          const r = Math.hypot(v[0] - dir[0] * along, v[1] - dir[1] * along, v[2] - dir[2] * along);
          best = nearest ? Math.min(best, r) : Math.max(best, r);
        }
      }
    }
  }
  return best;
};
const range = (name: string) => ranges.find((r) => r.name === name)!;
const halo = range('the Halo');
const hi0 = Math.floor(halo.s0 / t.ds), hi1 = Math.floor(halo.s1 / t.ds);
const haloA: V3 = [t.px[hi0], t.py[hi0], t.pz[hi0]];
const haloB: V3 = [t.px[hi1], t.py[hi1], t.pz[hi1]];
const haloLen = Math.hypot(haloB[0] - haloA[0], haloB[1] - haloA[1], haloB[2] - haloA[2]);
const haloDir: V3 = [(haloB[0] - haloA[0]) / haloLen, (haloB[1] - haloA[1]) / haloLen, (haloB[2] - haloA[2]) / haloLen];
const sword = range('the Sword');
const swordDir = pose.swordDir;
const joints = titanJoints(pose);
const both = (p: V3) => ({ game: p.map(r1), blender: toBlender(p) });
writeFileSync(
  join(out, 'pose.json'),
  JSON.stringify(
    {
      about:
        "Where the fallen titan of Titan's Rest lies: the targets to pose the model to. Game axes and Blender axes for every point. It lies on its back, head west, feet east, its right side to the south; its back plate is burialDepth below the sand (y 0). The joints are its rig's pivots; the halo and the sword are placed by the road, which runs through and round them.",
      units: 'metres',
      axes: { game: 'x east, y up, z south', blender: 'X east, Y north, Z up: a game point (x, y, z) is Blender (x, -z, y)' },
      height: STANDING.height,
      burialDepth: pose.burial,
      body: { up: both([-1, 0, 0]), forward: both([0, 1, 0]), right: both([0, 0, 1]) },
      joints: Object.fromEntries(Object.entries(joints).map(([k, v]) => [k, both(v)])),
      head: {
        pitch: pose.head.pitch,
        lift: pose.head.lift,
        note: 'Its neck broken: the head tipped forward on it by pitch degrees (chin toward the chest, so the face turns toward the feet and the brow rises) about the head pivot, and propped up lift metres on its fallen collar plates and drifted sand, so the road runs on from the top of the chest across the face.',
      },
      halo: {
        centre: both(pose.halo),
        axis: both(haloDir),
        note: 'Torn off and standing upright on its struts past the crown, facing along the road, which rolls a full turn through it. Its inner edge must stay clear of the whole roll.',
        minInnerRadius: r1(reach(halo.s0, halo.s1, haloA, haloDir, KEEP_OUT.up, false) + 4),
      },
      sword: {
        guard: both(pose.swordGuard),
        towardPoint: both(swordDir),
        blade: pose.sword,
        note: 'Driven into the sand at a slant, its grip snapped off a short way above the guard (the rest of the grip and the pommel lie in the sand nearby). The road crests over the guard, then corkscrews twice round the blade, under the deck all the way round.',
        maxBladeRadius: r1(reach(sword.s0 + 20, sword.s1, pose.swordGuard, swordDir, KEEP_OUT.up, true) - 1.5),
      },
    },
    null,
    1,
  ),
);

// ---- stretches.json ---------------------------------------------------------------
const span = (name: string) => {
  const r = range(name);
  return { piece: name, s0: r1(r.s0), s1: r1(r.s1) };
};
writeFileSync(
  join(out, 'stretches.json'),
  JSON.stringify(
    {
      about: 'Where the road runs on the titan (its deck seated just over the titan, slab bottom 6.2 m under the deck) and where it passes through it (the titan open round it). Distances along the road; see road.json for the samples.',
      on: [
        { ...span('the Palm'), part: 'hand.R', note: 'climbs over the fingertips and the open palm, rising to the wrist' },
        { ...span('the Arm'), part: 'forearm.R', note: 'along the top of the forearm, palm up' },
        { ...span('the Shoulder'), part: 'upper_arm.R, shoulder.R, chest', note: 'climbs off the upper arm, over the top of the right shoulder armour and onto the chest (over the upper arm it rises clear of it: pylons stand on the arm there)' },
        { ...span('the Collar'), part: 'chest', note: 'north along the top of the chest by the collarbone' },
        { ...span('T1 the Chin'), part: 'chest, head', note: 'turns west off the chest onto the chin' },
        { ...span('the Brow'), part: 'head', note: 'over the face and forehead, down the middle, between the horns: the head tipped forward on its broken neck and propped up (pose.json head)' },
      ],
      through: [
        { ...span('the Halo'), part: 'halo', note: 'rolls a full turn through the standing ring' },
        { piece: 'into the Breach', s0: r1(range('T4 the Breach').s1), s1: r1(range('the Ribcage').s0), part: 'chest', note: 'in through the wound in the left (north) flank' },
        { ...span('the Ribcage'), part: 'chest', note: 'a full loop inside the ribs: the chest hollow round it' },
        { ...span('the Hull'), part: 'chest', note: "a fork: the left route through walled and roofed corridors, the right (the gallery) high along the ribs, open on its outside" },
        { piece: 'out of the right flank', s0: r1(range('the Hull').s1), s1: r1(range('out of the Hull').s0), part: 'chest', note: 'out through an opening in the right (south) flank' },
        { ...span('the Sword'), part: 'sword', note: 'twice round the blade, the blade under the deck all the way' },
      ],
      past: [
        { piece: 'past the crown', s0: r1(range('past the crown').s0), s1: r1(range('down to the Halo').s1), part: 'head', note: 'down past the crown and between the horns, clear of them, to the Halo' },
        {
          piece: 'up to the hilt, over the crossguard',
          s0: r1(range('up to the hilt').s0),
          s1: r1(range('over the crossguard').s1),
          part: 'sword',
          note: "up to the hilt and over the top onto the blade on one long arc, passing over the guard just before the corkscrew: the guard lies inside the corkscrew's radius from the blade, so the road cannot rest on it, and does not have to",
        },
      ],
      under: [{ ...span('the Long Flank'), part: 'upper_arm.L, forearm.L', note: 'under the raised left elbow' }],
    },
    null,
    1,
  ),
);

// A check that the placeholder is clear of the road, as the model must be.
const index = new RoadIndex(t);
console.log(`wrote ${out}: road ${t.n} samples (${t.length.toFixed(0)} m), halo min inner radius ${reach(halo.s0, halo.s1, haloA, haloDir, KEEP_OUT.up, false).toFixed(1)} + 4, sword max blade radius ${(reach(sword.s0 + 20, sword.s1, pose.swordGuard, swordDir, KEEP_OUT.up, true) - 1.5).toFixed(1)}; ${index.reach.toFixed(0)} m reach`);
