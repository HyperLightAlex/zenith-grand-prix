import * as THREE from 'three';
import atlasUrl from './assets/sunhawk-details.png?url';
import { toonGradient } from '../palette';

let material: THREE.MeshToonMaterial;
let loading: Promise<void> | undefined;

/** One small shared atlas for the seven conforming, UV-mapped armor overlays. */
export function preloadSunhawkDetails(): Promise<void> {
  return loading ??= new THREE.TextureLoader().loadAsync(atlasUrl).then((map) => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.flipY = false; // UVs already follow glTF's top-left image convention.
    map.anisotropy = 4;
    map.userData.shared = true;
    material = new THREE.MeshToonMaterial({ map, gradientMap: toonGradient(), transparent: true,
      alphaTest: .03, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  });
}

export function sunhawkDetailMaterial(): THREE.MeshToonMaterial {
  if (!material) throw new Error('Sunhawk detail atlas must load before building a frame');
  return material;
}
