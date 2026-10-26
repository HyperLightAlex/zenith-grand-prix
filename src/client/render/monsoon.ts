// Monsoon Ruins' world, in the plain look, built round the road from the
// circuit's own measures (sim/tracks/monsoon.ts): the jungle floor, and the
// plateau over it east of the gorge, the roads cut into the ground or raised
// on embankments as they need; the great pyramid, stepped, the Stairway's
// ramps cut into its west face and built up on it, the temple on its summit
// with the road through its door, and the Ring standing on two pillars in
// the gorge beyond; the river on the plateau, pouring off a lip of rock into
// the cenote, the Corkscrew's road on a shelf round the cenote's wall
// behind the falls, and the cave out at its foot; the Temple Halls round the
// last bend, roofed over the inner route, and the raised causeway round the
// outside of them; the plaza at the line; the jungle; the rain, and the
// lightning. Everything is checked against the space the road needs
// (titan/keepout.ts) and left out where it would stand in it.
//
// With the painted background (sheets J1 to J4), the same shapes take the
// painted surfaces: the jungle floor, the plaza's paving, the pyramid's
// limestone, the carved friezes on the temple, the Ring and the halls, the
// cenote's wet rock and the canopy; low storm clouds stand round the
// circuit, lit by the lightning, and each strike is the painted cloud with
// the bolt out of its belly.
import * as THREE from 'three';
import { moves } from './still';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pieceStarts, type CircuitDef } from '../../sim/circuit';
import { frameAt, makeFrame, type Track } from '../../sim/track';
import { STONE_RING } from '../../sim/tracks/monsoon';
import { paintedSurfaceMaterial, paintedTexture, paintedTrack, swapWhenPainted, UNTONE, type PaintedMaps, type PaintedSet } from './painted';
import { toonMaterial } from './palette';
import { trackMatrix } from './trackSpace';
import { KEEP_OUT } from './titan/keepout';
import { box, column, frustum, shrine, steppedPyramid, type Put } from './monsoonTemples';
import { buildRain } from './rain';

/** What the world builder hands over (world.ts's context has all of it, and the lightning). */
export interface JungleCtx {
  track: Track;
  group: THREE.Group;
  inRoad(g: THREE.BufferGeometry, step?: number): boolean;
  updates: Array<(time: number, camera: THREE.Camera) => void>;
  /** The switch between the plain look and the painted background. */
  swaps: Array<(painted: boolean) => void>;
  /** The painted background, if there is one, and what is shown only with it. */
  painted: PaintedSet | null;
  plainOnly: THREE.Object3D[];
  paintedOnly: THREE.Object3D[];
  /** Lightning: the sky and the light, `v` (0..1) toward `dir`. */
  flash(v: number, dir: THREE.Vector3): void;
}

/** The plaza round the line, paved (x0, z0, x1, z1). */
const PLAZA: [number, number, number, number] = [-210, -520, 210, 140];

/** A painted storm cloud: as painted, outside the fog, lit from inside by the lightning (uFlash) and faded by uOpacity. */
function stormCardMaterial(map: THREE.Texture, rect: [number, number, number, number]): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uRect: { value: new THREE.Vector4(...rect) }, uFlash: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform vec4 uRect;
      varying vec2 vUv;
      void main() {
        vUv = uRect.xy + uv * uRect.zw;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uFlash;
      uniform float uOpacity;
      varying vec2 vUv;
      ${UNTONE}
      void main() {
        vec4 t = texture2D(uMap, vUv);
        if (t.a < 0.01) discard;
        vec3 c = unTone(t.rgb);
        c += vec3(0.75, 0.78, 0.95) * uFlash * (0.25 + dot(c, vec3(0.6)));
        gl_FragColor = vec4(c, t.a * uOpacity);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

const f = makeFrame();
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

function hash2(x: number, z: number): number {
  const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
function mulberry(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = THREE.MathUtils.smoothstep;
const clamp = THREE.MathUtils.clamp;

function rangeOf(track: Track, starts: number[], name: string): [number, number] | null {
  const def = track.def as CircuitDef;
  const i = def.pieces.findIndex((p) => p.name === name);
  if (i < 0) return null;
  return [starts[i], i + 1 < starts.length ? starts[i + 1] : track.length];
}

// ---- the lie of the land -------------------------------------------------------------

/** A height grid: its corner, spacing, size and heights. */
export interface Grid {
  x0: number;
  z0: number;
  cell: number;
  nx: number;
  nz: number;
  h: Float32Array;
}

function sampleGrid(g: Grid, x: number, z: number): number {
  const fx = (x - g.x0) / g.cell;
  const fz = (z - g.z0) / g.cell;
  if (fx < 0 || fz < 0 || fx >= g.nx - 1 || fz >= g.nz - 1) return NaN;
  const i = Math.floor(fx);
  const k = Math.floor(fz);
  const tx = fx - i;
  const tz = fz - k;
  const a = g.h[k * g.nx + i];
  const b = g.h[k * g.nx + i + 1];
  const c = g.h[(k + 1) * g.nx + i];
  const d = g.h[(k + 1) * g.nx + i + 1];
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

/** Monsoon Ruins' ground and the great things on it, worked out from the road. */
export interface Monsoon {
  /** The ground's height at (x, z): the jungle floor, the plateau, the pyramid; in the cenote, its pool's bed. */
  groundAt(x: number, z: number): number;
  /** The jungle floor and the plateau. */
  land: Grid;
  /** The pyramid, on a finer grid (where it is no higher than the land, there is none). */
  pyramid: Grid;
  /** Its summit: the road's height across it, and the frame along it (`u` east across, `v` to its right). */
  summit: { y: number; o: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3 };
  /** The plateau's ground, away from the roads. */
  plateau: number;
  /** Is (x, z) on the plateau (0..1, its cliffs between). */
  onPlateau(x: number, z: number): number;
  /** The cenote: its middle, the rim's and the pool's heights, its wall's radius at a height, and the lip the falls pour off. */
  cenote: {
    cx: number;
    cz: number;
    rim: number;
    pool: number;
    wallR(y: number): number;
    /** The lip: round from a0 to a1 (radians, atan2(z, x) from the middle), out to radius `r` (where the falls drop), its underside and top. */
    lip: { a0: number; a1: number; r: number; under: number; top: number };
  };
  /** The river, from the north to the cenote's lip: its middle line, and its surface. */
  river: THREE.Vector3[];
}

const cache = new WeakMap<Track, Monsoon | null>();

/** Monsoon Ruins' land, if this is Monsoon Ruins (it has a Waterfall Corkscrew); null otherwise. */
export function monsoonOf(track: Track): Monsoon | null {
  if (cache.has(track)) return cache.get(track)!;
  const m = findMonsoon(track);
  cache.set(track, m);
  return m;
}

/** The lanes of road at a sample: where across it each lies (its middle), its half width and its deck's height over the centre line's. */
function lanes(track: Track, i: number): Array<{ d: number; half: number; rise: number }> {
  const hw = track.hw[i];
  const m = track.median[i];
  const sL = track.shiftL[i], rL = track.riseL[i], sR = track.shiftR[i], rR = track.riseR[i];
  if (m < 0.01 && sL === 0 && sR === 0 && rL === 0 && rR === 0) return [{ d: 0, half: hw, rise: 0 }];
  const half = (hw - m) / 2;
  const mid = (hw + m) / 2;
  return [
    { d: -mid + sL, half, rise: rL },
    { d: mid + sR, half, rise: rR },
  ];
}

function findMonsoon(track: Track): Monsoon | null {
  const def = track.def as CircuitDef;
  if (!('pieces' in def)) return null;
  const starts = pieceStarts(def);
  const range = (name: string) => rangeOf(track, starts, name);
  const cork = range('the Waterfall Corkscrew');
  const summitR = range('the summit');
  const stair = range('the Stairway');
  const lipR = range('lip');
  if (!cork || !summitR || !stair || !lipR) return null;
  const n = track.n;
  const idx = (s: number) => ((Math.round(s / track.ds) % n) + n) % n;
  const isGap = (i: number) => !track.roadL[i] && !track.roadR[i];

  // ---- the cenote: centred where the Corkscrew turns round ----
  frameAt(track, cork[0] + 1, f);
  const rl = Math.hypot(f.rx, f.rz) || 1;
  const r0 = (() => {
    // The Corkscrew's own radius at its start, from its curvature.
    const k = Math.abs(track.kappa[idx(cork[0] + 20)]);
    return k > 1e-5 ? 1 / k : 105;
  })();
  const cx = f.px + (f.rx / rl) * r0;
  const cz = f.pz + (f.rz / rl) * r0;
  /** The plateau's ground, away from the roads (the cenote's rim). */
  const plateau = 123;
  const rim = Math.max(plateau, track.py[idx(cork[0])] + 3);
  const bottom = track.py[idx(cork[1])];
  const pool = bottom - 20;
  // The wall stands just outside the road's space all the way down: by
  // height, the Corkscrew's outer reach there and a margin.
  const wallY: number[] = [];
  const wallRr: number[] = [];
  for (let s = cork[0]; s <= cork[1]; s += track.ds) {
    const i = idx(s);
    const r = Math.hypot(track.px[i] - cx, track.pz[i] - cz);
    wallY.push(track.py[i]);
    wallRr.push(r + track.hw[i] + KEEP_OUT.side + 4);
  }
  // (Descending: walk it from the foot up.) At each height, the widest the
  // road reaches within a few metres of it (where it levels off at the foot,
  // it is at much the same height for a long way round).
  wallY.reverse();
  wallRr.reverse();
  const env = wallRr.map((_, k) => {
    let r = 0;
    for (let j = 0; j < wallY.length; j++) if (Math.abs(wallY[j] - wallY[k]) < 6) r = Math.max(r, wallRr[j]);
    return r + 1.5;
  });
  wallRr.splice(0, wallRr.length, ...env);
  const wallR = (y: number) => {
    if (y <= wallY[0]) return wallRr[0];
    if (y >= wallY[wallY.length - 1]) return wallRr[wallRr.length - 1];
    let lo = 0;
    let hi = wallY.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (wallY[mid] <= y) lo = mid;
      else hi = mid;
    }
    const t = (y - wallY[lo]) / Math.max(1e-6, wallY[hi] - wallY[lo]);
    return wallRr[lo] + (wallRr[hi] - wallRr[lo]) * t;
  };
  const holeR = wallR(rim) + 2;
  // The lip: on the side away from where the road comes in over the rim, round
  // to the north; the falls drop from it inside every turn's space below.
  const angle = (x: number, z: number) => Math.atan2(z - cz, x - cx);
  const inArc = (a: number, a0: number, a1: number) => {
    const t = (((a - a0) % TAU) + TAU) % TAU;
    return t <= (((a1 - a0) % TAU) + TAU) % TAU;
  };
  const a0 = (-90 - 10) * (Math.PI / 180);
  const a1 = (-90 + 28) * (Math.PI / 180);
  const outR = wallR(rim) + 4;
  let inner = Infinity;
  let over = -Infinity;
  for (let s = cork[0] - 240; s <= cork[1] + 40; s += track.ds) {
    const i = idx(s);
    const a = angle(track.px[i], track.pz[i]);
    const r = Math.hypot(track.px[i] - cx, track.pz[i] - cz);
    const reach = track.hw[i] + KEEP_OUT.side;
    // Does this sample's space reach over the lip (round it, and across it)?
    const span = Math.asin(Math.min(1, (reach + 2) / Math.max(r, 1)));
    if (r - reach > outR + 2 || !inArc(a, a0 - span, a1 + span)) continue;
    // Round the road's space, tipped with its bank: its inside top corner reaches furthest in, its outside top highest up.
    const tilt = Math.asin(clamp(Math.hypot(track.ux[i], track.uz[i]), 0, 1));
    inner = Math.min(inner, r - reach * Math.cos(tilt) - KEEP_OUT.up * Math.sin(tilt));
    over = Math.max(over, track.py[i] + reach * Math.sin(tilt) + KEEP_OUT.up * Math.cos(tilt));
  }
  const lip = { a0, a1, r: inner - 4, under: over + 2, top: over + 9 };

  // ---- the summit, and the pyramid's measures ----
  frameAt(track, summitR[0] + 1, f);
  const u = v3(f.tx, 0, f.tz).normalize();
  const vv = v3(-u.z, 0, u.x);
  const o = v3(f.px, f.py, f.pz);
  const summitY = f.py;
  const aOf = (x: number, z: number) => (x - o.x) * u.x + (z - o.z) * u.z;
  const bOf = (x: number, z: number) => (x - o.x) * vv.x + (z - o.z) * vv.z;
  // The west face: a plane through the ramps' middles.
  let sa = 0, sy = 0, saa = 0, say = 0, cnt = 0;
  let bMin = Infinity, bMax = -Infinity, aMin = Infinity;
  const ramps = ['the Stairway', 'second ramp', 'top ramp'].map(range).filter((r): r is [number, number] => !!r);
  for (const [r0s, r1s] of ramps) {
    for (let s = r0s; s < r1s; s += track.ds) {
      const i = idx(s);
      const a = aOf(track.px[i], track.pz[i]);
      sa += a;
      sy += track.py[i];
      saa += a * a;
      say += a * track.py[i];
      cnt++;
    }
  }
  for (let s = stair[0]; s < summitR[1]; s += track.ds) {
    const i = idx(s);
    const b = bOf(track.px[i], track.pz[i]);
    bMin = Math.min(bMin, b - track.hw[i]);
    bMax = Math.max(bMax, b + track.hw[i]);
    aMin = Math.min(aMin, aOf(track.px[i], track.pz[i]) - track.hw[i]);
  }
  const beta = (cnt * say - sa * sy) / (cnt * saa - sa * sa);
  const alpha = (sy - beta * sa) / cnt;
  frameAt(track, lipR[0], f);
  const aEdge = aOf(f.px, f.pz);
  const top = summitY - 6.5;
  const TIER = 7;
  const profile = (x: number, z: number) => {
    const a = aOf(x, z);
    const b = bOf(x, z);
    const west = alpha + beta * a;
    const east = top - (a - aEdge) * 2.6;
    const north = (b - (bMin - 50)) * 1.5;
    const south = (bMax + 50 - b) * 1.5;
    return Math.min(top, west, east, north, south);
  };

  // ---- the plateau ----
  const westEdge = (z: number) => 1195 + (vnoise(z / 90, 3.1) - 0.5) * 30;
  const southEdge = (x: number) => 445 + (vnoise(x / 90, 7.7) - 0.5) * 30;
  // (Placed by the road: the plateau starts at the Leap's landing, east of the gorge, and ends south of the cenote.)
  frameAt(track, range('landing')![0], f);
  const westAt = f.px - 6;
  const southAt = cz + holeR + 60;
  const onPlateau = (x: number, z: number) => clamp((x - (westEdge(z) - 1195 + westAt)) / 16, 0, 1) * clamp((southEdge(x) - 445 + southAt - z) / 16, 0, 1);
  const lowland = (x: number, z: number) => 8 + (vnoise(x / 180, z / 180) - 0.5) * 10 + (vnoise(x / 40, z / 40) - 0.5) * 3;
  const hills = (x: number, z: number) => plateau + (vnoise(x / 150, z / 150) - 0.5) * 8 + (vnoise(x / 35, z / 35) - 0.5) * 2;

  // ---- the river: from the north, along the plateau west of the road, to the lip ----
  const lipMid = (a0 + a1) / 2;
  const lipAt = (r: number) => v3(cx + Math.cos(lipMid) * r, 0, cz + Math.sin(lipMid) * r);
  const riverPath: THREE.Vector3[] = [];
  {
    const along = range('along the river')!;
    frameAt(track, along[0] + 60, f);
    const west = v3(f.rx, 0, f.rz).normalize(); // the road's right, heading south: west
    const x0 = f.px + west.x * 70;
    const pts = [v3(x0 - 40, 0, f.pz - 900), v3(x0 - 10, 0, f.pz - 400), v3(x0, 0, f.pz), v3(x0 + 10, 0, (f.pz + lipAt(holeR + 80).z) / 2), lipAt(holeR + 80), lipAt(holeR - 10)];
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    // Its surface falling gently to the lip (under the road where it crosses it at T3).
    const all = curve.getSpacedPoints(160);
    all.forEach((p, k) => riverPath.push(p.setY(lip.top + 0.3 + (1 - k / (all.length - 1)) * 1.5)));
  }

  // ---- the jungle floor and the plateau, on a grid ----
  let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
  for (let i = 0; i < n; i++) {
    bx0 = Math.min(bx0, track.px[i]);
    bx1 = Math.max(bx1, track.px[i]);
    bz0 = Math.min(bz0, track.pz[i]);
    bz1 = Math.max(bz1, track.pz[i]);
  }
  const cell = 12;
  const pad = 900;
  const gx0 = Math.floor((bx0 - pad) / cell) * cell;
  const gz0 = Math.floor((bz0 - pad) / cell) * cell;
  const nx = Math.ceil((bx1 - bx0 + 2 * pad) / cell) + 1;
  const nz = Math.ceil((bz1 - bz0 + 2 * pad) / cell) + 1;
  const h = new Float32Array(nx * nz);
  const base = (x: number, z: number) => {
    const p = onPlateau(x, z);
    return lowland(x, z) * (1 - p) + hills(x, z) * p;
  };
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) h[k * nx + i] = base(gx0 + i * cell, gz0 + k * cell);
  const land: Grid = { x0: gx0, z0: gz0, cell, nx, nz, h };
  const inCenote = (x: number, z: number, margin = 0) => Math.hypot(x - cx, z - cz) < holeR + margin;

  /**
   * Stamp every road into a grid: raise the ground under it to just below
   * its deck and in a bank round it (not in the cenote, nor over a gap), then
   * lower the ground round it to below its deck and in a cutting's sides.
   */
  const stamp = (g: Grid, fillSlope: number, cutSlope: number, only?: (i: number) => boolean) => {
    const fill = new Float32Array(g.nx * g.nz).fill(-Infinity);
    const cut = new Float32Array(g.nx * g.nz).fill(Infinity);
    const visit = (px: number, pz: number, reach: number, fn: (o: number, x: number, z: number) => void) => {
      const i0 = Math.max(0, Math.floor((px - reach - g.x0) / g.cell));
      const i1 = Math.min(g.nx - 1, Math.ceil((px + reach - g.x0) / g.cell));
      const k0 = Math.max(0, Math.floor((pz - reach - g.z0) / g.cell));
      const k1 = Math.min(g.nz - 1, Math.ceil((pz + reach - g.z0) / g.cell));
      for (let k = k0; k <= k1; k++) for (let q = i0; q <= i1; q++) fn(k * g.nx + q, g.x0 + q * g.cell, g.z0 + k * g.cell);
    };
    for (let i = 0; i < n; i++) {
      if (isGap(i) || (only && !only(i))) continue;
      const tl = Math.hypot(track.tx[i], track.tz[i]) || 1;
      const tx = track.tx[i] / tl, tz = track.tz[i] / tl;
      // Across the road, level, and how much it rises (a bank) per unit across.
      const lh = Math.hypot(track.rx[i], track.rz[i]) || 1;
      const rx = track.rx[i] / lh, rz = track.rz[i] / lh;
      const tilt = track.ry[i] / lh;
      for (const ln of lanes(track, i)) {
        const mx = track.px[i] + track.rx[i] * ln.d + track.ux[i] * ln.rise;
        const my = track.py[i] + track.ry[i] * ln.d + track.uy[i] * ln.rise;
        const mz = track.pz[i] + track.rz[i] * ln.d + track.uz[i] * ln.rise;
        const half = ln.half * lh;
        /** The deck's height level with a point `a` across from the lane's middle (its plane's, out to the edge of its space). */
        const deckAt = (a: number) => my + clamp(a, -half - KEEP_OUT.side - 1, half + KEEP_OUT.side + 1) * tilt;
        // Cut, all round: below the deck across its space and a cell past it
        // (so the ground between the grid's points stays out of it too), then
        // the cutting's sides.
        const edge = half + KEEP_OUT.side + g.cell + 1;
        visit(mx, mz, edge + 160 / cutSlope, (o, x, z) => {
          const dd = Math.max(0, Math.hypot(x - mx, z - mz) - edge);
          const y = deckAt((x - mx) * rx + (z - mz) * rz) - 1.2 + dd * cutSlope;
          if (y < cut[o]) cut[o] = y;
        });
        if (inCenote(track.px[i], track.pz[i], 30)) continue;
        // Fill, square to the road only (so it stops short at a gap's edge).
        const reach = half + 2 + 140 / fillSlope;
        visit(mx, mz, reach, (o, x, z) => {
          const along = (x - mx) * tx + (z - mz) * tz;
          if (Math.abs(along) > track.ds * 0.75 + g.cell * 0.5) return;
          const a = (x - mx) * rx + (z - mz) * rz;
          const y = deckAt(a) - 1.6 - Math.max(0, Math.abs(a) - half - 2) * fillSlope;
          if (y > fill[o]) fill[o] = y;
        });
      }
    }
    return { fill, cut };
  };
  {
    const { fill, cut } = stamp(land, 1.3, 1.6);
    // The river's bed, in a channel through the plateau.
    for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) {
        const o = k * nx + i;
        const x = gx0 + i * cell;
        const z = gz0 + k * cell;
        let y = Math.max(h[o], fill[o]);
        if (inCenote(x, z)) y = pool - 2;
        y = Math.min(y, cut[o]);
        h[o] = y;
      }
    }
    for (const p of riverPath) {
      const reach = 60;
      const i0 = Math.max(0, Math.floor((p.x - reach - gx0) / cell));
      const i1 = Math.min(nx - 1, Math.ceil((p.x + reach - gx0) / cell));
      const k0 = Math.max(0, Math.floor((p.z - reach - gz0) / cell));
      const k1 = Math.min(nz - 1, Math.ceil((p.z + reach - gz0) / cell));
      for (let k = k0; k <= k1; k++)
        for (let i = i0; i <= i1; i++) {
          const o = k * nx + i;
          const d = Math.hypot(gx0 + i * cell - p.x, gz0 + k * cell - p.z);
          const y = p.y - 4 + Math.max(0, d - 16) * 0.5;
          if (y < h[o] && !inCenote(gx0 + i * cell, gz0 + k * cell)) h[o] = Math.min(h[o], y);
        }
    }
  }

  // ---- the pyramid, finer ----
  let pa0 = Infinity, pa1 = -Infinity, pz0 = Infinity, pz1 = -Infinity;
  for (let s = stair[0] - 120; s < lipR[1]; s += track.ds) {
    const i = idx(s);
    pa0 = Math.min(pa0, track.px[i]);
    pa1 = Math.max(pa1, track.px[i]);
    pz0 = Math.min(pz0, track.pz[i]);
    pz1 = Math.max(pz1, track.pz[i]);
  }
  const pcell = 4;
  const ppad = 110;
  const px0 = Math.floor((pa0 - ppad) / pcell) * pcell;
  const ppz0 = Math.floor((pz0 - ppad) / pcell) * pcell;
  const pnx = Math.ceil((pa1 - pa0 + 2 * ppad) / pcell) + 1;
  const pnz = Math.ceil((pz1 - pz0 + 2 * ppad) / pcell) + 1;
  const ph = new Float32Array(pnx * pnz);
  const pyramid: Grid = { x0: px0, z0: ppz0, cell: pcell, nx: pnx, nz: pnz, h: ph };
  {
    const near = (i: number) => {
      const x = track.px[i], z = track.pz[i];
      return x > px0 - 60 && x < px0 + pnx * pcell + 60 && z > ppz0 - 60 && z < ppz0 + pnz * pcell + 60;
    };
    const { fill, cut } = stamp(pyramid, 2.4, 2.4, near);
    for (let k = 0; k < pnz; k++) {
      for (let i = 0; i < pnx; i++) {
        const o = k * pnx + i;
        const x = px0 + i * pcell;
        const z = ppz0 + k * pcell;
        const p = profile(x, z);
        const ground = sampleGrid(land, x, z);
        // Stepped, and the ramps' banks of stone built up on it; then cut round every road.
        let y = Math.max(Math.floor(p / TIER) * TIER, fill[o] > ground ? fill[o] : -Infinity);
        y = Math.min(y, cut[o]);
        ph[o] = y;
      }
    }
  }

  const groundAt = (x: number, z: number) => {
    if (inCenote(x, z)) return pool - 2;
    const g = sampleGrid(land, x, z);
    const ground = Number.isNaN(g) ? base(x, z) : g;
    const p = sampleGrid(pyramid, x, z);
    return Number.isNaN(p) ? ground : Math.max(ground, p);
  };
  return {
    groundAt,
    land,
    pyramid,
    summit: { y: summitY, o, u, v: vv },
    plateau,
    onPlateau,
    cenote: { cx, cz, rim, pool, wallR, lip },
    river: riverPath,
  };
}

// ---- materials and pieces -------------------------------------------------------------

function colour(g: THREE.BufferGeometry, c: number | THREE.Color): THREE.BufferGeometry {
  const col = c instanceof THREE.Color ? c : new THREE.Color(c);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = col.r;
    a[i * 3 + 1] = col.g;
    a[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** A box with its own frame: centre, the directions of its width, height and depth, and those sizes. */
function block(c: THREE.Vector3, ax: THREE.Vector3, ay: THREE.Vector3, az: THREE.Vector3, w: number, h: number, d: number): THREE.BufferGeometry {
  return box(c, ax, ay, az, w, h, d);
}

/** Triangles from a list of corner quads (a, b, c, d in order round), as one geometry. */
function quads(list: THREE.Vector3[][]): THREE.BufferGeometry | null {
  if (!list.length) return null;
  const pos: number[] = [];
  for (const [a, b, c, d] of list) for (const p of [a, b, c, a, c, d]) pos.push(p.x, p.y, p.z);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Running water: a pale surface with streaks moving along it (v), and foam where it breaks. */
function waterMaterial(o: { deep: number; foam: number; speed: number; streak: number; alpha: number; fall?: boolean }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uDeep: { value: new THREE.Color(o.deep) }, uFoam: { value: new THREE.Color(o.foam) } }]),
    vertexShader: /* glsl */ `
      attribute vec2 flow;
      varying vec2 vFlow;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vFlow = flow;
        vec4 mvPosition = viewMatrix * modelMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uFoam;
      varying vec2 vFlow;
      #include <common>
      #include <fog_pars_fragment>
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec2 q = vec2(vFlow.x * ${o.streak.toFixed(2)}, vFlow.y * 0.08 - uTime * ${o.speed.toFixed(2)});
        float s = n2(q) * 0.65 + n2(q * vec2(2.3, 1.7) + 3.1) * 0.35;
        float foam = smoothstep(0.55, 0.8, s);
        vec3 col = mix(uDeep, uFoam, foam * 0.85);
        float a = ${o.alpha.toFixed(2)} ${o.fall ? '* (0.55 + 0.45 * s)' : ''};
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
}

/** A ribbon along a path (each point a middle), `width` across, its flow coordinate (across, along) for the water. */
function ribbon(path: THREE.Vector3[], width: (k: number) => number, up = v3(0, 1, 0)): THREE.BufferGeometry {
  const pos: number[] = [];
  const flow: number[] = [];
  let along = 0;
  const side = (k: number) => {
    const a = path[Math.max(0, k - 1)];
    const b = path[Math.min(path.length - 1, k + 1)];
    return v3().crossVectors(b.clone().sub(a), up).normalize().multiplyScalar(width(k) / 2);
  };
  for (let k = 0; k + 1 < path.length; k++) {
    const a = path[k];
    const b = path[k + 1];
    const sa = side(k);
    const sb = side(k + 1);
    const l = a.distanceTo(b);
    const quad = [a.clone().sub(sa), a.clone().add(sa), b.clone().add(sb), b.clone().sub(sb)];
    const fl = [
      [-1, along],
      [1, along],
      [1, along + l],
      [-1, along + l],
    ];
    for (const q of [0, 1, 2, 0, 2, 3]) {
      pos.push(quad[q].x, quad[q].y, quad[q].z);
      flow.push(fl[q][0] * width(k) * 0.5, fl[q][1]);
    }
    along += l;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('flow', new THREE.Float32BufferAttribute(flow, 2));
  g.computeVertexNormals();
  return g;
}

/** Monsoon Ruins' sign over the road at the foot of the Stairway, as the plain look letters it. */
function monsoonSign(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 200;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2a2f38';
  g.fillRect(0, 0, 640, 200);
  g.strokeStyle = '#d8a83a';
  g.lineWidth = 4;
  g.strokeRect(10, 10, 620, 180);
  const band = g.createLinearGradient(40, 0, 600, 0);
  band.addColorStop(0, '#d8a83a');
  band.addColorStop(1, '#c8643a');
  g.fillStyle = band;
  g.fillRect(40, 142, 560, 14);
  g.fillStyle = '#eee8d8';
  let size = 92;
  g.font = `bold ${size}px "Arial Black", Impact, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  while (g.measureText('MONSOON RUINS').width > 560 && size > 30) {
    size -= 4;
    g.font = `bold ${size}px "Arial Black", Impact, sans-serif`;
  }
  g.fillText('MONSOON RUINS', 320, 80);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---- the world ------------------------------------------------------------------------

export function buildMonsoon(ctx: JungleCtx): void {
  const { track, group } = ctx;
  const land = monsoonOf(track);
  if (!land) return;
  const def = track.def as CircuitDef;
  const starts = pieceStarts(def);
  const range = (name: string) => rangeOf(track, starts, name);
  const rnd = mulberry(8123);
  const n = track.n;
  const idx = (s: number) => ((Math.round(s / track.ds) % n) + n) % n;
  const { cenote } = land;
  const { cx, cz } = cenote;
  const stone: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  // (The carved stone, apart so the painted look can carve it: the temple's lintel and comb, the Ring.)
  const carved: THREE.BufferGeometry[] = [];
  // (The lintel's lit glyphs: the painted frieze carves its own.)
  const lintelGlow: THREE.BufferGeometry[] = [];
  // (Doorways and the dark behind them.)
  const dark: THREE.BufferGeometry[] = [];
  const keep = (g: THREE.BufferGeometry, c: number | THREE.Color, step = 3, list = stone) => {
    if (ctx.inRoad(g, step)) return false;
    list.push(colour(g, c));
    return true;
  };
  // The temples' pieces (monsoonTemples.ts), each to its list by kind.
  const put: Put = (g, c, kind) => keep(g, c, 2, kind === 'carved' ? carved : kind === 'dark' ? dark : stone);
  const frameOf = (s: number) => {
    frameAt(track, s, f);
    return { p: v3(f.px, f.py, f.pz), t: v3(f.tx, f.ty, f.tz), r: v3(f.rx, f.ry, f.rz), u: v3(f.ux, f.uy, f.uz) };
  };
  const pyrAt = (x: number, z: number) => {
    const p = sampleGrid(land.pyramid, x, z);
    return Number.isNaN(p) ? -Infinity : p;
  };
  // The painted surfaces (J4), each texture loaded once.
  const S = ctx.painted?.surfaces;
  const maps: PaintedMaps = new Map();
  // (`gain` brightens the painting to stand up to the storm's dim light as the pale plain colours do.)
  const paint = (mesh: THREE.Mesh | THREE.Mesh[], wall: string, top: string, wallSize: number, topSize: number, gain: number, side: THREE.Side = THREE.FrontSide, dip = 0) => {
    if (!S?.[wall] || !S[top]) return;
    swapWhenPainted(
      ctx.swaps,
      mesh,
      [S[wall], S[top]],
      ([w, t]) => {
        const m = paintedSurfaceMaterial(w, t, wallSize, topSize, side, { toon: true, dip });
        m.color.setScalar(gain);
        return m;
      },
      maps,
    );
  };

  // ---- the jungle floor and the plateau ----
  {
    const { x0, z0, cell, nx, nz, h } = land.land;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const floor = new THREE.Color(0x3d5a2c);
    const moss = new THREE.Color(0x56763a);
    const mud = new THREE.Color(0x5a4a34);
    const rock = new THREE.Color(0x6a6458);
    const wet = new THREE.Color(0x2a3328);
    const paving = new THREE.Color(0x8e8a78);
    const c = new THREE.Color();
    for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) {
        const o = k * nx + i;
        const x = x0 + i * cell;
        const z = z0 + k * cell;
        pos[o * 3] = x;
        pos[o * 3 + 1] = h[o];
        pos[o * 3 + 2] = z;
        const sx = (h[Math.min(o + 1, k * nx + nx - 1)] - h[Math.max(o - 1, k * nx)]) / (2 * cell);
        const sz = (h[Math.min(o + nx, nx * nz - 1)] - h[Math.max(o - nx, 0)]) / (2 * cell);
        const steep = clamp(Math.hypot(sx, sz) * 0.9, 0, 1);
        const base = h[o] > 60 ? moss : floor;
        const plaza = x > PLAZA[0] && x < PLAZA[2] && z > PLAZA[1] && z < PLAZA[3];
        c.copy(plaza ? paving : base).lerp(mud, vnoise(x / 70, z / 70) * 0.35).lerp(rock, smooth(steep, 0.35, 0.8)).lerp(wet, h[o] < cenote.pool + 2 ? 0.8 : 0);
        c.multiplyScalar(0.88 + vnoise(x / 11, z / 11) * 0.24);
        col[o * 3] = c.r;
        col[o * 3 + 1] = c.g;
        col[o * 3 + 2] = c.b;
      }
    }
    const tris: number[] = [];
    for (let k = 0; k + 1 < nz; k++)
      for (let i = 0; i + 1 < nx; i++) {
        const a = k * nx + i;
        // (Not across the cenote's mouth: its wall stands there.)
        const inside = [a, a + 1, a + nx, a + nx + 1].filter((q) => Math.hypot(pos[q * 3] - cx, pos[q * 3 + 2] - cz) < cenote.wallR(cenote.rim) + 2).length;
        if (inside > 0 && inside < 4) continue;
        tris.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(tris);
    g.computeVertexNormals();
    const mat = toonMaterial({ color: 0xffffff });
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = 'jungle floor';
    group.add(mesh);
    // The floor beyond, out into the rain.
    const W = (nx - 1) * cell;
    const D = (nz - 1) * cell;
    const out: THREE.BufferGeometry[] = [];
    const slab = (ax: number, az: number, bx: number, bz: number) => {
      const s = new THREE.PlaneGeometry(bx - ax, bz - az).rotateX(-Math.PI / 2).toNonIndexed();
      s.deleteAttribute('uv');
      s.translate((ax + bx) / 2, 6, (az + bz) / 2);
      out.push(colour(s, floor.clone().multiplyScalar(0.85)));
    };
    const F = 20000;
    slab(x0 - F, z0 - F, x0 + W + F, z0);
    slab(x0 - F, z0 + D, x0 + W + F, z0 + D + F);
    slab(x0 - F, z0, x0, z0 + D);
    slab(x0 + W, z0, x0 + W + F, z0 + D);
    const far = new THREE.Mesh(mergeGeometries(out), mat);
    far.name = 'jungle floor beyond';
    group.add(far);
    // Painted: the leaf litter on top, wet rock down the steep banks, the plaza paved.
    if (S?.floor && S.cenote && S.paving)
      swapWhenPainted(
        ctx.swaps,
        [mesh, far],
        [S.cenote, S.floor, S.paving],
        ([w, t, pv]) => {
          const m = paintedSurfaceMaterial(w, t, 30, 20, THREE.FrontSide, { toon: true, dip: 0.6, patch: { map: pv, size: 14, rect: PLAZA, edge: 10 } });
          m.color.setScalar(1.3);
          return m;
        },
        maps,
      );
  }

  // ---- the pyramid ----
  {
    const { x0, z0, cell, nx, nz, h } = land.pyramid;
    const tris: number[] = [];
    const pos: number[] = [];
    const col: number[] = [];
    const lime = new THREE.Color(0xc8c2a6);
    const dark = new THREE.Color(0x5a5646);
    const moss = new THREE.Color(0x6a7c48);
    const paved = new THREE.Color(0xd2ccb4);
    const c = new THREE.Color();
    const above = new Uint8Array(nx * nz);
    for (let k = 0; k < nz; k++)
      for (let i = 0; i < nx; i++) {
        const o = k * nx + i;
        const x = x0 + i * cell;
        const z = z0 + k * cell;
        above[o] = h[o] > land.groundAt(x, z) - 0.25 && h[o] > sampleGrid(land.land, x, z) + 0.5 ? 1 : 0;
      }
    const vert = new Int32Array(nx * nz).fill(-1);
    const vertex = (i: number, k: number) => {
      const o = k * nx + i;
      if (vert[o] >= 0) return vert[o];
      const x = x0 + i * cell;
      const z = z0 + k * cell;
      const y = Math.max(h[o], sampleGrid(land.land, x, z) - 1);
      vert[o] = pos.length / 3;
      pos.push(x, y, z);
      // The risers dark, the treads pale and mossy, the ramps' paving lighter.
      const sx = (h[Math.min(o + 1, k * nx + nx - 1)] - h[Math.max(o - 1, k * nx)]) / (2 * cell);
      const sz = (h[Math.min(o + nx, nx * nz - 1)] - h[Math.max(o - nx, 0)]) / (2 * cell);
      const steep = clamp(Math.hypot(sx, sz) * 0.5, 0, 1);
      const tier = Math.abs(y / 7 - Math.round(y / 7)) < 0.02;
      c.copy(tier ? lime : paved).lerp(dark, smooth(steep, 0.4, 1.2)).lerp(moss, smooth(vnoise(x / 23, z / 23), 0.5, 0.9) * 0.4);
      // Each tier a shade off the next, so the steps read from afar.
      c.multiplyScalar((tier && Math.round(y / 7) % 2 ? 0.84 : 1) * (0.92 + vnoise(x / 5, z / 5) * 0.14));
      col.push(c.r, c.g, c.b);
      return vert[o];
    };
    for (let k = 0; k + 1 < nz; k++)
      for (let i = 0; i + 1 < nx; i++) {
        const a = k * nx + i;
        if (!above[a] && !above[a + 1] && !above[a + nx] && !above[a + nx + 1]) continue;
        const va = vertex(i, k), vb = vertex(i + 1, k), vc = vertex(i, k + 1), vd = vertex(i + 1, k + 1);
        tris.push(va, vc, vb, vb, vc, vd);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(tris);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, toonMaterial({ color: 0xffffff }));
    mesh.name = 'pyramid';
    group.add(mesh);
    // Painted: the limestone courses up the risers (a course to a tier), paving on the treads and the ramps.
    paint(mesh, 'limestone', 'paving', 7, 14, 1.7);
  }

  // ---- the temple on the summit, the road through its door ----
  const summit = range('the summit');
  if (summit) {
    const s = (summit[0] + summit[1]) / 2;
    const F = frameOf(s);
    const half = track.hw[idx(s)] + KEEP_OUT.side + 2;
    const deck = F.p.y;
    const along = v3(F.t.x, 0, F.t.z).normalize();
    const across = v3(F.r.x, 0, F.r.z).normalize();
    const up = v3(0, 1, 0);
    const DEPTH = 46;
    const WALL = 26;
    const DOOR = 24;
    const tone = new THREE.Color(0x9a967e);
    const at = (x: number, y: number, z = 0) => F.p.clone().addScaledVector(across, x).setY(deck + y).addScaledVector(along, z);
    const wallTop = DOOR + 4;
    for (const side of [-1, 1]) {
      const mid = side * (half + WALL / 2);
      // Its stepped platform, two steps, then the wall with a molding at its foot.
      put(box(at(side * (half + WALL / 2 + 3), -5), across, up, along, WALL + 6, 6, DEPTH + 12), tone.clone().multiplyScalar(0.8), 'stone');
      put(box(at(side * (half + WALL / 2 + 1.5), -1), across, up, along, WALL + 3, 2, DEPTH + 6), tone.clone().multiplyScalar(0.86), 'stone');
      put(box(at(mid, wallTop / 2), across, up, along, WALL, wallTop, DEPTH), tone, 'stone');
      put(box(at(side * (half + WALL / 2 + 0.6), 1.2), across, up, along, WALL + 1.2, 2.4, DEPTH + 2.4), tone.clone().multiplyScalar(0.84), 'stone');
      // A jamb either side of the door, carved, standing out from the wall's face.
      for (const end of [-1, 1]) put(box(at(side * (half + 2.2), DOOR / 2, end * (DEPTH / 2 + 0.6)), across, up, along, 4.4, DOOR, 1.6), tone.clone().multiplyScalar(0.92), 'carved');
      // Two dark doorways in each half's faces, front and back, with their lintels.
      for (const end of [-1, 1])
        for (const k of [0.3, 0.72]) {
          const x = side * (half + WALL * k);
          put(box(at(x, 6, end * (DEPTH / 2 - 0.4)), across, up, along, 4.2, 11, 1.6), new THREE.Color(0x10140f), 'dark');
          put(box(at(x, 12.6, end * (DEPTH / 2 + 0.3)), across, up, along, 6.4, 1.4, 0.8), tone.clone().multiplyScalar(0.88), 'carved');
        }
      // A carved band along the passage's walls.
      put(box(at(side * (half + 0.3), DOOR - 3, 0), across, up, along, 0.8, 3, DEPTH - 2), tone.clone().multiplyScalar(0.9), 'carved');
    }
    // Over the door and the two halves: the medial molding, the lintel's
    // carved band, the sloping upper face, the cornice, and the roof comb.
    const span = 2 * (half + WALL);
    put(box(at(0, wallTop + 0.6), across, up, along, span + 2, 1.2, DEPTH + 2), tone.clone().multiplyScalar(0.8), 'stone');
    put(box(at(0, wallTop + 3.6), across, up, along, span, 4.8, DEPTH), tone, 'carved');
    put(frustum(at(0, wallTop + 6), across, along, span + 1, DEPTH + 1, span - 10, DEPTH - 16, 9), tone.clone().multiplyScalar(0.95), 'carved');
    put(box(at(0, wallTop + 15.5), across, up, along, span - 9, 1.2, DEPTH - 15), tone.clone().multiplyScalar(0.8), 'stone');
    shrine(put, at(0, wallTop + 16), along, half * 1.6, 14, 18, tone.clone().multiplyScalar(0.92), true);
    const lintelY = deck + DOOR + 4;
    // A band of glyphs across the lintel, glowing faintly jade (the plain look; the painting carves its own).
    for (let k = -9; k <= 9; k++) {
      const g = block(F.p.clone().addScaledVector(across, k * (half / 5)).addScaledVector(along, -DEPTH / 2 - 0.4).setY(lintelY + 3.6 + (k % 2 ? 1.2 : -1.2)), across, up, along, 2.2, 2.2, 0.8);
      keep(g, 0x1f7a58, 2, lintelGlow);
    }
  }

  // ---- the Ring, on its pillars in the gorge ----
  const gap = range('gap');
  if (gap) {
    const s = (gap[0] + gap[1]) / 2;
    const F = frameOf(s);
    const centre = F.p.clone().addScaledVector(F.u, STONE_RING.lift);
    const axis = F.t.clone().normalize();
    const torus = new THREE.TorusGeometry(STONE_RING.radius, 3.6, 10, 64).toNonIndexed();
    torus.deleteAttribute('uv');
    torus.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), axis));
    torus.translate(centre.x, centre.y, centre.z);
    torus.computeVertexNormals();
    keep(torus, 0x8f8a72, 2, carved);
    // Carved blocks round it, and its glyphs lit.
    const across = F.r.clone().normalize();
    const upA = v3().crossVectors(axis, across).normalize();
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * TAU;
      const dir = across.clone().multiplyScalar(Math.cos(a)).addScaledVector(upA, Math.sin(a));
      const c = centre.clone().addScaledVector(dir, STONE_RING.radius + 3.4);
      const tang = v3().crossVectors(axis, dir);
      keep(block(c, tang, dir, axis, 7, 4, 9), k % 2 ? 0x777260 : 0x8f8a72, 2, carved);
      if (k % 2 === 0) keep(block(centre.clone().addScaledVector(dir, STONE_RING.radius - 3.2), tang, dir, axis, 4, 0.8, 5), 0x56f0b0, 2, glow);
    }
    // The pillars, from the gorge's floor to either side of it.
    for (const side of [-1, 1]) {
      const topP = centre.clone().addScaledVector(across, side * (STONE_RING.radius + 7));
      const foot = land.groundAt(topP.x, topP.z) - 4;
      const hgt = topP.y + 10 - foot;
      const c = v3(topP.x, foot + hgt / 2, topP.z);
      const fw = v3(axis.x, 0, axis.z).normalize();
      const sideways = v3(-fw.z, 0, fw.x);
      keep(block(c, sideways, v3(0, 1, 0), fw, 12, hgt, 14), 0x7e7a66);
      // Banded every so often.
      for (let y = foot + 20; y < topP.y; y += 26) keep(block(v3(topP.x, y, topP.z), sideways, v3(0, 1, 0), fw, 14, 3, 16), 0x6a6656);
      keep(block(v3(topP.x, topP.y + 12, topP.z), sideways, v3(0, 1, 0), fw, 16, 5, 18), 0x6a6656);
    }
  }

  // ---- the cenote: its wall, the shelf the Corkscrew runs on, the lip and the falls ----
  const cork = range('the Waterfall Corkscrew');
  if (cork) {
    const { pool, rim, wallR, lip } = cenote;
    // The wall, all the way round, in panels; left open where a road passes through it.
    const wall: THREE.Vector3[][] = [];
    const AZ = 3;
    const DY = 6;
    const at = (a: number, y: number, r = wallR(y)) => v3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
    const panels: THREE.BufferGeometry[] = [];
    for (let y = pool - 2; y < rim; y += DY) {
      const y1 = Math.min(rim, y + DY);
      for (let d = 0; d < 360; d += AZ) {
        const a = (d * Math.PI) / 180;
        const b = ((d + AZ) * Math.PI) / 180;
        // A little rough.
        const j = (q: number, yy: number) => 1.5 * (vnoise(q * 9, yy / 7) - 0.5);
        const quad = [at(a, y, wallR(y) + j(a, y)), at(b, y, wallR(y) + j(b, y)), at(b, y1, wallR(y1) + j(b, y1)), at(a, y1, wallR(y1) + j(a, y1))];
        const g = quads([quad]);
        if (g && !ctx.inRoad(g, 3)) {
          const band = 0.85 + 0.2 * Math.sin(y * 0.45 + vnoise(a * 3, y / 20) * 2);
          panels.push(colour(g, new THREE.Color(0x5e5a4c).lerp(new THREE.Color(0x46603a), vnoise(a * 5, y / 30) * 0.5).multiplyScalar(band)));
        }
        wall.push(quad);
      }
    }
    if (panels.length) {
      const m = new THREE.Mesh(mergeGeometries(panels), toonMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      m.name = 'cenote wall';
      group.add(m);
      paint(m, 'cenote', 'cenote', 26, 26, 1.35, THREE.DoubleSide, 0.4);
    }
    // The shelf under the road, round the wall: from the road's inside edge out to the wall, a slab of rock under the deck.
    const shelf: THREE.BufferGeometry[] = [];
    const shelfFrom = cork[0] - 120;
    let prev: THREE.Vector3[] | null = null;
    for (let s = shelfFrom; s <= cork[1] + 4; s += track.ds) {
      const i = idx(s);
      const p = v3(track.px[i], track.py[i], track.pz[i]);
      const out = v3(p.x - cx, 0, p.z - cz);
      const r = out.length();
      if (r > wallR(rim) + 10) {
        prev = null;
        continue;
      }
      out.normalize();
      const hw = track.hw[i];
      const rr = v3(track.rx[i], track.ry[i], track.rz[i]);
      const uu = v3(track.ux[i], track.uy[i], track.uz[i]);
      // Edges of the deck's underside, then down to the shelf's foot, out to the wall.
      const inTop = p.clone().addScaledVector(rr, -Math.sign(rr.dot(out)) * hw).addScaledVector(uu, -6.4);
      const outTop = p.clone().addScaledVector(rr, Math.sign(rr.dot(out)) * hw).addScaledVector(uu, -6.4);
      const wallTop = at(Math.atan2(p.z - cz, p.x - cx), outTop.y, wallR(outTop.y) + 1);
      // (Thin enough to keep out of the turn below's space, which its bank tips up toward the wall.)
      const foot = Math.max(pool, p.y - 15);
      const inFoot = inTop.clone().setY(foot + 4);
      const wallFoot = at(Math.atan2(p.z - cz, p.x - cx), foot, wallR(foot) + 1);
      const ring = [inTop, outTop, wallTop, wallFoot, inFoot];
      if (prev) {
        for (let q = 0; q < ring.length - 1; q++) {
          const g = quads([[prev[q], ring[q], ring[q + 1], prev[q + 1]]]);
          if (g && !ctx.inRoad(g, 3)) shelf.push(colour(g, new THREE.Color(0x56523f).multiplyScalar(0.8 + 0.25 * vnoise(s / 30, q))));
        }
      }
      prev = ring;
    }
    // The lip the river pours off: a tongue of rock out from the rim.
    {
      const tops: THREE.Vector3[][] = [];
      const STEPS = 14;
      for (let k = 0; k < STEPS; k++) {
        const a = lip.a0 + ((lip.a1 - lip.a0) * k) / STEPS;
        const b = lip.a0 + ((lip.a1 - lip.a0) * (k + 1)) / STEPS;
        const R1 = wallR(rim) + 4;
        // Top, underside and the front edge.
        tops.push([at(a, lip.top, lip.r), at(b, lip.top, lip.r), at(b, lip.top, R1), at(a, lip.top, R1)]);
        tops.push([at(a, lip.under, R1), at(b, lip.under, R1), at(b, lip.under, lip.r), at(a, lip.under, lip.r)]);
        tops.push([at(a, lip.under, lip.r), at(b, lip.under, lip.r), at(b, lip.top, lip.r), at(a, lip.top, lip.r)]);
      }
      for (const [a, y0, y1] of [
        [lip.a0, lip.under, lip.top],
        [lip.a1, lip.top, lip.under],
      ] as const) {
        tops.push([at(a, y0, lip.r), at(a, y1, lip.r), at(a, y1, wallR(rim) + 4), at(a, y0, wallR(rim) + 4)]);
      }
      const g = quads(tops);
      if (g) keep(g, 0x5a5646, 2, shelf);
    }
    if (shelf.length) {
      const m = new THREE.Mesh(mergeGeometries(shelf), toonMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      m.name = 'cenote shelf';
      group.add(m);
      paint(m, 'cenote', 'floor', 26, 20, 1.35, THREE.DoubleSide, 0.4);
    }
    // The falls: a curtain from the lip's edge to the pool, the pool, and the spray.
    {
      const pos: number[] = [];
      const flow: number[] = [];
      const STEPS = 18;
      const R = lip.r - 1.5;
      // Spreading as it falls, wider at the foot than at the lip.
      const spread = (yy: number) => 0.3 * (1 - (yy - pool) / (lip.top - pool));
      const azAt = (q: number, yy: number) => lip.a0 + 0.04 - spread(yy) + (lip.a1 - lip.a0 - 0.08 + 1.6 * spread(yy)) * q;
      for (let k = 0; k < STEPS; k++) {
        for (let y = pool; y < lip.top; y += 8) {
          const y1 = Math.min(lip.top, y + 8);
          const a = azAt(k / STEPS, y), b = azAt((k + 1) / STEPS, y);
          const a1 = azAt(k / STEPS, y1), b1 = azAt((k + 1) / STEPS, y1);
          // (Bowing out a little as it falls, then in.)
          const rr = (yy: number) => R - 3 * Math.sin(((lip.top - yy) / (lip.top - pool)) * Math.PI) ;
          const q = [at(a, y, rr(y)), at(b, y, rr(y)), at(b1, y1, rr(y1)), at(a1, y1, rr(y1))];
          const fl = [
            [(k / STEPS) * 40, -y],
            [((k + 1) / STEPS) * 40, -y],
            [((k + 1) / STEPS) * 40, -y1],
            [(k / STEPS) * 40, -y1],
          ];
          for (const t of [0, 1, 2, 0, 2, 3]) {
            pos.push(q[t].x, q[t].y, q[t].z);
            flow.push(fl[t][0], fl[t][1]);
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('flow', new THREE.Float32BufferAttribute(flow, 2));
      if (!ctx.inRoad(g, 3)) {
        const mat = waterMaterial({ deep: 0x9cc8c4, foam: 0xf2fbf8, speed: 2.6, streak: 0.35, alpha: 0.82, fall: true });
        const m = new THREE.Mesh(g, mat);
        m.name = 'the falls';
        m.renderOrder = 2;
        group.add(m);
        ctx.updates.push((time) => (mat.uniforms.uTime.value = time));
      }
      // The pool.
      const disc = new THREE.CircleGeometry(wallR(pool + 4) + 2, 72).rotateX(-Math.PI / 2).toNonIndexed();
      disc.deleteAttribute('uv');
      const dpos = disc.attributes.position as THREE.BufferAttribute;
      const dflow = new Float32Array(dpos.count * 2);
      for (let q = 0; q < dpos.count; q++) {
        const x = dpos.getX(q);
        const z = dpos.getZ(q);
        dflow[q * 2] = Math.atan2(z, x) * 30;
        dflow[q * 2 + 1] = -Math.hypot(x, z) * 4;
      }
      disc.setAttribute('flow', new THREE.BufferAttribute(dflow, 2));
      disc.translate(cx, pool + 1, cz);
      const pmat = waterMaterial({ deep: 0x2e5a50, foam: 0x9cc8bc, speed: 0.5, streak: 0.12, alpha: 0.92 });
      const pm = new THREE.Mesh(disc, pmat);
      pm.name = 'cenote pool';
      group.add(pm);
      ctx.updates.push((time) => (pmat.uniforms.uTime.value = time));
      // Spray where it lands, rising and drifting.
      const spray: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 14; k++) {
        const a = lip.a0 + (lip.a1 - lip.a0) * rnd();
        const r = lip.r - 18 + rnd() * 12;
        const sz = 22 + rnd() * 26;
        const g = new THREE.PlaneGeometry(sz, sz * 0.7).toNonIndexed();
        g.deleteAttribute('uv');
        g.rotateY(-a + Math.PI / 2 + (rnd() - 0.5) * 0.8);
        g.translate(cx + Math.cos(a) * r, pool + sz * 0.3 + rnd() * 8, cz + Math.sin(a) * r);
        if (!ctx.inRoad(g, 1.5)) spray.push(g);
      }
      if (spray.length) {
        const sm = new THREE.Mesh(mergeGeometries(spray), new THREE.MeshBasicMaterial({ color: 0xe8f2f0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
        sm.name = 'spray';
        sm.renderOrder = 3;
        group.add(sm);
      }
    }
  }

  // ---- the river, along the plateau and over the lip ----
  {
    const path = land.river.slice();
    // On over the lip to its edge.
    const lip = cenote.lip;
    const mid = (lip.a0 + lip.a1) / 2;
    const last = path[path.length - 1];
    for (let r = Math.hypot(last.x - cx, last.z - cz) - 6; r > lip.r + 1; r -= 6) path.push(v3(cx + Math.cos(mid) * r, lip.top + 0.4, cz + Math.sin(mid) * r));
    const g = ribbon(path, (k) => (k > land.river.length - 4 ? Math.min(30, (lip.a1 - lip.a0) * lip.r * 0.9) : 30));
    if (!ctx.inRoad(g, 3)) {
      const mat = waterMaterial({ deep: 0x4a6e5c, foam: 0xa8c8b4, speed: 1.2, streak: 0.2, alpha: 0.9 });
      const m = new THREE.Mesh(g, mat);
      m.name = 'river';
      m.renderOrder = 1;
      group.add(m);
      ctx.updates.push((time) => (mat.uniforms.uTime.value = time));
    }
  }

  // ---- the Temple Halls over the inside route, the causeway's walls round the outside ----
  {
    // Each sample of the fork: the halls route's middle, its way across and
    // half width; the causeway's edges. Walls and roofs run from sample to
    // sample following the routes as the track draws them apart. Each wall
    // is solid: an inner and an outer face, its top, a molding along its
    // foot and a carved band under a cornice along its top, closed at its
    // ends. The courtyard side, toward the causeway, is a colonnade: square
    // columns under the band. The roof over each hall is a corbelled vault:
    // a fascia over the cornice, then the slope up to its ridge, a roof comb
    // standing along the ridge of every other hall, its ends closed by gables.
    const walls: THREE.Vector3[][] = [];
    const band: THREE.Vector3[][] = [];
    const BAND = 6;
    const roofs: THREE.Vector3[][] = [];
    const combs: THREE.Vector3[][] = [];
    const retaining: THREE.Vector3[][] = [];
    const cols: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3, number, number]> = [];
    let maxShift = 0;
    for (let i = 0; i < n; i++) maxShift = Math.max(maxShift, track.shiftR[i]);
    type Cut = { c: THREE.Vector3; across: THREE.Vector3; half: number; roofed: boolean; hall: number; cw: { l: THREE.Vector3; r: THREE.Vector3; g0: number; g1: number } | null };
    let prev: Cut | null = null;
    let run = 0;
    let hallNo = 0;
    let colAt = 0;
    const T = 3.5;
    const wallTop = (q: Cut) => q.c.y + KEEP_OUT.up + 3;
    const ridgeOf = (q: Cut) => wallTop(q) + 2.2 + q.half * 0.62;
    // Where a run of wall starts or ends, its end closed.
    const cap = (q: Cut, sd: number, y0: number, y1: number) => {
      const i0 = q.c.clone().addScaledVector(q.across, sd * q.half);
      const o0 = q.c.clone().addScaledVector(q.across, sd * (q.half + T));
      walls.push([i0.clone().setY(y0), o0.clone().setY(y0), o0.clone().setY(y1), i0.clone().setY(y1)]);
    };
    for (let i = 0; i <= n; i++) {
      const j = i % n;
      if (track.median[j] < 1) {
        prev = null;
        continue;
      }
      const ln = lanes(track, j);
      const tl = Math.hypot(track.tx[j], track.tz[j]) || 1;
      const across = v3(-track.tz[j] / tl, 0, track.tx[j] / tl);
      const p = v3(track.px[j], track.py[j], track.pz[j]);
      const hall = ln[1];
      const c = p.clone().addScaledVector(across, hall.d).setY(p.y + hall.rise);
      run += track.ds;
      const roofed = run % 72 < 52 && track.shiftR[j] > maxShift * 0.5;
      if (roofed && !(prev && prev.roofed)) hallNo++;
      // The causeway's edges, and the ground under them.
      const cwl = ln[0];
      let cw: Cut['cw'] = null;
      if (cwl.rise > 0.5) {
        const l = p.clone().addScaledVector(across, cwl.d - cwl.half - 2.6).setY(p.y + cwl.rise - 1.2);
        const r = p.clone().addScaledVector(across, cwl.d + cwl.half + 2.6).setY(p.y + cwl.rise - 1.2);
        cw = { l, r, g0: land.groundAt(l.x, l.z) - 2, g1: land.groundAt(r.x, r.z) - 2 };
      }
      const cut: Cut = { c, across, half: hall.half + KEEP_OUT.side + 2.2, roofed, hall: hallNo, cw };
      if (prev) {
        if (prev.roofed && cut.roofed) {
          colAt++;
          for (const sd of [-1, 1]) {
            // (The courtyard side, toward the causeway: a column every third sample, open between.)
            const colonnade = sd < 0;
            const solid = !colonnade;
            const at = (q: Cut, off: number, y: number) => q.c.clone().addScaledVector(q.across, sd * (q.half + off)).setY(y);
            const y1a = wallTop(prev), y1b = wallTop(cut);
            const y0a = prev.c.y - 2, y0b = cut.c.y - 2;
            const bandA = y1a - BAND, bandB = y1b - BAND;
            // Faces (inner, outer) of the wall below the band, and the band.
            for (const off of [0, T]) {
              if (solid) walls.push([at(prev, off, y0a), at(cut, off, y0b), at(cut, off, bandB), at(prev, off, bandA)]);
              band.push([at(prev, off, bandA), at(cut, off, bandB), at(cut, off, y1b), at(prev, off, y1a)]);
            }
            // Its top, and under the band where the colonnade is open below.
            walls.push([at(prev, 0, y1a), at(cut, 0, y1b), at(cut, T, y1b), at(prev, T, y1a)]);
            if (colonnade) walls.push([at(prev, 0, bandA), at(cut, 0, bandB), at(cut, T, bandB), at(prev, T, bandA)]);
            // The molding along its foot, outside (and inside, by the road, a low plinth).
            if (solid) {
              const m = 1.0, mh = 2.6;
              walls.push([at(prev, T + m, y0a), at(cut, T + m, y0b), at(cut, T + m, y0b + mh), at(prev, T + m, y0a + mh)]);
              walls.push([at(prev, T, y0a + mh), at(cut, T, y0b + mh), at(cut, T + m, y0b + mh), at(prev, T + m, y0a + mh)]);
            }
            // The cornice over the band, standing out both sides: its face, top and underside.
            for (const [off, out] of [
              [T, 1.1],
              [0, -0.7],
            ] as const) {
              const o = off + out;
              walls.push([at(prev, o, y1a - 0.9), at(cut, o, y1b - 0.9), at(cut, o, y1b + 0.5), at(prev, o, y1a + 0.5)]);
              walls.push([at(prev, off, y1a - 0.9), at(cut, off, y1b - 0.9), at(cut, o, y1b - 0.9), at(prev, o, y1a - 0.9)]);
              walls.push([at(prev, off, y1a + 0.5), at(cut, off, y1b + 0.5), at(cut, o, y1b + 0.5), at(prev, o, y1a + 0.5)]);
            }
            if (colonnade && colAt % 3 === 1) {
              // A column, its foot on the causeway side's ground under the hall.
              const mid = prev.c.clone().lerp(cut.c, 0.5);
              const acr = prev.across.clone().add(cut.across).normalize();
              const fwd = cut.c.clone().sub(prev.c).setY(0).normalize();
              const foot = mid.clone().addScaledVector(acr, sd * (prev.half + T / 2)).setY(Math.min(y0a, y0b));
              cols.push([foot, acr, fwd, T, (bandA + bandB) / 2 - foot.y]);
            }
            // The vault: a fascia over the cornice, then the slope in to the ridge.
            const fa = (q: Cut, y: number) => q.c.clone().addScaledVector(q.across, sd * (q.half + T + 0.4)).setY(y);
            roofs.push([fa(prev, y1a + 0.5), fa(cut, y1b + 0.5), fa(cut, y1b + 2.2), fa(prev, y1a + 2.2)]);
            roofs.push([fa(prev, y1a + 2.2), fa(cut, y1b + 2.2), cut.c.clone().setY(ridgeOf(cut)), prev.c.clone().setY(ridgeOf(prev))]);
          }
          // A roof comb along the ridge of every other hall: slabs, with gaps between (its lattice).
          if (cut.hall % 2 === 0 && colAt % 4 !== 0) {
            const h = 7;
            const ra = prev.c.clone().setY(ridgeOf(prev) - 0.5), rb = cut.c.clone().setY(ridgeOf(cut) - 0.5);
            for (const sd of [-0.6, 0.6]) {
              const a0 = ra.clone().addScaledVector(prev.across, sd), b0 = rb.clone().addScaledVector(cut.across, sd);
              combs.push([a0, b0, b0.clone().setY(b0.y + h), a0.clone().setY(a0.y + h)]);
            }
            combs.push([ra.clone().addScaledVector(prev.across, -0.6).setY(ra.y + h), rb.clone().addScaledVector(cut.across, -0.6).setY(rb.y + h), rb.clone().addScaledVector(cut.across, 0.6).setY(rb.y + h), ra.clone().addScaledVector(prev.across, 0.6).setY(ra.y + h)]);
          }
        } else if (prev.roofed !== cut.roofed) {
          // The gable end of a hall, over its door, and the walls' ends closed.
          const q = prev.roofed ? prev : cut;
          const top = wallTop(q) + 0.5;
          const l = q.c.clone().addScaledVector(q.across, -q.half - T - 0.4).setY(top);
          const r = q.c.clone().addScaledVector(q.across, q.half + T + 0.4).setY(top);
          roofs.push([l, r, q.c.clone().setY(ridgeOf(q)), q.c.clone().setY(ridgeOf(q))]);
          for (const sd of [-1, 1]) cap(q, sd, q.c.y - 2, wallTop(q) + 0.5);
        }
        if (prev.cw && cut.cw) {
          retaining.push([prev.cw.l.clone().setY(prev.cw.g0), cut.cw.l.clone().setY(cut.cw.g0), cut.cw.l, prev.cw.l]);
          retaining.push([prev.cw.r.clone().setY(prev.cw.g1), cut.cw.r.clone().setY(cut.cw.g1), cut.cw.r, prev.cw.r]);
        }
      }
      prev = cut;
    }
    const pieces: THREE.BufferGeometry[] = [];
    const frieze: THREE.BufferGeometry[] = [];
    const add = (list: THREE.Vector3[][], c: number, to = pieces) => {
      for (const q of list) {
        const g = quads([q]);
        if (g && !ctx.inRoad(g, 1.5)) to.push(colour(g, new THREE.Color(c).multiplyScalar(0.88 + vnoise(q[0].x / 30, q[0].z / 30) * 0.2)));
      }
    };
    add(walls, 0x9a967e);
    add(band, 0x9a967e, frieze);
    add(combs, 0x8a866e, frieze);
    add(roofs, 0x7a7662);
    add(retaining, 0xa29e86);
    for (const [foot, acr, fwd, w, h] of cols) column(put, foot, acr, fwd, w, h, new THREE.Color(0x9a967e));
    if (pieces.length) {
      const m = new THREE.Mesh(mergeGeometries(pieces), toonMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      m.name = 'temple halls';
      group.add(m);
      paint(m, 'limestone', 'limestone', 7, 9, 1.7, THREE.DoubleSide);
    }
    if (frieze.length) {
      const m = new THREE.Mesh(mergeGeometries(frieze), toonMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      m.name = 'temple halls frieze';
      group.add(m);
      paint(m, 'frieze', 'limestone', BAND, 9, 1.7, THREE.DoubleSide);
    }
  }

  // ---- the plaza at the line: paving, and a stepped temple either side, its stair toward the road ----
  {
    const start = frameOf(160);
    const across = v3(start.r.x, 0, start.r.z).normalize();
    for (const side of [-1, 1]) {
      const c = start.p.clone().addScaledVector(across, side * 150);
      c.y = land.groundAt(c.x, c.z) - 2;
      steppedPyramid(put, c, across.clone().multiplyScalar(-side), { w: 96, tiers: 6, tierH: 8, setback: 6.5, tone: new THREE.Color(0xc0baa0), comb: true });
    }
  }

  // ---- ruins about the jungle: platforms, stelae, broken walls, small temples ----
  {
    const clear = (x: number, z: number, r: number) => {
      // Clear of every road's space in plan by r.
      for (let i = 0; i < n; i += 3) {
        const reach = track.hw[i] + KEEP_OUT.side + Math.max(Math.abs(track.shiftL[i]), Math.abs(track.shiftR[i])) + r;
        if ((track.px[i] - x) ** 2 + (track.pz[i] - z) ** 2 < reach * reach) return false;
      }
      return true;
    };
    const { x0, z0, cell, nx, nz } = land.land;
    let placed = 0;
    for (let k = 0; k < 2600 && placed < 150; k++) {
      // Most near the road (the city), a few far out.
      const s = rnd() * track.length;
      const F = frameOf(s);
      const side = rnd() < 0.5 ? -1 : 1;
      const off = 50 + rnd() * 260;
      const x = F.p.x + F.r.x * side * off;
      const z = F.p.z + F.r.z * side * off;
      if (x < x0 || z < z0 || x > x0 + nx * cell || z > z0 + nz * cell) continue;
      const kind = rnd();
      const size = kind < 0.12 ? 50 + rnd() * 40 : kind < 0.5 ? 14 + rnd() * 16 : 4 + rnd() * 4;
      if (!clear(x, z, size * 0.75 + 6)) continue;
      if (Math.hypot(x - cx, z - cz) < cenote.wallR(cenote.rim) + size + 30) continue;
      if (pyrAt(x, z) > land.groundAt(x, z) - 1 && pyrAt(x, z) > 0) continue;
      const y = land.groundAt(x, z);
      const rot = rnd() * Math.PI;
      const ax = v3(Math.cos(rot), 0, Math.sin(rot));
      const az = v3(-ax.z, 0, ax.x);
      const tone = new THREE.Color(0x9a967e).multiplyScalar(0.75 + rnd() * 0.3);
      const upv = v3(0, 1, 0);
      if (kind < 0.12) {
        // A small stepped temple, its stair up one face, half ruined.
        const tiers = 3 + Math.floor(rnd() * 2);
        steppedPyramid(put, v3(x, y - 2, z), az, { w: size, depth: 0.9, tiers, tierH: 6 + rnd() * 3, setback: size * 0.11, tone, stair: rnd() < 0.8, shrine: rnd() < 0.75, comb: rnd() < 0.5, ruined: 0.35, rnd });
      } else if (kind < 0.5) {
        if (rnd() < 0.5) {
          // A platform: its talud, a band, a stair up one side.
          put(frustum(v3(x, y - 1, z), ax, az, size, size * 0.8, size - 3, size * 0.8 - 3, 6), tone, 'stone');
          put(box(v3(x, y + 6, z), ax, upv, az, size - 2.4, 2, size * 0.8 - 2.4), tone.clone().multiplyScalar(0.88), 'carved');
        } else {
          // A broken wall: a molding at its foot, its top stepped down where
          // it has fallen, and the fallen blocks at its foot.
          const len = size * 1.4;
          const hgt = 10 + rnd() * 8;
          put(box(v3(x, y + 0.8, z), ax, upv, az, len + 1.4, 1.6, 4.4), tone.clone().multiplyScalar(0.85), 'stone');
          const pieces = 3;
          for (let k = 0; k < pieces; k++) {
            const hk = hgt * (k === 1 ? 1 : 0.55 + rnd() * 0.35);
            const off = (k - 1) * (len / pieces);
            put(box(v3(x, y + hk / 2, z).addScaledVector(ax, off), ax, upv, az, len / pieces - 0.2, hk, 3), tone.clone().multiplyScalar(0.94 + k * 0.03), 'stone');
          }
          put(box(v3(x, y + hgt - 1.4, z), ax, upv, az, len / pieces + 0.8, 1.6, 3.8), tone.clone().multiplyScalar(0.86), 'carved');
          for (let k = 0; k < 3; k++) {
            const r = rnd() * Math.PI;
            const bx = v3(Math.cos(r), 0, Math.sin(r));
            put(box(v3(x, y + 0.9, z).addScaledVector(ax, (rnd() - 0.5) * len).addScaledVector(az, 4 + rnd() * 5), bx, upv, v3(-bx.z, 0, bx.x), 3 + rnd() * 2, 1.8, 2.4), tone.clone().multiplyScalar(0.8), 'stone');
          }
        }
      } else {
        // A stela, carved, on a base, with a round altar stone before it.
        const hgt = 9 + rnd() * 8;
        put(box(v3(x, y + 0.6, z), ax, upv, az, size + 1.6, 1.2, 3.4), tone.clone().multiplyScalar(0.85), 'stone');
        put(box(v3(x, y + hgt / 2, z), ax, upv, az, size, hgt, 1.6), tone, 'carved');
        const altar = new THREE.CylinderGeometry(2.2, 2.4, 1.6, 10).toNonIndexed();
        altar.deleteAttribute('uv');
        altar.translate(x + az.x * 5, y + 0.5, z + az.z * 5);
        put(altar, tone.clone().multiplyScalar(0.9), 'carved');
      }
      placed++;
    }
  }

  // ---- the jungle ----
  {
    const { x0, z0, cell, nx, nz } = land.land;
    // How far each point of the land is from the nearest road's edge, in plan (coarse).
    const C = 16;
    const cnx = Math.ceil((nx * cell) / C) + 1;
    const cnz = Math.ceil((nz * cell) / C) + 1;
    const near = new Float32Array(cnx * cnz).fill(1e9);
    for (let i = 0; i < n; i += 2) {
      const reach = 90;
      for (const ln of lanes(track, i)) {
        const mx = track.px[i] + track.rx[i] * ln.d;
        const mz = track.pz[i] + track.rz[i] * ln.d;
        const i0 = Math.max(0, Math.floor((mx - reach - x0) / C));
        const i1 = Math.min(cnx - 1, Math.ceil((mx + reach - x0) / C));
        const k0 = Math.max(0, Math.floor((mz - reach - z0) / C));
        const k1 = Math.min(cnz - 1, Math.ceil((mz + reach - z0) / C));
        for (let k = k0; k <= k1; k++)
          for (let q = i0; q <= i1; q++) {
            const d = Math.hypot(x0 + q * C - mx, z0 + k * C - mz) - ln.half - KEEP_OUT.side;
            const o = k * cnx + q;
            if (d < near[o]) near[o] = d;
          }
      }
    }
    const roomAt = (x: number, z: number) => {
      const q = Math.round((x - x0) / C);
      const k = Math.round((z - z0) / C);
      if (q < 0 || k < 0 || q >= cnx || k >= cnz) return 1e9;
      return near[k * cnx + q] - C * 0.75;
    };
    const trunks: THREE.BufferGeometry[] = [];
    const leaves: THREE.BufferGeometry[] = [];
    const greens = [0x2f5a2a, 0x3c6b2e, 0x4a7a34, 0x2a4a26, 0x55803a];
    const W = (nx - 1) * cell;
    const D = (nz - 1) * cell;
    let trees = 0;
    for (let k = 0; k < 16000 && trees < 3200; k++) {
      const x = x0 + rnd() * W;
      const z = z0 + rnd() * D;
      const kind = rnd();
      const giant = kind < 0.05;
      const palm = !giant && kind < 0.25;
      const crown = giant ? 26 + rnd() * 14 : palm ? 7 : 9 + rnd() * 7;
      if (roomAt(x, z) < crown + 3) continue;
      if (Math.hypot(x - cx, z - cz) < cenote.wallR(cenote.rim) + crown + 6) continue;
      if (pyrAt(x, z) > sampleGrid(land.land, x, z) + 1) continue;
      let river = false;
      for (let q = 0; q < land.river.length; q += 4) if (Math.hypot(land.river[q].x - x, land.river[q].z - z) < 26 + crown) river = true;
      if (river) continue;
      const y = land.groundAt(x, z);
      // Not on the cliffs.
      if (Math.abs(land.groundAt(x + 8, z) - y) > 6 || Math.abs(land.groundAt(x, z + 8) - y) > 6) continue;
      const hgt = giant ? 50 + rnd() * 25 : palm ? 16 + rnd() * 8 : 14 + rnd() * 14;
      const trunkR = giant ? 3.2 : palm ? 0.8 : 1.3;
      const tg = new THREE.CylinderGeometry(trunkR * 0.7, trunkR * (giant ? 2.2 : 1.2), hgt, 6, 1, true).toNonIndexed();
      tg.deleteAttribute('uv');
      tg.rotateZ((rnd() - 0.5) * (palm ? 0.25 : 0.06));
      tg.translate(x, y + hgt / 2 - 1, z);
      trunks.push(colour(tg, new THREE.Color(giant ? 0x8a8270 : 0x5a4a38).multiplyScalar(0.8 + rnd() * 0.3)));
      const green = new THREE.Color(greens[Math.floor(rnd() * greens.length)]).multiplyScalar(0.85 + rnd() * 0.3);
      if (palm) {
        // Fronds: long flat leaves fanned out and drooping.
        for (let q = 0; q < 7; q++) {
          const a = (q / 7) * TAU + rnd();
          const g = new THREE.PlaneGeometry(2.4, 11, 1, 3).toNonIndexed();
          g.deleteAttribute('uv');
          g.translate(0, 5.5, 0);
          g.rotateX(1.1 + rnd() * 0.4);
          g.rotateY(a);
          g.translate(x, y + hgt - 1, z);
          leaves.push(colour(g, green));
        }
      } else {
        const blobs = giant ? 5 : 2;
        for (let q = 0; q < blobs; q++) {
          const r = crown * (giant ? 0.45 : 0.6) * (0.7 + rnd() * 0.5);
          const g = new THREE.IcosahedronGeometry(r, 0).toNonIndexed();
          g.deleteAttribute('uv');
          g.scale(1, giant ? 0.45 : 0.75, 1);
          const a = rnd() * TAU;
          const off = q === 0 ? 0 : crown * 0.45;
          g.translate(x + Math.cos(a) * off, y + hgt + (giant ? 0 : r * 0.3) + rnd() * 3, z + Math.sin(a) * off);
          g.computeVertexNormals();
          leaves.push(colour(g, green.clone().multiplyScalar(q === 0 ? 1 : 0.9)));
        }
      }
      trees++;
    }
    if (trunks.length) {
      const m = new THREE.Mesh(mergeGeometries(trunks), toonMaterial({ color: 0xffffff }));
      m.name = 'trunks';
      group.add(m);
    }
    if (leaves.length) {
      const m = new THREE.Mesh(mergeGeometries(leaves), toonMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      m.name = 'canopy';
      group.add(m);
      paint(m, 'canopy', 'canopy', 18, 18, 1.25, THREE.DoubleSide);
    }
  }

  // ---- the sign over the road at the foot of the Stairway, on a stone gateway ----
  const foot = range('the Stairway');
  if (foot) {
    const s = foot[0] + 30;
    const W = 80;
    const H = 26;
    const Y = 38;
    const m = new THREE.Matrix4();
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: monsoonSign(), side: THREE.DoubleSide }));
    trackMatrix(track, s, 0, Y, Math.PI, m);
    sign.applyMatrix4(m);
    group.add(sign);
    const own = paintedTrack.circuitSigns[def.theme ?? ''];
    if (own) {
      const ph = Math.min(H, W / own.aspect);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(W, ph), new THREE.MeshBasicMaterial({ map: paintedTexture(own.url), side: THREE.DoubleSide }));
      trackMatrix(track, s, 0, Y + (H - ph) / 2, Math.PI, m);
      panel.applyMatrix4(m);
      group.add(panel);
      ctx.swaps.push((on) => {
        sign.visible = !on;
        panel.visible = on;
      });
    }
    // The gateway: two stone posts from the ground, and a lintel over the sign.
    const F = frameOf(s);
    const across = v3(F.r.x, 0, F.r.z).normalize();
    const along = v3(F.t.x, 0, F.t.z).normalize();
    for (const side of [-1, 1]) {
      const q = F.p.clone().addScaledVector(across, side * (W / 2 + 6));
      const g0 = land.groundAt(q.x, q.z) - 2;
      const top = F.p.y + Y + H / 2 + 4;
      keep(block(q.clone().setY((g0 + top) / 2), across, v3(0, 1, 0), along, 8, top - g0, 8), 0x8a866e, 2);
    }
    keep(block(F.p.clone().setY(F.p.y + Y + H / 2 + 7), across, v3(0, 1, 0), along, W + 24, 6, 9), 0x7a7662, 2);
  }

  // ---- into the scene ----
  if (stone.length) {
    const mesh = new THREE.Mesh(mergeGeometries(stone), toonMaterial({ color: 0xffffff }));
    mesh.name = 'ruins';
    group.add(mesh);
    paint(mesh, 'limestone', 'paving', 8, 14, 1.7);
  }
  if (carved.length) {
    const mesh = new THREE.Mesh(mergeGeometries(carved), toonMaterial({ color: 0xffffff }));
    mesh.name = 'carved stone';
    group.add(mesh);
    paint(mesh, 'frieze', 'limestone', 8, 9, 1.7);
  }
  if (dark.length) {
    // Doorways: dark in both looks (the painted look's wet rock, very dim).
    const mesh = new THREE.Mesh(mergeGeometries(dark), toonMaterial({ color: 0xffffff }));
    mesh.name = 'doorways';
    group.add(mesh);
    paint(mesh, 'cenote', 'cenote', 6, 6, 0.3);
  }
  if (glow.length) {
    const mesh = new THREE.Mesh(mergeGeometries(glow), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    mesh.name = 'glyphs';
    group.add(mesh);
  }
  if (lintelGlow.length) {
    const mesh = new THREE.Mesh(mergeGeometries(lintelGlow), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    mesh.name = 'lintel glyphs';
    group.add(mesh);
    if (ctx.painted) ctx.plainOnly.push(mesh);
  }

  // ---- the rain, round the camera: streaks, and splashes on the road (rain.ts) ----
  const rain = buildRain({ track, group, updates: ctx.updates, lanes: (i) => lanes(track, i) });

  // ---- painted: low storm clouds round the circuit (J3), each turning about the upright to face the camera ----
  const storm: Array<{ m: THREE.Mesh; mat: THREE.ShaderMaterial; dir: THREE.Vector3 }> = [];
  let strikeCard: { m: THREE.Mesh; mat: THREE.ShaderMaterial; aspect: number } | null = null;
  let paintedOn = false;
  const set = ctx.painted;
  if (set && set.clouds.cards.length >= 6) {
    const { url, cards } = set.clouds;
    const map = paintedTexture(url);
    const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const clouds = new THREE.Group();
    // Round the land the circuit stands on, beyond it.
    const { x0, z0, cell, nx, nz } = land.land;
    const mx = x0 + ((nx - 1) * cell) / 2;
    const mz = z0 + ((nz - 1) * cell) / 2;
    const reach = Math.hypot(nx * cell, nz * cell) / 2;
    const crnd = mulberry(9431);
    const COUNT = 15;
    for (let k = 0; k < COUNT; k++) {
      const a = ((k + crnd() * 0.8) / COUNT) * TAU;
      const r = reach + 1200 + crnd() * 3600;
      // Mostly the rain clouds (1 to 3) standing on their curtains' level foot; now and then the anvil (4) or the long roll (5), up off the ground.
      const kind = crnd() < 0.7 ? Math.floor(crnd() * 3) : 3 + Math.floor(crnd() * 2);
      const card = cards[kind];
      // About as wide in view wherever it stands.
      const w = r * (kind === 4 ? 0.42 : kind === 3 ? 0.24 : 0.3) * (0.8 + crnd() * 0.4);
      const base = kind < 3 ? -20 : kind === 3 ? r * 0.02 : r * 0.07;
      const mat = stormCardMaterial(map, [card.u0, card.v0, card.u1 - card.u0, card.v1 - card.v0]);
      const m = new THREE.Mesh(geo, mat);
      m.scale.set(crnd() < 0.5 ? -w : w, w / card.aspect, 1);
      m.position.set(mx + Math.cos(a) * r, base, mz + Math.sin(a) * r);
      m.renderOrder = -6;
      m.frustumCulled = false;
      clouds.add(m);
      storm.push({ m: moves(m), mat, dir: v3(Math.cos(a), 0, Math.sin(a)) });
    }
    group.add(clouds);
    ctx.paintedOnly.push(clouds);
    // The strike: the cloud lit from inside, the bolt out of its belly (6), shown with the flash.
    const card = cards[5];
    const mat = stormCardMaterial(map, [card.u0, card.v0, card.u1 - card.u0, card.v1 - card.v0]);
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = -5;
    m.frustumCulled = false;
    m.visible = false;
    group.add(m);
    strikeCard = { m: moves(m), mat, aspect: card.aspect };
    const cam = v3();
    ctx.updates.push((_time, camera) => {
      if (!clouds.visible) return;
      camera.getWorldPosition(cam);
      for (const { m } of storm) m.rotation.y = Math.atan2(cam.x - m.position.x, cam.z - m.position.z);
    });
  }
  ctx.swaps.push((on) => (paintedOn = on));

  // ---- lightning ----
  {
    const bolt = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xe8ecff, transparent: true, opacity: 0.95, depthWrite: false, fog: false, toneMapped: false }));
    bolt.name = 'lightning';
    bolt.frustumCulled = false;
    bolt.visible = false;
    group.add(bolt);
    const zap = mulberry(77);
    let next = 6 + zap() * 8;
    let start = -100;
    let pulses: number[] = [];
    const dir = v3();
    const strike = (time: number, camera: THREE.Camera) => {
      start = time;
      pulses = [0, 0.09 + zap() * 0.05, 0.22 + zap() * 0.12].slice(0, 2 + Math.floor(zap() * 2));
      const a = zap() * TAU;
      dir.set(Math.cos(a), 0.12 + zap() * 0.25, Math.sin(a)).normalize();
      // The bolt: a jagged line from the cloud down to the jungle, far off that way.
      const far = 1800 + zap() * 1200;
      const base = camera.position.clone().addScaledVector(v3(dir.x, 0, dir.z).normalize(), far);
      const pos: number[] = [];
      let p = base.clone().setY(base.y + 900);
      const width = 3.5;
      const segs = (from: THREE.Vector3, to: number, w: number, depth: number) => {
        let q = from.clone();
        const steps = 12;
        const drop = (q.y - to) / steps;
        for (let k = 0; k < steps; k++) {
          const nq = q.clone().add(v3((zap() - 0.5) * 70, -drop, (zap() - 0.5) * 70));
          const side = v3().crossVectors(nq.clone().sub(q), v3(0, 0, 1)).normalize().multiplyScalar(w);
          for (const c of [q.clone().sub(side), q.clone().add(side), nq.clone().add(side), q.clone().sub(side), nq.clone().add(side), nq.clone().sub(side)]) pos.push(c.x, c.y, c.z);
          if (depth < 1 && zap() < 0.2) segs(nq, nq.y - 200, w * 0.5, depth + 1);
          q = nq;
        }
      };
      segs(p, 0, width, 0);
      p = base;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      bolt.geometry.dispose();
      bolt.geometry = g;
      // Painted, the strike is the painted cloud there, its bolt's tip well up off the jungle, facing the camera.
      if (strikeCard) {
        const w = far * 0.36;
        strikeCard.m.scale.set(zap() < 0.5 ? -w : w, w / strikeCard.aspect, 1);
        strikeCard.m.position.copy(base).setY(far * 0.05);
        strikeCard.m.rotation.y = Math.atan2(camera.position.x - base.x, camera.position.z - base.z);
      }
    };
    ctx.updates.push((time, camera) => {
      if (time >= next) {
        strike(time, camera);
        next = time + 7 + zap() * 12;
      }
      const t = time - start;
      let v = 0;
      for (const at of pulses) {
        const dt = t - at;
        if (dt >= 0) v = Math.max(v, Math.exp(-dt * 16));
      }
      bolt.visible = v > 0.3 && !(paintedOn && strikeCard);
      ctx.flash(v * 0.9, dir);
      rain.flash(v);
      if (strikeCard) {
        strikeCard.m.visible = paintedOn && v > 0.04;
        strikeCard.mat.uniforms.uOpacity.value = Math.min(1, v * 2.5);
        strikeCard.mat.uniforms.uFlash.value = v * 0.3;
      }
      // The clouds that way lit up with it, the rest a little.
      for (const c of storm) c.mat.uniforms.uFlash.value = v * (0.12 + 0.6 * Math.max(0, c.dir.x * dir.x + c.dir.z * dir.z) ** 4);
    });
  }
}
