// The crowd in the grandstands, alive: cameras flashing all over them, and
// flags in the two teams' colours waved along the front rows. They go up
// when something happens: the start, a knockout or a ring-out in front of
// them, the lead changing, a lap begun, the flag. The stands are the
// circuit's own (trackMesh.ts: the model's stands, each marked by an object
// named 'grandstand' where it stands, or the plain rakes, planes so named);
// this only lays the flashes and flags over them.

import * as THREE from 'three';
import { SEATING } from './grandstand/grandstand';

/** Most stands a circuit has (two sides, four along). */
const MAX_STANDS = 8;
const FLASHES = 320;
const FLAGS = 34;

// Each stand keeps its own clocks (Crowd.update), run faster while it cheers.
// The shaders read the clocks rather than multiply the time by a rate that
// changes: time x rate jumps whenever the rate does, and as a cheer died away
// the flags thrashed faster the longer the race had run (70 flaps a second
// three minutes in).
const FLASH_VERT = /* glsl */ `
attribute float aPhase;
attribute float aRate;
attribute float aStand;
uniform float uFlashClock[${MAX_STANDS}];
uniform float uExcite[${MAX_STANDS}];
uniform float uSize;
varying float vFlash;
void main() {
  int k = int(aStand + 0.5);
  float ex = uExcite[k];
  float f = fract(uFlashClock[k] * aRate + aPhase);
  float w = 0.05 + ex * 0.03;
  vFlash = f < w ? 1.0 - f / w : 0.0;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = vFlash > 0.0 ? uSize * (0.4 + vFlash * 0.6) * (360.0 / max(1.0, -mv.z)) : 0.0;
  gl_Position = projectionMatrix * mv;
}`;

const FLASH_FRAG = /* glsl */ `
varying float vFlash;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  // A bright point with a little cross of glare.
  float star = smoothstep(0.5, 0.0, d) * 0.7 + smoothstep(0.06, 0.0, abs(p.x)) * smoothstep(0.5, 0.1, abs(p.y)) * 0.5 + smoothstep(0.06, 0.0, abs(p.y)) * smoothstep(0.5, 0.1, abs(p.x)) * 0.5;
  float a = star * vFlash;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * a, a);
}`;

const FLAG_VERT = /* glsl */ `
attribute float aPhase;
attribute float aStand;
uniform float uRipple[${MAX_STANDS}];
uniform float uBob[${MAX_STANDS}];
uniform float uExcite[${MAX_STANDS}];
varying vec3 vColor;
varying float vShade;
void main() {
  int k = int(aStand + 0.5);
  float ex = uExcite[k];
  vec3 p = position;
  // Pinned at its pole (x = 0), rippling out to its free end, waved harder in a cheer.
  float along = clamp(p.x / 2.2, 0.0, 1.0);
  float wave = sin(p.x * 2.6 - uRipple[k] + aPhase);
  p.z += wave * 0.32 * along;
  p.y += sin(uBob[k] + aPhase) * (0.25 + ex * 0.6);
  vShade = 0.78 + 0.22 * wave;
  #ifdef USE_INSTANCING_COLOR
    vColor = instanceColor;
  #else
    vColor = vec3(1.0);
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
}`;

const FLAG_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vShade;
void main() {
  gl_FragColor = vec4(vColor * vShade, 1.0);
  #include <colorspace_fragment>
}`;

export class Crowd {
  readonly group = new THREE.Group();
  private excite = new Array<number>(MAX_STANDS).fill(0);
  /** Each stand's clocks: the flags' ripple and bob (radians) and the camera flashes (seconds, sped up in a cheer). */
  private ripple = new Array<number>(MAX_STANDS).fill(0);
  private bob = new Array<number>(MAX_STANDS).fill(0);
  private flashClock = new Array<number>(MAX_STANDS).fill(0);
  private uniforms = {
    uRipple: { value: this.ripple },
    uBob: { value: this.bob },
    uFlashClock: { value: this.flashClock },
    uExcite: { value: this.excite },
    uSize: { value: 3 },
  };
  /** Each stand's middle (world), to find the stands near something. */
  private centres: THREE.Vector3[] = [];
  private materials: THREE.ShaderMaterial[] = [];

  /** Over the grandstands in `scenery`, the flags in `colors` (the teams'). */
  constructor(scenery: THREE.Object3D | undefined, colors: readonly number[]) {
    this.group.name = 'crowd';
    // Each stand: where it is, a place on its crowd (along it, up its rows,
    // 0 to 1; out toward the road), and which way is up in its frame.
    const stands: Array<{ o: THREE.Object3D; at: (along: number, up: number, out: number, v: THREE.Vector3) => THREE.Vector3; upright: THREE.Quaternion }> = [];
    const [fy, fz] = SEATING.front;
    const [by, bz] = SEATING.back;
    scenery?.traverse((o) => {
      if (o.name !== 'grandstand') return;
      if (o.userData.seating) {
        stands.push({
          o,
          // Among a row's people: half a metre up, out from the riser behind its tread.
          at: (along, up, out, v) => v.set((along - 0.5) * 2 * SEATING.half, fy + (by - fy) * up + 0.5, fz + (bz - fz) * up - SEATING.depth + out),
          upright: new THREE.Quaternion(),
        });
        return;
      }
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || (mesh.geometry as THREE.PlaneGeometry).type !== 'PlaneGeometry') return;
      const { width, height } = (mesh.geometry as THREE.PlaneGeometry).parameters;
      stands.push({
        o,
        at: (along, up, out, v) => v.set((along - 0.5) * width, (up - 0.5) * height, out),
        // (The rake leans back: upright is leant forward again.)
        upright: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.65, 0, 0)),
      });
    });
    const use = stands.slice(0, MAX_STANDS);
    if (!use.length) return;
    const pos: number[] = [];
    const phase: number[] = [];
    const rate: number[] = [];
    const which: number[] = [];
    const v = new THREE.Vector3();
    const flagGeo = new THREE.PlaneGeometry(2.2, 1.3, 8, 1).translate(1.1, 0, 0);
    const flagPhase: number[] = [];
    const flagStand: number[] = [];
    const flagMatrices: THREE.Matrix4[] = [];
    const flagColors: THREE.Color[] = [];
    const palette = [...colors, ...colors, 0xf3f5fa];
    use.forEach(({ o: stand, at, upright }, k) => {
      stand.updateWorldMatrix(true, false);
      this.centres.push(at(0.5, 0.5, 0, new THREE.Vector3()).applyMatrix4(stand.matrixWorld));
      for (let i = 0; i < FLASHES; i++) {
        at(0.02 + Math.random() * 0.96, 0.05 + Math.random() * 0.9, 0.35, v).applyMatrix4(stand.matrixWorld);
        pos.push(v.x, v.y, v.z);
        phase.push(Math.random());
        rate.push(0.03 + Math.random() * 0.05);
        which.push(k);
      }
      // Flags along the front rows, leaning out over the rail.
      const q = new THREE.Quaternion();
      const sScale = new THREE.Vector3(1, 1, 1);
      const standQ = new THREE.Quaternion().setFromRotationMatrix(stand.matrixWorld).multiply(upright);
      for (let i = 0; i < FLAGS; i++) {
        at(0.03 + Math.random() * 0.94, 0.06 + Math.random() * 0.35, 0.8, v).applyMatrix4(stand.matrixWorld);
        // Upright in the stand's own frame, its pole along the stand.
        q.copy(standQ).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, (Math.random() - 0.5) * 0.5)));
        flagMatrices.push(new THREE.Matrix4().compose(v.clone(), q.clone(), sScale.clone().multiplyScalar(0.8 + Math.random() * 0.5)));
        flagColors.push(new THREE.Color(palette[i % palette.length]));
        flagPhase.push(Math.random() * Math.PI * 2);
        flagStand.push(k);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
    g.setAttribute('aRate', new THREE.Float32BufferAttribute(rate, 1));
    g.setAttribute('aStand', new THREE.Float32BufferAttribute(which, 1));
    const flashMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: FLASH_VERT,
      fragmentShader: FLASH_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(g, flashMat);
    points.frustumCulled = false;
    points.renderOrder = 4;
    const flagMat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: FLAG_VERT, fragmentShader: FLAG_FRAG, side: THREE.DoubleSide });
    const flags = new THREE.InstancedMesh(flagGeo, flagMat, flagMatrices.length);
    flagMatrices.forEach((m, i) => {
      flags.setMatrixAt(i, m);
      flags.setColorAt(i, flagColors[i]);
    });
    flagGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(flagPhase), 1));
    flagGeo.setAttribute('aStand', new THREE.InstancedBufferAttribute(new Float32Array(flagStand), 1));
    flags.frustumCulled = false;
    this.materials.push(flashMat, flagMat);
    this.group.add(points, flags);
  }

  /**
   * Something for the crowd: at `at` (world; null for every stand), `amount`
   * 0 to 1. Stands within `reach` of it go up, the nearest most.
   */
  cheer(at: THREE.Vector3 | null, amount: number, reach = 320): void {
    this.centres.forEach((c, k) => {
      const near = at ? Math.max(0, 1 - c.distanceTo(at) / reach) : 1;
      this.excite[k] = Math.min(1.2, Math.max(this.excite[k], amount * near));
    });
  }

  update(dt: number): void {
    const TAU = Math.PI * 2;
    for (let k = 0; k < this.excite.length; k++) {
      const ex = this.excite[k];
      // Waved about once a second at rest, twice in a cheer; the arms bob slower.
      this.ripple[k] = (this.ripple[k] + dt * (5 + ex * 7)) % TAU;
      this.bob[k] = (this.bob[k] + dt * (1.4 + ex * 4)) % TAU;
      this.flashClock[k] += dt * (1 + ex * 7);
      // A cheer dies away over a few seconds.
      this.excite[k] = Math.max(0, ex - dt * 0.35);
    }
  }

  dispose(): void {
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    for (const m of this.materials) m.dispose();
  }
}
