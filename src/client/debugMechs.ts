// Dev page: line the frames up on a turntable. Open with ?debug=mechs
import * as THREE from 'three';
import { ROLE } from '../sim/config';
import { buildFrame } from './render/mech/frames';
import { LIVERIES, COLORS, SUN_DIR } from './render/palette';
import { makePose } from './render/mech/rig';
import { POSES } from './render/mech/poses';

export function runMechDebug(): void {
  const q = new URLSearchParams(location.search);
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block';
  document.body.style.margin = '0';
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fb6e8);
  const sun = new THREE.DirectionalLight(COLORS.sunLight, 2.3);
  sun.position.copy(SUN_DIR);
  scene.add(sun, new THREE.HemisphereLight(COLORS.skyLight, COLORS.groundLight, 0.95));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: 0x59616f }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  // ?poses=a,b,c lines one role up in several poses; otherwise all six frames in one pose.
  const poseList = (q.get('poses') ?? '').split(',').filter(Boolean);
  const poseName = q.get('pose') ?? 'stand';
  const lib = POSES as Record<string, ReturnType<typeof makePose>>;
  const role = Number(q.get('role') ?? 0) as 0 | 1 | 2;
  const team = Number(q.get('team') ?? 0);
  const rigs = poseList.length
    ? poseList.map((name, i) => {
        const rig = buildFrame(role, LIVERIES[team], String(role + 1));
        rig.root.position.set((i - (poseList.length - 1) / 2) * 9, 0, 0);
        rig.apply(lib[name] ?? makePose());
        for (const f of rig.flames) f.mesh.scale.z = f.length * (name === 'tuck' || name === 'boost' ? 0.7 : 0.15);
        scene.add(rig.root);
        return rig;
      })
    : [ROLE.FW, ROLE.MF, ROLE.DF].flatMap((r, i) =>
        LIVERIES.map((liv, t) => {
          const rig = buildFrame(r, liv, String(i + 1));
          rig.root.position.set((i - 1) * 8, 0, t === 0 ? 0 : -11);
          rig.apply(lib[poseName] ?? makePose());
          for (const f of rig.flames) f.mesh.scale.z = f.length * 0.3;
          scene.add(rig.root);
          return rig;
        }),
      );
  const yaw = Number(q.get('yaw') ?? 30) * (Math.PI / 180);
  const dist = Number(q.get('dist') ?? 26);
  const camH = Number(q.get('h') ?? 7);
  const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 500);
  const cx = Number(q.get('cx') ?? 0);
  const cz = Number(q.get('cz') ?? (poseList.length ? 0 : -3));
  cam.position.set(cx + Math.sin(yaw) * dist, camH, cz + Math.cos(yaw) * dist);
  cam.lookAt(cx, 4.2, cz);
  renderer.render(scene, cam);
  (window as unknown as { __info: unknown }).__info = { rigs: rigs.length, pose: poseName };
}
