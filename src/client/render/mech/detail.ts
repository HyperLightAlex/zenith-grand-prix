import * as THREE from 'three';
import type { MechRig } from './rig';

/** Hysteresis stops geometry flicker when a racer hovers near a threshold. */
export function detailLevelForPixels(pixels: number, current: number): number {
  if (current === 0) return pixels < 65 ? 2 : pixels < 180 ? 1 : 0;
  if (current === 1) return pixels > 220 ? 0 : pixels < 65 ? 2 : 1;
  return pixels > 220 ? 0 : pixels > 85 ? 1 : 2;
}

export function setMechDetail(rig: MechRig, level: number): void {
  if (!rig.detailLevels.length) return;
  rig.detailLevel = Math.max(0, Math.min(rig.detailLevels.length - 1, Math.round(level)));
  rig.detailLevels.forEach((groups, i) => groups.forEach((group) => { group.visible = i === rig.detailLevel; }));
}

const center = new THREE.Vector3();
const eye = new THREE.Vector3();
export function updateMechDetail(rig: MechRig, camera: THREE.PerspectiveCamera, viewportHeight: number): void {
  if (rig.detailLevels.length < 2) return;
  rig.root.getWorldPosition(center);
  center.y += rig.dims.height * .5;
  camera.getWorldPosition(eye);
  const pixels = rig.dims.height * camera.projectionMatrix.elements[5] * viewportHeight / (2 * Math.max(1, center.distanceTo(eye)));
  const level = detailLevelForPixels(pixels, rig.detailLevel);
  if (level !== rig.detailLevel) setMechDetail(rig, level);
}
