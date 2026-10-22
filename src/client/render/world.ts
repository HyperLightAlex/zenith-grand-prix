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
import { pitOf } from './pit';
import { HORIZON_RINGS, SUN_DISC, UNTONE, paintedCardMaterial, paintedSet, paintedSurfaceMaterial as paintedRock, paintedTexture, paintedTrack, whiteTexture, type PaintedSet } from './painted';
import { COLORS, SUN_DIR, toonMaterial } from './palette';
import { THEMES, type Theme } from './themes';
import { trackMatrix } from './trackSpace';

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
  const plumeSpots: Plume[] = [];

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
        plumeSpots.push({ x: px, y: floor, z: pz, width: [70, 90], cards: [4] });
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
      plumeSpots.push({ x, y: rim + h - 1, z, width: [95, 150], cards: [0, 1, 3, 5] });
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

  if (ctx.painted) paintedPlumes(ctx, plumeSpots, 77);
}

/** A place smoke or steam rises from: its foot, how wide its card may be, and which cards. */
interface Plume {
  x: number;
  y: number;
  z: number;
  width: [number, number];
  cards: number[];
}

/**
 * Painted smoke and steam (the anime look): a card for each, its foot (the
 * plume's base, wherever it is across the painting) on the spot, turning
 * about the upright to face the camera as the painted clouds do.
 */
function paintedPlumes(ctx: Ctx, spots: Plume[], seed: number): void {
  const { cards, url } = ctx.painted!.clouds;
  if (cards.length === 0 || spots.length === 0) return;
  const map = paintedTexture(url);
  const rnd = mulberry(seed);
  const mats = cards.map((c) => paintedCardMaterial(map, [c.u0, c.v0, c.u1 - c.u0, c.v1 - c.v0], 1, THREE.DoubleSide));
  const geos = cards.map((c) => new THREE.PlaneGeometry(1, 1).translate(0.5 - (c.base ?? 0.5), 0.5, 0));
  const group = new THREE.Group();
  const meshes: THREE.Mesh[] = [];
  for (const sp of spots) {
    const k = sp.cards[Math.floor(rnd() * sp.cards.length)] % cards.length;
    const w = sp.width[0] + rnd() * (sp.width[1] - sp.width[0]);
    const m = new THREE.Mesh(geos[k], mats[k]);
    m.scale.set(rnd() < 0.5 ? -w : w, w / cards[k].aspect, 1);
    m.position.set(sp.x, sp.y, sp.z);
    m.frustumCulled = false;
    group.add(m);
    meshes.push(m);
  }
  ctx.group.add(group);
  ctx.paintedOnly.push(group);
  const cam = new THREE.Vector3();
  ctx.updates.push((_time, camera) => {
    if (!group.visible) return;
    camera.getWorldPosition(cam);
    for (const m of meshes) m.rotation.y = Math.atan2(cam.x - m.position.x, cam.z - m.position.z);
  });
}
