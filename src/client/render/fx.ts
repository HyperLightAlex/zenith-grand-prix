// Effects: sparks, smoke, impact flashes, tracers, light trails, blob
// shadows, lock rings and guard shields. Everything is pooled; nothing here
// allocates during a race.
import * as THREE from 'three';
import { drawClock, look } from './look';
import { COLORS } from './palette';
import { SpriteFx, type SpriteKind, type SpriteOptions } from './sprites';

const _v = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Point particles (sparks are additive, smoke is alpha blended)
// ---------------------------------------------------------------------------

class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private aux: Float32Array; // size, alpha
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private baseSize: Float32Array;
  private drag: Float32Array;
  private grav: Float32Array;
  private rgb: Float32Array;
  private next = 0;
  private live = 0;

  constructor(readonly cap: number, additive: boolean) {
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.aux = new Float32Array(cap * 2);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap).fill(1);
    this.baseSize = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.rgb = new Float32Array(cap * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aux', new THREE.BufferAttribute(this.aux, 2).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 }, uDrawn: { value: 0 }, uSeed: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec2 aux;
        uniform float uScale;
        uniform float uSeed;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vSeed;
        void main() {
          vColor = color;
          vAlpha = aux.y;
          // A different turn for each particle on each drawing.
          vSeed = fract(sin(float(gl_VertexID) * 12.9898 + uSeed * 78.233) * 43758.5453);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aux.x * uScale / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: additive
        ? /* glsl */ `
        uniform float uDrawn;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vSeed;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          if (uDrawn > 0.5) {
            // A drawn spark: a four-pointed star, a white core in a coloured
            // body, hard-edged, turned a new way on every drawing.
            float a = vSeed * 6.28318;
            p = mat2(cos(a), -sin(a), sin(a), cos(a)) * p;
            vec2 q = abs(p) * 1.05;
            float star = pow(q.x, 0.55) + pow(q.y, 0.55);
            float aa = fwidth(star) * 0.8 + 0.02;
            float body = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, star);
            if (body <= 0.0 || vAlpha <= 0.0) discard;
            float core = 1.0 - smoothstep(0.58 - aa, 0.58 + aa, star);
            vec3 col = mix(vColor * 1.7, vec3(2.4), core);
            gl_FragColor = vec4(col * body, body);
            return;
          }
          float d = dot(p, p);
          if (d > 1.0) discard;
          float a = (1.0 - d) * vAlpha;
          gl_FragColor = vec4(vColor * a * 1.8, a);
        }`
        : /* glsl */ `
        uniform float uDrawn;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vSeed;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          if (uDrawn > 0.5) {
            // Drawn smoke: a lumpy puff in two flat tones that breaks up into
            // holes as it goes, redrawn on every drawing.
            float d = length(p);
            float ang = atan(p.y, p.x);
            float r = 0.8 + 0.1 * sin(ang * 5.0 + vSeed * 6.28) + 0.06 * sin(ang * 9.0 - vSeed * 12.0);
            float aa = fwidth(d) + 0.01;
            float inside = 1.0 - smoothstep(r - aa, r + aa, d);
            float n = 0.5 + 0.25 * sin(p.x * 7.0 + vSeed * 5.0) * sin(p.y * 6.0 - vSeed * 3.0) + 0.25 * sin((p.x + p.y) * 4.0 + vSeed * 9.0);
            inside *= step(1.0 - vAlpha * 1.2, n);
            if (inside < 0.01) discard;
            float shade = smoothstep(0.1 - aa, 0.1 + aa, dot(p, vec2(0.55, 0.62)));
            gl_FragColor = vec4(vColor * mix(1.3, 0.72, shade), inside * 0.95);
            return;
          }
          float d = dot(p, p);
          if (d > 1.0) discard;
          gl_FragColor = vec4(vColor, (1.0 - d) * vAlpha);
        }`,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 4;
  }

  setScale(pixelsPerUnitAtOne: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = pixelsPerUnitAtOne;
  }

  emit(p: THREE.Vector3, vx: number, vy: number, vz: number, color: THREE.Color, size: number, life: number, drag: number, gravity: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.rgb[i * 3] = color.r;
    this.rgb[i * 3 + 1] = color.g;
    this.rgb[i * 3 + 2] = color.b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.baseSize[i] = size;
    this.drag[i] = drag;
    this.grav[i] = gravity;
    // Shown at once, not on the next drawing.
    this.aux[i * 2] = size;
    this.aux[i * 2 + 1] = 1;
    this.col[i * 3] = color.r;
    this.col[i * 3 + 1] = color.g;
    this.col[i * 3 + 2] = color.b;
    this.live = Math.max(this.live, 1);
  }

  /** Drawn (the anime look) or soft, and the seed for this drawing. */
  setDrawn(on: boolean, seed: number): void {
    const u = (this.points.material as THREE.ShaderMaterial).uniforms;
    u.uDrawn.value = on ? 1 : 0;
    u.uSeed.value = seed;
  }

  /**
   * Move every particle on (always, so they travel smoothly with the camera)
   * and, when `fresh`, draw them again: their size, colour and fade change
   * only then. Drawn particles shrink away rather than fading.
   */
  update(dt: number, growth: number, fresh = true, drawn = false): void {
    let any = false;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) {
        this.aux[i * 2 + 1] = 0;
        continue;
      }
      any = true;
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= dr;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.life[i] <= 0) {
        this.aux[i * 2 + 1] = 0;
        continue;
      }
      if (!fresh) continue;
      this.col[i * 3] = this.rgb[i * 3];
      this.col[i * 3 + 1] = this.rgb[i * 3 + 1];
      this.col[i * 3 + 2] = this.rgb[i * 3 + 2];
      const size = this.baseSize[i] * (1 + (1 - k) * growth);
      this.aux[i * 2] = drawn && growth === 0 ? size * (0.35 + 0.65 * k) * 1.25 : size;
      this.aux[i * 2 + 1] = k;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.aux.needsUpdate = true;
    this.points.visible = any;
  }
}

// ---------------------------------------------------------------------------
// Impact flashes: camera-facing starbursts
// ---------------------------------------------------------------------------

function starTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // Hard manga-style spikes.
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.translate(64, 64);
  for (let i = 0; i < 8; i++) {
    g.rotate(Math.PI / 4);
    const len = i % 2 === 0 ? 62 : 36;
    g.beginPath();
    g.moveTo(-3.2, 0);
    g.lineTo(0, -len);
    g.lineTo(3.2, 0);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The anime look's impact star: a hard, ragged burst of spikes in two values, no glow. */
function drawnStarTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  const burst = (spikes: number, outer: number, inner: number, jitter: number, seed: number, fill: string) => {
    let r = seed;
    const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    g.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const len = i % 2 === 0 ? outer * (1 - jitter + rnd() * jitter) : inner * (0.85 + rnd() * 0.3);
      const x = 64 + Math.cos(a) * len;
      const y = 64 + Math.sin(a) * len;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  burst(13, 62, 26, 0.45, 7, 'rgba(105,105,105,1)');
  burst(9, 40, 17, 0.35, 19, 'rgba(255,255,255,1)');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The anime look's blade arc: a hard crescent, white at its edge, tapering to points. */
function drawnSlashTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 32;
  const g = c.getContext('2d')!;
  const crescent = (depth: number, fill: string) => {
    g.beginPath();
    g.moveTo(0, 32);
    for (let i = 0; i <= 32; i++) {
      const u = i / 32;
      g.lineTo(u * 256, 32 - depth * Math.sin(Math.PI * Math.pow(u, 0.8)));
    }
    g.lineTo(256, 32);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  crescent(30, 'rgba(160,160,160,1)');
  crescent(12, 'rgba(255,255,255,1)');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ringTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 7;
  g.beginPath();
  g.arc(64, 64, 54, 0, Math.PI * 2);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The wind-up tell: a ring with four notches pointing in, like closing sights. */
function tellTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.fillStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    g.beginPath();
    g.moveTo(64 + ca * 40, 64 + sa * 40);
    g.lineTo(64 + ca * 60 - sa * 9, 64 + sa * 60 + ca * 9);
    g.lineTo(64 + ca * 60 + sa * 9, 64 + sa * 60 - ca * 9);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A wind-up tell in flight: one ring per blow, keyed so it closes smoothly from frame to frame. */
interface TellRing {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  key: number;
  /** The frame it was last asked for; anything older is hidden. */
  seen: number;
  /** Ticks to impact when first shown, so the ring closes over the whole wind-up. */
  total: number;
}

/** A blade arc: a crescent of light swept round a mech for a moment. */
interface Slash {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  /** -1 for a backhand cut (mirrored), else 1. */
  flip: number;
  size: number;
}

function slashTexture(): THREE.CanvasTexture {
  // Bright along the outer edge, fading inward and toward both ends.
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 32;
  const g = c.getContext('2d')!;
  const along = g.createLinearGradient(0, 0, 256, 0);
  along.addColorStop(0, 'rgba(255,255,255,0)');
  along.addColorStop(0.35, 'rgba(255,255,255,0.9)');
  along.addColorStop(0.75, 'rgba(255,255,255,1)');
  along.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = along;
  g.fillRect(0, 0, 256, 32);
  g.globalCompositeOperation = 'destination-in';
  const across = g.createLinearGradient(0, 0, 0, 32);
  across.addColorStop(0, 'rgba(255,255,255,0)');
  across.addColorStop(0.7, 'rgba(255,255,255,0.7)');
  across.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = across;
  g.fillRect(0, 0, 256, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Flash {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  from: number;
  to: number;
  follow: THREE.Object3D | null;
  offset: THREE.Vector3;
  spin: number;
}

// ---------------------------------------------------------------------------
// Light trails behind the skates
// ---------------------------------------------------------------------------

const TRAIL_POINTS = 26;

export class Trail {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private col: Float32Array;
  private pts: Float32Array; // x,y,z, rx,ry,rz per point
  private count = 0;
  private color: THREE.Color;

  constructor(color: number) {
    this.color = new THREE.Color(color);
    this.pos = new Float32Array(TRAIL_POINTS * 2 * 3);
    this.col = new Float32Array(TRAIL_POINTS * 2 * 3);
    this.pts = new Float32Array(TRAIL_POINTS * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL_POINTS - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  reset(): void {
    this.count = 0;
  }

  setColor(color: THREE.Color): void {
    this.color.copy(color);
  }

  /** `head` is the heel position, `right` the across-road direction there. */
  update(head: THREE.Vector3, right: THREE.Vector3, intensity: number, width: number): void {
    const p = this.pts;
    if (this.count === 0) {
      for (let i = 0; i < TRAIL_POINTS; i++) {
        p[i * 6] = head.x;
        p[i * 6 + 1] = head.y;
        p[i * 6 + 2] = head.z;
        p[i * 6 + 3] = right.x;
        p[i * 6 + 4] = right.y;
        p[i * 6 + 5] = right.z;
      }
      this.count = TRAIL_POINTS;
    }
    // Drop a new point once the head has moved far enough from the last one.
    const dx = head.x - p[6];
    const dy = head.y - p[7];
    const dz = head.z - p[8];
    if (dx * dx + dy * dy + dz * dz > 2.2 * 2.2) {
      p.copyWithin(6, 0, (TRAIL_POINTS - 1) * 6);
    }
    p[0] = head.x;
    p[1] = head.y;
    p[2] = head.z;
    p[3] = right.x;
    p[4] = right.y;
    p[5] = right.z;
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const k = 1 - i / (TRAIL_POINTS - 1);
      const w = width * (0.35 + 0.65 * k);
      const o = i * 6;
      const v = i * 6;
      this.pos[v] = p[o] - p[o + 3] * w;
      this.pos[v + 1] = p[o + 1] - p[o + 4] * w;
      this.pos[v + 2] = p[o + 2] - p[o + 5] * w;
      this.pos[v + 3] = p[o] + p[o + 3] * w;
      this.pos[v + 4] = p[o + 1] + p[o + 4] * w;
      this.pos[v + 5] = p[o + 2] + p[o + 5] * w;
      // Drawn (the anime look), the trail is laid in flat bands of light.
      const a = (look.on ? (k > 0.62 ? 1 : k > 0.3 ? 0.5 : k > 0.08 ? 0.2 : 0) : k * k) * intensity;
      for (let j = 0; j < 2; j++) {
        this.col[v + j * 3] = this.color.r * a;
        this.col[v + j * 3 + 1] = this.color.g * a;
        this.col[v + j * 3 + 2] = this.color.b * a;
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
    this.mesh.visible = intensity > 0.02;
  }
}

// ---------------------------------------------------------------------------
// The effects manager
// ---------------------------------------------------------------------------

const MAX_TRACERS = 48;

export class Fx {
  readonly group = new THREE.Group();
  readonly sparks = new Particles(1400, true);
  readonly smoke = new Particles(260, false);
  private flashes: Flash[] = [];
  /** The anime look's drawn effects, from painted sheets. */
  readonly sprites = new SpriteFx();
  private slashes: Slash[] = [];
  private tells: TellRing[] = [];
  private tellFrame = 1;
  private tellTex = tellTexture();
  private star = starTexture();
  private ring = ringTexture();
  private slashTex = slashTexture();
  private drawnStar = drawnStarTexture();
  private drawnSlash = drawnSlashTexture();
  /** The anime look: effects drawn rather than glowing, and changed only on each new drawing. */
  private drawn = false;
  private tracers: THREE.InstancedMesh;
  private tracerCount = 0;
  private tmpColor = new THREE.Color();
  private white = new THREE.Color(1, 1, 1);

  constructor() {
    this.group.add(this.sparks.points, this.smoke.points);
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: this.star, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.visible = false;
      mesh.renderOrder = 8;
      this.group.add(mesh);
      this.flashes.push({ mesh, mat, life: 0, maxLife: 1, from: 1, to: 1, follow: null, offset: new THREE.Vector3(), spin: 0 });
    }
    // Blade arcs: a ring sector around the mech's forward direction (+Z in
    // its own space), with texture u running along the sweep.
    for (let i = 0; i < 8; i++) {
      const arc = 1.25;
      const geo = new THREE.RingGeometry(2.6, 7, 24, 1, -Math.PI / 2 - arc, arc * 2);
      geo.rotateX(-Math.PI / 2);
      // Map u along the sweep, v across it (inner to outer).
      const pos = geo.attributes.position;
      const uv = geo.attributes.uv;
      for (let k = 0; k < pos.count; k++) {
        const x = pos.getX(k);
        const z = pos.getZ(k);
        const r = Math.hypot(x, z);
        const a = Math.atan2(x, z); // -arc..arc around +Z
        uv.setXY(k, (a + arc) / (arc * 2), (r - 2.6) / 4.4);
      }
      const mat = new THREE.MeshBasicMaterial({ map: this.slashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 7;
      this.slashes.push({ mesh, mat, life: 0, maxLife: 1, flip: 1, size: 1 });
    }

    // Wind-up tells. Drawn over everything: they are a reading aid, and the
    // mech winding up is often half behind the one it is about to hit.
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: this.tellTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.visible = false;
      mesh.renderOrder = 9;
      this.group.add(mesh);
      this.tells.push({ mesh, mat, key: -1, seen: 0, total: 1 });
    }

    this.group.add(this.sprites.group);
    this.sprites.preload();

    const tg = new THREE.BoxGeometry(0.22, 0.22, 1);
    tg.translate(0, 0, -0.5);
    this.tracers = new THREE.InstancedMesh(tg, new THREE.MeshBasicMaterial({ toneMapped: false }), MAX_TRACERS);
    this.tracers.frustumCulled = false;
    this.tracers.count = 0;
    this.tracers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TRACERS * 3), 3);
    this.group.add(this.tracers);
  }

  resize(viewportHeight: number, fovDeg: number): void {
    const scale = viewportHeight / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.sparks.setScale(scale);
    this.smoke.setScale(scale);
  }

  /** Free what this effects set made for itself. Geometries are freed by the owner's traversal. */
  dispose(): void {
    (this.sparks.points.material as THREE.Material).dispose();
    (this.smoke.points.material as THREE.Material).dispose();
    for (const f of this.flashes) f.mat.dispose();
    this.sprites.dispose();
    for (const t of this.tells) t.mat.dispose();
    this.tellTex.dispose();
    for (const s of this.slashes) {
      s.mesh.removeFromParent();
      s.mesh.geometry.dispose();
      s.mat.dispose();
    }
    this.slashTex.dispose();
    this.drawnSlash.dispose();
    this.drawnStar.dispose();
    this.star.dispose();
    this.ring.dispose();
    (this.tracers.material as THREE.Material).dispose();
    this.tracers.dispose();
  }

  /** Shower of sparks. `base` is the velocity of whatever they come off. */
  burst(at: THREE.Vector3, base: THREE.Vector3, count: number, speed: number, color: THREE.Color | number, size = 0.5, life = 0.45): void {
    const c = typeof color === 'number' ? this.tmpColor.set(color) : color;
    for (let i = 0; i < count; i++) {
      // Random direction, biased upward.
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const sp = speed * (0.35 + Math.random() * 0.9);
      this.sparks.emit(
        at,
        base.x * 0.92 + r * Math.cos(th) * sp,
        base.y * 0.92 + Math.abs(u) * sp * 0.8 + sp * 0.15,
        base.z * 0.92 + r * Math.sin(th) * sp,
        Math.random() < 0.3 ? this.white : c,
        size * (0.5 + Math.random()),
        life * (0.5 + Math.random() * 0.9),
        2.2,
        22,
      );
    }
  }

  /** Sparks thrown mostly along one direction (wall scrapes, wheel sparks). */
  spray(at: THREE.Vector3, base: THREE.Vector3, dir: THREE.Vector3, count: number, speed: number, color: number, size = 0.35, life = 0.35): void {
    this.tmpColor.set(color);
    for (let i = 0; i < count; i++) {
      const sp = speed * (0.4 + Math.random());
      this.sparks.emit(
        at,
        base.x + dir.x * sp + (Math.random() - 0.5) * speed * 0.5,
        base.y + dir.y * sp + Math.random() * speed * 0.35,
        base.z + dir.z * sp + (Math.random() - 0.5) * speed * 0.5,
        this.tmpColor,
        size * (0.5 + Math.random()),
        life * (0.5 + Math.random()),
        1.6,
        26,
      );
    }
  }

  puff(at: THREE.Vector3, base: THREE.Vector3, count: number, color: number, size = 2.2, life = 1.2): void {
    this.tmpColor.set(color);
    for (let i = 0; i < count; i++) {
      this.smoke.emit(at, base.x + (Math.random() - 0.5) * 6, base.y + 3 + Math.random() * 6, base.z + (Math.random() - 0.5) * 6, this.tmpColor, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.8), 1.4, -2);
    }
  }

  /**
   * A blade arc round a mech: attached to `parent` (the mech's root, which
   * faces +Z), at chest height, tilted by `tilt` radians for a rising or
   * falling cut.
   */
  slash(parent: THREE.Object3D, color: number, heavy: boolean, tilt: number, flip: boolean): void {
    let s = this.slashes[0];
    for (const c of this.slashes) {
      if (c.life <= 0) {
        s = c;
        break;
      }
      if (c.life < s.life) s = c;
    }
    if (s.mesh.parent !== parent) parent.add(s.mesh);
    s.life = s.maxLife = heavy ? 0.24 : 0.16;
    s.mat.color.set(color).multiplyScalar(heavy ? 2.4 : 1.8);
    s.mesh.position.set(0, heavy ? 4.4 : 4.8, 0.4);
    s.mesh.rotation.set(0, 0, tilt);
    s.flip = flip ? -1 : 1;
    s.size = heavy ? 1.15 : 1;
    s.mesh.scale.set(s.flip * 0.9 * s.size, 1, 0.9 * s.size);
    s.mesh.visible = true;
  }

  /** Starburst. Follows `follow` (plus an offset) if given, so it stays on a moving mech. */
  flash(at: THREE.Vector3, size: number, color: number, life = 0.16, follow: THREE.Object3D | null = null, ring = false): void {
    // Drawn, a ring is the painted shock ring (its drawing peaks at about
    // the size the plain ring grows to).
    if (ring && this.drawn) {
      this.sprites.spawn('ring', at, size * 0.95, { tint: color, follow, gain: 1.3, roll: Math.random() * Math.PI * 2 });
      return;
    }
    let f = this.flashes[0];
    for (const c of this.flashes) {
      if (c.life <= 0) {
        f = c;
        break;
      }
      if (c.life < f.life) f = c;
    }
    f.life = life;
    f.maxLife = life;
    // A drawn burst is solid all the way out, so it is drawn smaller than a glow.
    const k = this.drawn && !ring ? 0.55 : 1;
    f.from = (ring ? size * 0.3 : size * 0.55) * k;
    f.to = (ring ? size * 1.6 : size * 1.25) * k;
    f.mat.map = ring ? this.ring : this.drawn ? this.drawnStar : this.star;
    f.mat.color.set(color);
    f.follow = follow;
    if (follow) {
      follow.getWorldPosition(_v);
      f.offset.copy(at).sub(_v);
    } else {
      f.offset.copy(at);
    }
    f.spin = Math.random() * Math.PI;
    f.mesh.visible = true;
  }

  /**
   * The drawn knockout explosion, `size` units across, at `at`, carried along
   * by `base` (the velocity of what blew up) as it slows. Returns false (and
   * does nothing) unless the anime look is on: the plain look keeps its own.
   */
  explosion(at: THREE.Vector3, base: THREE.Vector3, size: number): boolean {
    if (!this.drawn) return false;
    this.sprites.spawn('explosion', at, size, { vel: base, gain: 1.45 });
    return true;
  }

  /**
   * Move any explosion that has only just started on to drawing `frame`: a
   * painted still of a knockout is of the fireball, not the flash before it.
   */
  skipExplosionsTo(frame: number): void {
    this.sprites.skip('explosion', frame);
  }

  /**
   * A drawn effect from the painted sheets, if the anime look is on. Returns
   * whether it drew one (so the caller can leave out the plain look's).
   */
  drawnSprite(kind: SpriteKind, at: THREE.Vector3, size: number, o?: SpriteOptions): boolean {
    if (!this.drawn) return false;
    this.sprites.spawn(kind, at, size, o);
    return true;
  }

  /**
   * A wind-up tell for one heavy blow: a notched ring round the attacker
   * that closes as the blow comes and meets the body as it lands. `left` is
   * ticks to impact (fractional, for a smooth close), `now` lights it white
   * for the moment a guard would parry, `strong` is for a blow aimed at the
   * player. Call it every frame the blow is coming; returns true on the
   * first frame, for the glint and the warning sound.
   */
  tell(key: number, at: THREE.Vector3, size: number, color: number, left: number, now: boolean, strong: boolean): boolean {
    let r = this.tells.find((t) => t.key === key);
    let fresh = false;
    if (!r) {
      r = this.tells[0];
      for (const t of this.tells) {
        if (t.seen < this.tellFrame - 1) {
          r = t;
          break;
        }
        if (t.seen < r.seen) r = t;
      }
      r.key = key;
      r.total = Math.max(1, left);
      fresh = true;
    }
    r.seen = this.tellFrame;
    const k = 1 - Math.min(1, Math.max(0, left / r.total)); // 0 when it starts, 1 at impact
    r.mesh.position.copy(at);
    r.mesh.scale.setScalar(size * (1 + 1.7 * (1 - k) * (1 - k)));
    r.mat.color.set(color);
    if (now) r.mat.color.lerp(this.white, 0.65);
    r.mat.color.multiplyScalar(strong ? 2.2 : 1.1);
    r.mat.opacity = (strong ? 1 : 0.5) * (0.35 + 0.65 * k);
    r.mesh.visible = true;
    return fresh;
  }

  beginTracers(): void {
    this.tracerCount = 0;
  }

  /** One tracer: matrix places a unit bolt pointing along +z from its tip. */
  tracer(matrix: THREE.Matrix4, length: number, color: number): void {
    if (this.tracerCount >= MAX_TRACERS) return;
    _m.copy(matrix).scale(_s.set(1, 1, length));
    this.tracers.setMatrixAt(this.tracerCount, _m);
    this.tracers.setColorAt(this.tracerCount, this.tmpColor.set(color).multiplyScalar(2.2));
    this.tracerCount++;
  }

  endTracers(): void {
    this.tracers.count = this.tracerCount;
    this.tracers.instanceMatrix.needsUpdate = true;
    if (this.tracers.instanceColor) this.tracers.instanceColor.needsUpdate = true;
  }

  update(dt: number, camera: THREE.Camera): void {
    // In the anime look the effects are drawn on twos: they move every frame,
    // but their shapes change only when a new drawing comes round. The tells
    // stay smooth: they are for timing a parry.
    const drawn = look.on;
    if (drawn !== this.drawn) {
      this.drawn = drawn;
      for (const s of this.slashes) s.mat.map = drawn ? this.drawnSlash : this.slashTex;
      for (const f of this.flashes) if (f.mat.map !== this.ring) f.mat.map = drawn ? this.drawnStar : this.star;
    }
    const fresh = !drawn || drawClock.fresh;
    this.sparks.setDrawn(drawn, drawClock.drawing % 113);
    this.smoke.setDrawn(drawn, drawClock.drawing % 113);
    for (const t of this.tells) {
      if (t.seen !== this.tellFrame) {
        t.mesh.visible = false;
        t.key = -1;
        continue;
      }
      t.mesh.quaternion.copy(camera.quaternion);
    }
    this.tellFrame++;
    for (const s of this.slashes) {
      if (s.life <= 0) {
        s.mesh.visible = false;
        continue;
      }
      s.life -= dt;
      if (!fresh) continue;
      const k = 1 - Math.max(0, s.life / s.maxLife);
      // Drawn, it holds full strength and is gone; otherwise it fades.
      s.mat.opacity = drawn ? (k < 0.75 ? 1 : 0.5) : 1 - k * k;
      // A quick sweep outwards as it fades.
      const grow = (0.9 + 0.2 * k) * s.size;
      s.mesh.scale.set(s.flip * grow, 1, grow);
    }
    this.sparks.update(dt, 0, fresh, drawn);
    this.smoke.update(dt, 2.2, fresh, drawn);
    if (drawn) this.sprites.update(dt, camera);
    else this.sprites.clear();
    for (const f of this.flashes) {
      if (f.life <= 0) {
        f.mesh.visible = false;
        continue;
      }
      f.life -= dt;
      if (fresh) {
        const k = 1 - Math.max(0, f.life / f.maxLife);
        const s = f.from + (f.to - f.from) * (1 - (1 - k) * (1 - k));
        f.mesh.scale.setScalar(s);
        f.mat.opacity = drawn ? (k < 0.6 ? 0.8 : 0.35) : (1 - k * k) * 0.8;
        // Drawn, each new drawing of the burst is turned a new way.
        if (drawn) f.spin = Math.random() * Math.PI * 2;
      }
      if (f.follow) {
        f.follow.getWorldPosition(_v);
        f.mesh.position.copy(_v).add(f.offset);
      } else {
        f.mesh.position.copy(f.offset);
      }
      f.mesh.quaternion.copy(camera.quaternion);
      f.mesh.rotateZ(f.spin);
    }
  }
}

const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Per-mech attachments
// ---------------------------------------------------------------------------

let shadowTex: THREE.CanvasTexture | null = null;
let drawnShadowTex: THREE.CanvasTexture | null = null;

/** The blob shadow under a mech: soft, or (the anime look) a flat painted shape with a hard edge. */
export function shadowTexture(drawn: boolean): THREE.CanvasTexture {
  if (drawn) {
    if (!drawnShadowTex) {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const g = c.getContext('2d')!;
      g.fillStyle = 'rgba(14,10,34,0.5)';
      g.beginPath();
      g.ellipse(32, 32, 28, 28, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(14,10,34,0.62)';
      g.beginPath();
      g.ellipse(30, 30, 17, 19, 0, 0, Math.PI * 2);
      g.fill();
      drawnShadowTex = new THREE.CanvasTexture(c);
    }
    return drawnShadowTex;
  }
  if (!shadowTex) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    grad.addColorStop(0, 'rgba(8,12,24,0.62)');
    grad.addColorStop(0.55, 'rgba(8,12,24,0.42)');
    grad.addColorStop(1, 'rgba(8,12,24,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    shadowTex = new THREE.CanvasTexture(c);
  }
  return shadowTex;
}

export function makeShadow(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: shadowTexture(false), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  mesh.renderOrder = 1;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/** Ring painted on the road around a locked target. */
export function makeLockRing(): THREE.Mesh {
  const geo = new THREE.RingGeometry(0.82, 1, 40, 1);
  geo.rotateX(-Math.PI / 2);
  // Break the ring into four arcs.
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: COLORS.accent, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  mesh.renderOrder = 2;
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  return mesh;
}

const shieldVertex = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vP = position;
    gl_Position = projectionMatrix * mv;
  }`;

const shieldFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPower, uTime;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vP;
  void main() {
    float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
    // Hex-ish lattice from three sets of stripes.
    vec2 p = vP.xy * 1.4 + vec2(0.0, uTime * 0.6);
    float l = max(max(abs(sin(p.x * 2.0)), abs(sin(p.x + p.y * 1.73))), abs(sin(p.x - p.y * 1.73)));
    float grid = smoothstep(0.93, 1.0, l);
    float a = (0.05 + fres * 0.45 + grid * 0.4) * uPower;
    gl_FragColor = vec4(uColor * a * 1.5, a);
  }`;

function shieldMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uPower: { value: 0 }, uTime: { value: 0 } },
    vertexShader: shieldVertex,
    fragmentShader: shieldFragment,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** Curved energy shield shown while a mech guards (and, in amber, while it rams). */
export function makeShield(color: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(4.2, 10, 8, Math.PI * 0.24, Math.PI * 0.52, Math.PI * 0.22, Math.PI * 0.5);
  const mesh = new THREE.Mesh(geo, shieldMaterial(color));
  mesh.position.set(0, 4.2, 0.6);
  mesh.visible = false;
  mesh.renderOrder = 7;
  return mesh;
}

/** The Aegis: a full bubble around a shielded mech. */
export function makeBubble(color: number, radius: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 12), shieldMaterial(color));
  mesh.position.set(0, radius * 0.78, 0);
  mesh.scale.set(1, 1.08, 1);
  mesh.visible = false;
  mesh.renderOrder = 7;
  return mesh;
}

/** A hoop that rides up and down a snared mech. */
export function makeSnareRing(color: number): THREE.Mesh {
  const geo = new THREE.TorusGeometry(1, 0.07, 6, 28);
  geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.8), toneMapped: false, transparent: true, opacity: 0.95, depthWrite: false }));
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  mesh.renderOrder = 7;
  return mesh;
}
