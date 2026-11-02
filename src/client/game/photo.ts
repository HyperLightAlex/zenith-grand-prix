// Photo mode: the race (or a replay) held still, and the camera posed by
// hand round whichever mech it frames, then the picture saved as a PNG. Read
// from the pad, the keys, the mouse and the touch screen alike.

import { BTN, type MechInput } from '../../sim/index';
import type { PhotoCam } from '../render/cameraRig';
import type { Device, MenuInput } from '../input/input';

/** How far the camera may go, and the lens's range. */
const DIST = [3.5, 45] as const;
const FOV = [12, 95] as const;
const PITCH = [-0.25, 1.35] as const;

export type PhotoAction = 'take' | 'look' | 'hints' | 'back';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class PhotoMode {
  /** What it was opened from: the pause menu over a race, or a replay. */
  from: 'paused' | 'replay' | null = null;
  hintsHidden = false;
  private drag: { id: number; x: number; y: number } | null = null;
  private pinch = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private detach: (() => void) | null = null;

  get active(): boolean {
    return this.from !== null;
  }

  /** Open over `el` (the picture, which takes the drags, pinches and wheel), posing `cam`. */
  open(from: 'paused' | 'replay', cam: PhotoCam, el: HTMLElement): void {
    this.from = from;
    this.hintsHidden = false;
    Object.assign(cam, { yaw: 0.65, pitch: 0.12, dist: 12, fov: 42, roll: 0 });
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
        if (this.pinchDist > 0 && d > 0) cam.dist = clamp(cam.dist * (this.pinchDist / d), DIST[0], DIST[1]);
        this.pinchDist = d;
        return;
      }
      if (!this.drag || this.drag.id !== e.pointerId) return;
      const k = 3 / Math.max(300, el.clientWidth);
      cam.yaw -= (e.clientX - this.drag.x) * k;
      cam.pitch = clamp(cam.pitch + (e.clientY - this.drag.y) * k, PITCH[0], PITCH[1]);
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
      cam.dist = clamp(cam.dist * Math.exp(e.deltaY * 0.0012), DIST[0], DIST[1]);
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

  close(): void {
    this.from = null;
    this.detach?.();
    this.detach = null;
    this.drag = null;
    this.pinch.clear();
  }

  private spread(): number {
    const [a, b] = [...this.pinch.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  /**
   * A frame of posing: the sticks and keys held turn, raise, zoom and tilt
   * the camera; presses are returned as actions. (On the keys W and S raise
   * the camera; Z and C zoom: the triggers are the pad's.)
   */
  frame(dt: number, cam: PhotoCam, input: MechInput, camX: number, camY: number, device: Device, presses: readonly MenuInput[]): PhotoAction[] {
    const turn = 1.7 * dt;
    cam.yaw -= (input.mx + camX) * turn;
    cam.pitch = clamp(cam.pitch + input.my * 0.9 * dt, PITCH[0], PITCH[1]);
    let zoom = camY * 1.2;
    if (device === 'pad') zoom += input.brake - input.throttle;
    if (input.buttons & BTN.TNEXT) zoom -= 1;
    if (input.buttons & BTN.TPREV) zoom += 1;
    cam.dist = clamp(cam.dist * Math.exp(zoom * 1.1 * dt), DIST[0], DIST[1]);
    // The D-pad's sides (the keys 4 and 2) tilt the picture.
    if (input.cmd === 4) cam.roll = clamp(cam.roll - 0.6 * dt, -0.6, 0.6);
    if (input.cmd === 2) cam.roll = clamp(cam.roll + 0.6 * dt, -0.6, 0.6);
    const acts: PhotoAction[] = [];
    for (const p of presses) {
      if (p === 'lb') cam.fov = clamp(cam.fov + 6, FOV[0], FOV[1]);
      else if (p === 'rb') cam.fov = clamp(cam.fov - 6, FOV[0], FOV[1]);
      else if (p === 'confirm') acts.push('take');
      else if (p === 'y') acts.push('look');
      else if (p === 'x') acts.push('hints');
      else if (p === 'back' || p === 'pause') acts.push('back');
    }
    return [...new Set(acts)];
  }
}

/** A photo's file name: the circuit and when. */
export function photoName(circuit: string, when = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${when.getFullYear()}-${p(when.getMonth() + 1)}-${p(when.getDate())}-${p(when.getHours())}${p(when.getMinutes())}${p(when.getSeconds())}`;
  return `zenith-gp-${circuit.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp}.png`;
}
