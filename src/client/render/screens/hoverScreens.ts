// Hover screens: big screens held up over the grandstands by the start, so
// the crowd can watch the race while the mechs are away round the lap. Each
// is held up by lift nacelles (rings of light round them, a glow down from
// their emitters) and drifts a little where it hangs. They show a live feed
// of the leader, cut between broadcast shots, under the broadcast's
// graphics (the lap, the leader's place and name); once the race is over,
// the winner.
//
// They hang over the stands, never over the road, well up from it and from
// any other stretch of road near them, so they never stand between a pilot
// and the racing. The feed is the scene drawn again from its own camera,
// small and six to fifteen times a second (by the video quality), and only
// while a screen is in view (so out on the lap, it costs nothing).
//
// The model is Blender's (art/blender/hoverscreen/build_hoverscreen.py); the
// game paints its slots and draws what the screen shows.
import * as THREE from 'three';
import { PHASE, type MechState, type RaceState, type Track } from '../../../sim/index';
import { COLORS } from '../palette';
import { readSlots, slotModel, type SlotModel } from '../slotModel';
import { KEEP_OUT, RoadIndex, inRoadSpace } from '../titan/keepout';
import { trackPoint } from '../trackSpace';

const urls = import.meta.glob('./assets/hoverscreen.glb', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const HOVER_SCREEN_SLOTS = ['screen', 'frame', 'trim', 'glow', 'lamp', 'beam'] as const;
export type HoverScreenSlot = (typeof HOVER_SCREEN_SLOTS)[number];
export type HoverScreenModel = SlotModel<HoverScreenSlot>;
export const readHoverScreen = (scene: THREE.Object3D): HoverScreenModel => readSlots(scene, HOVER_SCREEN_SLOTS);
const model = slotModel(urls['./assets/hoverscreen.glb'], HOVER_SCREEN_SLOTS, 'hover screen');
/** Load the model (once). Without it, no screens. */
export const loadHoverScreen = model.load;
export const hoverScreenModel = model.get;
export const useHoverScreenModel = model.use;

/**
 * Where a screen hangs over its stand, in the stand's frame (its front on
 * z = 0, the road's level y = 0): this high, this far back over its rows,
 * this far along (between the roof's columns, clear of its beams under the
 * lift's glow), tipped forward toward the stands across the road.
 */
export const HOVER = { up: 46, back: 11, along: 12, tilt: 0.2 };
/** All of a screen, round its middle (its picture's): x, y and z either way, with the lift's glow below it and its drift. */
const EXTENT = { x: 23, below: 21, above: 16, z: 4.5 };
/** Stands this far along the road from the line, or nearer: those by the start. */
const NEAR_LINE = [-140, 10] as const;
/** The feed: its size, how often it is drawn, and how far off a screen may be for it to be worth drawing. */
const FEED_W = 384;
const FEED_H = 216;
const FEED_RANGE = 1400;
/** How many times a second the feed is drawn, by the video quality. */
export const FEED_FPS = { low: 6, medium: 10, high: 15 } as const;
/** How long each shot of the feed holds. */
const SHOT = 6.5;

/** The lift's colour. */
const LIFT = 0x5ff6ff;

/**
 * Where the screens hang (world), over the stands by the start in
 * `scenery` (trackMesh.ts marks each stand). None where it would come
 * within the open sky over any stretch of road.
 */
export function hoverScreenSpots(track: Track, scenery: THREE.Object3D): THREE.Matrix4[] {
  const stands: THREE.Object3D[] = [];
  scenery.traverse((o) => {
    const at = o.userData.seating as { s: number; side: number } | undefined;
    if (o.name === 'grandstand' && at && at.s >= NEAR_LINE[0] && at.s <= NEAR_LINE[1]) stands.push(o);
  });
  if (!stands.length) return [];
  scenery.updateMatrixWorld(true);
  const roads = new RoadIndex(track);
  const local = new THREE.Matrix4().makeTranslation(HOVER.along, HOVER.up, -HOVER.back).multiply(new THREE.Matrix4().makeRotationX(HOVER.tilt));
  const out: THREE.Matrix4[] = [];
  for (const stand of stands) {
    const m = stand.matrixWorld.clone().multiply(local);
    const room = new THREE.BoxGeometry(EXTENT.x * 2, EXTENT.below + EXTENT.above, EXTENT.z * 2)
      .translate(0, (EXTENT.above - EXTENT.below) / 2, 0)
      .applyMatrix4(m)
      .toNonIndexed();
    const crowded = inRoadSpace(roads, room, 4, KEEP_OUT.sky, KEEP_OUT.down);
    room.dispose();
    if (!crowded) out.push(m);
  }
  return out;
}

const SCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SCREEN_FRAG = /* glsl */ `
uniform sampler2D tFeed;
uniform sampler2D tOverlay;
uniform float uLive;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec3 feed = texture2D(tFeed, vUv).rgb * 1.15;
  vec3 col = mix(vec3(0.015, 0.025, 0.05), feed, uLive);
  vec4 over = texture2D(tOverlay, vUv);
  col = mix(col, over.rgb, over.a);
  // An LED wall's rows, and a little falloff to its edges.
  col *= 0.86 + 0.14 * sin(vUv.y * ${FEED_H.toFixed(1)} * 6.2831853);
  col *= 0.8 + 0.2 * smoothstep(0.85, 0.35, length(vUv - 0.5));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const BEAM_VERT = SCREEN_VERT;
const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uPhase;
varying vec2 vUv;
void main() {
  // Bright at the emitter, gone by the cone's foot, shimmering down it.
  float v = vUv.y;
  float a = pow(1.0 - v, 2.2) * (0.5 + 0.12 * sin(uTime * 11.0 + uPhase - v * 18.0));
  gl_FragColor = vec4(uColor * a, a);
}`;

/** What the feed follows: a mech, where it is drawn this frame. */
export interface FeedSubject {
  mech: MechState;
  /** Its place on the road, as drawn. */
  s: number;
  d: number;
  h: number;
  /** Its team's colour. */
  glow: number;
}

interface Hung {
  root: THREE.Group;
  base: THREE.Matrix4;
  phase: number;
  sphere: THREE.Sphere;
}

const FONT = '"Barlow Condensed", "DIN Condensed", "Arial Narrow", sans-serif';
const bob = new THREE.Matrix4();
const sway = new THREE.Matrix4();
const frustum = new THREE.Frustum();
const projScreen = new THREE.Matrix4();
const camAt = new THREE.Vector3();
const lookAt = new THREE.Vector3();

export class HoverScreens {
  readonly group = new THREE.Group();
  private hung: Hung[] = [];
  private feed: THREE.WebGLRenderTarget | null = null;
  private readonly feedCam = new THREE.PerspectiveCamera(48, FEED_W / FEED_H, 0.5, 2600);
  private overlay: { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture } | null = null;
  private screenMat: THREE.ShaderMaterial | null = null;
  private beamMats: THREE.ShaderMaterial[] = [];
  private glowMat: THREE.MeshBasicMaterial | null = null;
  private lampMat: THREE.MeshBasicMaterial | null = null;
  private materials: THREE.Material[] = [];
  private time = 0;
  private sinceFeed = Infinity;
  private due = false;
  private shotT = 0;
  private shot = 0;
  private subjectId = -1;
  private overlayKey = '';
  private overlayT = 0;
  /** How many times a second the feed is drawn. */
  fps: number = FEED_FPS.high;

  constructor(
    private readonly track: Track,
    scenery: THREE.Object3D,
    /** The circuit's name, for the screens' card. */
    private readonly circuit: string,
  ) {
    this.group.name = 'hover screens';
    const parts = hoverScreenModel();
    const spots = parts ? hoverScreenSpots(track, scenery) : [];
    if (!parts || !spots.length || typeof document === 'undefined') return;
    this.feed = new THREE.WebGLRenderTarget(FEED_W, FEED_H, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.overlay = { canvas, g: canvas.getContext('2d')!, tex };
    this.screenMat = new THREE.ShaderMaterial({
      uniforms: { tFeed: { value: this.feed.texture }, tOverlay: { value: tex }, uLive: { value: 0 }, uTime: { value: 0 } },
      vertexShader: SCREEN_VERT,
      fragmentShader: SCREEN_FRAG,
    });
    this.glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(LIFT).multiplyScalar(1.6), toneMapped: false });
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xff3a2a, toneMapped: false });
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x2a313e });
    const trimMat = new THREE.MeshLambertMaterial({ color: COLORS.accent });
    this.materials.push(this.screenMat, this.glowMat, this.lampMat, frameMat, trimMat);
    // The model's slots, shared by every screen (cloned from the model: this view frees its own).
    const geo = new Map([...parts].map(([slot, g]) => [slot, g.clone()] as const));
    spots.forEach((base, k) => {
      const root = new THREE.Group();
      root.matrixAutoUpdate = false;
      root.matrix.copy(base);
      const beamMat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(LIFT) }, uTime: { value: 0 }, uPhase: { value: k * 1.7 } },
        vertexShader: BEAM_VERT,
        fragmentShader: BEAM_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      this.beamMats.push(beamMat);
      this.materials.push(beamMat);
      const mats: Record<HoverScreenSlot, THREE.Material> = { screen: this.screenMat!, frame: frameMat, trim: trimMat, glow: this.glowMat!, lamp: this.lampMat!, beam: beamMat };
      for (const [slot, g] of geo) {
        const mesh = new THREE.Mesh(g, mats[slot]);
        mesh.name = `hover screen ${slot}`;
        if (slot === 'beam') mesh.renderOrder = 3;
        root.add(mesh);
      }
      const sphere = new THREE.Sphere(new THREE.Vector3(0, -2, 0).applyMatrix4(base), 30);
      this.hung.push({ root, base, phase: k * 2.3 + 0.7, sphere });
      this.group.add(root);
    });
  }

  /** How many screens hang here. */
  get count(): number {
    return this.hung.length;
  }

  /**
   * Each frame: the screens drift where they hang, their lamps blink; the
   * feed's camera follows `subject` (null: no feed, the card instead); and
   * whether a screen is in `view`, so the feed is worth drawing.
   */
  update(dt: number, race: RaceState, subject: FeedSubject | null, view: THREE.Camera): void {
    if (!this.hung.length) return;
    this.time += dt;
    for (const h of this.hung) {
      // A slow bob, and a slower sway.
      bob.makeTranslation(0, Math.sin(this.time * 0.55 + h.phase) * 0.45, 0);
      sway.makeRotationZ(Math.sin(this.time * 0.31 + h.phase * 1.3) * 0.01);
      h.root.matrix.copy(h.base).multiply(bob).multiply(sway);
      h.root.matrixWorldNeedsUpdate = true;
    }
    for (const m of this.beamMats) m.uniforms.uTime.value = this.time;
    this.lampMat!.color.setHex(this.time % 1.4 < 0.25 ? 0xff3a2a : 0x2a0806);
    const pulse = 1.45 + Math.sin(this.time * 2.4) * 0.15;
    this.glowMat!.color.setHex(LIFT).multiplyScalar(pulse);

    const finished = race.phase === PHASE.FINISHED;
    const live = !!subject && !finished;
    this.screenMat!.uniforms.uLive.value = live ? 1 : 0;
    this.overlayT -= dt;
    this.drawOverlay(race, subject, finished);

    // Is any screen in view, near enough to see?
    projScreen.multiplyMatrices(view.projectionMatrix, view.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreen);
    view.getWorldPosition(camAt);
    const seen = this.hung.some((h) => frustum.intersectsSphere(h.sphere) && h.sphere.center.distanceTo(camAt) < FEED_RANGE);
    this.sinceFeed += dt;
    this.due = live && seen && this.sinceFeed >= 1 / this.fps;
    if (!live || !subject) return;

    // The feed's camera: broadcast shots of the subject, cut every few seconds (or when the subject changes).
    this.shotT += dt;
    let cut = false;
    if (subject.mech.id !== this.subjectId || this.shotT > SHOT) {
      if (subject.mech.id === this.subjectId) this.shot = (this.shot + 1) % 4;
      this.subjectId = subject.mech.id;
      this.shotT = 0;
      cut = true;
    }
    const { s, d, h } = subject;
    const t = this.track;
    const lean = d > 0 ? -1 : 1;
    switch (this.shot) {
      case 0: // Chasing, up behind it.
        trackPoint(t, s - 24, d * 0.6, h + 9, camAt);
        trackPoint(t, s + 14, d, h + 3, lookAt);
        break;
      case 1: // Beside it, from the wider side of the road, tracking.
        trackPoint(t, s + 3, d + lean * 15, h + 4.5, camAt);
        trackPoint(t, s + 1, d, h + 4, lookAt);
        break;
      case 2: // Ahead of it, looking back as it comes.
        trackPoint(t, s + 34, d * 0.5, h + 6, camAt);
        trackPoint(t, s, d, h + 4, lookAt);
        break;
      default: // From the air over it.
        trackPoint(t, s - 12, d * 0.3, h + 42, camAt);
        trackPoint(t, s + 22, d, h, lookAt);
    }
    const k = cut ? 1 : 1 - Math.exp(-dt * 5);
    this.feedCam.position.lerp(camAt, k);
    this.feedCam.up.set(0, 1, 0);
    this.feedCam.lookAt(lookAt);
    this.feedCam.updateMatrixWorld();
  }

  /** Draw the feed, when it is due: the scene from the feed's camera, the screens left out of it. Called before the frame is drawn. */
  draw(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    if (!this.due || !this.feed) return;
    this.due = false;
    this.sinceFeed = 0;
    const was = this.group.visible;
    this.group.visible = false;
    const target = renderer.getRenderTarget();
    renderer.setRenderTarget(this.feed);
    renderer.clear(true, true, false);
    renderer.render(scene, this.feedCam);
    renderer.setRenderTarget(target);
    this.group.visible = was;
  }

  /** The broadcast's graphics over the feed (or the card in place of it), drawn again when what they say changes. */
  private drawOverlay(race: RaceState, subject: FeedSubject | null, finished: boolean): void {
    const o = this.overlay;
    if (!o) return;
    const m = subject?.mech;
    const lap = m ? Math.min(race.laps, Math.max(1, Math.floor(Math.max(0, m.s) / this.track.length) + 1)) : 0;
    const key = `${finished}|${m?.id}|${m?.place}|${lap}|${Math.floor(this.time * 1.2) % 2}`;
    if (key === this.overlayKey && this.overlayT > 0) return;
    this.overlayKey = key;
    this.overlayT = 0.5;
    const { g, canvas } = o;
    const W = canvas.width;
    const H = canvas.height;
    g.clearRect(0, 0, W, H);
    const accent = '#ff7a1a';
    if (finished || !m) {
      // The card: the circuit, and the winner once there is one.
      g.fillStyle = '#0c111d';
      g.fillRect(0, 0, W, H);
      g.fillStyle = accent;
      g.fillRect(0, H * 0.5 - 3, W, 6);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#f4f6fb';
      g.font = `italic 800 64px ${FONT}`;
      const winner = finished ? race.mechs.find((x) => x.place === 1) : undefined;
      g.fillText(winner ? 'WINNER' : 'ZENITH GRAND PRIX', W / 2, H * 0.32);
      g.font = `italic 700 46px ${FONT}`;
      g.fillStyle = winner ? '#ffd34d' : '#9fb3cc';
      g.fillText((winner ? winner.name : this.circuit).toUpperCase(), W / 2, H * 0.7);
    } else {
      // The bug: the league, and live.
      g.fillStyle = 'rgba(10,14,24,0.85)';
      g.fillRect(24, 22, 168, 44);
      g.fillStyle = accent;
      g.fillRect(24, 22, 8, 44);
      g.font = `italic 800 30px ${FONT}`;
      g.textBaseline = 'middle';
      g.textAlign = 'left';
      g.fillStyle = '#f4f6fb';
      g.fillText('ZGP', 44, 45);
      if (Math.floor(this.time * 1.2) % 2 === 0) {
        g.fillStyle = '#ff3d5a';
        g.beginPath();
        g.arc(116, 45, 7, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#f4f6fb';
      g.font = `italic 700 24px ${FONT}`;
      g.fillText('LIVE', 130, 46);
      // The lower third: the place, the name, the lap.
      const y = H - 92;
      g.fillStyle = 'rgba(10,14,24,0.88)';
      g.fillRect(24, y, W - 48, 60);
      g.fillStyle = `#${new THREE.Color(subject!.glow).getHexString()}`;
      g.fillRect(24, y, 70, 60);
      g.fillStyle = '#0a0e18';
      g.font = `italic 800 40px ${FONT}`;
      g.textAlign = 'center';
      g.fillText(`P${m.place}`, 59, y + 31);
      g.textAlign = 'left';
      g.fillStyle = '#f4f6fb';
      g.fillText(m.name.toUpperCase(), 112, y + 31);
      g.textAlign = 'right';
      g.fillStyle = '#9fb3cc';
      g.font = `italic 700 30px ${FONT}`;
      g.fillText(`LAP ${lap}/${race.laps}`, W - 44, y + 31);
    }
    o.tex.needsUpdate = true;
  }

  dispose(): void {
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    for (const m of this.materials) m.dispose();
    this.overlay?.tex.dispose();
    this.feed?.dispose();
  }
}
