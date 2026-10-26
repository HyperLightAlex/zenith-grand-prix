// Matrices for what never moves. three.js recomputes every object's matrix
// every frame unless told not to; a circuit's scenery is hundreds of objects
// of which a handful move after they are built (the sky kept on the camera,
// cards turned to face it, a ring that spins). Those are marked where they
// are made (moves()); freezeStill() computes the rest once and stops
// updating them. tests/still-scenery.test.ts builds every circuit and runs
// its scenery's updates: nothing frozen may be moved by them.
import type * as THREE from 'three';

/** Mark an object the scenery moves after it is built (every frame, or now and then). */
export function moves<T extends THREE.Object3D>(o: T): T {
  o.userData.moves = true;
  return o;
}

/**
 * Compute the matrices under `root` once and stop updating them, except
 * for objects marked with moves(). Anything added later updates as usual.
 */
export function freezeStill(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.userData.moves) o.matrixAutoUpdate = false;
  });
}

/**
 * Keep the matrices under `root` up to date only while it is shown: hidden
 * (the hangar during a race, the circuit in the hangar), nothing under it is
 * drawn, and the frame's matrix update skips it. (three.js's own
 * matrixWorldAutoUpdate does not: it still walks every child.) Anything
 * that asks for a hidden object's place itself (getWorldPosition and the
 * like) still gets it, worked out then. For a root whose parent does not
 * move.
 */
export function updateOnlyWhileShown(root: THREE.Object3D): void {
  const update = root.updateMatrixWorld.bind(root);
  root.updateMatrixWorld = (force?: boolean) => {
    if (root.visible) update(force);
  };
}
