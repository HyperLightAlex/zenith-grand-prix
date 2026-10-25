// The anime look's painted backgrounds: each circuit's sky, horizon, clouds and
// surface textures, painted to a brief (art/bg-sheets) and built into the
// game's textures by tools/bg/build_backgrounds.py. world.ts puts them in
// place of the procedural scenery while the look is on; the plain look keeps
// its own.
//
// The frame goes through ACES tone mapping on the way out, which would change
// a painting's colours (lifted mids, greyed whites). The painted materials
// first undo it (`unTone`), so the paintings come out of it as painted; only
// the brightest whites are held a little under the bloom threshold.
import * as THREE from 'three';
import { alsoWears, ownTextures } from './owned';
import { toonMaterial } from './palette';
import abyss from './backgrounds/abyss';
import monsoon from './backgrounds/monsoon';
import canyon from './backgrounds/canyon';
import crucible from './backgrounds/crucible';
import frostline from './backgrounds/frostline';
import titan from './backgrounds/titan';
import zenith from './backgrounds/zenith';
import helios from './backgrounds/helios';
import meridian from './backgrounds/meridian';
import trackKit from './backgrounds/track';
import hangarKit from './backgrounds/hangar';

export interface PaintedCard {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  /** Width over height. */
  aspect: number;
  /** Smoke and steam: where along the bottom the plume rises from (0..1 across). */
  base?: number;
}

export interface PaintedSet {
  /** The sky round the whole horizon, horizon to zenith: the sun-side half first. */
  sky: string;
  /** Where the sun's glow is across the sky texture (0..1). */
  sunU: number;
  /** The horizon's height in the sky texture (0..1, from the bottom). */
  horizonV: number;
  /** Silhouette strips, farthest first; each repeats end to end. */
  horizon: Array<{ url: string; aspect: number }>;
  /** Cloud cards in one atlas. */
  clouds: { url: string; cards: PaintedCard[] };
  /** Repeating surface textures, by name. */
  surfaces: Record<string, string>;
  /** Signs on the scenery (Neon Crucible's neon signs), in the sheet's order. */
  signs?: PaintedSign[];
  /** In orbit (Zenith Ring): the Earth's surface seen from orbit, repeating squares by kind (ocean, desert, cloud, green, night, mountains). */
  earth?: Record<string, string>;
}

/** A painted sign: its picture and its width over its height. */
export interface PaintedSign {
  url: string;
  aspect: number;
}

/** The painted track kit (art/track-sheets), shared by every circuit. */
export interface PaintedTrack {
  /** Repeating textures: road deck, barrier armour, dark steel, concrete, gantry steel, the crowd. */
  surfaces: Record<'road' | 'armour' | 'steel' | 'concrete' | 'gantry' | 'crowd', string>;
  /** The crowd texture's width over its height (it is cut on whole rows of seats). */
  crowdAspect: number;
  /** Sponsor boards: Kestrel Energy, Nova Tire, Aoki Heavy Industries, Halcyon Air, ZGP Live, Zenith Grand Prix. */
  boards: PaintedSign[];
  /** Each circuit's own board, by setting. */
  circuits: Record<string, PaintedSign>;
  /** The banner over the start line. */
  banner: PaintedSign;
  /** A circuit's own sign over its road, by setting (Neon Crucible's, over the way into the pit). */
  circuitSigns: Record<string, PaintedSign>;
}

export const paintedTrack: PaintedTrack = trackKit;

/** The painted hangar kit (art/hangar-sheets), for the garage. */
export interface PaintedHangar {
  /** Repeating textures: the floor (a 4 m slab), the wall cladding (a 4 m panel), the roof's underside, the catwalks' grating, hazard stripes (about 1 m), and the pipes along the foot of the walls (repeating along only). */
  surfaces: Record<'floor' | 'cladding' | 'roof' | 'grating' | 'hazard' | 'services', string>;
  /** The services strip's width over its height. */
  servicesAspect: number;
  /** The teams' names as painted on their walls, and the safety signs. */
  signs: Record<'solstice' | 'vanta' | 'mirage' | 'aurora' | 'caution' | 'noSmoking' | 'firePoint' | 'voltage', PaintedSign> & { tempest?: PaintedSign };
}

export const paintedHangar: PaintedHangar = hangarKit;

const SETS: Record<string, PaintedSet> = { meridian, canyon, helios, crucible, frostline, titan, abyss, monsoon, zenith };

/** The painted background for a circuit's setting, if it has one. */
export function paintedSet(themeId: string): PaintedSet | null {
  return SETS[themeId] ?? null;
}

/**
 * How each horizon strip stands round the circuit, farthest first: its
 * distance, how many degrees tall it looks, and how many times it goes
 * round (each repeat drawn a little wider than painted, which a range of
 * hills takes better than being repeated more often).
 */
export const HORIZON_RINGS: Record<string, Array<{ radius: number; degrees: number; repeats: number }>> = {
  meridian: [
    { radius: 14000, degrees: 3.2, repeats: 5 },
    { radius: 11000, degrees: 2.0, repeats: 7 },
    { radius: 8500, degrees: 1.4, repeats: 16 },
  ],
  // Mesas, then buttes and spires, then hoodoos: upright shapes, so drawn
  // closer to their painted width than Meridian's hills.
  canyon: [
    { radius: 14000, degrees: 4.2, repeats: 6 },
    { radius: 11000, degrees: 3.4, repeats: 10 },
    { radius: 8500, degrees: 2.4, repeats: 14 },
  ],
  // Far snowy peaks, nearer peaks, then a wall of cumulus on the cloud sea.
  helios: [
    { radius: 14000, degrees: 3.4, repeats: 9 },
    { radius: 11000, degrees: 3.8, repeats: 11 },
    { radius: 8500, degrees: 2.6, repeats: 15 },
  ],
  // Mountains, the far city, then the foundry district: towers and stacks
  // stand upright, so drawn about as wide as painted.
  crucible: [
    { radius: 14000, degrees: 3.0, repeats: 11 },
    { radius: 11000, degrees: 2.4, repeats: 17 },
    { radius: 8500, degrees: 2.8, repeats: 18 },
  ],
  // Snowy mountains, a coast of glaciers, then icebergs in the pack ice: the
  // bergs stand upright, so drawn about as wide as painted.
  frostline: [
    { radius: 14000, degrees: 2.6, repeats: 11 },
    { radius: 11000, degrees: 3.0, repeats: 16 },
    { radius: 8500, degrees: 2.6, repeats: 22 },
  ],
  // Worn mountains, then the graveyard of giants (hands, helmets, swords
  // standing in the sand: upright, so about as wide as painted), then dunes
  // with wreckage.
  titan: [
    { radius: 14000, degrees: 2.4, repeats: 12 },
    { radius: 11000, degrees: 3.4, repeats: 16 },
    { radius: 8500, degrees: 2.4, repeats: 20 },
  ],
  // Under the sea: rock ridges and sea mounts faded into the water, the
  // town's outskirts (domes and towers), then a kelp forest.
  abyss: [
    { radius: 14000, degrees: 2.8, repeats: 10 },
    { radius: 11000, degrees: 2.6, repeats: 14 },
    { radius: 8500, degrees: 2.2, repeats: 24 },
  ],
  // In the rain: forested mountains half lost in it, jungle hills with
  // temples rising out of the canopy, then the jungle's edge (tall trees,
  // upright, so drawn about as wide as painted).
  monsoon: [
    { radius: 14000, degrees: 3.0, repeats: 10 },
    { radius: 11000, degrees: 3.2, repeats: 13 },
    { radius: 8500, degrees: 3.0, repeats: 20 },
  ],
};

/**
 * Where the sun's disc is drawn over a painted sky, if not where the light
 * comes from (degrees of the disc's centre above the horizon): Canyon's sky
 * is painted with the sun on the horizon, its disc a deeper sunset orange;
 * Helios's with the sun high overhead; the Crucible's moon where its halo is.
 */
export const SUN_DISC: Record<string, { elevation: number; color: [number, number, number] }> = {
  canyon: { elevation: 1.6, color: [2.1, 1.25, 0.55] },
  helios: { elevation: 64, color: [1.9, 1.85, 1.7] },
  // The moon, where its halo is painted, cold white.
  crucible: { elevation: 25.3, color: [1.55, 1.65, 1.9] },
  // Frostline's moon, where F1 paints its halo.
  frostline: { elevation: 25, color: [1.5, 1.58, 1.8] },
  // Titan's Rest's morning sun, where R1 paints its glow, white-gold.
  titan: { elevation: 15.5, color: [2.0, 1.88, 1.6] },
  // Zenith Ring's sun, hard and white, where Z1 paints its glare.
  zenith: { elevation: 24.6, color: [3.2, 3.1, 2.9] },
  // Under the sea there is no disc: A1 paints the sun as a bright patch on
  // the surface overhead. (Under the horizon, where the disc is never drawn.)
  abyss: { elevation: -30, color: [1, 1, 1] },
  // Nor in the storm: J1 paints only a paler patch in the cloud.
  monsoon: { elevation: -30, color: [1, 1, 1] },
};

/**
 * GLSL: the colour that three's ACES tone mapping (exposure 1.02) turns into
 * `c`, so a painting drawn through it comes out as painted. The brightest
 * results are held just under the look's bloom threshold.
 */
export const UNTONE = /* glsl */ `
vec3 unTone(vec3 c) {
  c = clamp(c, 0.0, 0.985);
  c = mat3(vec3(0.643038, 0.059269, 0.005962), vec3(0.311187, 0.931436, 0.063929), vec3(0.045775, 0.009295, 0.930118)) * c;
  c = min(c, vec3(0.99));
  vec3 A = 1.0 - 0.983729 * c;
  vec3 B = 0.0245786 - 0.432951 * c;
  vec3 C = -(0.000090537 + 0.238081 * c);
  vec3 v = (-B + sqrt(max(B * B - 4.0 * A * C, 0.0))) / (2.0 * A);
  vec3 x = mat3(vec3(1.764741, -0.147028, -0.036337), vec3(-0.675778, 1.160252, -0.162436), vec3(-0.088963, -0.013224, 1.198773)) * v;
  // A saturated painted colour (Helios's ultramarine) needs a little of some
  // channel below zero here: ACES's input matrix mixes the channels, and it
  // takes that to come out of it as saturated as painted. Clamped, the sky
  // would come out lavender. The look's passes and the final tone mapping
  // carry the negative through.
  x *= 0.6 / 1.02;
  float lum = dot(x, vec3(0.2126, 0.7152, 0.0722));
  return lum > 1.15 ? x * (1.15 / lum) : x;
}`;

/** Load one of the painted textures. `onReady` runs once its picture is in. */
export function paintedTexture(url: string, opts: { repeat?: boolean; onReady?: () => void } = {}): THREE.Texture {
  const t = new THREE.TextureLoader().load(url, () => opts.onReady?.());
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (opts.repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  return t;
}

/** Repeating painted textures by URL, so a world loads each one once however many materials use it. */
export type PaintedMaps = Map<string, { map: THREE.Texture; ready: boolean; waiting: Array<() => void> }>;

/** The repeating painted texture at `url` (from `cache` when given), and `done` called once it is in. */
function repeatingMap(url: string, done: () => void, cache?: PaintedMaps): THREE.Texture {
  if (!cache) return paintedTexture(url, { repeat: true, onReady: done });
  let e = cache.get(url);
  if (!e) {
    const entry = { map: null as unknown as THREE.Texture, ready: false, waiting: [] as Array<() => void> };
    entry.map = paintedTexture(url, {
      repeat: true,
      onReady: () => {
        entry.ready = true;
        for (const w of entry.waiting.splice(0)) w();
      },
    });
    cache.set(url, entry);
    e = entry;
  }
  if (e.ready) queueMicrotask(done);
  else e.waiting.push(done);
  return e.map;
}

/**
 * Use a painted material on `mesh` (or each of several) with the painted
 * background (when the look's switch, through `swaps`, says so), made from
 * the painted textures `urls` once they are all in (until then a painted
 * material draws black); its own material otherwise.
 */
export function swapWhenPainted(
  swaps: Array<(painted: boolean) => void>,
  mesh: THREE.Mesh | THREE.Mesh[],
  urls: string[],
  make: (maps: THREE.Texture[]) => THREE.Material,
  cache?: PaintedMaps,
): void {
  const meshes = Array.isArray(mesh) ? mesh : [mesh];
  const plain = meshes.map((m) => m.material as THREE.Material);
  let on = false;
  let ready = 0;
  const apply = () => meshes.forEach((m, i) => (m.material = on && ready === urls.length ? painted : plain[i]));
  const maps = urls.map((u) =>
    repeatingMap(
      u,
      () => {
        ready++;
        if (ready === urls.length) apply();
      },
      cache,
    ),
  );
  const painted = make(maps);
  // Each mesh wears one or the other: both freed with it.
  meshes.forEach((m, i) => alsoWears(m, plain[i], painted));
  swaps.push((p) => {
    on = p;
    apply();
  });
}

/** A plain white 1x1 texture: stands in for a painted map in the plain look, so swapping maps never recompiles. */
export function whiteTexture(): THREE.Texture {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
}

const cardVertex = /* glsl */ `
uniform vec4 uRect;
uniform vec2 uRepeat;
varying vec2 vUv;
void main() {
  vUv = uRect.xy + uv * uRect.zw * vec2(uRepeat.x, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const cardFragment = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
${UNTONE}
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.01) discard;
  gl_FragColor = vec4(unTone(t.rgb), t.a);
}`;

/**
 * A material for a painted card (a cloud, a horizon strip): the painting as
 * painted, see-through where it is, outside the fog. `rect` picks a part of
 * an atlas (u, v, width, height); `repeats` runs a strip round several times.
 */
export function paintedCardMaterial(map: THREE.Texture, rect: [number, number, number, number] = [0, 0, 1, 1], repeats = 1, side: THREE.Side = THREE.FrontSide): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uRect: { value: new THREE.Vector4(...rect) },
      uRepeat: { value: new THREE.Vector2(repeats, 1) },
    },
    vertexShader: cardVertex,
    fragmentShader: cardFragment,
    transparent: true,
    depthWrite: false,
    side,
  });
}

const surfaceNoise = /* glsl */ `
float surfHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float surfNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(surfHash(i), surfHash(i + vec2(1, 0)), f.x), mix(surfHash(i + vec2(0, 1)), surfHash(i + vec2(1, 1)), f.x), f.y);
}`;

/**
 * A lit material painted with `wall` on its faces and `top` on whatever faces
 * up, for rock, concrete and steel that has no texture coordinates of its
 * own: they come from the world position and each face's own facing. Down
 * the faces, the painting stays level all the way round (its bands, a
 * cliff's strata, dipping gently across the world by `dip` repeats, so no two
 * mesas band alike); across them, it runs along the face. Works on instanced
 * meshes; `toon` shades it in cel bands like the plain toon materials.
 * `patch` paints another top inside a rectangle in plan (x0, z0, x1, z1),
 * its edge ragged over about `edge` metres: a plaza's paving in a jungle floor.
 */
export function paintedSurfaceMaterial(
  wall: THREE.Texture,
  top: THREE.Texture,
  wallSize: number,
  topSize: number,
  side: THREE.Side = THREE.FrontSide,
  opts: { toon?: boolean; dip?: number; patch?: { map: THREE.Texture; size: number; rect: [number, number, number, number]; edge?: number } } = {},
): THREE.MeshLambertMaterial | THREE.MeshToonMaterial {
  const patch = opts.patch;
  const mat = opts.toon ? toonMaterial({ side, vertexColors: false }) : new THREE.MeshLambertMaterial({ side });
  const dip = opts.dip ?? 1.2;
  // (Handed to the shader below, not set on the material: named so they are freed with it.)
  ownTextures(mat, wall, top, patch?.map);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWall = { value: wall };
    sh.uniforms.uTop = { value: top };
    sh.uniforms.uWallSize = { value: wallSize };
    sh.uniforms.uTopSize = { value: topSize };
    sh.uniforms.uDip = { value: dip };
    if (patch) {
      sh.uniforms.uPatch = { value: patch.map };
      sh.uniforms.uPatchSize = { value: patch.size };
      sh.uniforms.uPatchRect = { value: new THREE.Vector4(...patch.rect) };
      sh.uniforms.uPatchEdge = { value: patch.edge ?? 8 };
    }
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSurfPos;').replace(
      '#include <project_vertex>',
      `#include <project_vertex>
{
  vec4 sp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  sp = instanceMatrix * sp;
  #endif
  vSurfPos = (modelMatrix * sp).xyz;
}`,
    );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uWall;
uniform sampler2D uTop;
uniform float uWallSize;
uniform float uTopSize;
uniform float uDip;
varying vec3 vSurfPos;
${patch ? 'uniform sampler2D uPatch;\nuniform float uPatchSize;\nuniform vec4 uPatchRect;\nuniform float uPatchEdge;' : ''}
${surfaceNoise}`,
      )
      .replace(
        '#include <map_fragment>',
        `{
  vec3 dpx = dFdx(vSurfPos);
  vec3 dpy = dFdy(vSurfPos);
  vec3 fn = normalize(cross(dpx, dpy));
  float up = smoothstep(0.62, 0.8, abs(fn.y));
  vec2 t = normalize(vec2(-fn.z, fn.x) + vec2(1e-5, 0.0));
  float dip = (surfNoise(vSurfPos.xz * 0.0012) - 0.5) * uDip * uWallSize;
  vec2 wuv = vec2(dot(vSurfPos.xz, t), vSurfPos.y + dip) / uWallSize;
  // Gradients from the face itself, so the face edges (where the side-on
  // coordinates jump) do not pull in the smallest mip.
  vec3 wallC = textureGrad(uWall, wuv, vec2(dot(dpx.xz, t), dpx.y) / uWallSize, vec2(dot(dpy.xz, t), dpy.y) / uWallSize).rgb;
  vec3 topC = textureGrad(uTop, vSurfPos.xz / uTopSize, dpx.xz / uTopSize, dpy.xz / uTopSize).rgb;
  ${
    patch
      ? `{
    vec2 q = vSurfPos.xz;
    float inside = min(min(q.x - uPatchRect.x, uPatchRect.z - q.x), min(q.y - uPatchRect.y, uPatchRect.w - q.y));
    inside += (surfNoise(q * 0.045) - 0.5) * uPatchEdge * 2.0;
    vec3 patchC = textureGrad(uPatch, q / uPatchSize, dpx.xz / uPatchSize, dpy.xz / uPatchSize).rgb;
    topC = mix(topC, patchC, smoothstep(-uPatchEdge * 0.5, uPatchEdge * 0.5, inside));
  }`
      : ''
  }
  diffuseColor.rgb *= mix(wallC, topC, up) * (0.9 + 0.2 * surfNoise(vSurfPos.xz * 0.004 + 9.0));
}`,
      );
  };
  mat.customProgramCacheKey = () => (opts.toon ? 'paintedSurfaceToon' : 'paintedSurface') + (patch ? 'Patch' : '');
  return mat;
}

const signVertex = /* glsl */ `
varying vec2 vUv;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const signFragment = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
#include <common>
#include <fog_pars_fragment>
${UNTONE}
void main() {
  gl_FragColor = vec4(unTone(texture2D(uMap, vUv).rgb), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

/** A painted sign (a board, the banner): the painting as painted, flat and unlit, in the fog. */
export function paintedSignMaterial(map: THREE.Texture): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null } }]),
    vertexShader: signVertex,
    fragmentShader: signFragment,
    fog: true,
  });
  mat.uniforms.uMap.value = map;
  return mat;
}
