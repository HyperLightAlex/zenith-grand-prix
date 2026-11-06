// A small modelling kit. Mechs are assembled in code from chamfered boxes,
// bevelled extrusions, lathed parts and low-poly cylinders, then merged per
// limb. Every part is tagged with a livery slot so the same frame can wear any
// team's colours, and swapping a part later (upgrades, customisation) is a
// data change. Each slot also carries a surface type (painted armour, bare
// metal, rubber, glass) that the armour shader lights differently.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { weldVertices } from './weld';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { COLORS, toonGradient, type Livery } from '../palette';
import { PANELS } from './mechArt';

/**
 * P primary armour, S secondary panels, T trim (all painted); F frame (bare
 * metal); D deep parts (dark metal and rubber: joints, vents, wheels);
 * C canopy and lenses (glass); K inner frame (gunmetal, between the armour).
 */
export type Slot = 'P' | 'S' | 'F' | 'T' | 'D' | 'C' | 'K';

/** Surface type per slot: 0 paint, 1 metal, 2 rubber and dark metal, 3 glass. */
const SURFACE: Record<Slot, number> = { P: 0, S: 0, T: 0, F: 1, K: 1, D: 2, C: 3 };
/** Each slot, for the shader (aSlot): the main paint is 0, the one a livery's pattern goes on. */
const SLOT_ID: Record<Slot, number> = { P: 0, S: 1, T: 2, F: 3, K: 4, D: 5, C: 6 };

/**
 * Which painted panel lines each slot wears in the anime look (art/mech-sheets,
 * P1): 0 big plates, 1 smaller panels, 2 limb segments, 3 the mechanical frame,
 * 4 grilles and rubber, -1 none. The primary armour wears limb segments on the
 * arms and legs, big plates everywhere else.
 */
const PANEL_BODY: Record<Slot, number> = { P: 0, S: 1, T: 1, F: 3, K: 3, D: 4, C: -1 };
const PANEL_LIMB: Record<Slot, number> = { ...PANEL_BODY, P: 2 };

/** How many units of a part one repeat of each panel drawing covers (plates, panels, limbs, frame, dark, wear). */
const PANEL_SIZE = [2.0, 1.4, 1.2, 1.0, 0.7, 2.4];

let panelTextures: [THREE.Texture, THREE.Texture] | null = null;

/** The panel-line masks, repeated mirrored so every edge meets itself. */
function panelMaps(): [THREE.Texture, THREE.Texture] {
  if (!panelTextures) {
    const load = (url: string) => {
      const t = new THREE.TextureLoader().load(url);
      t.wrapS = THREE.MirroredRepeatWrapping;
      t.wrapT = THREE.MirroredRepeatWrapping;
      t.anisotropy = 8;
      t.userData.shared = true;
      return t;
    };
    panelTextures = [load(PANELS.a), load(PANELS.b)];
  }
  return panelTextures;
}

export interface Xf {
  at?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
}

export interface BoxOpts extends Xf {
  /** Scale of the top face relative to the bottom, in x and z. */
  taper?: [number, number];
  /** Shift of the top face along z (forward) and x. */
  lean?: number;
  leanX?: number;
  /** Size of the chamfer on every edge. Defaults to a small one in proportion; 0 for a sharp box. */
  bevel?: number;
}

export interface ExtrudeOpts extends Xf {
  /** Chamfer round the two faces of the extrusion. Defaults to a small one; 0 for none. */
  bevel?: number;
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const vp = new THREE.Vector3();
const vs = new THREE.Vector3();

function xf(g: THREE.BufferGeometry, o?: Xf): THREE.BufferGeometry {
  if (!o) return g;
  const r = o.rot ?? [0, 0, 0];
  const p = o.at ?? [0, 0, 0];
  const s = o.scale ?? [1, 1, 1];
  e.set(r[0], r[1], r[2]);
  q.setFromEuler(e);
  m4.compose(vp.set(p[0], p[1], p[2]), q, vs.set(s[0], s[1], s[2]));
  g.applyMatrix4(m4);
  return g;
}

/** Default chamfer for a part this size: enough to catch the light, never more than a fifth of its thinnest side. */
function autoBevel(...sizes: number[]): number {
  const t = Math.min(...sizes);
  return Math.min(0.07, t * 0.2);
}

/** A box with every edge and corner chamfered: the convex hull of its corners pulled in by `c` two ways at a time. */
function chamferBox(w: number, h: number, d: number, c: number): THREE.BufferGeometry {
  const hx = w / 2;
  const hy = h / 2;
  const hz = d / 2;
  if (c <= 1e-4) return new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const pts: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        pts.push(new THREE.Vector3(sx * hx, sy * (hy - c), sz * (hz - c)));
        pts.push(new THREE.Vector3(sx * (hx - c), sy * hy, sz * (hz - c)));
        pts.push(new THREE.Vector3(sx * (hx - c), sy * (hy - c), sz * hz));
      }
    }
  }
  return new ConvexGeometry(pts);
}

const outlineMaterials = new Map<number, THREE.ShaderMaterial>();
let hullOutlinesOn = true;

/**
 * Show or hide the plain-look world-space hulls. The anime look draws
 * its own contour, from geometry or tracing, so these are off while it inks.
 */
export function setHullOutlines(on: boolean): void {
  hullOutlinesOn = on;
  for (const material of outlineMaterials.values()) material.visible = on;
}

/** Inverted-hull ink line: back faces pushed out along smoothed normals. */
function outlineMat(width: number): THREE.ShaderMaterial {
  const cached = outlineMaterials.get(width);
  if (cached) return cached;
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color(COLORS.outline) }, uWidth: { value: width } }]),
    vertexShader: /* glsl */ `
      uniform float uWidth;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position + normal * uWidth, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    side: THREE.BackSide,
    fog: true,
  });
  material.visible = hullOutlinesOn;
  outlineMaterials.set(width, material);
  return material;
}

/**
 * What the armour reflects: the sky above and the ground below. Shared by
 * every mech, and set for each circuit's light (see setArmorEnvironment).
 */
const ENV = {
  uEnvHigh: { value: new THREE.Color(0x9cc0ff) },
  uEnvLow: { value: new THREE.Color(0x6a5a50) },
  uRim: { value: new THREE.Color(0xdfe9ff).multiplyScalar(0.55) },
};

/** Tint the armour's reflections and rim light for a circuit's sky and ground. */
export function setArmorEnvironment(sky: number, ground: number, rim: number): void {
  ENV.uEnvHigh.value.setHex(sky);
  ENV.uEnvLow.value.setHex(ground);
  ENV.uRim.value.setHex(rim).multiplyScalar(0.55);
}

let armorMaterial: THREE.MeshToonMaterial | null = null;

/**
 * A mech's livery style, as its armour shader reads it (render/mech/style.ts
 * sets it from its build and the race): a pattern over its main paint, in a
 * paint of its own; how the paint is finished; how worn it is.
 */
export interface ArmorStyle {
  /** An index into PATTERNS (custom/mechBuild.ts); 0 none. */
  uPattern: { value: number };
  uPatColor: { value: THREE.Color };
  /** The pattern paint's shadow colour, for the anime look. */
  uPatShade: { value: THREE.Color };
  /** An index into FINISHES; 0 satin (the paint as it always was). */
  uFinish: { value: number };
  /** 0 clean to 1 scuffed to the metal and scorched. */
  uWear: { value: number };
  /** 1: the panel lines (where the player watching has them on, Video); 0: none on this mech. */
  uPanels: { value: number };
}

export function armorStyle(): ArmorStyle {
  return { uPattern: { value: 0 }, uPatColor: { value: new THREE.Color() }, uPatShade: { value: new THREE.Color() }, uFinish: { value: 0 }, uWear: { value: 0 }, uPanels: { value: 1 } };
}

/** Every mech without a style of its own: no pattern, satin, clean. */
const PLAIN_ARMOR = armorStyle();

/**
 * The livery style in the armour shader: the face's own plane (as the panel
 * lines take it), the patterns on it, and the noise the wear is made of.
 */
const STYLE_HEAD = /* glsl */ `
uniform float uPattern;
uniform vec3 uPatColor;
uniform vec3 uPatShade;
uniform float uFinish;
uniform float uWear;
varying float vSlot;
// How much of this pixel is pattern, scuffed to the metal, and scorched.
float gPat = 0.0;
float gScuff = 0.0;
float gSoot = 0.0;
float sHash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float sHash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float sNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(sHash3(i), sHash3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(sHash3(i + vec3(0.0, 1.0, 0.0)), sHash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(sHash3(i + vec3(0.0, 0.0, 1.0)), sHash3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(sHash3(i + vec3(0.0, 1.0, 1.0)), sHash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
// A band edge, softened by a pixel.
float sEdge(float edge, float x) {
  float w = max(fwidth(x), 1e-4) * 0.75;
  return smoothstep(edge - w, edge + w, x);
}
// The pattern over the main paint (each part has its own, on each face's plane).
float patternMask() {
  float id = floor(uPattern + 0.5);
  if (id < 0.5 || vSlot > 0.5 || vMat > 0.5) return 0.0;
  vec3 n = abs(normalize(cross(dFdx(vObjPos), dFdy(vObjPos))));
  vec2 uv;
  float side = 0.0;
  if (n.x >= n.y && n.x >= n.z) { uv = vObjPos.zy; side = 1.0; }
  else if (n.y >= n.z) uv = vObjPos.xz;
  else uv = vObjPos.xy;
  if (id < 1.5) {
    // Twin stripes down the middle of each part, on its front, back and top.
    float x = abs(vObjPos.x);
    return (1.0 - side) * sEdge(0.09, x) * (1.0 - sEdge(0.24, x));
  }
  if (id < 2.5) {
    // Chevrons, pointing up.
    float v = (uv.y + abs(uv.x) * 0.85) / 0.8;
    return 1.0 - sEdge(0.17, abs(fract(v) - 0.5));
  }
  if (id < 3.5) {
    // Splinter camo: shards of two grids at angles to each other.
    vec2 a = mat2(0.94, 0.34, -0.34, 0.94) * uv * 1.6;
    vec2 b = mat2(0.6, -0.8, 0.8, 0.6) * uv * 2.2 + 3.1;
    float ha = sHash2(floor(a));
    float hb = sHash2(floor(b) + 17.0);
    return clamp(step(0.55, ha) * step(0.3, hb) + step(0.82, hb), 0.0, 1.0);
  }
  if (id < 4.5) {
    // Racing checks.
    vec2 c = floor(uv / 0.38);
    return mod(c.x + c.y, 2.0);
  }
  if (id < 5.5) {
    // A hex weave: the cells' edges.
    vec2 q = uv / 0.3;
    const vec2 r = vec2(1.0, 1.7320508);
    vec4 hc = floor(vec4(q, q - vec2(0.5, 1.0)) / r.xyxy) + 0.5;
    vec4 h = vec4(q - hc.xy * r, q - (hc.zw + 0.5) * r);
    vec2 cell = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw;
    cell = abs(cell);
    float d = max(dot(cell, r * 0.5), cell.x);
    return sEdge(0.41, d);
  }
  if (id < 6.5) {
    // Tiger slashes: wavering diagonals, broken up.
    float v = (uv.x * 0.8 + uv.y * 0.6 + 0.22 * sin(uv.y * 4.0 + uv.x * 2.0)) / 0.75;
    float broken = step(0.38, sNoise(vec3(uv * 1.4, 7.0)));
    return (1.0 - sEdge(0.11, abs(fract(v) - 0.5))) * broken;
  }
  if (id < 7.5) {
    // Digital camo: square pixels, in clumps.
    vec2 c1 = floor(uv / 0.16);
    vec2 c2 = floor(uv / 0.48);
    return step(0.62, sHash2(c1 + c2 * 7.3) * 0.45 + sHash2(c2) * 0.6);
  }
  if (id < 8.5) {
    // Racing flames: tongues licking up each part from its bottom edge,
    // tapered to points and wavering, as a hot rod's.
    float t = fract(vObjPos.x * 2.4 + vObjPos.z * 1.1 + 0.37);
    float tongue = pow(1.0 - abs(t * 2.0 - 1.0), 1.6);
    float edge = -0.32 + tongue * 0.62 + 0.1 * sNoise(vec3(vObjPos.x * 3.0, vObjPos.z * 3.0, 4.0));
    return 1.0 - sEdge(edge, vObjPos.y);
  }
  if (id < 9.5) {
    // Pinstripes: a fine pair each side of the middle, on the front, back and top.
    float x = abs(vObjPos.x);
    float a = sEdge(0.13, x) * (1.0 - sEdge(0.155, x));
    float b = sEdge(0.19, x) * (1.0 - sEdge(0.205, x));
    return (1.0 - side) * clamp(a + b, 0.0, 1.0);
  }
  if (id < 10.5) {
    // A lightning bolt across each part: a zigzag on the slant, thick to thin.
    vec2 q = mat2(0.87, 0.5, -0.5, 0.87) * uv;
    float zig = abs(fract(q.x * 2.2) * 2.0 - 1.0) - 0.5;
    float w = 0.07 * (0.55 + 0.45 * clamp(0.5 - q.x * 0.6, 0.0, 1.0));
    return 1.0 - sEdge(w, abs(q.y - zig * 0.22));
  }
  // Sunburst: rays from each face's middle, every other one in the pattern's paint.
  float ang = atan(uv.y, uv.x);
  float ray = fract(ang * 1.9098593 + 0.25);
  return (1.0 - sEdge(0.5, ray)) * sEdge(0.06, length(uv));
}
// Metal flake's sparkle (it twinkles as the view moves) and pearl's colours
// running round the silhouette, on paint. (Chrome and chameleon are in the
// lighting itself: chameleonShift.)
vec3 styleSheen(vec3 wN, vec3 eyeDir, float fres, float isPaint, float fin) {
  if (isPaint < 0.01 || fin < 2.5 || fin > 4.5) return vec3(0.0);
  if (fin < 3.5) {
    float glint = step(0.968, sHash3(floor(vObjPos * 24.0) + floor(dot(eyeDir, vec3(7.0, 11.0, 13.0)) * 3.0)));
    return mix(uEnvHigh, vec3(1.0), 0.5) * glint * 0.85 * isPaint;
  }
  vec3 pearl = 0.5 + 0.5 * cos(6.2831 * (fres * 1.3 + vec3(0.0, 0.33, 0.67)));
  return pearl * 0.3 * smoothstep(0.1, 0.7, fres) * isPaint;
}
// Chameleon: the paint's hue turned as the surface turns from the eye
// (a third of the wheel by the silhouette), its lightness kept.
vec3 chameleonShift(vec3 c, float fres, float k) {
  if (k < 0.01) return c;
  float a = (0.35 + fres * 2.2) * k;
  const mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
  const mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
  vec3 yiq = toYIQ * c;
  float cs = cos(a), sn = sin(a);
  yiq.yz = vec2(yiq.y * cs - yiq.z * sn, yiq.y * sn + yiq.z * cs) * 1.15;
  return max(toRGB * yiq, 0.0);
}
// The paint's own shadow colour (the anime look), under the pattern and the wear.
vec3 celArmorShade() {
  vec3 sh = mix(vShade, uPatShade, gPat);
  sh = mix(sh, vec3(0.16, 0.17, 0.22), gScuff);
  return sh * (1.0 - gSoot * 0.55);
}
`;

/** The style on the paint's colour: the pattern, then the race's scuffs and scorches. */
const STYLE_BODY = /* glsl */ `
gPat = patternMask();
diffuseColor.rgb = mix(diffuseColor.rgb, uPatColor, gPat);
if (uWear > 0.001) {
  // Scuffed through to the metal (dark metal on light paint, bright on dark)...
  float worn = 0.84 - uWear * 0.4;
  float n1 = sNoise(vObjPos * 3.1) * 0.65 + sNoise(vObjPos * 9.7) * 0.35;
  gScuff = vMat < 0.5 ? smoothstep(worn, worn + 0.03, n1) : 0.0;
  float light = step(0.35, dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)));
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.5, 0.52, 0.58), vec3(0.17, 0.18, 0.22), light), gScuff * 0.9);
  // ...and scorched.
  float sootAt = 0.92 - uWear * 0.45;
  gSoot = smoothstep(sootAt, sootAt + 0.18, sNoise(vObjPos * 1.7 + 11.0)) * (1.0 - step(2.5, vMat));
  diffuseColor.rgb *= 1.0 - gSoot * 0.6;
}
`;

/**
 * The armour shader: three's toon lighting (hard bands, real shadows) plus
 * what makes painted and bare metal parts read as different materials: a
 * hard-edged anime highlight sized by surface type, a rim of sky light round
 * the silhouette, and a sky-and-ground reflection on metal and glass.
 */
export function armorMat(style: ArmorStyle = PLAIN_ARMOR): THREE.MeshToonMaterial {
  if (style === PLAIN_ARMOR && armorMaterial) return armorMaterial;
  const mat = new THREE.MeshToonMaterial({ gradientMap: toonGradient(), vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ENV, style);
    const [pa, pb] = panelMaps();
    shader.uniforms.uPanelA = { value: pa };
    shader.uniforms.uPanelB = { value: pb };
    shader.uniforms.uPanelSize = { value: PANEL_SIZE };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        attribute float aMat;
        attribute vec3 aShade;
        attribute float aPanel;
        attribute float aSlot;
        varying float vMat;
        varying vec3 vShade;
        varying float vPanel;
        varying float vSlot;
        varying vec3 vObjPos;
        varying vec3 vWorldN;
        varying vec3 vWorldP;`,
      )
      .replace(
        '#include <fog_vertex>',
        /* glsl */ `#include <fog_vertex>
        vMat = aMat;
        vShade = aShade;
        vPanel = aPanel;
        vSlot = aSlot;
        vObjPos = transformed;
        vWorldN = normalize(mat3(modelMatrix) * objectNormal);
        vWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + STYLE_BODY)
      .replace(
        '#include <lights_toon_pars_fragment>',
        /* glsl */ `
        varying vec3 vViewPosition;
        varying float vMat;
        varying vec3 vShade;
        varying float vPanel;
        varying vec3 vObjPos;
        uniform sampler2D uPanelA;
        uniform sampler2D uPanelB;
        uniform float uPanelSize[6];
        uniform float uPanels;
        // The anime look's panel lines (art/mech-sheets, P1), 0..1 ink: the
        // drawing for this part's paint, projected flat along whichever axis
        // the face looks down (taken from the face itself, so a face never
        // changes projection part way across), fading out where it would be
        // too fine to draw. Wear (lighter, on paint only) in the second.
        vec2 panelInk() {
          float idx = floor(vPanel + 0.5);
          if (idx < -0.5 || uPanels < 0.5) return vec2(0.0);
          vec3 dx = dFdx(vObjPos);
          vec3 dy = dFdy(vObjPos);
          vec3 n = abs(normalize(cross(dx, dy)));
          vec2 uv; vec2 ux; vec2 uy;
          if (n.x >= n.y && n.x >= n.z) { uv = vObjPos.zy; ux = dx.zy; uy = dy.zy; }
          else if (n.y >= n.z) { uv = vObjPos.xz; ux = dx.xz; uy = dy.xz; }
          else { uv = vObjPos.xy; ux = dx.xy; uy = dy.xy; }
          float size = idx < 0.5 ? uPanelSize[0] : idx < 1.5 ? uPanelSize[1] : idx < 2.5 ? uPanelSize[2] : idx < 3.5 ? uPanelSize[3] : uPanelSize[4];
          vec3 ta = textureGrad(uPanelA, uv / size, ux / size, uy / size).rgb;
          vec3 tb = textureGrad(uPanelB, uv / size, ux / size, uy / size).rgb;
          float ink = idx < 0.5 ? ta.r : idx < 1.5 ? ta.g : idx < 2.5 ? ta.b : idx < 3.5 ? tb.r : tb.g;
          // Texels of the drawing to a pixel of screen: much past four the lines are mush.
          float tpp = 512.0 * max(length(ux), length(uy)) / size;
          ink *= 1.0 - smoothstep(4.0, 9.0, tpp);
          float wsize = uPanelSize[5];
          float wear = idx < 2.5 ? textureGrad(uPanelB, uv / wsize + 0.37, ux / wsize, uy / wsize).b : 0.0;
          wear *= 1.0 - smoothstep(4.0, 9.0, 512.0 * max(length(ux), length(uy)) / wsize);
          return vec2(ink, wear);
        }
        varying vec3 vWorldN;
        varying vec3 vWorldP;
        uniform vec3 uEnvHigh;
        uniform vec3 uEnvLow;
        uniform vec3 uRim;
        ${STYLE_HEAD}
        struct ToonMaterial {
          vec3 diffuseColor;
          float spec;
          float shine;
        };
        void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
          vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
          reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
          // A hard-edged highlight, with a little soft spill round it.
          vec3 H = normalize( directLight.direction + geometryViewDir );
          float s = pow( max( dot( geometryNormal, H ), 0.0 ), material.shine );
          float lit = step( 0.0, dot( geometryNormal, directLight.direction ) );
          reflectedLight.directSpecular += directLight.color * ( smoothstep( 0.45, 0.52, s ) * 0.85 + s * 0.25 ) * material.spec * lit;
        }
        void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
          reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
        }
        #define RE_Direct RE_Direct_Toon
        #define RE_IndirectDiffuse RE_IndirectDiffuse_Toon
        `,
      )
      .replace(
        '#include <lights_toon_fragment>',
        /* glsl */ `
        ToonMaterial material;
        material.diffuseColor = diffuseColor.rgb;
        // 0 paint, 1 metal, 2 rubber and dark metal, 3 glass.
        float isMetal = 1.0 - step( 0.5, abs( vMat - 1.0 ) );
        float isDark = 1.0 - step( 0.5, abs( vMat - 2.0 ) );
        float isGlass = step( 2.5, vMat );
        material.spec = mix( mix( mix( 0.32, 0.6, isMetal ), 0.1, isDark ), 1.2, isGlass );
        material.shine = mix( mix( mix( 46.0, 22.0, isMetal ), 12.0, isDark ), 120.0, isGlass );
        // The finish, on paint (and less where it is scuffed to the metal):
        // gloss a sharper, brighter highlight; matte next to none; metal flake
        // and pearl a metal's broader sheen.
        float isPaint = ( 1.0 - step( 0.5, vMat ) ) * ( 1.0 - gScuff );
        float fin = floor( uFinish + 0.5 );
        float isGloss = 1.0 - step( 0.5, abs( fin - 1.0 ) );
        float isMatte = 1.0 - step( 0.5, abs( fin - 2.0 ) );
        float isFlake = step( 2.5, fin ) * ( 1.0 - step( 4.5, fin ) );
        // Chrome: the paint a tinted mirror (its own colour dimmed, the sky
        // and the ground in it); chameleon: a gloss whose hue turns with the view.
        float isChrome = 1.0 - step( 0.5, abs( fin - 5.0 ) );
        float isChameleon = 1.0 - step( 0.5, abs( fin - 6.0 ) );
        material.diffuseColor *= 1.0 - isPaint * isChrome * 0.55;
        material.spec *= 1.0 + isPaint * ( isGloss * 2.2 - isMatte * 0.85 + isFlake * 0.6 + isChrome * 3.2 + isChameleon * 1.8 );
        material.shine *= 1.0 + isPaint * ( isGloss * 2.5 - isFlake * 0.4 + isChrome * 3.0 + isChameleon * 2.0 );
        `,
      )
      .replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        /* glsl */ `
        vec3 wN = normalize( vWorldN );
        vec3 eyeDir = normalize( vWorldP - cameraPosition );
        // Rim: a thin edge of sky light round the silhouette, stronger on top.
        float fres = pow( 1.0 - clamp( dot( wN, -eyeDir ), 0.0, 1.0 ), 3.0 );
        vec3 rim = uRim * smoothstep( 0.25, 0.6, fres ) * ( 0.55 + 0.45 * clamp( wN.y + 0.4, 0.0, 1.0 ) );
        // Reflection of the sky and the ground, for metal and glass (a hint on paint).
        vec3 R = reflect( eyeDir, wN );
        vec3 env = mix( uEnvLow, uEnvHigh, smoothstep( -0.25, 0.35, R.y ) );
        float envK = mix( mix( mix( 0.07, 0.3, isMetal ), 0.04, isDark ), 0.55, isGlass );
        envK *= 1.0 + isPaint * ( isGloss * 2.4 - isMatte * 0.8 + isFlake * 0.9 + isChrome * 7.5 + isChameleon * 2.0 );
        // (Chrome's reflection tinted by its paint, as a coloured chrome's is.)
        vec3 envTint = mix( vec3( 1.0 ), diffuseColor.rgb * 1.6 + 0.15, isPaint * isChrome );
        vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular
          + totalEmissiveRadiance + rim * ( 1.0 - isPaint * isMatte * 0.6 ) + env * envTint * envK * mix( 0.6, 1.0, fres );
        outgoingLight += styleSheen( wN, eyeDir, fres, isPaint, fin );
        outgoingLight = mix( outgoingLight, chameleonShift( outgoingLight, fres, 1.0 ), isPaint * isChameleon );
        `,
      );
  };
  mat.customProgramCacheKey = () => 'zgp-armor-v5';
  // The anime look paints the armour's metal and glass (see look.ts).
  mat.userData.celArmor = true;
  if (style === PLAIN_ARMOR) armorMaterial = mat;
  return mat;
}

const glowMaterials = new Map<number, THREE.MeshBasicMaterial>();

export function glowMaterial(color: number, gain = 1.7): THREE.MeshBasicMaterial {
  const key = color * 10 + Math.round(gain * 4);
  let m = glowMaterials.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(gain), toneMapped: false });
    glowMaterials.set(key, m);
  }
  return m;
}

export interface Built {
  group: THREE.Group;
  armor: THREE.Mesh | null;
  glow: THREE.Mesh | null;
}

export class Kit {
  private armor: THREE.BufferGeometry[] = [];
  private armorSlots: Slot[] = [];
  private armorPanels: Array<number | undefined> = [];
  private glow: THREE.BufferGeometry[] = [];
  private colors: Record<Slot, THREE.Color>;
  /** Each slot's shadow paint, for the anime look's cel shading. */
  private shades: Record<Slot, THREE.Color>;

  /** Builders can supply their original anchors while imported armor replaces
   * their procedural geometry. Release those unused temporary components. */
  discard(): void {
    for (const g of [...this.armor, ...this.glow]) g.dispose();
    this.armor=[];this.armorSlots=[];this.armorPanels=[];this.glow=[];
  }

  constructor(readonly livery: Livery, private readonly outlineWidth = .06, private readonly glowGain = 1.7, private readonly indexed = false) {
    const sh = livery.shades;
    this.shades = {
      P: new THREE.Color(sh.primary),
      S: new THREE.Color(sh.secondary),
      F: new THREE.Color(sh.frame),
      T: new THREE.Color(sh.trim),
      D: new THREE.Color(sh.frame).multiplyScalar(0.55),
      // Glass keeps the shading's own tint (its painting is done in the shader).
      C: new THREE.Color(livery.glow).multiplyScalar(0.3).multiply(new THREE.Color(0.38, 0.36, 0.5)),
      K: new THREE.Color(sh.frame).lerp(new THREE.Color(0x3a3d58), 0.45),
    };
    this.colors = {
      P: new THREE.Color(livery.primary),
      S: new THREE.Color(livery.secondary),
      F: new THREE.Color(livery.frame),
      T: new THREE.Color(livery.trim),
      D: new THREE.Color(livery.frame).multiplyScalar(0.55),
      C: new THREE.Color(livery.glow).multiplyScalar(0.3),
      K: new THREE.Color(livery.frame).lerp(new THREE.Color(0x6c7486), 0.45),
    };
  }

  private push(g: THREE.BufferGeometry, slot: Slot | 'G', o?: Xf, preserveNormals = false, panel?: number): this {
    // Exported meshes already have indexed vertices and authored normal seams.
    // Expanding them to triangles and hashing them back together costs hundreds
    // of milliseconds per mech without changing the rendered surface.
    let geo = g.index && !(this.indexed && preserveNormals) ? g.toNonIndexed() : g;
    geo = xf(geo, o);
    geo.deleteAttribute('uv');
    if (!preserveNormals) geo.deleteAttribute('normal');
    // Keep imported and procedural additions compatible when sharing a joint.
    if (!geo.hasAttribute('normal')) geo.computeVertexNormals();
    // All merged parts carry the same custom attributes, including procedural additions.
    if(!geo.hasAttribute('_outline_normal'))geo.setAttribute('_outline_normal',geo.getAttribute('normal').clone());
    if(!geo.hasAttribute('_ink_width'))geo.setAttribute('_ink_width',new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count).fill(1),1));
    if (this.indexed && !geo.index) geo = weldVertices(geo, 1e-5);
    if (slot === 'G') {
      this.glow.push(geo);
    } else {
      const c = this.colors[slot];
      const sc = this.shades[slot];
      const n = geo.attributes.position.count;
      const col = new Float32Array(n * 3);
      const shade = new Float32Array(n * 3);
      const mat = new Float32Array(n).fill(SURFACE[slot]);
      for (let i = 0; i < n; i++) {
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
        shade[i * 3] = sc.r;
        shade[i * 3 + 1] = sc.g;
        shade[i * 3 + 2] = sc.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('aShade', new THREE.BufferAttribute(shade, 3));
      geo.setAttribute('aMat', new THREE.BufferAttribute(mat, 1));
      geo.setAttribute('aSlot', new THREE.BufferAttribute(new Float32Array(n).fill(SLOT_ID[slot]), 1));
      this.armor.push(geo);
      this.armorSlots.push(slot);
      this.armorPanels.push(panel);
    }
    return this;
  }

  /** Imported rigid-part geometry: retain the artist's normals and own a copy. */
  geometry(slot: Slot | 'G', source: THREE.BufferGeometry, panel?: number): this {
    const g = source.clone();
    if (!g.hasAttribute('normal')) g.computeVertexNormals();
    return this.push(g, slot, undefined, true, panel);
  }

  /** Box centred on the origin, edges chamfered; `taper` and `lean` turn it into a wedge or trapezoid. */
  box(slot: Slot | 'G', w: number, h: number, d: number, o: BoxOpts = {}): this {
    const c = slot === 'G' ? 0 : (o.bevel ?? autoBevel(w, h, d));
    const g = chamferBox(w, h, d, c);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const [tx, tz] = o.taper ?? [1, 1];
    const lean = o.lean ?? 0;
    const leanX = o.leanX ?? 0;
    if (tx !== 1 || tz !== 1 || lean !== 0 || leanX !== 0) {
      for (let i = 0; i < pos.count; i++) {
        const t = pos.getY(i) / h + 0.5;
        pos.setX(i, pos.getX(i) * (1 + (tx - 1) * t) + leanX * t);
        pos.setZ(i, pos.getZ(i) * (1 + (tz - 1) * t) + lean * t);
      }
    }
    return this.push(g, slot, o);
  }

  /** An outline extruded to `depth`, its two faces chamfered, centred on the extrusion. */
  private extrude(pts: Array<[number, number]>, depth: number, bevel: number): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    pts.forEach((p, i) => (i === 0 ? shape.moveTo(p[0], p[1]) : shape.lineTo(p[0], p[1])));
    shape.closePath();
    const b = Math.min(bevel, depth * 0.3);
    const g =
      b > 1e-3
        ? new THREE.ExtrudeGeometry(shape, { depth: depth - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelOffset: -b, bevelSegments: 1 })
        : new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.translate(0, 0, b > 1e-3 ? -(depth - 2 * b) / 2 : -depth / 2);
    return g;
  }

  /** Side profile in (z, y), extruded across x and centred. */
  prism(slot: Slot | 'G', pts: Array<[number, number]>, width: number, o: ExtrudeOpts = {}): this {
    const g = this.extrude(pts, width, slot === 'G' ? 0 : (o.bevel ?? autoBevel(width * 1.6)));
    // The profile was drawn in (x, y) with the thickness along z: turn it so
    // the profile lies in (z, y) and the thickness runs along x.
    g.rotateY(-Math.PI / 2);
    return this.push(g, slot, o);
  }

  /** Front profile in (x, y), extruded along z and centred. */
  plate(slot: Slot | 'G', pts: Array<[number, number]>, depth: number, o: ExtrudeOpts = {}): this {
    const g = this.extrude(pts, depth, slot === 'G' ? 0 : (o.bevel ?? autoBevel(depth * 1.6)));
    return this.push(g, slot, o);
  }

  /** Low-poly cylinder or cone along `axis`, its rims chamfered unless `bevel` is 0. */
  cyl(slot: Slot | 'G', rTop: number, rBottom: number, h: number, sides: number, o: Xf & { axis?: 'x' | 'y' | 'z'; open?: boolean; bevel?: number } = {}): this {
    const c = slot === 'G' || o.open ? 0 : Math.min(o.bevel ?? autoBevel(h, rTop * 2, rBottom * 2), h * 0.3);
    const g =
      c > 1e-3
        ? new THREE.LatheGeometry(
            [
              new THREE.Vector2(0, -h / 2),
              new THREE.Vector2(rBottom - c, -h / 2),
              new THREE.Vector2(rBottom, -h / 2 + c),
              new THREE.Vector2(rTop, h / 2 - c),
              new THREE.Vector2(rTop - c, h / 2),
              new THREE.Vector2(0, h / 2),
            ],
            sides,
          )
        : new THREE.CylinderGeometry(rTop, rBottom, h, sides, 1, o.open ?? false);
    if (o.axis === 'x') g.rotateZ(Math.PI / 2);
    else if (o.axis === 'z') g.rotateX(Math.PI / 2);
    return this.push(g, slot, o);
  }

  /** A turned part from an (r, y) profile, bottom to top: nozzles, collars, sensor domes. */
  lathe(slot: Slot | 'G', profile: Array<[number, number]>, sides: number, o: Xf & { axis?: 'x' | 'y' | 'z' } = {}): this {
    const g = new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      sides,
    );
    if (o.axis === 'x') g.rotateZ(Math.PI / 2);
    else if (o.axis === 'z') g.rotateX(Math.PI / 2);
    return this.push(g, slot, o);
  }

  /**
   * A thruster bell pointing down -z from the origin: a collar, the flared
   * nozzle and a lit throat. Returns the kit for chaining.
   */
  nozzle(r: number, len: number, o: Xf = {}, sides = 10): this {
    const at = o.at ?? [0, 0, 0];
    const rot = o.rot ?? [0, 0, 0];
    const place = (z: number): Xf => {
      // Offset along the nozzle's own axis, then rotate with it.
      const v = new THREE.Vector3(0, 0, z).applyEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
      return { at: [at[0] + v.x, at[1] + v.y, at[2] + v.z], rot };
    };
    // The bell: open lathe, flaring toward the mouth (lathe y runs along -z after the turn).
    // A shell with some thickness, so the inside of the bell is solid from behind.
    const bell: Array<[number, number]> = [
      [r * 0.55, 0], [r * 0.62, len * 0.35], [r * 0.82, len * 0.75], [r, len],
      [r * 0.86, len], [r * 0.7, len * 0.75], [r * 0.5, len * 0.35], [r * 0.44, 0], [r * 0.55, 0],
    ];
    this.lathe('D', bell, sides, { axis: 'z', ...place(0), rot: [rot[0] + Math.PI, rot[1], rot[2]] });
    this.cyl('F', r * 0.72, r * 0.72, len * 0.28, sides, { axis: 'z', ...place(len * 0.1) });
    this.cyl('G', r * 0.36, r * 0.36, 0.02, sides, { axis: 'z', ...place(-len * 0.3) });
    return this;
  }

  /** A recessed grille: a dark well with `slats` bars across it, facing +z. */
  vent(w: number, h: number, slats: number, o: Xf & { depth?: number; lit?: boolean } = {}): this {
    const dp = o.depth ?? 0.12;
    const at = o.at ?? [0, 0, 0];
    const rot = o.rot ?? [0, 0, 0];
    const eul = new THREE.Euler(rot[0], rot[1], rot[2]);
    const off = (x: number, y: number, z: number): [number, number, number] => {
      const v = new THREE.Vector3(x, y, z).applyEuler(eul);
      return [at[0] + v.x, at[1] + v.y, at[2] + v.z];
    };
    this.box('D', w, h, dp, { at: off(0, 0, -dp / 2), rot, bevel: 0.01 });
    if (o.lit) this.box('G', w * 0.8, h * 0.8, 0.01, { at: off(0, 0, -dp * 0.6), rot });
    for (let i = 0; i < slats; i++) {
      const y = -h / 2 + ((i + 0.5) / slats) * h;
      this.box('K', w * 0.96, (h / slats) * 0.42, dp * 0.6, { at: off(0, y, -dp * 0.15), rot: [rot[0] + 0.5, rot[1], rot[2]], bevel: 0 });
    }
    return this;
  }

  /**
   * A skin through rings of points, each ring the same count and wound the
   * same way round, its two ends capped: snouts, beaks, horns. Whichever way
   * the rings are wound, the faces come out facing outward.
   */
  loft(slot: Slot | 'G', rings: Array<Array<[number, number, number]>>, o: Xf = {}): this {
    type P = [number, number, number];
    const tris: Array<[P, P, P]> = [];
    const n = rings[0].length;
    for (let i = 0; i + 1 < rings.length; i++) {
      const a = rings[i];
      const b = rings[i + 1];
      for (let j = 0; j < n; j++) {
        const k = (j + 1) % n;
        tris.push([a[j], a[k], b[k]], [a[j], b[k], b[j]]);
      }
    }
    const caps: Array<[P[], boolean]> = [[rings[0], true], [rings[rings.length - 1], false]];
    for (const [ring, flip] of caps) {
      const c: P = [0, 0, 0];
      for (const p of ring) for (let d = 0; d < 3; d++) c[d] += p[d] / ring.length;
      for (let j = 0; j < n; j++) {
        const k = (j + 1) % n;
        tris.push(flip ? [c, ring[k], ring[j]] : [c, ring[j], ring[k]]);
      }
    }
    // Six times the signed volume: negative if the rings were wound the other way.
    let vol = 0;
    for (const [p, q, r] of tris) vol += p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0]);
    const pos = new Float32Array(tris.length * 9);
    tris.forEach(([p, q, r], i) => pos.set(vol < 0 ? [...p, ...r, ...q] : [...p, ...q, ...r], i * 9));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return this.push(g, slot, o);
  }

  ball(slot: Slot | 'G', r: number, o: Xf = {}): this {
    return this.push(new THREE.IcosahedronGeometry(r, 1), slot, o);
  }

  /**
   * Merge everything added so far into meshes under one group. `limb`: these
   * parts are an arm or a leg, so the primary armour wears limb segments
   * rather than big plates (the anime look's panel lines).
   */
  build(limb = false): Built {
    const group = new THREE.Group();
    let armor: THREE.Mesh | null = null;
    let glow: THREE.Mesh | null = null;
    const table = limb ? PANEL_LIMB : PANEL_BODY;
    this.armor.forEach((g, i) => g.setAttribute('aPanel', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(this.armorPanels[i] ?? table[this.armorSlots[i]]), 1)));
    if (this.armor.length) {
      const geo = mergeGeometries(this.armor)!;
      if (!geo.hasAttribute('normal')) geo.computeVertexNormals();
      armor = new THREE.Mesh(geo, armorMat());
      armor.castShadow = true;
      armor.receiveShadow = true;
      group.add(armor);
      // Outline hull: same shape with normals averaged across hard edges.
      const hull = new THREE.BufferGeometry();
      hull.setAttribute('position', geo.attributes.position.clone());
      if (geo.index) hull.setIndex(geo.index.clone());
      const welded = weldVertices(hull, 1e-3);
      welded.computeVertexNormals();
      const line = new THREE.Mesh(welded, outlineMat(this.outlineWidth));
      group.add(line);
    }
    if (this.glow.length) {
      const geo = mergeGeometries(this.glow)!;
      glow = new THREE.Mesh(geo, glowMaterial(this.livery.glow, this.glowGain));
      group.add(glow);
    }
    this.discard();
    return { group, armor, glow };
  }
}
