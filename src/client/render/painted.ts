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
import meridian from './backgrounds/meridian';

export interface PaintedCard {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  /** Width over height. */
  aspect: number;
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
}

const SETS: Record<string, PaintedSet> = { meridian };

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
  x = max(x, 0.0) * (0.6 / 1.02);
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
