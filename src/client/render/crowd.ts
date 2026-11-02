// The crowd in the grandstands, alive: cameras flashing all over them, and
// flags in the two teams' colours waved along the front rows. They go up
// when something happens: the start, a knockout or a ring-out in front of
// them, the lead changing, a lap begun, the flag. The stands are the
// circuit's own (trackMesh.ts: the planes named 'grandstand'); this only
// lays the flashes and flags over them.

import * as THREE from 'three';

/** Most stands a circuit has (two sides, four along). */
const MAX_STANDS = 8;
const FLASHES = 320;
const FLAGS = 34;

const FLASH_VERT = /* glsl */ `
attribute float aPhase;
attribute float aRate;
attribute float aStand;
uniform float uTime;
uniform float uExcite[${MAX_STANDS}];
uniform float uSize;
varying float vFlash;
void main() {
  float ex = uExcite[int(aStand + 0.5)];
  float rate = aRate * (1.0 + ex * 7.0);
  float f = fract(uTime * rate + aPhase);
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
uniform float uTime;
uniform float uExcite[${MAX_STANDS}];
varying vec3 vColor;
varying float vShade;
void main() {
  float ex = uExcite[int(aStand + 0.5)];
  vec3 p = position;
  // Pinned at its pole (x = 0), rippling out to its free end, waved harder in a cheer.
  float along = clamp(p.x / 2.2, 0.0, 1.0);
  float wave = sin(p.x * 2.6 - uTime * (5.0 + ex * 7.0) + aPhase);
  p.z += wave * 0.32 * along;
  p.y += sin(uTime * (1.4 + ex * 4.0) + aPhase) * (0.25 + ex * 0.6);
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
  private uniforms = {
    uTime: { value: 0 },
    uExcite: { value: this.excite },
    uSize: { value: 3 },
  };
  /** Each stand's middle (world), to find the stands near something. */
  private centres: THREE.Vector3[] = [];
  private materials: THREE.ShaderMaterial[] = [];

  /** Over the grandstands in `scenery`, the flags in `colors` (the teams'). */
  constructor(scenery: THREE.Object3D | undefined, colors: readonly number[]) {
    this.group.name = 'crowd';
    const stands: THREE.Mesh[] = [];
    scenery?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && o.name === 'grandstand' && (mesh.geometry as THREE.PlaneGeometry).type === 'PlaneGeometry') stands.push(mesh);
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
    use.forEach((stand, k) => {
      stand.updateWorldMatrix(true, false);
      const { width, height } = (stand.geometry as THREE.PlaneGeometry).parameters;
      this.centres.push(new THREE.Vector3().setFromMatrixPosition(stand.matrixWorld));
      for (let i = 0; i < FLASHES; i++) {
        v.set((Math.random() - 0.5) * width * 0.96, (Math.random() - 0.5) * height * 0.9, 0.35).applyMatrix4(stand.matrixWorld);
        pos.push(v.x, v.y, v.z);
        phase.push(Math.random());
        rate.push(0.03 + Math.random() * 0.05);
        which.push(k);
      }
      // Flags along the front rows, leaning out over the rail.
      const q = new THREE.Quaternion();
      const sScale = new THREE.Vector3(1, 1, 1);
      const standQ = new THREE.Quaternion().setFromRotationMatrix(stand.matrixWorld);
      for (let i = 0; i < FLAGS; i++) {
        v.set((Math.random() - 0.5) * width * 0.94, -height * 0.5 + 1.5 + Math.random() * height * 0.35, 0.8).applyMatrix4(stand.matrixWorld);
        // Upright in the stand's own frame, its pole along the stand.
        q.copy(standQ).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.65, 0, (Math.random() - 0.5) * 0.5)));
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
    this.uniforms.uTime.value += dt;
    // A cheer dies away over a few seconds.
    for (let k = 0; k < this.excite.length; k++) this.excite[k] = Math.max(0, this.excite[k] - dt * 0.35);
  }

  dispose(): void {
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    for (const m of this.materials) m.dispose();
  }
}
