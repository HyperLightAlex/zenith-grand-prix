import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MechRig } from '../src/client/render/mech/rig';
import { LocalSession } from '../src/client/game/session';
import { DEFAULT_FEEL } from '../src/client/game/tuning';
import { MERIDIAN } from '../src/sim/index';
import { makeSeats } from './helpers';
import { RaceView } from '../src/client/render/raceView';
import { buildFrame } from '../src/client/render/mech/frames';
import { fitCameraToViewport } from '../src/client/render/viewport';
import type { Renderer } from '../src/client/render/renderer';
import type { TrackVisual } from '../src/client/render/trackMesh';
import { drawClock, look } from '../src/client/render/look';

// Keep real scene ownership, animation, cameras and simulation. Substitute
// only GPU effects and mesh construction so lifecycle checks can run in Node.
vi.mock('../src/client/render/mech/frames', () => ({
  buildFrame: vi.fn(() => {
    const rig = new MechRig({ hipY:5.5, hipX:.72, hipDrop:.25, thigh:2.35, shin:2.3, ankleY:.6, spineY:.4, chestY:.8, shoulderX:1.5, shoulderY:.95, headY:1.5, headZ:.15, upperArm:1.5, foreArm:1.45, height:8.8 });
    rig.root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    return rig;
  }),
  setFlameTime: () => {},
}));
vi.mock('../src/client/render/fx', () => {
  const mesh = () => new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  return {
    Fx: class { group = new THREE.Group(); resize() {} update() {} dispose() {} beginTracers() {} endTracers() {} spray() {} spriteTexture() { return null; } },
    Trail: class { mesh = mesh(); setColor() {} update() {} },
    makeBubble: mesh, makeLockRing: mesh, makeRamProw: mesh, makeShadow: mesh, makeShield: mesh, makeSnareRing: mesh, shadowTexture: () => null,
  };
});

function setup(localId: number, previewOnly: boolean) {
  const session = new LocalSession(MERIDIAN, { seed:1, seats:makeSeats([localId]) }, localId);
  const uniforms: Record<string, {value: number | THREE.Vector3}> = Object.fromEntries(['uSpeed','uBoost','uTravel','uBlurK','uLineK','uFlash','uHurt'].map(k => [k,{value:0}]));
  uniforms.uTint = {value:new THREE.Vector3()};
  const renderer = { scene:new THREE.Scene(), camera:new THREE.PerspectiveCamera(60,16/9), canvas:{clientWidth:1280,clientHeight:720}, renderer:{domElement:{clientHeight:720}}, speedPass:{uniforms}, setBloom() {} } as unknown as Renderer;
  const track = { lights:[], gates:{setLit() {},pulse() {}} } as unknown as TrackVisual;
  const view = new RaceView(renderer, session, track, {...DEFAULT_FEEL}, [0,1], previewOnly);
  if (previewOnly) view.cam.mode = 'orbit';
  return {view, renderer, session};
}

afterEach(() => vi.clearAllMocks());

describe('garage preview lifecycle', () => {
  it('preserves proportions through garage framing, viewport resizing and returning to play', () => {
    const {view, renderer} = setup(0, true);
    const camera = renderer.camera;
    view.cam.shiftX = .22;
    for (const [width,height] of [[1280,720], [720,900], [1920,600]]) {
      fitCameraToViewport(camera, width, height);
      view.cam.mode = 'orbit';
      view.update(1/60,0,0,false);
      expect(camera.aspect).toBeCloseTo(width/height, 10);
      expect(camera.view?.offsetX).toBeCloseTo(-.22 * width/height, 10);
      for (const mode of ['orbit','play'] as const) {
        view.cam.mode = mode;
        view.update(1/60,0,0,false);
        camera.updateMatrixWorld();
        const project = (x: number, y: number) => new THREE.Vector3(x,y,-20).applyMatrix4(camera.matrixWorld).project(camera);
        const origin = project(0,0), x = project(1,0), y = project(0,1);
        expect((x.x-origin.x)*width).toBeCloseTo((y.y-origin.y)*height, 8);
      }
      expect(camera.view?.enabled).toBe(false);
      expect(camera.aspect).toBeCloseTo(width/height, 10);
    }
    view.dispose();
  });
  for (const localId of [0,2,4]) it(`builds, animates, replaces and disposes only selected pilot ${localId}`, () => {
    const {view, renderer} = setup(localId, true);
    expect(buildFrame).toHaveBeenCalledTimes(1);
    expect(view.plates.filter(Boolean).map(p => p.id)).toEqual([localId]);
    view.update(1/60,0,0,false);
    expect(view.positionOf(localId).toArray().every(Number.isFinite)).toBe(true);
    const rig = vi.mocked(buildFrame).mock.results[0].value as MechRig;
    const armor = rig.root.children.find(o => o instanceof THREE.Mesh && o.geometry instanceof THREE.BoxGeometry) as THREE.Mesh;
    const dispose = vi.spyOn(armor.geometry, 'dispose');
    view.refreshMechModels('all');
    expect(buildFrame).toHaveBeenCalledTimes(2);
    expect(dispose).toHaveBeenCalledOnce();
    view.update(1/60,0,0,false);
    view.dispose();
    expect(renderer.scene.children).not.toContain(view.group);
  });
  it('still builds and updates all six pilots for a race after leaving a preview', () => {
    const preview = setup(4,true);
    preview.view.dispose();
    vi.clearAllMocks();
    const {view} = setup(4,false);
    expect(buildFrame).toHaveBeenCalledTimes(6);
    expect(view.plates.map(p => p.id)).toEqual([0,1,2,3,4,5]);
    view.update(1/60,0,0,false);
    for (let id=0;id<6;id++) expect(view.positionOf(id).toArray().every(Number.isFinite)).toBe(true);
    view.dispose();
  });
});

describe('customization inspection camera', () => {
  const center = new THREE.Vector3(0, 4.4, 0);
  function inspection() {
    const result = setup(0, true);
    result.view.cam.orbitFrame = new THREE.Matrix4();
    result.view.cam.turntable = true;
    result.view.update(0, 0, 0, false);
    return result;
  }

  it('keeps horizontal turning and the inspection distance while looking above or below the mech', () => {
    const {view, renderer} = inspection();
    try {
      const camera = renderer.camera;
      const initial = camera.position.clone();
      const radius = initial.distanceTo(center);
      const yaw = (p: THREE.Vector3) => Math.atan2(p.x, -p.z);
      view.cam.turn(.7, .5);
      view.update(0, 0, 0, false);
      expect(yaw(camera.position) - yaw(initial)).toBeCloseTo(.7, 10);
      expect(camera.position.y).toBeGreaterThan(initial.y + 5);
      expect(camera.position.distanceTo(center)).toBeCloseTo(radius, 10);
      expect(camera.getWorldDirection(new THREE.Vector3()).dot(center.clone().sub(camera.position).normalize())).toBeCloseTo(1, 10);

      // Held input reaches a stable limit, never flipping over the mech or
      // putting the camera through the hangar floor.
      for (const direction of [100, -100]) {
        view.cam.turn(0, direction);
        view.update(0, 0, 0, false);
        const limit = camera.position.clone();
        view.cam.turn(0, direction);
        view.update(0, 0, 0, false);
        expect(camera.position.distanceTo(limit)).toBeLessThan(1e-10);
        expect(camera.position.y).toBeGreaterThan(1);
        expect(camera.position.y).toBeLessThan(20);
        expect(Math.hypot(camera.position.x, camera.position.z)).toBeGreaterThan(8);
        expect(camera.position.distanceTo(center)).toBeCloseTo(radius, 10);
      }
    } finally { view.dispose(); }
  });

  it('holds the view across customization screens, then resets and resumes the ordinary garage pan on exit', () => {
    const {view, renderer} = inspection();
    try {
      const camera = renderer.camera, initial = camera.position.clone();
      view.cam.turn(1.2, .6);
      view.update(0, 0, 0, false);
      const edited = camera.position.clone();
      view.cam.turntable = true; // parts -> paint, or a dialog over the editor
      view.update(3, 0, 0, false);
      expect(camera.position.distanceTo(edited)).toBeLessThan(1e-10);

      view.cam.turntable = false;
      view.update(0, 0, 0, false);
      expect(camera.position.distanceTo(initial)).toBeLessThan(1e-10);
      view.update(1, 0, 0, false);
      expect(camera.position.distanceTo(initial)).toBeGreaterThan(1);
      const panning = camera.position.clone();
      view.cam.turntable = true; // a new visit starts from the ordinary pan
      view.update(1, 0, 0, false);
      expect(camera.position.distanceTo(panning)).toBeLessThan(1e-10);
    } finally { view.dispose(); }
  });

  it('does not carry inspection offsets into the race camera or change its right-stick response', () => {
    const inspected = setup(0, false), ordinary = setup(0, false);
    try {
      inspected.view.cam.turntable = true;
      inspected.view.cam.turn(2, .8);
      inspected.view.cam.turntable = false;
      for (const result of [inspected, ordinary]) {
        result.session.race.mechs[0].speed = 80;
        result.view.cam.mode = 'play';
        result.view.update(1/60, .6, -.4, false);
      }
      expect(inspected.renderer.camera.position.distanceTo(ordinary.renderer.camera.position)).toBeLessThan(1e-10);
      expect(inspected.renderer.camera.quaternion.angleTo(ordinary.renderer.camera.quaternion)).toBeLessThan(1e-7);
      expect(inspected.renderer.camera.fov).toBe(ordinary.renderer.camera.fov);
    } finally { inspected.view.dispose(); ordinary.view.dispose(); }
  });
});

describe('steering presentation', () => {
  it('responds between anime drawings while keeping the stride and other pilots on held poses', () => {
    const previous = {on: look.on, steps: look.steps, time: drawClock.time};
    look.on = true;
    look.steps = 12;
    drawClock.time = 1;
    const {view, session} = setup(0, false);
    try {
      const me = session.race.mechs[0], other = session.race.mechs[1];
      me.speed = other.speed = 60;
      me.boosting = other.boosting = true; // the slower 8 Hz pose cadence
      const rigs = vi.mocked(buildFrame).mock.results.map(r => r.value as MechRig);
      const rig = rigs[0];
      view.update(1/60,0,0,false);
      const stride = rig.joints.hips.position.clone();
      me.steer = other.steer = 1;
      view.update(1/60,0,0,false); // same drawing: no wait for its next boundary
      expect(rig.body.rotation.z).toBeGreaterThan(0);
      expect(rigs[1].body.rotation.z).toBe(0);
      expect(rig.joints.hips.position).toEqual(stride);
      const lean = rig.body.rotation.z;
      me.steer = -1;
      view.update(1/60,0,0,false);
      expect(rig.body.rotation.z).toBeLessThan(lean);
      const pausedLean = rig.body.rotation.z;
      me.steer = 1;
      view.update(0,0,0,false);
      expect(rig.body.rotation.z).toBe(pausedLean);
    } finally {
      view.dispose();
      look.on = previous.on;
      look.steps = previous.steps;
      drawClock.time = previous.time;
    }
  });
});
