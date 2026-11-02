// Lines of sight across a circuit: whether anything built round the road (a
// board, a wall, a stand, rock, the setting's scenery) stands between two
// points. The replay's trackside cameras are placed with it, and cut away
// when the mech they follow goes out of their sight.
//
// The solid surfaces near the road are copied once, in world space, into a
// grid over the ground plan, so a line is tested only against what lies in
// the squares it crosses. Built the first time it is asked (a race that
// never shows a trackside camera never builds it), and again if what shows
// changes (the painted look's pieces for the plain ones).

import * as THREE from 'three';
import type { Track } from '../../sim/index';

/** The grid's squares, in metres. */
const CELL = 32;
/** How many squares from the road's centreline anything is kept. */
const NEAR_ROAD = 3;
/** Anything bigger than this round is a sky or a planet, never in the way. */
const HUGE = 6000;

const key = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);

export class Sightlines {
  /** The surfaces' triangles, nine numbers each (three corners). */
  private tris = new Float32Array(0);
  private cells = new Map<number, number[]>();
  /** Which line last tested each triangle (one may lie in several squares). */
  private seen = new Uint32Array(0);
  private pass = 0;
  private signature = '';
  private checkedAt = -Infinity;

  constructor(
    private readonly track: Track,
    private readonly roots: readonly THREE.Object3D[],
    /** Materials that are never in the way (the road, the sky). */
    private readonly ignore: readonly THREE.Material[],
  ) {}

  /** Build it now (while something else is waited for), rather than the first time it is asked. */
  prepare(): void {
    this.refresh();
  }

  /** Nothing solid between `a` and `b` (a surface seen from behind counts, so a point inside rock is hidden). */
  clear(a: THREE.Vector3, b: THREE.Vector3): boolean {
    this.refresh();
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    // Not right up against either end (the camera's own mount, the mech's feet).
    const near = 0.3 / len;
    const far = 1 - 1 / len;
    if (far <= near) return true;
    this.pass = (this.pass + 1) >>> 0 || 1;
    // Walk the squares the line crosses in plan (Amanatides and Woo).
    let cx = Math.floor(a.x / CELL);
    let cz = Math.floor(a.z / CELL);
    const ex = Math.floor(b.x / CELL);
    const ez = Math.floor(b.z / CELL);
    const sx = dx > 0 ? 1 : -1;
    const sz = dz > 0 ? 1 : -1;
    const stepX = dx !== 0 ? CELL / Math.abs(dx) : Infinity;
    const stepZ = dz !== 0 ? CELL / Math.abs(dz) : Infinity;
    let nextX = dx !== 0 ? ((cx + (sx > 0 ? 1 : 0)) * CELL - a.x) / dx : Infinity;
    let nextZ = dz !== 0 ? ((cz + (sz > 0 ? 1 : 0)) * CELL - a.z) / dz : Infinity;
    for (let guard = 0; guard < 4096; guard++) {
      const list = this.cells.get(key(cx, cz));
      if (list && this.blocked(list, a, dx, dy, dz, near, far)) return false;
      if (cx === ex && cz === ez) break;
      if (nextX < nextZ) {
        nextX += stepX;
        cx += sx;
      } else {
        nextZ += stepZ;
        cz += sz;
      }
    }
    return true;
  }

  /** Any of these triangles across the line, between `near` and `far` along it (Möller and Trumbore, both faces). */
  private blocked(list: number[], o: THREE.Vector3, dx: number, dy: number, dz: number, near: number, far: number): boolean {
    const t = this.tris;
    for (const i of list) {
      if (this.seen[i] === this.pass) continue;
      this.seen[i] = this.pass;
      const k = i * 9;
      const ax = t[k], ay = t[k + 1], az = t[k + 2];
      const e1x = t[k + 3] - ax, e1y = t[k + 4] - ay, e1z = t[k + 5] - az;
      const e2x = t[k + 6] - ax, e2y = t[k + 7] - ay, e2z = t[k + 8] - az;
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-9) continue;
      const inv = 1 / det;
      const tx = o.x - ax, ty = o.y - ay, tz = o.z - az;
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const s = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (s > near && s < far) return true;
    }
    return false;
  }

  /** What is showing and solid. */
  private solids(): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const root of this.roots) {
      root.traverseVisible((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (mats.some((m) => this.ignore.includes(m) || !m.visible || (m.transparent && m.opacity < 0.9))) return;
        const g = mesh.geometry;
        if (!g.boundingSphere) g.computeBoundingSphere();
        if (g.boundingSphere && g.boundingSphere.radius > HUGE) return;
        out.push(mesh);
      });
    }
    return out;
  }

  /** (Re)build the grid if what shows has changed: looked at no more than once a second. */
  private refresh(): void {
    const now = performance.now();
    if (now - this.checkedAt < 1000) return;
    this.checkedAt = now;
    const meshes = this.solids();
    const signature = meshes.map((m) => m.id).join(',');
    if (signature === this.signature) return;
    this.signature = signature;
    this.build(meshes);
  }

  private build(meshes: THREE.Mesh[]): void {
    const track = this.track;
    // The squares near the road.
    const nearRoad = new Set<number>();
    for (let i = 0; i < track.n; i++) {
      const cx = Math.floor(track.px[i] / CELL);
      const cz = Math.floor(track.pz[i] / CELL);
      for (let x = -NEAR_ROAD; x <= NEAR_ROAD; x++) for (let z = -NEAR_ROAD; z <= NEAR_ROAD; z++) nearRoad.add(key(cx + x, cz + z));
    }
    const tris: number[] = [];
    const cells = new Map<number, number[]>();
    const world = new THREE.Matrix4();
    const inst = new THREE.Matrix4();
    const va = new THREE.Vector3();
    const vb = new THREE.Vector3();
    const vc = new THREE.Vector3();
    for (const mesh of meshes) {
      mesh.updateWorldMatrix(true, false);
      const pos = mesh.geometry.attributes.position;
      const index = mesh.geometry.index;
      const count = index ? index.count : pos.count;
      const instanced = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh) : null;
      const copies = instanced ? instanced.count : 1;
      for (let c = 0; c < copies; c++) {
        world.copy(mesh.matrixWorld);
        if (instanced) world.multiply((instanced.getMatrixAt(c, inst), inst));
        for (let j = 0; j + 2 < count; j += 3) {
          const ia = index ? index.getX(j) : j;
          const ib = index ? index.getX(j + 1) : j + 1;
          const ic = index ? index.getX(j + 2) : j + 2;
          va.fromBufferAttribute(pos, ia).applyMatrix4(world);
          vb.fromBufferAttribute(pos, ib).applyMatrix4(world);
          vc.fromBufferAttribute(pos, ic).applyMatrix4(world);
          const x0 = Math.floor(Math.min(va.x, vb.x, vc.x) / CELL);
          const x1 = Math.floor(Math.max(va.x, vb.x, vc.x) / CELL);
          const z0 = Math.floor(Math.min(va.z, vb.z, vc.z) / CELL);
          const z1 = Math.floor(Math.max(va.z, vb.z, vc.z) / CELL);
          // (Anything spanning a great many squares is ground far below, or a backdrop.)
          if ((x1 - x0 + 1) * (z1 - z0 + 1) > 64) continue;
          let id = -1;
          for (let x = x0; x <= x1; x++) {
            for (let z = z0; z <= z1; z++) {
              const k = key(x, z);
              if (!nearRoad.has(k)) continue;
              if (id < 0) {
                id = tris.length / 9;
                tris.push(va.x, va.y, va.z, vb.x, vb.y, vb.z, vc.x, vc.y, vc.z);
              }
              let list = cells.get(k);
              if (!list) cells.set(k, (list = []));
              list.push(id);
            }
          }
        }
      }
    }
    this.tris = new Float32Array(tris);
    this.cells = cells;
    this.seen = new Uint32Array(this.tris.length / 9);
    this.pass = 0;
  }
}
