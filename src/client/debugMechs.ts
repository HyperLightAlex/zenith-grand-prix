// Dev page: look at the frames. Open with ?debug=mechs
//   default            every frame in both liveries, in one pose (&pose=stand)
//   &poses=a,b,c       one frame (&role=0..2, &team=0..1) in several poses
//   &turn=1            one frame (&role, &team) turned to front, three-quarter, side and back
//   &compare=1         the two Blender Sunhawks, in the same pose and lighting
//   &yaw &dist &h &cx &cz &ly   camera
//   &ortho=10.67       an orthographic camera showing that many metres top to bottom (for model sheets)
//   &bg=e4e6ec         a flat background of that colour, no floor (to compare against a model sheet)
//   &jets=0.7          hold jet power for angle checks; &look=plain checks the plain cone
//   &sun=-0.5,0.6,0.6  where the light comes from
//   &heads=3           design 3's custom mech of the frame with each design's head in turn (&turnTo=-0.5 turns them, &gap=6.5 spaces them)
//   &painted           the markings as the anime look paints them (the pictures), drawn as they load
import * as THREE from 'three';
import { ROLE } from '../sim/config';
import { buildFrame, useOldSwift } from './render/mech/frames';
import { buildCustomFrame } from './render/mech/customFrame';
import { rosterAsset } from './render/mech/rosterAsset';
import { sunhawkDetailMaterial } from './render/mech/sunhawkDetails';
import { setPaintedMarkings } from './render/mech/decals';
import { FRAME_DESIGNS, PART_SLOTS, decodeBuild, stockBuild, type PartSlot } from '../custom/mechBuild';
import { LIVERIES, COLORS, SUN_DIR } from './render/palette';
import { makePose, type MechRig } from './render/mech/rig';
import { POSES } from './render/mech/poses';
import { getSunhawkModel, setSunhawkModel } from './render/mech/sunhawkSelection';
import { setMechDetail } from './render/mech/detail';
import { DRAWN_FLAMES } from './render/mech/parts';
import { getRosterModel, setRosterModel } from './render/mech/rosterSelection';
import { fitCameraToViewport } from './render/viewport';

export function runMechDebug(): void {
  const q = new URLSearchParams(location.search);
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block';
  document.body.style.margin = '0';
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Number(q.get('dpr') ?? 1));
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
  const jetPower = q.has('jets') ? Math.max(0, Math.min(1.5, Number(q.get('jets')) || 0)) : null;
  if (jetPower !== null) DRAWN_FLAMES.uDrawn.value = q.get('look') === 'plain' ? 0 : 1;
  const place = (rig: MechRig, x: number, z: number, yaw: number, pose: string, flame: number) => {
    rig.root.position.set(x, 0, z);
    rig.root.rotation.y = yaw;
    rig.body.rotation.z = Number(q.get('bank') ?? 0);
    rig.apply(lib[pose] ?? makePose());
    setMechDetail(rig, Number(q.get('lod') ?? 0));
    for (const f of rig.flames) {
      f.mesh.scale.z = f.length * (jetPower ?? flame);
      if (jetPower !== null) {
        f.mesh.scale.x = f.mesh.scale.y = f.width * (.8 + jetPower * .5);
        f.mesh.visible = jetPower > .03;
        if (f.burner) (f.burner.material as THREE.ShaderMaterial).uniforms.uPower.value = jetPower;
      }
    }
    scene.add(rig.root);
    return rig;
  };
  // &customCheck: window.customCheck(role) builds every part of every design on every
  // other design of the frame and reports what is missing (tools/custom-check.mjs).
  if (q.has('customCheck')) {
    (window as unknown as { customCheck: typeof customCheck }).customCheck = customCheck;
    // The Sunhawk's painted details as a team's custom mech wears them (its lettering redrawn), as a PNG.
    (window as unknown as { sunhawkLettering: (team: number) => string }).sunhawkLettering = (team) =>
      ((sunhawkDetailMaterial(LIVERIES[team]).map!.image as HTMLCanvasElement).toDataURL?.() ?? '');
  }
  const turn = q.has('turn');
  // &custom=<a build, as text>: that custom mech (for the team's glow and markings) in place of the stock one.
  const custom = decodeBuild(q.get('custom'));
  const make = () => (custom ? buildCustomFrame(role, LIVERIES[team], custom, String(role + 1)) : buildFrame(role, LIVERIES[team], String(role + 1)));
  const compare = q.has('compare');
  // &heads=<chest design>: that design's custom mech with each design's head in turn (how heads sit on its chest).
  const heads = q.get('heads');
  let rigs: MechRig[];
  if (compare) {
    useOldSwift(false);
    const selected = getSunhawkModel();
    const rosterCompare=q.has('rosterCompare');
    const selectedRoster=getRosterModel();
    rigs = (['current', 'updated'] as const).map((variant, i) => {
      setSunhawkModel(variant);
      setRosterModel(variant);
      return place(buildFrame(rosterCompare?role:ROLE.FW, LIVERIES[rosterCompare?team:0], String(role+1)), (i - .5) * 7, 0, 0, poseName, poseName === 'boost' ? .7 : .15);
    });
    setSunhawkModel(selected);
    setRosterModel(selectedRoster);
    const labels = document.createElement('div');
    labels.style.cssText = 'position:fixed;inset:24px 0 auto;display:flex;justify-content:space-around;color:#172238;font:700 24px "Barlow Condensed",sans-serif;pointer-events:none';
    for (const label of ['Current reference', 'Updated design']) {
      const el = document.createElement('span');
      el.textContent = label;
      labels.append(el);
    }
    document.body.append(labels);
  } else if (heads !== null) {
    rigs = [0, 1, 2, 3, 4].map((h) => {
      const b = stockBuild(Number(heads));
      b.parts.head = h;
      return place(buildCustomFrame(role, LIVERIES[team], b, String(role + 1)), (h - 2) * Number(q.get('gap') ?? 6.5), 0, Number(q.get('turnTo') ?? -0.5), poseName, 0.25);
    });
  } else if (turn) {
    const yaws = [0, -0.7, -Math.PI / 2, Math.PI];
    rigs = yaws.map((yaw, i) => place(make(), (i - 1.5) * 7.5, 0, yaw, poseName, 0.25));
  } else if (poseList.length) {
    rigs = poseList.map((name, i) => place(make(), (i - (poseList.length - 1) / 2) * 9, 0, 0, name, name === 'tuck' || name === 'boost' ? 0.7 : 0.15));
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
  let lastWidth = 0, lastHeight = 0;
  const resize = () => {
    const width = canvas.clientWidth, height = canvas.clientHeight;
    if (!width || !height || (width === lastWidth && height === lastHeight)) return;
    lastWidth = width; lastHeight = height;
    renderer.setSize(width, height, false);
    // The automatic comparison framing keeps both models in view on narrow
    // panels. Explicit model-sheet framing keeps its requested vertical span.
    const span = compare && !q.has('ortho') ? Math.max(12, 17 * height / width) : ortho;
    fitCameraToViewport(cam, width, height, span);
    renderer.render(scene, cam);
  };
  resize();
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(canvas);
  // Keep texture loading and the three-frame jet loop visible in this focused
  // effects check. Ordinary model-sheet views remain a single render.
  if (q.has('painted')) {
    setPaintedMarkings(true);
    if (jetPower === null) renderer.setAnimationLoop(() => renderer.render(scene, cam));
  }
  if (jetPower !== null) renderer.setAnimationLoop((now) => {
    DRAWN_FLAMES.uFrame.value = Math.floor(now * .012) % 3;
    renderer.render(scene, cam);
  });
  (window as unknown as { __info: unknown }).__info = { rigs: rigs.length, pose: poseName };
}

/**
 * Every part of every design on every other design of a frame (each design
 * with one part swapped for each other design's): each builds, and has armour
 * on every joint at every level of detail, its ink, its markings, its main
 * and leg thrusters, and a muzzle on the gun arm. Returns what failed.
 */
function customCheck(role: 0 | 1 | 2, bases = [0, 1, 2, 3, 4], slots: readonly PartSlot[] = PART_SLOTS): { built: number; failed: string[]; ms: number } {
  const failed: string[] = [];
  let built = 0;
  const t0 = performance.now();
  for (const base of bases) {
    for (const slot of slots) {
      for (let v = 0; v < 5; v++) {
        const b = stockBuild(base);
        b.parts[slot] = v;
        const label = `${FRAME_DESIGNS[role][base]} with the ${FRAME_DESIGNS[role][v]}'s ${slot}`;
        try {
          const rig = buildCustomFrame(role, LIVERIES[base], b, '1');
          built++;
          rig.root.updateMatrixWorld(true);
          rig.detailLevels.forEach((groups, level) => {
            for (const j of ['head', 'chest', 'spine', 'hips', 'shL', 'shR', 'elL', 'elR', 'wrL', 'wrR', 'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR'] as const) {
              if (!groups.some((g) => g.parent === rig.joints[j])) failed.push(`${label}: no armour on ${j} at level ${level}`);
            }
          });
          let ink = 0;
          let marks = 0;
          rig.root.traverse((o) => {
            if (o.name === 'Batched ink hull') ink++;
            if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry?.type === 'PlaneGeometry') marks++;
          });
          if (ink !== 3) failed.push(`${label}: ink at ${ink} levels`);
          if (!marks) failed.push(`${label}: no markings`);
          if (!rig.flames.some((f) => f.bank === 'main')) failed.push(`${label}: no main thruster`);
          if (rig.flames.filter((f) => f.bank === 'leg').length !== 2) failed.push(`${label}: ${rig.flames.filter((f) => f.bank === 'leg').length} leg thrusters`);
          const gun = rig.muzzle.parent;
          if (gun !== rig.joints.wrR && gun !== rig.joints.elR) failed.push(`${label}: muzzle on ${gun?.name}`);
          // Each part's modelled insignia: kept on its own faction's mech, the team's emblem in its place on another's.
          const want: { kept: string[]; replaced: string[] } = { kept: [], replaced: [] };
          for (const s of PART_SLOTS) {
            const id = FRAME_DESIGNS[role][b.parts[s]];
            if (id === 'sunhawk') continue;
            for (const a of rosterAsset(id).insignias) if (a.part === s) (b.parts[s] === base ? want.kept : want.replaced).push(`${id}/${a.id}`);
          }
          const got = rig.root.userData.insignias as typeof want;
          const same = (x: string[], y: string[]) => [...new Set(x)].sort().join() === [...new Set(y)].sort().join();
          if (!same(got.kept, want.kept) || !same(got.replaced, want.replaced)) failed.push(`${label}: insignias ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
          const emblems: THREE.Mesh[] = [];
          rig.root.traverse((o) => {
            if (o.userData.insignia && (o as THREE.Mesh).isMesh) emblems.push(o as THREE.Mesh);
          });
          if (emblems.length !== got.replaced.length || emblems.some((e) => e.geometry.getAttribute('position').count < 3)) failed.push(`${label}: ${emblems.length} emblems for ${got.replaced.length} insignias`);
          rig.root.traverse((o) => {
            const mesh = o as THREE.Mesh;
            mesh.geometry?.dispose();
            if (mesh.userData?.ownMaterial) {
              const mat = mesh.material as THREE.ShaderMaterial & { map?: THREE.Texture };
              mat.map?.dispose();
              for (const u of Object.values(mat.uniforms ?? {})) (u.value as THREE.Texture)?.isTexture && (u.value as THREE.Texture).dispose();
              mat.dispose();
            }
          });
        } catch (e) {
          failed.push(`${label}: ${(e as Error).message}`);
        }
      }
    }
  }
  return { built, failed, ms: Math.round(performance.now() - t0) };
}
