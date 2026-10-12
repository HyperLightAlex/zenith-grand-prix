// Builds everything bolted to the circuit: the road surface (a procedural
// shader), barriers, gantries, support pylons and trackside boards.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { frameAt, hwAt, makeFrame, wrapS, type Track } from '../../sim/track';
import { COLORS, SUN_DIR, toonMaterial } from './palette';
import { buildGates, type GateVisual } from './gates';
import { trackMatrix } from './trackSpace';

const MAX_STRIPS = 12;
const MAX_GATES = 8;
const MAX_PADS = 8;
const MAX_GAPS = 8;
const MAX_WALL_PULSES = 8;

// The barrier's energy field: invisible until something hits the wall, then
// a glow at the point of impact and a wave running away along the barrier in
// both directions. A ring-out burns hotter, bigger and longer.
const wallVertex = /* glsl */ `
attribute float aS;
attribute float aH;
attribute float aSide;
varying float vS;
varying float vH;
varying float vSide;
void main() {
  vS = aS;
  vH = aH;
  vSide = aSide;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;

const wallFragment = /* glsl */ `
uniform float uLength;
uniform vec4 uPulse[${MAX_WALL_PULSES}];
uniform vec3 uCool;
uniform vec3 uHot;
varying float vS;
varying float vH;
varying float vSide;
void main() {
  vec3 col = vec3(0.0);
  // A force-field grid, only ever seen where a pulse lights it.
  float gs = abs(fract(vS / 1.8) - 0.5);
  float gh = abs(fract(vH / 1.8) - 0.5);
  float grid = 0.3 + 0.7 * smoothstep(0.36, 0.5, max(gs, gh));
  for (int i = 0; i < ${MAX_WALL_PULSES}; i++) {
    vec4 p = uPulse[i];
    // y: which face (-2, -1, 1, 2), plus ten (away from zero) for a ring-out.
    float hot = step(5.0, abs(p.y));
    float face = p.y - sign(p.y) * 10.0 * hot;
    if (p.w <= 0.0 || abs(face - vSide) > 0.5) continue;
    float age = p.z;
    float life = mix(0.7, 1.2, hot) + 0.15 * p.w;
    if (age > life) continue;
    float fade = 1.0 - age / life;
    float ds = mod(vS - p.x + uLength * 0.5, uLength) - uLength * 0.5;
    float ad = abs(ds);
    // The wave front runs away along the wall from the impact.
    float front = age * mix(60.0, 85.0, hot);
    float width = 2.5 + 6.0 * age;
    float wave = exp(-pow((ad - front) / width, 2.0)) * fade * mix(1.0, 1.6, hot);
    // The impact itself: a burn that spreads a little and dies away.
    float spread = 4.0 + 20.0 * age;
    float core = exp(-ad * ad / (spread * spread)) * fade * mix(2.4, 4.0, hot);
    // Tallest at the impact, dropping toward the barrier top along the wave.
    float top = mix(3.4, 7.5, exp(-ad / 18.0)) * mix(0.8, 1.0, hot);
    float hgt = smoothstep(top, top * 0.35, vH) * smoothstep(-0.2, 0.5, vH);
    float e = (wave + core) * hgt * grid * min(2.0, p.w);
    col += mix(uCool, uHot, hot) * e;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const roadVertex = /* glsl */ `
attribute float aKappa;
attribute vec3 aEdge;
varying vec2 vTc;
varying float vKappa;
varying vec3 vEdge;
varying vec3 vWorld;
varying vec3 vNormalW;
#include <common>
#include <fog_pars_vertex>
void main() {
  vTc = uv;
  vKappa = aKappa;
  vEdge = aEdge;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const roadFragment = /* glsl */ `
uniform float uTime;
uniform float uLength;
uniform vec4 uPads[${MAX_PADS}];
uniform vec4 uGaps[${MAX_GAPS}];
uniform vec3 uPadColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uChargeColor;
uniform vec4 uStrips[${MAX_STRIPS}];
uniform vec4 uGates[${MAX_GATES}];
uniform vec3 uCellColor;
uniform float uWeapons;
varying vec2 vTc;
varying float vKappa;
/** Half width, the half width of a fork's middle wall, and 1 where this side's edge has no barrier. */
varying vec3 vEdge;
varying vec3 vWorld;
varying vec3 vNormalW;
#include <common>
#include <fog_pars_fragment>

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
// Anti-aliased band of half-width hw centred on c.
float band(float x, float c, float hw) {
  float w = fwidth(x) * 1.2;
  return 1.0 - smoothstep(hw - w, hw + w, abs(x - c));
}
float box(float x, float lo, float hi) {
  float w = fwidth(x) * 1.2;
  return smoothstep(lo - w, lo + w, x) * (1.0 - smoothstep(hi - w, hi + w, x));
}

void main() {
  float d = vTc.x;
  float s = vTc.y;
  float ad = abs(d);
  float uHalfW = vEdge.x;
  float med = vEdge.y;
  float open = vEdge.z;
  float dist = length(cameraPosition - vWorld);
  float detail = 1.0 - smoothstep(260.0, 900.0, dist);

  // Slab colour: pale composite panels with slight variation.
  vec2 cell = vec2(floor(s / 24.0), floor((d + uHalfW) / (uHalfW * 0.5)));
  float n = hash21(cell);
  vec3 col = mix(vec3(0.29, 0.31, 0.36), vec3(0.34, 0.36, 0.42), n);
  // Darker racing groove down the middle third.
  col *= 1.0 - 0.10 * (1.0 - smoothstep(4.0, 15.0, ad));
  // Panel seams.
  float seam = band(fract(s / 24.0), 0.5, 0.004) + band(fract((d + uHalfW) / (uHalfW * 0.5)), 0.5, 0.006) * 0.0;
  col *= 1.0 - 0.28 * seam * detail;

  // Lane dashes at the quarter lines, solid pair on the centre line.
  float dash = step(fract(s / 26.0), 0.42);
  float lanes = (band(d, uHalfW * 0.5, 0.22) + band(d, -uHalfW * 0.5, 0.22)) * dash;
  float centre = band(ad, 0.55, 0.16);
  col = mix(col, vec3(0.93, 0.95, 0.98), clamp(lanes * 0.85 + centre * 0.7, 0.0, 1.0) * mix(0.55, 1.0, detail));

  // Rumble ticks inside each edge line: the nearest thing to the mech's feet,
  // so they are what tells the eye how fast the road is going by.
  float tick = box(ad, uHalfW - 6.4, uHalfW - 3.7) * step(fract(s / 7.0), 0.2);
  col = mix(col, vec3(0.86, 0.88, 0.93), tick * 0.5 * mix(0.35, 1.0, detail));

  // Edge lines and the shoulder beyond them.
  float edge = box(ad, uHalfW - 3.1, uHalfW - 2.5);
  col = mix(col, vec3(0.96, 0.97, 1.0), edge);
  float shoulder = smoothstep(uHalfW - 2.5, uHalfW - 2.3, ad);
  col = mix(col, vec3(0.17, 0.19, 0.24), shoulder);
  // An edge with no barrier: red and white blocks and a lit lip, so the drop reads.
  float lip = open * smoothstep(uHalfW - 2.3, uHalfW - 0.4, ad);
  col = mix(col, mix(vec3(0.95, 0.12, 0.18), vec3(0.97), step(0.5, fract(s / 6.0))), open * shoulder);
  // A fork's middle wall gets an edge line and shoulder of its own.
  if (med > 0.3) {
    float inner = ad - med;
    col = mix(col, vec3(0.96, 0.97, 1.0), box(inner, 2.5, 3.1));
    col = mix(col, vec3(0.17, 0.19, 0.24), 1.0 - smoothstep(2.3, 2.5, inner));
  }
  // Kerbs on the inside of corners: red and white blocks.
  float inside = step(0.0, vKappa * d);
  float kerbOn = smoothstep(0.0012, 0.0022, abs(vKappa)) * inside * shoulder;
  vec3 kerb = mix(vec3(0.92, 0.16, 0.20), vec3(0.96), step(0.5, fract(s / 9.0)));
  col = mix(col, kerb, kerbOn);
  // Hazard chevrons on the outside shoulder of corners.
  float outside = (1.0 - inside) * smoothstep(0.0012, 0.0022, abs(vKappa)) * shoulder;
  float hz = step(0.5, fract((s + ad * 1.5) / 5.0));
  col = mix(col, mix(vec3(0.12, 0.13, 0.16), vec3(1.0, 0.72, 0.1), hz), outside * 0.9);

  // Start line: chequered band, and the grid boxes behind it.
  float sw = s > uLength * 0.5 ? s - uLength : s;
  float onLine = box(sw, -3.0, 3.0) * (1.0 - shoulder);
  float chk = mod(floor(sw / 1.5) + floor(d / 1.5), 2.0);
  col = mix(col, mix(vec3(0.07), vec3(0.97), chk), onLine);
  for (int row = 0; row < 3; row++) {
    float gs = -(10.0 + float(row) * 12.0) + 4.5;
    float lineS = band(sw, gs, 0.25);
    float sideS = box(sw, gs - 5.0, gs);
    float gl = lineS * box(ad, 4.5, 13.5) + sideS * (band(ad, 4.5, 0.22) + band(ad, 13.5, 0.22));
    col = mix(col, vec3(0.97, 0.98, 1.0), clamp(gl, 0.0, 1.0));
  }

  // Lighting: low sun, sky fill, and a long glint toward the sun.
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorld);
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 lit = col * (uSkyColor * 0.55 + uSunColor * ndl * 1.05);
  vec3 H = normalize(uSunDir + V);
  float spec = pow(max(dot(N, H), 0.0), 90.0);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  lit += uSunColor * spec * 0.35 + uSkyColor * fres * 0.14;

  // Charge strips: glowing lanes with chevrons running forward.
  vec3 glow = vec3(0.0);
  for (int i = 0; i < ${MAX_STRIPS}; i++) {
    vec4 st = uStrips[i];
    if (st.w <= 0.0) continue;
    float ss = s;
    if (st.y > uLength && s < st.y - uLength) ss = s + uLength;
    float along = box(ss, st.x, st.y);
    if (along <= 0.001) continue;
    float ld = (d - st.z) / st.w;
    float across = 1.0 - smoothstep(0.92, 1.0, abs(ld));
    float rim = smoothstep(0.78, 0.9, abs(ld)) * across;
    float chev = fract((ss - abs(ld) * 5.0 - uTime * 34.0) / 11.0);
    float arrows = smoothstep(0.0, 0.08, chev) * (1.0 - smoothstep(0.42, 0.5, chev));
    float fade = smoothstep(st.x, st.x + 14.0, ss) * (1.0 - smoothstep(st.y - 14.0, st.y, ss));
    float m = along * across * fade;
    lit = mix(lit, lit * 0.35, m * 0.8);
    glow += uChargeColor * m * (0.22 + arrows * 0.95 + rim * 1.5);
  }
  // Cell gates: a gold run-in painted on the road, chevrons flowing to the arch.
  for (int i = 0; i < ${MAX_GATES}; i++) {
    vec4 gt = uGates[i];
    if (gt.z <= 0.0) continue;
    float ga = gt.x - s;
    if (ga < -3.0 || ga > 110.0) continue;
    float ld = (d - gt.y) / gt.z;
    float across = 1.0 - smoothstep(0.9, 1.0, abs(ld));
    float rim = smoothstep(0.7, 0.86, abs(ld)) * across;
    float chev = fract((s - abs(ld) * 5.0 - uTime * 30.0) / 9.0);
    float arrows = smoothstep(0.0, 0.1, chev) * (1.0 - smoothstep(0.4, 0.5, chev));
    float fade = (1.0 - smoothstep(70.0, 110.0, ga)) * smoothstep(-3.0, 0.0, ga);
    float m = across * fade;
    lit = mix(lit, lit * 0.45, m * 0.6 * gt.w);
    glow += uCellColor * m * (0.08 + arrows * 0.7 + rim * 1.2) * mix(0.12, 1.0, gt.w);
  }
  // Speed pads: fast chevrons, hot pink.
  for (int i = 0; i < ${MAX_PADS}; i++) {
    vec4 pd = uPads[i];
    if (pd.w <= 0.0) continue;
    float along = box(s, pd.x, pd.y);
    if (along <= 0.001) continue;
    float ld = (d - pd.z) / pd.w;
    float across = 1.0 - smoothstep(0.9, 1.0, abs(ld));
    float chev = fract((s - abs(ld) * 7.0 - uTime * 70.0) / 8.0);
    float arrows = smoothstep(0.0, 0.1, chev) * (1.0 - smoothstep(0.45, 0.55, chev));
    float m = along * across;
    lit = mix(lit, lit * 0.3, m * 0.8);
    glow += uPadColor * m * (0.3 + arrows * 1.4);
  }
  // A jump: hazard stripes running up to the lip, and again on the landing.
  for (int i = 0; i < ${MAX_GAPS}; i++) {
    vec4 gp = uGaps[i];
    if (gp.y <= gp.x) continue;
    if (gp.z * d < 0.0) continue;
    float before = gp.x - s;
    float after = s - gp.y;
    float near = max(box(before, 0.0, 16.0), box(after, 0.0, 10.0));
    if (near <= 0.001) continue;
    float stripe = step(0.5, fract((s + d * 0.8) / 4.0));
    col = mix(vec3(0.08), vec3(1.0, 0.78, 0.1), stripe);
    lit = mix(lit, col * (uSkyColor * 0.55 + uSunColor * 0.9), near * 0.9);
    glow += vec3(1.0, 0.6, 0.1) * near * box(before, 0.0, 1.2) * 2.0;
  }
  glow += vec3(1.0, 0.15, 0.25) * lip * 1.1;
  lit += glow;

  gl_FragColor = vec4(lit, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export interface TrackVisual {
  group: THREE.Group;
  road: THREE.ShaderMaterial;
  gates: GateVisual;
  /** The five start lights, left to right. */
  lights: THREE.Mesh[];
  /**
   * Light the barrier where something hit it: `face` is where the wall's
   * face is across the road (d: an edge, or a side of a fork's middle wall),
   * `strength` about 0.3 for a glancing touch to 1 for a hard hit, `ringOut`
   * for a mech thrown into it.
   */
  pulseWall(s: number, face: number, strength: number, ringOut: boolean): void;
  update(time: number): void;
}

/** Each jump gap as a run of samples: start, end and side (0 both, -1 left, 1 right). */
function gapRuns(track: Track): Array<{ s0: number; s1: number; side: number }> {
  const out: Array<{ s0: number; s1: number; side: number }> = [];
  const n = track.n;
  for (const [arr, side] of [[track.roadL, -1], [track.roadR, 1]] as const) {
    for (let i = 0; i < n; i++) {
      if (arr[i] === 0 && arr[(i - 1 + n) % n] === 1) {
        let j = i;
        while (arr[j % n] === 0 && j < i + n) j++;
        out.push({ s0: i * track.ds, s1: j * track.ds, side });
      }
    }
  }
  // A gap across the whole road shows once, for both sides.
  const merged: Array<{ s0: number; s1: number; side: number }> = [];
  for (const g of out) {
    const twin = merged.find((o) => Math.abs(o.s0 - g.s0) < 1 && Math.abs(o.s1 - g.s1) < 1);
    if (twin) twin.side = 0;
    else merged.push({ ...g });
  }
  return merged;
}

function boardTexture(lines: string[], bg: string, fg: string, accent: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 160);
  g.fillStyle = accent;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(70, 0);
  g.lineTo(30, 160);
  g.lineTo(0, 160);
  g.fill();
  g.fillRect(0, 148, 512, 12);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `italic 800 ${lines.length > 1 ? 62 : 92}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  lines.forEach((l, i) => g.fillText(l, 276, lines.length > 1 ? 50 + i * 62 : 78));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildTrackVisual(
  track: Track,
  theme: { sunLight: number; skyLight: number; groundY: number } = { sunLight: COLORS.sunLight, skyLight: COLORS.skyLight, groundY: -6 },
): TrackVisual {
  const group = new THREE.Group();
  const hw = track.halfWidth;
  const f = makeFrame();

  // Every surface below is swept along the samples. Each side of the road
  // is drawn with that side's fork offset (zero outside a fork), only where
  // it exists (no road over a jump gap, no barrier along an open edge).
  const n = track.n;
  const tmp = new THREE.Color();
  const put = (i: number, d: number, h: number, side: number, out: Float32Array | number[], o: number) => {
    const j = ((i % n) + n) % n;
    const sh = side < 0 ? track.shiftL[j] : side > 0 ? track.shiftR[j] : 0;
    const rh = side < 0 ? track.riseL[j] : side > 0 ? track.riseR[j] : 0;
    const dd = d + sh;
    const hh = h + rh;
    out[o] = track.px[j] + track.rx[j] * dd + track.ux[j] * hh;
    out[o + 1] = track.py[j] + track.ry[j] * dd + track.uy[j] * hh;
    out[o + 2] = track.pz[j] + track.rz[j] * dd + track.uz[j] * hh;
  };
  /** Sweep a profile (a list of (d, h) per sample) along every stretch where `mask` holds. */
  const sweep = (
    side: number,
    prof: (i: number) => Array<[number, number]>,
    colors: THREE.Color[],
    mask: (i: number) => boolean,
    colorAt?: (i: number, seg: number, base: THREE.Color, out: THREE.Color) => THREE.Color,
  ): THREE.BufferGeometry => {
    const pos: number[] = [];
    const col: number[] = [];
    const v = [0, 0, 0];
    const vert = (i: number, p: [number, number], c: THREE.Color) => {
      put(i, p[0], p[1], side, v, 0);
      pos.push(v[0], v[1], v[2]);
      col.push(c.r, c.g, c.b);
    };
    for (let i = 0; i < n; i++) {
      if (!mask(i) || !mask((i + 1) % n)) continue;
      const pa = prof(i);
      const pb = prof(i + 1);
      for (let k = 0; k < pa.length - 1; k++) {
        const c = colorAt ? colorAt(i, k, colors[k], tmp) : colors[k];
        vert(i, pa[k], c);
        vert(i, pa[k + 1], c);
        vert(i + 1, pb[k + 1], c);
        vert(i, pa[k], c);
        vert(i + 1, pb[k + 1], c);
        vert(i + 1, pb[k], c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  };
  const hwOf = (i: number) => track.hw[((i % n) + n) % n];
  const medOf = (i: number) => track.median[((i % n) + n) % n];
  const roadL = (i: number) => track.roadL[i % n] === 1;
  const roadR = (i: number) => track.roadR[i % n] === 1;
  const wallL = (i: number) => track.wallL[i % n] === 1;
  const wallR = (i: number) => track.wallR[i % n] === 1;
  const medWallL = (i: number) => medOf(i) > 0.6 && roadL(i);
  const medWallR = (i: number) => medOf(i) > 0.6 && roadR(i);

  // ---- road surface -------------------------------------------------------
  {
    // Four vertices a ring: left edge, left of the middle, right of the
    // middle, right edge. Outside a fork the two middle ones meet at d = 0.
    const pos = new Float32Array((n + 1) * 4 * 3);
    const nor = new Float32Array((n + 1) * 4 * 3);
    const uv = new Float32Array((n + 1) * 4 * 2);
    const kap = new Float32Array((n + 1) * 4);
    const edge = new Float32Array((n + 1) * 4 * 3);
    for (let i = 0; i <= n; i++) {
      const j = i % n;
      const hwi = track.hw[j];
      const m = track.median[j];
      const ds = [-hwi, -m, m, hwi];
      for (let k = 0; k < 4; k++) {
        const side = k < 2 ? -1 : 1;
        const v = i * 4 + k;
        put(i, ds[k], 0, side, pos, v * 3);
        nor[v * 3] = track.ux[j];
        nor[v * 3 + 1] = track.uy[j];
        nor[v * 3 + 2] = track.uz[j];
        uv[v * 2] = ds[k];
        uv[v * 2 + 1] = i * track.ds;
        kap[v] = track.kappa[j];
        edge[v * 3] = hwi;
        edge[v * 3 + 1] = m;
        edge[v * 3 + 2] = (side < 0 ? track.wallL[j] : track.wallR[j]) ? 0 : 1;
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = i * 4;
      const b = (i + 1) * 4;
      if (roadL(i) && roadL(i + 1)) idx.push(a, a + 1, b + 1, a, b + 1, b);
      if (roadR(i) && roadR(i + 1)) idx.push(a + 2, a + 3, b + 3, a + 2, b + 3, b + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aKappa', new THREE.BufferAttribute(kap, 1));
    g.setAttribute('aEdge', new THREE.BufferAttribute(edge, 3));
    g.setIndex(idx);
    const strips: THREE.Vector4[] = [];
    for (let i = 0; i < MAX_STRIPS; i++) {
      const st = track.strips[i];
      strips.push(st ? new THREE.Vector4(st.s0, st.s1, st.d, st.halfW) : new THREE.Vector4(0, 0, 0, 0));
    }
    const gates: THREE.Vector4[] = [];
    for (let i = 0; i < MAX_GATES; i++) {
      const gt = track.gates[i];
      gates.push(gt ? new THREE.Vector4(gt.s, gt.d, gt.halfW, 1) : new THREE.Vector4(0, 0, 0, 0));
    }
    const pads: THREE.Vector4[] = [];
    for (let i = 0; i < MAX_PADS; i++) {
      const pd = track.pads[i];
      pads.push(pd ? new THREE.Vector4(pd.s0, pd.s1, pd.d, pd.halfW) : new THREE.Vector4(0, 0, 0, 0));
    }
    const gaps: THREE.Vector4[] = gapRuns(track).slice(0, MAX_GAPS).map((gp) => new THREE.Vector4(gp.s0, gp.s1, gp.side, 0));
    while (gaps.length < MAX_GAPS) gaps.push(new THREE.Vector4(0, 0, 0, 0));
    const road = new THREE.ShaderMaterial({
      vertexShader: roadVertex,
      fragmentShader: roadFragment,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uLength: { value: track.length },
          uSunDir: { value: SUN_DIR.clone() },
          uSunColor: { value: new THREE.Color(theme.sunLight) },
          uSkyColor: { value: new THREE.Color(theme.skyLight) },
          uChargeColor: { value: new THREE.Color(COLORS.charge) },
          uStrips: { value: strips },
          uGates: { value: gates },
          uPads: { value: pads },
          uGaps: { value: gaps },
          uPadColor: { value: new THREE.Color(0xff3d9a) },
          uCellColor: { value: new THREE.Color(COLORS.cell) },
          uWeapons: { value: 0 },
        },
      ]),
      fog: true,
    });
    const mesh = new THREE.Mesh(g, road);
    mesh.frustumCulled = false;
    group.add(mesh);
    (group.userData as { road: THREE.ShaderMaterial }).road = road;
  }
  const road = (group.userData as { road: THREE.ShaderMaterial }).road;

  // ---- barriers, the slab under the road, a fork's middle wall ------------
  {
    const W = new THREE.Color(COLORS.wall);
    const D = new THREE.Color(COLORS.wallDark);
    const A = new THREE.Color(COLORS.accent);
    const U = new THREE.Color(0x4a5568);
    const K = new THREE.Color(0x2c3442);
    // Alternate the inner wall panels so speed reads against them.
    const panels = (face: number) => (i: number, seg: number, base: THREE.Color, out: THREE.Color) =>
      seg === face ? out.copy(base).multiplyScalar(i % 8 < 4 ? 1 : 0.76) : out.copy(base);
    const parts: THREE.BufferGeometry[] = [];
    // Outer barriers: inner face, lip, top, outer face.
    parts.push(
      sweep(-1, (i) => { const w = hwOf(i); return [[-(w + 2.3), -1.6], [-(w + 2.3), 2.3], [-(w + 1.7), 3.0], [-(w + 0.45), 3.0], [-w, 2.3], [-w, -0.05]]; }, [W, D, D, A, W], wallL, panels(4)),
      sweep(1, (i) => { const w = hwOf(i); return [[w, -0.05], [w, 2.3], [w + 0.45, 3.0], [w + 1.7, 3.0], [w + 2.3, 2.3], [w + 2.3, -1.6]]; }, [W, A, D, D, W], wallR, panels(0)),
    );
    // The slab under each half of the road, with a chamfer where an edge is open.
    parts.push(
      sweep(-1, (i) => { const w = hwOf(i); const m = medOf(i); return [[-m, -0.05], [-m, -6.2], [-7, -6.2], [-(w - 5), -4.4], [-(w + 2.3), -1.6], [-w, -0.05]]; }, [K, K, K, U, U], roadL),
      sweep(1, (i) => { const w = hwOf(i); const m = medOf(i); return [[w, -0.05], [w + 2.3, -1.6], [w - 5, -4.4], [7, -6.2], [m, -6.2], [m, -0.05]]; }, [U, U, K, K, K], roadR),
    );
    // A fork's middle wall, one face to each route.
    if (track.forks.length > 0) {
      parts.push(
        sweep(-1, (i) => { const m = medOf(i); return [[-m, -0.05], [-m, 2.3], [-m + 0.45, 3.0], [-m + 1.7, 3.0], [-m + 2.3, 2.3], [-m + 2.3, -1.6]]; }, [W, A, D, D, W], medWallL, panels(0)),
        sweep(1, (i) => { const m = medOf(i); return [[m - 2.3, -1.6], [m - 2.3, 2.3], [m - 1.7, 3.0], [m - 0.45, 3.0], [m, 2.3], [m, -0.05]]; }, [W, D, D, A, W], medWallR, panels(4)),
      );
    }
    // Close the ends of the slab at a jump's lip and landing.
    const caps: number[] = [];
    const ccol: number[] = [];
    const v = [0, 0, 0];
    const cap = (i: number, side: number) => {
      const w = hwOf(i);
      const m = medOf(i);
      const quad: Array<[number, number]> = [[side * m, -0.05], [side * w, -0.05], [side * (w + 2.3), -1.6], [side * m, -6.2]];
      for (const k of [0, 1, 2, 0, 2, 3]) {
        put(i, quad[k][0], quad[k][1], side, v, 0);
        caps.push(v[0], v[1], v[2]);
        ccol.push(K.r, K.g, K.b);
      }
    };
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (roadL(i) !== roadL(j)) cap(roadL(i) ? i : j, -1);
      if (roadR(i) !== roadR(j)) cap(roadR(i) ? i : j, 1);
    }
    if (caps.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(caps, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(ccol, 3));
      g.computeVertexNormals();
      parts.push(g);
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts.filter((g) => g.attributes.position.count > 0))!, toonMaterial({ side: THREE.DoubleSide }));
    mesh.frustumCulled = false;
    group.add(mesh);

    // Light strip along each wall: cyan on the straights, amber into corners.
    const cool = new THREE.Color(0x4fe6ff).multiplyScalar(1.5);
    const warm = new THREE.Color(0xff8a1f).multiplyScalar(1.7);
    const tint = (i: number, _seg: number, _base: THREE.Color, out: THREE.Color) =>
      out.copy(cool).lerp(warm, THREE.MathUtils.smoothstep(track.kappaAhead[i % n], 0.0016, 0.003));
    const strips = [
      sweep(-1, (i) => [[-(hwOf(i) - 0.04), 1.55], [-(hwOf(i) - 0.04), 1.95]], [cool], wallL, tint),
      sweep(1, (i) => [[hwOf(i) - 0.04, 1.55], [hwOf(i) - 0.04, 1.95]], [cool], wallR, tint),
    ];
    if (track.forks.length > 0) {
      strips.push(
        sweep(-1, (i) => [[-(medOf(i) + 0.04), 1.55], [-(medOf(i) + 0.04), 1.95]], [cool], medWallL, tint),
        sweep(1, (i) => [[medOf(i) + 0.04, 1.55], [medOf(i) + 0.04, 1.95]], [cool], medWallR, tint),
      );
    }
    const sm = new THREE.Mesh(mergeGeometries(strips.filter((g) => g.attributes.position.count > 0))!, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false }));
    sm.frustumCulled = false;
    group.add(sm);
  }

  // ---- the barrier's energy field (see wallFragment) ------------------------
  // One sheet on each barrier face: the outer walls (side -1, 1) and both
  // faces of a fork's middle wall (-2 for the left route's, 2 for the right's).
  const wallPulses: THREE.Vector4[] = [];
  const pulseStart: number[] = [];
  let wallMat: THREE.ShaderMaterial;
  {
    const H = 7.5;
    const pos: number[] = [];
    const aS: number[] = [];
    const aH: number[] = [];
    const aSide: number[] = [];
    const v = [0, 0, 0];
    const sheet = (code: number, dAt: (i: number) => number, mask: (i: number) => boolean) => {
      const side = Math.sign(code);
      for (let i = 0; i < n; i++) {
        if (!mask(i) || !mask((i + 1) % n)) continue;
        const corner = (ii: number, ht: number) => {
          put(ii, dAt(ii), ht, side, v, 0);
          pos.push(v[0], v[1], v[2]);
          aS.push(ii * track.ds);
          aH.push(ht);
          aSide.push(code);
        };
        corner(i, 0);
        corner(i, H);
        corner(i + 1, H);
        corner(i, 0);
        corner(i + 1, H);
        corner(i + 1, 0);
      }
    };
    sheet(-1, (i) => -(hwOf(i) - 0.06), wallL);
    sheet(1, (i) => hwOf(i) - 0.06, wallR);
    if (track.forks.length > 0) {
      sheet(-2, (i) => -(medOf(i) + 0.06), medWallL);
      sheet(2, (i) => medOf(i) + 0.06, medWallR);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1));
    g.setAttribute('aH', new THREE.Float32BufferAttribute(aH, 1));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(aSide, 1));
    for (let i = 0; i < MAX_WALL_PULSES; i++) {
      wallPulses.push(new THREE.Vector4(0, 1, 99, 0));
      pulseStart.push(-99);
    }
    wallMat = new THREE.ShaderMaterial({
      vertexShader: wallVertex,
      fragmentShader: wallFragment,
      uniforms: {
        uLength: { value: track.length },
        uPulse: { value: wallPulses },
        uCool: { value: new THREE.Color(0x4fe6ff).multiplyScalar(2.2) },
        uHot: { value: new THREE.Color(0xff4fa0).multiplyScalar(2.6) },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(g, wallMat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 4;
    group.add(mesh);
    // Nothing to draw until the first impact.
    wallMat.visible = false;
  }
  let clock = 0;

  // ---- fence posts ---------------------------------------------------------
  // A post on top of each barrier every 20 units, with a lit cap. They are
  // at eye level and close, so they strobe past and sell the speed.
  {
    const every = 5; // samples
    const spots: Array<[number, number]> = [];
    for (let i = 0; i < n; i += every) {
      if (wallL(i)) spots.push([i, -1]);
      if (wallR(i)) spots.push([i, 1]);
    }
    const postGeo = new THREE.BoxGeometry(0.32, 3.4, 0.32);
    postGeo.translate(0, 1.7, 0);
    const capGeo = new THREE.BoxGeometry(0.5, 0.34, 1.5);
    capGeo.translate(0, 3.55, 0);
    const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshLambertMaterial({ color: 0x39414f }), Math.max(1, spots.length));
    const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), Math.max(1, spots.length));
    const m = new THREE.Matrix4();
    const cool = new THREE.Color(0x4fe6ff).multiplyScalar(1.3);
    const warm = new THREE.Color(0xff8a1f).multiplyScalar(1.5);
    const c = new THREE.Color();
    spots.forEach(([idx, side], k) => {
      const turn = THREE.MathUtils.smoothstep(track.kappaAhead[idx], 0.0016, 0.003);
      trackMatrix(track, idx * track.ds, side * (hwOf(idx) + 1.1), 3.0, 0, m);
      posts.setMatrixAt(k, m);
      caps.setMatrixAt(k, m);
      caps.setColorAt(k, c.copy(cool).lerp(warm, turn).multiplyScalar((idx / every) % 2 === 0 ? 1 : 0.55));
    });
    posts.count = spots.length;
    caps.count = spots.length;
    posts.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
    posts.frustumCulled = false;
    caps.frustumCulled = false;
    group.add(posts, caps);
  }

  // ---- support pylons ------------------------------------------------------
  // Down to the ground under level road. (Loops, corkscrews and forks stand
  // on their own.)
  const plain = (i: number) => {
    const j = ((i % n) + n) % n;
    return track.roadL[j] === 1 && track.roadR[j] === 1 && track.mag[j] === 0 && track.median[j] < 0.1 && track.upY[j] > 0.85 && Math.abs(track.ty[j]) < 0.35;
  };
  {
    const spacing = 30; // samples
    const spots: number[] = [];
    for (let i = 0; i < n; i += spacing) if (plain(i)) spots.push(i);
    const geo = new THREE.CylinderGeometry(3.2, 4.6, 1, 6, 1, false);
    geo.translate(0, -0.5, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0x6f7b8f });
    const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    spots.forEach((i, k) => {
      frameAt(track, i * track.ds, f);
      p.set(f.px - f.ux * 5.5, f.py - f.uy * 5.5, f.pz - f.uz * 5.5);
      sc.set(1, Math.max(1, p.y - theme.groundY), 1);
      m.compose(p, q, sc);
      inst.setMatrixAt(k, m);
    });
    inst.count = spots.length;
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    group.add(inst);
  }

  // ---- gantries -----------------------------------------------------------
  const lights: THREE.Mesh[] = [];
  {
    const parts: THREE.BufferGeometry[] = [];
    const glowParts: THREE.BufferGeometry[] = [];
    const m = new THREE.Matrix4();
    const local = new THREE.Matrix4();
    const addBox = (list: THREE.BufferGeometry[], s: number, x: number, y: number, z: number, w: number, h: number, dp: number, color: number) => {
      const g = new THREE.BoxGeometry(w, h, dp).toNonIndexed();
      const c = new THREE.Color(color);
      const arr = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] = c.r;
        arr[i + 1] = c.g;
        arr[i + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      g.deleteAttribute('uv');
      trackMatrix(track, s, 0, 0, 0, m);
      // Model space here is (left, up, forward), so +x is the left side.
      local.makeTranslation(x, y, z);
      g.applyMatrix4(local);
      g.applyMatrix4(m);
      list.push(g);
    };
    const gateEvery = track.length / 18;
    // Only over plain road: level, barriers both sides, no fork, nowhere near a jump.
    const clear = (s: number) => {
      for (let q = -6; q <= 6; q++) {
        const j = Math.floor(wrapS(track, s + q * 4) / track.ds) % n;
        if (!plain(j) || !track.wallL[j] || !track.wallR[j] || Math.abs(track.ty[j]) > 0.08) return false;
      }
      return true;
    };
    for (let k = 0; k < 18; k++) {
      let s = k * gateEvery + (k === 0 ? 0 : 60);
      if (k > 0) {
        let tries = 0;
        while (!clear(s) && tries++ < 40) s += 10;
        if (!clear(s)) continue;
      }
      const start = k === 0;
      const top = start ? 17 : 14;
      const leg = start ? 2.6 : 1.8;
      const x = hwAt(track, s) + 3.4;
      addBox(parts, s, x, top / 2 - 2, 0, leg, top + 4, leg, 0x424b5c);
      addBox(parts, s, -x, top / 2 - 2, 0, leg, top + 4, leg, 0x424b5c);
      addBox(parts, s, 0, top, 0, x * 2 + leg, start ? 4.2 : 2.2, leg * 1.2, start ? 0x1c2230 : 0x2c3442);
      // Underlit beam.
      addBox(glowParts, s, 0, top - (start ? 2.3 : 1.25), 0, x * 2 - 4, 0.22, 0.7, k % 3 === 0 ? 0xff8a1f : 0x4fe6ff);
      if (!start) {
        // Angled braces.
        addBox(parts, s, x - 3, top - 2.2, 0, 6, 0.8, 0.8, 0x596579);
        addBox(parts, s, -(x - 3), top - 2.2, 0, 6, 0.8, 0.8, 0x596579);
      }
    }
    const gate = new THREE.Mesh(mergeGeometries(parts)!, toonMaterial());
    gate.frustumCulled = false;
    group.add(gate);
    const glowGeo = mergeGeometries(glowParts)!;
    const gc = glowGeo.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < gc.count * 3; i++) (gc.array as Float32Array)[i] *= 1.6;
    const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    glow.frustumCulled = false;
    group.add(glow);

    // Start lights on the main gantry, facing the grid.
    for (let i = 0; i < 5; i++) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), new THREE.MeshBasicMaterial({ color: 0x1a0505, toneMapped: false }));
      trackMatrix(track, -2.1, (i - 2) * 3.4, 15.25, 0, m);
      bulb.applyMatrix4(m);
      group.add(bulb);
      lights.push(bulb);
    }
    // Banner over the line.
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(44, 3),
      new THREE.MeshBasicMaterial({ map: boardTexture(['ZENITH GRAND PRIX'], '#10141f', '#f4f6fb', '#ff7a1a'), toneMapped: false }),
    );
    trackMatrix(track, -1.75, 0, 17.6, Math.PI, m);
    banner.applyMatrix4(m);
    group.add(banner);
  }

  // ---- trackside boards and grandstands -----------------------------------
  {
    const ads: Array<[string[], string, string, string]> = [
      [['KESTREL', 'ENERGY'], '#0d2a57', '#ffffff', '#35f0ff'],
      [['NOVA TIRE'], '#f4f6fb', '#10141f', '#ff3d5a'],
      [['AOKI HEAVY', 'INDUSTRIES'], '#1b1b22', '#ffb21a', '#ffb21a'],
      [['HALCYON AIR'], '#ff7a1a', '#10141f', '#10141f'],
      // The circuit's own name.
      [track.def.name.toUpperCase().split(' ').slice(0, 2), '#103b3f', '#e9fbff', '#35f0ff'],
      [['ZGP LIVE'], '#e0263c', '#ffffff', '#10141f'],
    ];
    const mats = ads.map((a) => new THREE.MeshBasicMaterial({ map: boardTexture(...a), toneMapped: true }));
    const plane = new THREE.PlaneGeometry(30, 9.4);
    const backMat = new THREE.MeshLambertMaterial({ color: 0x2c3442 });
    const m = new THREE.Matrix4();
    let k = 0;
    for (let s = 150; s < track.length - 100; s += 170) {
      const i = Math.floor(wrapS(track, s) / track.ds);
      if (Math.abs(track.kappa[i]) > 0.0012 && k % 2 === 0) {
        k++;
        continue;
      }
      // Stand the board on the outside of any bend, facing the road.
      const side = track.kappa[i] > 0.0004 ? -1 : track.kappa[i] < -0.0004 ? 1 : k % 2 === 0 ? 1 : -1;
      if (!plain(i) || !(side < 0 ? track.wallL[i] : track.wallR[i])) continue;
      const board = new THREE.Mesh(plane, mats[k % mats.length]);
      trackMatrix(track, s, side * (track.hw[i] + 5.5), 9.5, side > 0 ? -Math.PI / 2 - 0.25 : Math.PI / 2 + 0.25, m);
      board.applyMatrix4(m);
      group.add(board);
      const back = new THREE.Mesh(new THREE.BoxGeometry(31, 10.4, 0.8), backMat);
      back.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, -0.5));
      back.applyMatrix4(m);
      group.add(back);
      for (const off of [-11, 11]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(1, 9, 1), backMat);
        post.applyMatrix4(new THREE.Matrix4().makeTranslation(off, -9, -0.6));
        post.applyMatrix4(m);
        group.add(post);
      }
      k++;
    }

    // Grandstands either side of the start, with a speckled crowd.
    const crowd = document.createElement('canvas');
    crowd.width = 256;
    crowd.height = 64;
    const cg = crowd.getContext('2d')!;
    cg.fillStyle = '#39414f';
    cg.fillRect(0, 0, 256, 64);
    const hues = ['#f4f6fb', '#ff7a1a', '#3d8bff', '#ff3d5a', '#ffd34d', '#8be28b', '#222833'];
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let y = 0; y < 64; y += 4) {
      for (let x = 0; x < 256; x += 3) {
        cg.fillStyle = hues[Math.floor(rnd() * hues.length)];
        cg.fillRect(x + (y % 8 ? 1 : 0), y + 1, 2, 2);
      }
    }
    const crowdTex = new THREE.CanvasTexture(crowd);
    crowdTex.colorSpace = THREE.SRGBColorSpace;
    crowdTex.magFilter = THREE.NearestFilter;
    crowdTex.wrapS = THREE.RepeatWrapping;
    crowdTex.repeat.set(3, 1);
    const standMat = new THREE.MeshLambertMaterial({ map: crowdTex });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0xe9edf2 });
    for (const side of [-1, 1]) {
      for (let seg = 0; seg < 4; seg++) {
        const s = -260 + seg * 130;
        const stand = new THREE.Mesh(new THREE.PlaneGeometry(120, 26), standMat);
        // Tilted back like raked seating.
        const tilt = new THREE.Matrix4().makeRotationX(-0.65);
        stand.applyMatrix4(tilt);
        trackMatrix(track, s, side * (hw + 20), 13, side > 0 ? -Math.PI / 2 : Math.PI / 2, m);
        stand.applyMatrix4(m);
        group.add(stand);
        const base = new THREE.Mesh(new THREE.BoxGeometry(120, 30, 20), backMat);
        base.applyMatrix4(new THREE.Matrix4().makeTranslation(0, -10, -12));
        base.applyMatrix4(m);
        group.add(base);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(124, 1.2, 26), roofMat);
        roof.applyMatrix4(new THREE.Matrix4().makeRotationX(0.12));
        roof.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 17, -8));
        roof.applyMatrix4(m);
        group.add(roof);
      }
    }
  }

  const gateVis = buildGates(track);
  group.add(gateVis.group);
  const gateUniforms = road.uniforms.uGates.value as THREE.Vector4[];

  return {
    group,
    road,
    gates: gateVis,
    lights,
    pulseWall(s: number, face: number, strength: number, ringOut: boolean) {
      // Reuse the oldest slot.
      let k = 0;
      for (let i = 1; i < MAX_WALL_PULSES; i++) if (pulseStart[i] < pulseStart[k]) k = i;
      pulseStart[k] = clock;
      const sign = face >= 0 ? 1 : -1;
      const code = (Math.abs(face) >= hwAt(track, s) - 1.5 ? 1 : 2) * sign;
      wallPulses[k].set(wrapS(track, s), code + (ringOut ? sign * 10 : 0), 0, Math.max(0.05, strength));
      wallMat.visible = true;
    },
    update(time: number) {
      clock = time;
      let live = false;
      for (let i = 0; i < MAX_WALL_PULSES; i++) {
        const p = wallPulses[i];
        if (p.w <= 0) continue;
        p.z = time - pulseStart[i];
        if (p.z > 1.6) p.w = 0;
        else live = true;
      }
      wallMat.visible = live;
      road.uniforms.uTime.value = time;
      for (let i = 0; i < track.gates.length && i < MAX_GATES; i++) gateUniforms[i].w = gateVis.lit[i];
      gateVis.update(time);
    },
  };
}
