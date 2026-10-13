// The 80s anime look: one switch and its settings, the drawing clock, and the
// cel shading every lit material is given.
//
// The look copies the limits of cel animation shot on film rather than any
// one effect (see docs/ART.md): two or three flat tones a surface with the
// shadow shifted toward violet, ink lines, poses and effects drawn on twos,
// a film layer of grain and halation, and a few cuts of its own for big
// moments. Everything here is presentation; the race never sees it.
import * as THREE from 'three';
import type { Feel } from '../game/tuning';
import type { Theme } from './themes';

export interface LookState {
  /** The 80s anime look is on. Everything below only applies while it is. */
  on: boolean;
  /** Film layer strength (grain, halation, softness, fringe), 0..2. */
  film: number;
  /** Ink line strength, 0..2. */
  ink: number;
  /** How much lines and grain shift between drawings, 0..2. */
  boil: number;
  /** Drawings a second for poses and effects; 0 = smooth. */
  steps: number;
  impact: boolean;
  still: boolean;
}

/** The look in force this frame. The game copies it from the tuning values every frame. */
export const look: LookState = { on: true, film: 1, ink: 1, boil: 1, steps: 12, impact: true, still: true };

export function readLook(f: Feel): void {
  look.on = f.look >= 0.5;
  look.film = f.lookFilm;
  look.ink = f.lookInk;
  look.boil = f.lookBoil;
  look.steps = Math.round(f.lookSteps);
  look.impact = f.lookImpact >= 0.5;
  look.still = f.lookStill >= 0.5;
}

/**
 * The drawing clock. `drawing` counts up once per drawing, at `look.steps` a
 * second (12 by default: animation on twos), and `fresh` is true on the frame
 * a new drawing starts. Anything that should only change on a new drawing
 * (a pose, an effect's shape, the boil of the lines) keys off it. Grain is
 * on film, which runs at 24 frames a second whatever the drawings do.
 */
export const drawClock = { time: 0, drawing: 0, fresh: true, film: 0, filmFresh: true };

export function tickDrawings(dt: number): void {
  const prev = drawClock.time;
  drawClock.time += dt;
  const rate = look.on && look.steps > 0 ? look.steps : 60;
  const d = Math.floor(drawClock.time * rate);
  drawClock.fresh = d !== Math.floor(prev * rate);
  if (drawClock.fresh) drawClock.drawing = d;
  const f = Math.floor(drawClock.time * 24);
  drawClock.filmFresh = f !== drawClock.film;
  drawClock.film = f;
}

/**
 * Seconds per drawing for something that animates at `hz` (or the look's
 * own rate, whichever is slower), or 0 when it should animate smoothly.
 */
export function drawingStep(hz = 0): number {
  if (!look.on || look.steps <= 0) return 0;
  return 1 / (hz > 0 ? Math.min(hz, look.steps) : look.steps);
}

// ---- cel shading ------------------------------------------------------------

/** Uniforms shared by every cel-shaded material (one object, so a change reaches them all). */
export const CEL = {
  uCel: { value: 1 },
  /**
   * The shadow tone, as a multiple of the lit tone: a little darker and
   * shifted toward violet, the way a cel painter mixed the shadow colour for
   * each paint rather than darkening it. Set per circuit by setCelTheme.
   */
  uShadeTint: { value: new THREE.Color(0.6, 0.56, 0.78) },
  /** The same for the painted backgrounds, which keep a gentler contrast. */
  uBgShadeTint: { value: new THREE.Color(0.74, 0.7, 0.86) },
  /** N.L a lit cel is painted at: one flat tone for the whole lit side. */
  uKeyRef: { value: 0.62 },
  /**
   * How far the key light is lifted toward overhead for the shading. Cel
   * lighting is designed, not measured: a low sun would otherwise leave half
   * of every mech in shadow from every angle.
   */
  uKeyLift: { value: 0.35 },
  /** Light bounced back into the shadow along its far rim, 0..1. */
  uBounce: { value: 0.65 },
  /** Where the shadow starts: N.L below this. A little above 0 gives more shadow, as cels did. */
  uTerminator: { value: 0.1 },
};

/** Shadow tints from a circuit's sky: the shadow leans toward the sky's colour and then toward violet. */
export function setCelTheme(theme: Theme): void {
  const sky = new THREE.Color(theme.skyLight);
  const sp = Math.max(sky.r, sky.g, sky.b) || 1;
  sky.multiplyScalar(1 / sp);
  const violet = new THREE.Color(0.66, 0.56, 1.0);
  const tint = sky.clone().lerp(violet, 0.35);
  CEL.uShadeTint.value.copy(tint).multiplyScalar(0.64);
  CEL.uBgShadeTint.value.copy(tint).lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar(0.78);
}

const CEL_HEAD = /* glsl */ `
uniform float uCel;
uniform vec3 uShadeTint;
uniform vec3 uBgShadeTint;
uniform float uKeyRef;
uniform float uKeyLift;
uniform float uBounce;
uniform float uTerminator;
float celStep(float x, float edge) {
  float aa = fwidth(x) * 0.9 + 0.0015;
  return smoothstep(edge - aa, edge + aa, x);
}
`;

// Replaces the material's own light with flat tones chosen by which way the
// surface faces the key light. The lit tone is as bright as the plain look
// lights that surface at a typical angle (sun and sky together), so the two
// looks agree on how bright a circuit is; the shadow tone is a mixed colour
// of the lit one. Characters (the mechs) also get a highlight, a band of
// bounced light along the edge of the shadow and, on armour, metal and glass
// painted the way a cel painter did them. Backgrounds keep it gentler.
const CEL_BODY = /* glsl */ `
if (uCel > 0.5) {
  vec3 celBase = diffuseColor.rgb;
  vec3 celN = normalize(normal);
  vec3 celV = normalize(vViewPosition);
  vec3 celUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  vec3 celL = celUp;
  vec3 celSun = vec3(0.0);
  #if NUM_DIR_LIGHTS > 0
    celL = normalize(directionalLights[0].direction + celUp * uKeyLift);
    celSun = directionalLights[0].color;
  #endif
  vec3 celAmb = ambientLightColor;
  #if NUM_HEMI_LIGHTS > 0
    celAmb += mix(hemisphereLights[0].groundColor, hemisphereLights[0].skyColor, 0.75);
  #endif
  vec3 celLit = celBase * (celSun * uKeyRef + celAmb) * RECIPROCAL_PI;
  float ndl = dot(celN, celL);
  float litK = celStep(ndl, uTerminator);
  #ifdef CEL_CHAR
    // Black is never quite black on a cel: a dark blue-grey paint, so the shading still reads.
    celLit += (celSun * uKeyRef + celAmb) * RECIPROCAL_PI * vec3(0.03, 0.032, 0.044);
    vec3 celShade = celLit * uShadeTint;
    // Bounce: a lighter band along the far rim of the shadow.
    float rim = 1.0 - clamp(dot(celN, celV), 0.0, 1.0);
    celShade = mix(celShade, mix(celShade, celLit, 0.45), celStep(rim, 0.62) * uBounce);
    vec3 celCol = mix(celShade, celLit, litK);
    // Highlight: a third, lighter tone where the surface looks straight at the light.
    celCol = mix(celCol, celLit * 1.22, celStep(ndl, 0.9) * 0.6);
    // Against the light, a hard rim of it round the edge facing the sun.
    #if NUM_DIR_LIGHTS > 0
      vec3 celSunDir = directionalLights[0].direction;
      float against = smoothstep(0.0, 0.35, -dot(celSunDir, celV));
      float rimLit = celStep(rim, 0.55) * celStep(dot(celN, celSunDir), -0.1);
      celCol = mix(celCol, celLit * 1.15, rimLit * against);
    #endif
    #ifdef CEL_ARMOR
      // 0 paint, 1 bare metal, 2 rubber and dark metal, 3 glass.
      float cMetal = 1.0 - step(0.5, abs(vMat - 1.0));
      float cDark = 1.0 - step(0.5, abs(vMat - 2.0));
      float cGlass = step(2.5, vMat);
      vec3 celH = normalize(celL + celV);
      float nh = dot(celN, celH);
      // Metal: an airbrushed sheen up each lit panel and a hard white glint.
      celCol += celLit * 0.28 * cMetal * smoothstep(-0.1, 0.9, celN.y) * litK;
      float glint = celStep(nh, mix(mix(0.985, 0.975, cMetal), 0.95, cGlass));
      celCol += celSun * RECIPROCAL_PI * glint * mix(mix(0.45, 1.0, cMetal), 1.5, cGlass) * (1.0 - cDark * 0.8) * max(litK, cGlass);
      // Glass: sky above the horizon line, ground below it, cut hard.
      vec3 celR = reflect(-celV, celN);
      float above = celStep(dot(celR, celUp), 0.0);
      celCol = mix(celCol, mix(celLit * 0.35, celLit * 1.1 + celAmb * 0.12, above), cGlass * 0.7);
    #endif
  #else
    vec3 celCol = mix(celLit * uBgShadeTint, celLit, litK);
  #endif
  outgoingLight = celCol + totalEmissiveRadiance;
}
`;

// After the colour is written: characters mark their pixels (alpha 0.5) so
// the ink pass can line them as cels and the backgrounds as paintings.
const CEL_MARK = /* glsl */ `
#ifdef CEL_CHAR
  if (uCel > 0.5) gl_FragColor.a = 0.5;
#endif
`;

/**
 * Give every toon and Lambert material under `root` the cel shading (once
 * each). It is switched by CEL.uCel, so the look can change without a
 * recompile. A material with `userData.celChar` is drawn as a character
 * (a mech); `userData.celArmor` adds the armour's metal and glass.
 */
export function celify(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      if ((m instanceof THREE.MeshToonMaterial || m instanceof THREE.MeshLambertMaterial) && !m.userData.cel) celMaterial(m);
    }
  });
}

/** Mark everything under `root` as a character, to be inked and shaded as one. */
export function markCharacter(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) m.userData.celChar = true;
  });
}

export function celMaterial(m: THREE.MeshToonMaterial | THREE.MeshLambertMaterial): void {
  m.userData.cel = true;
  const char = m.userData.celChar === true;
  const armor = char && m.userData.celArmor === true;
  // Only an opaque surface can carry the mark: a transparent one blends its alpha.
  const mark = char && !m.transparent;
  // Keep whatever the material already does to its shader (the armour has its own).
  const before = m.onBeforeCompile.bind(m);
  const beforeKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    Object.assign(shader.uniforms, CEL);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + CEL_HEAD)
      .replace('#include <opaque_fragment>', CEL_BODY + '\n#include <opaque_fragment>\n' + (mark ? CEL_MARK : ''));
    const defines: Record<string, string> = {};
    if (char) defines.CEL_CHAR = '';
    if (armor) defines.CEL_ARMOR = '';
    shader.defines = { ...(shader.defines ?? {}), ...defines };
  };
  m.customProgramCacheKey = () => `${beforeKey()}|cel${char ? '-char' : ''}${armor ? '-armor' : ''}${mark ? '-mark' : ''}`;
  m.needsUpdate = true;
}
