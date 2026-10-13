// Drawn effects from painted sheets (the anime look). Each kind is an atlas:
// one row per variation, one column per drawing, made by
// tools/fx/build_sprites.py from the sheets in art/fx-sheets. A sprite plays
// its row on the look's drawing clock, faces the camera, and is recoloured
// on the way out: the sheets are painted in cyan, and the game turns that
// into the team's, the weapon's or the moment's colour, keeping the white
// cores white. Everything is pooled.
import * as THREE from 'three';
import { drawClock } from './look';
import cutHeavyUrl from './sprites/fx-cut-heavy.png';
import cutLightUrl from './sprites/fx-cut-light.png';
import impactUrl from './sprites/fx-impact.png';
import lanceUrl from './sprites/fx-lance.png';
import parryUrl from './sprites/fx-parry.png';
import ringUrl from './sprites/fx-ring.png';
import sparkUrl from './sprites/fx-spark.png';
import explosionUrl from './sprites/explosion.png';
import groundRingUrl from './sprites/fx-ground-ring.png';

export type SpriteKind = 'spark' | 'impact' | 'parry' | 'cutLight' | 'cutHeavy' | 'lance' | 'ring' | 'groundRing' | 'explosion';

interface Atlas {
  url: string;
  cols: number;
  rows: number;
  /** Recolour the cyan to the sprite's tint (the explosion keeps its own colours). */
  tint: boolean;
}

const ATLASES: Record<SpriteKind, Atlas> = {
  spark: { url: sparkUrl, cols: 3, rows: 2, tint: true },
  impact: { url: impactUrl, cols: 6, rows: 1, tint: true },
  parry: { url: parryUrl, cols: 3, rows: 2, tint: true },
  cutLight: { url: cutLightUrl, cols: 3, rows: 2, tint: true },
  cutHeavy: { url: cutHeavyUrl, cols: 3, rows: 1, tint: true },
  lance: { url: lanceUrl, cols: 3, rows: 2, tint: true },
  ring: { url: ringUrl, cols: 3, rows: 1, tint: true },
  groundRing: { url: groundRingUrl, cols: 3, rows: 2, tint: true },
  explosion: { url: explosionUrl, cols: 8, rows: 1, tint: false },
};

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec4 uCell;
  uniform vec3 uTint;
  uniform float uTintK, uGain, uFlip;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv;
    if (uFlip > 0.5) uv.x = 1.0 - uv.x;
    vec4 t = texture2D(uMap, uCell.xy + uv * uCell.zw);
    if (t.a < 0.02) discard;
    vec3 c = t.rgb;
    if (uTintK > 0.5) {
      // Keep how bright and how white each pixel is; swap the hue for the tint.
      float hi = max(c.r, max(c.g, c.b));
      float lo = min(c.r, min(c.g, c.b));
      float white = lo / max(hi, 1e-3);
      c = mix(uTint * hi, vec3(hi), white * white);
    }
    gl_FragColor = vec4(c * uGain, t.a);
  }`;

export interface SpriteOptions {
  /** The colour the cyan becomes. */
  tint?: number;
  /** Brightness: above 1 it blooms. */
  gain?: number;
  /** Ride along with this object (the sprite keeps its offset from it). */
  follow?: THREE.Object3D | null;
  /** Turn on screen, radians. */
  roll?: number;
  flip?: boolean;
  /** Which variation; random if left out. */
  row?: number;
  /** Drift (world units a second), slowing; for a sprite that does not follow. */
  vel?: THREE.Vector3;
  /** Point the drawing's right-hand side along this world direction, on screen. */
  dir?: THREE.Vector3;
  /** Lie flat in this orientation (a ring on the road) instead of facing the camera. */
  flat?: THREE.Quaternion;
}

interface Sprite {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  kind: SpriteKind;
  frame: number;
  row: number;
  follow: THREE.Object3D | null;
  offset: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  roll: number;
  dir: THREE.Vector3 | null;
  flat: THREE.Quaternion | null;
}

const POOL = 40;
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class SpriteFx {
  readonly group = new THREE.Group();
  private pool: Sprite[] = [];
  private textures = new Map<SpriteKind, THREE.Texture>();
  private geo = new THREE.PlaneGeometry(1, 1);

  constructor() {
    for (let i = 0; i < POOL; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: null },
          uCell: { value: new THREE.Vector4(0, 0, 1, 1) },
          uTint: { value: new THREE.Color(1, 1, 1) },
          uTintK: { value: 1 },
          uGain: { value: 1 },
          uFlip: { value: 0 },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 8;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.pool.push({ mesh, mat, kind: 'spark', frame: -1, row: 0, follow: null, offset: new THREE.Vector3(), pos: new THREE.Vector3(), vel: new THREE.Vector3(), roll: 0, dir: null, flat: null });
    }
  }

  private texture(kind: SpriteKind): THREE.Texture {
    let t = this.textures.get(kind);
    if (!t) {
      t = new THREE.TextureLoader().load(ATLASES[kind].url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      this.textures.set(kind, t);
    }
    return t;
  }

  /** Load every atlas now, so the first hit of a race does not wait for one. */
  preload(): void {
    for (const k of Object.keys(ATLASES) as SpriteKind[]) this.texture(k);
  }

  /** Start a drawn effect `size` units across at `at`. */
  spawn(kind: SpriteKind, at: THREE.Vector3, size: number, o: SpriteOptions = {}): void {
    const s = this.pool.find((p) => p.frame < 0) ?? this.pool.reduce((a, p) => (p.frame > a.frame ? p : a));
    const atlas = ATLASES[kind];
    s.kind = kind;
    s.frame = 0;
    s.row = o.row ?? Math.floor(Math.random() * atlas.rows);
    s.row = Math.min(atlas.rows - 1, Math.max(0, s.row));
    s.follow = o.follow ?? null;
    if (s.follow) {
      s.follow.getWorldPosition(_v);
      s.offset.copy(at).sub(_v);
    }
    s.pos.copy(at);
    s.vel.copy(o.vel ?? _v.set(0, 0, 0));
    s.roll = o.roll ?? 0;
    s.dir = o.dir ? (s.dir ?? new THREE.Vector3()).copy(o.dir) : null;
    s.flat = o.flat ? (s.flat ?? new THREE.Quaternion()).copy(o.flat) : null;
    const u = s.mat.uniforms;
    u.uMap.value = this.texture(kind);
    (u.uTint.value as THREE.Color).set(o.tint ?? 0x45e8ff);
    u.uTintK.value = atlas.tint ? 1 : 0;
    u.uGain.value = o.gain ?? 1.5;
    u.uFlip.value = o.flip ? 1 : 0;
    this.setCell(s);
    s.mesh.scale.setScalar(size);
    s.mesh.visible = true;
  }

  /** Move any `kind` effect that has only just started on to drawing `frame`. */
  skip(kind: SpriteKind, frame: number): void {
    for (const s of this.pool) {
      if (s.kind !== kind || s.frame < 0 || s.frame >= frame) continue;
      s.frame = frame;
      this.setCell(s);
    }
  }

  /** End every effect (the look switched off, or a new race). */
  clear(): void {
    for (const s of this.pool) {
      s.frame = -1;
      s.mesh.visible = false;
    }
  }

  private setCell(s: Sprite): void {
    const a = ATLASES[s.kind];
    // Rows run down the atlas; texture v runs up.
    (s.mat.uniforms.uCell.value as THREE.Vector4).set(s.frame / a.cols, 1 - (s.row + 1) / a.rows, 1 / a.cols, 1 / a.rows);
  }

  /** Advance on new drawings, follow, face the camera. `dt` 0 holds everything (a painted still). */
  update(dt: number, camera: THREE.Camera): void {
    for (const s of this.pool) {
      if (s.frame < 0) continue;
      if (drawClock.fresh && dt > 0) {
        s.frame++;
        if (s.frame >= ATLASES[s.kind].cols) {
          s.frame = -1;
          s.mesh.visible = false;
          continue;
        }
        this.setCell(s);
      }
      if (s.follow) {
        s.follow.getWorldPosition(_v);
        s.mesh.position.copy(_v).add(s.offset);
      } else {
        s.vel.multiplyScalar(Math.exp(-3 * dt));
        s.pos.addScaledVector(s.vel, dt);
        if (s.kind === 'explosion') s.pos.y += dt * 4;
        s.mesh.position.copy(s.pos);
      }
      if (s.flat) {
        s.mesh.quaternion.copy(s.flat);
        if (s.roll) s.mesh.rotateZ(s.roll);
        continue;
      }
      s.mesh.quaternion.copy(camera.quaternion);
      let roll = s.roll;
      if (s.dir) {
        // Point along a world direction as it looks from the camera.
        _a.copy(s.mesh.position).project(camera);
        _b.copy(s.mesh.position).add(s.dir).project(camera);
        roll += Math.atan2(_b.y - _a.y, _b.x - _a.x);
      }
      if (roll) s.mesh.rotateZ(roll);
    }
  }

  dispose(): void {
    for (const s of this.pool) s.mat.dispose();
    for (const t of this.textures.values()) t.dispose();
    this.geo.dispose();
  }
}
