// The setting of each circuit: sky, what lies below the road, far hills,
// cumulus and landmarks. Meridian Skyway: golden hour over open sea with a
// city inside the loop. Corkscrew Canyon: dusk over red desert, mesas, the
// rock cut the Narrows runs through and the gorge under the Sky Bridge.
// Helios Drop: high noon above a sea of cloud, floating islands, the Sun
// Gate over the Drop and the Helios spire. All procedural; no asset files.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pieceStarts, type CircuitDef } from '../../sim/circuit';
import { frameAt, makeFrame, type Track } from '../../sim/track';
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
varying vec3 vDir;
${NOISE}
void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
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
  // Sun: hard anime disc, soft halo, wide warm wash.
  float sd = max(dot(dir, uSunDir), 0.0);
  col += uHalo * pow(sd, 9.0) * 0.22;
  col += vec3(1.0, 0.86, 0.62) * pow(sd, 120.0) * 0.5;
  col = mix(col, vec3(1.9, 1.75, 1.45), smoothstep(0.9990, 0.9993, sd));
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
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
${NOISE}
void main() {
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
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
${NOISE}
void main() {
  vec2 p = vWorld.xz;
  float big = fbm(p * 0.0009);
  float mid = noise(p * 0.006);
  vec3 col = mix(uRock, uSand, smoothstep(0.38, 0.62, big));
  // Wind ripples in two flat tones, and scattered dark scrub.
  float rip = sin(dot(p, vec2(0.045, 0.018)) + mid * 5.0);
  col *= 0.95 + 0.05 * step(0.0, rip);
  float fl = noise(p * 0.035);
  col = mix(col, uRock * 0.7, smoothstep(0.8, 0.83, fl) * 0.45);
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
    vec3 g = mix(uRock * 0.5, uRock * 0.08, smoothstep(0.05, 0.6, depth));
    g = mix(g, uSand * 1.1, smoothstep(w - 12.0, w - 5.0, across) * 0.7);
    col = mix(col, g, inside);
  }
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
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
${NOISE}
void main() {
  vec2 p = vWorld.xz * 0.0011 + vec2(uTime * 0.004, uTime * 0.0016);
  float c = fbm(p) * 0.8 + noise(p * 6.0) * 0.2;
  // Lit where the billows rise toward the sun, shaded where they fall away.
  float c2 = fbm(p + normalize(uSunDir.xz) * 0.025) * 0.8 + noise((p + normalize(uSunDir.xz) * 0.025) * 6.0) * 0.2;
  float lit = step(0.0, c - c2 + 0.004);
  vec3 col = mix(uShade, uLit, smoothstep(0.4, 0.62, c));
  col *= mix(0.78, 1.04, lit);
  // Thin places: the blue far below shows through.
  col = mix(uDeep, col, smoothstep(0.28, 0.36, c));
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
}

export function buildWorld(track: Track, theme: Theme = THEMES.meridian): World {
  const group = new THREE.Group();

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
    },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  group.add(sky);
  ctx.updates.push((time, camera) => {
    skyMat.uniforms.uTime.value = time;
    sky.position.copy(camera.position);
  });

  if (theme.ground === 'desert') buildCanyon(ctx);
  else if (theme.ground === 'clouds') buildHelios(ctx);
  else buildMeridian(ctx);

  return {
    group,
    sun,
    sky: skyMat,
    update(time: number, camera: THREE.Camera) {
      for (const u of ctx.updates) u(time, camera);
    },
  };
}

/** A ground plane far wider than the view, drawn with one of the ground shaders. */
function groundPlane(ctx: Ctx, fragment: string, uniforms: Record<string, THREE.IUniform>, y: number): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    vertexShader: groundVertex,
    fragmentShader: fragment,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSunDir: { value: SUN_DIR.clone() }, ...uniforms }]),
    fog: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000, 1, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(ctx.cx, y, ctx.cz);
  mesh.frustumCulled = false;
  ctx.group.add(mesh);
  ctx.updates.push((time) => {
    mat.uniforms.uTime.value = time;
  });
  return mat;
}

/** Cumulus banks: `place` returns a centre and size for each, or null to skip one. */
function cumulus(ctx: Ctx, seed: number, count: number, place: (rnd: () => number) => [number, number, number, number] | null, drift = 400): void {
  const rnd = mulberry(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const at = place(rnd);
    if (!at) continue;
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
  groundPlane(
    ctx,
    seaFragment,
    {
      uDeep: { value: new THREE.Color(theme.groundDeep) },
      uShallow: { value: new THREE.Color(theme.groundLight2) },
      uSky: { value: new THREE.Color(0xbfd8f5) },
    },
    -6,
  );

  // ---- city ---------------------------------------------------------------
  {
    const rnd = mulberry(2049);
    const parts: THREE.BufferGeometry[] = [];
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
        parts.push(tower(w, h, d, x, 8, z, rnd() * 0.6, tints[Math.floor(rnd() * tints.length)]));
        if (h > 240 && rnd() < 0.7) {
          // Setback crown and a mast.
          parts.push(tower(w * 0.6, h * 0.18, d * 0.6, x, 8 + h, z, 0, tints[0]));
          parts.push(tower(2.5, h * 0.22, 2.5, x, 8 + h * 1.18, z, 0, tints[1]));
        }
      }
    }
    const cityMat = new THREE.MeshLambertMaterial({ map: windowTexture(), vertexColors: true });
    const city = new THREE.Mesh(mergeGeometries(parts)!, cityMat);
    city.frustumCulled = false;
    group.add(city);
    const deckMesh = new THREE.Mesh(mergeGeometries(decks)!, new THREE.MeshLambertMaterial({ color: 0xb9c2cf }));
    deckMesh.frustumCulled = false;
    group.add(deckMesh);
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
    const ring = new THREE.Mesh(new THREE.TorusGeometry(92, 7, 8, 40), toonMaterial({ color: 0xf1f4f9, vertexColors: false }));
    trackMatrix(track, s, 0, 34, 0, m);
    ring.applyMatrix4(m);
    group.add(ring);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(84.6, 0.9, 6, 60), new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.charge).multiplyScalar(1.6), toneMapped: false }));
    inner.applyMatrix4(m);
    group.add(inner);
    // Twin towers either side of the start with a sky-bridge.
    for (const side of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(46, 420, 46), new THREE.MeshLambertMaterial({ map: windowTexture(), color: 0xf2f5fa }));
      (t.material as THREE.MeshLambertMaterial).map!.repeat.set(2, 16);
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
  groundPlane(
    ctx,
    desertFragment,
    {
      uSand: { value: new THREE.Color(theme.groundLight2) },
      uRock: { value: new THREE.Color(theme.groundDeep) },
      uGorgeA: { value: gorgeA.slice(0, MAX_GORGES) },
      uGorgeB: { value: gorgeB.slice(0, MAX_GORGES) },
    },
    theme.groundY,
  );
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
    }
  }

  // ---- mesas, buttes and hoodoos --------------------------------------------
  {
    const rnd = mulberry(1231);
    const parts: THREE.BufferGeometry[] = [];
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
      parts.push(both);
      placed++;
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, rockMat);
    mesh.frustumCulled = false;
    group.add(mesh);
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

  // ---- the sea of cloud ----------------------------------------------------
  groundPlane(
    ctx,
    cloudFragment,
    {
      uLit: { value: new THREE.Color(theme.groundLight2) },
      uShade: { value: new THREE.Color(theme.groundDeep) },
      uDeep: { value: new THREE.Color(0x2a58a8) },
    },
    theme.groundY,
  );

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
    const add = (parts: THREE.BufferGeometry[], mat: THREE.Material) => {
      if (parts.length === 0) return;
      const mesh = new THREE.Mesh(mergeGeometries(parts)!, mat);
      mesh.frustumCulled = false;
      group.add(mesh);
    };
    add(rockParts, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    add(grass, new THREE.MeshLambertMaterial({ color: 0x8cc46a, flatShading: true }));
    add(white, new THREE.MeshLambertMaterial({ color: 0xf4f6fb, flatShading: true }));
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
  }

  // ---- the Sun Gate: a golden ring over the Drop's gap -----------------------
  const gold = toonMaterial({ color: 0xffcf6a, emissive: 0x6a3a00, emissiveIntensity: 0.35, vertexColors: false });
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
