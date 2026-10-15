// Pieces shared by the frames: thruster flames, the race number, and the
// helpers each frame builder uses to hang merged parts on its skeleton.
import * as THREE from 'three';
import flameAtlasUrl from '../sprites/fx-flame.png';
import type { Livery } from '../palette';
import { paintedNumber, paintedTwin } from './decals';
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

/**
 * The anime look's drawn flames: whether they are on, and which drawing of
 * their three-drawing loop is showing. One object, set by the game each frame.
 */
export const DRAWN_FLAMES = { uDrawn: { value: 0 }, uFrame: { value: 0 } };

let flameAtlas: THREE.Texture | null = null;
const flamePlane = new THREE.PlaneGeometry(1, 1);

// Both drawings must agree about when we are looking into the exhaust.
const jetFacingGLSL = /* glsl */ `
  float jetFacing(vec3 axis, vec3 toCamera) {
    return smoothstep(0.25, 0.8, dot(axis, toCamera));
  }
`;

/**
 * A painted flame (tools/fx/build_sprites.py, sheet 7) hung from a thruster:
 * a card that turns about the flame's axis to face the camera, sized by the
 * thruster's own flame (its parent), the boost loop or (row 1) the overdrive
 * one, recoloured from the sheet's cyan.
 */
function drawnFlameMaterial(color: number): THREE.ShaderMaterial {
  if (!flameAtlas) {
    flameAtlas = new THREE.TextureLoader().load(flameAtlasUrl);
    flameAtlas.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.ShaderMaterial({
    uniforms: {
      ...DRAWN_FLAMES,
      uMap: { value: flameAtlas },
      uTint: { value: new THREE.Color(color) },
      uRow: { value: 0 },
      uEndOnFade: { value: 0 },
      uPhase: { value: Math.floor(Math.random() * 3) },
    },
    vertexShader: /* glsl */ `
      uniform float uDrawn, uRow, uEndOnFade;
      varying vec2 vUv;
      varying float vFlameAlpha;
      ${jetFacingGLSL}
      void main() {
        vUv = uv;
        // The parent flame's mouth, axis (its length is the flame's) and width.
        vec3 mouth = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 axis = (modelMatrix * vec4(0.0, 0.0, -1.0, 1.0)).xyz - mouth;
        float len = length(axis);
        vec3 ax = axis / max(len, 1e-4);
        float wid = length((modelMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz) * 2.0;
        // The card faces the camera along the projected exhaust axis. The
        // legacy overlap mode keeps a shortened drawing in the head-on view;
        // frames using uEndOnFade hand that view to the circular burner.
        vec3 toCam = normalize(cameraPosition - mouth);
        // Updated frames hand the head-on view to the circular burner. The
        // reference frames keep their original overlapping drawings.
        vFlameAlpha = 1.0 - uEndOnFade * jetFacing(ax, toCam);
        vec3 proj = ax - toCam * dot(ax, toCam);
        float pl = length(proj);
        vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 along = pl > 0.05 ? proj / pl : -camUp;
        vec3 right = normalize(cross(along, toCam));
        float shown = max(pl, 0.45);
        // The drawing hangs from a nozzle at the top of its cell. The boost
        // drawing fills about half the cell's length and a quarter of its
        // width; the overdrive one nearly all of it and half.
        float cellLen = len * shown * mix(1.9, 1.15, uRow);
        float cellWid = wid * mix(3.4, 2.0, uRow);
        vec3 p = mouth + along * ((0.5 - position.y) * cellLen - 0.02 * cellLen) + right * (position.x * cellWid);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        // Off in the plain look: put it behind the far plane.
        if (uDrawn < 0.5 || vFlameAlpha < 0.01) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uTint;
      uniform float uRow, uFrame, uPhase;
      varying vec2 vUv;
      varying float vFlameAlpha;
      void main() {
        float f = mod(uFrame + uPhase, 3.0);
        vec4 t = texture2D(uMap, vec2((f + vUv.x) / 3.0, 0.5 - uRow * 0.5 + vUv.y * 0.5));
        if (t.a < 0.02) discard;
        vec3 c = t.rgb;
        float hi = max(c.r, max(c.g, c.b));
        float white = min(c.r, min(c.g, c.b)) / max(hi, 1e-3);
        c = mix(uTint * hi, vec3(hi), white * white);
        gl_FragColor = vec4(c * 1.35, t.a * vFlameAlpha);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/**
 * The anime look's burner: a thruster seen end on, as the chase camera sees
 * the back ones, drawn the way the series drew it. A flat white core in rings
 * of the team's colour, spikes out of it that grow with the thrust, a new
 * drawing of it on each of the flame loop's drawings; gold in Overdrive. It
 * fades in as the view comes round to look into the nozzle, where the
 * painted flame (a card along the flame) has the least to show.
 */
function burnerMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...DRAWN_FLAMES,
      uTint: { value: new THREE.Color(color) },
      uRow: { value: 0 },
      uPower: { value: 0 },
      uSize: { value: 1 },
      uPhase: { value: Math.random() * 6.28 },
    },
    vertexShader: /* glsl */ `
      uniform float uDrawn, uPower, uSize;
      varying vec2 vUv;
      varying float vFace;
      ${jetFacingGLSL}
      void main() {
        vUv = uv * 2.0 - 1.0;
        vec3 mouth = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 axis = (modelMatrix * vec4(0.0, 0.0, -1.0, 1.0)).xyz - mouth;
        vec3 ax = axis / max(length(axis), 1e-4);
        float wid = length((modelMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
        vec3 toCam = normalize(cameraPosition - mouth);
        // Looking into the nozzle (the exhaust coming at the camera): 1.
        vFace = jetFacing(ax, toCam);
        vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        float size = wid * (3.0 + 2.6 * min(uPower, 1.5)) * uSize;
        // A little way down the exhaust and toward the camera: a nozzle's
        // mouth sits inside its housing, which would hide it.
        vec3 c = mouth + ax * min(length(axis) * 0.15, 1.2) + toCam * wid * 1.5;
        vec3 p = c + (camRight * position.x + camUp * position.y) * size * 2.0;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        if (uDrawn < 0.5 || vFace < 0.01 || uPower < 0.05) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint;
      uniform float uRow, uFrame, uPhase, uPower;
      varying vec2 vUv;
      varying float vFace;
      void main() {
        float r = length(vUv);
        float a = atan(vUv.y, vUv.x);
        // A new drawing each frame of the loop: the spikes turned and resized.
        float f = mod(uFrame, 3.0);
        float rot = uPhase + f * 1.9;
        float n = uRow > 0.5 ? 4.0 : 3.0;
        float lobe = pow(abs(cos(a * n + rot)), 18.0);
        float reach = clamp(0.25 + 0.55 * uPower, 0.0, 1.0) * (0.85 + 0.15 * fract(sin(f * 12.9 + uPhase) * 437.5));
        float edge = 0.5 + 0.12 * sin(a * 7.0 + rot * 2.0) * step(0.5, uRow);
        float rim = mix(edge, edge + 0.5 * reach, lobe);
        if (r > rim) discard;
        vec3 col = uTint;
        col = mix(col, mix(uTint, vec3(1.0), 0.55), step(r, rim * 0.72));
        col = mix(col, vec3(1.0), step(r, min(0.3, rim * 0.5)));
        gl_FragColor = vec4(col * 1.35, vFace);
      }`,
    transparent: true,
    depthWrite: false,
  });
}

function flameMaterial(color: number): THREE.ShaderMaterial {
  let m = flameMaterials.get(color);
  if (m) return m;
  m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uPower: { value: 1 }, uDrawn: DRAWN_FLAMES.uDrawn },
    vertexShader: /* glsl */ `
      varying float vT;
      void main() {
        vT = -position.z;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime, uPower, uDrawn;
      varying float vT;
      void main() {
        // The anime look draws its own flame (drawnFlameMaterial).
        if (uDrawn > 0.5) discard;
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
      // Arms and legs wear the limb segments' panel lines.
      const built = k.build(/^(el|wr|hip[LR]|knee|ankle)/.test(joint.name));
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
      // The anime look's painted flame rides on the same thruster.
      const drawn = new THREE.Mesh(flamePlane, drawnFlameMaterial(livery.glow));
      drawn.frustumCulled = false;
      drawn.renderOrder = 5;
      drawn.userData.ownMaterial = true;
      drawn.userData.tint = livery.glow;
      mesh.add(drawn);
      // ...and its burner, seen end on.
      const burner = new THREE.Mesh(flamePlane, burnerMaterial(livery.glow));
      burner.frustumCulled = false;
      burner.renderOrder = 6;
      burner.userData.ownMaterial = true;
      mesh.add(burner);
      rig.flames.push({ mesh, length, width, bank, drawn, burner });
    },
  };
}

/** An annular sector in a profile: radii r0 < r1, angles a0..a1 round (cx, cy). */
export function arc(r0: number, r1: number, a0: number, a1: number, cx: number, cy: number, n = 14): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]);
  }
  for (let i = n; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + Math.cos(a) * r0, cy + Math.sin(a) * r0]);
  }
  return pts;
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

/**
 * A long-fingered hand in wrist space, fingers half curled: a palm, three
 * jointed fingers and a thumb. For the leaner, stranger frames.
 */
export function clawHand(kit: Kit, s: number, k = 1): void {
  kit.box('K', 0.34 * k, 0.36 * k, 0.4 * k, { at: [0, -0.22 * k, 0.04 * k], taper: [0.9, 1] });
  kit.box('P', 0.36 * k, 0.26 * k, 0.1 * k, { at: [0, -0.2 * k, -0.15 * k] });
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.11 * k;
    kit.box('K', 0.08 * k, 0.34 * k, 0.09 * k, { at: [x, -0.52 * k, 0.1 * k], rot: [0.45, 0, 0], bevel: 0.012 * k });
    kit.box('D', 0.07 * k, 0.26 * k, 0.08 * k, { at: [x, -0.74 * k, 0.28 * k], rot: [1.1, 0, 0], bevel: 0.01 * k });
  }
  kit.box('K', 0.08 * k, 0.32 * k, 0.09 * k, { at: [-s * 0.2 * k, -0.36 * k, 0.2 * k], rot: [0.4, 0, s * 0.6], bevel: 0.012 * k });
}

/**
 * Wheels and a lit hub for each `z`, under an ankle at `ay` above the road:
 * the inline skate every frame stands on.
 */
export function wheels(kit: Kit, ay: number, zs: number[], r = 0.32, w = 0.36): void {
  for (const wz of zs) {
    kit.cyl('D', r, r, w, 12, { axis: 'x', at: [0, -ay + r, wz] });
    kit.cyl('G', r * 0.42, r * 0.42, w + 0.04, 6, { axis: 'x', at: [0, -ay + r, wz] });
  }
}
