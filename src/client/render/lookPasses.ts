// The two post passes of the 80s anime look.
//
// Ink: lines traced from the depth buffer and the flat colours, the way an
// inbetweener traces a drawing: an outline where a shape stands in front of
// another, a line where a surface folds, and a line where two flat colours
// meet. They are heavier up close, break here and there, fade into the
// distance, and are traced again (a fraction of a pixel off) on every new
// drawing, which makes them boil.
//
// Film: what the camera did to the cels. Halation round bright light, a
// little colour fringe and softness, a grade toward the painted palette
// (violet shadows, warm light, blacks that are paint, not black), grain at 24
// frames a second, a gentle vignette. It also cuts in two moments of its own:
// the impact frame (flat ink in two tones for a frame or two on a big hit)
// and the painted still (a freeze-frame laid down as a painting, pushing
// slowly in, for a knockout).
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const COMMON = /* glsl */ `
  // A hash without sin(), which some GPUs evaluate at low precision for large arguments.
  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }`;

const InkShader = {
  name: 'InkShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1280, 720) },
    uNear: { value: 0.5 },
    uFar: { value: 40000 },
    uInk: { value: 1 },
    uBoil: { value: 1 },
    uSeed: { value: 0 },
    uInkColor: { value: new THREE.Color(0x150f22) },
    /** Background lines fade out between these distances (world units). */
    uFade: { value: new THREE.Vector2(160, 900) },
  },
  vertexShader: VERTEX,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 uRes;
    uniform vec2 uFade;
    uniform float uNear, uFar, uInk, uBoil, uSeed;
    uniform vec3 uInkColor;
    varying vec2 vUv;
    ${COMMON}
    float dist(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
    // A character pixel (a mech) carries alpha 0.5; everything else is background.
    float charAt(vec4 c) { return 1.0 - step(0.75, c.a); }
    void main() {
      vec4 src4 = texture2D(tDiffuse, vUv);
      vec3 src = src4.rgb;
      vec2 px = 1.0 / uRes;
      // Lines are drawn for a 1080-line frame and scaled with it.
      float scale = clamp(uRes.y / 1080.0, 0.75, 3.0);
      // Boil: each drawing traces the lines again, a fraction of a pixel off.
      vec2 cell = floor(vUv * uRes / (9.0 * scale));
      vec2 jit = (vec2(hash(cell + uSeed), hash(cell + uSeed + 17.3)) - 0.5) * px * 1.1 * scale * uBoil;
      vec2 uv = vUv + jit;
      float zc = dist(uv);
      float me = charAt(texture2D(tDiffuse, uv));

      // ---- the outer line: the near edge of a shape against what is behind it.
      // A character's contour is heavy close up and thins with distance; a background's is light.
      float wo = scale * mix(mix(3.4, 1.3, smoothstep(8.0, 70.0, zc)), 1.0, 1.0 - me);
      vec2 ox = vec2(px.x * wo, 0.0);
      vec2 oy = vec2(0.0, px.y * wo);
      float zl = dist(uv - ox), zr = dist(uv + ox), zb = dist(uv - oy), zt = dist(uv + oy);
      // The depth's second difference: large on the near side of a step, small
      // across a plane however steeply it is seen (a road toward the horizon).
      float step2 = max(zl + zr - 2.0 * zc, zb + zt - 2.0 * zc);
      float outline = smoothstep(0.06, 0.14, step2 / zc);
      // For a character, the contour is where it meets the background: that
      // is always lined, even where the depths are close (a foot on the road).
      vec4 al = texture2D(tDiffuse, uv - ox), ar = texture2D(tDiffuse, uv + ox), ab = texture2D(tDiffuse, uv - oy), at = texture2D(tDiffuse, uv + oy);
      float contour = me * (1.0 - min(min(charAt(al), charAt(ar)), min(charAt(ab), charAt(at))));

      // ---- inner lines, characters only, thinner: one part over another,
      // creases, and where two paints meet. Not where a paint meets its own
      // shadow: cels never inked those.
      float inner = 0.0;
      if (me > 0.5) {
        float wi = scale * mix(1.6, 1.0, smoothstep(8.0, 40.0, zc));
        vec2 ix = vec2(px.x * wi, 0.0);
        vec2 iy = vec2(0.0, px.y * wi);
        float il = dist(uv - ix), ir = dist(uv + ix), ib = dist(uv - iy), it = dist(uv + iy);
        float over = smoothstep(0.03, 0.08, max(il + ir - 2.0 * zc, ib + it - 2.0 * zc) / zc);
        float lap = abs(il + ir - 2.0 * zc) + abs(ib + it - 2.0 * zc);
        float fold = smoothstep(0.015, 0.04, lap / zc) * 0.8;
        vec3 cl = texture2D(tDiffuse, uv - ix).rgb, cr = texture2D(tDiffuse, uv + ix).rgb;
        vec3 cb = texture2D(tDiffuse, uv - iy).rgb, ct = texture2D(tDiffuse, uv + iy).rgb;
        float hot = max(max(max(luma(cl), luma(cr)), max(luma(cb), luma(ct))), luma(src));
        // Paint boundaries change brightness by a wide ratio; a shadow by much less.
        float rx = abs(log((luma(cr) + 0.015) / (luma(cl) + 0.015)));
        float ry = abs(log((luma(ct) + 0.015) / (luma(cb) + 0.015)));
        float colour = smoothstep(0.85, 1.25, max(rx, ry)) * (1.0 - smoothstep(0.9, 1.3, hot)) * 0.8;
        inner = max(max(over, fold), colour) * 0.72;
      }

      // A hand-drawn line breaks here and there, and fades where a background painter would leave it out.
      float breaks = smoothstep(0.04, 0.16, hash(floor(uv * uRes / (5.0 * scale)) + uSeed * 1.7));
      float bgFade = 1.0 - smoothstep(uFade.x, uFade.y, zc);
      float charLine = max(contour, inner) * me * mix(1.0, breaks, 0.7);
      float bgLine = outline * (1.0 - me) * breaks * bgFade * 0.7;
      // Ink is ink on a character; on a background the line is the paint's own colour, darker.
      float shade = 0.55 + 0.45 * min(luma(src), 1.0);
      vec3 col = mix(src, uInkColor * shade, clamp(charLine * uInk, 0.0, 1.0));
      col = mix(col, mix(src * 0.4, uInkColor * shade, 0.5), clamp(bgLine * uInk, 0.0, 1.0));
      gl_FragColor = vec4(col, 1.0);
    }`,
};

/** The ink pass: needs the depth of the frame it inks, taken from the buffer it reads. */
export class InkPass extends ShaderPass {
  constructor() {
    super(InkShader);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    this.uniforms.tDepth.value = readBuffer.depthTexture;
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }
}

const FilmShader = {
  name: 'FilmShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1280, 720) },
    uFilm: { value: 1 },
    uGrainSeed: { value: 0 },
    uWeave: { value: new THREE.Vector2(0, 0) },
    uShadowGrade: { value: new THREE.Color(0.86, 0.82, 1.08) },
    uLightGrade: { value: new THREE.Color(1.05, 1.0, 0.92) },
    uLift: { value: new THREE.Color(0.012, 0.009, 0.022) },
    uInkColor: { value: new THREE.Color(0x150f22) },
    uImpact: { value: 0 },
    uImpactDark: { value: new THREE.Color(0.006, 0.003, 0.009) },
    uImpactLight: { value: new THREE.Color(2.4, 2.2, 1.9) },
    uImpactLine: { value: new THREE.Color(1.8, 0.07, 0.1) },
    uStill: { value: 0 },
    uStillZoom: { value: 0 },
    uPaperSeed: { value: 0 },
  },
  vertexShader: VERTEX,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes, uWeave;
    uniform float uFilm, uGrainSeed, uImpact, uStill, uStillZoom, uPaperSeed;
    uniform vec3 uShadowGrade, uLightGrade, uLift, uInkColor, uImpactDark, uImpactLight, uImpactLine;
    varying vec2 vUv;
    ${COMMON}
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    vec3 tex(vec2 uv) { return texture2D(tDiffuse, uv).rgb; }
    float edgeAt(vec2 uv, vec2 px) {
      float gx = luma(tex(uv + vec2(px.x, 0.0))) - luma(tex(uv - vec2(px.x, 0.0)));
      float gy = luma(tex(uv + vec2(0.0, px.y))) - luma(tex(uv - vec2(0.0, px.y)));
      return length(vec2(gx, gy)) / (0.2 + luma(tex(uv)));
    }
    void main() {
      vec2 px = 1.0 / uRes;
      vec2 uv = vUv;
      // The painted still pushes slowly in.
      if (uStill > 0.0) uv = 0.5 + (uv - 0.5) / (1.0 + uStillZoom);
      // Gate weave: the film never sits quite still in the gate.
      uv += uWeave;
      vec2 to = uv - 0.5;
      float r2 = dot(to, to);
      // Lens: colour fringe toward the edges, and softness.
      float ca = 0.013 * r2 * uFilm;
      vec3 c = vec3(tex(uv - to * ca).r, tex(uv).g, tex(uv + to * ca).b);
      vec3 soft = (tex(uv + vec2(px.x, 0.0)) + tex(uv - vec2(px.x, 0.0)) + tex(uv + vec2(0.0, px.y)) + tex(uv - vec2(0.0, px.y))) * 0.25;
      c = mix(c, soft, 0.2 * min(uFilm, 1.5));
      // Halation: bright light bleeds red-orange into the emulsion round it.
      vec3 hal = vec3(0.0);
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.785398 + 0.39;
        hal += max(tex(uv + vec2(cos(a), sin(a)) * px * 6.5 * max(1.0, uRes.y / 1080.0)) - 0.9, 0.0);
      }
      c += hal * (0.1 * uFilm) * vec3(1.0, 0.42, 0.22);
      // Grade toward the painted palette: cooler, more violet shadows, warmer
      // light, chosen on how bright the pixel will look rather than its linear value.
      float k = min(uFilm, 1.0);
      float y = luma(c);
      float ty = y / (y + 0.35);
      c = max(mix(vec3(y), c, 1.0 + 0.16 * k), 0.0);
      vec3 grade = mix(uShadowGrade, uLightGrade, smoothstep(0.15, 0.6, ty));
      c *= mix(vec3(1.0), grade, k);
      // Blacks are paint, not black.
      c = c * (1.0 - 0.03 * k) + uLift * k;
      // Grain, more in the mids.
      float gr = hash(floor(vUv * uRes) + uGrainSeed) + hash(floor(vUv * uRes * 0.5) + uGrainSeed * 1.3) - 1.0;
      c += gr * 0.036 * uFilm * (0.2 + min(y, 1.2));
      // Vignette.
      c *= 1.0 - 0.18 * min(uFilm, 1.5) * smoothstep(0.35, 0.95, length(to * vec2(1.3, 1.0)));

      // The painted still: the frame laid down again as a painting, the way
      // a series stopped on a held, fully painted cel at its big moments.
      // Brush strokes smear the colour along a direction that wanders across
      // the frame, the tones are laid in a few flat values (the hue kept), the
      // shadows are hatched, the lines are inked heavier, on rough warm paper,
      // under a deep vignette.
      if (uStill > 0.0) {
        vec2 sp = vUv * uRes / max(1.0, uRes.y / 720.0);
        float ang = noise(sp / 90.0 + uPaperSeed) * 6.28318;
        vec2 dir = vec2(cos(ang), sin(ang)) * px * 2.6 * max(1.0, uRes.y / 720.0);
        vec3 p = c;
        for (int i = 1; i <= 4; i++) {
          p += tex(uv + dir * float(i)) + tex(uv - dir * float(i));
        }
        p /= 9.0;
        float py = luma(p);
        float tl = py / (py + 0.5);
        float ql = (floor(tl * 6.0 + 0.5) + 0.15 * (noise(sp / 3.0 + uPaperSeed) - 0.5)) / 6.0;
        ql = clamp(ql, 0.02, 0.98);
        float ny = 0.5 * ql / (1.0 - ql);
        p *= ny / max(py, 1e-4);
        p = mix(vec3(luma(p)), p, 0.85);
        // Hatching in the shadows, along the strokes.
        vec2 hd = vec2(cos(ang + 0.8), sin(ang + 0.8));
        float hatch = smoothstep(0.55, 0.85, abs(fract(dot(sp, hd) / 5.0) - 0.5) * 2.0);
        p = mix(p, p * 0.6 + uInkColor * 0.15, hatch * (1.0 - smoothstep(0.1, 0.28, tl)) * 0.6);
        // Paper.
        float paper = 0.88 + 0.12 * noise(sp / 1.6 + uPaperSeed) * noise(sp / 9.0 - uPaperSeed);
        p *= paper * vec3(1.05, 0.99, 0.88);
        float e = smoothstep(0.24, 0.5, edgeAt(uv, px * 1.5));
        p = mix(p, uInkColor, e * 0.65);
        p *= 1.0 - 0.5 * smoothstep(0.25, 0.95, length(to * vec2(1.3, 1.0)));
        c = mix(c, p, uStill);
      }

      // Impact frame. First a drawing in negative, then one in two flat
      // tones with the lines in red.
      if (uImpact > 0.0) {
        float yt = luma(c) / (1.0 + luma(c));
        float e = smoothstep(0.2, 0.42, edgeAt(uv, px));
        if (uImpact > 1.5) {
          // Negative: the colours inverted on film (as they will look, not as
          // linear light), harder.
          vec3 d = sqrt(max(c, 0.0) / (max(c, 0.0) + 0.25));
          vec3 nd = smoothstep(0.08, 0.92, vec3(1.0) - d);
          c = 0.25 * nd * nd / max(vec3(1.0) - nd * nd, vec3(0.02));
          c = mix(c, uImpactDark, e);
        } else {
          vec3 imp = mix(uImpactDark, uImpactLight, step(0.4, yt));
          c = mix(imp, uImpactLine, e);
        }
      }
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class FilmPass extends ShaderPass {
  constructor() {
    super(FilmShader);
  }
}

/** Per-circuit colours for the look: the ink, and the film grade's shadows and lights. */
export interface LookPalette {
  ink: number;
  shadowGrade: [number, number, number];
  lightGrade: [number, number, number];
  lift: [number, number, number];
}

export const LOOK_PALETTES: Record<string, LookPalette> = {
  // Golden hour over the sea: navy ink, violet shadows, honey light.
  meridian: { ink: 0x16112a, shadowGrade: [0.97, 0.95, 1.03], lightGrade: [1.05, 1.0, 0.92], lift: [0.004, 0.004, 0.008] },
  // Dusk in the desert: maroon ink, plum shadows, amber light.
  canyon: { ink: 0x24101a, shadowGrade: [0.99, 0.92, 1.02], lightGrade: [1.05, 0.99, 0.9], lift: [0.008, 0.004, 0.007] },
  // Noon above cloud: blue-black ink, cool shadows, clean light.
  helios: { ink: 0x0f1630, shadowGrade: [0.95, 0.97, 1.04], lightGrade: [1.03, 1.01, 0.96], lift: [0.003, 0.005, 0.009] },
};
