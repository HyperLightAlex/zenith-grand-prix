// Dev page: look at the frames. Open with ?debug=mechs
//   default            every frame in both liveries, in one pose (&pose=stand)
//   &poses=a,b,c       one frame (&role=0..2, &team=0..1) in several poses
//   &turn=1            one frame (&role, &team) turned to front, three-quarter, side and back
//   &compare=1         the two Blender Sunhawks, in the same pose and lighting
//   &yaw &dist &h &cx &cz &ly   camera
//   &ortho=10.67       an orthographic camera showing that many metres top to bottom (for model sheets)
//   &bg=e4e6ec         a flat background of that colour, no floor (to compare against a model sheet)
//   &sun=-0.5,0.6,0.6  where the light comes from
import * as THREE from 'three';
import { ROLE } from '../sim/config';
import { buildFrame, useOldSwift } from './render/mech/frames';
import { LIVERIES, COLORS, SUN_DIR } from './render/palette';
import { makePose, type MechRig } from './render/mech/rig';
import { POSES } from './render/mech/poses';
import { getSunhawkModel, setSunhawkModel } from './render/mech/sunhawkSelection';

export function runMechDebug(): void {
  const q = new URLSearchParams(location.search);
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block';
  document.body.style.margin = '0';
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Number(q.get('dpr') ?? 1));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  // A studio backdrop: sky blue fading to haze at the floor line.
  {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#5f8fd6');
    grad.addColorStop(0.7, '#b8cdea');
    grad.addColorStop(1, '#d9dde6');
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    scene.background = t;
  }
  const sun = new THREE.DirectionalLight(COLORS.sunLight, 2.3);
  // &sun=-0.5,0.6,0.6: where the light comes from (a model sheet is lit from the upper left, in front).
  const sunAt = q.get('sun')?.split(',').map(Number);
  sun.position.copy(sunAt?.length === 3 ? new THREE.Vector3(sunAt[0], sunAt[1], sunAt[2]).normalize() : SUN_DIR).multiplyScalar(40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -22;
  sun.shadow.camera.right = 22;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.12;
  scene.add(sun, sun.target, new THREE.HemisphereLight(COLORS.skyLight, COLORS.groundLight, 0.95));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x737c8c }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(400, 100, 0x5d6575, 0x687082);
  grid.position.y = 0.01;
  scene.add(grid);

  const bg = q.get('bg');
  if (bg) {
    scene.background = new THREE.Color(`#${bg}`);
    ground.visible = false;
    grid.visible = false;
  }

  const lib = POSES as Record<string, ReturnType<typeof makePose>>;
  const role = Number(q.get('role') ?? 0) as 0 | 1 | 2;
  const team = Number(q.get('team') ?? 0);
  const poseName = q.get('pose') ?? 'stand';
  const poseList = (q.get('poses') ?? '').split(',').filter(Boolean);
  const place = (rig: MechRig, x: number, z: number, yaw: number, pose: string, flame: number) => {
    rig.root.position.set(x, 0, z);
    rig.root.rotation.y = yaw;
    rig.apply(lib[pose] ?? makePose());
    for (const f of rig.flames) f.mesh.scale.z = f.length * flame;
    scene.add(rig.root);
    return rig;
  };
  const turn = q.has('turn');
  const compare = q.has('compare');
  let rigs: MechRig[];
  if (compare) {
    useOldSwift(false);
    const selected = getSunhawkModel();
    rigs = (['current', 'updated'] as const).map((variant, i) => {
      setSunhawkModel(variant);
      return place(buildFrame(ROLE.FW, LIVERIES[0], '1'), (i - .5) * 7, 0, 0, poseName, poseName === 'boost' ? .7 : .15);
    });
    setSunhawkModel(selected);
    const labels = document.createElement('div');
    labels.style.cssText = 'position:fixed;inset:24px 0 auto;display:flex;justify-content:space-around;color:#172238;font:700 24px "Barlow Condensed",sans-serif;pointer-events:none';
    for (const label of ['Current design', 'Updated design']) {
      const el = document.createElement('span');
      el.textContent = label;
      labels.append(el);
    }
    document.body.append(labels);
  } else if (turn) {
    const yaws = [0, -0.7, -Math.PI / 2, Math.PI];
    rigs = yaws.map((yaw, i) => place(buildFrame(role, LIVERIES[team], String(role + 1)), (i - 1.5) * 7.5, 0, yaw, poseName, 0.25));
  } else if (poseList.length) {
    rigs = poseList.map((name, i) => place(buildFrame(role, LIVERIES[team], String(role + 1)), (i - (poseList.length - 1) / 2) * 9, 0, 0, name, name === 'tuck' || name === 'boost' ? 0.7 : 0.15));
  } else {
    rigs = [ROLE.FW, ROLE.MF, ROLE.DF].flatMap((r, i) => LIVERIES.map((liv, t) => place(buildFrame(r, liv, String(i + 1)), (i - 1) * 8, -11 * t, 0, poseName, 0.3)));
  }
  const yaw = Number(q.get('yaw') ?? (turn || compare ? 0 : 30)) * (Math.PI / 180);
  const dist = Number(q.get('dist') ?? (turn ? 80 : 26));
  const camH = Number(q.get('h') ?? (turn ? 5 : 7));
  const ortho = Number(q.get('ortho') ?? (compare ? Math.max(12, 17 * innerHeight / innerWidth) : 0));
  const aspect = innerWidth / innerHeight;
  const cam =
    ortho > 0
      ? new THREE.OrthographicCamera((-ortho * aspect) / 2, (ortho * aspect) / 2, ortho / 2, -ortho / 2, 1, 500)
      : new THREE.PerspectiveCamera(Number(q.get('fov') ?? (turn ? 14 : 40)), aspect, 0.1, 500);
  const cx = Number(q.get('cx') ?? 0);
  const cz = Number(q.get('cz') ?? (poseList.length || turn || compare ? 0 : -3));
  cam.position.set(cx + Math.sin(yaw) * dist, camH, cz + Math.cos(yaw) * dist);
  cam.lookAt(cx, Number(q.get('ly') ?? 4.4), cz);
  renderer.render(scene, cam);
  (window as unknown as { __info: unknown }).__info = { rigs: rigs.length, pose: poseName };
}
