import { OrthographicCamera, type PerspectiveCamera } from 'three';

/** Keep world-space proportions when a canvas changes shape, including docked panels. */
export function fitCameraToViewport(camera: PerspectiveCamera | OrthographicCamera, width: number, height: number, orthoHeight?: number): void {
  if (width <= 0 || height <= 0) return;
  const aspect = width / height;
  if (camera instanceof OrthographicCamera) {
    const span = orthoHeight ?? camera.top - camera.bottom;
    const cx = (camera.left + camera.right) / 2;
    const cy = (camera.top + camera.bottom) / 2;
    camera.left = cx - span * aspect / 2;
    camera.right = cx + span * aspect / 2;
    camera.top = cy + span / 2;
    camera.bottom = cy - span / 2;
  } else {
    camera.aspect = aspect;
  }
  camera.updateProjectionMatrix();
}
