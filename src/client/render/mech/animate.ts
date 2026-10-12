// Drives a rig from simulation state: blends the pose library by mode and
// action, adds the skating stride and body lean, and sizes thruster flames.
import { ACT, ATTACKS, MODE, PACE, type MechState } from '../../../sim/index';
import { setFlameTime } from './frames';
import { CLIPS, POSES } from './poses';
import { blendPose, copyPose, makePose, mirrorPose, type MechRig, type Pose } from './rig';

const ease = (t: number) => t * t * (3 - 2 * t);
const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const toward = (v: number, target: number, rate: number, dt: number) => v + (target - v) * (1 - Math.exp(-rate * dt));

const staggerMirror = mirrorPose(POSES.stagger);

export class MechAnimator {
  private pose = makePose();
  private tmp = makePose();
  private battleW = 0;
  private guardW = 0;
  private boostW = 0;
  private koW = 0;
  private winW = 0;
  private airW = 0;
  private fallW = 0;
  private stride = 0;
  private lean = 0;
  private pitch = 0;
  private recoil = 0;
  private lastShotT = -1;
  private staggerSide = 1;
  private lastAct = 0;
  private thrust = 0;
  private time = Math.random() * 10;
  private prevSpeed = 0;

  constructor(readonly rig: MechRig) {}

  /** `alpha` is the fraction of a tick since the state was current. */
  update(dt: number, m: MechState, alpha: number): void {
    this.time += dt;
    const battle = m.mode === MODE.BATTLE && !m.retired;
    this.battleW = toward(this.battleW, battle ? 1 : 0, 9, dt);
    this.guardW = toward(this.guardW, m.guarding ? 1 : 0, 22, dt);
    const surging = m.boosting || m.overdriveT > 0 || (m.ramT > 0 && !battle);
    this.boostW = toward(this.boostW, surging ? 1 : 0, 7, dt);
    this.koW = toward(this.koW, m.retired ? 1 : 0, 4, dt);
    this.winW = toward(this.winW, m.finished && !m.retired ? 1 : 0, 2.5, dt);
    this.airW = toward(this.airW, m.air && !m.retired ? 1 : 0, 10, dt);
    this.fallW = toward(this.fallW, m.fallT > 0 && !m.retired ? 1 : 0, 6, dt);
    const speedFrac = clamp01(m.speed / (PACE * 1.25));
    const P = this.pose;

    // ---- base: tuck, with a skating stride that settles into a glide
    copyPose(P, POSES.tuck);
    blendPose(P, POSES.boost, this.boostW);
    // No stride in the air: the skates have nothing to push on.
    const amp = (1 - ease(clamp01((speedFrac - 0.25) / 0.6)) * 0.8) * clamp01(m.speed / 8) * (1 - this.airW);
    this.stride += dt * (2.4 + speedFrac * 3.2);
    const ph = this.stride;
    const sn = Math.sin(ph);
    const cs = Math.cos(ph);
    P.footL[2] += sn * 1.15 * amp;
    P.footR[2] -= sn * 1.15 * amp;
    P.footL[0] += Math.max(0, -cs) * 0.55 * amp;
    P.footR[0] -= Math.max(0, cs) * 0.55 * amp;
    P.footL[1] += Math.max(0, cs) * 0.22 * amp;
    P.footR[1] += Math.max(0, -cs) * 0.22 * amp;
    P.hips[3] += sn * 0.14 * amp;
    P.hips[4] += cs * 0.07 * amp;
    P.hips[0] += Math.abs(cs) * 0.12 * amp;
    P.shL[0] += sn * 0.3 * amp;
    P.shR[0] -= sn * 0.3 * amp;
    // Standing on the grid: rise out of the tuck.
    const idle = 1 - clamp01(m.speed / 14);
    if (idle > 0) blendPose(P, POSES.battle, idle * 0.55 * (1 - this.battleW));

    // ---- in the air: knees up, toes down, arms out for balance; falling,
    // the legs drop and the arms go up
    if (this.airW > 0.001) {
      const k = this.airW * (1 - this.fallW);
      P.footL[1] += 0.9 * k;
      P.footR[1] += 0.6 * k;
      P.footL[2] += 0.4 * k;
      P.footR[2] -= 0.2 * k;
      P.footL[3] += 0.35 * k;
      P.footR[3] += 0.35 * k;
      P.shL[2] += 0.45 * this.airW;
      P.shR[2] -= 0.45 * this.airW;
    }
    if (this.fallW > 0.001) {
      const f = this.fallW;
      const kick = Math.sin(this.time * 9);
      P.footL[2] += kick * 0.5 * f;
      P.footR[2] -= kick * 0.5 * f;
      P.shL[2] += 0.7 * f;
      P.shR[2] -= 0.7 * f;
      P.hips[2] += 0.25 * f;
    }

    // ---- battle stance with a little life in it
    if (this.battleW > 0.001) {
      copyPose(this.tmp, POSES.battle);
      const bob = Math.sin(this.time * 3.1);
      this.tmp.hips[0] += bob * 0.07;
      this.tmp.shL[0] += bob * 0.04;
      this.tmp.shR[0] -= bob * 0.04;
      // Lean with sideways movement.
      this.tmp.hips[4] += Math.max(-0.2, Math.min(0.2, m.vd * 0.012));
      blendPose(P, this.tmp, ease(this.battleW));
    }
    if (this.guardW > 0.001) blendPose(P, POSES.guard, this.guardW);

    // ---- actions
    if (m.act !== this.lastAct) {
      if (m.act === ACT.STAGGER) this.staggerSide = Math.random() < 0.5 ? 1 : -1;
      this.lastAct = m.act;
      this.lastShotT = -1;
    }
    const t = m.actT + alpha;
    if (m.act === ACT.ATTACK) {
      const a = ATTACKS[m.attack];
      const clip = CLIPS[m.attack];
      const fromTuck = this.battleW < 0.5 && clip.speedWind !== undefined;
      const wind = fromTuck ? clip.speedWind! : clip.wind;
      const hit = fromTuck ? clip.speedHit! : clip.hit;
      if (a.kind === 'shot' && a.shot) {
        // Hold the aim; each shot kicks.
        const up = ease(clamp01(t / Math.max(3, a.windup)));
        const down = 1 - ease(clamp01((t - a.windup - a.active) / Math.max(1, a.recovery)));
        blendPose(P, wind, Math.min(up, down));
        const shotIdx = Math.floor((t - a.windup) / a.shot.interval);
        if (t >= a.windup && shotIdx < a.shot.count && shotIdx !== this.lastShotT) {
          this.lastShotT = shotIdx;
          this.recoil = 1;
        }
        if (this.recoil > 0.01) blendPose(P, hit, this.recoil * Math.min(up, down));
      } else if (t < a.windup) {
        blendPose(P, wind, easeOut(clamp01(t / a.windup)));
      } else if (t < a.windup + a.active) {
        const k = easeOut(clamp01((t - a.windup) / Math.max(2, a.active * 0.55)));
        copyPose(this.tmp, wind);
        blendPose(this.tmp, hit, k);
        blendPose(P, this.tmp, 1);
      } else {
        const r = clamp01((t - a.windup - a.active) / a.recovery);
        blendPose(P, hit, 1 - ease(r));
      }
    } else if (m.act === ACT.STAGGER) {
      const inn = clamp01(t / 3);
      const out = 1 - ease(clamp01((t - (m.actDur - 9)) / 9));
      blendPose(P, this.staggerSide > 0 ? POSES.stagger : staggerMirror, inn * out);
      const shake = Math.sin(this.time * 55) * 0.05 * out;
      P.chest[2] += shake;
      P.head[2] -= shake;
    } else if (m.act === ACT.DASH) {
      const k = Math.sin(clamp01(t / m.actDur) * Math.PI);
      blendPose(P, POSES.dash, k * 0.9);
    }
    this.recoil = toward(this.recoil, 0, 16, dt);

    if (this.koW > 0.001) blendPose(P, POSES.ko, ease(this.koW));
    if (this.winW > 0.001) blendPose(P, POSES.victory, ease(this.winW) * (1 - this.koW));

    this.rig.apply(P);

    // ---- whole-body lean: bank into turns, pitch with acceleration
    const accel = dt > 0 ? (m.speed - this.prevSpeed) / dt : 0;
    this.prevSpeed = m.speed;
    const wantLean = battle ? 0 : m.steer * 0.42 * clamp01(m.speed / 40);
    this.lean = toward(this.lean, wantLean * (1 - this.koW), 8, dt);
    this.pitch = toward(this.pitch, Math.max(-0.12, Math.min(0.1, accel * 0.0022)) * (1 - this.battleW), 5, dt);
    this.rig.body.rotation.set(-this.pitch, 0, this.lean);

    // ---- thrusters
    let want = 0;
    if (!m.retired) {
      want = battle ? 0.28 : 0.22 + speedFrac * 0.45;
      if (surging) want = m.overdriveT > 0 ? 1.45 : 1.15;
      if (m.act === ACT.DASH) want = 1.0;
      // Thrusters hold it level in the air, and fight the drop in a fall.
      if (m.air) want = Math.max(want, m.fallT > 0 ? 1.3 : 0.75);
      if (m.finished) want = 0.25;
    }
    this.thrust = toward(this.thrust, want, 10, dt);
    setFlameTime(this.rig, this.time);
    const flick = 0.9 + Math.sin(this.time * 47) * 0.1;
    for (const f of this.rig.flames) {
      const power = f.bank === 'main' ? this.thrust : this.thrust * (battle || surging ? 0.9 : 0.35);
      f.mesh.scale.set(f.width * (0.8 + power * 0.5), f.width * (0.8 + power * 0.5), Math.max(0.01, f.length * power * flick));
      f.mesh.visible = power > 0.03;
    }
  }

  /** Current battle-stance weight, for effects that differ by mode. */
  get battleWeight(): number {
    return this.battleW;
  }
}

export type { Pose };
