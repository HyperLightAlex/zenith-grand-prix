// The crowd in the grandstands, alive: cameras flashing all over them, and
// fans waving the racing teams' banners (each team's emblem on its colours)
// on poles down the front rows. They go up
// when something happens: the start, a knockout or a ring-out in front of
// them, the lead changing, a lap begun, the flag. The stands are the
// circuit's own (trackMesh.ts: the model's stands, each marked by an object
// named 'grandstand' where it stands, or the plain rakes, planes so named);
// this only lays the flashes and flags over them.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SEATING } from './grandstand/grandstand';

/** Most stands a circuit has (two sides, four along). */
const MAX_STANDS = 8;
const FLASHES = 320;
/** Banners to a stand, one to every few metres along it, each up a row of its own. */
const FLAGS = 30;
/** A camera's flash lasts this long, s (at rest: a little shorter in a cheer, when the stand's clock runs faster). */
const FLASH_TIME = 0.14;
/** A banner's cloth, m: hung from the top of its pole, which a fan holds this far below the cloth. */
const CLOTH_W = 1.8;
const CLOTH_H = 1.12;
const POLE_TOP = 1.6;
const POLE_FOOT = -0.9;
/** How high a fan holds the pole off their row's tread, m. */
const HAND = 1.15;
/** Each team's banner in the atlas, px. */
const BANNER_W = 256;
const BANNER_H = 160;

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
  // A flash is quick: this share of the fan's time between flashes.
  float w = aRate * ${FLASH_TIME.toFixed(3)} * (1.0 + ex * 3.0);
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

// A banner: the stand's own lit material (lit and fogged like the stand,
// inked and shaded with the look), its cloth rippling out from the pole and
// the whole swung to and fro from the fan's hands, harder in a cheer. Its
// cloth shows its team's banner from the atlas (one to a row, team 0 at the
// bottom); its pole is plain dark steel.
const FLAG_HEAD = /* glsl */ `
attribute float aPhase;
attribute float aStand;
attribute float aBanner;
attribute float aPole;
uniform float uRipple[${MAX_STANDS}];
uniform float uBob[${MAX_STANDS}];
uniform float uExcite[${MAX_STANDS}];
uniform float uBanners;
varying float vPole;
varying float vFold;`;

const FLAG_MOVE = /* glsl */ `
vec3 transformed = vec3(position);
{
  int k = int(aStand + 0.5);
  float ex = uExcite[k];
  // The cloth ripples out from the pole to its free end.
  float along = clamp(transformed.x / ${CLOTH_W.toFixed(2)}, 0.0, 1.0) * (1.0 - aPole);
  float wave = sin(transformed.x * 2.4 - uRipple[k] + aPhase);
  transformed.z += wave * 0.2 * along;
  vFold = 1.0 - along * (0.5 - 0.5 * wave) * 0.3;
  // Swung from the hands (the pole's grip, the origin) along the stand.
  float sw = sin(uBob[k] + aPhase) * (0.12 + ex * 0.38);
  float cs = cos(sw), sn = sin(sw);
  transformed.xy = vec2(cs * transformed.x - sn * transformed.y, sn * transformed.x + cs * transformed.y);
  vPole = aPole;
}`;

const FLAG_FRAG_HEAD = /* glsl */ `
varying float vPole;
varying float vFold;`;

/** The pole's paint (linear). */
const FLAG_POLE = /* glsl */ `
diffuseColor.rgb = mix(diffuseColor.rgb * vFold, vec3(0.03, 0.032, 0.04), vPole);`;

/** A racing team, as its fans wave it: its emblem on its colours. */
export interface CrowdTeam {
  /** The banner's field (the team's armour colour) and the bands across its top and foot (its glow: an independent pilot's own colour). */
  field: number;
  band: number;
  /** Its emblem, as an image URL. */
  emblem: string;
}

const css = (n: number) => '#' + n.toString(16).padStart(6, '0');

/**
 * The teams' banners, one above another (team 0 at the foot: the texture's
 * v from 0), each its field, a band of its glow along its top and foot, a
 * dark sleeve down its pole side, and its emblem in the middle (drawn in
 * when it is in: `ready`).
 */
function bannerAtlas(teams: readonly CrowdTeam[], ready: (draw: () => void) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = BANNER_W;
  c.height = BANNER_H * teams.length;
  const g = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  teams.forEach((t, k) => {
    const y = c.height - (k + 1) * BANNER_H;
    g.fillStyle = css(t.field);
    g.fillRect(0, y, BANNER_W, BANNER_H);
    g.fillStyle = css(t.band);
    g.fillRect(0, y, BANNER_W, 24);
    g.fillRect(0, y + BANNER_H - 24, BANNER_W, 24);
    g.fillStyle = '#151824';
    g.fillRect(0, y, 12, BANNER_H);
    if (!t.emblem) return;
    new THREE.ImageLoader().load(t.emblem, (img) =>
      ready(() => {
        const s = BANNER_H - 40;
        g.drawImage(img, 12 + (BANNER_W - 12 - s) / 2, y + 20, s, s);
        tex.needsUpdate = true;
      }),
    );
  });
  return tex;
}

/** A banner on its pole, its origin where the fan holds it: the cloth (x along it from the pole, y up) and the pole (aPole 1). */
function bannerGeometry(): THREE.BufferGeometry {
  const cloth = new THREE.PlaneGeometry(CLOTH_W, CLOTH_H, 10, 1).translate(CLOTH_W / 2 + 0.03, POLE_TOP - CLOTH_H / 2 - 0.04, 0);
  // Two thin crossed faces, seen from any side.
  const poleA = new THREE.PlaneGeometry(0.07, POLE_TOP - POLE_FOOT).translate(0, (POLE_TOP + POLE_FOOT) / 2, 0);
  const poleB = poleA.clone().rotateY(Math.PI / 2);
  const parts = [cloth, poleA, poleB];
  parts.forEach((p, i) => p.setAttribute('aPole', new THREE.Float32BufferAttribute(new Array(p.attributes.position.count).fill(i ? 1 : 0), 1)));
  const out = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return out;
}

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
    uBanners: { value: 1 },
  };
  /** Each stand's middle (world), to find the stands near something. */
  private centres: THREE.Vector3[] = [];
  private materials: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];
  private disposed = false;

  /** Over the grandstands in `scenery`, the banners of `teams` (the race's). */
  constructor(scenery: THREE.Object3D | undefined, teams: readonly CrowdTeam[]) {
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
    const flagPhase: number[] = [];
    const flagStand: number[] = [];
    const flagBanner: number[] = [];
    const flagMatrices: THREE.Matrix4[] = [];
    const up = new THREE.Vector3();
    use.forEach(({ o: stand, at, upright }, k) => {
      stand.updateWorldMatrix(true, false);
      this.centres.push(at(0.5, 0.5, 0, new THREE.Vector3()).applyMatrix4(stand.matrixWorld));
      for (let i = 0; i < FLASHES; i++) {
        at(0.02 + Math.random() * 0.96, 0.05 + Math.random() * 0.9, 0.35, v).applyMatrix4(stand.matrixWorld);
        pos.push(v.x, v.y, v.z);
        phase.push(Math.random());
        rate.push(0.05 + Math.random() * 0.1);
        which.push(k);
      }
      // Banners down the front half of the rows: one to each stretch of the
      // stand, up a row of its own (the next stretch's well up or down from
      // it, so two swung toward each other pass clear), held up by a fan
      // standing against the riser behind it, the cloth along the stand.
      const standQ = new THREE.Quaternion().setFromRotationMatrix(stand.matrixWorld).multiply(upright);
      up.set(0, 1, 0).applyQuaternion(standQ);
      const rows = SEATING.rows;
      let row = Math.floor(Math.random() * 8);
      for (let i = 0; i < FLAGS; i++) {
        row = (row + 3 + Math.floor(Math.random() * 3)) % 8;
        const along = (i + 0.2 + Math.random() * 0.5) / FLAGS;
        at(along, row / (rows - 1), 0.45, v).applyMatrix4(stand.matrixWorld);
        // (at: half a metre up off the tread; the hands higher.)
        v.addScaledVector(up, HAND - 0.5);
        flagMatrices.push(new THREE.Matrix4().compose(v.clone(), standQ, new THREE.Vector3().setScalar(0.85 + Math.random() * 0.3)));
        flagPhase.push(Math.random() * Math.PI * 2);
        flagStand.push(k);
        // The teams in turn along the stand.
        flagBanner.push((i + k) % Math.max(1, teams.length));
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
    // The banners: lit as the stand's crowd is, a little of their own colour
    // carrying in its shade (trackMesh.ts: CROWD_GLOW); the look shades and inks them too.
    const atlas = bannerAtlas(teams.length ? teams : [{ field: 0xe4e8f0, band: 0x3a4050, emblem: '' }], (draw) => {
      if (!this.disposed) draw();
    });
    this.textures.push(atlas);
    this.uniforms.uBanners.value = Math.max(1, teams.length);
    const flagMat = new THREE.MeshLambertMaterial({ map: atlas, emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: 0.35, side: THREE.DoubleSide });
    flagMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uRipple: this.uniforms.uRipple, uBob: this.uniforms.uBob, uExcite: this.uniforms.uExcite, uBanners: this.uniforms.uBanners });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + FLAG_HEAD)
        .replace('#include <begin_vertex>', FLAG_MOVE)
        // Its team's banner, from the atlas (the pole's is any: it is painted over).
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv.y = (vMapUv.y + aBanner) / uBanners;\nvEmissiveMapUv = vMapUv;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FLAG_FRAG_HEAD)
        .replace('#include <map_fragment>', '#include <map_fragment>\n' + FLAG_POLE)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 1.0 - vPole;');
    };
    flagMat.customProgramCacheKey = () => 'crowd-banner';
    const flagGeo = bannerGeometry();
    flagGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(flagPhase), 1));
    flagGeo.setAttribute('aStand', new THREE.InstancedBufferAttribute(new Float32Array(flagStand), 1));
    flagGeo.setAttribute('aBanner', new THREE.InstancedBufferAttribute(new Float32Array(flagBanner), 1));
    const flags = new THREE.InstancedMesh(flagGeo, flagMat, flagMatrices.length);
    flags.name = 'banners';
    flagMatrices.forEach((m, i) => flags.setMatrixAt(i, m));
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
      // The cloth rippled about once a second at rest, twice in a cheer; the poles swung slower.
      this.ripple[k] = (this.ripple[k] + dt * (5 + ex * 7)) % TAU;
      this.bob[k] = (this.bob[k] + dt * (1.4 + ex * 4)) % TAU;
      this.flashClock[k] += dt * (1 + ex * 7);
      // A cheer dies away over a few seconds.
      this.excite[k] = Math.max(0, ex - dt * 0.35);
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      (o as THREE.Mesh).geometry?.dispose();
      // (The banners' instances: their matrices, which the renderer holds until told.)
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    });
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.disposed = true;
  }
}
