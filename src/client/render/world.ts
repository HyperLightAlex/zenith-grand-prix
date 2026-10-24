// The setting of each circuit: sky, what lies below the road, far hills,
// cumulus and landmarks. Meridian Skyway: golden hour over open sea with a
// city inside the loop. Corkscrew Canyon: dusk over red desert, mesas, the
// rock cut the Narrows runs through and the gorge under the Sky Bridge.
// Helios Drop: high noon above a sea of cloud, floating islands, the Sun
// Gate over the Drop and the Helios spire. Neon Crucible: night over an
// open-pit mine, its benches the Coil, molten metal on its floor, a city
// round its rim and a gantry across it. All procedural in the plain look;
// in the anime look a circuit with a painted background (painted.ts) has its
// sky, far hills, clouds and surfaces painted instead.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pieceStarts, type CircuitDef } from '../../sim/circuit';
import { frameAt, hwAt, makeFrame, type Track } from '../../sim/track';
import { look } from './look';
import { frostOf, inside } from './frost';
import { topSurface, type Dips } from './ground';
import { KEEP_OUT, RoadIndex, inRoadSpace } from './titan/keepout';
import { pitOf } from './pit';
import { PuffStreams, type PuffSource } from './puffs';
import { HORIZON_RINGS, SUN_DISC, UNTONE, paintedCardMaterial, paintedSet, paintedSurfaceMaterial as paintedRock, paintedTexture, paintedTrack, whiteTexture, type PaintedSet } from './painted';
import { COLORS, SUN_DIR, toonMaterial } from './palette';
import { THEMES, type Theme } from './themes';
import { trackMatrix, trackPoint } from './trackSpace';
import { titanPlaceholder } from './titan/placeholder';
import { loadTitan, titanGroundOf, titanModel, type TitanSlot } from './titan/asset';
import type { TitanMat } from './titan/pose';

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const NOISE = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}`;

const skyFragment = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uHalo;
uniform vec3 uCirrus;
uniform float uCirrusAmt;
uniform float uTime;
uniform float uBands;
uniform float uPainted;
uniform sampler2D uPano;
uniform float uPanoSunU;
uniform float uPanoHorizon;
uniform float uSunAz;
uniform vec3 uDiscDir;
uniform vec3 uDiscColor;
uniform vec3 uDiscPlain;
uniform vec3 uGlowPlain;
uniform float uAurora;
varying vec3 vDir;
${NOISE}
${UNTONE}
void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  if (uPainted > 0.5) {
    // The painted sky, round the horizon and up to the zenith, the middle of
    // its sun-side half turned to the sun; the disc drawn over it, where the
    // painting has it, and only above the horizon.
    float elev = asin(clamp(h, -1.0, 1.0));
    float az = atan(dir.z, dir.x);
    vec2 uv = vec2(uPanoSunU + (az - uSunAz) / 6.2831853, uPanoHorizon + (1.0 - uPanoHorizon) * clamp(elev / 1.5707963, 0.0, 1.0));
    if (elev < 0.0) uv.y = uPanoHorizon * clamp(1.0 + elev / 0.06, 0.02, 1.0);
    // Filter as if the texture did not wrap where the azimuth jumps round.
    vec2 dx = dFdx(uv);
    vec2 dy = dFdy(uv);
    dx.x -= floor(dx.x + 0.5);
    dy.x -= floor(dy.x + 0.5);
    vec3 painted = unTone(textureGrad(uPano, vec2(fract(uv.x), uv.y), dx, dy).rgb);
    float sdp = max(dot(dir, uDiscDir), 0.0);
    painted = mix(painted, uDiscColor, smoothstep(0.9990, 0.9993, sdp) * smoothstep(-0.0005, 0.0005, h));
    gl_FragColor = vec4(painted, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    return;
  }
  float t1 = smoothstep(-0.02, 0.22, h);
  float t2 = smoothstep(0.18, 0.85, h);
  if (uBands > 0.5) {
    // Painted: the gradient laid down in bands of flat colour, their edges
    // a little uneven, as a background painter's brush would leave them.
    float wob = (noise(dir.xz * 7.0 + dir.y * 3.0) - 0.5) * 0.06;
    t1 = floor((t1 + wob) * uBands + 0.5) / uBands;
    t2 = floor((t2 + wob) * uBands + 0.5) / uBands;
  }
  vec3 col = mix(uHorizon, uMid, t1);
  col = mix(col, uZenith, t2);
  // Sun (or moon): hard anime disc, soft halo, wide wash.
  float sd = max(dot(dir, uSunDir), 0.0);
  col += uHalo * pow(sd, 9.0) * 0.22;
  col += uGlowPlain * pow(sd, 120.0) * 0.5;
  col = mix(col, uDiscPlain, smoothstep(0.9990, 0.9993, sd));
  // High cirrus, painted in two flat tones.
  if (h > 0.0) {
    vec2 uv = dir.xz / (h + 0.18);
    float c = fbm(uv * vec2(0.9, 2.4) + vec2(uTime * 0.004, 0.0));
    float m = smoothstep(0.52, 0.62, c) * smoothstep(0.02, 0.2, h) * (1.0 - smoothstep(0.55, 0.9, h));
    vec3 cloud = mix(uCirrus, vec3(1.0), smoothstep(0.6, 0.75, c));
    col = mix(col, cloud, m * uCirrusAmt);
  }
  // The aurora: curtains hanging across the sky, swaying slowly, green at
  // their foot and magenta at their head, streaked with rays; painted in
  // flat steps of brightness.
  if (uAurora > 0.0 && h > 0.0) {
    float az = atan(dir.z, dir.x);
    float sway = sin(az * 2.0 + uTime * 0.03) * 0.35 + sin(az * 5.0 - uTime * 0.05) * 0.12;
    float fold = fbm(vec2(az * 2.6 + sway, uTime * 0.012));
    float foot = 0.2 + 0.1 * noise(vec2(az * 3.0, 1.7));
    float hb = smoothstep(foot, foot + 0.03, h) * (1.0 - smoothstep(foot + 0.1, foot + 0.38, h));
    float rays = 0.3 + 0.7 * noise(vec2(az * 90.0 + sway * 20.0, uTime * 0.15));
    float a = smoothstep(0.56, 0.66, fold) * hb * rays;
    a = floor(a * 4.0 + 0.5) / 4.0;
    vec3 ac = mix(vec3(0.1, 1.0, 0.5), vec3(0.75, 0.18, 1.0), smoothstep(foot + 0.04, foot + 0.26, h));
    col += ac * a * 0.3 * uAurora;
  }
  // Below the horizon just continue the haze.
  col = mix(col, uHorizon * 0.92, smoothstep(0.0, -0.08, h));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const groundVertex = /* glsl */ `
varying vec3 vWorld;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const seaFragment = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSky;
uniform vec3 uSunDir;
uniform float uTime;
uniform float uPainted;
uniform sampler2D uSeaMap;
uniform float uSeaScale;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
${NOISE}
${UNTONE}
void main() {
  if (uPainted > 0.5) {
    // The painted sea, drifting slowly, with the sun's road glinting on it.
    vec2 q = vWorld.xz / uSeaScale + vec2(uTime * 0.006, uTime * 0.0025);
    vec3 col = unTone(texture2D(uSeaMap, q).rgb);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 H = normalize(uSunDir + V);
    float glit = step(0.7, noise(vWorld.xz * 0.15 + uTime * 0.4));
    col += vec3(1.0, 0.86, 0.6) * step(0.996, max(dot(vec3(0.0, 1.0, 0.0), H), 0.0)) * glit * 0.8;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
    return;
  }
  vec3 V = normalize(cameraPosition - vWorld);
  float dist = length(cameraPosition - vWorld);
  vec2 p = vWorld.xz;
  // Two drifting noise layers stand in for swell.
  float w = noise(p * 0.012 + vec2(uTime * 0.05, uTime * 0.03)) * 0.6 + noise(p * 0.045 - vec2(uTime * 0.09, 0.0)) * 0.4;
  vec3 N = normalize(vec3((w - 0.5) * 0.35, 1.0, (noise(p * 0.02 + 7.0 + uTime * 0.04) - 0.5) * 0.35));
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 col = mix(uDeep, uShallow, smoothstep(0.35, 0.75, w) * 0.55);
  col = mix(col, uSky, fres * 0.75);
  // Flat-shaded foam flecks and the sun road.
  float fleck = smoothstep(0.80, 0.84, noise(p * 0.09 + vec2(uTime * 0.12, uTime * 0.07)));
  col += vec3(0.9, 0.95, 1.0) * fleck * 0.10 * (1.0 - smoothstep(200.0, 1600.0, dist));
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 220.0);
  float glit = smoothstep(0.55, 0.9, noise(p * 0.15 + uTime * 0.4));
  col += vec3(1.0, 0.86, 0.6) * spec * (0.6 + glit * 1.6);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const MAX_GORGES = 4;

const desertFragment = /* glsl */ `
uniform vec3 uSand;
uniform vec3 uRock;
uniform vec4 uGorgeA[${MAX_GORGES}];
uniform vec4 uGorgeB[${MAX_GORGES}];
uniform float uPainted;
uniform sampler2D uSandMap;
uniform sampler2D uClayMap;
uniform sampler2D uGorgeMap;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
${NOISE}
${UNTONE}
void main() {
  vec2 p = vWorld.xz;
  float big = fbm(p * 0.0009);
  float mid = noise(p * 0.006);
  vec3 col;
  if (uPainted > 0.5) {
    // The painted sand twice, at two sizes and turned, blended by a slow
    // noise so its scrub never lines up into a grid; pans of cracked clay
    // where the plain look has its darker ground; broad light and shade
    // across it all.
    vec3 s1 = texture2D(uSandMap, p / 52.0).rgb;
    vec3 s2 = texture2D(uSandMap, mat2(0.8, -0.6, 0.6, 0.8) * p / 67.0 + 0.37).rgb;
    col = mix(s1, s2, smoothstep(0.3, 0.7, mid));
    vec3 clay = texture2D(uClayMap, p / 96.0).rgb;
    col = mix(clay, col, smoothstep(0.37, 0.41, big + (noise(p * 0.02) - 0.5) * 0.03));
    col *= 0.86 + 0.24 * fbm(p * 0.0023 + 5.3);
  } else {
    col = mix(uRock, uSand, smoothstep(0.38, 0.62, big));
    // Wind ripples in two flat tones, and scattered dark scrub.
    float rip = sin(dot(p, vec2(0.045, 0.018)) + mid * 5.0);
    col *= 0.95 + 0.05 * step(0.0, rip);
    float fl = noise(p * 0.035);
    col = mix(col, uRock * 0.7, smoothstep(0.8, 0.83, fl) * 0.45);
  }
  // Gorges: a lit rim, then shadow falling away into the depths.
  for (int i = 0; i < ${MAX_GORGES}; i++) {
    vec4 a = uGorgeA[i];
    vec4 b = uGorgeB[i];
    if (b.x <= 0.0) continue;
    vec2 rel = p - a.xy;
    float along = dot(rel, a.zw);
    float across = abs(dot(rel, vec2(-a.w, a.z)));
    float w = b.x * (0.82 + 0.36 * noise(vec2(along * 0.018, float(i) * 7.3)));
    w *= smoothstep(b.y, b.y * 0.6, abs(along));
    float inside = 1.0 - smoothstep(w - 2.0, w, across);
    float depth = clamp(1.0 - across / max(w, 1.0), 0.0, 1.0);
    vec3 g;
    if (uPainted > 0.5) {
      // The painted gorge rock, its cracks running down from the rims.
      g = texture2D(uGorgeMap, vec2(along, across) / 46.0).rgb;
      g *= mix(1.0, 0.16, smoothstep(0.05, 0.7, depth));
      g = mix(g, col * 1.12, smoothstep(w - 10.0, w - 4.0, across) * 0.7);
    } else {
      g = mix(uRock * 0.5, uRock * 0.08, smoothstep(0.05, 0.6, depth));
      g = mix(g, uSand * 1.1, smoothstep(w - 12.0, w - 5.0, across) * 0.7);
    }
    col = mix(col, g, inside);
  }
  if (uPainted > 0.5) col = unTone(col);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const cloudFragment = /* glsl */ `
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uDeep;
uniform vec3 uSunDir;
uniform float uTime;
uniform float uPainted;
uniform sampler2D uSeaMap;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
${NOISE}
${UNTONE}
void main() {
  vec2 p = vWorld.xz * 0.0011 + vec2(uTime * 0.004, uTime * 0.0016);
  float c = fbm(p) * 0.8 + noise(p * 6.0) * 0.2;
  vec3 col;
  if (uPainted > 0.5) {
    // The painted cloud sea, drifting, at two sizes blended by a slow noise
    // so its billows never line up into a grid, with broad light and shade.
    vec2 q = vWorld.xz + vec2(uTime * 3.6, uTime * 1.5);
    vec3 a = texture2D(uSeaMap, q / 260.0).rgb;
    vec3 b = texture2D(uSeaMap, mat2(0.8, -0.6, 0.6, 0.8) * q / 340.0 + 0.41).rgb;
    col = mix(a, b, smoothstep(0.3, 0.7, noise(vWorld.xz * 0.0016)));
    col *= 0.9 + 0.16 * smoothstep(0.35, 0.65, c);
    // Thin places: the blue far below shows through.
    col = unTone(mix(uDeep, col, smoothstep(0.27, 0.33, c)));
  } else {
    // Lit where the billows rise toward the sun, shaded where they fall away.
    float c2 = fbm(p + normalize(uSunDir.xz) * 0.025) * 0.8 + noise((p + normalize(uSunDir.xz) * 0.025) * 6.0) * 0.2;
    float lit = step(0.0, c - c2 + 0.004);
    col = mix(uShade, uLit, smoothstep(0.4, 0.62, c));
    col *= mix(0.78, 1.04, lit);
    // Thin places: the blue far below shows through.
    col = mix(uDeep, col, smoothstep(0.28, 0.36, c));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export interface World {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
  /** The sky's material: its `uBands` paints the gradient in flat bands (0 = smooth). */
  sky: THREE.ShaderMaterial;
  update(time: number, camera: THREE.Camera): void;
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

function windowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#c9d3e2';
  g.fillRect(0, 0, 64, 64);
  const rnd = mulberry(11);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 4; x++) {
      const r = rnd();
      g.fillStyle = r < 0.12 ? '#fff3d0' : r < 0.55 ? '#5d7ea8' : '#48648c';
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

/** A box with UVs scaled to its size so the window texture tiles evenly. */
function tower(w: number, h: number, d: number, x: number, y: number, z: number, rot: number, tint: THREE.Color): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const ny = nor.getY(i);
    const nx = nor.getX(i);
    if (Math.abs(ny) > 0.5) uv.setXY(i, 0.02, 0.02);
    else uv.setXY(i, uv.getX(i) * ((Math.abs(nx) > 0.5 ? d : w) / 26), uv.getY(i) * (h / 26));
  }
  paint(g, () => tint);
  g.rotateY(rot);
  g.translate(x, y + h / 2, z);
  return g;
}

/**
 * Texture coordinates for a slab or drum seen mostly from above: its top and
 * bottom mapped flat in plan, its sides round and up, `size` units to a repeat.
 */
function planarUvs(g: THREE.BufferGeometry, size: number): void {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (Math.abs(nor.getY(i)) > 0.5) uv.setXY(i, x / size, z / size);
    else uv.setXY(i, (Math.atan2(z, x) * Math.hypot(x, z)) / size, y / size);
  }
}

/** Give every vertex a colour from its position (non-indexed geometry). */
function paint(g: THREE.BufferGeometry, color: (x: number, y: number, z: number) => THREE.Color): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    // One colour per face, from its centre, so the faces stay flat.
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const c = color(cx, cy, cz);
    for (let k = 0; k < 3; k++) {
      col[(i + k) * 3] = c.r;
      col[(i + k) * 3 + 1] = c.g;
      col[(i + k) * 3 + 2] = c.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Nudge each vertex of a non-indexed geometry outward by a smooth random amount (same for shared corners). */
function roughen(g: THREE.BufferGeometry, amount: number, seed: number): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453;
    const r = (h - Math.floor(h) - 0.5) * 2 * amount;
    const l = Math.hypot(x, z) || 1;
    pos.setXYZ(i, x + (x / l) * r, y, z + (z / l) * r);
  }
  g.computeVertexNormals();
  return g;
}

/** Sandstone strata: bands of colour by height. */
function strata(base: THREE.Color, seed: number): (x: number, y: number, z: number) => THREE.Color {
  const bands = [1.0, 0.86, 1.08, 0.78, 0.95, 1.14, 0.83];
  const out = new THREE.Color();
  return (_x, y) => {
    const k = Math.floor((y + seed * 7) / 11);
    const f = bands[((k % bands.length) + bands.length) % bands.length];
    return out.copy(base).multiplyScalar(f);
  };
}

/** Use `painted` on `mesh` with the painted background, its own material otherwise. */
function swapMaterial(ctx: Ctx, mesh: THREE.Mesh, painted: THREE.Material): void {
  const plain = mesh.material as THREE.Material;
  ctx.swaps.push((on) => (mesh.material = on ? painted : plain));
}

interface Ctx {
  track: Track;
  theme: Theme;
  group: THREE.Group;
  cx: number;
  cz: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Distance from a point to the nearest bit of road, in plan. */
  clearance(x: number, z: number): number;
  /** Whether a piece of scenery reaches into the space the road needs (keepout.ts). */
  inRoad(g: THREE.BufferGeometry): boolean;
  updates: Array<(time: number, camera: THREE.Camera) => void>;
  /** The circuit's painted background, if it has one. */
  painted: PaintedSet | null;
  /** Shown only in the plain look, or only with the painted background. */
  plainOnly: THREE.Object3D[];
  paintedOnly: THREE.Object3D[];
  /** Material changes between the two: called with true for the painted background. */
  swaps: Array<(painted: boolean) => void>;
}

export function buildWorld(track: Track, theme: Theme = THEMES.meridian): World {
  const group = new THREE.Group();
  const painted = paintedSet(theme.id);

  // Track bounds, to place things relative to the loop.
  let minX = 1e9;
  let maxX = -1e9;
  let minZ = 1e9;
  let maxZ = -1e9;
  for (let i = 0; i < track.n; i += 8) {
    minX = Math.min(minX, track.px[i]);
    maxX = Math.max(maxX, track.px[i]);
    minZ = Math.min(minZ, track.pz[i]);
    maxZ = Math.max(maxZ, track.pz[i]);
  }
  let roads: RoadIndex | null = null;
  const ctx: Ctx = {
    track,
    theme,
    group,
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    minX,
    maxX,
    minZ,
    maxZ,
    clearance(x: number, z: number): number {
      let best = 1e9;
      for (let i = 0; i < track.n; i += 6) {
        const dd = (track.px[i] - x) ** 2 + (track.pz[i] - z) ** 2;
        if (dd < best) best = dd;
      }
      return Math.sqrt(best);
    },
    inRoad(g: THREE.BufferGeometry): boolean {
      roads ??= new RoadIndex(track);
      return inRoadSpace(roads, g);
    },
    updates: [],
    painted,
    plainOnly: [],
    paintedOnly: [],
    swaps: [],
  };

  // ---- lights -------------------------------------------------------------
  const sun = new THREE.DirectionalLight(theme.sunLight, theme.sunIntensity);
  sun.position.copy(SUN_DIR).multiplyScalar(1000);
  group.add(sun);
  group.add(new THREE.HemisphereLight(theme.skyLight, theme.groundLight, theme.hemiIntensity));

  // ---- sky ----------------------------------------------------------------
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    uniforms: {
      uZenith: { value: new THREE.Color(theme.skyZenith) },
      uMid: { value: new THREE.Color(theme.skyMid) },
      uHorizon: { value: new THREE.Color(theme.skyHorizon) },
      uSunDir: { value: SUN_DIR.clone() },
      uHalo: { value: new THREE.Color().setRGB(...theme.halo) },
      uCirrus: { value: new THREE.Color().setRGB(...theme.cirrus) },
      uCirrusAmt: { value: theme.cirrusAmount },
      uTime: { value: 0 },
      uBands: { value: 0 },
      uPainted: { value: 0 },
      uPano: { value: null },
      uPanoSunU: { value: painted?.sunU ?? 0.25 },
      uPanoHorizon: { value: painted?.horizonV ?? 0 },
      uSunAz: { value: Math.atan2(SUN_DIR.z, SUN_DIR.x) },
      uDiscDir: { value: discDir(theme.id) },
      uDiscColor: { value: new THREE.Vector3(...(SUN_DISC[theme.id]?.color ?? [1.9, 1.75, 1.45])) },
      uDiscPlain: { value: new THREE.Vector3(...(theme.disc ?? [1.9, 1.75, 1.45])) },
      uGlowPlain: { value: new THREE.Vector3(...(theme.discGlow ?? [1.0, 0.86, 0.62])) },
      uAurora: { value: theme.aurora ?? 0 },
    },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  group.add(sky);
  let skyReady = false;
  if (painted) {
    const pano = paintedTexture(painted.sky, { onReady: () => (skyReady = true) });
    pano.wrapS = THREE.RepeatWrapping;
    skyMat.uniforms.uPano.value = pano;
  }
  ctx.updates.push((time, camera) => {
    skyMat.uniforms.uTime.value = time;
    sky.position.copy(camera.position);
  });

  if (theme.ground === 'desert') buildCanyon(ctx);
  else if (theme.ground === 'clouds') buildHelios(ctx);
  else if (theme.ground === 'pit') buildCrucible(ctx);
  else if (theme.ground === 'ice') buildFrostline(ctx);
  else if (theme.ground === 'wreck') buildTitansRest(ctx);
  else buildMeridian(ctx);
  if (painted) horizonRings(ctx);

  // Switch between the plain scenery and the painted background with the look.
  let showing: boolean | null = null;
  const show = (on: boolean) => {
    showing = on;
    for (const o of ctx.plainOnly) o.visible = !on;
    for (const o of ctx.paintedOnly) o.visible = on;
    for (const f of ctx.swaps) f(on);
  };
  show(false);

  return {
    group,
    sun,
    sky: skyMat,
    update(time: number, camera: THREE.Camera) {
      const on = look.on && painted !== null;
      if (on !== showing) show(on);
      skyMat.uniforms.uPainted.value = on && skyReady ? 1 : 0;
      for (const u of ctx.updates) u(time, camera);
    },
  };
}

/** Where the painted sky's sun disc goes: toward the light, at the height its painting has it. */
function discDir(themeId: string): THREE.Vector3 {
  const disc = SUN_DISC[themeId];
  if (!disc) return SUN_DIR.clone();
  const e = (disc.elevation * Math.PI) / 180;
  const flat = new THREE.Vector3(SUN_DIR.x, 0, SUN_DIR.z).normalize();
  return flat.multiplyScalar(Math.cos(e)).setY(Math.sin(e));
}

/**
 * The painted horizon: each strip on a ring round the circuit, farthest
 * first, standing on the ground and repeating round the full circle. Not
 * fogged: the paintings carry their own distance.
 */
function horizonRings(ctx: Ctx): void {
  const set = ctx.painted!;
  const rings = HORIZON_RINGS[ctx.theme.id] ?? [];
  const rnd = mulberry(4242);
  set.horizon.forEach((strip, i) => {
    const ring = rings[i];
    if (!ring) return;
    const h = ring.radius * Math.tan((ring.degrees * Math.PI) / 180);
    const geo = new THREE.CylinderGeometry(ring.radius, ring.radius, h, 192, 1, true);
    geo.translate(0, h / 2, 0);
    const map = paintedTexture(strip.url);
    map.wrapS = THREE.RepeatWrapping;
    const mat = paintedCardMaterial(map, [0, 0, 1, 1], ring.repeats, THREE.BackSide);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(ctx.cx, ctx.theme.groundY, ctx.cz);
    mesh.rotation.y = rnd() * Math.PI * 2;
    mesh.renderOrder = -9 + i;
    mesh.frustumCulled = false;
    ctx.group.add(mesh);
    ctx.paintedOnly.push(mesh);
  });
}

/** One of the ground shaders, fogged, its clock kept running. */
function groundMaterial(ctx: Ctx, fragment: string, uniforms: Record<string, THREE.IUniform>, side: THREE.Side = THREE.FrontSide): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    vertexShader: groundVertex,
    fragmentShader: fragment,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSunDir: { value: SUN_DIR.clone() }, ...uniforms }]),
    fog: true,
    side,
  });
  ctx.updates.push((time) => {
    mat.uniforms.uTime.value = time;
  });
  return mat;
}

/** A ground plane far wider than the view, drawn with one of the ground shaders. */
function groundPlane(ctx: Ctx, fragment: string, uniforms: Record<string, THREE.IUniform>, y: number): THREE.ShaderMaterial {
  const mat = groundMaterial(ctx, fragment, uniforms);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000, 1, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(ctx.cx, y, ctx.cz);
  mesh.frustumCulled = false;
  ctx.group.add(mesh);
  return mat;
}

/** Cumulus banks: `place` returns a centre and size for each, or null to skip one. */
function cumulus(ctx: Ctx, seed: number, count: number, place: (rnd: () => number) => [number, number, number, number] | null, drift = 400): void {
  const rnd = mulberry(seed);
  const parts: THREE.BufferGeometry[] = [];
  const banks: Array<[number, number, number, number]> = [];
  for (let i = 0; i < count; i++) {
    const at = place(rnd);
    if (!at) continue;
    banks.push(at);
    const [bx, by, bz, size] = at;
    const puffs = 5 + Math.floor(rnd() * 6);
    for (let k = 0; k < puffs; k++) {
      const g = new THREE.IcosahedronGeometry(size * (0.45 + rnd() * 0.55), 1);
      // Flat bottoms, billowing tops.
      g.scale(1.25 + rnd() * 0.6, 0.62 + rnd() * 0.3, 1 + rnd() * 0.4);
      g.translate(bx + (rnd() - 0.5) * size * 2.6, by + rnd() * size * 0.5 + (k === 0 ? size * 0.35 : 0), bz + (rnd() - 0.5) * size * 1.6);
      parts.push(g);
    }
  }
  if (parts.length === 0) return;
  const geo = mergeGeometries(parts)!;
  const col = new Float32Array(geo.attributes.position.count * 3).fill(1);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = toonMaterial({ color: 0xffffff, emissive: ctx.theme.cloudShade, emissiveIntensity: 0.3, fog: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const clouds = new THREE.Group();
  clouds.add(mesh);
  ctx.group.add(clouds);
  ctx.updates.push((time) => {
    clouds.position.x = Math.sin(time * 0.003) * drift;
  });
  if (ctx.painted) {
    ctx.plainOnly.push(mesh);
    paintedClouds(ctx, clouds, banks, seed);
  }
}

/**
 * The painted clouds: a card for each bank, standing on the bank's flat
 * bottom and turning about the upright to face the camera, so it stays level
 * however the camera banks.
 */
function paintedClouds(ctx: Ctx, clouds: THREE.Group, banks: Array<[number, number, number, number]>, seed: number): void {
  const { cards, url } = ctx.painted!.clouds;
  if (cards.length === 0) return;
  const map = paintedTexture(url);
  const rnd = mulberry(seed * 7 + 1);
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, 0.5, 0);
  const meshes: THREE.Mesh[] = [];
  // Two-sided: half the cards are drawn mirrored.
  const mats = cards.map((c) => paintedCardMaterial(map, [c.u0, c.v0, c.u1 - c.u0, c.v1 - c.v0], 1, THREE.DoubleSide));
  for (const [bx, by, bz, size] of banks) {
    const k = Math.floor(rnd() * cards.length);
    const w = size * (3.0 + rnd() * 0.8);
    const m = new THREE.Mesh(geo, mats[k]);
    m.scale.set(rnd() < 0.5 ? -w : w, w / cards[k].aspect, 1);
    m.position.set(bx, by - size * 0.35, bz);
    m.renderOrder = -6;
    m.frustumCulled = false;
    group.add(m);
    meshes.push(m);
  }
  clouds.add(group);
  ctx.paintedOnly.push(group);
  const cam = new THREE.Vector3();
  ctx.updates.push((_time, camera) => {
    if (!group.visible) return;
    camera.getWorldPosition(cam);
    for (const m of meshes) m.rotation.y = Math.atan2(cam.x - m.position.x - clouds.position.x, cam.z - m.position.z);
  });
}

/** Start and end of the first piece whose name starts with `name`, or null. */
function pieceRange(track: Track, name: string): [number, number] | null {
  const def = track.def as CircuitDef;
  if (!('pieces' in def)) return null;
  const i = def.pieces.findIndex((p) => p.name?.startsWith(name));
  if (i < 0) return null;
  const st = pieceStarts(def);
  return [st[i], i + 1 < st.length ? st[i + 1] : track.length];
}

/** Each run of road with no barrier on either side, and each jump gap across the whole road. */
function spans(track: Track, kind: 'open' | 'gap'): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const n = track.n;
  const on = (i: number) => (kind === 'open' ? !track.wallL[i] && !track.wallR[i] && track.roadL[i] && track.roadR[i] : !track.roadL[i] && !track.roadR[i]);
  for (let i = 0; i < n; i++) {
    if (on(i) && !on((i - 1 + n) % n)) {
      let j = i;
      while (on(j % n) && j < i + n) j++;
      out.push([i * track.ds, j * track.ds]);
    }
  }
  return out;
}

/** The point inside the bounds farthest from any road, searched on a grid. */
function openestSpot(ctx: Ctx): [number, number, number] {
  let best: [number, number, number] = [ctx.cx, ctx.cz, ctx.clearance(ctx.cx, ctx.cz)];
  for (let gx = 1; gx < 12; gx++) {
    for (let gz = 1; gz < 12; gz++) {
      const x = ctx.minX + ((ctx.maxX - ctx.minX) * gx) / 12;
      const z = ctx.minZ + ((ctx.maxZ - ctx.minZ) * gz) / 12;
      const c = ctx.clearance(x, z);
      if (c > best[2]) best = [x, z, c];
    }
  }
  return best;
}

// ---- Meridian Skyway ------------------------------------------------------

function buildMeridian(ctx: Ctx): void {
  const { track, group, cx, cz, minX, maxX, minZ, maxZ, theme } = ctx;

  // ---- sea ----------------------------------------------------------------
  const seaMat = groundPlane(
    ctx,
    seaFragment,
    {
      uDeep: { value: new THREE.Color(theme.groundDeep) },
      uShallow: { value: new THREE.Color(theme.groundLight2) },
      uSky: { value: new THREE.Color(0xbfd8f5) },
      uPainted: { value: 0 },
      uSeaMap: { value: null },
      uSeaScale: { value: 170 },
    },
    -6,
  );
  const surf = ctx.painted?.surfaces;
  if (surf) {
    seaMat.uniforms.uSeaMap.value = paintedTexture(surf.sea, { repeat: true });
    ctx.swaps.push((on) => (seaMat.uniforms.uPainted.value = on ? 1 : 0));
  }

  // ---- city ---------------------------------------------------------------
  {
    const rnd = mulberry(2049);
    // Three kinds of tower, for the painted facades: glass offices, hotels, dark glass.
    const parts: THREE.BufferGeometry[][] = [[], [], []];
    const decks: THREE.BufferGeometry[] = [];
    const tints = [new THREE.Color(0xffffff), new THREE.Color(0xe6ecf5), new THREE.Color(0xffe9d2), new THREE.Color(0xd5e4f7)];
    // A handful of districts: islands of towers inside and around the loop.
    const districts: Array<[number, number, number, number]> = [
      [cx - 60, cz - 80, 520, 90],
      [cx + 240, cz + 520, 300, 46],
      [cx - 420, cz - 780, 260, 40],
      [minX - 620, cz - 200, 380, 50],
      [maxX + 700, cz + 300, 420, 54],
      [cx + 100, minZ - 760, 420, 50],
      [cx - 300, maxZ + 700, 360, 44],
    ];
    for (const [dx, dz, radius, count] of districts) {
      // Low platform the towers stand on.
      const deck = new THREE.CylinderGeometry(radius * 1.04, radius * 0.98, 14, 10).toNonIndexed();
      planarUvs(deck, 60);
      deck.translate(dx, 1, dz);
      decks.push(deck);
      for (let i = 0; i < count; i++) {
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd()) * radius * 0.92;
        const x = dx + Math.cos(a) * r;
        const z = dz + Math.sin(a) * r;
        if (ctx.clearance(x, z) < 120) continue;
        const core = 1 - r / radius;
        const w = 26 + rnd() * 50;
        const d = 26 + rnd() * 50;
        const h = 50 + rnd() * 120 + core * core * (160 + rnd() * 330);
        // The tallest are offices, the low ones hotels, a few dark glass.
        const kind = h > 260 ? (rnd() < 0.6 ? 0 : 2) : rnd() < 0.55 ? 1 : rnd() < 0.6 ? 0 : 2;
        parts[kind].push(tower(w, h, d, x, 8, z, rnd() * 0.6, tints[Math.floor(rnd() * tints.length)]));
        if (h > 240 && rnd() < 0.7) {
          // Setback crown and a mast.
          parts[kind].push(tower(w * 0.6, h * 0.18, d * 0.6, x, 8 + h, z, 0, tints[0]));
          parts[kind].push(tower(2.5, h * 0.22, 2.5, x, 8 + h * 1.18, z, 0, tints[1]));
        }
      }
    }
    const windows = windowTexture();
    // Painted facades, by kind, and how many units of wall each repeat covers (the plain windows: 26).
    const facades: Array<[string, number]> = [
      ['office', 30],
      ['hotel', 26],
      ['dark', 44],
    ];
    parts.forEach((list, kind) => {
      if (list.length === 0) return;
      const cityMat = new THREE.MeshLambertMaterial({ map: windows, vertexColors: true });
      const city = new THREE.Mesh(mergeGeometries(list)!, cityMat);
      city.frustumCulled = false;
      group.add(city);
      const name = facades[kind][0];
      if (surf?.[name]) {
        const facade = paintedTexture(surf[name], { repeat: true });
        facade.repeat.setScalar(26 / facades[kind][1]);
        ctx.swaps.push((on) => (cityMat.map = on ? facade : windows));
      }
    });
    const blank = whiteTexture();
    const deckMat = new THREE.MeshLambertMaterial({ color: 0xb9c2cf, map: blank });
    const deckMesh = new THREE.Mesh(mergeGeometries(decks)!, deckMat);
    deckMesh.frustumCulled = false;
    group.add(deckMesh);
    if (surf?.concrete) {
      const concrete = paintedTexture(surf.concrete, { repeat: true });
      ctx.swaps.push((on) => {
        deckMat.map = on ? concrete : blank;
        deckMat.color.set(on ? 0xffffff : 0xb9c2cf);
      });
    }
  }

  // ---- distant ridgeline --------------------------------------------------
  {
    const rnd = mulberry(77);
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + rnd() * 0.08;
      const r = 9000 + rnd() * 3500;
      const h = 500 + rnd() * 1400;
      const g = new THREE.ConeGeometry(900 + rnd() * 1300, h, 5, 1).toNonIndexed();
      g.rotateY(rnd() * 3);
      g.translate(cx + Math.cos(a) * r, h / 2 - 40, cz + Math.sin(a) * r);
      parts.push(g);
    }
    const ridge = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshLambertMaterial({ color: theme.ridge, flatShading: true }));
    ridge.frustumCulled = false;
    group.add(ridge);
    // The painted horizon replaces it.
    if (ctx.painted) ctx.plainOnly.push(ridge);
  }

  // ---- cumulus ------------------------------------------------------------
  cumulus(ctx, 404, theme.clouds, (rnd) => {
    const a = rnd() * Math.PI * 2;
    const r = 1800 + rnd() * 6500;
    return [cx + Math.cos(a) * r, 520 + rnd() * 900 + r * 0.05, cz + Math.sin(a) * r, 160 + rnd() * 320];
  });

  // ---- landmarks ----------------------------------------------------------
  {
    // The Zenith Ring: a great hoop the Crest Straight runs through.
    const m = new THREE.Matrix4();
    const s = track.length * 0.305;
    const blank = whiteTexture();
    const ringMat = toonMaterial({ color: 0xf1f4f9, vertexColors: false, map: blank });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(92, 7, 8, 40), ringMat);
    const panels = surf?.panels ?? null;
    if (panels) {
      // White panels round the hoop and round its tube.
      const ringPanels = paintedTexture(panels, { repeat: true });
      ringPanels.repeat.set(40, 3);
      ctx.swaps.push((on) => {
        ringMat.map = on ? ringPanels : blank;
        ringMat.color.set(on ? 0xffffff : 0xf1f4f9);
      });
    }
    trackMatrix(track, s, 0, 34, 0, m);
    ring.applyMatrix4(m);
    group.add(ring);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(84.6, 0.9, 6, 60), new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.charge).multiplyScalar(1.6), toneMapped: false }));
    inner.applyMatrix4(m);
    group.add(inner);
    // Twin towers either side of the start with a sky-bridge.
    for (const side of [-1, 1]) {
      const towerMat = new THREE.MeshLambertMaterial({ map: windowTexture(), color: 0xf2f5fa });
      const t = new THREE.Mesh(new THREE.BoxGeometry(46, 420, 46), towerMat);
      const windowsMap = towerMat.map!;
      windowsMap.repeat.set(2, 16);
      if (panels) {
        const towerPanels = paintedTexture(panels, { repeat: true });
        towerPanels.repeat.set(2, 18);
        ctx.swaps.push((on) => {
          towerMat.map = on ? towerPanels : windowsMap;
          towerMat.color.set(on ? 0xffffff : 0xf2f5fa);
        });
      }
      trackMatrix(track, 120, side * 150, 150, 0, m);
      t.applyMatrix4(m);
      group.add(t);
    }
  }
}

// ---- Corkscrew Canyon -------------------------------------------------------

function buildCanyon(ctx: Ctx): void {
  const { track, group, cx, cz, theme } = ctx;
  const rock = new THREE.Color(0xb4573a);
  const rockDark = new THREE.Color(0x8a3d2c);
  const cap = new THREE.Color(0xd99a62);
  const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  // The painted background's rock: strata cliffs and caprock, the hoodoos' softer stone.
  const surf = ctx.painted?.surfaces;
  const tex = (name: string) => (surf?.[name] ? paintedTexture(surf[name], { repeat: true }) : null);
  const strataTex = tex('strata');
  const capTex = tex('caprock');
  const hoodooTex = tex('hoodoo');
  const cliffMat = strataTex && capTex ? paintedRock(strataTex, capTex, 70, 90) : null;

  // ---- the desert floor, with a gorge under the Sky Bridge and a ravine under the Hop
  const gorgeA: THREE.Vector4[] = [];
  const gorgeB: THREE.Vector4[] = [];
  const f = makeFrame();
  const addGorge = (s0: number, s1: number, halfLength: number, scale: number) => {
    const mid = (s0 + s1) / 2;
    frameAt(track, mid, f);
    const l = Math.hypot(f.rx, f.rz) || 1;
    // Running across the road, as wide as the span over it.
    gorgeA.push(new THREE.Vector4(f.px, f.pz, f.rx / l, f.rz / l));
    gorgeB.push(new THREE.Vector4(((s1 - s0) / 2) * scale, halfLength, 0, 0));
  };
  for (const [s0, s1] of spans(track, 'open')) addGorge(s0, s1, 900, 0.85);
  for (const [s0, s1] of spans(track, 'gap')) addGorge(s0 - 10, s1 + 10, 420, 1.2);
  while (gorgeA.length < MAX_GORGES) {
    gorgeA.push(new THREE.Vector4(0, 0, 1, 0));
    gorgeB.push(new THREE.Vector4(0, 0, 0, 0));
  }
  const desertMat = groundPlane(
    ctx,
    desertFragment,
    {
      uSand: { value: new THREE.Color(theme.groundLight2) },
      uRock: { value: new THREE.Color(theme.groundDeep) },
      uGorgeA: { value: gorgeA.slice(0, MAX_GORGES) },
      uGorgeB: { value: gorgeB.slice(0, MAX_GORGES) },
      uPainted: { value: 0 },
      uSandMap: { value: null },
      uClayMap: { value: null },
      uGorgeMap: { value: null },
    },
    theme.groundY,
  );
  if (surf?.sand && surf.lakebed && surf.gorge) {
    desertMat.uniforms.uSandMap.value = paintedTexture(surf.sand, { repeat: true });
    desertMat.uniforms.uClayMap.value = paintedTexture(surf.lakebed, { repeat: true });
    desertMat.uniforms.uGorgeMap.value = paintedTexture(surf.gorge, { repeat: true });
    ctx.swaps.push((on) => (desertMat.uniforms.uPainted.value = on ? 1 : 0));
  }
  /** Is (x, z) over one of the gorges? Nothing stands there. */
  const inGorge = (x: number, z: number) =>
    gorgeA.some((a, i) => {
      const b = gorgeB[i];
      if (b.x <= 0) return false;
      const rx = x - a.x;
      const rz = z - a.y;
      return Math.abs(rx * a.z + rz * a.w) < b.y && Math.abs(-rx * a.w + rz * a.z) < b.x * 1.3 + 40;
    });

  // ---- the cut: rock walls either side from the drop into the canyon to the corkscrew
  {
    const from = pieceRange(track, 'down into the canyon');
    const to = pieceRange(track, 'the Corkscrew');
    if (from && to) {
      const s0 = from[0];
      const s1 = to[0] + 140;
      const top = 82;
      const taper = 220;
      const pos: number[] = [];
      const step = 8;
      const rnd = mulberry(5);
      const jit: number[] = [];
      for (let s = s0; s <= s1 + step; s += step) jit.push(rnd());
      const smooth = (k: number) => (jit[Math.max(0, k - 1)] + jit[k] * 2 + jit[Math.min(jit.length - 1, k + 1)]) / 4;
      for (const side of [-1, 1]) {
        let prev: number[][] | null = null;
        let k = 0;
        for (let s = s0; s <= s1; s += step, k++) {
          frameAt(track, s, f);
          const i = Math.floor(s / track.ds) % track.n;
          const w = track.hw[i];
          const l = Math.hypot(f.rx, f.rz) || 1;
          const rx = (f.rx / l) * side;
          const rz = (f.rz / l) * side;
          const e = Math.min(1, (s - s0) / taper, (s1 - s) / taper);
          const ease = e * e * (3 - 2 * e);
          const j = smooth(k);
          const h = top * ease * (0.88 + 0.24 * j);
          // (offset from the centreline, height): a sheer face, a ragged rim, the plateau beyond.
          const prof: Array<[number, number]> = [
            [w + 9, 0],
            [w + 10 + j * 3, h * 0.55],
            [w + 12 + j * 4, h],
            [w + 34 + j * 10, h + 3 * j],
            [w + 80, h * 0.92],
            [w + 120, 0],
          ];
          const ring = prof.map(([d, y]) => [f.px + rx * d, Math.min(y, Math.max(0, h)), f.pz + rz * d]);
          if (prev) {
            for (let q = 0; q < ring.length - 1; q++) {
              const a = prev[q];
              const b = prev[q + 1];
              const c = ring[q];
              const d = ring[q + 1];
              // Wind the faces toward the road.
              if (side > 0) pos.push(...a, ...b, ...c, ...b, ...d, ...c);
              else pos.push(...a, ...c, ...b, ...b, ...c, ...d);
            }
          }
          prev = ring;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      paint(g, strata(rock, 3));
      const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
      mesh.frustumCulled = false;
      group.add(mesh);
      if (strataTex && capTex) swapMaterial(ctx, mesh, paintedRock(strataTex, capTex, 70, 90, THREE.DoubleSide));
    }
  }

  // ---- mesas, buttes and hoodoos --------------------------------------------
  {
    const rnd = mulberry(1231);
    const parts: THREE.BufferGeometry[] = [];
    const spires: THREE.BufferGeometry[] = [];
    const R = 5200;
    let placed = 0;
    for (let tries = 0; tries < 400 && placed < 46; tries++) {
      const x = cx + (rnd() - 0.5) * R * 2;
      const z = cz + (rnd() - 0.5) * R * 2;
      const big = rnd();
      const radius = 70 + big * big * 260;
      if (ctx.clearance(x, z) < radius * 1.25 + 90 || inGorge(x, z)) continue;
      const h = 70 + rnd() * 160 + big * 120;
      const g = new THREE.CylinderGeometry(radius * (0.72 + rnd() * 0.15), radius, h, 7 + Math.floor(rnd() * 3), 4).toNonIndexed();
      g.translate(0, h / 2, 0);
      roughen(g, radius * 0.08, rnd() * 100);
      g.rotateY(rnd() * 6);
      g.translate(x, -2, z);
      const band = strata(rnd() < 0.5 ? rock : rockDark, rnd() * 9);
      paint(g, (px, py, pz) => (py > h - 3 ? cap : band(px, py, pz)));
      parts.push(g);
      placed++;
    }
    // Hoodoos: thin spires, in clusters near the road.
    for (let tries = 0; tries < 500 && placed < 46 + 60; tries++) {
      const x = cx + (rnd() - 0.5) * 4200;
      const z = cz + (rnd() - 0.5) * 4200;
      const radius = 9 + rnd() * 16;
      if (ctx.clearance(x, z) < 70 || inGorge(x, z)) continue;
      const h = 40 + rnd() * 90;
      const g = new THREE.CylinderGeometry(radius * 0.45, radius, h, 6, 3).toNonIndexed();
      g.translate(0, h / 2, 0);
      roughen(g, radius * 0.25, rnd() * 100);
      // A cap stone balanced on top.
      const capStone = new THREE.CylinderGeometry(radius * 0.9, radius * 0.6, radius * 0.7, 6).toNonIndexed();
      capStone.translate(0, h + radius * 0.3, 0);
      const both = mergeGeometries([g, capStone])!;
      both.translate(x, -1, z);
      paint(both, strata(rnd() < 0.5 ? rock : rockDark, rnd() * 9));
      spires.push(both);
      placed++;
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, rockMat);
    mesh.frustumCulled = false;
    group.add(mesh);
    if (cliffMat) swapMaterial(ctx, mesh, cliffMat);
    if (spires.length > 0) {
      const hoodoos = new THREE.Mesh(mergeGeometries(spires)!, rockMat);
      hoodoos.frustumCulled = false;
      group.add(hoodoos);
      if (hoodooTex && capTex) swapMaterial(ctx, hoodoos, paintedRock(hoodooTex, capTex, 34, 40));
    }
  }

  // ---- a great natural arch, where the desert inside the circuit is widest
  {
    const [ax, az, room] = openestSpot(ctx);
    const r = Math.min(150, room * 0.45);
    const g = new THREE.TorusGeometry(r, r * 0.2, 6, 20, Math.PI).toNonIndexed();
    g.scale(1, 1.15, 1.6);
    roughen(g, r * 0.04, 7);
    g.rotateY(0.7);
    g.translate(ax, -4, az);
    paint(g, strata(rock, 1));
    const arch = new THREE.Mesh(g, rockMat);
    arch.frustumCulled = false;
    group.add(arch);
    if (cliffMat) swapMaterial(ctx, arch, cliffMat);
  }

  // ---- far buttes on the horizon --------------------------------------------
  {
    const rnd = mulberry(78);
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + rnd() * 0.1;
      const r = 9000 + rnd() * 3500;
      const h = 300 + rnd() * 900;
      const rb = 700 + rnd() * 1300;
      const g = new THREE.CylinderGeometry(rb * (0.55 + rnd() * 0.25), rb, h, 6, 1).toNonIndexed();
      g.rotateY(rnd() * 3);
      g.translate(cx + Math.cos(a) * r, h / 2 - 20, cz + Math.sin(a) * r);
      parts.push(g);
    }
    const ridge = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshLambertMaterial({ color: theme.ridge, flatShading: true }));
    ridge.frustumCulled = false;
    group.add(ridge);
    // The painted horizon replaces them.
    if (ctx.painted) ctx.plainOnly.push(ridge);
  }

  // ---- a few high clouds lit from below by the setting sun ------------------
  cumulus(ctx, 405, theme.clouds, (rnd) => {
    const a = rnd() * Math.PI * 2;
    const r = 2500 + rnd() * 6000;
    return [cx + Math.cos(a) * r, 900 + rnd() * 900, cz + Math.sin(a) * r, 180 + rnd() * 300];
  });
}

// ---- Helios Drop ------------------------------------------------------------

function buildHelios(ctx: Ctx): void {
  const { track, group, cx, cz, theme } = ctx;

  const surf = ctx.painted?.surfaces;
  const tex = (name: string, repeat = true) => (surf?.[name] ? paintedTexture(surf[name], { repeat }) : null);

  // ---- the sea of cloud ----------------------------------------------------
  const seaMat = groundPlane(
    ctx,
    cloudFragment,
    {
      uLit: { value: new THREE.Color(theme.groundLight2) },
      uShade: { value: new THREE.Color(theme.groundDeep) },
      uDeep: { value: new THREE.Color(0x2a58a8) },
      uPainted: { value: 0 },
      uSeaMap: { value: null },
    },
    theme.groundY,
  );
  const seaTex = tex('cloudsea');
  if (seaTex) {
    seaMat.uniforms.uSeaMap.value = seaTex;
    ctx.swaps.push((on) => (seaMat.uniforms.uPainted.value = on ? 1 : 0));
  }

  // ---- cloud towers rising out of it, kept clear of the road ---------------
  cumulus(
    ctx,
    406,
    theme.clouds,
    (rnd) => {
      const a = rnd() * Math.PI * 2;
      const r = 500 + rnd() * 7000;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const size = 140 + rnd() * 320;
      if (ctx.clearance(x, z) < size * 2.2 + 80) return null;
      return [x, theme.groundY - size * 0.2 + rnd() * 120, z, size];
    },
    150,
  );

  // ---- floating islands ----------------------------------------------------
  {
    const rnd = mulberry(909);
    const rockParts: THREE.BufferGeometry[] = [];
    const grass: THREE.BufferGeometry[] = [];
    const white: THREE.BufferGeometry[] = [];
    const rockCol = new THREE.Color(0x8c7a6b);
    const rockDark = new THREE.Color(0x6a5b52);
    let placed = 0;
    for (let tries = 0; tries < 300 && placed < 12; tries++) {
      const a = rnd() * Math.PI * 2;
      const r = 300 + rnd() * 3600;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const R = 50 + rnd() * 110;
      if (ctx.clearance(x, z) < R * 1.6 + 120) continue;
      const y = 40 + rnd() * 260;
      const depth = R * (1.4 + rnd() * 0.8);
      const under = new THREE.ConeGeometry(R, depth, 7, 3).toNonIndexed();
      under.rotateX(Math.PI);
      under.translate(0, -depth / 2, 0);
      roughen(under, R * 0.12, rnd() * 50);
      under.translate(x, y, z);
      paint(under, (_px, py) => (Math.floor((y - py) / 14) % 2 ? rockDark : rockCol));
      rockParts.push(under);
      const top = new THREE.CylinderGeometry(R * 1.02, R, 6, 7).toNonIndexed();
      top.translate(x, y + 3, z);
      grass.push(top);
      // A few white buildings on the bigger ones.
      const count = R > 90 ? 2 + Math.floor(rnd() * 4) : rnd() < 0.5 ? 1 : 0;
      for (let k = 0; k < count; k++) {
        const ba = rnd() * Math.PI * 2;
        const br = rnd() * R * 0.55;
        const bh = 14 + rnd() * 50;
        const b = rnd() < 0.5 ? new THREE.CylinderGeometry(6 + rnd() * 6, 8 + rnd() * 6, bh, 8).toNonIndexed() : new THREE.BoxGeometry(12 + rnd() * 16, bh, 12 + rnd() * 16).toNonIndexed();
        b.translate(x + Math.cos(ba) * br, y + 6 + bh / 2, z + Math.sin(ba) * br);
        white.push(b);
      }
      placed++;
    }
    const add = (parts: THREE.BufferGeometry[], mat: THREE.Material, painted: THREE.Material | null) => {
      if (parts.length === 0) return;
      const mesh = new THREE.Mesh(mergeGeometries(parts)!, mat);
      mesh.frustumCulled = false;
      group.add(mesh);
      if (painted) swapMaterial(ctx, mesh, painted);
    };
    // Painted: layered rock under each island, a meadow on top, whitewashed walls.
    const rockTex = tex('islandrock');
    const meadowTex = tex('meadow');
    const wallTex = tex('whitewall');
    add(rockParts, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), rockTex ? paintedRock(rockTex, rockTex, 46, 46) : null);
    add(grass, new THREE.MeshLambertMaterial({ color: 0x8cc46a, flatShading: true }), rockTex && meadowTex ? paintedRock(rockTex, meadowTex, 46, 34) : null);
    add(white, new THREE.MeshLambertMaterial({ color: 0xf4f6fb, flatShading: true }), wallTex ? paintedRock(wallTex, wallTex, 30, 30) : null);
  }

  // ---- far peaks above the cloud, capped with snow ---------------------------
  {
    const rnd = mulberry(79);
    const body: THREE.BufferGeometry[] = [];
    const snow: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2 + rnd() * 0.12;
      const r = 9500 + rnd() * 3500;
      const h = 700 + rnd() * 1900;
      const rb = 800 + rnd() * 1100;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const rot = rnd() * 3;
      const g = new THREE.ConeGeometry(rb, h, 5, 1).toNonIndexed();
      g.rotateY(rot);
      g.translate(x, theme.groundY + h / 2, z);
      body.push(g);
      const cap = new THREE.ConeGeometry(rb * 0.36, h * 0.36, 5, 1).toNonIndexed();
      cap.rotateY(rot);
      cap.scale(1.02, 1, 1.02);
      cap.translate(x, theme.groundY + h - h * 0.18 + 2, z);
      snow.push(cap);
    }
    const peaks = new THREE.Mesh(mergeGeometries(body)!, new THREE.MeshLambertMaterial({ color: theme.ridge, flatShading: true }));
    const caps = new THREE.Mesh(mergeGeometries(snow)!, new THREE.MeshLambertMaterial({ color: 0xf6f9ff, flatShading: true }));
    peaks.frustumCulled = false;
    caps.frustumCulled = false;
    group.add(peaks, caps);
    // The painted horizon replaces them.
    if (ctx.painted) ctx.plainOnly.push(peaks, caps);
  }

  // ---- the Sun Gate: a golden ring over the Drop's gap -----------------------
  const gold = toonMaterial({ color: 0xffcf6a, emissive: 0x6a3a00, emissiveIntensity: 0.35, vertexColors: false, map: whiteTexture() });
  // Painted: engraved gold panels round the ring and the spire's collar.
  const goldTex = tex('gold');
  if (goldTex) {
    goldTex.repeat.set(28, 1);
    const blank = gold.map;
    ctx.swaps.push((on) => {
      gold.map = on ? goldTex : blank;
      gold.color.set(on ? 0xffffff : 0xffcf6a);
      gold.emissiveIntensity = on ? 0.15 : 0.35;
    });
  }
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd27a).multiplyScalar(1.8), toneMapped: false });
  {
    const gaps = spans(track, 'gap').sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
    if (gaps.length > 0) {
      const [s0, s1] = gaps[0];
      const m = new THREE.Matrix4();
      trackMatrix(track, (s0 + s1) / 2, 0, 30, 0, m);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(84, 6, 8, 48), gold);
      ring.applyMatrix4(m);
      const inner = new THREE.Mesh(new THREE.TorusGeometry(77, 1, 6, 64), glow);
      inner.applyMatrix4(m);
      group.add(ring, inner);
    }
  }

  // ---- the Helios spire, in the open sky inside the circuit -------------------
  {
    const [sx, sz, room] = openestSpot(ctx);
    if (room > 160) {
      const white = toonMaterial({ color: 0xf2f5fb, vertexColors: false });
      const height = 640;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(9, 26, height, 8), white);
      shaft.position.set(sx, theme.groundY + height / 2, sz);
      const collar = new THREE.Mesh(new THREE.TorusGeometry(46, 4, 6, 32), gold);
      collar.rotation.x = Math.PI / 2;
      collar.position.set(sx, theme.groundY + height * 0.62, sz);
      const disc = new THREE.Mesh(new THREE.SphereGeometry(30, 20, 14), glow);
      disc.position.set(sx, theme.groundY + height + 34, sz);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(56, 2, 6, 48), glow);
      halo.position.copy(disc.position);
      group.add(shaft, collar, disc, halo);
      // Three fins round the foot.
      for (let k = 0; k < 3; k++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(4, 220, 60), white);
        const a = (k / 3) * Math.PI * 2;
        fin.position.set(sx + Math.cos(a) * 34, theme.groundY + 110, sz + Math.sin(a) * 34);
        fin.rotation.y = -a;
        group.add(fin);
      }
      ctx.updates.push((time) => {
        halo.rotation.y = time * 0.4;
        halo.rotation.x = Math.PI / 2 + Math.sin(time * 0.3) * 0.3;
      });
    }
  }
}

// ---- Frostline -------------------------------------------------------------

/** The sea round the ice shelf: dark, cold water and pack ice drifting in plates. */
const iceSeaFragment = /* glsl */ `
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSky;
uniform vec3 uFloe;
uniform vec3 uSunDir;
uniform float uTime;
uniform float uPainted;
uniform sampler2D uSeaMap;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
${NOISE}
${UNTONE}
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec2 p = vWorld.xz;
  if (uPainted > 0.5) {
    // The painted pack ice, drifting slowly, at two sizes and turned,
    // blended by a slow noise so its floes never line up into a grid.
    vec2 q = p + vec2(uTime * 1.2, uTime * 0.5);
    vec3 a = texture2D(uSeaMap, q / 260.0).rgb;
    vec3 b = texture2D(uSeaMap, mat2(0.8, -0.6, 0.6, 0.8) * q / 330.0 + 0.37).rgb;
    vec3 col = unTone(mix(a, b, smoothstep(0.3, 0.7, noise(p * 0.0017))));
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
    return;
  }
  float w = noise(p * 0.01 + vec2(uTime * 0.03, uTime * 0.02)) * 0.6 + noise(p * 0.04 - vec2(uTime * 0.05, 0.0)) * 0.4;
  vec3 N = normalize(vec3((w - 0.5) * 0.25, 1.0, (noise(p * 0.02 + 7.0) - 0.5) * 0.25));
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 col = mix(uDeep, uShallow, smoothstep(0.35, 0.75, w) * 0.5);
  col = mix(col, uSky, fres * 0.8);
  // Pack ice: plates (the cells of a scatter of points), some open water
  // between, each plate a flat tone with a lit rim.
  vec2 q = p * 0.011 + vec2(noise(p * 0.003), noise(p * 0.003 + 5.2)) * 1.4 + vec2(uTime * 0.004, uTime * 0.0015);
  vec2 cell = floor(q);
  vec2 f = fract(q);
  float d1 = 9.0;
  float d2 = 9.0;
  vec2 id = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = vec2(hash(cell + g), hash(cell + g + 19.1));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; id = cell + g; }
      else if (d < d2) d2 = d;
    }
  }
  float edge = d2 - d1;
  // Thicker near the shelf, thinning out to open water.
  float pack = 0.35 + 0.35 * smoothstep(0.3, 0.7, noise(p * 0.0012 + 1.3));
  float has = step(1.0 - pack, hash(id + 3.7));
  float floe = has * smoothstep(0.08, 0.11, edge);
  float rim = has * (smoothstep(0.08, 0.11, edge) - smoothstep(0.13, 0.16, edge));
  vec3 ice = uFloe * (0.82 + 0.18 * hash(id + 9.1));
  col = mix(col, ice, floe);
  col = mix(col, uFloe * 1.12, rim * 0.6);
  vec3 H = normalize(uSunDir + V);
  col += vec3(0.75, 0.82, 1.0) * pow(max(dot(N, H), 0.0), 160.0) * (1.0 - floe) * 0.8;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** Snow on the shelf and the glacier: drifts in broad soft shade, wind ripples in two tones, glints. */
const snowFragment = /* glsl */ `
uniform vec3 uSnow;
uniform vec3 uShade;
uniform vec3 uCrevasse;
uniform float uCrevasseY;
uniform float uTime;
uniform float uPainted;
uniform sampler2D uSnowMap;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
${NOISE}
${UNTONE}
void main() {
  vec2 p = vWorld.xz;
  float big = fbm(p * 0.0021);
  vec3 col;
  if (uPainted > 0.5) {
    // The painted snow at two sizes and turned, blended by a slow noise,
    // with broad drifts of light and shade across it.
    vec3 a = texture2D(uSnowMap, p / 70.0).rgb;
    vec3 b = texture2D(uSnowMap, mat2(0.8, -0.6, 0.6, 0.8) * p / 93.0 + 0.41).rgb;
    col = mix(a, b, smoothstep(0.3, 0.7, noise(p * 0.004)));
    col *= 0.9 + 0.12 * smoothstep(0.32, 0.58, big);
  } else {
    col = mix(uShade, uSnow, smoothstep(0.32, 0.58, big));
    float rip = sin(dot(p, vec2(0.055, 0.021)) + noise(p * 0.012) * 6.0);
    col *= 0.95 + 0.05 * step(0.0, rip);
  }
  // On the glacier: crevasses, long thin cracks across the flow, deep blue
  // with a pale lip, in sets that come and go.
  if (vWorld.y > uCrevasseY) {
    vec2 q = vec2(p.x * 0.012 + noise(p * 0.006) * 2.2, p.y * 0.0035);
    float c = abs(fract(q.x + noise(vec2(q.y * 3.0, 4.1)) * 0.6) - 0.5);
    float set = smoothstep(0.45, 0.6, noise(p * 0.004 + 2.3));
    float crack = (1.0 - smoothstep(0.012, 0.026, c)) * set;
    float lip = (1.0 - smoothstep(0.026, 0.05, c)) * set;
    col = mix(col, uSnow * 1.04, lip * 0.5);
    col = mix(col, uCrevasse, crack);
  }
  if (uPainted > 0.5) col = unTone(col);
  // Glints that come and go as the camera moves.
  vec2 g = floor(p * 0.7);
  float glint = step(0.996, hash(g)) * step(0.6, noise(p * 0.3 + cameraPosition.xz * 0.02));
  col += vec3(0.7, 0.85, 1.0) * glint * 0.6;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/**
 * An outline in plan, as (x, z), stood up from `y0` to `y1`: ice in bands down
 * the sides, and snow on top, dipping under the road where `dips` says.
 */
function iceBlock(ctx: Ctx, outline: Array<[number, number]>, y0: number, y1: number, top: THREE.Material, bands: (x: number, y: number, z: number) => THREE.Color, paintedSide: THREE.Material | null, dips: Dips): THREE.Mesh {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, steps: Math.max(1, Math.round((y1 - y0) / 9)) });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y0, 0);
  // Only the sides (the extrusion's second group): the top is drawn on its own below.
  const all = geo.toNonIndexed();
  const sides = all.groups.find((g) => g.materialIndex === 1)!;
  const flat = new THREE.BufferGeometry();
  const p = all.attributes.position.array as Float32Array;
  flat.setAttribute('position', new THREE.Float32BufferAttribute(p.slice(sides.start * 3, (sides.start + sides.count) * 3), 3));
  // In bands of colour by height (each face its own, so they stay flat).
  paint(flat, bands);
  flat.computeVertexNormals();
  const side = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x1a2c5a, emissiveIntensity: 0.35 });
  const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(flat, side);
  mesh.frustumCulled = false;
  ctx.group.add(mesh);
  // Painted: the ice cliff down the sides; the top keeps its own (painted) snow.
  if (paintedSide) ctx.swaps.push((on) => (mesh.material = on ? paintedSide : side));
  const cap = new THREE.Mesh(
    topSurface(outline, (x, z) => dips.at(x, z), (x0, z0, x1, z1) => dips.touches(x0, z0, x1, z1, 0)),
    top,
  );
  cap.frustumCulled = false;
  ctx.group.add(cap);
  return mesh;
}

/** Where a turn's (or a spiral's) curvature centres gather: the middle it turns round. */
function turnCentre(track: Track, range: [number, number]): [number, number] {
  let sx = 0;
  let sz = 0;
  let k = 0;
  for (let i = Math.ceil(range[0] / track.ds); i < Math.floor(range[1] / track.ds); i++) {
    const kp = track.kappa[i];
    if (Math.abs(kp) < 1e-4) continue;
    const l = Math.hypot(track.rx[i], track.rz[i]) || 1;
    sx += track.px[i] + track.rx[i] / l / kp;
    sz += track.pz[i] + track.rz[i] / l / kp;
    k++;
  }
  return k ? [sx / k, sz / k] : [0, 0];
}

function buildFrostline(ctx: Ctx): void {
  const { track, group, cx, cz, theme } = ctx;
  const frost = frostOf(track);
  const surf = ctx.painted?.surfaces;
  const tex = (name: string) => (surf?.[name] ? paintedTexture(surf[name], { repeat: true }) : null);
  const snowTex = tex('snow');
  const cliffTex = tex('icecliff');
  const blueTex = tex('blueice');
  const rockTex = tex('rock');
  const fallTex = tex('icefall');
  /** Painted ice, rock or a frozen fall, a little lit from within so it reads at blue hour. */
  const paintedIce = (wall: THREE.Texture | null, size: number, glow = 0.18) => {
    if (!wall || !snowTex) return null;
    const mat = paintedRock(wall, snowTex, size, 60);
    (mat as THREE.MeshLambertMaterial).emissive = new THREE.Color(0x3a5a9a);
    (mat as THREE.MeshLambertMaterial).emissiveIntensity = glow;
    return mat;
  };
  const sky = stars(ctx);
  // The painted sky has its own.
  if (ctx.painted) ctx.plainOnly.push(sky);

  // ---- the sea, and pack ice on it ------------------------------------------
  const seaMat = groundPlane(
    ctx,
    iceSeaFragment,
    {
      uDeep: { value: new THREE.Color(theme.groundDeep) },
      uShallow: { value: new THREE.Color(theme.groundLight2) },
      uSky: { value: new THREE.Color(0x5a6fb0) },
      uFloe: { value: new THREE.Color(0xc6d6f2) },
      uPainted: { value: 0 },
      uSeaMap: { value: null },
    },
    theme.groundY,
  );
  const packTex = tex('packice');
  if (packTex) {
    seaMat.uniforms.uSeaMap.value = packTex;
    ctx.swaps.push((on) => (seaMat.uniforms.uPainted.value = on ? 1 : 0));
  }
  if (!frost) return;
  const { shelfY, glacierY } = frost;

  // ---- the shelf and the glacier on it ---------------------------------------
  const snow = groundMaterial(ctx, snowFragment, {
    uSnow: { value: new THREE.Color(0xeef4ff) },
    uShade: { value: new THREE.Color(0xa8bde6) },
    uCrevasse: { value: new THREE.Color(0x1f4c9c) },
    uCrevasseY: { value: glacierY - 1 },
    uPainted: { value: 0 },
    uSnowMap: { value: snowTex },
  });
  if (snowTex) ctx.swaps.push((on) => (snow.uniforms.uPainted.value = on ? 1 : 0));
  const cliffPaint = paintedIce(cliffTex, 70);
  const deep = new THREE.Color(0x3d6fb8);
  const pale = new THREE.Color(0x9cc6ef);
  const white = new THREE.Color(0xd9e8fa);
  const band = new THREE.Color();
  const bands = (x: number, y: number, z: number) => {
    // The layers wander up and down along the cliff, so they read as strata, not stripes.
    const wob = Math.sin(x * 0.013 + z * 0.007) * 7 + Math.sin(x * 0.041 - z * 0.029) * 3;
    const yy = y + wob;
    const b = Math.floor((yy + 1000) / 11);
    // Old blue ice low down, younger white ice above, the odd thin layer of grit.
    const t = Math.min(1, Math.max(0, yy / 220));
    band.copy(deep).lerp(pale, 0.35 + t * 0.6);
    if (b % 7 === 3) band.lerp(white, 0.3);
    if (b % 13 === 6) band.multiplyScalar(0.84);
    // Vertical fractures: darker blue slices here and there.
    const crack = Math.sin(x * 0.09 + z * 0.11) > 0.97 || Math.sin(x * 0.07 - z * 0.13 + 2.0) > 0.98;
    if (crack) band.lerp(deep, 0.45);
    return band.multiplyScalar(0.96 + 0.04 * (b % 2));
  };
  iceBlock(ctx, frost.shelf, theme.groundY - 6, shelfY, snow, bands, cliffPaint, frost.shelfDips);
  iceBlock(ctx, frost.glacier, shelfY - 2, glacierY, snow, bands, cliffPaint, frost.glacierDips);

  // ---- the Ice Barrel: a tube of clear ice round the climb ---------------------
  {
    const [c0, c1] = frost.climb;
    const pts: THREE.Vector3[] = [];
    for (let i = c0 - 6; i <= c1 + 4; i += 2) pts.push(new THREE.Vector3(track.px[i], track.py[i], track.pz[i]));
    const curve = new THREE.CatmullRomCurve3(pts);
    // Clear of the road's space all round, its ribs too (the climbs either end are the full width).
    const R = 36.5;
    const tubeGeo = new THREE.TubeGeometry(curve, pts.length * 2, R, 20, false);
    const glass = new THREE.MeshLambertMaterial({ color: 0x9fd2ff, emissive: 0x24508f, emissiveIntensity: 0.45, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
    const tube = new THREE.Mesh(tubeGeo, glass);
    tube.frustumCulled = false;
    tube.renderOrder = 3;
    group.add(tube);
    // Ribs of thicker ice round it, and a glowing seam along its top.
    const ribs: THREE.BufferGeometry[] = [];
    const len = curve.getLength();
    const q = new THREE.Quaternion();
    for (let a = 12; a < len; a += 26) {
      const u = a / len;
      const p = curve.getPointAt(u);
      const tng = curve.getTangentAt(u);
      const g = new THREE.TorusGeometry(R + 0.6, 1.8, 6, 28).toNonIndexed();
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tng);
      g.applyQuaternion(q);
      g.translate(p.x, p.y, p.z);
      ribs.push(g);
    }
    const ribMesh = new THREE.Mesh(mergeGeometries(ribs)!, new THREE.MeshLambertMaterial({ color: 0xbfe2ff, emissive: 0x3a74c8, emissiveIntensity: 0.5, flatShading: true }));
    ribMesh.frustumCulled = false;
    group.add(ribMesh);
  }

  // Track-space helpers.
  const m = new THREE.Matrix4();
  const at = new THREE.Vector3();
  const place = (s: number, d: number, h: number) => {
    trackMatrix(track, s, d, h, 0, m);
    return at.setFromMatrixPosition(m);
  };

  // ---- the sign over the Ice Barrel's mouth, on a frame of ice -----------------
  {
    const range = pieceRange(track, 'into the glacier');
    if (range) {
      const s = range[0] - 36;
      const W = 96;
      const H = 30;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: iceSign(), side: THREE.DoubleSide, toneMapped: false }));
      trackMatrix(track, s, 0, 46, Math.PI, m);
      sign.applyMatrix4(m);
      group.add(sign);
      // Painted (track sheet T5), on a panel of its own shape in the same frame.
      const own = paintedTrack.circuitSigns[theme.id];
      if (own) {
        const ph = Math.min(H, W / own.aspect);
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(W, ph), new THREE.MeshBasicMaterial({ map: paintedTexture(own.url), side: THREE.DoubleSide, toneMapped: false }));
        trackMatrix(track, s, 0, 46 + (H - ph) / 2, Math.PI, m);
        panel.applyMatrix4(m);
        group.add(panel);
        ctx.plainOnly.push(sign);
        ctx.paintedOnly.push(panel);
      }
      const frame: THREE.BufferGeometry[] = [];
      for (const side of [-1, 1]) {
        const foot = place(s, side * (W / 2 + 4), 0).clone();
        const head = place(s, side * (W / 2 + 4), 46 + H / 2 + 4).clone();
        const post = new THREE.CylinderGeometry(3.4, 5.5, head.y - shelfY, 6, 1).toNonIndexed();
        post.translate(foot.x, (head.y + shelfY) / 2, foot.z);
        frame.push(paint(post, () => new THREE.Color(0x9cc8f2)));
      }
      const beamGeo = new THREE.BoxGeometry(W + 14, 4, 4).toNonIndexed();
      trackMatrix(track, s, 0, 46 + H / 2 + 4, Math.PI, m);
      beamGeo.applyMatrix4(m);
      frame.push(paint(beamGeo, () => new THREE.Color(0xb6dafa)));
      const fm = new THREE.Mesh(mergeGeometries(frame)!, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x1d3a78, emissiveIntensity: 0.4 }));
      fm.frustumCulled = false;
      group.add(fm);
    }
  }
  const iceMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x1d3a78, emissiveIntensity: 0.4 });
  const blueIce = paintedIce(blueTex, 34, 0.22);
  const add = (parts: THREE.BufferGeometry[], mat: THREE.Material, painted: THREE.Material | null = blueIce) => {
    if (parts.length === 0) return null;
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, mat);
    mesh.frustumCulled = false;
    group.add(mesh);
    if (painted) swapMaterial(ctx, mesh, painted);
    return mesh;
  };
  const tinted = (g: THREE.BufferGeometry, c: THREE.Color) => paint(g, () => c);

  // ---- the Aurora Split: pillars under the bridge, a vault over the caves -----
  {
    const fork = track.forks[0];
    if (fork) {
      const pillars: THREE.BufferGeometry[] = [];
      const vault: THREE.BufferGeometry[] = [];
      const shells: THREE.BufferGeometry[] = [];
      const rnd = mulberry(611);
      const lane = (track.hw[Math.floor((fork.s0 + fork.s1) / 2 / track.ds)] + fork.median) / 2;
      // The caves' section, across the route (right of the middle, so the
      // fork's offset takes it to the route): straight walls up past the road's
      // space, behind the middle wall and the outer barrier, and a low vault over.
      const cave = (i: number): Array<[number, number]> => {
        const din = Math.max(0.5, track.median[i] - KEEP_OUT.side - 1.2);
        const dout = track.hw[i] + KEEP_OUT.side + 1.5;
        const wall = KEEP_OUT.up + 1.5;
        const out: Array<[number, number]> = [[din, 0], [din, wall]];
        const SEG = 10;
        for (let k = 1; k < SEG; k++) {
          const a = Math.PI - (k / SEG) * Math.PI;
          out.push([(din + dout) / 2 + Math.cos(a) * ((dout - din) / 2), wall + Math.sin(a) * 9]);
        }
        out.push([dout, wall], [dout, 0]);
        return out;
      };
      // Only where the caves have swung all the way out, and run straight on (their mouths open where they swing).
      let widest = 0;
      for (let s = fork.s0; s < fork.s1; s += 4) widest = Math.max(widest, Math.abs(track.shiftR[Math.floor(s / track.ds) % track.n]));
      const caved = (i: number) => Math.abs(track.shiftR[i]) > widest - 2;
      for (let s = fork.s0 + 40; s < fork.s1 - 40; s += 4) {
        const i = Math.floor(s / track.ds) % track.n;
        // Under the bridge, where it stands well up: an ice pillar every so often.
        if (track.riseL[i] > 14 && Math.round(s) % 96 < 4) {
          const top = place(s, -lane, -6).clone();
          const h = top.y - shelfY;
          const g = new THREE.CylinderGeometry(5, 9, h, 6, 1).toNonIndexed();
          g.translate(top.x, shelfY + h / 2, top.z);
          pillars.push(tinted(g, new THREE.Color(0x9cc8f2).multiplyScalar(0.9 + rnd() * 0.15)));
        }
        // Over the caves, once they have swung clear: slim ribs of ice, every
        // 40 (a camera beside the route looks through them, and the clear roof).
        if (caved(i) && Math.round(s) % 40 < 4) {
          const path = new THREE.CurvePath<THREE.Vector3>();
          const pts = cave(i).map(([d, h]) => place(s, d, h).clone());
          for (let k = 0; k + 1 < pts.length; k++) path.add(new THREE.LineCurve3(pts[k], pts[k + 1]));
          const g = new THREE.TubeGeometry(path, pts.length * 3, 1, 5, false).toNonIndexed();
          vault.push(tinted(g, new THREE.Color(0xb6dafa).multiplyScalar(0.9 + rnd() * 0.15)));
        }
      }
      // The caves' walls and roof between the ribs: clear ice along the route.
      {
        const pos: number[] = [];
        const idx: number[] = [];
        const SEG = cave(0).length - 1;
        let row = 0;
        for (let s = fork.s0 + 40; s < fork.s1 - 40; s += 8) {
          const i = Math.floor(s / track.ds) % track.n;
          if (!caved(i)) continue;
          for (const [d, h] of cave(i)) {
            const p = place(s, d, h);
            pos.push(p.x, p.y, p.z);
          }
          if (row > 0) {
            const b = (row - 1) * (SEG + 1);
            for (let k = 0; k < SEG; k++) idx.push(b + k, b + SEG + 1 + k, b + k + 1, b + k + 1, b + SEG + 1 + k, b + SEG + 2 + k);
          }
          row++;
        }
        if (row > 1) {
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          g.setIndex(idx);
          g.computeVertexNormals();
          shells.push(g);
        }
      }
      add(pillars, iceMat);
      add(vault, iceMat);
      const shell = add(shells, new THREE.MeshLambertMaterial({ color: 0xa8d6ff, emissive: 0x2a5aa0, emissiveIntensity: 0.5, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }), null);
      if (shell) shell.renderOrder = 3;
    }
  }

  // ---- the Seracs: towers of ice round the turns on top ------------------------
  {
    const rnd = mulberry(1212);
    const parts: THREE.BufferGeometry[] = [];
    const range = pieceRange(track, 'the Seracs');
    const crest = pieceRange(track, 'the crest');
    const near: Array<[number, number]> = [];
    if (range) for (let s = range[0]; s < range[0] + 460; s += 24) near.push([place(s, 0, 0).x, at.z]);
    if (crest) for (let s = crest[0]; s < crest[1]; s += 60) near.push([place(s, 0, 0).x, at.z]);
    let placed = 0;
    for (let tries = 0; tries < 2400 && placed < 90; tries++) {
      const [bx, bz] = near[Math.floor(rnd() * near.length)];
      const a = rnd() * Math.PI * 2;
      const r = 50 + rnd() * 170;
      const x = bx + Math.cos(a) * r;
      const z = bz + Math.sin(a) * r;
      const ground = frost.groundAt(x, z);
      if (ground !== glacierY) continue;
      const w = 7 + rnd() * 14;
      if (ctx.clearance(x, z) < 42 + w) continue;
      const h = 22 + rnd() * rnd() * 90;
      const g = new THREE.CylinderGeometry(w * (0.35 + rnd() * 0.4), w, h, 4 + Math.floor(rnd() * 3), 1).toNonIndexed();
      g.rotateY(rnd() * 3);
      g.rotateZ((rnd() - 0.5) * 0.35);
      g.rotateX((rnd() - 0.5) * 0.35);
      g.translate(x, ground + h / 2 - 2, z);
      const tint = new THREE.Color().setHSL(0.58 + rnd() * 0.04, 0.6, 0.72 + rnd() * 0.16);
      if (ctx.inRoad(g)) continue;
      parts.push(tinted(g, tint));
      placed++;
    }
    // A few on the shelf too, by the low roads.
    for (let tries = 0; tries < 900 && placed < 130; tries++) {
      const a = rnd() * Math.PI * 2;
      const r = 200 + rnd() * 1400;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (frost.groundAt(x, z) !== shelfY) continue;
      const w = 6 + rnd() * 10;
      if (ctx.clearance(x, z) < 60 + w) continue;
      const h = 14 + rnd() * rnd() * 60;
      const g = new THREE.CylinderGeometry(w * (0.3 + rnd() * 0.4), w, h, 5, 1).toNonIndexed();
      g.rotateY(rnd() * 3);
      g.rotateZ((rnd() - 0.5) * 0.3);
      g.translate(x, shelfY + h / 2 - 2, z);
      const tint = new THREE.Color().setHSL(0.58 + rnd() * 0.04, 0.55, 0.74 + rnd() * 0.14);
      if (ctx.inRoad(g)) continue;
      parts.push(tinted(g, tint));
      placed++;
    }
    add(parts, iceMat);
  }

  // ---- the Nunatak: dark rock through the glacier, inside the hairpin ----------
  {
    const range = pieceRange(track, 'T3 the Nunatak');
    if (range) {
      const [nx, nz] = turnCentre(track, range);
      const rnd = mulberry(77);
      const rock: THREE.BufferGeometry[] = [];
      const caps: THREE.BufferGeometry[] = [];
      for (let k = 0; k < 6; k++) {
        const a = rnd() * Math.PI * 2;
        const r = k === 0 ? 0 : 20 + rnd() * 50;
        const rb = k === 0 ? 70 : 30 + rnd() * 30;
        const h = k === 0 ? 170 : 60 + rnd() * 70;
        const x = nx + Math.cos(a) * r;
        const z = nz + Math.sin(a) * r;
        if (k > 0 && ctx.clearance(x, z) < rb + 40) continue;
        const g = new THREE.ConeGeometry(rb, h, 6, 2).toNonIndexed();
        roughen(g, rb * 0.12, k * 7.1);
        g.rotateY(rnd() * 3);
        const cap = new THREE.ConeGeometry(rb * 0.4, h * 0.4, 6, 1).toNonIndexed();
        cap.rotateY(rnd() * 3);
        g.translate(x, glacierY + h / 2 - 6, z);
        cap.translate(x, glacierY + h - h * 0.2 - 5, z);
        if (k > 0 && (ctx.inRoad(g) || ctx.inRoad(cap))) continue;
        rock.push(tinted(g, new THREE.Color(0x2c2f45).multiplyScalar(0.9 + rnd() * 0.25)));
        caps.push(tinted(cap, new THREE.Color(0xeef4ff)));
      }
      add(rock, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), paintedIce(rockTex, 40, 0.08));
      add(caps, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x2a3a70, emissiveIntensity: 0.3 }), paintedIce(snowTex, 40));
    }
  }

  // ---- the Icefall: a frozen cascade the road winds down round ----------------
  {
    const range = pieceRange(track, 'the Icefall');
    if (range) {
      const [fx, fz] = turnCentre(track, range);
      const topY = track.py[Math.floor(range[0] / track.ds)] + 30;
      const rnd = mulberry(4501);
      const parts: THREE.BufferGeometry[] = [];
      // The column, and icicles hanging round it in tiers.
      const core = new THREE.CylinderGeometry(20, 34, topY - shelfY, 7, 4).toNonIndexed();
      roughen(core, 3, 2.2);
      core.translate(fx, (topY + shelfY) / 2, fz);
      parts.push(tinted(core, new THREE.Color(0x8fc2f0)));
      const crown = new THREE.CylinderGeometry(46, 30, 14, 9, 1).toNonIndexed();
      crown.translate(fx, topY, fz);
      parts.push(tinted(crown, new THREE.Color(0xc4e2ff)));
      for (let tier = 0; tier < 4; tier++) {
        const y = topY - tier * ((topY - shelfY) / 4.4);
        const R = 42 - tier * 4;
        const count = 14 - tier;
        for (let k = 0; k < count; k++) {
          const a = (k / count) * Math.PI * 2 + rnd() * 0.3 + tier;
          const len = 18 + rnd() * 34;
          const g = new THREE.ConeGeometry(3 + rnd() * 4, len, 5, 1).toNonIndexed();
          g.rotateX(Math.PI);
          g.translate(fx + Math.cos(a) * R, y - len / 2, fz + Math.sin(a) * R);
          parts.push(tinted(g, new THREE.Color().setHSL(0.57, 0.65, 0.78 + rnd() * 0.12)));
        }
      }
      add(parts, iceMat, paintedIce(fallTex, 46, 0.25));
      // A cold glow in its heart.
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(12, 18, topY - shelfY - 20, 7, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1.1, 1.3), toneMapped: false, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.set(fx, (topY + shelfY) / 2, fz);
      group.add(glow);
    }
  }

  // ---- the Aurora Loop: ribbons of the aurora's light along both sides ---------
  {
    const range = pieceRange(track, 'the Aurora Loop');
    if (range) {
      const pos: number[] = [];
      const col: number[] = [];
      const idx: number[] = [];
      const c = new THREE.Color();
      const green = new THREE.Color(0.25, 1.2, 0.7);
      const magenta = new THREE.Color(0.95, 0.35, 1.15);
      for (const side of [-1, 1]) {
        let row = 0;
        const base = pos.length / 3;
        for (let s = range[0] - 30; s <= range[1] + 30; s += 4) {
          const f = (s - range[0]) / (range[1] - range[0]);
          c.copy(green).lerp(magenta, 0.5 - 0.5 * Math.cos(Math.max(0, Math.min(1, f)) * Math.PI * 2));
          const fade = Math.min(1, Math.max(0, (s - range[0] + 30) / 40), Math.max(0, (range[1] + 30 - s) / 40));
          for (const h of [3.4, 13]) {
            // Past the barrier and the road's space beside it.
            const p = place(s, side * (hwAt(track, s) + KEEP_OUT.side + 1), h);
            pos.push(p.x, p.y, p.z);
            const k = h > 5 ? 0.25 * fade : fade;
            col.push(c.r * k, c.g * k, c.b * k);
          }
          if (row > 0) {
            const b = base + (row - 1) * 2;
            idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
          }
          row++;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      const ribbons = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      ribbons.frustumCulled = false;
      group.add(ribbons);
    }
  }

  // ---- fallen blocks under the glacier's face, the Calving's leavings ----------
  {
    const rnd = mulberry(303);
    const parts: THREE.BufferGeometry[] = [];
    const { face } = frost;
    for (let tries = 0; tries < 400 && parts.length < 24; tries++) {
      const x = face.x0 + rnd() * (face.x1 - face.x0);
      const z = face.z + 20 + rnd() * 160;
      const sz = 8 + rnd() * 22;
      if (frost.groundAt(x, z) !== shelfY || ctx.clearance(x, z) < 40 + sz) continue;
      const g = new THREE.BoxGeometry(sz * (1 + rnd()), sz * (0.6 + rnd() * 0.8), sz * (1 + rnd())).toNonIndexed();
      g.rotateY(rnd() * 3);
      g.rotateX((rnd() - 0.5) * 0.6);
      g.rotateZ((rnd() - 0.5) * 0.6);
      g.translate(x, shelfY + sz * 0.3, z);
      const tint = new THREE.Color().setHSL(0.58, 0.55, 0.7 + rnd() * 0.18);
      if (ctx.inRoad(g)) continue;
      parts.push(tinted(g, tint));
    }
    add(parts, iceMat);
  }

  // ---- icebergs out at sea, and mountains beyond -------------------------------
  {
    const rnd = mulberry(2026);
    const bergs: THREE.BufferGeometry[] = [];
    for (let tries = 0; tries < 500 && bergs.length < 40; tries++) {
      const a = rnd() * Math.PI * 2;
      const r = 1200 + rnd() * 6500;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const w = 40 + rnd() * 160;
      if (frost.groundAt(x, z) !== 0 || inside(frost.shelf, x + w, z) || inside(frost.shelf, x - w, z) || inside(frost.shelf, x, z + w) || inside(frost.shelf, x, z - w)) continue;
      const h = 14 + rnd() * 50;
      // Tabular, flat on top and sheer at the sides, a few with a peak.
      const g = (rnd() < 0.7 ? new THREE.CylinderGeometry(w, w * 1.08, h, 6 + Math.floor(rnd() * 3), 1) : new THREE.ConeGeometry(w, h * 2.6, 6, 1)).toNonIndexed();
      roughen(g, w * 0.14, rnd() * 9);
      g.rotateY(rnd() * 3);
      g.translate(x, theme.groundY + (g.boundingBox ? 0 : 0) + h * 0.45, z);
      bergs.push(paint(g, (_x, y) => (y > theme.groundY + h * 0.7 ? new THREE.Color(0xeaf2ff) : new THREE.Color(0x8dbbe8))));
    }
    add(bergs, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x1d3a78, emissiveIntensity: 0.3 }), paintedIce(cliffTex, 50));
    const body: THREE.BufferGeometry[] = [];
    const caps: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + rnd() * 0.1;
      const r = 9000 + rnd() * 4000;
      const h = 900 + rnd() * 2200;
      const rb = 700 + rnd() * 1200;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const rot = rnd() * 3;
      const g = new THREE.ConeGeometry(rb, h, 5, 1).toNonIndexed();
      g.rotateY(rot);
      g.translate(x, theme.groundY + h / 2, z);
      body.push(g);
      const cap = new THREE.ConeGeometry(rb * 0.5, h * 0.5, 5, 1).toNonIndexed();
      cap.rotateY(rot);
      cap.scale(1.02, 1, 1.02);
      cap.translate(x, theme.groundY + h - h * 0.25 + 2, z);
      caps.push(cap);
    }
    // The painted horizon replaces the far mountains.
    const peaks = add(body, new THREE.MeshLambertMaterial({ color: theme.ridge, flatShading: true }), null);
    const snowcaps = add(caps, new THREE.MeshLambertMaterial({ color: 0xdfe8ff, flatShading: true, emissive: 0x2a3a70, emissiveIntensity: 0.25 }), null);
    if (ctx.painted && peaks && snowcaps) ctx.plainOnly.push(peaks, snowcaps);
  }
}

// ---- Titan's Rest ---------------------------------------------------------

/** A limb between two points: a cylinder from radius `ra` at `a` to `rb` at `b`, non-indexed, without uvs. */
function limb(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, sides = 10): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(rb, ra, Math.max(len, 0.01), sides, 1).toNonIndexed();
  g.deleteAttribute('uv');
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/** A box from corner to corner, non-indexed, without uvs. */
function block(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)).toNonIndexed();
  g.deleteAttribute('uv');
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

/** A tube along points, non-indexed, without uvs. */
function bone(pts: THREE.Vector3[], r: number, sides = 8): THREE.BufferGeometry {
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 3, r, sides, false).toNonIndexed();
  g.deleteAttribute('uv');
  return g;
}

/** Titan's Rest's sign over the road onto the hand, as the plain look letters it. */
function titanSign(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 200;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b84a3a';
  g.fillRect(0, 0, 640, 200);
  g.strokeStyle = '#f3eedf';
  g.lineWidth = 4;
  g.strokeRect(10, 10, 620, 180);
  g.fillStyle = '#3a3f4a';
  g.fillRect(40, 142, 560, 14);
  g.fillStyle = '#f3eedf';
  let size = 92;
  g.font = `bold ${size}px "Arial Black", Impact, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  while (g.measureText("TITAN'S REST").width > 560 && size > 30) {
    size -= 4;
    g.font = `bold ${size}px "Arial Black", Impact, sans-serif`;
  }
  g.fillText("TITAN'S REST", 320, 80);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Titan's Rest: the desert, and the colossus lying on its back in it, built
 * round the road: its arm under the climb, its head under the brow, the halo
 * round the roll behind it, its torso hollow round the Breach, the Ribcage
 * and the Hull, its other arm's elbow over the Long Flank, its sword round
 * the corkscrew. Every part is placed from the road's own pieces.
 */
function buildTitansRest(ctx: Ctx): void {
  const { track, group, cx, cz, theme } = ctx;
  const surf = ctx.painted?.surfaces;
  const tex = (name: string) => (surf?.[name] ? paintedTexture(surf[name], { repeat: true }) : null);
  const f = makeFrame();
  const pointAt = (s: number, d = 0, h = 0) => {
    frameAt(track, s, f);
    return new THREE.Vector3(f.px + f.rx * d + f.ux * h, f.py + f.ry * d + f.uy * h, f.pz + f.rz * d + f.uz * h);
  };
  const range = (name: string) => pieceRange(track, name);

  // ---- the desert -------------------------------------------------------------
  const zeroA = Array.from({ length: MAX_GORGES }, () => new THREE.Vector4(0, 0, 1, 0));
  const zeroB = Array.from({ length: MAX_GORGES }, () => new THREE.Vector4(0, 0, 0, 0));
  const desertMat = groundPlane(
    ctx,
    desertFragment,
    {
      uSand: { value: new THREE.Color(theme.groundLight2) },
      uRock: { value: new THREE.Color(theme.groundDeep) },
      uGorgeA: { value: zeroA },
      uGorgeB: { value: zeroB },
      uPainted: { value: 0 },
      uSandMap: { value: null },
      uClayMap: { value: null },
      uGorgeMap: { value: null },
    },
    theme.groundY,
  );
  const sandTex = tex('sand');
  if (sandTex) {
    desertMat.uniforms.uSandMap.value = sandTex;
    desertMat.uniforms.uClayMap.value = sandTex;
    desertMat.uniforms.uGorgeMap.value = sandTex;
    ctx.swaps.push((on) => (desertMat.uniforms.uPainted.value = on ? 1 : 0));
  }

  // The titan's materials: ivory armour, its faded red markings, slate at the
  // joints, the bronze frame inside, the sword's gunmetal and the halo's bronze.
  const toon = (color: number, emissive = 0x000000, k = 0) => toonMaterial({ color, vertexColors: false, emissive, emissiveIntensity: k });
  const mats = {
    armour: toon(0xe6e0d2),
    red: toon(0xb84a3a),
    slate: toon(0x6e7486),
    frame: toon(0x8a6a3a),
    verdigris: toon(0x5fa08a),
    blade: toon(0x3a3f4a),
    edge: toon(0xb8bcc8),
    bronze: toon(0xc9a04a, 0x3a2400, 0.25),
  };
  const painted = {
    armour: tex('armour'),
    red: tex('armourRed'),
    frame: tex('frame'),
    blade: tex('blade'),
    bronze: tex('bronze'),
  };
  const paintedMat = (wall: THREE.Texture | null, size: number) => (wall ? paintedRock(wall, wall, size, size, THREE.FrontSide, { toon: true, dip: 0 }) : null);
  const swaps: Record<keyof typeof mats, THREE.Material | null> = {
    armour: paintedMat(painted.armour, 60),
    red: paintedMat(painted.red, 60),
    slate: paintedMat(painted.armour, 40),
    frame: paintedMat(painted.frame, 40),
    verdigris: paintedMat(painted.frame, 40),
    blade: paintedMat(painted.blade, 50),
    edge: paintedMat(painted.blade, 50),
    bronze: paintedMat(painted.bronze, 40),
  };
  // The armour shows its inside where the road runs through the titan.
  mats.armour.side = THREE.DoubleSide;
  if (swaps.armour) swaps.armour.side = THREE.DoubleSide;
  const parts: Record<keyof typeof mats, THREE.BufferGeometry[]> = { armour: [], red: [], slate: [], frame: [], verdigris: [], blade: [], edge: [], bronze: [] };
  const titanParts: Record<keyof typeof mats, THREE.BufferGeometry[]> = { armour: [], red: [], slate: [], frame: [], verdigris: [], blade: [], edge: [], bronze: [] };
  const into = (to: typeof parts) => (kind: keyof typeof mats, g: THREE.BufferGeometry) => {
    if (g.attributes.uv) g.deleteAttribute('uv');
    to[kind].push(g.index ? g.toNonIndexed() : g);
  };
  const put = into(parts);

  // ---- the titan ------------------------------------------------------------------
  // Its Blender model when it is in the build (titan/asset.ts). Until then,
  // and while it loads, its simple shapes (titan/pose.ts), laid where the road
  // needs them, with the road's space cut out.
  const palm = range('the Palm');
  if (!palm) return;
  const putTitan = into(titanParts);
  {
    const shapes = titanPlaceholder(track);
    const kindOf: Record<TitanMat, keyof typeof mats> = { armour: 'armour', red: 'red', slate: 'slate', gold: 'bronze', frame: 'frame', visor: 'blade', blade: 'blade' };
    for (const m of Object.keys(shapes) as TitanMat[]) for (const g of shapes[m]) putTitan(kindOf[m], g);
  }
  // The corridors through the Hull: a wall along its left route's outside, and
  // a roof, following the route where it has swung out from the middle (past
  // the road's space: behind the outer barrier, over its top).
  const hull = range('the Hull');
  if (hull) {
    const v = new THREE.Vector3();
    /** A section (d, h across and up the left route) swept along it, as triangles. */
    const sweepLeft = (section: (i: number) => Array<[number, number]>) => {
      const rows: THREE.Vector3[][] = [];
      for (let s = hull[0]; s <= hull[1]; s += 4) {
        const i = Math.floor(s / track.ds) % track.n;
        if (track.shiftL[i] > -10) {
          rows.push([]);
          continue;
        }
        rows.push(section(i).map(([d, h]) => trackPoint(track, s, d, h, v).clone()));
      }
      const pos: number[] = [];
      for (let r = 0; r + 1 < rows.length; r++) {
        const a = rows[r];
        const b = rows[r + 1];
        if (!a.length || !b.length) continue;
        for (let k = 0; k < a.length; k++) {
          const k2 = (k + 1) % a.length;
          for (const p of [a[k], b[k], b[k2], a[k], b[k2], a[k2]]) pos.push(p.x, p.y, p.z);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      return g;
    };
    const roof = KEEP_OUT.up + 12;
    // (The route swings out and back the whole way through, a sample's road
    // space lying across it at a slant, so the wall keeps a little further off.
    // On the middle's side the middle wall is the corridor's.)
    const outer = (i: number) => -(track.hw[i] + KEEP_OUT.side + 3);
    putTitan('frame', sweepLeft((i) => [[outer(i) - 6, -10], [outer(i) - 6, roof], [outer(i), roof], [outer(i), -10]]));
    putTitan('verdigris', sweepLeft((i) => [[outer(i) - 6, roof], [outer(i) - 6, roof + 6], [-0.4, roof + 6], [-0.4, roof]]));
  }
  const body = titanGroundOf(track);
  const placeholder = new THREE.Group();
  placeholder.name = 'titan placeholder';
  group.add(placeholder);
  loadTitan().then((asset) => {
    if (!asset) return;
    const dark = toon(0x2a2e38);
    const jewel = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.75, 0.78), toneMapped: false });
    const kindOf: Partial<Record<TitanSlot, keyof typeof mats>> = { armour: 'armour', red: 'red', slate: 'slate', gold: 'bronze', frame: 'frame', verdigris: 'verdigris', blade: 'blade', edge: 'edge' };
    const on = look.on && ctx.painted !== null;
    const model = titanModel(
      asset,
      (slot) => (slot === 'visor' ? dark : slot === 'jewel' ? jewel : mats[kindOf[slot]!]),
      (mesh, slot) => {
        const sw = kindOf[slot] ? swaps[kindOf[slot]!] : null;
        if (!sw) return;
        const plain = mesh.material as THREE.Material;
        ctx.swaps.push((p) => (mesh.material = p ? sw : plain));
        mesh.material = on ? sw : plain;
      },
    );
    group.add(model);
    placeholder.visible = false;
  }).catch((err) => {
    // Not loaded (no network, or outside a browser): the placeholder stays.
    console.warn('titan model not loaded', err);
  });

  // ---- dunes drifted against it, and wreckage half buried ----------------------------
  {
    const rnd = mulberry(611);
    const dunes: THREE.BufferGeometry[] = [];
    const clear = (x: number, z: number, r: number) => ctx.clearance(x, z) > r + 40;
    for (let tries = 0; tries < 600 && dunes.length < 40; tries++) {
      // Round the titan, drifted against it.
      const x0 = body ? body.minX - 300 : cx - 1500, x1 = body ? body.maxX + 300 : cx + 1500;
      const z0 = body ? body.minZ - 250 : cz - 1500, z1 = body ? body.maxZ + 250 : cz + 1500;
      const x = x0 + rnd() * (x1 - x0);
      const z = z0 + rnd() * (z1 - z0);
      const r = 60 + rnd() * 120;
      if (!clear(x, z, r)) continue;
      const g = new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
      g.deleteAttribute('uv');
      g.scale(1.6 + rnd() * 0.8, 0.22 + rnd() * 0.18, 1);
      g.rotateY(rnd() * 3);
      g.translate(x, -2, z);
      // Stretched, a dune reaches further than its clearance allowed for: none over the road.
      if (ctx.inRoad(g)) continue;
      dunes.push(paint(g, () => new THREE.Color(0xf1e6cc)));
    }
    if (dunes.length) {
      const m = new THREE.Mesh(mergeGeometries(dunes)!, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x6a5e48, emissiveIntensity: 0.35 }));
      m.frustumCulled = false;
      group.add(m);
      if (sandTex) swapMaterial(ctx, m, paintedRock(sandTex, sandTex, 60, 60));
    }
    // Wreckage: armour plates, a gun barrel, a fallen pylon, half buried round about.
    let wrecks = 0;
    for (let tries = 0; tries < 400 && wrecks < 34; tries++) {
      const a = rnd() * Math.PI * 2;
      const r = 400 + rnd() * 1800;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const sz = 40 + rnd() * 70;
      if (!clear(x, z, sz * 1.8)) continue;
      if (body && [[0, 0], [sz, 0], [-sz, 0], [0, sz], [0, -sz]].some(([a, b]) => body.topAt(x + a * 1.6, z + b * 1.6) > -Infinity)) continue;
      const g = rnd() < 0.6 ? block(-sz, sz, -sz * 0.18, sz * 0.18, -sz * 0.7, sz * 0.7) : limb(new THREE.Vector3(-sz * 1.6, 0, 0), new THREE.Vector3(sz * 1.6, 0, 0), sz * 0.3, sz * 0.24, 8);
      g.rotateX((rnd() - 0.5) * 0.7);
      g.rotateZ((rnd() - 0.5) * 0.7);
      g.rotateY(rnd() * 3);
      g.translate(x, sz * 0.05, z);
      const kind = rnd() < 0.2 ? 'red' : rnd() < 0.45 ? 'slate' : 'armour';
      if (ctx.inRoad(g.index ? g.toNonIndexed() : g)) continue;
      put(kind, g);
      wrecks++;
    }
  }

  // ---- far off: other fallen giants, and mountains --------------------------------
  {
    const rnd = mulberry(77);
    const far: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + rnd() * 0.4;
      const r = 2600 + rnd() * 2400;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const kind = k % 3;
      if (kind === 0) {
        // A hand reaching up out of the sand.
        far.push(limb(new THREE.Vector3(x, -40, z), new THREE.Vector3(x + 40, 260, z), 60, 50, 8));
        for (let fi = 0; fi < 4; fi++) far.push(limb(new THREE.Vector3(x + 40 + (fi - 1.5) * 34, 250, z), new THREE.Vector3(x + 40 + (fi - 1.5) * 50, 400 - Math.abs(fi - 1.5) * 30, z + 20), 14, 10, 6));
      } else if (kind === 1) {
        // A helmet, half buried, tipped over.
        const g = block(-150, 150, -60, 160, -130, 130);
        g.rotateZ(0.5);
        g.rotateY(rnd() * 3);
        g.translate(x, 0, z);
        far.push(g);
      } else {
        // A spear, or a sword, stuck at an angle.
        const tip = new THREE.Vector3(x + (rnd() - 0.5) * 300, 380 + rnd() * 200, z + (rnd() - 0.5) * 300);
        far.push(limb(new THREE.Vector3(x, -30, z), tip, 22, 10, 6));
      }
    }
    const farMesh = new THREE.Mesh(mergeGeometries(far)!, toon(0xd8d2c4));
    farMesh.frustumCulled = false;
    group.add(farMesh);
    if (swaps.armour) swapMaterial(ctx, farMesh, swaps.armour);
    const body: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 34; i++) {
      const a = (i / 34) * Math.PI * 2 + rnd() * 0.12;
      const r = 9000 + rnd() * 3500;
      const h = 500 + rnd() * 1200;
      const g = new THREE.ConeGeometry(900 + rnd() * 1200, h, 5, 1).toNonIndexed();
      g.rotateY(rnd() * 3);
      g.translate(cx + Math.cos(a) * r, theme.groundY + h / 2 - 40, cz + Math.sin(a) * r);
      body.push(g);
    }
    const peaks = new THREE.Mesh(mergeGeometries(body)!, new THREE.MeshLambertMaterial({ color: theme.ridge, flatShading: true }));
    peaks.frustumCulled = false;
    group.add(peaks);
    if (ctx.painted) ctx.plainOnly.push(peaks);
  }

  // ---- morning clouds ------------------------------------------------------------
  cumulus(ctx, 707, theme.clouds, (rnd) => {
    const a = rnd() * Math.PI * 2;
    const r = 3000 + rnd() * 6500;
    return [cx + Math.cos(a) * r, 800 + rnd() * 700, cz + Math.sin(a) * r, 160 + rnd() * 260];
  });

  // ---- the sign over the road onto the hand -----------------------------------------
  {
    const s = palm[0] - 40;
    const W = 96;
    const H = 30;
    const m = new THREE.Matrix4();
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: titanSign(), side: THREE.DoubleSide }));
    trackMatrix(track, s, 0, 40, Math.PI, m);
    sign.applyMatrix4(m);
    group.add(sign);
    // Painted (track sheet T6), on a panel of its own shape in the same frame.
    const own = paintedTrack.circuitSigns[theme.id];
    if (own) {
      const ph = Math.min(H, W / own.aspect);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(W, ph), new THREE.MeshBasicMaterial({ map: paintedTexture(own.url), side: THREE.DoubleSide }));
      trackMatrix(track, s, 0, 40 + (H - ph) / 2, Math.PI, m);
      panel.applyMatrix4(m);
      group.add(panel);
      ctx.plainOnly.push(sign);
      ctx.paintedOnly.push(panel);
    }
    for (const side of [-1, 1]) {
      const foot = pointAt(s, side * (W / 2 + 4), -30);
      put('slate', limb(new THREE.Vector3(foot.x, -5, foot.z), new THREE.Vector3(foot.x, foot.y + 30 + 40 + H / 2 + 3, foot.z), 4, 3, 6));
    }
  }

  // All of it, one mesh per material; the placeholder titan on its own, so its model can take its place.
  for (const [into, from] of [[group, parts], [placeholder, titanParts]] as const) {
    for (const kind of Object.keys(from) as Array<keyof typeof mats>) {
      if (from[kind].length === 0) continue;
      const mesh = new THREE.Mesh(mergeGeometries(from[kind])!, mats[kind]);
      mesh.frustumCulled = false;
      into.add(mesh);
      const sw = swaps[kind];
      if (sw) swapMaterial(ctx, mesh, sw);
    }
  }
}

// ---- Neon Crucible ----------------------------------------------------------

/** The pit's floor: a crust broken up over churning melt, molten in the seams. */
const moltenFragment = /* glsl */ `
uniform float uTime;
uniform float uPainted;
uniform sampler2D uMeltMap;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
${NOISE}
${UNTONE}
void main() {
  vec2 p = vWorld.xz;
  vec2 warp = vec2(fbm(p * 0.012 + vec2(uTime * 0.02, 0.0)), fbm(p * 0.012 + vec2(4.7, uTime * 0.017)));
  if (uPainted > 0.5) {
    // The painted melt, its crust drifting and churning a little; the seams
    // glow brighter than painted, past the look's bloom.
    vec2 q = p / 64.0 + (warp - 0.5) * 0.3 + vec2(uTime * 0.004, uTime * 0.0025);
    vec3 t = texture2D(uMeltMap, q).rgb;
    float hot = smoothstep(0.6, 0.95, t.r) * smoothstep(0.2, 0.55, t.g);
    float flick = 0.85 + 0.15 * noise(p * 0.15 + vec2(uTime * 0.7, -uTime * 0.5));
    vec3 c = mix(unTone(t), t * vec3(1.6, 1.05, 0.6), hot * flick);
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
    return;
  }
  float n = fbm(p * 0.03 + warp * 1.8);
  float seam = 1.0 - smoothstep(0.015, 0.07, abs(n - 0.5));
  float open = smoothstep(0.42, 0.3, n);
  float heat = max(seam, open);
  float flick = 0.8 + 0.2 * noise(p * 0.15 + vec2(uTime * 0.7, -uTime * 0.5));
  vec3 crust = mix(vec3(0.035, 0.012, 0.02), vec3(0.12, 0.035, 0.03), fbm(p * 0.09 + 3.0));
  // Open melt red-orange, orange in the seams, yellow only down their middles.
  vec3 melt = mix(vec3(0.7, 0.05, 0.01), vec3(1.1, 0.2, 0.02), smoothstep(0.3, 0.8, heat) * flick);
  melt = mix(melt, vec3(1.45, 0.62, 0.12), smoothstep(0.75, 1.0, seam) * flick);
  vec3 col = mix(crust, melt, heat);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** The plateau round the pit: dark yard slabs, pools of lamplight, the melt's glow near the edge. */
const plateauFragment = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uSeam;
uniform vec2 uCentre;
uniform float uEdge;
uniform float uTime;
uniform float uPainted;
uniform sampler2D uYardMap;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
${NOISE}
${UNTONE}
void main() {
  vec2 p = vWorld.xz;
  vec3 col;
  if (uPainted > 0.5) {
    // The painted yard, at night: darker than painted, with broad light and shade.
    col = unTone(texture2D(uYardMap, p / 48.0).rgb) * 0.62 * (0.8 + 0.4 * fbm(p * 0.003 + 5.3));
  } else {
    float n = fbm(p * 0.003) * 0.6 + noise(p * 0.04) * 0.4;
    col = uBase * (0.7 + 0.6 * n);
    vec2 g = abs(fract(p / 40.0) - 0.5) * 40.0;
    col = mix(col, uSeam, (1.0 - smoothstep(0.3, 0.9, min(g.x, g.y))) * 0.6);
  }
  vec2 cell = floor(p / 150.0);
  vec2 lp = (cell + 0.5 + (vec2(hash(cell), hash(cell + 7.1)) - 0.5) * 0.5) * 150.0;
  float pool = 1.0 - smoothstep(2.0, 20.0, length(p - lp));
  col += vec3(1.0, 0.5, 0.16) * pool * pool * 0.18 * step(0.5, hash(cell + 1.7));
  float r = length(p - uCentre);
  col += vec3(0.55, 0.14, 0.05) * (1.0 - smoothstep(uEdge - 10.0, uEdge + 110.0, r)) * 0.22;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** A floodlight's beam: brightest at the lamp, fading along it and toward its edges. */
const beamVertex = /* glsl */ `
varying float vAlong;
varying vec3 vN;
varying vec3 vV;
void main() {
  vAlong = uv.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const beamFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying float vAlong;
varying vec3 vN;
varying vec3 vV;
void main() {
  // Clamped: with multisampling a pixel at the beam's edge is shaded at its
  // centre, which can lie just outside the cone, where vAlong is a little
  // below zero; pow() of that is NaN, and one NaN pixel is enough for the
  // bloom to black out most of the frame.
  float along = clamp(vAlong, 0.0, 1.0);
  float nl = length(vN);
  float face = nl > 1e-5 ? abs(dot(vN / nl, normalize(vV))) : 0.0;
  // Painted light, as a background painter laid a beam over the scene: a
  // flat wedge with a soft edge, a brighter core near the lamp, fading out
  // over the far half rather than glowing like fog.
  float body = smoothstep(0.1, 0.4, face);
  float core = step(0.82, face) * step(0.6, along) * 0.7;
  float a = (body + core) * smoothstep(0.0, 0.55, along) * uStrength;
  gl_FragColor = vec4(uColor * a, 1.0);
}`;

/**
 * The pour: molten metal falling, drawn as a cel painter drew it, in flat
 * bands across it (a dark red rim, an orange body, a yellow-white core) with
 * brighter streaks sliding down; bright enough for a thin glow, no more.
 */
const pourVertex = /* glsl */ `
varying vec2 vUv;
varying float vFacing;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}`;

const pourFragment = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vFacing;
${NOISE}
void main() {
  float f = vFacing;
  vec3 col = f > 0.74 ? vec3(1.15, 0.72, 0.28) : f > 0.36 ? vec3(1.0, 0.24, 0.03) : vec3(0.45, 0.04, 0.01);
  float streak = step(0.7, noise(vec2(vUv.x * 7.0, vUv.y * 46.0 + uTime * 8.0)));
  col = mix(col, vec3(1.2, 0.85, 0.42), streak * step(0.36, f) * 0.85);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const UP = new THREE.Vector3(0, 1, 0);

/**
 * The pit wall in the painted look: the painted rock laid along the wall
 * (`aWallUv`: metres along it and up it, so it runs on unbroken round the
 * spiral), turning to the scorched rock below `lowTo` and all of it by
 * `lowFrom`, lit by the light and by the melt's glow (`glow`, on `uv`).
 */
function paintedWallMaterial(rock: THREE.Texture, low: THREE.Texture, size: number, lowFrom: number, lowTo: number, glow: THREE.Texture, glowK: number): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: glowK });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRock = { value: rock };
    sh.uniforms.uLow = { value: low };
    sh.uniforms.uSize = { value: size };
    sh.uniforms.uLowFrom = { value: lowFrom };
    sh.uniforms.uLowTo = { value: lowTo };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aWallUv;\nvarying vec2 vWallUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWallUv = aWallUv;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uRock;
uniform sampler2D uLow;
uniform float uSize;
uniform float uLowFrom;
uniform float uLowTo;
varying vec2 vWallUv;
${NOISE}`,
      )
      .replace(
        '#include <map_fragment>',
        `vec2 wuv = vWallUv / uSize;
float wallLow = smoothstep(uLowFrom, uLowTo, vWallUv.y + (noise(vWallUv * vec2(0.02, 0.06)) - 0.5) * 40.0);
vec3 wallPaint = mix(texture2D(uLow, wuv + 0.31).rgb, texture2D(uRock, wuv).rgb, wallLow) * (0.9 + 0.2 * noise(vWallUv * 0.01 + 9.0));
diffuseColor.rgb *= wallPaint;`,
      )
      // The floodlights catch the rock a little, so the painting reads at night.
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += wallPaint * 0.18;');
  };
  mat.customProgramCacheKey = () => 'crucibleWall';
  return mat;
}

/** A box from `a` to `b`, `w` across and `h` deep. */
function beam(a: THREE.Vector3, b: THREE.Vector3, w: number, h = w): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(w, h, Math.max(len, 0.01)).toNonIndexed();
  g.deleteAttribute('uv');
  const dir = b.clone().sub(a).normalize();
  const up = Math.abs(dir.y) > 0.98 ? new THREE.Vector3(1, 0, 0) : UP;
  const m = new THREE.Matrix4().lookAt(a, b, up);
  m.setPosition(a.clone().add(b).multiplyScalar(0.5));
  g.applyMatrix4(m);
  return g;
}

/** One colour on every vertex of a geometry (non-indexed). */
function tint(g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  return paint(g, () => c);
}

/** Night facades: dark walls and windows, and the windows lit (for the emissive map): mostly warm, a few cold. */
function nightWindows(lit: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = lit ? '#000000' : '#161925';
  g.fillRect(0, 0, 64, 64);
  const rnd = mulberry(29);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 4; x++) {
      const r = rnd();
      const on = r < 0.13 ? '#ffc477' : r < 0.18 ? '#cfe6ff' : r < 0.2 ? '#ff8fd8' : null;
      g.fillStyle = on ? (lit ? on : '#2c2c38') : lit ? '#000000' : '#202434';
      g.fillRect(x * 16 + 2, y * 8 + 2, 12, 5);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.anisotropy = 4;
  return t;
}

/** A neon sign: the words in a glowing tube of `color`, framed, on nothing. */
function neonSign(words: string, color: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 512, 160);
  g.lineJoin = 'round';
  g.shadowColor = color;
  g.shadowBlur = 22;
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.strokeRect(14, 14, 484, 132);
  g.font = 'bold 84px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 84;
  while (g.measureText(words).width > 440 && size > 30) {
    size -= 4;
    g.font = `bold ${size}px "Arial Black", Impact, sans-serif`;
  }
  for (let k = 0; k < 3; k++) {
    g.fillStyle = k < 2 ? color : '#ffffff';
    g.shadowBlur = k < 2 ? 26 : 6;
    g.globalAlpha = k < 2 ? 1 : 0.75;
    g.fillText(words, 256, 84);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Frostline's sign over the Ice Barrel's mouth, as the plain look letters it. */
function iceSign(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 200;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0c1430';
  g.fillRect(0, 0, 640, 200);
  g.strokeStyle = '#c8e4ff';
  g.lineWidth = 4;
  g.strokeRect(10, 10, 620, 180);
  const band = g.createLinearGradient(40, 0, 600, 0);
  band.addColorStop(0, '#35f0ff');
  band.addColorStop(0.5, '#3d7bff');
  band.addColorStop(1, '#a05cff');
  g.fillStyle = band;
  g.fillRect(40, 140, 560, 16);
  g.fillStyle = '#ffffff';
  g.font = 'bold 96px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 96;
  while (g.measureText('FROSTLINE').width > 560 && size > 30) {
    size -= 4;
    g.font = `bold ${size}px "Arial Black", Impact, sans-serif`;
  }
  g.fillText('FROSTLINE', 320, 82);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Stars over the night, following the camera like the sky. */
function stars(ctx: Ctx): THREE.Object3D {
  const rnd = mulberry(1717);
  const make = (count: number, size: number, bright: number) => {
    const pos: number[] = [];
    const col: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const y = 0.03 + Math.pow(rnd(), 0.8) * 0.97;
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      pos.push(Math.cos(a) * r * 30000, y * 30000, Math.sin(a) * r * 30000);
      const t = rnd();
      c.setRGB(...((t < 0.12 ? [1.0, 0.82, 0.7] : t < 0.4 ? [0.75, 0.85, 1.0] : [1, 1, 1]) as [number, number, number]));
      c.multiplyScalar(bright * (0.45 + rnd() * 0.55) * Math.min(1, y * 4));
      col.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false, toneMapped: false }));
    p.frustumCulled = false;
    p.renderOrder = -9;
    return p;
  };
  const sky = new THREE.Group();
  sky.add(make(1400, 1.4, 0.9), make(140, 2.4, 1.3));
  ctx.group.add(sky);
  ctx.updates.push((_time, camera) => sky.position.copy(camera.position));
  return sky;
}

function buildCrucible(ctx: Ctx): void {
  const { track, group, theme } = ctx;
  const TAU = Math.PI * 2;
  // The painted background (anime look): the painted sky has its stars, the
  // horizon strips its mountains; the pit, the yard, the melt, the city's
  // facades and the steel take painted textures, the rooftop signs painted
  // neon, and smoke and steam rise off the stacks and the pour.
  const surf = ctx.painted?.surfaces;
  const tex = (name: string) => (surf?.[name] ? paintedTexture(surf[name], { repeat: true }) : null);
  const starField = stars(ctx);
  if (ctx.painted) ctx.plainOnly.push(starField);

  // ---- far mountains, dark against the city's glow ----------------------------
  {
    const rnd = mulberry(80);
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * TAU + rnd() * 0.08;
      const r = 9500 + rnd() * 3500;
      const h = 600 + rnd() * 1500;
      const g = new THREE.ConeGeometry(900 + rnd() * 1300, h, 5, 1).toNonIndexed();
      g.rotateY(rnd() * 3);
      g.translate(ctx.cx + Math.cos(a) * r, theme.groundY + h / 2 - 60, ctx.cz + Math.sin(a) * r);
      parts.push(g);
    }
    const ridge = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshBasicMaterial({ color: theme.ridge }));
    ridge.frustumCulled = false;
    group.add(ridge);
    if (ctx.painted) ctx.plainOnly.push(ridge);
  }

  const pit = pitOf(track);
  if (!pit) {
    groundPlane(ctx, plateauFragment, { uBase: { value: new THREE.Color(theme.groundLight2) }, uSeam: { value: new THREE.Color(theme.groundDeep) }, uCentre: { value: new THREE.Vector2(ctx.cx, ctx.cz) }, uEdge: { value: -1000 }, uPainted: { value: 0 }, uYardMap: { value: null } }, theme.groundY);
    return;
  }
  const { cx, cz, rim, floor, idx, phi, total } = pit;
  const N = idx.length;
  const pt = (i: number, d: number, h: number, out: THREE.Vector3) =>
    out.set(track.px[i] + track.rx[i] * d + track.ux[i] * h, track.py[i] + track.ry[i] * d + track.uy[i] * h, track.pz[i] + track.rz[i] * d + track.uz[i] * h);
  const v = new THREE.Vector3();

  // ---- the pit wall -------------------------------------------------------------
  // A sheer face rises from behind each turn's outer barrier to the underside
  // of the turn above (the plateau, above the top turn); below the first
  // turn, its inner edge drops to the floor.
  interface Column {
    x: number;
    z: number;
    y0: number;
    y1: number;
    /** How far up the Coil, 0..1. */
    up: number;
  }
  const outer: Column[] = [];
  const inner: Column[] = [];
  const edge: THREE.Vector3[] = [];
  let edgeR = 0;
  let floorR = 0;
  for (let q = 0; q < N; q++) {
    const i = idx[q];
    const w = track.hw[i];
    pt(i, -(w + 2.3), -1.6, v);
    const above = phi[q] + TAU <= total ? pit.at(phi[q] + TAU) : -1;
    let top = rim;
    if (above >= 0) {
      const j = idx[Math.round(above)];
      top = track.py[j] + track.ry[j] * track.hw[j] - track.uy[j] * 1.5;
    }
    outer.push({ x: v.x, z: v.z, y0: Math.min(v.y, top), y1: Math.max(v.y, top), up: phi[q] / total });
    if (above < 0) {
      edge.push(new THREE.Vector3(v.x, rim, v.z));
      edgeR = Math.max(edgeR, Math.hypot(v.x - cx, v.z - cz));
    }
    if (phi[q] < TAU) {
      pt(i, w + 2.3, -1.6, v);
      inner.push({ x: v.x, z: v.z, y0: floor - 2, y1: v.y, up: phi[q] / total });
      floorR = Math.max(floorR, Math.hypot(v.x - cx, v.z - cz));
    }
  }
  {
    const basalt = new THREE.Color(0x6a5e86);
    const dark = new THREE.Color(0x4c4466);
    const rust = new THREE.Color(0x8a5040);
    const hot = new THREE.Color(0xb8542a);
    const bands = [1.0, 0.84, 1.1, 0.9, 0.78, 1.04, 0.95];
    const rc = new THREE.Color();
    const rockAt = (y: number) => {
      const b = Math.floor((y + 1000) / 7);
      rc.copy(b % 13 === 4 ? rust : b % 2 ? basalt : dark).multiplyScalar(bands[b % bands.length]);
      const heat = Math.max(0, 1 - (y - floor) / 120);
      return rc.lerp(hot, heat * heat * 0.75);
    };
    const ROWS = 12;
    const faces = (cols: Column[], seed: number): THREE.BufferGeometry => {
      const pos: number[] = [];
      const col: number[] = [];
      // Metres along the wall at each column, for the painted rock.
      const along = [0];
      for (let q = 1; q < cols.length; q++) along.push(along[q - 1] + Math.hypot(cols[q].x - cols[q - 1].x, cols[q].z - cols[q - 1].z));
      const wuv: number[] = [];
      // Each column's points, pushed back into the rock (never out of it) by a smooth amount.
      const P = (q: number, r: number): [number, number, number] => {
        const c = cols[q];
        const y = c.y0 + ((c.y1 - c.y0) * r) / ROWS;
        if (r === 0 || r === ROWS) return [c.x, y, c.z];
        const l = Math.hypot(c.x - cx, c.z - cz) || 1;
        const j = (0.5 + 0.5 * Math.sin(q * 0.31 + r * 2.1 + seed) * Math.cos(q * 0.097 + r * 1.3 + seed * 0.7)) * 2.6;
        return [c.x + ((c.x - cx) / l) * j, y, c.z + ((c.z - cz) / l) * j];
      };
      for (let q = 0; q + 1 < cols.length; q++) {
        if (Math.hypot(cols[q].x - cols[q + 1].x, cols[q].z - cols[q + 1].z) > 30) continue;
        for (let r = 0; r < ROWS; r++) {
          const a0 = P(q, r);
          const a1 = P(q, r + 1);
          const b0 = P(q + 1, r);
          const b1 = P(q + 1, r + 1);
          for (const [p0, p1, p2] of [
            [a0, b0, a1],
            [a1, b0, b1],
          ]) {
            pos.push(...p0, ...p1, ...p2);
            const c = rockAt((p0[1] + p1[1] + p2[1]) / 3);
            col.push(c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b);
          }
          const ua = along[q];
          const ub = along[q + 1];
          wuv.push(ua, a0[1], ub, b0[1], ua, a1[1], ua, a1[1], ub, b0[1], ub, b1[1]);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      // How far up the pit, for the melt's glow.
      const uv: number[] = [];
      for (let k = 1; k < pos.length; k += 3) uv.push(0.5, (pos[k] - floor) / (rim - floor));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('aWallUv', new THREE.Float32BufferAttribute(wuv, 2));
      g.computeVertexNormals();
      return g;
    };
    // The melt lights the walls from below: warm at the floor, gone two thirds of the way up.
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = 1;
    glowCanvas.height = 64;
    const gc = glowCanvas.getContext('2d')!;
    const grad = gc.createLinearGradient(0, 64, 0, 0);
    grad.addColorStop(0, 'rgb(255,120,48)');
    grad.addColorStop(0.18, 'rgb(150,52,26)');
    grad.addColorStop(0.45, 'rgb(46,16,18)');
    grad.addColorStop(0.7, 'rgb(0,0,0)');
    gc.fillStyle = grad;
    gc.fillRect(0, 0, 1, 64);
    const glowMap = new THREE.CanvasTexture(glowCanvas);
    glowMap.colorSpace = THREE.SRGBColorSpace;
    const wall = new THREE.Mesh(
      mergeGeometries([faces(outer, 1), faces(inner, 5)])!,
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: glowMap, emissiveIntensity: 0.55 }),
    );
    wall.frustumCulled = false;
    group.add(wall);
    const rockTex = tex('pitwall');
    const scorchedTex = tex('scorched');
    if (rockTex && scorchedTex) swapMaterial(ctx, wall, paintedWallMaterial(rockTex, scorchedTex, 44, floor + 30, floor + 130, glowMap, 0.5));

    // Neon along every bench: one line just under the turn above, one above
    // the barrier, shading from magenta at the melt to cyan at the rim.
    const pos: number[] = [];
    const col: number[] = [];
    const nc = new THREE.Color();
    const band = (a: Column, b: Column, ya: number, yb: number, h: number) => {
      const off = (c: Column): [number, number] => {
        const l = Math.hypot(c.x - cx, c.z - cz) || 1;
        return [c.x - ((c.x - cx) / l) * 0.5, c.z - ((c.z - cz) / l) * 0.5];
      };
      const [ax, az] = off(a);
      const [bx, bz] = off(b);
      const ca = nc.setHSL(0.93 - a.up * 0.43, 1, 0.56).multiplyScalar(1.3).clone();
      const cb = nc.setHSL(0.93 - b.up * 0.43, 1, 0.56).multiplyScalar(1.3).clone();
      pos.push(ax, ya, az, bx, yb, bz, ax, ya + h, az, ax, ya + h, az, bx, yb, bz, bx, yb + h, bz);
      for (const c of [ca, cb, ca, ca, cb, cb]) col.push(c.r, c.g, c.b);
    };
    for (let q = 0; q + 1 < outer.length; q++) {
      const a = outer[q];
      const b = outer[q + 1];
      if (Math.hypot(a.x - b.x, a.z - b.z) > 30) continue;
      // A skirt down from road above the plateau: no lines.
      if (a.y0 === rim && a.y1 > rim) continue;
      band(a, b, a.y1 - 3.6, b.y1 - 3.6, 1.2);
      if (a.y1 - a.y0 > 16 && b.y1 - b.y0 > 16) band(a, b, a.y0 + 7.4, b.y0 + 7.4, 0.9);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const neon = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false }));
    neon.frustumCulled = false;
    group.add(neon);
  }

  // ---- the molten floor -------------------------------------------------------
  {
    const meltMat = groundMaterial(ctx, moltenFragment, { uPainted: { value: 0 }, uMeltMap: { value: null } });
    const meltTex = tex('melt');
    if (meltTex) {
      meltMat.uniforms.uMeltMap.value = meltTex;
      ctx.swaps.push((on) => (meltMat.uniforms.uPainted.value = on ? 1 : 0));
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(floorR + 6, 96), meltMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(cx, floor, cz);
    disc.frustumCulled = false;
    group.add(disc);
  }

  // ---- the plateau round the pit -------------------------------------------------
  {
    // From the pit's edge (outside the top turn, all the way round) out past the horizon.
    const pos: number[] = [];
    const far = (p: THREE.Vector3) => {
      const l = Math.hypot(p.x - cx, p.z - cz) || 1;
      return [cx + ((p.x - cx) / l) * 30000, rim, cz + ((p.z - cz) / l) * 30000];
    };
    for (let q = 0; q < edge.length; q++) {
      const a = edge[q];
      const b = edge[(q + 1) % edge.length];
      const fa = far(a);
      const fb = far(b);
      pos.push(a.x, rim, a.z, ...fa, b.x, rim, b.z, b.x, rim, b.z, ...fa, ...fb);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mat = groundMaterial(
      ctx,
      plateauFragment,
      {
        uBase: { value: new THREE.Color(theme.groundLight2) },
        uSeam: { value: new THREE.Color(theme.groundDeep) },
        uCentre: { value: new THREE.Vector2(cx, cz) },
        uEdge: { value: edgeR },
        uPainted: { value: 0 },
        uYardMap: { value: null },
      },
      THREE.DoubleSide,
    );
    const plateau = new THREE.Mesh(g, mat);
    plateau.frustumCulled = false;
    group.add(plateau);
    const yardTex = tex('yard');
    if (yardTex) {
      mat.uniforms.uYardMap.value = yardTex;
      ctx.swaps.push((on) => (mat.uniforms.uPainted.value = on ? 1 : 0));
    }
  }

  // Places taken on the plateau (plan circles), so nothing stands in anything else.
  const taken: Array<[number, number, number]> = [];
  const free = (x: number, z: number, r: number) => taken.every(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) > r + tr);
  const onPlateau = (x: number, z: number, r: number) => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      if (pit.groundAt(x + Math.cos(a) * r, z + Math.sin(a) * r) < rim - 1) return false;
    }
    return pit.groundAt(x, z) >= rim - 1;
  };
  const steel = toonMaterial({ color: 0x2c303e });
  const steelParts: THREE.BufferGeometry[] = [];
  const glowParts: THREE.BufferGeometry[] = [];
  const white = new THREE.Color(0xffffff);
  const neonCol = (hex: number, k = 1.3) => new THREE.Color(hex).multiplyScalar(k);
  // Where smoke and steam rise in the painted look: the stacks' mouths and the pour.
  const puffSources: PuffSource[] = [];

  // ---- the Gantry: a truss across the pit over the start straight -----------------
  const f0 = makeFrame();
  frameAt(track, 0, f0);
  const T = new THREE.Vector3(f0.tx, 0, f0.tz).normalize();
  const R = new THREE.Vector3(-T.z, 0, T.x);
  const O = new THREE.Vector3(f0.px, 0, f0.pz);
  const along = (t: number, d: number, y: number) => new THREE.Vector3(O.x + T.x * t + R.x * d, y, O.z + T.z * t + R.z * d);
  let tIn = -1;
  let tOut = -1;
  for (let t = 0; t < 2400; t += 4) {
    const p = along(t, 0, 0);
    if (pit.groundAt(p.x, p.z) < rim - 1) {
      if (tIn < 0) tIn = t;
      tOut = t;
    }
  }
  const tA = tIn - 30;
  const tB = tOut + 50;
  let yTop = 0;
  for (let i = 0; i < track.n; i++) {
    const rx = track.px[i] - O.x;
    const rz = track.pz[i] - O.z;
    const t = rx * T.x + rz * T.z;
    const d = rx * R.x + rz * R.z;
    if (t > tA && t < tB && Math.abs(d) < 60) yTop = Math.max(yTop, track.py[i]);
  }
  const yb = yTop + 34;
  const DEPTH = 20;
  const HALF = 7;
  if (tIn > 0) {
    const posts = Math.max(2, Math.round((tB - tA) / 25));
    const step = (tB - tA) / posts;
    for (const side of [-1, 1]) {
      steelParts.push(beam(along(tA, side * HALF, yb), along(tB, side * HALF, yb), 2.6));
      steelParts.push(beam(along(tA, side * HALF, yb + DEPTH), along(tB, side * HALF, yb + DEPTH), 2.6));
      // The underlit chords.
      glowParts.push(tint(beam(along(tA, side * HALF, yb - 1.5), along(tB, side * HALF, yb - 1.5), 0.5, 0.4), neonCol(side < 0 ? 0xff2fa8 : 0x26e6ff)));
      for (let k = 0; k <= posts; k++) {
        const t = tA + k * step;
        steelParts.push(beam(along(t, side * HALF, yb), along(t, side * HALF, yb + DEPTH), 1.4));
        if (k < posts) steelParts.push(beam(along(t, side * HALF, k % 2 ? yb : yb + DEPTH), along(t + step, side * HALF, k % 2 ? yb + DEPTH : yb), 1.0));
      }
    }
    for (let k = 0; k <= posts; k++) {
      const t = tA + k * step;
      steelParts.push(beam(along(t, -HALF, yb + DEPTH), along(t, HALF, yb + DEPTH), 1.0));
      steelParts.push(beam(along(t, -HALF, yb), along(t, HALF, yb), 1.0));
    }
    // Legs at each end, either side of the road, down to the plateau.
    for (const t of [tA, tB]) {
      const lx = 46;
      for (const side of [-1, 1]) {
        steelParts.push(beam(along(t, side * lx, rim), along(t, side * lx, yb + DEPTH + 2), 4.2));
        steelParts.push(beam(along(t, side * lx, yb - 70), along(t, side * HALF, yb), 1.6));
        glowParts.push(tint(beam(along(t - 2.4, side * lx, rim + 6), along(t - 2.4, side * lx, yb + DEPTH), 0.5, 0.5), neonCol(0x26e6ff)));
        taken.push([along(t, side * lx, 0).x, along(t, side * lx, 0).z, 12]);
      }
      steelParts.push(beam(along(t, -lx, yb + DEPTH + 2), along(t, lx, yb + DEPTH + 2), 3.6, 4.4));
      steelParts.push(beam(along(t, -lx, yb), along(t, lx, yb), 2.4));
    }
    // Hangers down to the road over the pit, either side.
    const leap = pieceRange(track, 'lip');
    const land = pieceRange(track, 'landing slope');
    const hang = (s: number) => {
      frameAt(track, s, f0);
      const w = hwAt(track, s) + 4;
      for (const side of [-1, 1]) {
        const x = f0.px + f0.rx * w * side;
        const z = f0.pz + f0.rz * w * side;
        steelParts.push(beam(new THREE.Vector3(x, f0.py + f0.ry * w * side - 1, z), new THREE.Vector3(x, yb, z), 0.7));
      }
    };
    for (let s = Math.max(4, tIn - 12); leap && s < leap[0] - 4; s += 24) hang(s);
    if (land) hang((land[0] + land[1]) / 2);
    // The circuit's name over the way in, hung from the near legs' beam.
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(132, 132 / 3.2), new THREE.MeshBasicMaterial({ map: neonSign('NEON CRUCIBLE', '#ff3fbf'), transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false }));
    (sign.material as THREE.MeshBasicMaterial).color.setScalar(1.25);
    frameAt(track, tA, f0);
    const sy = f0.py + 52;
    const sp = along(tA, 0, sy + 132 / 6.4);
    sign.position.copy(sp);
    sign.lookAt(sp.clone().sub(T));
    group.add(sign);
    // Painted (track sheet T4), glowing as the neon does.
    const own = paintedTrack.circuitSigns[theme.id];
    if (own) {
      const m = new THREE.MeshBasicMaterial({ map: paintedTexture(own.url), side: THREE.DoubleSide, toneMapped: false });
      m.color.setScalar(1.15);
      swapMaterial(ctx, sign, m);
    }
    for (const side of [-1, 1]) steelParts.push(beam(along(tA, side * 52, sy + 132 / 3.2 - 1), along(tA, side * 46, yb), 0.5));
  }
  const nearGantry = (x: number, z: number, r: number) => {
    const rx = x - O.x;
    const rz = z - O.z;
    const t = rx * T.x + rz * T.z;
    const d = rx * R.x + rz * R.z;
    return t > tA - r - 20 && t < tB + r + 20 && Math.abs(d) < 60 + r;
  };

  // ---- the pour: a ladle on a tower crane tipping melt into the pit ---------------
  {
    // Where on the floor nothing is above: farthest from any road.
    let best: [number, number, number] | null = null;
    for (let rr = 20; rr < floorR; rr += 8) {
      for (let a = 0; a < TAU; a += TAU / 72) {
        const x = cx + Math.cos(a) * rr;
        const z = cz + Math.sin(a) * rr;
        // Inside the first turn's face, with room.
        const f = pit.at(pit.angleOf(x, z));
        if (f < 0) continue;
        const i = idx[Math.round(f)];
        if (Math.hypot(track.px[i] - cx, track.pz[i] - cz) - track.hw[i] - 32 < rr) continue;
        let c = 1e9;
        for (let j = 0; j < track.n; j += 2) c = Math.min(c, Math.hypot(track.px[j] - x, track.pz[j] - z) - track.hw[j]);
        if (!best || c > best[2]) best = [x, z, c];
      }
    }
    if (best && best[2] > 14) {
      const [px, pz] = best;
      const a0 = Math.atan2(pz - cz, px - cx);
      let tower: THREE.Vector3 | null = null;
      for (let k = 0; k < 40 && !tower; k++) {
        const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.05;
        for (let rr = edgeR + 40; rr < edgeR + 160; rr += 10) {
          const x = cx + Math.cos(a) * rr;
          const z = cz + Math.sin(a) * rr;
          if (onPlateau(x, z, 20) && ctx.clearance(x, z) > 60 && !nearGantry(x, z, 20)) {
            tower = new THREE.Vector3(x, rim, z);
            break;
          }
        }
      }
      if (tower) {
        taken.push([tower.x, tower.z, 30]);
        const jibY = yb + DEPTH + 70;
        const tip = new THREE.Vector3(px, jibY, pz);
        const back = new THREE.Vector3(tower.x, jibY, tower.z).sub(tip).normalize();
        const side = new THREE.Vector3(-back.z, 0, back.x);
        // The mast: four legs and their bracing.
        const mastTop = jibY + 34;
        const corners = [
          [-5, -5],
          [5, -5],
          [5, 5],
          [-5, 5],
        ].map(([a, b]) => new THREE.Vector3(tower!.x + back.x * a + side.x * b, 0, tower!.z + back.z * a + side.z * b));
        for (let k = 0; k < 4; k++) {
          const c = corners[k];
          const n2 = corners[(k + 1) % 4];
          steelParts.push(beam(new THREE.Vector3(c.x, rim, c.z), new THREE.Vector3(c.x, mastTop, c.z), 1.6));
          for (let y = rim; y < mastTop - 20; y += 20) steelParts.push(beam(new THREE.Vector3(c.x, y, c.z), new THREE.Vector3(n2.x, y + 20, n2.z), 0.7));
        }
        // The jib out over the pit, and the counter-jib with its weights.
        const root = new THREE.Vector3(tower.x, jibY, tower.z);
        for (const s2 of [-2.5, 2.5]) {
          steelParts.push(beam(root.clone().addScaledVector(side, s2), tip.clone().addScaledVector(back, -6).addScaledVector(side, s2), 1.4));
          steelParts.push(beam(root.clone().addScaledVector(side, s2).add(new THREE.Vector3(0, 8, 0)), tip.clone().addScaledVector(back, 30).addScaledVector(side, s2).add(new THREE.Vector3(0, 1, 0)), 0.9));
        }
        const counter = root.clone().addScaledVector(back, 60);
        steelParts.push(beam(root, counter, 3, 2));
        steelParts.push(beam(counter.clone().add(new THREE.Vector3(0, -6, 0)), counter.clone().addScaledVector(back, -14).add(new THREE.Vector3(0, -6, 0)), 9, 10));
        steelParts.push(beam(new THREE.Vector3(tower.x, mastTop, tower.z), tip.clone().addScaledVector(back, 120).add(new THREE.Vector3(0, 2, 0)), 0.5));
        steelParts.push(beam(new THREE.Vector3(tower.x, mastTop, tower.z), counter, 0.5));
        glowParts.push(tint(beam(root.clone().add(new THREE.Vector3(0, -1.6, 0)), tip.clone().add(new THREE.Vector3(0, -1.6, 0)), 0.4), neonCol(0xffa020)));
        // The ladle, hung under the tip, tipped toward the pour.
        const ladleY = yb - 30;
        for (const s2 of [-4, 4]) steelParts.push(beam(tip.clone().addScaledVector(side, s2), new THREE.Vector3(px, ladleY + 16, pz).addScaledVector(back, 12).addScaledVector(side, s2), 0.4));
        const ladle = new THREE.Mesh(new THREE.CylinderGeometry(15, 11, 24, 18, 1, true), new THREE.MeshLambertMaterial({ color: 0x3a3238, side: THREE.DoubleSide }));
        const melt = new THREE.Mesh(new THREE.CircleGeometry(14, 18), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 0.72, 0.28), toneMapped: false }));
        melt.rotation.x = -Math.PI / 2;
        melt.position.y = 9;
        ladle.add(melt);
        const lip = new THREE.Vector3(px, ladleY, pz);
        ladle.position.copy(lip).addScaledVector(back, 12).add(new THREE.Vector3(0, 6, 0));
        ladle.rotateOnWorldAxis(side, -0.55);
        group.add(ladle);
        // The stream, and the splash where it meets the melt.
        const fall = ladleY - floor;
        const stream = new THREE.Mesh(
          new THREE.CylinderGeometry(2.2, 3.4, fall, 10, 1, true),
          new THREE.ShaderMaterial({ vertexShader: pourVertex, fragmentShader: pourFragment, uniforms: { uTime: { value: 0 } }, toneMapped: false }),
        );
        stream.position.set(px, floor + fall / 2, pz);
        group.add(stream);
        // The splash, in flat tones: a ring spreading on the melt, a low crown
        // thrown up round the stream, and sparks flicked out of it in arcs.
        const flat = (r: number, g: number, b: number, side: THREE.Side = THREE.FrontSide) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), toneMapped: false, side });
        const splash = new THREE.Group();
        const ring = new THREE.Mesh(new THREE.RingGeometry(4.5, 12, 32), flat(1.0, 0.24, 0.03));
        ring.rotation.x = -Math.PI / 2;
        const pool = new THREE.Mesh(new THREE.CircleGeometry(4.5, 24), flat(1.15, 0.72, 0.28));
        pool.rotation.x = -Math.PI / 2;
        pool.position.y = 0.05;
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(7, 4, 6, 16, 1, true).translate(0, 3, 0), flat(1.0, 0.24, 0.03, THREE.DoubleSide));
        splash.add(ring, pool, crown);
        splash.position.set(px, floor + 0.3, pz);
        group.add(splash);
        const SPARKS = 28;
        const sparkPos = new Float32Array(SPARKS * 3);
        const sparkGeo = new THREE.BufferGeometry();
        sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
        const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: new THREE.Color(1.15, 0.6, 0.16), size: 1.6, toneMapped: false }));
        sparks.frustumCulled = false;
        group.add(sparks);
        const sparkRnd = mulberry(4040);
        const sparkDir = Array.from({ length: SPARKS }, () => [sparkRnd() * TAU, 6 + sparkRnd() * 10, 14 + sparkRnd() * 14, sparkRnd()]);
        puffSources.push({ x: px, y: floor, z: pz, kind: 'steam' });
        const sm = stream.material as THREE.ShaderMaterial;
        ctx.updates.push((time) => {
          sm.uniforms.uTime.value = time;
          ring.scale.setScalar(0.9 + 0.12 * Math.sin(time * 5.1));
          crown.scale.set(1, 0.8 + 0.25 * Math.sin(time * 9.3) * Math.sin(time * 3.7), 1);
          for (let k = 0; k < SPARKS; k++) {
            const [a, out, up, ph] = sparkDir[k];
            const t = (time * 0.9 + ph) % 1;
            sparkPos[k * 3] = px + Math.cos(a) * out * t;
            sparkPos[k * 3 + 1] = floor + 1 + up * t - 30 * t * t;
            sparkPos[k * 3 + 2] = pz + Math.sin(a) * out * t;
          }
          sparkGeo.attributes.position.needsUpdate = true;
        });
      }
    }
  }

  // ---- floodlights on the rim, their beams down into the pit ----------------------
  {
    const beamMat = new THREE.ShaderMaterial({
      vertexShader: beamVertex,
      fragmentShader: beamFragment,
      uniforms: { uColor: { value: new THREE.Color(0.75, 0.85, 1.0) }, uStrength: { value: 0.055 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const lamps: THREE.BufferGeometry[] = [];
    let placed = 0;
    for (let k = 0; k < 24 && placed < 8; k++) {
      const a = (k / 24) * TAU + 0.11;
      const rr = edgeR + 50;
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      if (!onPlateau(x, z, 12) || ctx.clearance(x, z) < 45 || nearGantry(x, z, 10) || !free(x, z, 120)) continue;
      taken.push([x, z, 120]);
      placed++;
      const top = rim + 120;
      steelParts.push(beam(new THREE.Vector3(x, rim, z), new THREE.Vector3(x, top, z), 3));
      const head = new THREE.Vector3(x, top + 4, z);
      steelParts.push(beam(head.clone().add(new THREE.Vector3(-8 * Math.sin(a), 0, 8 * Math.cos(a))), head.clone().add(new THREE.Vector3(8 * Math.sin(a), 0, -8 * Math.cos(a))), 2.4, 4));
      glowParts.push(tint(beam(head.clone().add(new THREE.Vector3(-7 * Math.sin(a) - Math.cos(a) * 1.4, -1.2, 7 * Math.cos(a) - Math.sin(a) * 1.4)), head.clone().add(new THREE.Vector3(7 * Math.sin(a) - Math.cos(a) * 1.4, -1.2, -7 * Math.cos(a) - Math.sin(a) * 1.4)), 2.6, 2.4), new THREE.Color(1.25, 1.3, 1.4)));
      for (const spread of [-0.35, 0.35]) {
        const ta = a + Math.PI + spread;
        const target = new THREE.Vector3(x + Math.cos(ta) * 240, rim - 210 - Math.abs(spread) * 60, z + Math.sin(ta) * 240);
        const len = head.distanceTo(target);
        const g = new THREE.CylinderGeometry(1.5, len * 0.17, len, 20, 1, true);
        g.translate(0, -len / 2, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), target.clone().sub(head).normalize());
        g.applyQuaternion(q);
        g.translate(head.x, head.y - 1.2, head.z);
        lamps.push(g);
      }
    }
    if (lamps.length) {
      const beams = new THREE.Mesh(mergeGeometries(lamps)!, beamMat);
      beams.frustumCulled = false;
      beams.renderOrder = 5;
      group.add(beams);
    }
  }

  // ---- smelter stacks, burning off at the top -----------------------------------
  const flames: THREE.Mesh[] = [];
  const beacons: THREE.Vector3[] = [];
  {
    const rnd = mulberry(5150);
    const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.24, 0.04), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    let placed = 0;
    for (let k = 0; k < 300 && placed < 6; k++) {
      const a = rnd() * TAU;
      const rr = edgeR + 260 + rnd() * 700;
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      if (ctx.clearance(x, z) < 110 || nearGantry(x, z, 30) || !free(x, z, 40)) continue;
      taken.push([x, z, 40]);
      placed++;
      const h = 180 + rnd() * 120;
      const stack = new THREE.CylinderGeometry(9, 15, h, 14, 1).toNonIndexed();
      stack.translate(x, rim + h / 2, z);
      steelParts.push(stack);
      for (const yy of [0.35, 0.7]) glowParts.push(tint(new THREE.CylinderGeometry(9 + 6 * (1 - yy) + 0.4, 9 + 6 * (1 - yy) + 0.4, 1.4, 14, 1, true).toNonIndexed().translate(x, rim + h * yy, z), neonCol(0xff3020, 1.1)));
      glowParts.push(tint(new THREE.CylinderGeometry(9.6, 9.6, 3, 14, 1, true).toNonIndexed().translate(x, rim + h - 2, z), neonCol(0xff8a20, 1.3)));
      const flame = new THREE.Mesh(new THREE.ConeGeometry(7, 30, 10, 1, true), flameMat);
      flame.geometry.translate(0, 15, 0);
      flame.position.set(x, rim + h, z);
      group.add(flame);
      flames.push(flame);
      beacons.push(new THREE.Vector3(x, rim + h + 1, z));
      puffSources.push({ x, y: rim + h + 6, z, kind: 'smoke' });
    }
  }

  // ---- the city round the rim ----------------------------------------------------
  {
    const rnd = mulberry(3301);
    const parts: THREE.BufferGeometry[] = [];
    const tints = [new THREE.Color(0xffffff), new THREE.Color(0xd6d9ec), new THREE.Color(0xe8d8e4), new THREE.Color(0xcfe0ee)];
    const neonHues = [0xff2fa8, 0x26e6ff, 0xffa020, 0xa05cff, 0x3dff9a];
    const signs: Array<[string, string]> = [
      ['KESTREL', '#26e6ff'],
      ['AOKI HEAVY', '#ffa020'],
      ['NOVA', '#ff3fbf'],
      ['HALCYON', '#a05cff'],
      ['ZGP', '#3dff9a'],
      ['FOUNDRY 7', '#ff5a3a'],
    ];
    const signMats = signs.map(([w, c]) => {
      const m = new THREE.MeshBasicMaterial({ map: neonSign(w, c), transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false });
      m.color.setScalar(1.2);
      return m;
    });
    // The painted neon (sheet N5: Kestrel, Aoki Heavy, Nova, Halcyon, Foundry 7, ZGP), in the same order as these.
    const painted = ctx.painted?.signs ?? [];
    const paintedSignMats =
      painted.length >= 6
        ? [0, 1, 2, 3, 5, 4].map((k) => {
            const m = new THREE.MeshBasicMaterial({ map: paintedTexture(painted[k].url), side: THREE.DoubleSide, toneMapped: false });
            m.color.setScalar(1.15);
            return m;
          })
        : null;
    let signsUp = 0;
    let placed = 0;
    for (let tries = 0; tries < 2400 && placed < 260; tries++) {
      const a = rnd() * TAU;
      const near = rnd() < 0.55;
      const rr = near ? edgeR + 150 + Math.pow(rnd(), 1.4) * 1300 : edgeR + 1500 + rnd() * 5200;
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      const w = 28 + rnd() * 44;
      const d = 28 + rnd() * 44;
      const size = Math.max(w, d) * 0.75;
      if (ctx.clearance(x, z) < 90 + size || nearGantry(x, z, size) || !free(x, z, size)) continue;
      const closeness = 1 - Math.min(1, (rr - edgeR) / 1800);
      const h = 50 + rnd() * 110 + closeness * closeness * (80 + rnd() * 300);
      const rot = rnd() * 1.6;
      const tn = tints[Math.floor(rnd() * tints.length)];
      parts.push(tower(w, h, d, x, rim, z, rot, tn));
      taken.push([x, z, size]);
      placed++;
      let crown = h;
      if (h > 200 && rnd() < 0.6) {
        // A setback crown, and a mast.
        parts.push(tower(w * 0.62, h * 0.16, d * 0.62, x, rim + h, z, rot, tn));
        crown = h * 1.16;
        if (rnd() < 0.7) {
          parts.push(tower(2.4, h * 0.2, 2.4, x, rim + crown, z, 0, tn));
          crown += h * 0.2;
        }
      }
      // Neon up two corners of some, and a sign on the roof of the tall ones near the pit.
      const cr = Math.cos(rot);
      const sr = Math.sin(rot);
      if (rnd() < 0.5) {
        const hue = neonCol(neonHues[Math.floor(rnd() * neonHues.length)]);
        for (const [ox, oz] of [
          [w / 2, d / 2],
          [-w / 2, -d / 2],
        ]) {
          const px = x + ox * cr + oz * sr;
          const pz = z - ox * sr + oz * cr;
          glowParts.push(tint(beam(new THREE.Vector3(px, rim + h * 0.08, pz), new THREE.Vector3(px, rim + h * 0.97, pz), 1.3), hue));
        }
      }
      if (near && h > 200 && signsUp < 14) {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.1, (w * 1.1) / 3.2), signMats[signsUp % signMats.length]);
        sign.position.set(x, rim + h + (w * 1.1) / 6.4 + 2, z);
        sign.lookAt(cx, sign.position.y, cz);
        group.add(sign);
        if (paintedSignMats) swapMaterial(ctx, sign, paintedSignMats[signsUp % paintedSignMats.length]);
        signsUp++;
      }
      if (crown > 160) beacons.push(new THREE.Vector3(x, rim + crown + 2, z));
    }
    const facade = nightWindows(false);
    const lit = nightWindows(true);
    const cityMat = new THREE.MeshLambertMaterial({ map: facade, emissive: 0xffffff, emissiveMap: lit, emissiveIntensity: 1.25, vertexColors: true });
    const city = new THREE.Mesh(mergeGeometries(parts)!, cityMat);
    city.frustumCulled = false;
    group.add(city);
    // Painted: the facades, and their lit windows alone for the glow.
    const pf = tex('facade');
    const pl = tex('facadeLit');
    if (pf && pl) {
      // Drawn half as large again as painted: fewer, bigger windows, which
      // stay windows at a distance instead of breaking into speckle.
      pf.repeat.setScalar(0.66);
      pl.repeat.setScalar(0.66);
      ctx.swaps.push((on) => {
        cityMat.map = on ? pf : facade;
        cityMat.emissiveMap = on ? pl : lit;
        cityMat.emissiveIntensity = on ? 0.9 : 1.25;
      });
    }
  }

  // ---- the steel and the neon, all of it ------------------------------------------
  {
    for (const g of steelParts) {
      if (!g.attributes.color) tint(g, white);
      if (g.attributes.uv) g.deleteAttribute('uv');
      if (g.attributes.normal) g.deleteAttribute('normal');
    }
    const steelGeo = mergeGeometries(steelParts)!;
    steelGeo.computeVertexNormals();
    const mesh = new THREE.Mesh(steelGeo, steel);
    mesh.frustumCulled = false;
    group.add(mesh);
    const rustTex = tex('rust');
    if (rustTex) swapMaterial(ctx, mesh, paintedRock(rustTex, rustTex, 10, 10, THREE.FrontSide, { toon: true, dip: 0 }));
    for (const g of glowParts) {
      if (g.attributes.uv) g.deleteAttribute('uv');
      if (g.attributes.normal) g.deleteAttribute('normal');
    }
    const glow = new THREE.Mesh(mergeGeometries(glowParts)!, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    glow.frustumCulled = false;
    group.add(glow);
  }

  // ---- red beacons on everything tall, blinking ------------------------------------
  {
    const geo = new THREE.SphereGeometry(1.6, 8, 6);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 0.12, 0.08), toneMapped: false });
    const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, beacons.length));
    const m = new THREE.Matrix4();
    beacons.forEach((p, k) => inst.setMatrixAt(k, m.makeTranslation(p.x, p.y, p.z)));
    inst.count = beacons.length;
    inst.frustumCulled = false;
    group.add(inst);
    ctx.updates.push((time) => {
      inst.visible = time % 1.6 < 0.8;
      for (let k = 0; k < flames.length; k++) {
        const fl = flames[k];
        const s = 0.8 + 0.25 * Math.sin(time * 9 + k * 1.7) * Math.sin(time * 4.3 + k);
        fl.scale.set(1, s, 1);
      }
    });
  }

  // Smoke and steam in drawn puffs, in the painted look.
  if (ctx.painted && puffSources.length) {
    const puffs = new PuffStreams(puffSources);
    group.add(puffs.mesh);
    ctx.paintedOnly.push(puffs.mesh);
    ctx.updates.push((time, camera) => {
      if (puffs.mesh.visible) puffs.update(time, camera);
    });
  }
}
