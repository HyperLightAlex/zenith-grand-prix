// The skeleton shared by every frame, and the pose solver. Upper body joints
// take plain rotations; legs are solved with two-bone IK from foot targets so
// the skates always sit on the road whatever the hips are doing.
import * as THREE from 'three';

export const JOINTS = [
  'hips', 'spine', 'chest', 'head',
  'shL', 'elL', 'wrL', 'shR', 'elR', 'wrR',
  'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR',
  'wingL', 'wingR',
] as const;
export type JointName = (typeof JOINTS)[number];

export interface FrameDims {
  hipY: number;
  hipX: number;
  hipDrop: number;
  thigh: number;
  shin: number;
  ankleY: number;
  spineY: number;
  chestY: number;
  shoulderX: number;
  shoulderY: number;
  headY: number;
  headZ: number;
  upperArm: number;
  foreArm: number;
  /** Rough overall height, for cameras and effects. */
  height: number;
}

type V3 = [number, number, number];

/**
 * A pose. Angles are radians about the joint's local axes (x left, y up,
 * z forward): positive x pitches a torso forward and swings a hanging limb
 * back; positive z lifts the left arm out to the side.
 */
export interface Pose {
  /** Hips: height offset, forward shift, pitch, yaw, roll. */
  hips: [number, number, number, number, number];
  spine: V3;
  chest: V3;
  head: V3;
  shL: V3;
  elL: V3;
  wrL: V3;
  shR: V3;
  elR: V3;
  wrR: V3;
  /**
   * Feet in body space: x, lift above the road, z, pitch, and yaw. The yaw
   * turns the skate off straight on from its shin (positive toward +x), so
   * 0 is a foot in line with its leg.
   */
  footL: [number, number, number, number, number];
  footR: [number, number, number, number, number];
  wingL: V3;
  wingR: V3;
}

const POSE_KEYS = ['hips', 'spine', 'chest', 'head', 'shL', 'elL', 'wrL', 'shR', 'elR', 'wrR', 'footL', 'footR', 'wingL', 'wingR'] as const;

export function makePose(p: Partial<Pose> = {}): Pose {
  return {
    hips: [0, 0, 0, 0, 0],
    spine: [0, 0, 0],
    chest: [0, 0, 0],
    head: [0, 0, 0],
    shL: [0, 0, 0.12],
    elL: [-0.15, 0, 0],
    wrL: [0, 0, 0],
    shR: [0, 0, -0.12],
    elR: [-0.15, 0, 0],
    wrR: [0, 0, 0],
    footL: [0.85, 0, 0, 0, 0],
    footR: [-0.85, 0, 0, 0, 0],
    wingL: [0, 0, 0],
    wingR: [0, 0, 0],
    ...p,
  };
}

export function copyPose(dst: Pose, src: Pose): Pose {
  for (const k of POSE_KEYS) {
    const a = dst[k] as number[];
    const b = src[k] as number[];
    for (let i = 0; i < a.length; i++) a[i] = b[i];
  }
  return dst;
}

/** dst = lerp(dst, src, t) */
export function blendPose(dst: Pose, src: Pose, t: number): Pose {
  if (t <= 0) return dst;
  for (const k of POSE_KEYS) {
    const a = dst[k] as number[];
    const b = src[k] as number[];
    for (let i = 0; i < a.length; i++) a[i] += (b[i] - a[i]) * t;
  }
  return dst;
}

/** Left-right mirror of a pose. */
export function mirrorPose(p: Pose): Pose {
  const flip = (v: V3): V3 => [v[0], -v[1], -v[2]];
  return {
    hips: [p.hips[0], p.hips[1], p.hips[2], -p.hips[3], -p.hips[4]],
    spine: flip(p.spine),
    chest: flip(p.chest),
    head: flip(p.head),
    shL: flip(p.shR),
    elL: flip(p.elR),
    wrL: flip(p.wrR),
    shR: flip(p.shL),
    elR: flip(p.elL),
    wrR: flip(p.wrL),
    footL: [-p.footR[0], p.footR[1], p.footR[2], p.footR[3], -p.footR[4]],
    footR: [-p.footL[0], p.footL[1], p.footL[2], p.footL[3], -p.footL[4]],
    wingL: flip(p.wingR),
    wingR: flip(p.wingL),
  };
}

export interface Flame {
  mesh: THREE.Mesh;
  /** Length at full thrust, and which bank it belongs to. */
  length: number;
  width: number;
  bank: 'main' | 'leg';
  /** The anime look's painted flame on the same thruster. */
  drawn?: THREE.Mesh;
  /** ...and its burner, the thruster seen end on. */
  burner?: THREE.Mesh;
}

const qh = new THREE.Quaternion();
const qInv = new THREE.Quaternion();
const qThigh = new THREE.Quaternion();
const qKnee = new THREE.Quaternion();
const qFoot = new THREE.Quaternion();
const qTmp = new THREE.Quaternion();
const eul = new THREE.Euler();
const v = new THREE.Vector3();
const u = new THREE.Vector3();
const n = new THREE.Vector3();
const hint = new THREE.Vector3();
const kx = new THREE.Vector3();
const ky = new THREE.Vector3();
const kz = new THREE.Vector3();
const basis = new THREE.Matrix4();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const qBodyInv = new THREE.Quaternion();
const footTarget = new THREE.Vector3();
const shinSide = new THREE.Vector3();
const aimFrom = new THREE.Vector3();
const aimTo = new THREE.Vector3();
const qAim = new THREE.Quaternion();
const qParent = new THREE.Quaternion();
const elbowAt = new THREE.Vector3();

export class MechRig {
  /** Origin on the road under the hips, facing +z. */
  readonly root = new THREE.Group();
  /** Whole-body lean (bank into turns, recoil) without moving the feet target frame. */
  readonly body = new THREE.Group();
  readonly joints = {} as Record<JointName, THREE.Group>;
  readonly flames: Flame[] = [];
  readonly heels: THREE.Object3D[] = [];
  readonly muzzle = new THREE.Object3D();
  readonly handL = new THREE.Object3D();
  readonly handR = new THREE.Object3D();
  /** Meshes that carry the team glow colour, for flashing. */
  readonly glowMeshes: THREE.Mesh[] = [];
  /** Rigid geometry groups sharing this rig's joints, from near to far. */
  readonly detailLevels: THREE.Object3D[][] = [];
  detailLevel = 0;
  /** Optional frame-specific retargeting; never mutate a shared pose. */
  fitPose?: (pose: Pose) => void;
  /** Secondary armor hinges driven by the final, fitted arm pose. */
  poseArmor?: (pose: Pose) => void;
  keepFeetOnRoad = false;
  private fittedPose = makePose();
  /**
   * Skirt armour hinged on the hips: the front plates lift with their thigh
   * as it swings forward, the rear plate as either leg swings back. Frames
   * place them and hang their armour on them; a frame without skirts leaves
   * them empty.
   */
  readonly skirts = { l: new THREE.Group(), r: new THREE.Group(), back: new THREE.Group() };
  /** How far each thigh swings forward of straight down, radians (set by apply). */
  private swing = { l: 0, r: 0 };

  constructor(readonly dims: FrameDims) {
    this.root.add(this.body);
    const j = (name: JointName, parent: THREE.Object3D, x: number, y: number, z: number) => {
      const g = new THREE.Group();
      g.name = name;
      g.position.set(x, y, z);
      parent.add(g);
      this.joints[name] = g;
      return g;
    };
    const d = dims;
    const hips = j('hips', this.body, 0, d.hipY, 0);
    const spine = j('spine', hips, 0, d.spineY, 0);
    const chest = j('chest', spine, 0, d.chestY, 0);
    j('head', chest, 0, d.headY, d.headZ);
    for (const side of [1, -1] as const) {
      const L = side === 1;
      const sh = j(L ? 'shL' : 'shR', chest, side * d.shoulderX, d.shoulderY, 0);
      const el = j(L ? 'elL' : 'elR', sh, 0, -d.upperArm, 0);
      const wr = j(L ? 'wrL' : 'wrR', el, 0, -d.foreArm, 0);
      wr.add(L ? this.handL : this.handR);
      const hip = j(L ? 'hipL' : 'hipR', hips, side * d.hipX, -d.hipDrop, 0);
      const knee = j(L ? 'kneeL' : 'kneeR', hip, 0, -d.thigh, 0);
      const ankle = j(L ? 'ankleL' : 'ankleR', knee, 0, -d.shin, 0);
      const heel = new THREE.Object3D();
      heel.position.set(0, -d.ankleY + 0.12, -0.7);
      ankle.add(heel);
      this.heels.push(heel);
      j(L ? 'wingL' : 'wingR', chest, side * 0.55, 0.75, -0.85);
    }
    hips.add(this.skirts.l, this.skirts.r, this.skirts.back);
  }

  /** The joints the gun hangs from (the shoulder and elbow above the muzzle), found once. */
  private gunArm: { sh: THREE.Object3D; el: THREE.Object3D } | null | undefined;

  private findGunArm(): { sh: THREE.Object3D; el: THREE.Object3D } | null {
    if (this.gunArm !== undefined) return this.gunArm;
    let sh: THREE.Object3D | null = null;
    let el: THREE.Object3D | null = null;
    for (let o: THREE.Object3D | null = this.muzzle.parent; o; o = o.parent) {
      if (o === this.joints.elL || o === this.joints.elR) el = o;
      if (o === this.joints.shL || o === this.joints.shR) {
        sh = o;
        break;
      }
    }
    this.gunArm = sh && el ? { sh, el } : null;
    return this.gunArm;
  }

  /**
   * The way the gun points, in world space: from the elbow out through the
   * muzzle. Needs the world matrices current.
   */
  barrelDir(out: THREE.Vector3): THREE.Vector3 | null {
    const arm = this.findGunArm();
    if (!arm) return null;
    this.muzzle.getWorldPosition(out);
    arm.el.getWorldPosition(elbowAt);
    return out.sub(elbowAt).normalize();
  }

  /**
   * Turn the gun arm at the shoulder so the barrel points along `dir` (world
   * space), `w` of the way (0 to 1), keeping the pose's twist and elbow.
   * Toward something behind the chest it gives up, gradually: an arm does
   * not wrench round backwards. Call with the pose applied and the world
   * matrices current; it leaves them stale.
   */
  aimArm(dir: THREE.Vector3, w: number): void {
    const arm = this.findGunArm();
    if (!arm || !arm.sh.parent || w <= 0) return;
    arm.sh.parent.getWorldQuaternion(qParent).invert();
    if (!this.barrelDir(aimFrom)) return;
    aimFrom.applyQuaternion(qParent);
    aimTo.copy(dir).applyQuaternion(qParent).normalize();
    // Forward of the chest is +z: full aim out to about 70 degrees off it, none past about 105.
    const k = w * Math.min(1, Math.max(0, (aimTo.z + 0.26) / 0.6));
    if (k <= 0) return;
    qAim.setFromUnitVectors(aimFrom, aimTo).multiply(arm.sh.quaternion);
    arm.sh.quaternion.slerp(qAim, k);
  }

  /** Put the skeleton into a pose. */
  apply(p: Pose): void {
    if (this.fitPose) {
      copyPose(this.fittedPose, p);
      this.fitPose(this.fittedPose);
      p = this.fittedPose;
    }
    const J = this.joints;
    const d = this.dims;
    J.hips.position.set(0, d.hipY + p.hips[0], p.hips[1]);
    J.hips.rotation.set(p.hips[2], p.hips[3], p.hips[4]);
    J.spine.rotation.set(p.spine[0], p.spine[1], p.spine[2]);
    J.chest.rotation.set(p.chest[0], p.chest[1], p.chest[2]);
    J.head.rotation.set(p.head[0], p.head[1], p.head[2]);
    J.shL.rotation.set(p.shL[0], p.shL[1], p.shL[2]);
    J.elL.rotation.set(p.elL[0], p.elL[1], p.elL[2]);
    J.wrL.rotation.set(p.wrL[0], p.wrL[1], p.wrL[2]);
    J.shR.rotation.set(p.shR[0], p.shR[1], p.shR[2]);
    J.elR.rotation.set(p.elR[0], p.elR[1], p.elR[2]);
    J.wrR.rotation.set(p.wrR[0], p.wrR[1], p.wrR[2]);
    J.wingL.rotation.set(p.wingL[0], p.wingL[1], p.wingL[2]);
    J.wingR.rotation.set(p.wingR[0], p.wingR[1], p.wingR[2]);
    this.poseArmor?.(p);
    qh.setFromEuler(J.hips.rotation);
    qInv.copy(qh).invert();
    qBodyInv.copy(this.body.quaternion).invert();
    this.solveLeg(1, p.footL);
    this.solveLeg(-1, p.footR);
    // Skirts ride up with the legs instead of passing through them.
    this.skirts.l.rotation.x = -Math.max(0, this.swing.l - 0.08) * 0.95;
    this.skirts.r.rotation.x = -Math.max(0, this.swing.r - 0.08) * 0.95;
    this.skirts.back.rotation.x = Math.max(0, -Math.min(this.swing.l, this.swing.r) - 0.08) * 0.9;
  }

  /**
   * The thigh's frame (kx, ky, kz, in hips space) with the ankle at `target`
   * (body space). Returns the hip-to-ankle length, kept within reach.
   */
  private bendLeg(side: 1 | -1, target: THREE.Vector3): number {
    const d = this.dims;
    // Vector from the hip joint to the ankle target, in hips-local space.
    v.set(side * d.hipX, -d.hipDrop, 0).applyQuaternion(qh).add(this.joints.hips.position);
    v.subVectors(target, v).applyQuaternion(qInv);
    const a = d.thigh;
    const b = d.shin;
    let len = v.length();
    len = Math.min(Math.max(len, Math.abs(a - b) + 0.05), a + b - 0.01);
    u.copy(v).normalize();
    // Knees point forward and a touch outward.
    hint.set(side * 0.12, 0, 1);
    n.copy(hint).addScaledVector(u, -hint.dot(u));
    if (n.lengthSq() < 1e-6) n.set(0, 1, 0);
    n.normalize();
    const cosA = (a * a + len * len - b * b) / (2 * a * len);
    const A = Math.acos(Math.min(1, Math.max(-1, cosA)));
    // Thigh points down its own -y; build its frame from the bend plane.
    ky.copy(u).multiplyScalar(-Math.cos(A)).addScaledVector(n, -Math.sin(A));
    kz.copy(n).multiplyScalar(Math.cos(A)).addScaledVector(u, -Math.sin(A));
    kx.crossVectors(ky, kz);
    return len;
  }

  /**
   * Which way the shin of the leg just bent points, seen from above, in the
   * hips' parent's space: along the line the knee bends in (the bend plane's
   * normal, crossed with up).
   */
  private shinHeading(): number {
    shinSide.copy(kx).applyQuaternion(qh);
    return Math.hypot(shinSide.x, shinSide.z) > 1e-3 ? Math.atan2(-shinSide.z, shinSide.x) : 0;
  }

  private solveLeg(side: 1 | -1, foot: [number, number, number, number, number]): void {
    const d = this.dims;
    const J = this.joints;
    const hip = side === 1 ? J.hipL : J.hipR;
    const knee = side === 1 ? J.kneeL : J.kneeR;
    const ankle = side === 1 ? J.ankleL : J.ankleR;
    footTarget.set(foot[0], d.ankleY + foot[1], foot[2]);
    // The skate points straight on from the shin, keeping the asked pitch and
    // turning the asked yaw off that line. Kept on the road, it takes the
    // shin's line as the pose stands on the level: as the body banks over
    // the skates in a turn, they hold their line on the road rather than
    // swinging round with the knees.
    let heading = 0;
    if (this.keepFeetOnRoad) {
      this.bendLeg(side, footTarget);
      heading = this.shinHeading();
      footTarget.applyQuaternion(qBodyInv);
    }
    const len = this.bendLeg(side, footTarget);
    if (!this.keepFeetOnRoad) heading = this.shinHeading();
    basis.makeBasis(kx, ky, kz);
    qThigh.setFromRotationMatrix(basis);
    hip.quaternion.copy(qThigh);
    // The thigh hangs along its own -y: how far forward of straight down it points.
    const sw = Math.atan2(-ky.z, ky.y);
    if (side === 1) this.swing.l = sw;
    else this.swing.r = sw;
    const a = d.thigh;
    const b = d.shin;
    const cosB = (a * a + b * b - len * len) / (2 * a * b);
    const B = Math.acos(Math.min(1, Math.max(-1, cosB)));
    qKnee.setFromAxisAngle(X_AXIS, Math.PI - B);
    knee.quaternion.copy(qKnee);
    eul.set(foot[3], heading + foot[4], 0, 'YXZ');
    qFoot.setFromEuler(eul);
    if (this.keepFeetOnRoad) qFoot.premultiply(qBodyInv);
    qTmp.copy(qh).multiply(qThigh).multiply(qKnee).invert().multiply(qFoot);
    ankle.quaternion.copy(qTmp);
  }
}
