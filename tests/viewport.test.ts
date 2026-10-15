import { describe, expect, it } from 'vitest';
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import { fitCameraToViewport } from '../src/client/render/viewport';

describe('canvas aspect changes', () => {
  for (const camera of [new PerspectiveCamera(40, 16 / 9, .1, 500), new OrthographicCamera(-10, 10, 6, -6, .1, 500)]) {
    it(`keeps a world-space square square in pixels with ${camera.type}`, () => {
      for (const [width, height] of [[1280,720], [720,900], [1920,600], [1280,720]]) {
        fitCameraToViewport(camera, width, height);
        const origin = new Vector3(0, 0, -20).project(camera);
        const x = new Vector3(1, 0, -20).project(camera);
        const y = new Vector3(0, 1, -20).project(camera);
        expect((x.x - origin.x) * width).toBeCloseTo((y.y - origin.y) * height, 8);
      }
    });
  }
  it('preserves an offset orthographic framing and ignores collapsed panels', () => {
    const camera = new OrthographicCamera(-5, 11, 8, -4, .1, 500);
    fitCameraToViewport(camera, 720, 900, 20);
    expect((camera.left + camera.right) / 2).toBe(3);
    expect((camera.top + camera.bottom) / 2).toBe(2);
    expect(camera.top - camera.bottom).toBe(20);
    const before = camera.projectionMatrix.clone();
    fitCameraToViewport(camera, 0, 900);
    fitCameraToViewport(camera, 720, 0);
    expect(camera.projectionMatrix.equals(before)).toBe(true);
  });
});
