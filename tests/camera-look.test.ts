// Looking round (render/cameraRig.ts, game/freeCam.ts): free steering, the
// right stick turns the chase camera all the way round the mech, behind it
// too; locked on, it only tilts. A replay's free camera takes over from
// wherever the camera was without a jump, and turns and zooms by hand.

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MODE, emptyInput } from '../src/sim/index';
import { CameraRig, FREE_DIST } from '../src/client/render/cameraRig';
import { FreeCamControl } from '../src/client/game/freeCam';
import { DEFAULT_FEEL } from '../src/client/game/tuning';
import { trackDir } from '../src/client/render/trackSpace';
import { TRACK, newRace } from './helpers';

function rig() {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 40000);
  const cam = new CameraRig(camera, TRACK, { ...DEFAULT_FEEL });
  cam.mode = 'play';
  const race = newRace(3);
  const mech = race.mechs[0];
  mech.s = 300;
  mech.d = 0;
  mech.mode = MODE.SPEED;
  const sub = { s: mech.s, d: mech.d, h: 0, mech, target: null };
  return { cam, camera, mech, sub };
}

/** Which way the camera looks, against the road ahead at the mech: 1 ahead, -1 behind. */
function ahead(camera: THREE.PerspectiveCamera, s: number): number {
  const dir = camera.getWorldDirection(new THREE.Vector3());
  dir.y = 0;
  const road = trackDir(TRACK, s, 1, 0, new THREE.Vector3());
  road.y = 0;
  return dir.normalize().dot(road.normalize());
}

describe('looking round while racing', () => {
  it('free steering: the stick pulled back looks behind the mech, let go and it swings ahead again', () => {
    const { cam, camera, sub } = rig();
    for (let k = 0; k < 90; k++) cam.update(1 / 60, sub, 0, 0, false);
    expect(ahead(camera, sub.s)).toBeGreaterThan(0.9);
    for (let k = 0; k < 90; k++) cam.update(1 / 60, sub, 0, 1, false);
    expect(ahead(camera, sub.s)).toBeLessThan(-0.9);
    // Pushed right, it looks out to the right of the road, square on.
    for (let k = 0; k < 90; k++) cam.update(1 / 60, sub, 1, 0, false);
    expect(Math.abs(ahead(camera, sub.s))).toBeLessThan(0.3);
    for (let k = 0; k < 90; k++) cam.update(1 / 60, sub, 0, 0, false);
    expect(ahead(camera, sub.s)).toBeGreaterThan(0.9);
  });

  it('swings the short way round from one side of behind to the other', () => {
    const { cam, camera, sub } = rig();
    for (let k = 0; k < 90; k++) cam.update(1 / 60, sub, -0.2, 1, false);
    for (let k = 0; k < 6; k++) {
      cam.update(1 / 60, sub, 0.2, 1, false);
      expect(ahead(camera, sub.s)).toBeLessThan(-0.85);
    }
  });

  it('locked on, the stick does not turn the camera off the fight', () => {
    const { cam, camera, mech, sub } = rig();
    mech.mode = MODE.BATTLE;
    const target = { s: sub.s + 30, d: 0 };
    for (let k = 0; k < 120; k++) cam.update(1 / 60, { ...sub, target }, 0, 1, false);
    expect(ahead(camera, sub.s)).toBeGreaterThan(0.8);
  });
});

describe("a replay's free camera", () => {
  it('takes over from where the camera is without a jump', () => {
    const { cam, camera, sub } = rig();
    for (let k = 0; k < 90; k++) cam.update(1 / 60, sub, 0, 0, false);
    const was = camera.position.clone();
    cam.freeFromView(sub);
    cam.mode = 'free';
    cam.update(1 / 60, sub, 0, 0, false);
    expect(camera.position.distanceTo(was)).toBeLessThan(1.5);
  });

  it('turns with the stick and zooms with the triggers, within its range', () => {
    const { cam } = rig();
    const ctl = new FreeCamControl();
    const input = emptyInput();
    const yaw = cam.free.yaw;
    expect(ctl.wanted(0.8, 0, input, 'pad')).toBe(true);
    expect(ctl.wanted(0, 0, input, 'pad')).toBe(false);
    for (let k = 0; k < 60; k++) ctl.frame(1 / 60, cam.free, 0.8, 0, input, 'pad');
    expect(Math.abs(cam.free.yaw - yaw)).toBeGreaterThan(1);
    input.brake = 1;
    for (let k = 0; k < 600; k++) ctl.frame(1 / 60, cam.free, 0, 0, input, 'pad');
    expect(cam.free.dist).toBe(FREE_DIST[1]);
  });
});
