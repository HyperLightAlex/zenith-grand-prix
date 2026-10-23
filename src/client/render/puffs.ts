// Smoke and steam rising in streams of drawn puffs (the anime look), for the
// scenery: the effects' own smoke drawings (sheet 8, sprites/fx-smoke.png),
// let go one after another from a stack's top or the pour, each swelling as
// it climbs, leaning with the wind and breaking up at the top. A puff is
// round, so one facing the camera looks the same from any side: no flat card
// turning in plain sight as a painted plume did.
//
// Each puff is shaded in the scene's light rather than the sheet's greys:
// the drawings are lit from above, so they are drawn upside down to put the
// lit side under them, toward the fire, and that side takes the fire's
// colour near the source, cooling to the night's violet as the puff climbs.
//
// A stream keeps no state: which puffs are up, and where, follows from the
// time alone, so it is the same however the frames fall, already full at the
// start of a race, and still in a painted still.
import * as THREE from 'three';
import { drawingStep } from './look';
import { UNTONE } from './painted';
import smokeUrl from './sprites/fx-smoke.png';

export type PuffKind = 'smoke' | 'steam';

/** Where a stream rises from, and what. */
export interface PuffSource {
  x: number;
  y: number;
  z: number;
  kind: PuffKind;
}

interface Stream {
  /** Puffs let go a second. */
  rate: number;
  /** Seconds a puff lasts (each a little more or less). */
  life: number;
  /** How wide a puff shows, as it is let go and at the end. */
  size: [number, number];
  /** How fast it climbs, units a second, as it is let go and later. */
  rise: [number, number];
  /** How far from the source a puff starts: between these. */
  spread: [number, number];
  /** How fast it spreads out from the source as it climbs, units a second. */
  outward: number;
  /** How many are the big cloud rather than the small puff (0..1). */
  big: number;
  /** How far above the source the fire still lights its underside. */
  glowReach: number;
  /** How much the wind takes it (the pit's floor is out of most of it). */
  wind: number;
}

const STREAMS: Record<PuffKind, Stream> = {
  // From a smelter stack's top, over its flame: a tall column, leaning off.
  smoke: { rate: 1.7, life: 14, size: [18, 120], rise: [20, 4], spread: [0, 4], outward: 0, big: 0.55, glowReach: 70, wind: 1.4 },
  // Boiling up off the melt round the foot of the pour: in a ring round the
  // stream (which stays clear), smaller and quicker than the smoke, opening
  // out as it climbs and gone well before the turns above; paler, and lit
  // by the melt all the way.
  steam: { rate: 4.2, life: 4.2, size: [10, 44], rise: [24, 9], spread: [7, 13], outward: 3, big: 0.3, glowReach: 150, wind: 0.15 },
};

/** The wind the puffs lean with, units a second. */
const WIND = new THREE.Vector3(4.5, 0, 1.8);

/**
 * How wide each drawing shows in its cell (row by row: the small puff, the
 * big cloud; each swelling, then breaking up), so a puff keeps the size it
 * should be from one drawing to the next.
 */
const EXTENT = [
  [0.24, 0.5, 0.6],
  [0.62, 0.91, 0.87],
];
const WIND_LEN = WIND.length();

/** One puff, as it is now. */
export interface Puff {
  x: number;
  y: number;
  z: number;
  /** How wide its cell is drawn. */
  size: number;
  /** Which drawing: row (0 the small puff, 1 the big cloud) times 3, plus column. */
  cell: number;
  /** Mirrored side to side. */
  flip: boolean;
  /** How much the fire lights it, 0..1. */
  glow: number;
}

/** A number in 0..1 from two integers, the same every time. */
function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** The most puffs a source can have up at once. */
export function maxPuffs(kind: PuffKind): number {
  const s = STREAMS[kind];
  return Math.ceil(s.rate * s.life * 1.15) + 2;
}

/** Puffs up from `src` at `time` (seconds), appended to `out`; `seed` tells sources apart. */
export function puffsAt(src: PuffSource, seed: number, time: number, out: Puff[]): void {
  const s = STREAMS[src.kind];
  const longest = s.life * 1.15;
  const first = Math.floor((time - longest) * s.rate) - 1;
  const last = Math.floor(time * s.rate);
  const tau = s.life / 3;
  for (let i = first; i <= last; i++) {
    const r = (k: number) => hash(seed, i * 8 + k);
    const born = (i + r(0) * 0.7) / s.rate;
    const age = time - born;
    const life = s.life * (0.85 + 0.3 * r(1));
    if (age < 0 || age >= life) continue;
    const f = age / life;
    // Climbing, quick off the source and slowing; leaning more with the wind as it goes.
    const up = s.rise[1] * age + (s.rise[0] - s.rise[1]) * tau * (1 - Math.exp(-age / tau));
    const lean = age * (0.35 + 0.65 * f) * s.wind;
    const wide = (s.size[0] + (s.size[1] - s.size[0]) * Math.pow(f, 0.6)) * (0.8 + 0.4 * r(2));
    const a = r(3) * Math.PI * 2;
    const from = s.spread[0] + (s.spread[1] - s.spread[0]) * Math.sqrt(r(4)) + s.outward * age;
    const drift = wide * 0.22 * (r(5) * 2 - 1);
    const row = r(6) < s.big ? 1 : 0;
    const col = f < 0.24 ? 0 : f < 0.5 ? 1 : 2;
    const below = Math.max(0, 1 - up / s.glowReach);
    out.push({
      x: src.x + Math.cos(a) * from + WIND.x * lean - (drift * WIND.z) / WIND_LEN,
      y: src.y + up + wide * 0.3,
      z: src.z + Math.sin(a) * from + WIND.z * lean + (drift * WIND.x) / WIND_LEN,
      size: wide / EXTENT[row][col],
      cell: row * 3 + col,
      flip: r(7) < 0.5,
      glow: Math.pow(below, 1.6) * (0.75 + 0.25 * r(1)),
    });
  }
}

const VERT = /* glsl */ `
attribute vec3 aCentre;
attribute vec4 aPuff; // size, cell, flip (+1 or -1), glow
attribute float aKind;
varying vec2 vUv;
varying float vGlow;
varying float vKind;
void main() {
  vec4 mv = viewMatrix * vec4(aCentre, 1.0);
  // Upright in the world, not on the screen: with the camera rolled (the
  // Drill), the lit side stays under the puff. Looking straight up or down,
  // where the world's up is nowhere on screen, it eases to the screen's.
  vec2 up = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xy;
  float l = length(up);
  float turn = l > 1e-4 ? atan(up.x, up.y) * smoothstep(0.05, 0.3, l) : 0.0;
  float c = cos(turn), s = sin(turn);
  vec2 corner = position.xy * aPuff.x;
  mv.xy += vec2(c * corner.x + s * corner.y, -s * corner.x + c * corner.y);
  gl_Position = projectionMatrix * mv;
  float row = floor(aPuff.y / 3.0 + 0.01);
  float col = aPuff.y - row * 3.0;
  // Mirrored side to side at random, and upside down (the sheet's light is
  // above; the fire is below). Rows run down the atlas; v runs up.
  vec2 q = vec2(aPuff.z > 0.0 ? uv.x : 1.0 - uv.x, 1.0 - uv.y);
  vUv = vec2((col + q.x) / 3.0, 1.0 - (row + 1.0) / 2.0 + q.y / 2.0);
  vGlow = aPuff.w;
  vKind = aKind;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
// Each kind's tones: the line, the shadow, the body, the lit side; then the
// shadow, body and lit side as the fire lights them.
uniform vec3 uSmoke[7];
uniform vec3 uSteam[7];
varying vec2 vUv;
varying float vGlow;
varying float vKind;
${UNTONE}
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.02) discard;
  // The sheet's greys, as painted: a line under 0.1, a shadow about 0.17,
  // the body about 0.37, the lit side about 0.6.
  float v = dot(t.rgb, vec3(0.3, 0.59, 0.11));
  vec3 line = mix(uSmoke[0], uSteam[0], vKind);
  vec3 dark = mix(mix(uSmoke[1], uSteam[1], vKind), mix(uSmoke[4], uSteam[4], vKind), vGlow * 0.55);
  vec3 body = mix(mix(uSmoke[2], uSteam[2], vKind), mix(uSmoke[5], uSteam[5], vKind), vGlow * 0.8);
  vec3 lit = mix(mix(uSmoke[3], uSteam[3], vKind), mix(uSmoke[6], uSteam[6], vKind), vGlow);
  vec3 c = mix(line, dark, smoothstep(0.08, 0.15, v));
  c = mix(c, body, smoothstep(0.24, 0.32, v));
  c = mix(c, lit, smoothstep(0.44, 0.52, v));
  gl_FragColor = vec4(unTone(c), t.a);
}`;

const SMOKE = [0x15102a, 0x2a2442, 0x463e64, 0x645a84, 0x5c2238, 0xa83e30, 0xff8a42];
const STEAM = [0x2a2238, 0x4a4268, 0x7a719a, 0xa69ec4, 0x7a3a46, 0xcf6a40, 0xffb87a];

/** The puffs over the sources, in one mesh; `update` it every frame. */
export class PuffStreams {
  readonly mesh: THREE.Mesh;
  private readonly sources: PuffSource[];
  private readonly centre: THREE.InstancedBufferAttribute;
  private readonly puff: THREE.InstancedBufferAttribute;
  private readonly kind: THREE.InstancedBufferAttribute;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly live: Puff[] = [];
  private readonly kinds: number[] = [];
  private readonly order: number[] = [];
  private readonly depth: number[] = [];

  constructor(sources: PuffSource[]) {
    this.sources = sources;
    const max = Math.max(
      1,
      sources.reduce((n, s) => n + maxPuffs(s.kind), 0),
    );
    const plane = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = plane.index;
    geo.setAttribute('position', plane.getAttribute('position'));
    geo.setAttribute('uv', plane.getAttribute('uv'));
    this.centre = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.puff = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.kind = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aCentre', this.centre);
    geo.setAttribute('aPuff', this.puff);
    geo.setAttribute('aKind', this.kind);
    geo.instanceCount = 0;
    this.geo = geo;
    // The sheet's greys read as painted (not as colours to light), so its
    // values are the ones the tones were measured at.
    const map = new THREE.TextureLoader().load(smokeUrl);
    map.colorSpace = THREE.NoColorSpace;
    const colours = (hexes: number[]) => hexes.map((h) => new THREE.Color(h));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: map },
        uSmoke: { value: colours(SMOKE) },
        uSteam: { value: colours(STEAM) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }

  /** Move them on to `time`, in drawings, and draw them farthest first. */
  update(time: number, camera: THREE.Camera): void {
    const step = drawingStep();
    const t = step > 0 ? Math.floor(time / step) * step : time;
    const live = this.live;
    live.length = 0;
    const kinds = this.kinds;
    kinds.length = 0;
    this.sources.forEach((src, k) => {
      const before = live.length;
      puffsAt(src, 7919 * (k + 1), t, live);
      for (let i = before; i < live.length; i++) kinds.push(src.kind === 'steam' ? 1 : 0);
    });
    const e = camera.matrixWorldInverse.elements;
    const order = this.order;
    const depth = this.depth;
    order.length = live.length;
    depth.length = live.length;
    for (let i = 0; i < live.length; i++) {
      const p = live[i];
      order[i] = i;
      depth[i] = e[2] * p.x + e[6] * p.y + e[10] * p.z + e[14];
    }
    // View space looks down -z: the most negative is the farthest.
    order.sort((a, b) => depth[a] - depth[b]);
    const c = this.centre.array as Float32Array;
    const q = this.puff.array as Float32Array;
    const kd = this.kind.array as Float32Array;
    const n = Math.min(live.length, kd.length);
    for (let j = 0; j < n; j++) {
      const i = order[j];
      const p = live[i];
      c[j * 3] = p.x;
      c[j * 3 + 1] = p.y;
      c[j * 3 + 2] = p.z;
      q[j * 4] = p.size;
      q[j * 4 + 1] = p.cell;
      q[j * 4 + 2] = p.flip ? -1 : 1;
      q[j * 4 + 3] = p.glow;
      kd[j] = kinds[i];
    }
    this.geo.instanceCount = n;
    this.centre.needsUpdate = true;
    this.puff.needsUpdate = true;
    this.kind.needsUpdate = true;
  }
}
