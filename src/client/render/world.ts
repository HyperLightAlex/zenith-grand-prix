// The setting: a golden-hour sky, open sea, a city inside the loop, drifting
// cumulus and a few landmarks. All procedural; no asset files.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Track } from '../../sim/track';
import { COLORS, SUN_DIR, toonMaterial } from './palette';
import { trackMatrix } from './trackSpace';

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const skyFragment = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform float uTime;
varying vec3 vDir;
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
}
void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  vec3 col = mix(uHorizon, uMid, smoothstep(-0.02, 0.22, h));
  col = mix(col, uZenith, smoothstep(0.18, 0.85, h));
  // Sun: hard anime disc, soft halo, wide warm wash.
  float sd = max(dot(dir, uSunDir), 0.0);
  col += vec3(1.0, 0.70, 0.40) * pow(sd, 9.0) * 0.22;
  col += vec3(1.0, 0.86, 0.62) * pow(sd, 120.0) * 0.5;
  col = mix(col, vec3(1.9, 1.75, 1.45), smoothstep(0.9990, 0.9993, sd));
  // High cirrus, painted in two flat tones.
  if (h > 0.0) {
    vec2 uv = dir.xz / (h + 0.18);
    float c = fbm(uv * vec2(0.9, 2.4) + vec2(uTime * 0.004, 0.0));
    float m = smoothstep(0.52, 0.62, c) * smoothstep(0.02, 0.2, h) * (1.0 - smoothstep(0.55, 0.9, h));
    vec3 cloud = mix(vec3(1.0, 0.86, 0.74), vec3(1.0), smoothstep(0.6, 0.75, c));
    col = mix(col, cloud, m * 0.6);
  }
  // Below the horizon just continue the haze.
  col = mix(col, uHorizon * 0.92, smoothstep(0.0, -0.08, h));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const seaVertex = /* glsl */ `
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
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
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

export interface World {
  group: THREE.Group;
  sun: THREE.DirectionalLight;
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
  const col = new Float32Array(uv.count * 3);
  for (let i = 0; i < uv.count; i++) {
    col[i * 3] = tint.r;
    col[i * 3 + 1] = tint.g;
    col[i * 3 + 2] = tint.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.rotateY(rot);
  g.translate(x, y + h / 2, z);
  return g;
}

export function buildWorld(track: Track): World {
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
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  /** Distance from a point to the nearest bit of road, in plan. */
  const clearance = (x: number, z: number): number => {
    let best = 1e9;
    for (let i = 0; i < track.n; i += 6) {
      const dd = (track.px[i] - x) ** 2 + (track.pz[i] - z) ** 2;
      if (dd < best) best = dd;
    }
    return Math.sqrt(best);
  };

  // ---- lights -------------------------------------------------------------
  const sun = new THREE.DirectionalLight(COLORS.sunLight, 2.3);
  sun.position.copy(SUN_DIR).multiplyScalar(1000);
  group.add(sun);
  group.add(new THREE.HemisphereLight(COLORS.skyLight, COLORS.groundLight, 0.95));

  // ---- sky ----------------------------------------------------------------
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    uniforms: {
      uZenith: { value: new THREE.Color(COLORS.skyZenith) },
      uMid: { value: new THREE.Color(COLORS.skyMid) },
      uHorizon: { value: new THREE.Color(COLORS.skyHorizon) },
      uSunDir: { value: SUN_DIR.clone() },
      uTime: { value: 0 },
    },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  group.add(sky);

  // ---- sea ----------------------------------------------------------------
  const seaMat = new THREE.ShaderMaterial({
    vertexShader: seaVertex,
    fragmentShader: seaFragment,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uDeep: { value: new THREE.Color(COLORS.seaDeep) },
        uShallow: { value: new THREE.Color(COLORS.seaShallow) },
        uSky: { value: new THREE.Color(0xbfd8f5) },
        uSunDir: { value: SUN_DIR.clone() },
        uTime: { value: 0 },
      },
    ]),
    fog: true,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000, 1, 1), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(cx, -6, cz);
  sea.frustumCulled = false;
  group.add(sea);

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
        if (clearance(x, z) < 120) continue;
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
    const ridge = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshLambertMaterial({ color: 0x8fa3c4, flatShading: true }));
    ridge.frustumCulled = false;
    group.add(ridge);
  }

  // ---- cumulus ------------------------------------------------------------
  const clouds = new THREE.Group();
  {
    const rnd = mulberry(404);
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 34; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 1800 + rnd() * 6500;
      const bx = cx + Math.cos(a) * r;
      const bz = cz + Math.sin(a) * r;
      const by = 520 + rnd() * 900 + r * 0.05;
      const size = 160 + rnd() * 320;
      const puffs = 5 + Math.floor(rnd() * 6);
      for (let k = 0; k < puffs; k++) {
        const g = new THREE.IcosahedronGeometry(size * (0.45 + rnd() * 0.55), 1);
        // Flat bottoms, billowing tops.
        g.scale(1.25 + rnd() * 0.6, 0.62 + rnd() * 0.3, 1 + rnd() * 0.4);
        g.translate(bx + (rnd() - 0.5) * size * 2.6, by + rnd() * size * 0.5 + (k === 0 ? size * 0.35 : 0), bz + (rnd() - 0.5) * size * 1.6);
        parts.push(g);
      }
    }
    const geo = mergeGeometries(parts)!;
    const col = new Float32Array(geo.attributes.position.count * 3).fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = toonMaterial({ color: 0xffffff, emissive: 0x7f86b8, emissiveIntensity: 0.3, fog: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    clouds.add(mesh);
  }
  group.add(clouds);

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

  return {
    group,
    sun,
    update(time: number, camera: THREE.Camera) {
      skyMat.uniforms.uTime.value = time;
      seaMat.uniforms.uTime.value = time;
      sky.position.copy(camera.position);
      sky.scale.setScalar(1);
      clouds.position.x = Math.sin(time * 0.003) * 400;
    },
  };
}
