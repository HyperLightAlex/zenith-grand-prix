// Turns track coordinates (s, d, height, facing) into world-space transforms.
import * as THREE from 'three';
import { frameAt, makeFrame, sampleArray, type Track } from '../../sim/track';

const f = makeFrame();
const vx = new THREE.Vector3();
const vy = new THREE.Vector3();
const vz = new THREE.Vector3();
const ahead = new THREE.Vector3();
const right = new THREE.Vector3();
/** How far either side of a point a fork route's slope is taken over. */
const ROUTE_DS = 2;

/**
 * Where a fork draws each route: how far across and up from the centreline
 * frame a point on that side is moved. Zero everywhere but in a fork.
 */
export function forkOffset(track: Track, s: number, d: number): [shift: number, rise: number] {
  if (track.forks.length === 0 || d === 0) return [0, 0];
  return d < 0 ? [sampleArray(track, track.shiftL, s), sampleArray(track, track.riseL, s)] : [sampleArray(track, track.shiftR, s), sampleArray(track, track.riseR, s)];
}

/** World position of a point on (or above) the road. */
export function trackPoint(track: Track, s: number, d: number, h: number, out: THREE.Vector3): THREE.Vector3 {
  frameAt(track, s, f);
  const [sh, rh] = forkOffset(track, s, d);
  d += sh;
  h += rh;
  return out.set(f.px + f.rx * d + f.ux * h, f.py + f.ry * d + f.uy * h, f.pz + f.rz * d + f.uz * h);
}

/** World direction of a track-plane vector (along = forward, across = right). */
export function trackDir(track: Track, s: number, along: number, across: number, out: THREE.Vector3): THREE.Vector3 {
  frameAt(track, s, f);
  return out.set(f.tx * along + f.rx * across, f.ty * along + f.ry * across, f.tz * along + f.rz * across).normalize();
}

export function trackUp(track: Track, s: number, out: THREE.Vector3): THREE.Vector3 {
  frameAt(track, s, f);
  return out.set(f.ux, f.uy, f.uz).normalize();
}

/**
 * Full transform for something standing on the road. Models face +Z, so the
 * basis is (left, up, forward) with `facing` measured from the driving
 * direction, positive to the right.
 */
export function trackMatrix(track: Track, s: number, d: number, h: number, facing: number, out: THREE.Matrix4): THREE.Matrix4 {
  frameAt(track, s, f);
  const [sh, rh] = forkOffset(track, s, d);
  // In a fork, `facing` is from the way the mech's own route runs, which is
  // the road's moved across (and up) as the route is drawn apart.
  let across = 0;
  let rise = 0;
  if (sh !== 0 || rh !== 0) {
    const [sa, ra] = forkOffset(track, s - ROUTE_DS, d);
    const [sb, rb] = forkOffset(track, s + ROUTE_DS, d);
    across = (sb - sa) / (2 * ROUTE_DS);
    rise = (rb - ra) / (2 * ROUTE_DS);
  }
  d += sh;
  h += rh;
  // The route's way ahead, its right and its up.
  ahead.set(f.tx + f.rx * across + f.ux * rise, f.ty + f.ry * across + f.uy * rise, f.tz + f.rz * across + f.uz * rise).normalize();
  right.set(f.rx, f.ry, f.rz).addScaledVector(ahead, -(f.rx * ahead.x + f.ry * ahead.y + f.rz * ahead.z)).normalize();
  vy.crossVectors(right, ahead).normalize();
  const c = Math.cos(facing);
  const sn = Math.sin(facing);
  vz.copy(ahead).multiplyScalar(c).addScaledVector(right, sn).normalize();
  vx.crossVectors(vy, vz).normalize();
  vz.crossVectors(vx, vy).normalize();
  out.makeBasis(vx, vy, vz);
  out.setPosition(f.px + f.rx * d + f.ux * h, f.py + f.ry * d + f.uy * h, f.pz + f.rz * d + f.uz * h);
  return out;
}

/** Angle of a world-space horizontal direction relative to the road at s (0 = ahead, positive right). */
export function worldDirToTrackAngle(track: Track, s: number, dx: number, dz: number): number {
  frameAt(track, s, f);
  return Math.atan2(dx * f.rx + dz * f.rz, dx * f.tx + dz * f.tz);
}
