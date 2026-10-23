// The fallen titan built from its simple shapes (pose.ts), for the game to
// show until its Blender model is in: each shape as a mesh, with whatever
// the road needs cut away (the openings it goes in and out through, the
// space round it where it runs inside the chest). Also the height of its top
// at any point, so pylons do not stand through it.
import * as THREE from 'three';
import type { Track } from '../../../sim/track';
import { KEEP_OUT, RoadIndex } from './keepout';
import { fitToRoad, surfacePoints, titanShapes, TITAN_POSE, type TitanMat, type TitanShape, type V3 } from './pose';

const vec = (v: V3) => new THREE.Vector3(v[0], v[1], v[2]);

/** One shape as a mesh, about `step` between its vertices. */
export function shapeGeometry(s: TitanShape, step = 18): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  if (s.kind === 'capsule') {
    const a = vec(s.a), b = vec(s.b);
    const len = Math.max(a.distanceTo(b), 0.01);
    const sides = Math.max(10, Math.min(28, Math.ceil((2 * Math.PI * Math.max(s.r0, s.r1)) / step)));
    const rows = Math.max(1, Math.ceil(len / step));
    const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(s.r1, s.r0, len, sides, rows, true)];
    const capB = new THREE.SphereGeometry(s.r1, sides, Math.max(3, sides / 4), 0, Math.PI * 2, 0, Math.PI / 2);
    capB.translate(0, len / 2, 0);
    const capA = new THREE.SphereGeometry(s.r0, sides, Math.max(3, sides / 4), 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    capA.translate(0, -len / 2, 0);
    parts.push(capB, capA);
    g = mergeNonIndexed(parts);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  } else if (s.kind === 'ring') {
    const tube = s.width / 2;
    g = new THREE.TorusGeometry(s.R - tube, tube, 8, Math.max(48, Math.ceil((2 * Math.PI * s.R) / step))).toNonIndexed();
    g.scale(1, 1, s.depth / s.width);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), vec(s.axis).normalize()));
    g.translate(...s.c);
  } else {
    const [ha, hb, hc] = s.half;
    if (s.kind === 'box') {
      g = new THREE.BoxGeometry(2 * ha, 2 * hb, 2 * hc, Math.ceil((2 * ha) / step), Math.ceil((2 * hb) / step), Math.ceil((2 * hc) / step));
    } else {
      const big = Math.max(ha, hb, hc);
      g = new THREE.SphereGeometry(1, Math.max(24, Math.ceil((2 * Math.PI * big) / step)), Math.max(16, Math.ceil((Math.PI * big) / step)));
      g.scale(ha, hb, hc);
    }
    const [A, B, C] = s.axes.map(vec);
    g.applyMatrix4(new THREE.Matrix4().makeBasis(A, B, C).setPosition(vec(s.c)));
  }
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute('uv');
  out.computeVertexNormals();
  return out;
}

function mergeNonIndexed(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const arrays = gs.map((g) => (g.index ? g.toNonIndexed() : g).attributes.position.array as Float32Array);
  const pos = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrays) {
    pos.set(a, o);
    o += a.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return g;
}

/** Drop the triangles with any corner in the space the road needs (up to `up` over its deck). */
export function cutForRoad(g: THREE.BufferGeometry, index: RoadIndex, up: number): THREE.BufferGeometry {
  const p = g.attributes.position.array as Float32Array;
  const n = g.attributes.normal?.array as Float32Array | undefined;
  const keepP: number[] = [];
  const keepN: number[] = [];
  const scratch: number[] = [];
  for (let t = 0; t < p.length; t += 9) {
    let hit = false;
    for (let k = 0; k < 9 && !hit; k += 3) hit = index.hit(p[t + k], p[t + k + 1], p[t + k + 2], up, scratch) >= 0;
    if (!hit) hit = index.hit((p[t] + p[t + 3] + p[t + 6]) / 3, (p[t + 1] + p[t + 4] + p[t + 7]) / 3, (p[t + 2] + p[t + 5] + p[t + 8]) / 3, up, scratch) >= 0;
    if (hit) continue;
    for (let k = 0; k < 9; k++) {
      keepP.push(p[t + k]);
      if (n) keepN.push(n[t + k]);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(keepP, 3));
  if (n) out.setAttribute('normal', new THREE.Float32BufferAttribute(keepN, 3));
  return out;
}

/**
 * The placeholder titan for this track, by material, with the road's space
 * cut out. Hollow where the road runs inside it: the chest is a shell with
 * frame arches inside it.
 */
export function titanPlaceholder(track: Track): Record<TitanMat, THREE.BufferGeometry[]> {
  const index = new RoadIndex(track);
  const out: Record<TitanMat, THREE.BufferGeometry[]> = { armour: [], red: [], slate: [], gold: [], frame: [], visor: [], blade: [] };
  const shapes = titanShapes(fitToRoad(TITAN_POSE, track));
  for (const s of shapes) {
    // The chest is opened wide where the road goes in, through and out, so it can be seen.
    const up = s.part === 'chest' ? KEEP_OUT.sky : KEEP_OUT.up;
    out[s.mat].push(cutForRoad(shapeGeometry(s, s.part === 'chest' ? 12 : 18), index, up));
  }
  // Frame arches inside the chest, from side to side over the road.
  const chest = shapes.find((s) => s.part === 'chest');
  if (chest && chest.kind === 'ellipsoid') {
    const [A, B, C] = chest.axes.map(vec);
    const c = vec(chest.c);
    const [ha, hb, hc] = chest.half;
    for (let u = -0.8; u <= 0.81; u += 0.2) {
      const k = Math.sqrt(1 - u * u) * 0.9;
      const pts: THREE.Vector3[] = [];
      for (let a = 0; a <= Math.PI + 1e-6; a += Math.PI / 20) {
        const p = c.clone().addScaledVector(A, u * ha).addScaledVector(B, Math.sin(a) * hb * k).addScaledVector(C, Math.cos(a) * hc * k);
        if (p.y > -10) pts.push(p);
      }
      if (pts.length < 4) continue;
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 3, 9, 8, false).toNonIndexed();
      g.deleteAttribute('uv');
      out.frame.push(cutForRoad(g, index, KEEP_OUT.up));
    }
  }
  return out;
}

const grounds = new WeakMap<Track, TitanGround | null>();
export interface TitanGround {
  /** The height of the titan's top at (x, z), or -Infinity where it is not. */
  topAt(x: number, z: number): number;
  /** Its extent from above. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Where the titan of Titan's Rest is, from above, or null on any other track. */
export function titanGround(track: Track): TitanGround | null {
  if (grounds.has(track)) return grounds.get(track)!;
  if (track.def.id !== 'titan') {
    grounds.set(track, null);
    return null;
  }
  const cell = 10;
  const top = new Map<number, number>();
  const key = (x: number, z: number) => (Math.floor(x / cell) + 2048) * 4096 + (Math.floor(z / cell) + 2048);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of titanShapes(fitToRoad(TITAN_POSE, track))) {
    for (const [x, y, z] of surfacePoints(s, cell * 0.7)) {
      if (y < -5) continue;
      const k = key(x, z);
      if (!(top.get(k)! >= y)) top.set(k, y);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }
  const g: TitanGround = { topAt: (x, z) => top.get(key(x, z)) ?? -Infinity, minX, maxX, minZ, maxZ };
  grounds.set(track, g);
  return g;
}
