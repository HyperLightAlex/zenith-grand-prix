// The camera. It rides the track rather than chasing a world position, so it
// stays behind the mech through bends, and swings to frame both fighters
// when the pilot locks on.
import * as THREE from 'three';
import { MODE, deltaS, hwAt, kappaAt, medianAt, upYAt, type MechState, type Track } from '../../sim/index';
import type { Feel } from '../game/tuning';
import { trackMatrix, trackPoint, trackUp } from './trackSpace';

/** Speed the camera treats as "flat out": a forward's top speed on the speed lap. */
const FULL_SPEED = 160;

const toward = (v: number, target: number, rate: number, dt: number) => v + (target - v) * (1 - Math.exp(-rate * dt));
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * intro: the sweep round the grid. play: the chase. orbit: circling (the
 * garage, the results). tv: a broadcast's trackside cameras, cutting from
 * one to the next (replays). photo: posed by hand (photo mode). podium: the
 * podium's shots (round `anchor`).
 */
export type CameraMode = 'intro' | 'play' | 'orbit' | 'tv' | 'photo' | 'podium';

/** Photo mode's camera, round the mech it frames: turned, raised, how far, the lens, and tilted. */
export interface PhotoCam {
  /** Radians round the mech, 0 behind it. */
  yaw: number;
  /** Radians up (negative: down). */
  pitch: number;
  dist: number;
  /** The lens, degrees (vertical). */
  fov: number;
  /** Radians of roll. */
  roll: number;
}

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

/**
 * The trackside cameras' spots, in order of preference: how far out past the
 * road's edge and how high. Beside the barrier at head height; up over the
 * boards (which stand 5.5 out, to 14 high); on a crane over the barrier.
 */
const TV_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [9, 7.5],
  [10, 17],
  [2.5, 13],
];
/** Where along its way up to a trackside camera the mech is checked to be in sight (0: where it is now; 1: just past). */
const TV_PROBES = [0, 0.35, 0.7, 1];

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
  /** In orbit, how far above centre, as a fraction of the screen's height (a phone held upright: the menu is below). */
  shiftY = 0;
  /** In orbit, the lens (degrees, vertical): wider on a phone held upright, so the mech fits above the menu. */
  orbitFov = 50;
  /**
   * In orbit, circle a fixed frame (the garage's hangar: the mech at its
   * origin facing +Z) instead of following the road, which may bend.
   */
  orbitFrame: THREE.Matrix4 | null = null;
  /**
   * In orbit, the drift held: the camera stays where it is unless turned by
   * hand (turn: the custom mech editor's right stick, or a drag across the bay).
   */
  private orbitHeld = false;
  get turntable(): boolean { return this.orbitHeld; }
  set turntable(held: boolean) {
    // Leaving customization returns to the usual view and its automatic pan.
    if (this.orbitHeld && !held) this.restartOrbit();
    this.orbitHeld = held;
  }
  /** Seconds the orbit has drifted, and how far it has been turned by hand (radians). */
  private orbitT = 0;
  private orbitTurn = 0;
  private orbitElevation = 0;
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
  /** Photo mode's camera (mode 'photo'). */
  photo: PhotoCam = { yaw: 0.6, pitch: 0.15, dist: 13, fov: 45, roll: 0 };
  /**
   * A set the camera works round instead of the mech (the podium, facing its
   * +z, the middle of it `anchorLook` up): the podium's shots, and photo
   * mode's centre while it is up.
   */
  anchor: THREE.Matrix4 | null = null;
  anchorLook = 9;
  /** How far out in front of the anchor the podium's cameras may go; seconds into its shots. */
  podiumReach = 40;
  podiumT = 0;
  /**
   * Whether a camera at `from` can see `to` with nothing of the circuit in
   * between (set by the race view): the trackside cameras are placed, and
   * cut away, by it.
   */
  sightline: ((from: THREE.Vector3, to: THREE.Vector3) => boolean) | null = null;
  /** The trackside camera in use (mode 'tv'): where along the road, how far out and how high, and which side. */
  private tvS = 0;
  private tvD = 0;
  private tvUp = 7.5;
  private tvSide = 1;
  private tvFresh = true;
  /** Checking the shot's line to the mech, and how long it has been blocked. */
  private tvCheckT = 0;
  private tvBlockedT = 0;
  private tvPos = new THREE.Vector3();
  private tvProbe = new THREE.Vector3();
  private photoFrame = new THREE.Matrix4();
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
    this.tvFresh = true;
    this.trauma = 0;
    this.restartOrbit();
  }

  /** The orbit (and the intro) from its start. */
  restartOrbit(): void {
    this.clock = 0;
    this.orbitT = 0;
    this.orbitTurn = 0;
    this.orbitElevation = 0;
  }

  /**
   * Turn the orbit by hand: positive brings the near side of what it circles
   * to the right, as looking right does, or dragging it to the right.
   */
  turn(rad: number, elevation = 0): void {
    this.orbitTurn += rad;
    // Keep the inspection camera above the floor and short of the overhead pole.
    this.orbitElevation = THREE.MathUtils.clamp(this.orbitElevation + elevation, -0.15, 0.95);
  }

  /**
   * Place the next trackside camera: a way up the road from the mech, on the
   * outside of any bend, beside the barrier at head height. Where the boards,
   * walls, rock or stands would be in the way of the mech coming up the road
   * to it, it goes higher, nearer or farther, or to the other side; failing
   * all of those, wherever the most of the mech's way is seen.
   */
  private placeTv(sub: CameraSubject): void {
    const track = this.track;
    const ahead = 150 + Math.max(0, sub.mech.speed - 60) * 0.6;
    const k = kappaAt(track, sub.s + ahead);
    const outside = Math.abs(k) > 1 / 900 ? (k > 0 ? -1 : 1) : this.tvSide;
    const see = this.sightline;
    let best = -1;
    for (const along of [ahead, ahead * 0.7, ahead * 1.3]) {
      const s = sub.s + along;
      const hw = hwAt(track, s);
      for (const side of [outside, -outside]) {
        for (const [out, up] of TV_SPOTS) {
          const d = side * (hw + out);
          // How much of the mech's way up to the camera, and past it, is in
          // sight, down to its feet (so nothing near the lens hides the road).
          let seen = TV_PROBES.length;
          if (see) {
            trackPoint(track, s, d, up, this.tvPos);
            seen = 0;
            for (const t of TV_PROBES) {
              trackPoint(track, sub.s + (along + 25) * t, sub.d * (1 - t), 1.2, this.tvProbe);
              if (see(this.tvPos, this.tvProbe)) seen++;
            }
          }
          if (seen > best) {
            best = seen;
            this.tvS = s;
            this.tvD = d;
            this.tvUp = up;
            this.tvSide = side;
          }
          if (seen === TV_PROBES.length) return;
        }
      }
    }
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
    if (!(this.turntable && this.mode === 'orbit')) this.orbitT += dt;
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
      const ang = this.orbitT * 0.35 + 2.4 + this.orbitTurn;
      let rise = 5 + Math.sin(this.orbitT * 0.3) * 1.5;
      let radius = 17.5;
      if (this.orbitElevation !== 0) {
        // Orbit the same inspection point at the same distance, rather than
        // tilting away from the mech or zooming in as the camera rises.
        const distance = Math.hypot(radius, rise - 4.4);
        const elevation = Math.atan2(rise - 4.4, radius) + this.orbitElevation;
        radius = Math.cos(elevation) * distance;
        rise = 4.4 + Math.sin(elevation) * distance;
      }
      if (this.orbitFrame) {
        // The frame's +X is the mech's left, the road's -d.
        pos.set(Math.sin(ang) * radius, rise, -Math.cos(ang) * radius).applyMatrix4(this.orbitFrame);
        look.set(0, 4.4, 0).applyMatrix4(this.orbitFrame);
      } else {
        trackPoint(track, sub.s - Math.cos(ang) * 17 * radius / 17.5, sub.d - Math.sin(ang) * 15 * radius / 17.5, rise, pos);
        trackPoint(track, sub.s, sub.d, 4.4, look);
      }
      fov = this.orbitFov;
    } else if (this.mode === 'tv') {
      // A camera by the road a little way ahead, on the outside of any bend,
      // panning as the mech comes and goes by; once it is well past, a cut to
      // the next one.
      const rel = deltaS(track, this.tvS, sub.s);
      if (this.tvFresh || rel < -38 || rel > 260) {
        this.placeTv(sub);
        this.tvFresh = false;
        this.fov = 40;
      }
      trackPoint(track, this.tvS, this.tvD, this.tvUp, pos);
      trackPoint(track, sub.s, sub.d, 3.6 + this.hSmooth, look);
      // Something come between (the mech took another line, or went over a
      // crest): if it stays blocked, a cut to another camera.
      this.tvCheckT -= dt;
      if (this.sightline && this.tvCheckT <= 0) {
        this.tvCheckT = 0.2;
        this.tvBlockedT = this.sightline(pos, look) ? 0 : this.tvBlockedT + 0.2;
        if (this.tvBlockedT >= 0.6) {
          this.tvBlockedT = 0;
          this.tvFresh = true;
        }
      }
      // Zoomed to hold the mech at about the same size, near or far.
      fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(11 / Math.max(1, pos.distanceTo(look)))), 9, 62);
      this.fov = fov;
    } else if (this.mode === 'photo') {
      // Posed by hand round the mech, in its own frame (yaw 0: behind it),
      // or round the podium (yaw 0: in front of it).
      const p = this.photo;
      if (this.anchor) this.photoFrame.copy(this.anchor);
      else trackMatrix(track, sub.s, sub.d, sub.h ?? 0, m.facing, this.photoFrame);
      const r = p.dist;
      const y = this.anchor ? this.anchorLook : 3.8;
      const back = this.anchor ? 1 : -1;
      pos.set(Math.sin(p.yaw) * r * Math.cos(p.pitch), y + r * Math.sin(p.pitch), back * Math.cos(p.yaw) * r * Math.cos(p.pitch)).applyMatrix4(this.photoFrame);
      look.set(0, y, 0).applyMatrix4(this.photoFrame);
      fov = p.fov;
      this.fov = fov;
    } else if (this.mode === 'podium' && this.anchor) {
      // In from wide as the three take their places; in on the winner as the
      // confetti goes up; then the whole podium, the camera drifting.
      this.podiumT += dt;
      const t = this.podiumT;
      const reach = Math.max(24, this.podiumReach);
      const k = (a: number, b: number) => {
        const x = THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
        return x * x * (3 - 2 * x);
      };
      // A lens that takes in `w` by `h` metres at `dist`, whatever the screen's shape.
      const fit = (w: number, h: number, dist: number) => THREE.MathUtils.radToDeg(2 * Math.max(Math.atan(h / 2 / dist), Math.atan(w / 2 / dist / Math.max(0.3, this.camera.aspect))));
      if (t < 3.2) {
        const e = k(0, 3.2);
        pos.set(-18 + 10 * e, 5.5 + 3 * e, reach * (1 - 0.06 * e));
        look.set(-3 + 3 * e, 9, 0);
        fov = fit(60, 24, reach);
      } else if (t < 7.6) {
        const e = k(3.2, 7.6);
        pos.set(-7 + 12 * e, 11 + e, Math.min(reach, 30) * (0.72 - 0.06 * e));
        look.set(0, 11, 0);
        fov = fit(22, 14, Math.min(reach, 30) * 0.7);
      } else {
        pos.set(Math.sin((t - 7.6) * 0.13) * 6, 9, reach);
        look.set(0, 10, 0);
        fov = fit(56, 24, reach);
      }
      pos.applyMatrix4(this.anchor);
      look.applyMatrix4(this.anchor);
      // Each shot a cut, not a zoom.
      this.fov = fov;
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
    if (this.anchor && (this.mode === 'podium' || this.mode === 'photo')) this.up.setFromMatrixColumn(this.anchor, 1).normalize();
    else trackUp(track, sub.s, this.up).lerp(WORLD_UP, 0.45 * flat).normalize();
    const cam = this.camera;
    cam.position.copy(pos);
    cam.up.copy(this.up);
    cam.lookAt(look);
    if (this.mode === 'photo' && this.photo.roll !== 0) cam.rotateZ(this.photo.roll);
    if (this.trauma > 0.001 && dt > 0 && this.mode !== 'photo' && this.mode !== 'podium') {
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
    const lift = this.mode === 'orbit' ? this.shiftY : 0;
    const view = cam.view;
    // setViewOffset also sets aspect. Keep the viewport's ratio while shifting
    // by a fraction of its width, including after a docked browser is resized.
    const aspect = cam.aspect;
    if ((shift !== 0 || lift !== 0) && (!view || !view.enabled || view.fullWidth !== aspect || view.offsetX !== -shift * aspect || view.offsetY !== lift)) {
      cam.setViewOffset(aspect, 1, -shift * aspect, lift, aspect, 1);
    }
    else if (shift === 0 && lift === 0 && view?.enabled) cam.clearViewOffset();
  }
}
