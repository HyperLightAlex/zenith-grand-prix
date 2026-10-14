// WebGL renderer plus the post-processing chain: bloom, then a "speed" pass
// (the stretch of the world going by, streaks, vignette, impact flash), then
// tone-mapped output.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { drawClock, look } from './look';
import { FilmPass, InkPass, LOOK_PALETTES } from './lookPasses';
import { COLORS } from './palette';

const SpeedShader = {
  name: 'SpeedShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSpeed: { value: 0 }, // 0..1 radial blur and streak strength
    // The depth of the frame, for the stretch: how far the camera travels in
    // the blur's "shutter" (world units), over each pixel's distance, is how
    // far that pixel smears away from the point the camera is heading for.
    tDepth: { value: null as THREE.Texture | null },
    // What travels with the camera (the mechs), drawn small: left sharp.
    tTravel: { value: null as THREE.Texture | null },
    uNear: { value: 0.5 },
    uFar: { value: 40000 },
    uTravel: { value: 0 },
    uBoost: { value: 0 },
    uFlash: { value: 0 }, // white impact flash
    uHurt: { value: 0 }, // red edge when hit
    uBlurK: { value: 1 }, // tuning multipliers
    uLineK: { value: 1 },
    uTint: { value: new THREE.Vector3(1, 1, 1) }, // colour of the speed lines
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uFocus: { value: new THREE.Vector2(0.5, 0.5) },
    // The anime look: speed drawn as lines rather than blurred, redrawn on each drawing.
    uDrawn: { value: 0 },
    uLineSeed: { value: 0 },
    // A held frame: no blur and no speed lines over it.
    uHold: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform sampler2D tTravel;
    uniform float uSpeed, uBoost, uFlash, uHurt, uTime, uAspect, uBlurK, uLineK, uDrawn, uLineSeed, uHold, uNear, uFar, uTravel;
    uniform vec2 uFocus;
    uniform vec3 uTint;
    varying vec2 vUv;
    float hash(float n) { return fract(sin(n) * 43758.5453); }
    void main() {
      vec2 to = vUv - uFocus;
      vec2 asp = vec2(to.x * uAspect, to.y);
      float r = length(asp);
      // The world stretching past: a pixel smears away from the point the
      // camera is heading for by as far as the camera travels in the
      // "shutter" over that pixel's distance, so the road and the barriers
      // close by streak and the sky and far hills hold still. Kept off the
      // middle of the frame (the mech being followed travels with the
      // camera), and a little blur toward the edges, as before, on top.
      float z = max(-perspectiveDepthToViewZ(texture2D(tDepth, vUv).x, uNear, uFar), uNear);
      float mask = smoothstep(0.1, 0.6, r);
      float stretch = min(uTravel / z, 0.16) * mask * (1.0 - texture2D(tTravel, vUv).r);
      float edge = (uSpeed * 0.012 + uBoost * 0.03) * smoothstep(0.3, 0.95, r);
      float amt = (stretch + edge) * uBlurK * (1.0 - uHold);
      vec3 col = vec3(0.0);
      float tw = 0.0;
      // Jittered along the streak, so a long one is a smear and not a row of copies.
      float jit = hash(dot(floor(vUv * 1024.0), vec2(1.0, 57.0)) + uTime) / 12.0;
      for (int i = 0; i < 12; i++) {
        float t = float(i) / 12.0 + jit;
        vec2 at = vUv - to * amt * t;
        // (Not smeared out of a mech: it is not what is going by.)
        float w = (1.0 - t * 0.55) * (1.0 - 0.9 * texture2D(tTravel, at).r * step(0.001, amt));
        col += texture2D(tDiffuse, at).rgb * w;
        tw += w;
      }
      col /= tw;
      // Chromatic fringe under boost.
      float ca = uBoost * 0.006 * smoothstep(0.2, 0.9, r);
      col.r = mix(col.r, texture2D(tDiffuse, vUv - to * (amt + ca)).r, 0.6 * step(0.0001, ca));
      col.b = mix(col.b, texture2D(tDiffuse, vUv - to * (amt - ca)).b, 0.6 * step(0.0001, ca));
      // Anime speed lines: thin radial streaks that flicker.
      float ang = atan(asp.y, asp.x);
      float seg = floor(ang * 34.0);
      float rnd = hash(seg + floor(uTime * 14.0) * 17.0);
      float line = smoothstep(0.82, 1.0, rnd) * smoothstep(0.30 + hash(seg) * 0.25, 0.95, r);
      float fa = fract(ang * 34.0);
      line *= smoothstep(0.0, 0.25, fa) * smoothstep(1.0, 0.75, fa);
      col += uTint * line * (uSpeed * 0.12 + uBoost * 0.35) * uLineK * (1.0 - uDrawn);
      if (uDrawn > 0.5) {
        // Drawn speed lines: hard-edged wedges from the edge of the frame,
        // thicker toward the edge, mostly white with a few in ink, a new set
        // on every drawing.
        // More of them, reaching further in, the faster it goes.
        float n = 56.0;
        float sd = floor(ang * n / 6.28318);
        float dens = clamp(0.1 + 0.16 * uSpeed + 0.22 * uBoost, 0.0, 0.6);
        float on = step(1.0 - dens, hash(sd * 1.71 + uLineSeed * 31.7));
        float start = 0.36 + hash(sd + 3.1) * 0.3 - 0.08 * min(uBoost, 1.0);
        float fd = fract(ang * n / 6.28318);
        float hw = 0.07 + 0.3 * smoothstep(start, 1.25, r);
        // (fwidth of the angle, not of its fract, which jumps at each cell's edge.)
        float edge = min(fwidth(ang * n / 6.28318), 0.1) * 1.2;
        float wedge = 1.0 - smoothstep(hw - edge, hw + edge, abs(fd - 0.5));
        float drawn = on * wedge * smoothstep(start, start + 0.04, r);
        vec3 lc = hash(sd + 7.7) < 0.25 ? vec3(0.02, 0.016, 0.04) : uTint * 1.5;
        col = mix(col, lc, drawn * clamp(uSpeed * 0.5 + uBoost * 0.9, 0.0, 0.9) * uLineK * (1.0 - uHold));
      }
      // Vignette, hurt tint, flash.
      float vig = smoothstep(0.55, 1.15, r);
      col *= 1.0 - vig * (0.22 + uSpeed * 0.12);
      // (Not over a held frame: the painting is of the moment, not the flash.)
      col = mix(col, vec3(1.0, 0.12, 0.16), vig * uHurt * 0.55 * (1.0 - uHold));
      col = mix(col, vec3(1.0), uFlash * (1.0 - uHold));
      gl_FragColor = vec4(col, 1.0);
    }`,
};

/** The layer of what travels with the camera (the mechs), which the speed stretch leaves sharp. */
export const TRAVELLER_LAYER = 5;

/** Put an object (and everything in it) on the traveller layer as well as its own. */
export function markTraveller(root: THREE.Object3D): void {
  root.traverse((o) => o.layers.enable(TRAVELLER_LAYER));
}

/** Draws nothing: hands the depth of the frame just rendered to the passes after it. */
class DepthTap extends Pass {
  constructor(private readonly out: { value: THREE.Texture | null }) {
    super();
    this.needsSwap = false;
  }

  override render(_r: THREE.WebGLRenderer, _w: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.out.value = readBuffer.depthTexture;
  }
}

export type Quality = 'low' | 'medium' | 'high';

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.5, 40000);
  readonly speedPass: ShaderPass;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private bloomThreshold = 1;
  private bloomBands = { value: 0 };
  private inkPass: InkPass;
  private filmPass: FilmPass;
  /** Moments the film cuts in: time left on an impact frame, and on a painted still (and how long that still runs). */
  private impactT = 0;
  private impactDur = 0.1;
  private lastImpact = -10;
  private stillT = 0;
  private stillDur = 1;
  private stillWait = 0;
  /** Real seconds since the renderer started. */
  private clock = 0;
  /** Whether the look may cut in its moments: only while the player is racing, not behind the menus. */
  moments = false;
  /** The game is paused: a cut in progress waits for it. */
  paused = false;
  private quality: Quality = 'high';
  /** The travellers drawn white on black at a quarter of the size, for the stretch. */
  private travelMask = new THREE.WebGLRenderTarget(320, 180, { depthBuffer: false });
  private travelMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  private clearColor = new THREE.Color();
  private frameTimes: number[] = [];
  private lastScaleChange = 0;
  private scale = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.fog = new THREE.FogExp2(COLORS.fog, 0.00011);

    const size = new THREE.Vector2(canvas.clientWidth || 1280, canvas.clientHeight || 720);
    // Bright things (thrusters, light strips) are drawn brighter than white
    // and bloom picks them out. That needs a float target; where the device
    // cannot render to one, fall back to 8-bit and a lower bloom threshold.
    const ext = this.renderer.extensions;
    const hdr = this.renderer.capabilities.isWebGL2 && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: 4 });
    // The ink pass traces lines from the depth of the frame.
    target.depthTexture = new THREE.DepthTexture(size.x, size.y);
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.speedPass = new ShaderPass(SpeedShader);
    this.speedPass.uniforms.tTravel.value = this.travelMask.texture;
    this.composer.addPass(new DepthTap(this.speedPass.uniforms.tDepth));
    this.inkPass = new InkPass();
    this.composer.addPass(this.inkPass);
    this.bloomThreshold = hdr ? 1.0 : 0.9;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.42, 0.55, this.bloomThreshold);
    this.composer.addPass(this.bloom);
    // The anime look cuts the glow into flat rings, the way it was painted on the cel.
    const comp = this.bloom.compositeMaterial;
    comp.uniforms.uBands = this.bloomBands;
    comp.fragmentShader = comp.fragmentShader.replace('uniform float bloomRadius;', 'uniform float bloomRadius;\nuniform float uBands;').replace(
      'float bloomAlpha =',
      `if (uBands > 0.5) {
        float bl = max(bloom.r, max(bloom.g, bloom.b));
        float q = bl < 0.85 ? step(0.09, bl) * 0.16 + step(0.26, bl) * 0.24 + step(0.55, bl) * 0.32 : bl;
        bloom *= q / max(bl, 1e-4);
      }
      float bloomAlpha =`,
    );
    comp.needsUpdate = true;
    this.composer.addPass(this.speedPass);
    this.filmPass = new FilmPass();
    this.composer.addPass(this.filmPass);
    this.composer.addPass(new OutputPass());
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Fog colour and thickness for a circuit's setting, and the look's ink and grade for it. */
  setTheme(theme: { id: string; fog: number; fogDensity: number }): void {
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.setHex(theme.fog);
    fog.density = theme.fogDensity;
    const pal = LOOK_PALETTES[theme.id] ?? LOOK_PALETTES.meridian;
    (this.inkPass.uniforms.uInkColor.value as THREE.Color).setHex(pal.ink);
    (this.filmPass.uniforms.uInkColor.value as THREE.Color).setHex(pal.ink);
    (this.filmPass.uniforms.uShadowGrade.value as THREE.Color).setRGB(...pal.shadowGrade);
    (this.filmPass.uniforms.uLightGrade.value as THREE.Color).setRGB(...pal.lightGrade);
    (this.filmPass.uniforms.uLift.value as THREE.Color).setRGB(...pal.lift);
  }

  /**
   * Cut to an impact frame for `seconds`, if the look allows: a drawing in
   * negative, then one in two flat tones with the lines in red. No more than
   * one every 1.2 s unless `force`d (a strobe of them would be hard on the
   * eyes, and would stop meaning anything).
   */
  impactFrame(seconds = 0.11, force = false): void {
    if (!look.on || !look.impact || !this.moments) return;
    if (!force && this.clock - this.lastImpact < 1.2) return;
    this.lastImpact = this.clock;
    this.impactT = this.impactDur = seconds;
  }

  /**
   * Lay the frame down as a painted still, pushing in, for `seconds`. It
   * starts once any impact frame has played out.
   */
  paintedStill(seconds: number): void {
    if (!look.on || !look.still || !this.moments) return;
    this.stillT = this.stillDur = seconds;
    this.stillWait = this.impactT;
    this.filmPass.uniforms.uPaperSeed.value = Math.random() * 100;
  }

  /** Whether a painted still (or the impact frame before it) is on screen: the world should hold still. */
  get stillShowing(): boolean {
    return this.stillT > 0;
  }

  /** Whether the ink pass is drawing lines this frame (it needs a depth texture, so not on low quality). */
  get inking(): boolean {
    return look.on && look.ink > 0 && this.quality !== 'low';
  }

  /** End any cut in progress (a new race, or a restart). */
  clearMoments(): void {
    this.impactT = this.stillT = this.stillWait = 0;
  }

  /** The look's passes and settings for this frame. `dt` is real time. */
  private applyLook(rawDt: number): void {
    const dt = this.paused ? 0 : rawDt;
    const on = look.on;
    const ink = this.inkPass.uniforms;
    const film = this.filmPass.uniforms;
    // The plain look has no moments of its own: switching mid-cut ends the cut.
    if (!on) this.impactT = this.stillT = this.stillWait = 0;
    this.inkPass.enabled = this.inking;
    this.filmPass.enabled = on || this.impactT > 0 || this.stillT > 0;
    if (this.inkPass.enabled) {
      ink.uInk.value = look.ink;
      ink.uBoil.value = look.boil;
      if (drawClock.fresh) ink.uSeed.value = (drawClock.drawing % 97) * 1.37 * Math.min(1, look.boil);
      ink.uNear.value = this.camera.near;
      ink.uFar.value = this.camera.far;
    }
    film.uFilm.value = on ? look.film : 0;
    if (drawClock.filmFresh) {
      film.uGrainSeed.value = (drawClock.film % 61) * 7.13;
      const w = 0.00035 * look.film * Math.min(1, look.boil);
      (film.uWeave.value as THREE.Vector2).set((Math.random() - 0.5) * w, (Math.random() - 0.5) * w);
    }
    // Moments: the impact frame cuts in hard and out hard, negative first;
    // the still follows it and eases out at the end.
    this.clock += dt;
    film.uImpact.value = this.impactT > 0 ? (this.impactT > this.impactDur * 0.5 ? 2 : 1) : 0;
    this.impactT = Math.max(0, this.impactT - dt);
    const left = this.stillT;
    const showing = left > 0 && this.stillWait <= 0;
    film.uStill.value = showing ? Math.min(1, left / 0.12) : 0;
    film.uStillZoom.value = showing ? 0.07 * (1 - left / this.stillDur) : 0;
    this.speedPass.uniforms.uHold.value = showing ? 1 : 0;
    if (this.stillWait > 0) this.stillWait -= dt;
    else this.stillT = Math.max(0, this.stillT - dt);
    // Only what is meant to glow blooms: a lit surface keeps its flat colour.
    this.bloom.threshold = on ? this.bloomThreshold + 0.3 : this.bloomThreshold;
    this.bloomBands.value = on ? 1 : 0;
    // Speed is drawn as well as blurred.
    this.speedPass.uniforms.uDrawn.value = on ? 1 : 0;
    this.speedPass.uniforms.uNear.value = this.camera.near;
    this.speedPass.uniforms.uFar.value = this.camera.far;
    if (drawClock.fresh) this.speedPass.uniforms.uLineSeed.value = drawClock.drawing % 89;
  }

  /** Bloom strength, from the tuning panel. */
  setBloom(strength: number): void {
    this.bloom.strength = strength;
  }

  setQuality(q: Quality): void {
    this.quality = q;
    this.bloom.enabled = q !== 'low';
    this.resize();
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const maxRatio = this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1;
    const ratio = Math.min(window.devicePixelRatio || 1, maxRatio) * this.scale;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.speedPass.uniforms.uAspect.value = w / h;
    this.travelMask.setSize(Math.max(1, Math.round((w * ratio) / 4)), Math.max(1, Math.round((h * ratio) / 4)));
    const pw = Math.round(w * ratio);
    const ph = Math.round(h * ratio);
    (this.inkPass.uniforms.uRes.value as THREE.Vector2).set(pw, ph);
    (this.filmPass.uniforms.uRes.value as THREE.Vector2).set(pw, ph);
  }

  /** Drop resolution a notch if frames run long, raise it again when there is headroom. */
  private adapt(dt: number, now: number): void {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 45) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (now - this.lastScaleChange < 3) return;
    if (avg > 1 / 45 && this.scale > 0.55) {
      this.scale = Math.max(0.55, this.scale - 0.15);
      this.lastScaleChange = now;
      this.resize();
    } else if (avg < 1 / 58 && this.scale < 1) {
      this.scale = Math.min(1, this.scale + 0.1);
      this.lastScaleChange = now;
      this.resize();
    }
  }

  render(dt: number, now: number): void {
    this.adapt(dt, now);
    this.applyLook(dt);
    this.speedPass.uniforms.uTime.value = now;
    if (this.speedPass.uniforms.uTravel.value > 0.001) this.drawTravellers();
    this.composer.render(dt);
  }

  /** The mask of what travels with the camera: the mechs alone, flat white. */
  private drawTravellers(): void {
    const r = this.renderer;
    const cam = this.camera;
    const layers = cam.layers.mask;
    const override = this.scene.overrideMaterial;
    r.getClearColor(this.clearColor);
    const alpha = r.getClearAlpha();
    cam.layers.set(TRAVELLER_LAYER);
    this.scene.overrideMaterial = this.travelMat;
    r.setRenderTarget(this.travelMask);
    r.setClearColor(0x000000, 1);
    r.clear(true, false, false);
    r.render(this.scene, cam);
    r.setRenderTarget(null);
    r.setClearColor(this.clearColor, alpha);
    this.scene.overrideMaterial = override;
    cam.layers.mask = layers;
  }
}
