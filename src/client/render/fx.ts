// Effects: sparks, smoke, impact flashes, tracers, light trails, blob
// shadows, lock rings and guard shields. Everything is pooled; nothing here
// allocates during a race.
import * as THREE from 'three';
import { COLORS } from './palette';

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
      uniforms: { uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute vec2 aux;
        uniform float uScale;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          vAlpha = aux.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aux.x * uScale / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: additive
        ? /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float d = dot(p, p);
          if (d > 1.0) discard;
          float a = (1.0 - d) * vAlpha;
          gl_FragColor = vec4(vColor * a * 1.8, a);
        }`
        : /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
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
    this.live = Math.max(this.live, 1);
  }

  update(dt: number, growth: number): void {
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
      this.col[i * 3] = this.rgb[i * 3];
      this.col[i * 3 + 1] = this.rgb[i * 3 + 1];
      this.col[i * 3 + 2] = this.rgb[i * 3 + 2];
      this.aux[i * 2] = this.baseSize[i] * (1 + (1 - k) * growth);
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
      const a = k * k * intensity;
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
  private star = starTexture();
  private ring = ringTexture();
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

  /** Starburst. Follows `follow` (plus an offset) if given, so it stays on a moving mech. */
  flash(at: THREE.Vector3, size: number, color: number, life = 0.16, follow: THREE.Object3D | null = null, ring = false): void {
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
    f.from = ring ? size * 0.3 : size * 0.55;
    f.to = ring ? size * 1.6 : size * 1.25;
    f.mat.map = ring ? this.ring : this.star;
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
    this.sparks.update(dt, 0);
    this.smoke.update(dt, 2.2);
    for (const f of this.flashes) {
      if (f.life <= 0) {
        f.mesh.visible = false;
        continue;
      }
      f.life -= dt;
      const k = 1 - Math.max(0, f.life / f.maxLife);
      const s = f.from + (f.to - f.from) * (1 - (1 - k) * (1 - k));
      f.mesh.scale.setScalar(s);
      f.mat.opacity = (1 - k * k) * 0.8;
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

export function makeShadow(): THREE.Mesh {
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
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
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
