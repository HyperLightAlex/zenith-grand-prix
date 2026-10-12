// WebGL renderer plus the post-processing chain: bloom, then a "speed" pass
// (radial blur, streaks, vignette, impact flash), then tone-mapped output.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { COLORS } from './palette';

const SpeedShader = {
  name: 'SpeedShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSpeed: { value: 0 }, // 0..1 radial blur and streak strength
    uBoost: { value: 0 },
    uFlash: { value: 0 }, // white impact flash
    uHurt: { value: 0 }, // red edge when hit
    uBlurK: { value: 1 }, // tuning multipliers
    uLineK: { value: 1 },
    uTint: { value: new THREE.Vector3(1, 1, 1) }, // colour of the speed lines
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uFocus: { value: new THREE.Vector2(0.5, 0.5) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSpeed, uBoost, uFlash, uHurt, uTime, uAspect, uBlurK, uLineK;
    uniform vec2 uFocus;
    uniform vec3 uTint;
    varying vec2 vUv;
    float hash(float n) { return fract(sin(n) * 43758.5453); }
    void main() {
      vec2 to = vUv - uFocus;
      vec2 asp = vec2(to.x * uAspect, to.y);
      float r = length(asp);
      // Radial blur that grows toward the edges of the frame.
      float amt = (uSpeed * 0.04 + uBoost * 0.05) * uBlurK * smoothstep(0.12, 0.85, r);
      vec3 col = vec3(0.0);
      float tw = 0.0;
      for (int i = 0; i < 8; i++) {
        float t = float(i) / 7.0;
        float w = 1.0 - t * 0.6;
        col += texture2D(tDiffuse, vUv - to * amt * t).rgb * w;
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
      col += uTint * line * (uSpeed * 0.12 + uBoost * 0.35) * uLineK;
      // Vignette, hurt tint, flash.
      float vig = smoothstep(0.55, 1.15, r);
      col *= 1.0 - vig * (0.22 + uSpeed * 0.12);
      col = mix(col, vec3(1.0, 0.12, 0.16), vig * uHurt * 0.55);
      col = mix(col, vec3(1.0), uFlash);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export type Quality = 'low' | 'medium' | 'high';

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.5, 40000);
  readonly speedPass: ShaderPass;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private quality: Quality = 'high';
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
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.42, 0.55, hdr ? 1.0 : 0.9);
    this.composer.addPass(this.bloom);
    this.speedPass = new ShaderPass(SpeedShader);
    this.composer.addPass(this.speedPass);
    this.composer.addPass(new OutputPass());
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Fog colour and thickness for a circuit's setting. */
  setTheme(theme: { fog: number; fogDensity: number }): void {
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.setHex(theme.fog);
    fog.density = theme.fogDensity;
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
    this.speedPass.uniforms.uTime.value = now;
    this.composer.render(dt);
  }
}
