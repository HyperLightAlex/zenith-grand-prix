// Drives a rig from simulation state: blends the pose library by mode and
// action, adds the skating stride and body lean, and sizes thruster flames.
import type * as THREE from 'three';
import { ACT, ATTACKS, BTN, CLASSES, MODE, PACE, REV_PERFECT, REV_RED, START, startGrade, type MechState } from '../../../sim/index';
import { COLORS } from '../palette';
import { setFlameTime } from './frames';
import { CLIPS, POSES } from './poses';
import { blendPose, copyPose, makePose, mirrorPose, type MechRig, type Pose } from './rig';

const ease = (t: number) => t * t * (3 - 2 * t);
const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const toward = (v: number, target: number, rate: number, dt: number) => v + (target - v) * (1 - Math.exp(-rate * dt));

const staggerMirror = mirrorPose(POSES.stagger);
/** Seconds the push off the line takes to settle into the tuck. */
const PUSH_SECS = 0.45;
/** Seconds a gun stays up after a burst with nothing more fired (and as long as its trigger is held). */
const AIM_KEEP = 0.6;
const carveLeft = mirrorPose(POSES.carveRight);

export class MechAnimator {
  private pose = makePose();
  private tmp = makePose();
  private battleW = 0;
  private guardW = 0;
  private boostW = 0;
  /** Carving, signed: positive to the right. */
  private carveW = 0;
  /** A guard swing round the target, signed the same way. */
  private arcW = 0;
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
  /** The garage: stand at rest in the bay instead of the grid's crouch. */
  display = false;
  /**
   * On the grid, through the countdown (the view sets it): the ready stance,
   * crouching into the launch as the revs build. When it goes, the push off
   * the line, as hard as the start was good.
   */
  grid = false;
  private wasGrid = false;
  private gridW = 0;
  /** The revs, smoothed between ticks. */
  private revW = 0;
  /** Seconds since GO, while the push lasts; how hard it was (0 to 1). */
  private pushT = PUSH_SECS;
  private pushK = 0;
  /** A bogged start's stumble. */
  private stumbleW = 0;
  /** Standing still or nearly: the stance out of the tuck, eased. */
  private idleW = 0;
  /**
   * A gun kept up between bursts: the pose it was raised in (and its kick),
   * how far up it is, and how long it stays up with nothing more fired.
   */
  private aimPose: Pose | null = null;
  private aimKick: Pose | null = null;
  private aimW = 0;
  private aimKeep = 0;
  private aimAttack = -1;
  /**
   * How far the gun arm should be turned onto its target this drawing (0 to
   * 1): up while a gun attack is raised. The view does the aiming, since it
   * knows where the target is (rig.aimArm).
   */
  aimWeight = 0;

  constructor(public rig: MechRig) {}

  /** Swap presentation geometry while keeping stride, action blend and held pose. */
  replaceRig(rig: MechRig): void {
    this.rig = rig;
    rig.apply(this.pose);
  }

  /** `alpha` is the fraction of a tick since the state was current.
   * `bodyDt` can run at display rate while the pose uses the drawing clock. */
  update(dt: number, m: MechState, alpha: number, bodyDt = dt): void {
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
    this.carveW = toward(this.carveW, m.carving && !m.air && !m.retired ? m.carveDir : 0, 12, dt);
    this.arcW = toward(this.arcW, m.act === ACT.DASH && m.arcDir !== 0 && !m.retired ? m.arcDir : 0, 22, dt);
    const speedFrac = clamp01(m.speed / (PACE * 1.25));
    const P = this.pose;

    // ---- base: tuck, with a skating stride that settles into a glide
    copyPose(P, POSES.tuck);
    blendPose(P, POSES.boost, this.boostW);
    // Carving: down on the edges, no stride.
    const carving = Math.abs(this.carveW);
    if (carving > 0.001) blendPose(P, this.carveW > 0 ? POSES.carveRight : carveLeft, ease(carving));
    // No stride in the air (the skates have nothing to push on), or carving.
    const amp = (1 - ease(clamp01((speedFrac - 0.25) / 0.6)) * 0.8) * clamp01(m.speed / 8) * (1 - this.airW) * (1 - carving);
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
    // Standing still or nearly: rise out of the tuck. Eased in time, so a
    // jump in speed (a launch) never snaps the stance.
    this.idleW = toward(this.idleW, 1 - clamp01(m.speed / 14), 8, dt);
    if (this.idleW > 0.001) blendPose(P, POSES.battle, this.idleW * 0.55 * (1 - this.battleW));

    // ---- the start
    if (this.grid) {
      this.gridW = 1;
    } else {
      if (this.wasGrid) {
        // GO: push off the line, as hard as the start was good (a bog stumbles instead).
        const g = startGrade(m.rev);
        this.pushT = 0;
        this.pushK = g === START.PERFECT ? 1 : g === START.GOOD ? 0.8 : g === START.PLAIN ? 0.45 : 0;
      }
      this.gridW = toward(this.gridW, 0, 9, dt);
    }
    this.wasGrid = this.grid;
    if (this.grid) this.revW = toward(this.revW, m.rev, 14, dt);
    if (this.gridW > 0.001 && !this.display) {
      // Ready, crouching into the launch as the revs build: all the way down by the redline.
      const r = ease(clamp01(this.revW / REV_RED));
      copyPose(this.tmp, POSES.ready);
      blendPose(this.tmp, POSES.launchSet, r);
      // A breath while waiting; in the green and past it, shaking with the engine.
      this.tmp.hips[0] += Math.sin(this.time * 1.6) * 0.03 * (1 - r);
      const hot = clamp01((this.revW - REV_PERFECT) / (1 - REV_PERFECT)) ** 2;
      this.tmp.hips[0] += Math.sin(this.time * 41) * 0.035 * hot;
      this.tmp.chest[2] += Math.sin(this.time * 57) * 0.03 * hot;
      this.tmp.head[2] -= Math.sin(this.time * 57) * 0.02 * hot;
      blendPose(P, this.tmp, this.gridW);
    }
    if (this.pushT < PUSH_SECS) {
      this.pushT += dt;
      const t = this.pushT;
      const w = t < 0.07 ? t / 0.07 : Math.max(0, 1 - (t - 0.07) / (PUSH_SECS - 0.07)) ** 2;
      if (this.pushK > 0) blendPose(P, POSES.launchPush, w * this.pushK);
    }
    // A bogged start: jolted off balance while the engine sputters.
    this.stumbleW = toward(this.stumbleW, m.bogT > 0 && !m.retired ? 1 : 0, 12, dt);
    if (this.stumbleW > 0.001) {
      blendPose(P, POSES.stagger, ease(this.stumbleW) * 0.7);
      const judder = Math.sin(this.time * 33) * 0.06 * this.stumbleW;
      P.chest[2] += judder;
      P.head[2] -= judder;
    }

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
    // A guard swing: down on the edges like a carve, out of the fighting stance.
    const arcing = Math.abs(this.arcW);
    if (arcing > 0.001) blendPose(P, this.arcW > 0 ? POSES.carveRight : carveLeft, ease(arcing) * 0.8);

    // ---- actions
    if (m.act !== this.lastAct) {
      if (m.act === ACT.STAGGER) this.staggerSide = Math.random() < 0.5 ? 1 : -1;
      this.lastAct = m.act;
      this.lastShotT = -1;
    }
    const t = m.actT + alpha;
    this.aimWeight = 0;
    // A gun fired in bursts (the Midfielder's carbine) is kept up between
    // them, for as long as its trigger is held (it fires on its own while
    // held) and a moment after the last, so a run of bursts is one raised
    // arm, not a salute each time. Anything else the mech does but shoot
    // drops it at once. A one-shot gun (the scatter cannon) still raises and
    // lowers with its shot.
    const atk = m.act === ACT.ATTACK ? ATTACKS[m.attack] : null;
    const gunShot = !!atk && atk.kind === 'shot' && !!atk.shot;
    const keeps = gunShot && atk!.shot!.count > 1;
    if (keeps) this.aimKeep = AIM_KEEP;
    else if (!gunShot && (m.act !== ACT.NONE || m.retired)) {
      this.aimKeep = 0;
      this.aimW = 0;
      this.aimPose = null;
    } else if (this.aimKeep > 0) this.aimKeep -= dt;
    const trigger = !m.retired && (m.prevButtons & BTN.X) !== 0 && CLASSES[m.role].primary === this.aimAttack;
    if (m.act === ACT.ATTACK) {
      const a = ATTACKS[m.attack];
      const clip = CLIPS[m.attack];
      const fromTuck = this.battleW < 0.5 && clip.speedWind !== undefined;
      const wind = fromTuck ? clip.speedWind! : clip.wind;
      const hit = fromTuck ? clip.speedHit! : clip.hit;
      if (a.kind === 'shot' && a.shot) {
        // Raise the gun (or keep it up from the last burst) and hold the aim;
        // each shot kicks. A gun kept up comes down after its burst, once
        // nothing more is fired (below); a one-shot gun in its recovery.
        const up = Math.max(ease(clamp01(t / Math.max(3, a.windup))), this.aimW);
        const down = keeps || this.aimW > 0 ? 1 : 1 - ease(clamp01((t - a.windup - a.active) / Math.max(1, a.recovery)));
        const w = Math.min(up, down);
        blendPose(P, wind, w);
        this.aimWeight = w;
        if (keeps) {
          this.aimW = w;
          this.aimPose = wind;
          this.aimKick = hit;
          this.aimAttack = m.attack;
        }
        const shotIdx = Math.floor((t - a.windup) / a.shot.interval);
        if (t >= a.windup && shotIdx < a.shot.count && shotIdx !== this.lastShotT) {
          this.lastShotT = shotIdx;
          this.recoil = 1;
        }
        if (this.recoil > 0.01) blendPose(P, hit, this.recoil * w);
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
    } else if (this.aimPose && this.aimW > 0.001) {
      // Between bursts: kept up while the trigger is held or the moment lasts, then lowered.
      this.aimW = this.aimKeep > 0 || trigger ? 1 : toward(this.aimW, 0, 9, dt);
      blendPose(P, this.aimPose, ease(this.aimW));
      if (this.recoil > 0.01 && this.aimKick) blendPose(P, this.aimKick, this.recoil * this.aimW);
      this.aimWeight = ease(this.aimW);
      if (this.aimW <= 0.001) this.aimPose = null;
    }
    this.recoil = toward(this.recoil, 0, 16, dt);

    if (this.koW > 0.001) blendPose(P, POSES.ko, ease(this.koW));
    if (this.winW > 0.001) blendPose(P, POSES.victory, ease(this.winW) * (1 - this.koW));

    // ---- the garage: at rest in the bay, breathing, looking about now and then
    if (this.display) {
      copyPose(P, POSES.standby);
      const breath = Math.sin(this.time * 1.3);
      P.hips[0] += breath * 0.03;
      P.chest[0] -= breath * 0.02;
      P.shL[2] += breath * 0.015;
      P.shR[2] -= breath * 0.015;
      P.head[1] += Math.sin(this.time * 0.31) * 0.16;
      P.head[0] += Math.sin(this.time * 0.23 + 1) * 0.04;
    }

    this.updateSteering(bodyDt, m);

    // ---- thrusters
    let want = 0;
    if (!m.retired) {
      want = battle ? 0.28 : 0.22 + speedFrac * 0.45;
      if (surging) want = m.overdriveT > 0 ? 1.45 : 1.15;
      if (m.act === ACT.DASH) want = 1.0;
      // Thrusters hold it level in the air, and fight the drop in a fall.
      if (m.air) want = Math.max(want, m.fallT > 0 ? 1.3 : 0.75);
      if (m.finished) want = 0.25;
      // On the grid the thrusters build with the revs; off the line they
      // fire as hard as the start was good; a bog sputters.
      if (this.gridW > 0.5) want = 0.1 + this.revW * 0.95;
      if (this.pushT < 0.35) want = Math.max(want, 1.15 * this.pushK);
      if (m.bogT > 0) want = Math.sin(this.time * 23) > 0.3 ? 0.45 : 0.08;
      // Indoors, standing: only the pilot lights.
      if (this.display) want = 0.08;
    }
    this.thrust = toward(this.thrust, want, 10, dt);
    setFlameTime(this.rig, this.time);
    const flick = 0.9 + Math.sin(this.time * 47) * 0.1;
    for (const f of this.rig.flames) {
      const power = f.bank === 'main' ? this.thrust : this.thrust * (battle || surging ? 0.9 : 0.35);
      f.mesh.scale.set(f.width * (0.8 + power * 0.5), f.width * (0.8 + power * 0.5), Math.max(0.01, f.length * power * flick));
      f.mesh.visible = power > 0.03;
      if (f.drawn) {
        // Drawn: the overdrive loop in gold while it lasts, the boost loop in the team's colour otherwise.
        const u = (f.drawn.material as THREE.ShaderMaterial).uniforms;
        const od = m.overdriveT > 0 && !m.retired;
        u.uRow.value = od ? 1 : 0;
        (u.uTint.value as THREE.Color).set(od ? COLORS.cell : (f.drawn.userData.tint as number));
        if (f.burner) {
          const b = (f.burner.material as THREE.ShaderMaterial).uniforms;
          b.uRow.value = u.uRow.value;
          b.uPower.value = power;
          (b.uTint.value as THREE.Color).copy(u.uTint.value as THREE.Color);
        }
      }
    }
  }

  /** Bank on the latest simulation state even while an anime drawing is held.
   * Reapply the held pose so the foot solver keeps the skates on the road. */
  updateSteering(dt: number, m: MechState): void {
    const accel = dt > 0 ? (m.speed - this.prevSpeed) / dt : 0;
    this.prevSpeed = m.speed;
    const battle = m.mode === MODE.BATTLE && !m.retired;
    const wantLean = battle ? this.arcW * 0.45 : m.steer * (0.42 + 0.26 * Math.abs(this.carveW)) * clamp01(m.speed / 40);
    this.lean = toward(this.lean, wantLean * (1 - this.koW), 8, dt);
    this.pitch = toward(this.pitch, Math.max(-0.12, Math.min(0.1, accel * 0.0022)) * (1 - this.battleW), 5, dt);
    this.rig.body.rotation.set(-this.pitch, 0, this.lean);
    this.rig.apply(this.pose);
  }

  /** Current battle-stance weight, for effects that differ by mode. */
  get battleWeight(): number {
    return this.battleW;
  }
}

export type { Pose };
