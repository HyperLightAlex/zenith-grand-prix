// The camera. It rides the track rather than chasing a world position, so it
// stays behind the mech through bends, and swings to frame both fighters
// when the pilot locks on.
import * as THREE from 'three';
import { MODE, PACE, deltaS, type MechState, type Track } from '../../sim/index';
import { trackPoint, trackUp } from './trackSpace';

const toward = (v: number, target: number, rate: number, dt: number) => v + (target - v) * (1 - Math.exp(-rate * dt));
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export type CameraMode = 'intro' | 'play' | 'orbit';

export interface CameraSubject {
  /** Interpolated track position of the mech being followed. */
  s: number;
  d: number;
  mech: MechState;
  /** Lock target position, when there is one. */
  target: { s: number; d: number } | null;
}

export class CameraRig {
  mode: CameraMode = 'play';
  /** 0..1, set by hits; decays on its own. */
  trauma = 0;
  /** Seconds into the intro or orbit move. */
  clock = 0;
  introLength = 4;
  private yaw = 0;
  private battleYaw = 0;
  private battleW = 0;
  private dSmooth = 0;
  private fov = 64;
  private dist = 16;
  private lookBackW = 0;
  private pan = 0;
  private tilt = 0;
  private boostW = 0;
  private first = true;
  private chasePos = new THREE.Vector3();
  private chaseLook = new THREE.Vector3();
  private battlePos = new THREE.Vector3();
  private battleLook = new THREE.Vector3();
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private up = new THREE.Vector3();

  constructor(readonly camera: THREE.PerspectiveCamera, readonly track: Track) {}

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  reset(): void {
    this.first = true;
    this.clock = 0;
    this.trauma = 0;
  }

  update(dt: number, sub: CameraSubject, panX: number, panY: number, lookBack: boolean): void {
    const track = this.track;
    const m = sub.mech;
    const hw = track.halfWidth;
    this.clock += dt;
    const speedFrac = Math.min(1.4, m.speed / PACE);
    const inBattle = m.mode === MODE.BATTLE && sub.target !== null && !m.retired;
    this.battleW = toward(this.battleW, inBattle ? 1 : 0, 6, dt);
    this.boostW = toward(this.boostW, m.boosting ? 1 : 0, 5, dt);
    this.lookBackW = toward(this.lookBackW, lookBack ? 1 : 0, 14, dt);
    this.pan = toward(this.pan, inBattle ? 0 : panX * 1.15, 9, dt);
    this.tilt = toward(this.tilt, panY * 0.5, 9, dt);
    if (this.first) {
      this.dSmooth = sub.d;
      this.yaw = 0;
      this.first = false;
    }
    this.dSmooth = toward(this.dSmooth, sub.d, 7, dt);

    // ---- chase view: behind the mech along the road
    const heading = m.mode === MODE.SPEED ? m.heading : 0;
    this.yaw = toward(this.yaw, heading * 0.55, 6, dt);
    const yaw = this.yaw + this.pan + this.lookBackW * Math.PI;
    this.dist = toward(this.dist, 15 + speedFrac * 2.6 - this.boostW * 2.2, 3, dt);
    const dist = this.dist;
    const height = 9.4 + this.tilt * 6;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const camD = THREE.MathUtils.clamp(this.dSmooth - sy * dist, -(hw + 4), hw + 4);
    trackPoint(track, sub.s - cy * dist, camD, height, this.chasePos);
    trackPoint(track, sub.s + cy * 20, sub.d + sy * 20, 3.2 - this.tilt * 4, this.chaseLook);

    // ---- battle view: over the shoulder, both fighters in frame
    if (sub.target && this.battleW > 0.001) {
      const ds = deltaS(track, sub.target.s, sub.s);
      const dd = sub.target.d - sub.d;
      const sep = Math.hypot(ds, dd) || 1e-3;
      const want = Math.atan2(dd, ds);
      // Swing round smoothly, the short way.
      let diff = want - this.battleYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.battleYaw += diff * (1 - Math.exp(-(this.battleW < 0.5 ? 30 : 5.5) * dt));
      const us = Math.cos(this.battleYaw);
      const ud = Math.sin(this.battleYaw);
      const back = 15 + Math.min(10, sep * 0.22);
      const side = 3.6;
      const bd = THREE.MathUtils.clamp(sub.d - ud * back + us * side, -(hw + 7), hw + 7);
      trackPoint(track, sub.s - us * back - ud * side, bd, 9.6 + Math.min(4, sep * 0.08), this.battlePos);
      const f = Math.min(0.6, 8 / sep + 0.35);
      trackPoint(track, sub.s + ds * f, sub.d + dd * f, 3.8, this.battleLook);
    } else if (!sub.target) {
      this.battleYaw = this.yaw;
    }

    const w = this.battleW * this.battleW * (3 - 2 * this.battleW);
    const pos = this.a.copy(this.chasePos).lerp(this.battlePos, sub.target ? w : 0);
    const look = this.b.copy(this.chaseLook).lerp(this.battleLook, sub.target ? w : 0);
    let fov = 62 + Math.min(1.25, speedFrac) * 13 + this.boostW * 11 - w * 8;

    // ---- scripted moves
    if (this.mode === 'intro') {
      // Sweep from in front of the grid round to the chase position.
      const k = Math.min(1, this.clock / this.introLength);
      const e = k * k * (3 - 2 * k);
      const ang = (1 - e) * 2.75;
      const r = 15 + (1 - e) * 16;
      const h = 9.4 + (1 - e) * 3;
      trackPoint(track, sub.s - Math.cos(ang) * r, sub.d - Math.sin(ang) * r * 0.8, h, pos);
      trackPoint(track, sub.s + e * 20, sub.d, 3.4, look);
      fov = 50 + e * 12;
    } else if (this.mode === 'orbit') {
      const ang = this.clock * 0.35 + 2.4;
      trackPoint(track, sub.s - Math.cos(ang) * 17, sub.d - Math.sin(ang) * 15, 5 + Math.sin(this.clock * 0.3) * 1.5, pos);
      trackPoint(track, sub.s, sub.d, 4.4, look);
      fov = 50;
    }

    // ---- apply, with roll from the banking and any shake
    trackUp(track, sub.s, this.up).lerp(WORLD_UP, 0.45).normalize();
    const cam = this.camera;
    cam.position.copy(pos);
    cam.up.copy(this.up);
    cam.lookAt(look);
    if (this.trauma > 0.001) {
      const t2 = this.trauma * this.trauma;
      cam.position.x += (Math.random() - 0.5) * 1.3 * t2;
      cam.position.y += (Math.random() - 0.5) * 1.3 * t2;
      cam.rotateZ((Math.random() - 0.5) * 0.07 * t2);
      this.trauma = Math.max(0, this.trauma - dt * 2.2);
    }
    this.fov = toward(this.fov, fov, 6, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }
}
