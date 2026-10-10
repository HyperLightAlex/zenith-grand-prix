// Turns track coordinates (s, d, height, facing) into world-space transforms.
import * as THREE from 'three';
import { frameAt, makeFrame, type Track } from '../../sim/track';

const f = makeFrame();
const vx = new THREE.Vector3();
const vy = new THREE.Vector3();
const vz = new THREE.Vector3();

/** World position of a point on (or above) the road. */
export function trackPoint(track: Track, s: number, d: number, h: number, out: THREE.Vector3): THREE.Vector3 {
  frameAt(track, s, f);
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
  const c = Math.cos(facing);
  const sn = Math.sin(facing);
  vz.set(f.tx * c + f.rx * sn, f.ty * c + f.ry * sn, f.tz * c + f.rz * sn).normalize();
  vy.set(f.ux, f.uy, f.uz).normalize();
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
