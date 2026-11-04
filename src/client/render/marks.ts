// Marks the race leaves on the circuit, kept for the race: the skates' lines
// through a carve, the thrusters' burns along a boost, scorches where a
// boost lit, a start was launched, a hard landing or a knockout fell, soot on
// the barriers where mechs hit them, and the pieces a knockout scatters.
// Each kind is one instanced mesh, its newest marks overwriting its oldest.

import * as THREE from 'three';
import { roadAt, type Track } from '../../sim/index';
import { trackDir, trackPoint, trackUp } from './trackSpace';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Where there is nothing to draw on (the tests' views): a plain texture. */
const plain = (): THREE.Texture => new THREE.DataTexture(new Uint8Array([255, 255, 255, 160]), 1, 1);
const drawable = () => typeof document !== 'undefined';

/** A soft streak, long down its length: the lines a skate or a flame leaves. */
function streakTexture(): THREE.Texture {
  if (!drawable()) return plain();
  const [c, g] = canvas(32, 128);
  const across = g.createLinearGradient(0, 0, 32, 0);
  across.addColorStop(0, 'rgba(255,255,255,0)');
  across.addColorStop(0.3, 'rgba(255,255,255,0.85)');
  across.addColorStop(0.7, 'rgba(255,255,255,0.85)');
  across.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = across;
  g.fillRect(0, 0, 32, 128);
  // Broken a little along its length.
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(0,0,0,${0.15 + Math.random() * 0.35})`;
    g.fillRect(Math.random() * 32, Math.random() * 128, 2 + Math.random() * 6, 2 + Math.random() * 10);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A ragged round blot: a scorch on the road, soot on a barrier. */
function blotTexture(): THREE.Texture {
  if (!drawable()) return plain();
  const [c, g] = canvas(128, 128);
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 34;
    const x = 64 + Math.cos(a) * r;
    const y = 64 + Math.sin(a) * r;
    const rad = 10 + Math.random() * 26;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, 'rgba(255,255,255,0.32)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(c);
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const vx = new THREE.Vector3();
const vy = new THREE.Vector3();
const vz = new THREE.Vector3();
const at = new THREE.Vector3();
const sc = new THREE.Vector3();
const col = new THREE.Color();

class Layer {
  readonly mesh: THREE.InstancedMesh;
  private next = 0;
  private used = 0;

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, readonly cap: number) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, col.set(0xffffff));
  }

  put(m: THREE.Matrix4, color: THREE.Color): void {
    this.mesh.setMatrixAt(this.next, m);
    this.mesh.setColorAt(this.next, color);
    this.next = (this.next + 1) % this.cap;
    this.used = Math.min(this.cap, this.used + 1);
    this.mesh.count = this.used;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** What a skate leaves: a carve's line, a biting carve's scrub (wider, darker), or a boost's burn. */
export type Trail = 'carve' | 'scrub' | 'burn';

const TRAIL_COLOR: Record<Trail, number> = { carve: 0x1a1d2c, scrub: 0x0c0d14, burn: 0x2b1a10 };
const TRAIL_WIDTH: Record<Trail, number> = { carve: 0.42, scrub: 0.8, burn: 0.75 };
/** Laid every this far along (a segment a mark). */
const SEGMENT = 2.4;

export class TrackMarks {
  readonly group = new THREE.Group();
  private road: Layer;
  private flat: Layer;
  private wall: Layer;
  private debris: Layer;
  /** Each skate's last mark: where it ended (world), on which trail. */
  private last = new Map<number, { p: THREE.Vector3; trail: Trail }>();
  private sootAt = new Map<number, number>();
  private time = 0;

  constructor(private readonly track: Track) {
    this.group.name = 'marks';
    const decal = (map: THREE.Texture, opacity: number) =>
      new THREE.MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false });
    const lying = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.road = new Layer(lying, decal(streakTexture(), 0.55), 2400);
    const blot = blotTexture();
    this.flat = new Layer(lying.clone(), decal(blot, 0.85), 260);
    this.wall = new Layer(new THREE.PlaneGeometry(1, 1), decal(blot, 0.75), 200);
    this.debris = new Layer(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), 420);
    this.group.add(this.road.mesh, this.flat.mesh, this.wall.mesh, this.debris.mesh);
  }

  update(dt: number): void {
    this.time += dt;
  }

  /**
   * A skate at `p` (world), on the road at (s, d): on a trail, a line from
   * its last mark to here once it has come far enough; off one (null), the
   * line ends.
   */
  skate(key: number, p: THREE.Vector3, s: number, d: number, trail: Trail | null): void {
    const last = this.last.get(key);
    if (!trail || !roadAt(this.track, s, d)) {
      this.last.delete(key);
      return;
    }
    if (!last || last.trail !== trail) {
      this.last.set(key, { p: p.clone(), trail });
      return;
    }
    const len = last.p.distanceTo(p);
    if (len < SEGMENT) return;
    if (len < 14) {
      // Lying on the road, along the way it went.
      trackUp(this.track, s, vy);
      vz.subVectors(p, last.p).addScaledVector(vy, -vz.dot(vy)).normalize();
      vx.crossVectors(vy, vz).normalize();
      m4.makeBasis(vx, vy, vz);
      at.addVectors(p, last.p).multiplyScalar(0.5).addScaledVector(vy, 0.04);
      q.setFromRotationMatrix(m4);
      m4.compose(at, q, sc.set(TRAIL_WIDTH[trail], 1, len + 0.3));
      this.road.put(m4, col.setHex(TRAIL_COLOR[trail]));
    }
    last.p.copy(p);
  }

  /** A scorch on the road at (s, d), `size` across. */
  scorch(s: number, d: number, size: number, color = 0x1c1612): void {
    if (!roadAt(this.track, s, d)) return;
    trackUp(this.track, s, vy);
    trackDir(this.track, s, 1, 0, vz);
    vz.addScaledVector(vy, -vz.dot(vy)).normalize();
    vx.crossVectors(vy, vz).normalize();
    // Turned any way.
    m4.makeBasis(vx, vy, vz);
    q.setFromRotationMatrix(m4).multiply(new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.random() * Math.PI * 2));
    trackPoint(this.track, s, d, 0.05, at);
    m4.compose(at, q, sc.set(size, 1, size));
    this.flat.put(m4, col.setHex(color));
  }

  /**
   * Soot on the barrier at `s`, its face at `face` (d), on the `side` of the
   * road, `size` along; not more than every half second for one mech (a
   * scrape reports every touch).
   */
  soot(mech: number, s: number, face: number, side: number, size: number): void {
    if ((this.sootAt.get(mech) ?? -1) > this.time - 0.5) return;
    this.sootAt.set(mech, this.time);
    trackUp(this.track, s, vy);
    trackDir(this.track, s, 1, 0, vx);
    trackDir(this.track, s, 0, -side, vz);
    vx.addScaledVector(vy, -vx.dot(vy)).normalize();
    vz.crossVectors(vx, vy).normalize();
    // Facing the road.
    if (vz.dot(trackDir(this.track, s, 0, -side, at)) < 0) vz.negate();
    vx.crossVectors(vy, vz).normalize();
    m4.makeBasis(vx, vy, vz);
    q.setFromRotationMatrix(m4);
    trackPoint(this.track, s + (Math.random() - 0.5) * 2, face - side * 0.12, 0.6 + size * 0.22, at);
    m4.compose(at, q, sc.set(size, size * 0.55, 1));
    this.wall.put(m4, col.setHex(0x15131a));
  }

  /** The pieces a knockout scatters round (s, d), in its colours. */
  scatter(s: number, d: number, colors: readonly number[], count = 12): void {
    for (let i = 0; i < count; i++) {
      const ds = (Math.random() - 0.5) * 9;
      const dd = (Math.random() - 0.5) * 7;
      if (!roadAt(this.track, s + ds, d + dd)) continue;
      const size = 0.25 + Math.random() * 0.45;
      trackPoint(this.track, s + ds, d + dd, size * 0.12, at);
      q.setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.6, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.6));
      m4.compose(at, q, sc.set(size, size * 0.3, size * (0.6 + Math.random() * 0.8)));
      this.debris.put(m4, col.setHex(colors[i % colors.length]));
    }
  }

  dispose(): void {
    for (const l of [this.road, this.flat, this.wall, this.debris]) l.dispose();
  }
}
