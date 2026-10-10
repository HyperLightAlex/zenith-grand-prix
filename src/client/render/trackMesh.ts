// Builds everything bolted to the circuit: the road surface (a procedural
// shader), barriers, gantries, support pylons and trackside boards.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { frameAt, makeFrame, wrapS, type Track } from '../../sim/track';
import { COLORS, SUN_DIR, toonMaterial } from './palette';
import { buildGates, type GateVisual } from './gates';
import { trackMatrix } from './trackSpace';

const MAX_STRIPS = 12;
const MAX_GATES = 8;

const roadVertex = /* glsl */ `
attribute float aKappa;
varying vec2 vTc;
varying float vKappa;
varying vec3 vWorld;
varying vec3 vNormalW;
#include <common>
#include <fog_pars_vertex>
void main() {
  vTc = uv;
  vKappa = aKappa;
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
uniform float uHalfW;
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
  update(time: number): void;
}

/** Sweep a 2D profile (d, h) along the whole lap. */
function extrude(
  track: Track,
  profile: Array<[number, number]>,
  colors: THREE.Color[],
  step: number,
  colorAt?: (ring: number, seg: number, base: THREE.Color, out: THREE.Color) => THREE.Color,
): THREE.BufferGeometry {
  const rings = Math.floor(track.n / step);
  const segs = profile.length - 1;
  const pos = new Float32Array(rings * segs * 18);
  const col = new Float32Array(rings * segs * 18);
  const f0 = makeFrame();
  const f1 = makeFrame();
  const tmp = new THREE.Color();
  let o = 0;
  const put = (f: ReturnType<typeof makeFrame>, p: [number, number], c: THREE.Color) => {
    pos[o] = f.px + f.rx * p[0] + f.ux * p[1];
    pos[o + 1] = f.py + f.ry * p[0] + f.uy * p[1];
    pos[o + 2] = f.pz + f.rz * p[0] + f.uz * p[1];
    col[o] = c.r;
    col[o + 1] = c.g;
    col[o + 2] = c.b;
    o += 3;
  };
  for (let r = 0; r < rings; r++) {
    frameAt(track, r * step * track.ds, f0);
    frameAt(track, ((r + 1) % rings) * step * track.ds, f1);
    for (let k = 0; k < segs; k++) {
      const a = profile[k];
      const b = profile[k + 1];
      const c = colorAt ? colorAt(r, k, colors[k], tmp) : colors[k];
      put(f0, a, c);
      put(f0, b, c);
      put(f1, b, c);
      put(f0, a, c);
      put(f1, b, c);
      put(f1, a, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
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

export function buildTrackVisual(track: Track): TrackVisual {
  const group = new THREE.Group();
  const hw = track.halfWidth;
  const f = makeFrame();

  // ---- road surface -------------------------------------------------------
  {
    const n = track.n;
    const pos = new Float32Array((n + 1) * 2 * 3);
    const nor = new Float32Array((n + 1) * 2 * 3);
    const uv = new Float32Array((n + 1) * 2 * 2);
    const kap = new Float32Array((n + 1) * 2);
    for (let i = 0; i <= n; i++) {
      const j = i % n;
      for (let side = 0; side < 2; side++) {
        const d = side === 0 ? -hw : hw;
        const o = (i * 2 + side) * 3;
        pos[o] = track.px[j] + track.rx[j] * d;
        pos[o + 1] = track.py[j] + track.ry[j] * d;
        pos[o + 2] = track.pz[j] + track.rz[j] * d;
        nor[o] = track.ux[j];
        nor[o + 1] = track.uy[j];
        nor[o + 2] = track.uz[j];
        uv[(i * 2 + side) * 2] = d;
        uv[(i * 2 + side) * 2 + 1] = i * track.ds;
        kap[i * 2 + side] = track.kappa[j];
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aKappa', new THREE.BufferAttribute(kap, 1));
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
    const road = new THREE.ShaderMaterial({
      vertexShader: roadVertex,
      fragmentShader: roadFragment,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uLength: { value: track.length },
          uHalfW: { value: hw },
          uSunDir: { value: SUN_DIR.clone() },
          uSunColor: { value: new THREE.Color(COLORS.sunLight) },
          uSkyColor: { value: new THREE.Color(COLORS.skyLight) },
          uChargeColor: { value: new THREE.Color(COLORS.charge) },
          uStrips: { value: strips },
          uGates: { value: gates },
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

  // ---- barriers and the slab under the road -------------------------------
  {
    const W = new THREE.Color(COLORS.wall);
    const D = new THREE.Color(COLORS.wallDark);
    const A = new THREE.Color(COLORS.accent);
    const U = new THREE.Color(0x4a5568);
    const K = new THREE.Color(0x2c3442);
    const profile: Array<[number, number]> = [
      [hw, -0.05],
      [hw, 2.3],
      [hw + 0.45, 3.0],
      [hw + 1.7, 3.0],
      [hw + 2.3, 2.3],
      [hw + 2.3, -1.6],
      [hw - 5, -4.4],
      [7, -6.2],
      [-7, -6.2],
      [-(hw - 5), -4.4],
      [-(hw + 2.3), -1.6],
      [-(hw + 2.3), 2.3],
      [-(hw + 1.7), 3.0],
      [-(hw + 0.45), 3.0],
      [-hw, 2.3],
      [-hw, -0.05],
    ];
    const colors = [W, A, D, D, W, U, K, K, K, U, W, D, D, A, W];
    // Alternate the inner wall panels so speed reads against them.
    const g = extrude(track, profile, colors, 2, (ring, seg, base, out) => {
      if (seg === 0 || seg === 14) return out.copy(base).multiplyScalar(ring % 4 < 2 ? 1 : 0.76);
      return out.copy(base);
    });
    const mesh = new THREE.Mesh(g, toonMaterial({ side: THREE.DoubleSide }));
    mesh.frustumCulled = false;
    group.add(mesh);

    // Light strip along each wall: cyan on the straights, amber into corners.
    const cool = new THREE.Color(0x4fe6ff).multiplyScalar(1.5);
    const warm = new THREE.Color(0xff8a1f).multiplyScalar(1.7);
    const stripProfile = (side: number): Array<[number, number]> => [
      [side * (hw - 0.04), 1.55],
      [side * (hw - 0.04), 1.95],
    ];
    const tint = (ring: number, _seg: number, _base: THREE.Color, out: THREE.Color) => {
      const i = (ring * 2) % track.n;
      const k = track.kappaAhead[i];
      return out.copy(cool).lerp(warm, THREE.MathUtils.smoothstep(k, 0.0016, 0.003));
    };
    for (const side of [-1, 1]) {
      const sg = extrude(track, stripProfile(side), [cool], 2, tint);
      const sm = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false }));
      sm.frustumCulled = false;
      group.add(sm);
    }
  }

  // ---- fence posts ---------------------------------------------------------
  // A post on top of each barrier every 20 units, with a lit cap. They are
  // at eye level and close, so they strobe past and sell the speed.
  {
    const every = 5; // samples
    const count = Math.floor(track.n / every);
    const postGeo = new THREE.BoxGeometry(0.32, 3.4, 0.32);
    postGeo.translate(0, 1.7, 0);
    const capGeo = new THREE.BoxGeometry(0.5, 0.34, 1.5);
    capGeo.translate(0, 3.55, 0);
    const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshLambertMaterial({ color: 0x39414f }), count * 2);
    const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), count * 2);
    const m = new THREE.Matrix4();
    const cool = new THREE.Color(0x4fe6ff).multiplyScalar(1.3);
    const warm = new THREE.Color(0xff8a1f).multiplyScalar(1.5);
    const c = new THREE.Color();
    let k = 0;
    for (let i = 0; i < count; i++) {
      const idx = i * every;
      const turn = THREE.MathUtils.smoothstep(track.kappaAhead[idx], 0.0016, 0.003);
      for (const side of [-1, 1]) {
        trackMatrix(track, idx * track.ds, side * (hw + 1.1), 3.0, 0, m);
        posts.setMatrixAt(k, m);
        caps.setMatrixAt(k, m);
        caps.setColorAt(k, c.copy(cool).lerp(warm, turn).multiplyScalar(i % 2 === 0 ? 1 : 0.55));
        k++;
      }
    }
    posts.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
    posts.frustumCulled = false;
    caps.frustumCulled = false;
    group.add(posts, caps);
  }

  // ---- support pylons ------------------------------------------------------
  {
    const spacing = 30; // samples
    const count = Math.floor(track.n / spacing);
    const geo = new THREE.CylinderGeometry(3.2, 4.6, 1, 6, 1, false);
    geo.translate(0, -0.5, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0x6f7b8f });
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      frameAt(track, i * spacing * track.ds, f);
      p.set(f.px - f.ux * 5.5, f.py - f.uy * 5.5, f.pz - f.uz * 5.5);
      sc.set(1, p.y + 6, 1);
      m.compose(p, q, sc);
      inst.setMatrixAt(i, m);
    }
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
    for (let k = 0; k < 18; k++) {
      const s = k * gateEvery + (k === 0 ? 0 : 60);
      const start = k === 0;
      const top = start ? 17 : 14;
      const leg = start ? 2.6 : 1.8;
      const x = hw + 3.4;
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
      [['MERIDIAN', 'SKYWAY'], '#103b3f', '#e9fbff', '#35f0ff'],
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
      const board = new THREE.Mesh(plane, mats[k % mats.length]);
      trackMatrix(track, s, side * (hw + 5.5), 9.5, side > 0 ? -Math.PI / 2 - 0.25 : Math.PI / 2 + 0.25, m);
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
    update(time: number) {
      road.uniforms.uTime.value = time;
      for (let i = 0; i < track.gates.length && i < MAX_GATES; i++) gateUniforms[i].w = gateVis.lit[i];
      gateVis.update(time);
    },
  };
}
