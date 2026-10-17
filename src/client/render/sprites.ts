// Drawn effects from painted sheets (the anime look). Each kind is an atlas:
// one row per variation, one column per drawing, made by
// tools/fx/build_sprites.py from the sheets in art/fx-sheets. A sprite plays
// its row on the look's drawing clock, faces the camera (or lies flat), and
// is recoloured on the way out: the glows are painted in cyan, and the game
// turns that into the team's, the weapon's or the moment's colour, keeping
// the white cores white; the smoke is painted grey, and the game shades it
// to the dust or smoke it wants. A loop (a crackle round a snared mech) is
// kept alive by asking for it every frame, and plays its drawings in a
// random order. Everything is pooled.
import * as THREE from 'three';
import { drawClock } from './look';
import crackleUrl from './sprites/fx-crackle.png';
import cutHeavyUrl from './sprites/fx-cut-heavy.png';
import cutLightUrl from './sprites/fx-cut-light.png';
import explosionUrl from './sprites/fx-explosion.png';
import cracksUrl from './sprites/fx-cracks.png';
import groundRingUrl from './sprites/fx-ground-ring.png';
import hammerUrl from './sprites/fx-hammer.png';
import impactUrl from './sprites/fx-impact.png';
import kickUrl from './sprites/fx-kick.png';
import lanceUrl from './sprites/fx-lance.png';
import muzzleUrl from './sprites/fx-muzzle.png';
import parryUrl from './sprites/fx-parry.png';
import ramUrl from './sprites/fx-ram.png';
import ringUrl from './sprites/fx-ring.png';
import smokeUrl from './sprites/fx-smoke.png';
import sparkUrl from './sprites/fx-spark.png';
import sparkleUrl from './sprites/fx-sparkle.png';
import stunUrl from './sprites/fx-stun.png';
import wallUrl from './sprites/fx-wall.png';

export type SpriteKind =
  | 'spark'
  | 'impact'
  | 'parry'
  | 'cutLight'
  | 'cutHeavy'
  | 'lance'
  | 'ring'
  | 'groundRing'
  | 'explosion'
  | 'smoke'
  | 'wall'
  | 'crackle'
  | 'sparkle'
  | 'kick'
  | 'stun'
  | 'hammer'
  | 'cracks'
  | 'muzzle'
  | 'ram';

/**
 * How a sheet is coloured: `glow` swaps its cyan for the tint, `smoke` shades
 * its greys with the tint, `own` keeps the painted colours.
 */
type Paint = 'own' | 'glow' | 'smoke';
const PAINT: Record<Paint, number> = { own: 0, glow: 1, smoke: 2 };

interface Atlas {
  url: string;
  cols: number;
  rows: number;
  paint: Paint;
  /** How many drawings each column is held for (1 if left out). */
  holds?: number[];
  /** How fast it climbs, units a second, when it is not riding on a mech. */
  rise?: number;
}

/** Where the barrier sits in a `wall` drawing: tools/fx/build_sprites.py lines it up 32 px into a 256 px cell. */
export const WALL_EDGE = 32 / 256;
/** Where the muzzle sits in a `muzzle` drawing, from its left edge (the blast goes right). */
export const MUZZLE_EDGE = 8 / 256;
/** Where the prow's tip sits in a `ram` drawing, from its left edge. */
export const RAM_TIP = 232 / 256;

const ATLASES: Record<SpriteKind, Atlas> = {
  spark: { url: sparkUrl, cols: 3, rows: 2, paint: 'glow' },
  impact: { url: impactUrl, cols: 6, rows: 1, paint: 'glow' },
  parry: { url: parryUrl, cols: 3, rows: 2, paint: 'glow' },
  cutLight: { url: cutLightUrl, cols: 3, rows: 2, paint: 'glow' },
  cutHeavy: { url: cutHeavyUrl, cols: 3, rows: 1, paint: 'glow' },
  lance: { url: lanceUrl, cols: 3, rows: 2, paint: 'glow' },
  ring: { url: ringUrl, cols: 3, rows: 1, paint: 'glow' },
  groundRing: { url: groundRingUrl, cols: 3, rows: 2, paint: 'glow' },
  // The painted knockout (sheet 12): flash, fireball, smoke closing over it,
  // smoke breaking up, the smoke held longer. The procedural one it replaced
  // is still in sprites/explosion.png (8 drawings, from tools/fx/explosion.py).
  explosion: { url: explosionUrl, cols: 6, rows: 1, paint: 'own', holds: [1, 1, 1, 1, 2, 2], rise: 4 },
  // A small puff and a big cloud, each swelling then breaking into pieces.
  smoke: { url: smokeUrl, cols: 3, rows: 2, paint: 'smoke', holds: [1, 1, 2], rise: 3 },
  // A burst against a barrier, flat side on the barrier.
  wall: { url: wallUrl, cols: 6, rows: 1, paint: 'glow' },
  // Loops: four bolts bracketing a mech, and a ring.
  crackle: { url: crackleUrl, cols: 3, rows: 2, paint: 'glow' },
  sparkle: { url: sparkleUrl, cols: 6, rows: 1, paint: 'glow' },
  // The kick's smear, rising to the contact.
  kick: { url: kickUrl, cols: 3, rows: 1, paint: 'glow' },
  // Loops over a staggered mech: sparks shorting out, a broken halo. Top half of the cell.
  stun: { url: stunUrl, cols: 3, rows: 2, paint: 'glow' },
  // The hammer coming down, and the cracks a slam leaves on the road.
  hammer: { url: hammerUrl, cols: 3, rows: 1, paint: 'glow' },
  cracks: { url: cracksUrl, cols: 3, rows: 1, paint: 'glow', holds: [1, 2, 2] },
  // Row 0 the rifle, row 1 the scatter cannon.
  muzzle: { url: muzzleUrl, cols: 3, rows: 2, paint: 'glow' },
  // Row 0 the charge starting, row 1 the loop while it lasts.
  ram: { url: ramUrl, cols: 3, rows: 2, paint: 'glow' },
};

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec4 uCell;
  uniform vec3 uTint;
  uniform float uPaint, uGain, uFlip;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv;
    if (uFlip > 1.5) uv.y = 1.0 - uv.y;
    else if (uFlip > 0.5) uv.x = 1.0 - uv.x;
    vec4 t = texture2D(uMap, uCell.xy + uv * uCell.zw);
    if (t.a < 0.02) discard;
    vec3 c = t.rgb;
    float hi = max(c.r, max(c.g, c.b));
    if (uPaint > 1.5) {
      // Smoke: two tones of grey and an ink line. The lit tone (about 0.6)
      // becomes the tint, the shadow and the line keep their depth.
      c = uTint * (dot(c, vec3(0.3, 0.59, 0.11)) / 0.6) * uGain;
    } else if (uPaint > 0.5) {
      // Keep how bright and how white each pixel is; swap the hue for the tint.
      float lo = min(c.r, min(c.g, c.b));
      float white = lo / max(hi, 1e-3);
      c = mix(uTint * hi, vec3(hi), white * white) * uGain;
    } else {
      // Its own colours: only the bright parts (fire, not smoke) glow.
      c *= mix(1.0, uGain, smoothstep(0.55, 0.9, hi));
    }
    gl_FragColor = vec4(c, t.a);
  }`;

/** What an effect shows through: see SpriteOptions.depth. */
export type Depth = boolean | number;

/**
 * The usual depths, in units drawn nearer the camera. ON_MECH: a glow at a
 * mech's surface (a muzzle, the boost, a charge ring): hidden behind the
 * mech's own body, not cut by it. AROUND: a blade's swing round a mech, or
 * a hit between two: over the fighters, whichever way round the camera
 * looks at them, but not through a wall or the road well in front of them.
 */
export const DEPTH = { ON_MECH: 1.5, AROUND: 10 } as const;

/**
 * The depth for a ring or a burst `size` across, centred on a mech: drawn
 * nearer by its radius, so the road under the mech does not cut off its
 * lower half (an ability's ring, a knockout's fireball).
 */
export function wide(size: number): number {
  return Math.max(DEPTH.AROUND, size * 0.5);
}

const _cam = new THREE.Vector3();

/**
 * Move `pos` toward the camera by up to `pull` units (never more than three
 * quarters of the way there); returns how much smaller to draw it so it
 * keeps its size on screen.
 */
export function pullNearer(pos: THREE.Vector3, camera: THREE.Camera, pull: number): number {
  if (pull <= 0) return 1;
  camera.getWorldPosition(_cam);
  _cam.sub(pos);
  const d = _cam.length();
  if (d < 1e-3) return 1;
  const p = Math.min(pull, d * 0.75);
  pos.addScaledVector(_cam, p / d);
  return (d - p) / d;
}

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
  /**
   * What it shows through. Left out (or false): nothing hides it, the old
   * way, now only for what must always be seen. True: hidden by whatever is
   * in front of it, where it is (smoke, dust, rings on the road). A number:
   * hidden by whatever is in front, but drawn that many units nearer the
   * camera (the same size on screen), so it shows over its own mech, or the
   * pair it lies between, and not through the scene beyond (see DEPTH).
   */
  depth?: Depth;
  /** Wait this many drawings before it appears. */
  delay?: number;
  /** Climb, units a second (instead of the sheet's own rise). */
  rise?: number;
  /** A loop: turn a quarter or more on each drawing (one lying flat, so its shape never repeats). */
  turn?: boolean;
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
  /** Drawings until the next column (or, before it shows, until it appears). */
  wait: number;
  shown: boolean;
  rise: number;
  /** A loop's name, or null for an effect that plays once. */
  key: string | null;
  /** The frame a loop was last asked for. */
  seen: number;
  turn: boolean;
  /** For one pointing along `dir`: the turn on screen it settled on (NaN until it has one). */
  dirRoll: number;
  /** Units it is drawn nearer the camera (see SpriteOptions.depth), and its size before that. */
  pull: number;
  size: number;
}

const POOL = 64;
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

export class SpriteFx {
  readonly group = new THREE.Group();
  private pool: Sprite[] = [];
  private textures = new Map<SpriteKind, THREE.Texture>();
  private geo = new THREE.PlaneGeometry(1, 1);
  /** Counts frames, for loops: one not asked for this frame ends. */
  private tick = 1;

  constructor() {
    for (let i = 0; i < POOL; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: null },
          uCell: { value: new THREE.Vector4(0, 0, 1, 1) },
          uTint: { value: new THREE.Color(1, 1, 1) },
          uPaint: { value: 1 },
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
      this.pool.push({
        mesh,
        mat,
        kind: 'spark',
        frame: -1,
        row: 0,
        follow: null,
        offset: new THREE.Vector3(),
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        roll: 0,
        dir: null,
        flat: null,
        wait: 0,
        shown: false,
        rise: 0,
        key: null,
        seen: 0,
        turn: false,
        dirRoll: NaN,
        pull: 0,
        size: 1,
      });
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
    this.start(this.take(), kind, at, size, o);
  }

  /**
   * Keep a looping effect going: call it every frame it should show, with
   * the same `key`; it ends on the first frame it is not asked for. Its
   * drawings come in a random order, never the same one twice running, and
   * flipped at random, so three drawings read as live crackle.
   */
  keep(key: string, kind: SpriteKind, at: THREE.Vector3, size: number, o: SpriteOptions = {}): void {
    let s = this.pool.find((p) => p.key === key && p.frame >= 0);
    if (!s || s.kind !== kind) {
      if (s) this.end(s);
      s = this.take();
      this.start(s, kind, at, size, o);
      s.key = key;
      s.turn = o.turn ?? false;
      s.frame = Math.floor(Math.random() * ATLASES[kind].cols);
      this.setCell(s);
    } else {
      // Moving along with whatever it marks.
      s.pos.copy(at);
      if (s.follow) {
        s.follow.getWorldPosition(_v);
        s.offset.copy(at).sub(_v);
      }
      if (o.flat && s.flat) s.flat.copy(o.flat);
      if (o.dir && s.dir) s.dir.copy(o.dir);
      if (o.depth !== undefined) this.setDepth(s, o.depth);
      if (o.tint !== undefined) (s.mat.uniforms.uTint.value as THREE.Color).set(o.tint);
      if (o.gain !== undefined) s.mat.uniforms.uGain.value = o.gain;
      s.size = size;
      s.mesh.scale.setScalar(size);
    }
    s.seen = this.tick;
  }

  /** A free sprite, or the one furthest through a one-off effect. */
  private take(): Sprite {
    let best: Sprite | null = null;
    for (const p of this.pool) {
      if (p.frame < 0) return p;
      if (p.key === null && (!best || p.frame > best.frame)) best = p;
    }
    return best ?? this.pool[0];
  }

  private start(s: Sprite, kind: SpriteKind, at: THREE.Vector3, size: number, o: SpriteOptions): void {
    const atlas = ATLASES[kind];
    s.kind = kind;
    s.frame = 0;
    s.key = null;
    s.turn = false;
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
    s.dirRoll = NaN;
    s.flat = o.flat ? (s.flat ?? new THREE.Quaternion()).copy(o.flat) : null;
    s.rise = o.rise ?? atlas.rise ?? 0;
    const delay = Math.max(0, Math.round(o.delay ?? 0));
    s.shown = delay === 0;
    s.wait = s.shown ? this.hold(s) : delay;
    const u = s.mat.uniforms;
    u.uMap.value = this.texture(kind);
    (u.uTint.value as THREE.Color).set(o.tint ?? (atlas.paint === 'smoke' ? 0x9a96a4 : 0x45e8ff));
    u.uPaint.value = PAINT[atlas.paint];
    u.uGain.value = o.gain ?? (atlas.paint === 'smoke' ? 1 : 1.5);
    u.uFlip.value = o.flip ? (o.dir ? 2 : 1) : 0;
    this.setDepth(s, o.depth ?? false);
    this.setCell(s);
    s.size = size;
    s.mesh.scale.setScalar(size);
    s.mesh.visible = s.shown;
  }

  private setDepth(s: Sprite, depth: Depth): void {
    s.mat.depthTest = depth !== false;
    s.pull = typeof depth === 'number' ? depth : 0;
    s.mesh.renderOrder = depth !== false ? 7 : 8;
  }

  private hold(s: Sprite): number {
    return ATLASES[s.kind].holds?.[s.frame] ?? 1;
  }

  private end(s: Sprite): void {
    s.frame = -1;
    s.key = null;
    s.mesh.visible = false;
  }

  /** Move any `kind` effect that has only just started on to drawing `frame`. */
  skip(kind: SpriteKind, frame: number): void {
    for (const s of this.pool) {
      if (s.kind !== kind || s.frame < 0 || s.key !== null || s.frame >= frame) continue;
      s.frame = frame;
      s.shown = true;
      s.mesh.visible = true;
      s.wait = this.hold(s);
      this.setCell(s);
    }
  }

  /** End every effect (the look switched off, or a new race). */
  clear(): void {
    for (const s of this.pool) this.end(s);
  }

  private setCell(s: Sprite): void {
    const a = ATLASES[s.kind];
    // Rows run down the atlas; texture v runs up.
    (s.mat.uniforms.uCell.value as THREE.Vector4).set(s.frame / a.cols, 1 - (s.row + 1) / a.rows, 1 / a.cols, 1 / a.rows);
  }

  /** Advance on new drawings, follow, face the camera. `dt` 0 holds everything (a painted still). */
  update(dt: number, camera: THREE.Camera): void {
    const aspect = (camera as THREE.PerspectiveCamera).aspect ?? 1;
    const fresh = drawClock.fresh && dt > 0;
    for (const s of this.pool) {
      if (s.frame < 0) continue;
      if (s.key !== null && s.seen !== this.tick) {
        this.end(s);
        continue;
      }
      if (fresh && --s.wait <= 0) {
        if (!s.shown) {
          s.shown = true;
          s.mesh.visible = true;
        } else if (s.key !== null) {
          // A loop: another of its drawings, never the one just shown.
          const cols = ATLASES[s.kind].cols;
          s.frame = (s.frame + 1 + Math.floor(Math.random() * (cols - 1))) % cols;
          // Mirrored at random for variety: top to bottom for one pointing
          // along `dir` (the ram's prow), as side to side turned it round
          // to point back the way it came on every other drawing.
          s.mat.uniforms.uFlip.value = Math.random() < 0.5 ? (s.dir ? 2 : 1) : 0;
          if (s.turn) s.roll += (1 + Math.floor(Math.random() * 3)) * Math.PI * 0.5;
        } else if (++s.frame >= ATLASES[s.kind].cols) {
          this.end(s);
          continue;
        }
        s.wait = this.hold(s);
        this.setCell(s);
      }
      if (s.follow) {
        s.follow.getWorldPosition(_v);
        s.mesh.position.copy(_v).add(s.offset);
      } else {
        s.vel.multiplyScalar(Math.exp(-3 * dt));
        s.pos.addScaledVector(s.vel, dt);
        s.pos.y += dt * s.rise;
        s.mesh.position.copy(s.pos);
      }
      if (s.pull > 0) s.mesh.scale.setScalar(s.size * pullNearer(s.mesh.position, camera, s.pull));
      if (s.flat) {
        s.mesh.quaternion.copy(s.flat);
        if (s.roll) s.mesh.rotateZ(s.roll);
        continue;
      }
      s.mesh.quaternion.copy(camera.quaternion);
      let roll = s.roll;
      if (s.dir) {
        // Point along a world direction as it looks from the camera. A
        // direction running nearly into (or out of) the picture shows as a
        // speck on screen whose angle swings wildly from one frame to the
        // next: trust it only as far as it shows across the view, and
        // otherwise hold the turn it had (a ram charging away from the
        // camera kept spinning its prow round).
        // (The angle is taken on screen, so across by the picture's aspect:
        // taken straight from the projection, a wide screen squashed it and
        // a slanting shot drew some 15 degrees steeper than it flew.)
        _a.copy(s.mesh.position).project(camera);
        _b.copy(s.mesh.position).add(s.dir).project(camera);
        const want = Math.atan2(_b.y - _a.y, (_b.x - _a.x) * aspect);
        camera.getWorldPosition(_c);
        _c.sub(s.mesh.position).normalize();
        const across = Math.sqrt(Math.max(0, 1 - (_c.dot(s.dir) / (s.dir.length() || 1)) ** 2));
        const trust = Math.min(1, Math.max(0, (across - 0.25) / 0.35));
        if (Number.isNaN(s.dirRoll) || trust >= 1) s.dirRoll = want;
        else if (trust > 0) {
          const d = Math.atan2(Math.sin(want - s.dirRoll), Math.cos(want - s.dirRoll));
          s.dirRoll += d * (1 - Math.pow(1 - trust, Math.max(dt, 0) * 60));
        }
        roll += s.dirRoll;
      }
      if (roll) s.mesh.rotateZ(roll);
    }
    this.tick++;
  }

  dispose(): void {
    for (const s of this.pool) s.mat.dispose();
    for (const t of this.textures.values()) t.dispose();
    this.geo.dispose();
  }
}
