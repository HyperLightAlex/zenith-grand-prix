// Pieces shared by the frames: thruster flames, the race number, and the
// helpers each frame builder uses to hang merged parts on its skeleton.
import * as THREE from 'three';
import type { Livery } from '../palette';
import { Kit } from './kit';
import type { Flame, MechRig } from './rig';

const flameGeo = (() => {
  // Cone with its mouth at the origin, pointing down -z.
  const g = new THREE.ConeGeometry(1, 1, 8, 1, true);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -0.5);
  return g;
})();

const flameMaterials = new Map<number, THREE.ShaderMaterial>();

function flameMaterial(color: number): THREE.ShaderMaterial {
  let m = flameMaterials.get(color);
  if (m) return m;
  m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uPower: { value: 1 } },
    vertexShader: /* glsl */ `
      varying float vT;
      void main() {
        vT = -position.z;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime, uPower;
      varying float vT;
      void main() {
        float core = smoothstep(0.55, 0.0, vT);
        float fl = 0.82 + 0.18 * sin(uTime * 60.0 + vT * 22.0);
        vec3 col = mix(uColor, vec3(1.0), core * 0.8) * (1.4 + core * 1.4) * fl;
        float a = (1.0 - vT) * (1.0 - vT) * uPower;
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  flameMaterials.set(color, m);
  return m;
}

/** The race number, painted for one mech. */
export function numberDecal(text: string, livery: Livery): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = `#${new THREE.Color(livery.trim).getHexString()}`;
  g.font = 'italic 800 104px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 62, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  // Made for this one mech, unlike the shared kit materials, so it is freed with it.
  decal.userData.ownMaterial = true;
  return decal;
}

export interface FrameCtx {
  rig: MechRig;
  livery: Livery;
  /** Merge a kit's parts and hang them on a joint. */
  put(joint: THREE.Object3D, k: Kit): void;
  /** A thruster flame: mouth at `at`, pointing down -z after `rot`. */
  flame(parent: THREE.Object3D, at: [number, number, number], rot: [number, number, number], width: number, length: number, bank: Flame['bank']): void;
}

export function frameCtx(rig: MechRig, livery: Livery): FrameCtx {
  const mat = flameMaterial(livery.glow);
  return {
    rig,
    livery,
    put(joint, k) {
      const built = k.build();
      joint.add(built.group);
      if (built.glow) rig.glowMeshes.push(built.glow);
    },
    flame(parent, at, rot, width, length, bank) {
      const mesh = new THREE.Mesh(flameGeo, mat);
      mesh.position.set(at[0], at[1], at[2]);
      mesh.rotation.set(rot[0], rot[1], rot[2]);
      mesh.scale.set(width, width, 0.01);
      mesh.renderOrder = 5;
      parent.add(mesh);
      rig.flames.push({ mesh, length, width, bank });
    },
  };
}

/** Mirror a front profile (x, y) left to right, keeping its winding. */
export function mirrorX(pts: Array<[number, number]>): Array<[number, number]> {
  return pts.map(([x, y]) => [-x, y] as [number, number]).reverse();
}

/**
 * A clenched fist in wrist space (the wrist at the origin, the hand hanging
 * down -y, knuckles forward), `s` the side (1 left, -1 right), `k` its scale.
 */
export function fist(kit: Kit, s: number, k = 1): void {
  // Palm and back of the hand.
  kit.box('K', 0.4 * k, 0.42 * k, 0.46 * k, { at: [0, -0.26 * k, 0.04 * k] });
  kit.box('P', 0.44 * k, 0.32 * k, 0.12 * k, { at: [0, -0.24 * k, -0.16 * k], taper: [0.9, 1] });
  // Curled fingers: four segments under a knuckle guard.
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 0.1 * k;
    kit.box('K', 0.085 * k, 0.2 * k, 0.17 * k, { at: [x, -0.5 * k, 0.12 * k], rot: [0.35, 0, 0], bevel: 0.015 * k });
  }
  kit.box('F', 0.44 * k, 0.12 * k, 0.2 * k, { at: [0, -0.4 * k, 0.24 * k] });
  // Thumb across the front, on the inside of the hand.
  kit.box('K', 0.1 * k, 0.24 * k, 0.12 * k, { at: [-s * 0.2 * k, -0.34 * k, 0.24 * k], rot: [0.2, 0, s * 0.5], bevel: 0.015 * k });
}
