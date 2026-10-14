// The camera. It rides the track rather than chasing a world position, so it
// stays behind the mech through bends, and swings to frame both fighters
// when the pilot locks on.
import * as THREE from 'three';
import { MODE, deltaS, hwAt, medianAt, upYAt, type MechState, type Track } from '../../sim/index';
import type { Feel } from '../game/tuning';
import { trackPoint, trackUp } from './trackSpace';

/** Speed the camera treats as "flat out": a forward's top speed on the speed lap. */
const FULL_SPEED = 160;

const toward = (v: number, target: number, rate: number, dt: number) => v + (target - v) * (1 - Math.exp(-rate * dt));
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export type CameraMode = 'intro' | 'play' | 'orbit';

export interface CameraSubject {
  /** Interpolated track position of the mech being followed. */
  s: number;
  d: number;
  /** Interpolated height above the road (in the air, or falling). */
  h?: number;
  mech: MechState;
  /** Lock target position, when there is one. */
  target: { s: number; d: number } | null;
}

/**
 * How far past the road's edge the camera may go: over the barrier, but
 * inside the gantry legs (which stand 3.4 out), so a fight or a swing at the
 * edge of the road is never seen from behind a pillar.
 */
const CAM_EDGE = 1.5;

/** Punch-in timing, seconds: in, held, and back out. */
const PUNCH_IN = 0.05;
/** The boost lurch: in, and how fast it settles (an exponential's time). */
const LURCH_IN = 0.05;
const LURCH_SETTLE = 0.11;
const PUNCH_HOLD = 0.07;
const PUNCH_OUT = 0.3;

export class CameraRig {
  mode: CameraMode = 'play';
  /** 0..1, set by hits; decays on its own. */
  trauma = 0;
  /** Seconds into the intro or orbit move. */
  clock = 0;
  /**
   * In orbit, how far right of centre the subject sits, as a fraction of the
   * screen's width: the garage keeps your mech clear of its menu. A lens
   * shift, so the view does not turn.
   */
  shiftX = 0;
  introLength = 4;
  private yaw = 0;
  private battleYaw = 0;
  private battleW = 0;
  private dSmooth = 0;
  private hSmooth = 0;
  private fov = 64;
  private dist = 14;
  private surgeW = 0;
  private rumbleT = 0;
  private lookBackW = 0;
  private pan = 0;
  private tilt = 0;
  private boostW = 0;
  private punchT = 1;
  private punchAmt = 0;
  private lurchT = 1;
  private lurchAmt = 0;
  private first = true;
  private chasePos = new THREE.Vector3();
  private chaseLook = new THREE.Vector3();
  private battlePos = new THREE.Vector3();
  private battleLook = new THREE.Vector3();
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private up = new THREE.Vector3();

  constructor(readonly camera: THREE.PerspectiveCamera, readonly track: Track, readonly feel: Feel) {}

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount * this.feel.camShake);
  }

  /**
   * A short punch-in on a big moment (a heavy blow, a parry, a guard break, a
   * knockout): the camera darts in and the view narrows for a third of a
   * second, then it is all back as it was. Never a held zoom: the rest of the
   * field has to stay in view. `amount` is 0..1.
   */
  punch(amount: number): void {
    const a = Math.min(1, amount) * this.feel.camPunch;
    if (a <= 0) return;
    // A bigger one takes over; a smaller one during a bigger one is lost in it.
    if (this.punchT >= PUNCH_IN + PUNCH_HOLD || a > this.punchAmt) {
      this.punchAmt = a;
      this.punchT = 0;
    }
  }

  /**
   * The lurch as a boost lights: the view jumps wider in a twentieth of a
   * second and settles back over a third, on top of the steady widening the
   * boost brings, so the kick of it is felt. `amount` is 0..1.5.
   */
  lurch(amount: number): void {
    const a = amount * this.feel.camLurch;
    if (a <= 0) return;
    this.lurchAmt = Math.max(a, this.lurchT < LURCH_IN ? this.lurchAmt : 0);
    this.lurchT = 0;
  }

  reset(): void {
    this.lurchAmt = 0;
    this.first = true;
    this.clock = 0;
    this.trauma = 0;
  }

  update(dt: number, sub: CameraSubject, panX: number, panY: number, lookBack: boolean): void {
    const track = this.track;
    const m = sub.mech;
    const hw = hwAt(track, sub.s);
    // In a fork the camera stays on the mech's own side of the middle wall.
    const med = medianAt(track, sub.s);
    const side = (d: number) => (med > 0.5 ? (sub.d >= 0 ? Math.max(d, med + 1) : Math.min(d, -med - 1)) : d);
    // Follow a mech up into the air, and a little way down when it falls.
    this.hSmooth = toward(this.hSmooth, Math.max(-25, sub.h ?? 0), 7, dt > 0 ? dt : 1);
    this.clock += dt;
    const F = this.feel;
    const speedFrac = Math.min(1.45, m.speed / FULL_SPEED);
    const inBattle = m.mode === MODE.BATTLE && sub.target !== null && !m.retired;
    this.battleW = toward(this.battleW, inBattle ? 1 : 0, 6, dt);
    // A carve's burst opens the view like a boost.
    this.boostW = toward(this.boostW, m.boosting || (m.carveT > 0 && m.mode === MODE.SPEED) ? 1 : 0, 5, dt);
    this.surgeW = toward(this.surgeW, m.overdriveT > 0 ? 1 : 0, 5, dt);
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
    // The camera drops back as the mech gathers speed and is dragged in again
    // under boost, while the field of view opens: the road pours past.
    // (Paused, dt is zero; the distance and field of view still follow the
    // tuning sliders so a change made from the pause menu shows at once.)
    const sdt = dt > 0 ? dt : 1 / 20;
    this.dist = toward(this.dist, F.camDist + speedFrac * F.camDistSpeed - (this.boostW + this.surgeW) * 1.5, 3, sdt);
    const dist = this.dist;
    const height = F.camHeight + this.tilt * 6 + this.hSmooth;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const camD = side(THREE.MathUtils.clamp(this.dSmooth - sy * dist, -(hw + CAM_EDGE), hw + CAM_EDGE));
    trackPoint(track, sub.s - cy * dist, camD, height, this.chasePos);
    const ahead = F.camLookAhead;
    trackPoint(track, sub.s + cy * ahead, side(sub.d + sy * ahead), F.camLookHeight - this.tilt * 4 + this.hSmooth * 0.9, this.chaseLook);

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
      const back = F.camLockDist + Math.min(10, sep * 0.22);
      const shoulder = 3.6;
      const bd = side(THREE.MathUtils.clamp(sub.d - ud * back + us * shoulder, -(hw + CAM_EDGE), hw + CAM_EDGE));
      trackPoint(track, sub.s - us * back - ud * shoulder, bd, F.camLockHeight + Math.min(4, sep * 0.08) + this.hSmooth, this.battlePos);
      const f = Math.min(0.6, 8 / sep + 0.35);
      trackPoint(track, sub.s + ds * f, side(sub.d + dd * f), 3.8 + this.hSmooth, this.battleLook);
    } else if (!sub.target) {
      this.battleYaw = this.yaw;
    }

    const w = this.battleW * this.battleW * (3 - 2 * this.battleW);
    const pos = this.a.copy(this.chasePos).lerp(this.battlePos, sub.target ? w : 0);
    const look = this.b.copy(this.chaseLook).lerp(this.battleLook, sub.target ? w : 0);
    let fov = Math.min(112, F.camFov + speedFrac * F.camFovSpeed + (this.boostW + this.surgeW * 1.2) * F.camFovBoost - w * 3);

    // ---- scripted moves
    if (this.mode === 'intro') {
      // Sweep from in front of the grid round to the chase position.
      const k = Math.min(1, this.clock / this.introLength);
      const e = k * k * (3 - 2 * k);
      const ang = (1 - e) * 2.75;
      const r = F.camDist + (1 - e) * 16;
      const h = F.camHeight + (1 - e) * 4;
      trackPoint(track, sub.s - Math.cos(ang) * r, sub.d - Math.sin(ang) * r * 0.8, h, pos);
      trackPoint(track, sub.s + e * ahead, sub.d, 3.4, look);
      fov = 50 + e * 12;
    } else if (this.mode === 'orbit') {
      const ang = this.clock * 0.35 + 2.4;
      trackPoint(track, sub.s - Math.cos(ang) * 17, sub.d - Math.sin(ang) * 15, 5 + Math.sin(this.clock * 0.3) * 1.5, pos);
      trackPoint(track, sub.s, sub.d, 4.4, look);
      fov = 50;
    }

    // ---- punch-in: dart toward what the camera is looking at
    let punch = 0;
    if (this.punchAmt > 0 && this.mode === 'play') {
      this.punchT += dt;
      const t = this.punchT;
      const env = t < PUNCH_IN ? t / PUNCH_IN : t < PUNCH_IN + PUNCH_HOLD ? 1 : Math.max(0, 1 - (t - PUNCH_IN - PUNCH_HOLD) / PUNCH_OUT);
      punch = env * env * (3 - 2 * env) * this.punchAmt;
      if (env <= 0) this.punchAmt = 0;
      pos.lerp(look, punch * 0.22);
    }

    // ---- apply, with roll from the banking and any shake. Upside down in a
    // loop or a corkscrew, the camera turns over with the road.
    const flat = THREE.MathUtils.clamp(upYAt(track, sub.s), 0, 1);
    trackUp(track, sub.s, this.up).lerp(WORLD_UP, 0.45 * flat).normalize();
    const cam = this.camera;
    cam.position.copy(pos);
    cam.up.copy(this.up);
    cam.lookAt(look);
    if (this.trauma > 0.001 && dt > 0) {
      const t2 = this.trauma * this.trauma;
      cam.position.x += (Math.random() - 0.5) * 1.3 * t2;
      cam.position.y += (Math.random() - 0.5) * 1.3 * t2;
      cam.rotateZ((Math.random() - 0.5) * 0.07 * t2);
      this.trauma = Math.max(0, this.trauma - dt * 2.2);
    }
    // Road rumble: a fine tremble that grows with speed, so pace is felt even on a straight.
    if (this.mode === 'play' && F.camRumble > 0 && !m.retired && dt > 0) {
      this.rumbleT += dt * (38 + speedFrac * 30);
      const amp = Math.max(0, speedFrac - 0.45) * (0.035 + this.boostW * 0.03 + this.surgeW * 0.05) * F.camRumble;
      cam.position.y += Math.sin(this.rumbleT) * amp;
      cam.position.x += Math.sin(this.rumbleT * 1.7 + 1.3) * amp * 0.6;
      cam.rotateZ(Math.sin(this.rumbleT * 0.63) * amp * 0.012);
    }
    this.fov = toward(this.fov, fov, 6, sdt);
    let lurch = 0;
    if (this.lurchAmt > 0 && this.mode === 'play') {
      this.lurchT += dt;
      const t = this.lurchT;
      const env = t < LURCH_IN ? t / LURCH_IN : Math.exp(-(t - LURCH_IN) / LURCH_SETTLE);
      lurch = this.lurchAmt * env;
      if (env < 0.01) this.lurchAmt = 0;
    }
    const shown = this.fov - punch * 8 + lurch;
    if (Math.abs(cam.fov - shown) > 0.01) {
      cam.fov = shown;
      cam.updateProjectionMatrix();
    }
    const shift = this.mode === 'orbit' ? this.shiftX : 0;
    const view = cam.view;
    if (shift !== 0 && (!view || !view.enabled || view.offsetX !== -shift)) cam.setViewOffset(1, 1, -shift, 0, 1, 1);
    else if (shift === 0 && view?.enabled) cam.clearViewOffset();
  }
}
