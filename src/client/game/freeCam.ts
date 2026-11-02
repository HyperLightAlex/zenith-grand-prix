// A replay's free camera, by hand: turned round the mech being followed and
// in and out, while the replay plays. The right stick turns it and the
// triggers zoom; on a desktop, drag the picture to turn it and the wheel to
// zoom; on a touch screen, drag and pinch. Taking hold of it from any other
// camera switches the replay to it.

import type { MechInput } from '../../sim/index';
import { FREE_DIST, FREE_PITCH, type PhotoCam } from '../render/cameraRig';
import type { Device } from '../input/input';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class FreeCamControl {
  private drag: { id: number; x: number; y: number } | null = null;
  private pinch = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private detach: (() => void) | null = null;
  /** Drags and wheel turns since the last frame, waiting to be applied. */
  private turnX = 0;
  private turnY = 0;
  private zoom = 0;
  private touched = false;

  get attached(): boolean {
    return this.detach !== null;
  }

  /** Listen on `el` (the picture) for drags, pinches and the wheel. */
  attach(el: HTMLElement): void {
    if (this.detach) return;
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'touch') this.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch.size >= 2) {
        this.drag = null;
        this.pinchDist = this.spread();
      } else this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (this.pinch.has(e.pointerId)) this.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch.size >= 2) {
        const d = this.spread();
        if (this.pinchDist > 0 && d > 0) {
          this.zoom += Math.log(this.pinchDist / d);
          this.touched = true;
        }
        this.pinchDist = d;
        return;
      }
      if (!this.drag || this.drag.id !== e.pointerId) return;
      const k = 3 / Math.max(300, el.clientWidth);
      this.turnX += (e.clientX - this.drag.x) * k;
      this.turnY += (e.clientY - this.drag.y) * k;
      if (e.clientX !== this.drag.x || e.clientY !== this.drag.y) this.touched = true;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
    };
    const up = (e: PointerEvent) => {
      this.pinch.delete(e.pointerId);
      if (this.drag?.id === e.pointerId) this.drag = null;
      if (this.pinch.size < 2) this.pinchDist = 0;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.zoom += e.deltaY * 0.0012;
      this.touched = true;
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    this.detach = () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }

  release(): void {
    this.detach?.();
    this.detach = null;
    this.drag = null;
    this.pinch.clear();
    this.turnX = this.turnY = this.zoom = 0;
    this.touched = false;
  }

  private spread(): number {
    const [a, b] = [...this.pinch.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  /**
   * Whether the camera was taken hold of since the last frame (the stick
   * pushed, the triggers pulled, the picture dragged, pinched or wheeled).
   */
  wanted(camX: number, camY: number, input: MechInput, device: Device): boolean {
    const stick = device === 'pad' && (Math.abs(camX) > 0.3 || Math.abs(camY) > 0.3 || input.throttle > 0.3 || input.brake > 0.3);
    return stick || this.touched;
  }

  /** A frame of turning `cam` by what was done since the last. */
  frame(dt: number, cam: PhotoCam, camX: number, camY: number, input: MechInput, device: Device): void {
    let yaw = -this.turnX;
    let pitch = this.turnY;
    let zoom = this.zoom;
    if (device === 'pad') {
      yaw -= camX * 2.1 * dt;
      pitch += camY * 1.3 * dt;
      // The triggers: the left out, the right in.
      zoom += (input.brake - input.throttle) * 1.2 * dt;
    }
    cam.yaw += yaw;
    cam.yaw -= Math.round(cam.yaw / (Math.PI * 2)) * Math.PI * 2;
    cam.pitch = clamp(cam.pitch + pitch, FREE_PITCH[0], FREE_PITCH[1]);
    cam.dist = clamp(cam.dist * Math.exp(zoom), FREE_DIST[0], FREE_DIST[1]);
    this.turnX = this.turnY = this.zoom = 0;
    this.touched = false;
  }
}
