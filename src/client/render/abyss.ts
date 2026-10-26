// Abyss Line's world, in the plain look, built round the road from the
// circuit's own measures (sim/tracks/abyss.ts): the sea floor, with the
// trench carved into it where the road goes down (and a chasm under the
// Trench Leap); glass tubes round the road (one round each strand through
// the Braid, a wide one round the Twist), ribbed every so often, vaulted
// high over the Leap and open underneath its gap; the town's dome, the road running round under its roof, and
// the town on its floor, lit; smaller domes, rocks and kelp about the sea
// floor, and the shafts of light coming down from the surface. Everything is
// checked against the space the road needs (titan/keepout.ts) and left out
// where it would stand in it: the dome's glass opens where the road comes
// in and goes out.
//
// With the painted background (the anime look, art/bg-sheets A1 to A4) the
// water is painted (the sky), the far scenery stands round it in rings
// (world.ts), the floor, rock, coral, the frames and the town take the
// painted surfaces (A4: the town's portholes lit by the build), and sea life
// drifts by (A3), in the water, as cards.
import * as THREE from 'three';
import { moves } from './still';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pieceStarts, type CircuitDef } from '../../sim/circuit';
import { deltaS, frameAt, makeFrame, type Track } from '../../sim/track';
import { fastestFlight } from '../../sim/flight';
import { DOME, TWIST } from '../../sim/tracks/abyss';
import { paintedTexture, paintedTrack, paintedSurfaceMaterial, swapWhenPainted, UNTONE, whiteTexture, type PaintedSet } from './painted';
import { toonMaterial } from './palette';
import { trackMatrix } from './trackSpace';
import { KEEP_OUT } from './titan/keepout';

/** What the world builder hands over (world.ts's context has all of it). */
export interface SeaCtx {
  track: Track;
  group: THREE.Group;
  inRoad(g: THREE.BufferGeometry, step?: number): boolean;
  updates: Array<(time: number, camera: THREE.Camera) => void>;
  /** The switch between the plain look and the painted background. */
  swaps: Array<(painted: boolean) => void>;
  /** The painted background, if there is one, and what is shown only with it. */
  painted: PaintedSet | null;
  paintedOnly: THREE.Object3D[];
  /** Distance from a point to the nearest bit of road, in plan. */
  clearance(x: number, z: number): number;
}

/** A painted material on `mesh` with the painted background (painted.ts). */
function paintedSwap(ctx: SeaCtx, mesh: THREE.Mesh, urls: string[], make: (maps: THREE.Texture[]) => THREE.Material): void {
  swapWhenPainted(ctx.swaps, mesh, urls, make);
}

const f = makeFrame();
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---- the sea floor ------------------------------------------------------------------

/** Abyss Line's sea floor and dome, worked out from the road. */
export interface Abyss {
  /** The dome: its middle (on the road's level at the floor of the town), its radius, and the town floor's height. */
  dome: { centre: THREE.Vector3; radius: number; floor: number };
  /** The sea floor's height at (x, z): the trench and the chasm carved into it, the town's floor inside the dome. */
  groundAt(x: number, z: number): number;
  /** The grid the floor is drawn from. */
  grid: { x0: number; z0: number; cell: number; nx: number; nz: number; h: Float32Array };
}

const cache = new WeakMap<Track, Abyss | null>();

/** Abyss Line's sea floor, if this is Abyss Line (it has a Dome Run); null otherwise. */
export function abyssOf(track: Track): Abyss | null {
  if (cache.has(track)) return cache.get(track)!;
  const a = findAbyss(track);
  cache.set(track, a);
  return a;
}

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

function rangeOf(track: Track, starts: number[], name: string): [number, number] | null {
  const def = track.def as CircuitDef;
  const i = def.pieces.findIndex((p) => p.name === name);
  if (i < 0) return null;
  return [starts[i], i + 1 < starts.length ? starts[i + 1] : track.length];
}

function findAbyss(track: Track): Abyss | null {
  const def = track.def as CircuitDef;
  if (!('pieces' in def)) return null;
  const starts = pieceStarts(def);
  const roof = rangeOf(track, starts, 'under the roof');
  if (!roof) return null;
  // The arc under the roof is centred on the dome's middle.
  frameAt(track, roof[0], f);
  const R = DOME.radius - DOME.under;
  const centre = v3(f.px + f.ux * R, f.py + f.uy * R, f.pz + f.uz * R);
  const floor = centre.y - 10;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < track.n; i++) {
    x0 = Math.min(x0, track.px[i]);
    x1 = Math.max(x1, track.px[i]);
    z0 = Math.min(z0, track.pz[i]);
    z1 = Math.max(z1, track.pz[i]);
  }
  const cell = 16;
  const pad = 700;
  const gx0 = Math.floor((x0 - pad) / cell) * cell;
  const gz0 = Math.floor((z0 - pad) / cell) * cell;
  const nx = Math.ceil((x1 - x0 + 2 * pad) / cell) + 1;
  const nz = Math.ceil((z1 - z0 + 2 * pad) / cell) + 1;
  const h = new Float32Array(nx * nz);
  const base = (x: number, z: number) => {
    const r = Math.hypot(x - centre.x, z - centre.z);
    // Low dunes and ripples; the town's floor levelled under the dome and round it.
    const dunes = (vnoise(x / 140, z / 140) - 0.5) * 8 + (vnoise(x / 45, z / 45) - 0.5) * 3;
    const flat = THREE.MathUtils.smoothstep(r, DOME.radius + 40, DOME.radius + 160);
    return floor + 0 * flat + dunes * flat - 10 * flat;
  };
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) h[k * nx + i] = base(gx0 + i * cell, gz0 + k * cell);
  // Carve: wherever the road comes down near the floor, the floor keeps well
  // under it, flat across a trench's width and rising beyond it in walls; under
  // the Leap's gap, a narrow chasm far down.
  const carve = (px: number, pz: number, floorY: number, flatR: number, slope: number) => {
    const reach = flatR + 220 / slope;
    const i0 = Math.max(0, Math.floor((px - reach - gx0) / cell));
    const i1 = Math.min(nx - 1, Math.ceil((px + reach - gx0) / cell));
    const k0 = Math.max(0, Math.floor((pz - reach - gz0) / cell));
    const k1 = Math.min(nz - 1, Math.ceil((pz + reach - gz0) / cell));
    for (let k = k0; k <= k1; k++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(gx0 + i * cell - px, gz0 + k * cell - pz);
        const y = floorY + Math.max(0, d - flatR) * slope;
        const o = k * nx + i;
        if (y < h[o]) h[o] = y;
      }
    }
  };
  for (let i = 0; i < track.n; i += 2) {
    const gap = !track.roadL[i] && !track.roadR[i];
    if (gap) {
      carve(track.px[i], track.pz[i], track.py[i] - 160, 40, 2.2);
      continue;
    }
    // (Round the Twist, under its tube: the road's lowest, less the tube's
    // width; through the Braid, its lower strand's.)
    const strand = Math.min(0, track.riseL[i], track.riseR[i]);
    const low = Math.min(track.py[i] + strand, track.py[i] + track.uy[i] * 2 * TWIST.radius) - (track.uy[i] < 0.7 ? 60 : 36);
    const r = Math.hypot(track.px[i] - centre.x, track.pz[i] - centre.z);
    if (r < DOME.radius + 20) continue;
    if (low < base(track.px[i], track.pz[i]) - 4) carve(track.px[i], track.pz[i], low, 60, 1.25);
  }
  const groundAt = (x: number, z: number) => {
    const fx = (x - gx0) / cell;
    const fz = (z - gz0) / cell;
    if (fx < 0 || fz < 0 || fx >= nx - 1 || fz >= nz - 1) return base(x, z);
    const i = Math.floor(fx);
    const k = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - k;
    const a = h[k * nx + i];
    const b = h[k * nx + i + 1];
    const c = h[(k + 1) * nx + i];
    const d = h[(k + 1) * nx + i + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  };
  return { dome: { centre, radius: DOME.radius, floor }, groundAt, grid: { x0: gx0, z0: gz0, cell, nx, nz, h } };
}

// ---- materials --------------------------------------------------------------------

/** The sea floor: sand, darker and bluer down the trench, with the surface's light rippling across it. */
function floorMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    // (Painted: the sand on what faces up and the trench's wall down the slopes, A4; plain until they are in.)
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uPaint: { value: 0 }, uSand: { value: null }, uWall: { value: null } }]),
    vertexShader: /* glsl */ `
      attribute vec3 color;
      varying vec3 vColor;
      varying vec3 vWorld;
      varying vec3 vNormal;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vColor = color;
        vNormal = normal;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uPaint;
      uniform sampler2D uSand;
      uniform sampler2D uWall;
      varying vec3 vColor;
      varying vec3 vWorld;
      varying vec3 vNormal;
      #include <common>
      #include <fog_pars_fragment>
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec3 n = normalize(vNormal);
        float light = 0.45 + 0.55 * max(n.y, 0.0);
        // The surface's light, focused into a moving net of bright lines.
        vec2 p = vWorld.xz * 0.045;
        float c1 = n2(p + vec2(uTime * 0.21, uTime * 0.13));
        float c2 = n2(p * 1.7 - vec2(uTime * 0.17, -uTime * 0.11));
        float net = pow(1.0 - abs(c1 - c2), 8.0);
        float deep = clamp(-vWorld.y / 140.0, 0.0, 1.0);
        vec3 base = vColor;
        if (uPaint > 0.5) {
          // The painting, sand on top and the trench's layered rock down the
          // slopes (level bands, running along the face), deeper and bluer
          // down the trench as the plain floor is.
          float up = smoothstep(0.55, 0.8, n.y);
          vec2 t = normalize(vec2(-n.z, n.x) + vec2(1e-5, 0.0));
          vec3 wall = texture2D(uWall, vec2(dot(vWorld.xz, t), vWorld.y) / 46.0).rgb;
          vec3 sand = texture2D(uSand, vWorld.xz / 70.0).rgb;
          base = mix(wall, sand, up);
          base = mix(base, base * vec3(0.4, 0.6, 0.75), deep * 0.8);
        }
        vec3 col = base * light + vec3(0.55, 0.85, 0.9) * net * 0.22 * (1.0 - deep) * max(n.y, 0.0);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
  });
}

/** Glass: nearly clear looking through it, its edges catching the light as a pale rim. */
function glassMaterial(tint: number, rim: number, base: number, edge: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTint: { value: new THREE.Color(tint) }, uRim: { value: new THREE.Color(rim) }, uBase: { value: base }, uEdge: { value: edge } }]),
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = cameraPosition - world.xyz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint;
      uniform vec3 uRim;
      uniform float uBase;
      uniform float uEdge;
      varying vec3 vNormal;
      varying vec3 vView;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float rim = pow(1.0 - facing, 3.0);
        gl_FragColor = vec4(mix(uTint, uRim, rim), uBase + uEdge * rim);
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

// ---- geometry ----------------------------------------------------------------------

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

/**
 * A ring of a tube: its centre, a frame across it (right and up), its
 * radius across and (taller, over the Leap) up, and how far round from
 * straight down either way it is open (radians; 0 closed).
 */
interface TubeRing {
  c: THREE.Vector3;
  r: THREE.Vector3;
  u: THREE.Vector3;
  rad: number;
  radU?: number;
  open?: number;
}

/** Rings swept into a tube's wall, as triangles. */
function tubeWall(rings: Array<TubeRing | null>, sides = 28): THREE.BufferGeometry | null {
  const pos: number[] = [];
  const at = (q: TubeRing, k: number) => {
    const a = (k / sides) * Math.PI * 2;
    return q.c.clone().addScaledVector(q.r, Math.cos(a) * q.rad).addScaledVector(q.u, Math.sin(a) * (q.radU ?? q.rad));
  };
  /** How far round a side's middle is from straight down. */
  const fromBottom = (k: number) => Math.abs((((k + 0.5) / sides) * Math.PI * 2) - Math.PI * 1.5);
  for (let i = 0; i + 1 < rings.length; i++) {
    const a = rings[i];
    const b = rings[i + 1];
    if (!a || !b) continue;
    const open = Math.max(a.open ?? 0, b.open ?? 0);
    for (let k = 0; k < sides; k++) {
      if (open > 0 && fromBottom(k) < open) continue;
      const p0 = at(a, k), p1 = at(a, k + 1), p2 = at(b, k + 1), p3 = at(b, k);
      for (const p of [p0, p1, p2, p0, p2, p3]) pos.push(p.x, p.y, p.z);
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** A ring (torus) round `centre`, its hole along `axis`. */
function hoop(centre: THREE.Vector3, axis: THREE.Vector3, radius: number, tube: number, seg = 32, sides = 6): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(radius, tube, sides, seg).toNonIndexed();
  g.deleteAttribute('uv');
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), axis.clone().normalize()));
  g.translate(centre.x, centre.y, centre.z);
  g.computeVertexNormals();
  return g;
}

/** How far round from straight down, either way, the tube is open over the Leap's gap. */
const LEAP_OPEN = 1.1;

/**
 * The vault over the Leap: for each sample (every other one, as the tube's
 * rings are) from a way before its gap to a way past the furthest a mech
 * can fly it, how tall the tube there must stand over its centre (8 over
 * the deck) to clear that flight, a mech's height and a margin over it,
 * and the chase camera behind it; rising to it and falling from it gently.
 */
function leapVault(track: Track, gap: [number, number] | null): Map<number, number> {
  const out = new Map<number, number>();
  if (!gap) return out;
  const f = fastestFlight(track, gap[0], 0);
  const n = track.n;
  // What has to fit over the deck at each point of the flight: the mech's
  // body (4.4 to its middle) with 10 round it, and behind, the camera (8.4
  // over a mech, up to 28 back) with 5 over it.
  const need: Array<[number, number]> = [];
  for (let i = 0; i < f.s.length; i++) {
    need.push([f.s[i], f.h[i] + 4.4 + 10]);
    for (let back = 4; back <= 28; back += 8) need.push([f.s[i] - back, f.h[i] + 8.4 + 5]);
  }
  const RISE = 0.35;
  for (let j = 0; j < n; j += 2) {
    const s = j * track.ds;
    let top = 0;
    for (const [at, h] of need) {
      const away = Math.abs(deltaS(track, s, at));
      if (away < 140) top = Math.max(top, h - away * RISE);
    }
    if (top > 0) out.set(j, top - 8);
  }
  return out;
}

/** A tube ring's rib (or lamp, `inset` in from its wall): an ellipse round it, broken where the ring is open. */
function ringHoop(q: TubeRing, inset: number, tube: number, seg = 32, sides = 6): THREE.BufferGeometry {
  const open = q.open ?? 0;
  if (!open && q.radU === undefined) return hoop(q.c, v3().crossVectors(q.u, q.r).normalize(), q.rad - inset, tube, seg, sides);
  // Round the ellipse from where the opening ends to where it begins.
  const a0 = -Math.PI / 2 + open;
  const sweep = Math.PI * 2 - 2 * open;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = a0 + (sweep * i) / seg;
    pts.push(q.c.clone().addScaledVector(q.r, Math.cos(a) * (q.rad - inset)).addScaledVector(q.u, Math.sin(a) * ((q.radU ?? q.rad) - inset)));
  }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, !open), seg, tube, sides, !open).toNonIndexed();
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

/** Windows lit at night (for the emissive map) or by day: dark walls, panes, a few lit warm, a few cold. */
function windowTexture(lit: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = lit ? '#000000' : '#2a3a48';
  g.fillRect(0, 0, 64, 64);
  let s = 31;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 4294967296);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 4; x++) {
      const r = rnd();
      const on = r < 0.35 ? '#ffd28a' : r < 0.5 ? '#9ff0ff' : null;
      g.fillStyle = on ? (lit ? on : '#4a5866') : lit ? '#000000' : '#1c2832';
      g.fillRect(x * 16 + 2, y * 8 + 2, 12, 5);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** Abyss Line's sign over the road into the town, as the plain look letters it. */
function abyssSign(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 200;
  const g = c.getContext('2d')!;
  g.fillStyle = '#062a3a';
  g.fillRect(0, 0, 640, 200);
  g.strokeStyle = '#9ff0ff';
  g.lineWidth = 4;
  g.strokeRect(10, 10, 620, 180);
  const band = g.createLinearGradient(40, 0, 600, 0);
  band.addColorStop(0, '#2ac0e8');
  band.addColorStop(1, '#3a7cff');
  g.fillStyle = band;
  g.fillRect(40, 142, 560, 14);
  g.fillStyle = '#e8fbff';
  let size = 92;
  g.font = `bold ${size}px "Arial Black", Impact, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  while (g.measureText('ABYSS LINE').width > 560 && size > 30) {
    size -= 4;
    g.font = `bold ${size}px "Arial Black", Impact, sans-serif`;
  }
  g.fillText('ABYSS LINE', 320, 80);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
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

// ---- the world ------------------------------------------------------------------------

export function buildAbyss(ctx: SeaCtx): void {
  const { track, group } = ctx;
  const sea = abyssOf(track);
  if (!sea) return;
  const def = track.def as CircuitDef;
  const starts = pieceStarts(def);
  const range = (name: string) => rangeOf(track, starts, name);
  const rnd = mulberry(4111);
  const { centre, radius: DR } = sea.dome;

  // ---- the sea floor ----
  {
    const { x0, z0, cell, nx, nz, h } = sea.grid;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const sand = new THREE.Color(0xcfc6a2);
    const rock = new THREE.Color(0x4a5a5e);
    const deep = new THREE.Color(0x1e3a4a);
    const town = new THREE.Color(0x8a9496);
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
        const steep = THREE.MathUtils.clamp(Math.hypot(sx, sz) * 1.4, 0, 1);
        const dz = THREE.MathUtils.clamp(-h[o] / 140, 0, 1);
        const inTown = Math.hypot(x - centre.x, z - centre.z) < DR;
        c.copy(inTown ? town : sand).lerp(rock, steep).lerp(deep, dz * 0.8).multiplyScalar(0.9 + vnoise(x / 9, z / 9) * 0.2);
        col[o * 3] = c.r;
        col[o * 3 + 1] = c.g;
        col[o * 3 + 2] = c.b;
      }
    }
    const idx: number[] = [];
    for (let k = 0; k + 1 < nz; k++) for (let i = 0; i + 1 < nx; i++) {
      const a = k * nx + i;
      idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = floorMaterial();
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = 'sea floor';
    group.add(mesh);
    // The floor beyond, out into the murk, round the grid.
    const W = (nx - 1) * cell;
    const D = (nz - 1) * cell;
    const y = sea.dome.floor - 12;
    const out: THREE.BufferGeometry[] = [];
    const slab = (ax: number, az: number, bx: number, bz: number) => {
      const g = new THREE.PlaneGeometry(bx - ax, bz - az).rotateX(-Math.PI / 2).toNonIndexed();
      g.deleteAttribute('uv');
      g.translate((ax + bx) / 2, y, (az + bz) / 2);
      out.push(g);
    };
    const F = 20000;
    slab(x0 - F, z0 - F, x0 + W + F, z0);
    slab(x0 - F, z0 + D, x0 + W + F, z0 + D + F);
    slab(x0 - F, z0, x0, z0 + D);
    slab(x0 + W, z0, x0 + W + F, z0 + D);
    const far = new THREE.Mesh(mergeGeometries(out), mat);
    far.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(far.geometry.attributes.position.count * 3).fill(0.62), 3));
    far.name = 'sea floor beyond';
    group.add(far);
    ctx.updates.push((time) => (mat.uniforms.uTime.value = time));
    const set = ctx.painted;
    if (set?.surfaces.sand && set.surfaces.trench) {
      let on = false;
      let ready = 0;
      const load = (url: string) =>
        paintedTexture(url, {
          repeat: true,
          onReady: () => {
            ready++;
            mat.uniforms.uPaint.value = on && ready === 2 ? 1 : 0;
          },
        });
      mat.uniforms.uSand.value = load(set.surfaces.sand);
      mat.uniforms.uWall.value = load(set.surfaces.trench);
      ctx.swaps.push((p) => {
        on = p;
        mat.uniforms.uPaint.value = on && ready === 2 ? 1 : 0;
      });
    } else {
      mat.uniforms.uSand.value = mat.uniforms.uWall.value = whiteTexture();
    }
  }

  // ---- the glass tubes round the road ----
  const glass: THREE.BufferGeometry[] = [];
  const ribs: THREE.BufferGeometry[] = [];
  const lights: THREE.BufferGeometry[] = [];
  {
    const n = track.n;
    const twist = range('the Twist');
    // Over the Leap the tube goes on unbroken, raised into a tall vault over
    // as much of the jump as a mech can fly (Overdrive, off the pad: 40 up
    // over the landing), the chase camera over it and a margin, and open
    // underneath over the gap: a diving bell, its air holding the sea out,
    // the chasm below. (tests/flights.test.ts flies it.)
    const vault = leapVault(track, range('gap'));
    const inDome = (i: number) => Math.hypot(track.px[i] - centre.x, track.py[i] - centre.y, track.pz[i] - centre.z) < DR + 6;
    const gapNear = (i: number) => {
      for (let k = -2; k <= 2; k++) {
        const j = (i + k + n) % n;
        if (!track.roadL[j] && !track.roadR[j]) return true;
      }
      return false;
    };
    const frame = (i: number) => ({ p: v3(track.px[i], track.py[i], track.pz[i]), t: v3(track.tx[i], track.ty[i], track.tz[i]), r: v3(track.rx[i], track.ry[i], track.rz[i]), u: v3(track.ux[i], track.uy[i], track.uz[i]) });
    // The tube for plain road: round the road's space (keepout.ts), from a little under the deck.
    const plainRing = (i: number) => {
      const F = frame(i);
      const half = track.hw[i] + KEEP_OUT.side;
      const rad = Math.hypot(half, KEEP_OUT.up - 8) + 3;
      return { c: F.p.clone().addScaledVector(F.u, 8), r: F.r, u: F.u, rad };
    };
    // Round the Twist: on the axis the road wraps round.
    const twistRing = (i: number) => {
      const F = frame(i);
      const half = track.hw[i] + KEEP_OUT.side;
      const rad = Math.hypot(TWIST.radius + KEEP_OUT.down, half) + 2;
      return { c: F.p.clone().addScaledVector(F.u, TWIST.radius), r: F.r, u: F.u, rad };
    };
    // Each strand of the Braid: round its own lane, moved as the fork draws it.
    const strandRing = (i: number, side: -1 | 1) => {
      const F = frame(i);
      const m = track.median[i];
      const mid = (track.hw[i] + m) / 2;
      const half = (track.hw[i] - m) / 2 + KEEP_OUT.side;
      const sh = side < 0 ? track.shiftL[i] : track.shiftR[i];
      const rh = side < 0 ? track.riseL[i] : track.riseR[i];
      // (A strand moves across as fast as it goes along: room for the road's space a sample either side.)
      const rad = Math.hypot(half, KEEP_OUT.up - 8) + 5;
      return { c: F.p.clone().addScaledVector(F.r, side * mid + sh).addScaledVector(F.u, rh + 8), r: F.r, u: F.u, rad };
    };
    type Ring = TubeRing;
    const KINDS = ['plain', 'twist', 'left', 'right', 'joint'] as const;
    const runs: Record<(typeof KINDS)[number], Array<Ring | null>> = { plain: [], twist: [], left: [], right: [], joint: [] };
    /** One sample's rings, by kind of tube (a break in every other kind). */
    const put = (rings: Partial<Record<(typeof KINDS)[number], Ring>>) => {
      for (const k of KINDS) runs[k].push(rings[k] ?? null);
    };
    for (let i = 0; i <= n; i += 2) {
      const j = i % n;
      const s = j * track.ds;
      if (inDome(j)) put({});
      else if (gapNear(j) || vault.has(j)) {
        const P = plainRing(j);
        put({ plain: { ...P, radU: Math.max(P.rad, vault.get(j) ?? 0), open: gapNear(j) ? LEAP_OPEN : 0 } });
      }
      else if (twist && s > twist[0] - 4 && s < twist[1] + 4) put({ twist: twistRing(j) });
      else if (track.median[j] > 0.6) {
        const L = strandRing(j, -1);
        const R = strandRing(j, 1);
        if (L.c.distanceTo(R.c) > L.rad + R.rad + 2) put({ left: L, right: R });
        else {
          // Where the strands part and close: one wide chamber round both.
          const P = plainRing(j);
          put({ joint: { c: L.c.clone().add(R.c).multiplyScalar(0.5), r: P.r, u: P.u, rad: L.c.distanceTo(R.c) / 2 + L.rad + 1 } });
        }
      } else put({ plain: plainRing(j) });
    }
    for (const k of Object.keys(runs) as Array<keyof typeof runs>) {
      // In lengths, so a piece that would stand in another road's space can be left out.
      const list = runs[k];
      for (let a = 0; a < list.length; a += 12) {
        const g = tubeWall(list.slice(a, a + 13));
        if (g && !ctx.inRoad(g, 4)) glass.push(g);
      }
      // A rib every 32 units, and a lamp on it.
      for (let a = 0; a < list.length; a += 4) {
        const q = list[a];
        if (!q) continue;
        // (Square to the road, as the tube's rings are.)
        const rib = ringHoop(q, 0, 0.9, 32, 6);
        const lamp = ringHoop(q, 0.6, 0.35, 32, 4);
        if (ctx.inRoad(rib, 1.5) || ctx.inRoad(lamp, 1.5)) continue;
        ribs.push(colour(rib, 0x4f5c66));
        lights.push(colour(lamp, (a / 4) % 3 === 0 ? 0xffd28a : 0x7ff4ff));
      }
    }
  }

  // ---- the dome, the road round under its roof ----
  {
    const STEP = 6;
    const tiles: THREE.BufferGeometry[] = [];
    const frameRibs: THREE.BufferGeometry[] = [];
    const at = (az: number, el: number, r: number) => {
      const a = (az * Math.PI) / 180;
      const e = (el * Math.PI) / 180;
      return v3(centre.x + Math.cos(a) * Math.cos(e) * r, centre.y + Math.sin(e) * r, centre.z + Math.sin(a) * Math.cos(e) * r);
    };
    const el0 = (Math.asin((sea.dome.floor - centre.y) / DR) * 180) / Math.PI;
    for (let el = el0; el < 90; el += STEP) {
      const e1 = Math.min(90, el + STEP);
      const daz = Math.min(45, STEP / Math.max(0.2, Math.cos((el * Math.PI) / 180)));
      for (let az = 0; az < 360; az += daz) {
        const g = new THREE.BufferGeometry();
        const p = [at(az, el, DR), at(az + daz, el, DR), at(az + daz, e1, DR), at(az, e1, DR)];
        g.setAttribute('position', new THREE.Float32BufferAttribute([p[0], p[1], p[2], p[0], p[2], p[3]].flatMap((q) => [q.x, q.y, q.z]), 3));
        g.computeVertexNormals();
        if (!ctx.inRoad(g, 3)) tiles.push(g);
      }
    }
    // Its frame, outside the glass: along the meridians and round in rings.
    for (let az = 0; az < 360; az += 15) {
      const pts: THREE.Vector3[] = [];
      for (let el = el0; el <= 90; el += 3) pts.push(at(az, el, DR + 1.5));
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 1.2, 5, false).toNonIndexed();
      g.deleteAttribute('uv');
      if (!ctx.inRoad(g, 3)) frameRibs.push(colour(g, 0x4f5c66));
    }
    for (let el = el0 + 12; el < 80; el += 16) {
      const r = DR * Math.cos((el * Math.PI) / 180);
      const g = hoop(v3(centre.x, centre.y + DR * Math.sin((el * Math.PI) / 180), centre.z), v3(0, 1, 0), r + 1.5, 1.0, 96, 5);
      if (!ctx.inRoad(g, 3)) frameRibs.push(colour(g, 0x4f5c66));
    }
    if (tiles.length) {
      const mesh = new THREE.Mesh(mergeGeometries(tiles), glassMaterial(0x7fd8e8, 0xd8fbff, 0.05, 0.5));
      mesh.name = 'dome glass';
      mesh.renderOrder = 2;
      group.add(mesh);
    }
    ribs.push(...frameRibs);
  }

  // ---- the town on the dome's floor ----
  {
    const blocks: THREE.BufferGeometry[] = [];
    const floorY = sea.dome.floor;
    const tint = new THREE.Color();
    for (let k = 0; k < 520; k++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * (DR - 30);
      const x = centre.x + Math.cos(a) * r;
      const z = centre.z + Math.sin(a) * r;
      const roofAt = centre.y + Math.sqrt(Math.max(0, DR * DR - r * r)) - 25;
      const tall = rnd() < 0.15;
      const hgt = Math.min(roofAt - floorY, tall ? 60 + rnd() * 90 : 10 + rnd() * 30);
      if (hgt < 8) continue;
      const w = 12 + rnd() * 18;
      const d = 12 + rnd() * 18;
      const g = new THREE.BoxGeometry(w, hgt, d).toNonIndexed();
      // Windows tile at their size.
      const uv = g.attributes.uv as THREE.BufferAttribute;
      const nor = g.attributes.normal as THREE.BufferAttribute;
      for (let q = 0; q < uv.count; q++) {
        if (Math.abs(nor.getY(q)) > 0.5) uv.setXY(q, 0.02, 0.02);
        else uv.setXY(q, (uv.getX(q) * (Math.abs(nor.getX(q)) > 0.5 ? d : w)) / 24, (uv.getY(q) * hgt) / 24);
      }
      g.rotateY(rnd() * Math.PI);
      g.translate(x, floorY + hgt / 2, z);
      if (ctx.inRoad(g, 4)) continue;
      tint.setHSL(0.52 + rnd() * 0.08, 0.15, 0.55 + rnd() * 0.2);
      blocks.push(colour(g, tint));
    }
    if (blocks.length) {
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: windowTexture(false), emissive: 0xffffff, emissiveMap: windowTexture(true), emissiveIntensity: 1.1 });
      const mesh = new THREE.Mesh(mergeGeometries(blocks), mat);
      mesh.name = 'town';
      group.add(mesh);
      // Painted: the facades (A4), their portholes lit (the build's map of them).
      const set = ctx.painted;
      if (set?.surfaces.facade && set.surfaces.facadeLit) {
        paintedSwap(ctx, mesh, [set.surfaces.facade, set.surfaces.facadeLit], ([map, lit]) => new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: lit, emissiveIntensity: 1.2 }));
      }
    }
  }

  // ---- smaller domes about the sea floor, rocks and kelp ----
  {
    const rocks: THREE.BufferGeometry[] = [];
    const coral: THREE.BufferGeometry[] = [];
    const kelp: THREE.BufferGeometry[] = [];
    const domes: THREE.BufferGeometry[] = [];
    const { x0, z0, cell, nx, nz } = sea.grid;
    const W = (nx - 1) * cell;
    const D = (nz - 1) * cell;
    for (let k = 0; k < 900; k++) {
      const x = x0 + rnd() * W;
      const z = z0 + rnd() * D;
      if (Math.hypot(x - centre.x, z - centre.z) < DR + 20) continue;
      const y = sea.groundAt(x, z);
      const kind = rnd();
      if (kind < 0.04) {
        const r = 30 + rnd() * 50;
        const g = new THREE.SphereGeometry(r, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
        g.deleteAttribute('uv');
        g.translate(x, y - 2, z);
        if (!ctx.inRoad(g, 4)) domes.push(g);
      } else if (kind < 0.16) {
        // A coral head: rounded, low, in rose and orange.
        const s = 5 + rnd() * 9;
        const g = new THREE.IcosahedronGeometry(s, 1).toNonIndexed();
        g.deleteAttribute('uv');
        g.scale(1 + rnd() * 0.5, 0.45 + rnd() * 0.25, 1 + rnd() * 0.5);
        g.translate(x, y + s * 0.1, z);
        g.computeVertexNormals();
        if (!ctx.inRoad(g, 4)) coral.push(colour(g, new THREE.Color([0xd87a8a, 0xe89a5a, 0xe8d8b8][Math.floor(rnd() * 3)]).multiplyScalar(0.8 + rnd() * 0.3)));
      } else if (kind < 0.5) {
        const s = 4 + rnd() * 14;
        const g = new THREE.IcosahedronGeometry(s, 0).toNonIndexed();
        g.deleteAttribute('uv');
        g.scale(1 + rnd() * 0.8, 0.5 + rnd() * 0.5, 1 + rnd() * 0.8);
        g.rotateY(rnd() * 6);
        g.translate(x, y + s * 0.15, z);
        g.computeVertexNormals();
        if (!ctx.inRoad(g, 4)) rocks.push(colour(g, new THREE.Color(0x46565c).multiplyScalar(0.8 + rnd() * 0.4)));
      } else {
        // A clump of kelp: tall ribbons, swaying (in the shader).
        for (let q = 0; q < 4; q++) {
          const hgt = 25 + rnd() * 45;
          const g = new THREE.PlaneGeometry(2.2, hgt, 1, 6).toNonIndexed();
          g.deleteAttribute('uv');
          g.translate(0, hgt / 2, 0);
          g.rotateY(rnd() * Math.PI);
          g.translate(x + (rnd() - 0.5) * 10, y, z + (rnd() - 0.5) * 10);
          if (ctx.inRoad(g, 4)) continue;
          kelp.push(colour(g, new THREE.Color(0x3f7a4a).multiplyScalar(0.7 + rnd() * 0.5)));
        }
      }
    }
    // Painted: the rock and the coral (A4), wrapped on in world space.
    const set = ctx.painted;
    if (rocks.length) {
      const m = new THREE.Mesh(mergeGeometries(rocks), toonMaterial({ color: 0xffffff }));
      m.name = 'rocks';
      group.add(m);
      if (set?.surfaces.rock) paintedSwap(ctx, m, [set.surfaces.rock], ([t]) => paintedSurfaceMaterial(t, t, 26, 26, THREE.FrontSide, { toon: true, dip: 0 }));
    }
    if (coral.length) {
      const m = new THREE.Mesh(mergeGeometries(coral), toonMaterial({ color: 0xffffff }));
      m.name = 'coral';
      group.add(m);
      if (set?.surfaces.coral) paintedSwap(ctx, m, [set.surfaces.coral], ([t]) => paintedSurfaceMaterial(t, t, 22, 22, THREE.FrontSide, { toon: true, dip: 0 }));
    }
    if (domes.length) {
      const m = new THREE.Mesh(mergeGeometries(domes), glassMaterial(0x7fd8e8, 0xffe6b0, 0.12, 0.55));
      m.renderOrder = 2;
      group.add(m);
    }
    if (kelp.length) {
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = { value: 0 };
        mat.userData.shader = sh;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
{
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  float sway = sin(uTime * 0.6 + wp.x * 0.05 + wp.z * 0.04) * 0.08;
  transformed.x += sway * max(wp.y - 0.0, 0.0) * 0.12;
}`,
        );
      };
      const m = new THREE.Mesh(mergeGeometries(kelp), mat);
      m.name = 'kelp';
      group.add(m);
      ctx.updates.push((time) => {
        const sh = mat.userData.shader as { uniforms: Record<string, THREE.IUniform> } | undefined;
        if (sh) sh.uniforms.uTime.value = time;
      });
    }
  }

  // ---- shafts of light down from the surface, and drifting specks ----
  {
    const shafts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 26; k++) {
      const a = rnd() * Math.PI * 2;
      const r = 200 + rnd() * 1800;
      const x = centre.x + Math.cos(a) * r;
      const z = centre.z + Math.sin(a) * r;
      const g = new THREE.CylinderGeometry(30 + rnd() * 40, 6 + rnd() * 10, 900, 10, 1, true).toNonIndexed();
      g.deleteAttribute('uv');
      g.rotateZ((rnd() - 0.5) * 0.3);
      g.translate(x, 450 + 40, z);
      shafts.push(g);
    }
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying float vY;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vY = position.y;
          vNormal = normalize(mat3(modelMatrix) * normal);
          vView = normalize(cameraPosition - w.xyz);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        varying float vY;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float side = abs(dot(normalize(vNormal), vView));
          float a = 0.05 * side * smoothstep(-40.0, 300.0, vY) * (1.0 - smoothstep(600.0, 900.0, vY));
          gl_FragColor = vec4(vec3(0.6, 0.95, 1.0) * a, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(mergeGeometries(shafts), mat);
    m.name = 'light shafts';
    m.renderOrder = 3;
    group.add(m);
    // Marine snow, round the camera.
    const pos: number[] = [];
    for (let k = 0; k < 1500; k++) pos.push((rnd() - 0.5) * 300, (rnd() - 0.5) * 200, (rnd() - 0.5) * 300);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const snow = moves(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfefff, size: 0.6, transparent: true, opacity: 0.55, depthWrite: false })));
    snow.name = 'marine snow';
    snow.frustumCulled = false;
    group.add(snow);
    ctx.updates.push((time, camera) => {
      // Drifting down slowly, and wrapped round the camera so there is always some about.
      const p = camera.position;
      snow.position.set(Math.floor(p.x / 300) * 300, Math.floor(p.y / 200) * 200 - ((time * 2) % 200), Math.floor(p.z / 300) * 300);
    });
  }

  // ---- the sign over the road into the town, just inside the dome, on a frame from the deck's edges ----
  const town = range('the Lantern Streets');
  if (town) {
    const s = town[1];
    const W = 96;
    const H = 30;
    const Y = 36;
    const m = new THREE.Matrix4();
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: abyssSign(), side: THREE.DoubleSide }));
    trackMatrix(track, s, 0, Y, Math.PI, m);
    sign.applyMatrix4(m);
    group.add(sign);
    // Painted (track sheet T8), on a panel of its own shape in the same frame.
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
    const post = (d0: number, h0: number, d1: number, h1: number) => {
      frameAt(track, s, f);
      const a = v3(f.px + f.rx * d0 + f.ux * h0, f.py + f.ry * d0 + f.uy * h0, f.pz + f.rz * d0 + f.uz * h0);
      const b = v3(f.px + f.rx * d1 + f.ux * h1, f.py + f.ry * d1 + f.uy * h1, f.pz + f.rz * d1 + f.uz * h1);
      const g = new THREE.CylinderGeometry(1.6, 1.6, a.distanceTo(b), 8).toNonIndexed();
      g.deleteAttribute('uv');
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), b.clone().sub(a).normalize()));
      const mid = a.clone().add(b).multiplyScalar(0.5);
      g.translate(mid.x, mid.y, mid.z);
      if (!ctx.inRoad(g, 2)) ribs.push(colour(g, 0x4f5c66));
    };
    for (const side of [-1, 1]) post(side * (W / 2 + 4), -6, side * (W / 2 + 4), Y + H / 2 + 2);
    post(-W / 2 - 6, Y + H / 2 + 2, W / 2 + 6, Y + H / 2 + 2);
  }

  // ---- into the scene ----
  if (glass.length) {
    const mesh = new THREE.Mesh(mergeGeometries(glass), glassMaterial(0x6fcfe0, 0xcff8ff, 0.035, 0.42));
    mesh.name = 'tubes';
    mesh.renderOrder = 2;
    group.add(mesh);
  }
  if (ribs.length) {
    const mesh = new THREE.Mesh(mergeGeometries(ribs), toonMaterial({ color: 0xffffff }));
    mesh.name = 'tube ribs';
    group.add(mesh);
    // Painted: the dome's frame (A4) on the ribs, the dome's frame and the sign's.
    const set = ctx.painted;
    if (set?.surfaces.frame) paintedSwap(ctx, mesh, [set.surfaces.frame], ([t]) => paintedSurfaceMaterial(t, t, 9, 9, THREE.FrontSide, { toon: true, dip: 0 }));
  }
  seaLife(ctx, sea);
  if (lights.length) {
    const mesh = new THREE.Mesh(mergeGeometries(lights), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    mesh.name = 'tube lights';
    group.add(mesh);
  }
}

// ---- sea life (painted only) ----------------------------------------------------------

/** Which way each A3 card faces as painted (-1 left, 1 right, 0 neither), its width (m), and how many. */
const LIFE: Array<{ face: number; width: number; count: number; speed: number }> = [
  { face: -1, width: 80, count: 4, speed: 6 }, // a shoal of silver fish
  { face: 0, width: 40, count: 3, speed: 4 }, // a manta ray, seen from below
  { face: 0, width: 26, count: 5, speed: 0 }, // jellyfish, drifting
  { face: -1, width: 95, count: 2, speed: 5 }, // a whale, far off
  { face: 1, width: 18, count: 3, speed: 3 }, // a turtle
  { face: -1, width: 26, count: 4, speed: 4 }, // reef fish
];

/** A painted card in the water: the painting as painted, see-through where it is, in the water's fog, flipped to face its way. */
function lifeMaterial(map: THREE.Texture, rect: [number, number, number, number]): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null }, uRect: { value: new THREE.Vector4(...rect) }, uFlip: { value: 0 } }]),
    vertexShader: /* glsl */ `
      uniform vec4 uRect;
      uniform float uFlip;
      varying vec2 vUv;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vUv = uRect.xy + vec2(uFlip > 0.5 ? 1.0 - uv.x : uv.x, uv.y) * uRect.zw;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying vec2 vUv;
      #include <common>
      #include <fog_pars_fragment>
      ${UNTONE}
      void main() {
        vec4 t = texture2D(uMap, vUv);
        if (t.a < 0.02) discard;
        gl_FragColor = vec4(unTone(t.rgb), t.a);
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

/**
 * Sea life drifting by, with the painted background: A3's cards (shoals,
 * mantas, jellyfish, whales, turtles, reef fish) in the water well clear of
 * the road, each turning to the camera and swimming slowly round a small
 * circle of its own (the jellyfish bob), flipped so it faces the way it goes.
 */
function seaLife(ctx: SeaCtx, sea: Abyss): void {
  const set = ctx.painted;
  if (!set || set.clouds.cards.length < LIFE.length) return;
  const map = paintedTexture(set.clouds.url);
  const rnd = mulberry(9157);
  const { x0, z0, cell, nx, nz } = sea.grid;
  const group = new THREE.Group();
  group.name = 'sea life';
  const swimmers: Array<{ m: THREE.Mesh; mat: THREE.ShaderMaterial; c: THREE.Vector3; r: number; w: number; ph: number; face: number; bob: number }> = [];
  const geo = new THREE.PlaneGeometry(1, 1);
  const pad = 600;
  LIFE.forEach((kind, k) => {
    const card = set.clouds.cards[k];
    for (let q = 0; q < kind.count; q++) {
      for (let tries = 0; tries < 40; tries++) {
        const x = x0 + pad + rnd() * ((nx - 1) * cell - 2 * pad);
        const z = z0 + pad + rnd() * ((nz - 1) * cell - 2 * pad);
        const r = kind.speed > 0 ? 30 + rnd() * 50 : 8;
        // Clear of the road by its circle and its size, and of the dome.
        if (ctx.clearance(x, z) < r + kind.width + 120) continue;
        if (Math.hypot(x - sea.dome.centre.x, z - sea.dome.centre.z) < sea.dome.radius + r + kind.width) continue;
        const y = sea.groundAt(x, z) + 50 + rnd() * 180;
        const mat = lifeMaterial(map, [card.u0, card.v0, card.u1 - card.u0, card.v1 - card.v0]);
        mat.uniforms.uMap.value = map;
        const m = new THREE.Mesh(geo, mat);
        m.scale.set(kind.width, kind.width / card.aspect, 1);
        m.position.set(x + r, y, z);
        m.frustumCulled = false;
        m.renderOrder = 3;
        group.add(m);
        swimmers.push({ m: moves(m), mat, c: v3(x, y, z), r, w: (kind.speed / r) * (rnd() < 0.5 ? 1 : -1), ph: rnd() * TAU_, face: kind.face, bob: kind.speed > 0 ? 3 : 10 });
        break;
      }
    }
  });
  ctx.group.add(group);
  ctx.paintedOnly.push(group);
  const right = v3();
  const vel = v3();
  ctx.updates.push((time, camera) => {
    if (!group.visible) return;
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    for (const s of swimmers) {
      const a = s.ph + time * s.w;
      s.m.position.set(s.c.x + Math.cos(a) * s.r, s.c.y + Math.sin(time * 0.4 + s.ph) * s.bob, s.c.z + Math.sin(a) * s.r);
      s.m.quaternion.copy(camera.quaternion);
      if (s.face !== 0) {
        // Which way it moves across the picture, against the way it was painted facing.
        vel.set(-Math.sin(a) * s.w, 0, Math.cos(a) * s.w);
        s.mat.uniforms.uFlip.value = Math.sign(vel.dot(right)) === s.face ? 0 : 1;
      }
    }
  });
}

const TAU_ = Math.PI * 2;
