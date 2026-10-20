import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MechRig, makePose, mirrorPose, type Pose } from '../src/client/render/mech/rig';
import { POSES, CLIPS } from '../src/client/render/mech/poses';

const DIMS = { hipY: 5.5, hipX: 0.72, hipDrop: 0.25, thigh: 2.35, shin: 2.3, ankleY: 0.6, spineY: 0.4, chestY: 0.8, shoulderX: 1.5, shoulderY: 0.95, headY: 1.5, headZ: 0.15, upperArm: 1.5, foreArm: 1.45, height: 8.8 };

const all: [string, Pose][] = [...Object.entries(POSES), ...Object.values(CLIPS).flatMap((c, i) => [[`clip ${i} wind`, c.wind], [`clip ${i} hit`, c.hit]] as [string, Pose][])];
all.push(...all.map(([name, p]): [string, Pose] => [`${name} mirrored`, mirrorPose(p)]));

const fwd = new THREE.Vector3();
const hinge = new THREE.Vector3();
const along = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Seen from above, the angle (degrees) between a skate and the line its shin bends in; and the skate's heading. */
function feet(rig: MechRig): { off: number; heading: number; roll: number }[] {
  rig.root.updateMatrixWorld(true);
  return (['L', 'R'] as const).map((s) => {
    const ankle = rig.joints[`ankle${s}`];
    const knee = rig.joints[`knee${s}`];
    fwd.set(0, 0, 1).transformDirection(ankle.matrixWorld);
    // The knee bends about its own x: the shin's line from above is that axis crossed with up.
    hinge.set(1, 0, 0).transformDirection(knee.matrixWorld);
    along.crossVectors(hinge, UP);
    const heading = Math.atan2(fwd.x, fwd.z);
    const off = heading - Math.atan2(along.x, along.z);
    const roll = new THREE.Vector3(1, 0, 0).transformDirection(ankle.matrixWorld).y;
    return { off: Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) * (180 / Math.PI), heading, roll };
  });
}

describe('the skates', () => {
  for (const onRoad of [false, true]) {
    it(`point straight on from the shins in every pose${onRoad ? ' (kept on the road)' : ''}`, () => {
      const rig = new MechRig(DIMS);
      rig.keepFeetOnRoad = onRoad;
      for (const [name, pose] of all) {
        rig.apply(pose);
        for (const f of feet(rig)) expect(f.off, name).toBeLessThan(0.5);
      }
    });
  }

  it('kept on the road, hold their line and stay flat as the body banks over them', () => {
    const rig = new MechRig(DIMS);
    rig.keepFeetOnRoad = true;
    for (const [name, pose] of all) {
      rig.body.rotation.set(0, 0, 0);
      rig.apply(pose);
      const level = feet(rig).map((f) => f.heading);
      for (const bank of [-0.68, -0.3, 0.3, 0.68]) {
        rig.body.rotation.set(-0.1, 0, bank);
        rig.apply(pose);
        feet(rig).forEach((f, i) => {
          expect(Math.abs(f.heading - level[i]), `${name} at ${bank}`).toBeLessThan(1e-6);
          expect(Math.abs(f.roll), `${name} at ${bank}`).toBeLessThan(1e-6);
        });
      }
    }
  });

  it('are not pigeon-toed standing: neither toe turns in toward the other', () => {
    const rig = new MechRig(DIMS);
    rig.apply(makePose());
    const [l, r] = feet(rig);
    // +x is the mech's left: the left toe must not turn right, nor the right toe left.
    expect(l.heading).toBeGreaterThanOrEqual(0);
    expect(r.heading).toBeLessThanOrEqual(0);
    expect(l.heading).toBeCloseTo(-r.heading, 6);
  });
});
