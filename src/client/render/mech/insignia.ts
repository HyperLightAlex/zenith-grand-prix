// A team's emblem where a part's modelled insignia was (docs/CUSTOMIZATION.md,
// "Faction insignias"): a part flown for another faction leaves its badge off,
// and the emblem, from the team's markings sheet, is laid over the armour the
// badge sat on, following its shape.

import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import type { Livery } from '../palette';
import { emblemMaterial, toSheetCell } from './decals';
import type { Slot } from './kit';
import type { InsigniaAnchor } from './rosterAsset';

/** A piece of the armour under a badge: its shape (joint-local) and the paint slot it wears. */
export interface Underlay {
  geometry: THREE.BufferGeometry;
  slot: Slot | 'G';
}

/** The colour a slot of armour is painted, as the kit paints it, in a part's paint. */
function slotColour(slot: Slot | 'G', paint: Livery): number {
  switch (slot) {
    case 'P':
      return paint.primary;
    case 'S':
      return paint.secondary;
    case 'T':
      return paint.trim;
    case 'D':
      return new THREE.Color(paint.frame).multiplyScalar(0.55).getHex();
    case 'K':
      return new THREE.Color(paint.frame).lerp(new THREE.Color(0x6c7486), 0.45).getHex();
    case 'C':
    case 'G':
      return paint.glow;
    default:
      return paint.frame;
  }
}

/** How far the emblem stands off the armour (drawn over it, as the markings are). */
const LIFT = 0.006;
/** Armour turned further than this from the badge's facing takes none of it (it would smear). */
const FACING = 0.45;
/** How far under the badge's face it looks for armour, and how far in front (none: armour over the badge, a shoulder's guard, stays clear). */
const DEPTH = 0.2;
const FRONT = 0.01;
/** For finding the armour under the badge's middle from either side. */
const DOUBLE = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

/**
 * The emblem for an insignia's anchor, laid over `under` (the part's own
 * armour on the anchor's joint, without the badge; joint-local) in `paint`
 * (the part's). Null if no armour lies under it.
 */
export function insigniaEmblem(anchor: InsigniaAnchor, under: readonly Underlay[], team: Livery, paint: Livery): THREE.Mesh | null {
  const surface = under.map((u) => u.geometry);
  const n = new THREE.Vector3().fromArray(anchor.normal);
  const up = new THREE.Vector3().fromArray(anchor.up);
  const right = new THREE.Vector3().crossVectors(up, n);
  const center = new THREE.Vector3().fromArray(anchor.center);
  const half = anchor.width / 2;
  // The armour round the badge that faces out as it does.
  const pos: number[] = [];
  const nor: number[] = [];
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const d = new THREE.Vector3();
  for (const g of surface) {
    const P = g.getAttribute('position');
    const N = g.getAttribute('normal');
    const I = g.index;
    const count = I ? I.count : P.count;
    for (let t = 0; t + 2 < count; t += 3) {
      const ids = [0, 1, 2].map((k) => (I ? I.getX(t + k) : t + k));
      ids.forEach((id, k) => v[k].fromBufferAttribute(P, id));
      e1.subVectors(v[1], v[0]);
      e2.subVectors(v[2], v[0]);
      const face = e1.cross(e2);
      const len = face.length();
      if (len < 1e-12 || face.dot(n) / len < FACING) continue;
      // Wholly to one side of the badge: none of it.
      const side = (axis: THREE.Vector3, lim: number) => {
        const s = v.map((p) => d.subVectors(p, center).dot(axis));
        return Math.min(...s) > lim || Math.max(...s) < -lim;
      };
      if (side(right, half) || side(up, half)) continue;
      for (const id of ids) {
        pos.push(P.getX(id), P.getY(id), P.getZ(id));
        if (N) nor.push(N.getX(id), N.getY(id), N.getZ(id));
        else nor.push(n.x, n.y, n.z);
      }
    }
  }
  if (!pos.length) return null;
  const facing = new THREE.BufferGeometry();
  facing.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  facing.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const turn = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n));
  // The projection's box: the badge's width square, from just in front of its face to DEPTH behind.
  const at = center.clone().addScaledVector(n, FRONT - DEPTH / 2);
  const geo = new DecalGeometry(new THREE.Mesh(facing), at, turn, new THREE.Vector3(anchor.width, anchor.width, DEPTH));
  facing.dispose();
  const p = geo.getAttribute('position');
  if (!p || p.count === 0) {
    geo.dispose();
    return null;
  }
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.x * LIFT, p.getY(i) + n.y * LIFT, p.getZ(i) + n.z * LIFT);
  toSheetCell(geo, 'emblem');
  // In a colour that shows on the armour under the badge's middle.
  const ray = new THREE.Raycaster(center.clone().addScaledVector(n, FRONT), n.clone().negate(), 0, DEPTH);
  let hit: { distance: number; slot: Slot | 'G' } | null = null;
  for (const u of under) {
    const h = ray.intersectObject(new THREE.Mesh(u.geometry, DOUBLE), false)[0];
    if (h && (!hit || h.distance < hit.distance)) hit = { distance: h.distance, slot: u.slot };
  }
  const mesh = new THREE.Mesh(geo, emblemMaterial(team, paint.darkArmour, slotColour(hit?.slot ?? 'P', paint)));
  mesh.name = `Emblem / ${anchor.id}`;
  mesh.userData.insignia = anchor.id;
  mesh.renderOrder = 2;
  return mesh;
}
