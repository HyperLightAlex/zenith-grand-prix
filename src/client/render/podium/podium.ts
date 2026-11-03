// The podium: at a match's or an event's end, its first three stand on it
// in their victory poses, on a stage built at the side of the start
// straight, its back to the barrier and the grandstand behind it, facing
// across the road. Two sets, Blender's (art/blender/podium/build_podium.py:
// the tiers, the backdrop's screens, a lighting truss on two towers): the
// pilots' podium, a mech to a step (a Sprint's first three, a team's three),
// and the teams' podium, a team to a step, three abreast (a Grand Prix's
// first three factions), its leader in front. The game paints them, draws
// the numerals and what the screens show, hangs the spotlights' beams, fires
// the confetti, and at an event's end sets its trophy (art/blender/trophy)
// on the winners' step.
//
// Everything is in the podium's own frame (`frame`): the stage on y = 0, the
// front of the winner's tier at the middle of its front edge, facing +z;
// +x runs to the third's tier (the second's is on -x, the winner's right).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { hwAt, type MechState, type Track } from '../../../sim/index';
import { celify, markCharacter } from '../look';
import { MechAnimator } from '../mech/animate';
import { rigForSeat, undressRig, wearRig } from '../mech/style';
import type { MechRig } from '../mech/rig';
import type { VictoryId } from '../mech/victoryPoses';
import { SUN_DIR, type Livery } from '../palette';
import { trackDir, trackMatrix } from '../trackSpace';

const urls = import.meta.glob(['./assets/podium.glb', './assets/podium-teams.glb', './assets/trophy.glb'], { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** The pilots' podium (a mech to a step) or the teams' (a team to a step). */
export type PodiumLayout = 'pilots' | 'teams';

/** Where each place stands on the pilots' podium: on top of its tier (x, the tier's top, z). */
export const PODIUM_SPOTS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 5.4, 0.2],
  [-13.25, 4.2, 0.4],
  [13.25, 3.2, 0.4],
];
/**
 * Where a team stands on the teams' podium, each place's three: its leader
 * in front at the middle of its tier, the other two a step behind either
 * side (the tiers 24 m wide, a Defender 8 m across).
 */
export const TEAM_SPOTS: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [0, -25.25, 25.25].map((cx, place) => {
  const y = [5.4, 4.2, 3.2][place];
  return [
    [cx, y, 1.6],
    [cx - 7.6, y, -2.2],
    [cx + 7.6, y, -2.2],
  ] as const;
});
/** Where the trophy stands: on the winners' tier, in front of their leader (pilots', teams'). */
const TROPHY_AT: Record<PodiumLayout, readonly [number, number, number]> = { pilots: [0, 5.4, 4.3], teams: [0, 5.4, 5.0] };
/** Each set's pyro cannons (x) and the stage's half width; its spotlights (x). */
const SET: Record<PodiumLayout, { cannons: number; stage: number; lamps: readonly number[]; scale: number }> = {
  pilots: { cannons: 22.5, stage: 24, lamps: [-18, -11, -4, 4, 11, 18], scale: 1 },
  teams: { cannons: 39.5, stage: 41, lamps: [-32, -22, -8, 8, 22, 32], scale: 1.7 },
};
/** The middle of the set, for cameras to look at. */
export const PODIUM_CENTRE = new THREE.Vector3(0, 9, 0);
/** How far along the road behind the start line it stands. */
const PODIUM_S = -62;
/** Its back, this far in from the road's edge. */
const BACK_IN = 12.5;
/** When each strikes its pose, first to third (seconds after it goes up): the third, the second, the winner. */
const POSE_AT = [3.0, 1.9, 1.0];

export interface PodiumPilot {
  /** The mech as it finished (its frame, its look). */
  mech: MechState;
  livery: Livery;
  name: string;
  /** Faction name and emblem, for the screens. */
  team: string;
  emblem: string;
  pose: VictoryId;
}

/** A place on the podium: who stands on it (its leader first), and what its screen says. */
export interface PodiumStep {
  pilots: PodiumPilot[];
  /** On its screen: the pilot's name, or the team's. */
  label: string;
  css: string;
  emblem: string;
}

export interface PodiumBill {
  circuit: string;
  /** The big line on the screen (the winning team, or the winner). */
  headline: string;
  /** Under it (the score). */
  sub: string;
  /** The winners' colours: the light strips and the screen. */
  glow: number;
  css: string;
  emblem: string;
  /** Which podium. */
  layout: PodiumLayout;
  /** An event's trophy on the winners' step. */
  trophy: boolean;
}

const loading = new Map<string, Promise<THREE.Group | null>>();
/** Load a model of the set (once). Null when it is not in the build. */
function loadModel(file: string): Promise<THREE.Group | null> {
  let p = loading.get(file);
  if (!p) {
    p = (async () => {
      const url = urls[`./assets/${file}`];
      if (!url) return null;
      try {
        return (await new GLTFLoader().loadAsync(url)).scene;
      } catch {
        return null;
      }
    })();
    loading.set(file, p);
  }
  return p;
}

/** Load the pilots' podium (once). Null when it is not in the build. */
export const loadPodium = (): Promise<THREE.Group | null> => loadModel('podium.glb');

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function canvasTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A canvas drawn onto the model's own planes: glTF's UVs run down the picture, not up. */
function modelTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = canvasTexture(c);
  t.flipY = false;
  return t;
}

const FONT = '"Barlow Condensed", "DIN Condensed", "Arial Narrow", sans-serif';
const PLACE_COLOURS = ['#ffc83a', '#d9dee8', '#e08a4a'];

/** A numeral's panel: the place, large, in its metal, on the dark. */
function drawNumeral(g: CanvasRenderingContext2D, w: number, h: number, place: number): void {
  g.fillStyle = '#121826';
  g.fillRect(0, 0, w, h);
  // A border of chevrons in the place's colour.
  g.fillStyle = PLACE_COLOURS[place];
  const band = h * 0.06;
  g.fillRect(0, 0, w, band);
  g.fillRect(0, h - band, w, band);
  g.font = `italic 800 ${Math.round(h * 0.9)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const grad = g.createLinearGradient(0, h * 0.1, 0, h * 0.9);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.45, PLACE_COLOURS[place]);
  grad.addColorStop(1, PLACE_COLOURS[place]);
  g.lineWidth = h * 0.05;
  g.strokeStyle = '#0a0e18';
  g.strokeText(String(place + 1), w / 2, h * 0.53);
  g.fillStyle = grad;
  g.fillText(String(place + 1), w / 2, h * 0.53);
}

function fitText(g: CanvasRenderingContext2D, text: string, size: number, weight: string, maxW: number): void {
  let s = size;
  do {
    g.font = `italic ${weight} ${Math.round(s)}px ${FONT}`;
    s *= 0.92;
  } while (g.measureText(text).width > maxW && s > 8);
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

interface Stand {
  rig: MechRig;
  anim: MechAnimator;
  /** The pilot's mech, standing still. */
  state: MechState;
  place: number;
  /** Its spot on its step (0 its leader, 1 and 2 behind either side), and how it is turned. */
  at: readonly [number, number, number];
  turn: number;
  pose: VictoryId;
  /** Seconds since it struck its pose, or less than zero before. */
  t: number;
  struck: boolean;
}

interface Bit {
  p: THREE.Vector3;
  v: THREE.Vector3;
  axis: THREE.Vector3;
  angle: number;
  spin: number;
  phase: number;
  life: number;
}

const m4 = new THREE.Matrix4();
const v1 = new THREE.Vector3();
const q1 = new THREE.Quaternion();
const ONE = new THREE.Vector3(1, 1, 1);

/** A set as dressed: its model, the planes drawn on, the beams. */
interface Dressed {
  root: THREE.Group;
  numerals: Array<{ mesh: THREE.Mesh; place: number }>;
  screens: Map<string, THREE.Mesh>;
  beams: THREE.Mesh[];
}

export class Podium {
  /** When each place strikes its pose, first to third (seconds after it goes up). */
  static readonly STRIKE_AT: readonly number[] = POSE_AT;
  /** A team's second and third strike theirs this long after its leader. */
  static readonly TEAM_STAGGER = 0.22;
  readonly root = new THREE.Group();
  /** The podium's frame in the world. */
  readonly frame = new THREE.Matrix4();
  /** How far out in front of it a camera may stand (across the road and a little past it). */
  reach = 40;
  /** Which set is up, and how much wider than the pilots' it is (for the cameras). */
  layout: PodiumLayout = 'pilots';
  get scale(): number {
    return SET[this.layout].scale;
  }
  private sets: Partial<Record<PodiumLayout, Dressed>> = {};
  private trophy: THREE.Group | null = null;
  private trophyGlow = new THREE.MeshBasicMaterial({ color: 0x45e8ff, toneMapped: false });
  /** Seconds since the trophy came up, or less than zero before (none: no trophy). */
  private trophyT = -1;
  private showTrophy = false;
  private stands: Stand[] = [];
  private time = 0;
  private led = new THREE.MeshBasicMaterial({ color: 0x45e8ff, toneMapped: false });
  private beamMat: THREE.MeshBasicMaterial;
  private confetti: THREE.InstancedMesh;
  private bits: Bit[] = [];
  private fired = false;
  private bill: PodiumBill | null = null;
  /** A pilot strikes their pose (0: the winner, and the confetti with it). */
  onStrike: (place: number) => void = () => {};

  constructor() {
    this.root.name = 'podium';
    this.root.matrixAutoUpdate = false;
    this.root.visible = false;
    // A beam fades out along its length.
    const [c, g] = canvas(4, 128);
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 128);
    this.beamMat = new THREE.MeshBasicMaterial({
      color: 0xfff1d6,
      alphaMap: canvasTexture(c),
      transparent: true,
      opacity: 0.07,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const bit = new THREE.PlaneGeometry(0.42, 0.7);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    this.confetti = new THREE.InstancedMesh(bit, mat, 420);
    this.confetti.count = 0;
    this.confetti.frustumCulled = false;
    this.root.add(this.confetti);
  }

  /** Whether a set is in (they load in the background): the pilots' (or `layout`'s). */
  ready(layout: PodiumLayout = 'pilots'): boolean {
    return !!this.sets[layout];
  }

  /** Start loading the sets and the trophy (and take each once it is in). */
  preload(): void {
    for (const layout of ['pilots', 'teams'] as const) {
      if (this.sets[layout]) continue;
      void loadModel(layout === 'pilots' ? 'podium.glb' : 'podium-teams.glb').then((scene) => {
        if (!scene || this.sets[layout]) return;
        const set = this.dress(scene, layout);
        set.root.visible = false;
        this.sets[layout] = set;
        this.root.add(set.root);
      });
    }
    if (!this.trophy)
      void loadModel('trophy.glb').then((scene) => {
        if (!scene || this.trophy) return;
        scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const slot = (mesh.material as THREE.Material).name;
          (mesh.material as THREE.Material).dispose();
          mesh.material = slot === 'glow' ? this.trophyGlow : new THREE.MeshLambertMaterial({ color: slot === 'base' ? 0x262c3a : 0xf2b630 });
        });
        celify(scene);
        scene.visible = false;
        scene.matrixAutoUpdate = false;
        this.trophy = scene;
        this.root.add(scene);
      });
  }

  /** Paint a set's slots, and find the planes the game draws on. */
  private dress(scene: THREE.Group, layout: PodiumLayout): Dressed {
    const numerals: Dressed['numerals'] = [];
    const screens: Dressed['screens'] = new Map();
    const beams: THREE.Mesh[] = [];
    const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });
    const mats: Record<string, THREE.Material> = {
      stage: lambert(0x262c3a),
      top: lambert(0xdfe4ec),
      gold: lambert(0xf2b630),
      silver: lambert(0xc4cad6),
      bronze: lambert(0xc0763c),
      frame: lambert(0x2f3442),
      truss: lambert(0xaab2c0),
      metal: lambert(0x4a505e),
      led: this.led,
      lamp: new THREE.MeshBasicMaterial({ color: 0xfff1d6, toneMapped: false }),
    };
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const name = mesh.name || o.parent?.name || '';
      const slot = (mesh.material as THREE.Material).name;
      const n = /^numeral_(\d)$/.exec(name);
      if (n) {
        numerals.push({ mesh, place: Number(n[1]) - 1 });
        return;
      }
      if (/^screen_/.test(name)) {
        screens.set(name, mesh);
        return;
      }
      const mat = mats[slot] ?? mats.stage;
      (mesh.material as THREE.Material).dispose();
      mesh.material = mat;
    });
    celify(scene);
    // The numerals: drawn once, each to its panel's shape.
    for (const { mesh, place } of numerals) {
      const box = new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position as THREE.BufferAttribute);
      const size = box.getSize(v1);
      const w = 512;
      const h = Math.max(64, Math.round((w * size.y) / Math.max(0.01, size.x)));
      const [c, g] = canvas(w, h);
      drawNumeral(g, w, h, place);
      mesh.material = new THREE.MeshBasicMaterial({ map: modelTexture(c) });
    }
    for (const [name, mesh] of screens) {
      // (Each canvas the shape of its screen: the pilots' middle one 26 m by 13.7, the side ones square.)
      const box = new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position as THREE.BufferAttribute);
      const size = box.getSize(v1);
      const across = Math.hypot(size.x, size.z);
      const w = name === 'screen_center' ? 1024 : 600;
      const [c] = canvas(w, Math.round((w * size.y) / Math.max(0.01, across)));
      mesh.material = new THREE.MeshBasicMaterial({ map: modelTexture(c), toneMapped: false });
      mesh.userData.canvas = c;
    }
    // The spotlights' beams, down from the truss to the tiers.
    for (const x of SET[layout].lamps) {
      const from = new THREE.Vector3(x, 22.1, -3.4);
      const to = new THREE.Vector3(x * 0.7, 2.5, 6);
      const len = from.distanceTo(to);
      const geo = new THREE.ConeGeometry(2.4, len, 24, 1, true);
      // Apex at the lamp: the cone's tip is its +y end.
      geo.translate(0, -len / 2, 0);
      const beam = new THREE.Mesh(geo, this.beamMat);
      beam.position.copy(from);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
      beam.userData.base = beam.quaternion.clone();
      beam.userData.x = x;
      beam.renderOrder = 3;
      beams.push(beam);
      scene.add(beam);
    }
    return { root: scene, numerals, screens, beams };
  }

  /**
   * Put the podium up on a circuit with its three (or fewer) places, first
   * to third (on the pilots' podium a pilot each, on the teams' a team).
   * False if the set is not in yet.
   */
  show(track: Track, steps: readonly PodiumStep[], bill: PodiumBill): boolean {
    const set = this.sets[bill.layout];
    if (!set) return false;
    this.layout = bill.layout;
    for (const l of ['pilots', 'teams'] as const) if (this.sets[l]) this.sets[l]!.root.visible = l === bill.layout;
    this.clearStands();
    // At the side of the straight behind the line, its back to the barrier,
    // facing across the road: on whichever side has the sun on its front
    // (and so on the three, and behind the cameras).
    trackDir(track, PODIUM_S, 0, 1, v1);
    const side = v1.dot(SUN_DIR) > 0 ? -1 : 1;
    const hw = hwAt(track, PODIUM_S);
    const d0 = side * (hw - BACK_IN);
    for (const facing of [Math.PI / 2, -Math.PI / 2]) {
      trackMatrix(track, PODIUM_S, d0, 0, facing, this.frame);
      const z = new THREE.Vector3().setFromMatrixColumn(this.frame, 2);
      if (z.dot(v1) * -side > 0) break;
    }
    // (The cameras keep to the road: past its edge stand the lamps and the boards.)
    this.reach = 2 * hw - BACK_IN - 2;
    this.root.matrix.copy(this.frame);
    this.root.matrixWorldNeedsUpdate = true;
    this.bill = bill;
    this.led.color.setHex(bill.glow);
    this.trophyGlow.color.setHex(bill.glow);
    this.paintScreens(set, steps, bill);
    steps.slice(0, 3).forEach((step, place) => {
      const spots = bill.layout === 'teams' ? TEAM_SPOTS[place] : [PODIUM_SPOTS[place]];
      step.pilots.slice(0, spots.length).forEach((p, k) => {
        const rig = rigForSeat(p.mech, p.livery);
        // As worn as its last race left it.
        wearRig(rig, p.mech.retired ? 1 : 1 - p.mech.hp / Math.max(1, p.mech.maxHp));
        rig.root.matrixAutoUpdate = false;
        markCharacter(rig.root, p.mech.id);
        celify(rig.root);
        // Standing still: nothing of the race left on it.
        const state: MechState = { ...p.mech, speed: 0, vs: 0, vd: 0, boosting: false, carving: false, guarding: false, retired: false, overdriveT: 0, carveT: 0, target: -1, act: 0, h: 0, air: false };
        const anim = new MechAnimator(rig);
        anim.display = true;
        this.root.add(rig.root);
        // The second's and the third's turn a little in, toward the winners.
        const turn = place === 0 ? 0 : place === 1 ? 0.22 : -0.22;
        this.stands.push({ rig, anim, state, place, at: spots[k], turn, pose: p.pose, t: -(POSE_AT[place] + k * Podium.TEAM_STAGGER), struck: false });
      });
    });
    this.showTrophy = bill.trophy;
    this.trophyT = -1;
    if (this.trophy) this.trophy.visible = false;
    this.time = 0;
    this.fired = false;
    this.bits.length = 0;
    this.confetti.count = 0;
    this.root.visible = true;
    this.update(0);
    return true;
  }

  hide(): void {
    this.root.visible = false;
    if (this.trophy) this.trophy.visible = false;
    this.clearStands();
    this.bits.length = 0;
    this.confetti.count = 0;
  }

  get shown(): boolean {
    return this.root.visible;
  }

  private clearStands(): void {
    for (const s of this.stands) {
      this.root.remove(s.rig.root);
      s.rig.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      undressRig(s.rig);
    }
    this.stands.length = 0;
  }

  /** The screens: the winners and the circuit in the middle, the second and third either side. */
  private paintScreens(set: Dressed, steps: readonly PodiumStep[], bill: PodiumBill): void {
    const draw = async () => {
      try {
        await document.fonts?.load(`italic 800 40px ${FONT}`);
      } catch {
        // (Drawn in whatever font there is.)
      }
      const emblems = await Promise.all([bill.emblem, ...steps.map((p) => p.emblem)].map((u) => (u ? loadImage(u) : Promise.resolve(null))));
      if (this.bill !== bill) return;
      const centre = set.screens.get('screen_center');
      if (centre) {
        const c = centre.userData.canvas as HTMLCanvasElement;
        const g = c.getContext('2d')!;
        const { width: w, height: h } = c;
        const bg = g.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#0d1424');
        bg.addColorStop(1, '#05080f');
        g.fillStyle = bg;
        g.fillRect(0, 0, w, h);
        // Diagonal stripes in the winners' colour, fading down.
        g.save();
        g.globalAlpha = 0.22;
        g.fillStyle = bill.css;
        for (let x = -h; x < w + h; x += 90) {
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x + 40, 0);
          g.lineTo(x + 40 - h, h);
          g.lineTo(x - h, h);
          g.fill();
        }
        g.restore();
        const fade = g.createLinearGradient(0, 0, 0, h);
        fade.addColorStop(0, 'rgba(5,8,15,0)');
        fade.addColorStop(0.55, 'rgba(5,8,15,0.75)');
        fade.addColorStop(1, 'rgba(5,8,15,0.95)');
        g.fillStyle = fade;
        g.fillRect(0, 0, w, h);
        // The headline, high up where the mechs do not stand in front of it.
        g.textAlign = 'center';
        g.textBaseline = 'alphabetic';
        g.fillStyle = 'rgba(243,245,250,0.8)';
        fitText(g, bill.circuit.toUpperCase(), 34, '700', w * 0.6);
        g.fillText(bill.circuit.toUpperCase(), w / 2, 46);
        g.fillStyle = '#ffffff';
        fitText(g, bill.headline.toUpperCase(), 92, '800', w * 0.62);
        g.fillText(bill.headline.toUpperCase(), w / 2, 130);
        g.fillStyle = bill.css;
        fitText(g, bill.sub, 44, '800', w * 0.5);
        g.fillText(bill.sub, w / 2, 178);
        const em = emblems[0];
        if (em) {
          const s = Math.min(150, h * 0.36);
          g.drawImage(em, 40, 30, s, s);
          g.drawImage(em, w - 40 - s, 30, s, s);
        }
        (centre.material as THREE.MeshBasicMaterial).map!.needsUpdate = true;
      }
      for (const [name, place] of [['screen_left', 1], ['screen_right', 2]] as const) {
        const mesh = set.screens.get(name);
        const p = steps[place];
        if (!mesh) continue;
        const c = mesh.userData.canvas as HTMLCanvasElement;
        const g = c.getContext('2d')!;
        const { width: w, height: h } = c;
        g.fillStyle = '#080c16';
        g.fillRect(0, 0, w, h);
        if (p) {
          // (Laid out for a square screen, scaled to this one's height.)
          const k = h / 600;
          g.fillStyle = p.css;
          g.globalAlpha = 0.3;
          g.fillRect(0, 0, w, h);
          g.globalAlpha = 1;
          const em = emblems[place + 1];
          if (em) g.drawImage(em, w / 2 - 130 * k, 60 * k, 260 * k, 260 * k);
          g.textAlign = 'center';
          g.fillStyle = PLACE_COLOURS[place];
          g.font = `italic 800 ${Math.round(110 * k)}px ${FONT}`;
          g.fillText(place === 1 ? '2ND' : '3RD', w / 2, 440 * k);
          g.fillStyle = '#ffffff';
          fitText(g, p.label.toUpperCase(), 84 * k, '800', w * 0.85);
          g.fillText(p.label.toUpperCase(), w / 2, 540 * k);
        }
        (mesh.material as THREE.MeshBasicMaterial).map!.needsUpdate = true;
      }
    };
    void draw();
  }

  update(dt: number): void {
    if (!this.root.visible) return;
    this.time += dt;
    for (const s of this.stands) {
      s.t += dt;
      const [x, y, z] = s.at;
      m4.makeTranslation(x, y, z);
      if (s.turn) m4.multiply(new THREE.Matrix4().makeRotationY(s.turn));
      s.rig.root.matrix.copy(m4);
      if (s.t >= 0 && !s.struck) {
        s.struck = true;
        s.anim.strike(s.pose);
        this.onStrike(s.place);
      }
      s.anim.update(dt, s.state, 1, dt);
      s.rig.root.updateMatrixWorld(true);
    }
    // The winner's pose fires the confetti; the trophy comes up with it.
    if (!this.fired && this.stands[0] && this.stands[0].t >= 0) {
      this.fired = true;
      this.burst();
      if (this.showTrophy) this.trophyT = 0;
    }
    this.stepTrophy(dt);
    for (const beam of this.sets[this.layout]?.beams ?? []) {
      // The beams sweep a little.
      const x = beam.userData.x as number;
      q1.setFromAxisAngle(v1.set(0, 0, 1), Math.sin(this.time * 0.7 + x) * 0.06);
      beam.quaternion.copy(beam.userData.base as THREE.Quaternion).premultiply(q1);
    }
    this.beamMat.opacity = 0.065 + Math.sin(this.time * 2.3) * 0.008;
    this.stepConfetti(dt);
  }

  /**
   * The trophy: up out of the winners' tier in front of their leader as the
   * confetti goes (scaled up from nothing, turning), then turning slowly on
   * its plinth, its ring lit in the winners' colour.
   */
  private stepTrophy(dt: number): void {
    const t = this.trophy;
    if (!t) return;
    if (this.trophyT < 0) {
      t.visible = false;
      return;
    }
    this.trophyT += dt;
    const e = Math.min(1, this.trophyT / 0.9);
    const grow = e * e * (3 - 2 * e);
    const [x, y, z] = TROPHY_AT[this.layout];
    // (Rising the last little way as it grows.)
    q1.setFromAxisAngle(v1.set(0, 1, 0), this.trophyT * 0.6 + (1 - grow) * 2.5);
    m4.compose(new THREE.Vector3(x, y - 0.6 * (1 - grow), z), q1, new THREE.Vector3(grow, grow, grow));
    t.matrix.copy(m4);
    t.visible = grow > 0.01;
    t.updateMatrixWorld(true);
  }

  /** Confetti from the four cannons, in the winners' colours, gold and white. */
  private burst(): void {
    const colours = [new THREE.Color(this.bill?.glow ?? 0xffffff), new THREE.Color(this.bill?.css ?? '#ffffff'), new THREE.Color(0xffc83a), new THREE.Color(0xffffff)];
    const n = this.confetti.instanceMatrix.count;
    for (let i = 0; i < n; i++) {
      // Half blown up and in from the cannons at the stage's corners, half
      // let go from the truss over the tiers.
      const cannon = i % 2 === 0;
      const X = SET[this.layout].cannons;
      const [cx, cz] = [[-X, 7], [X, 7], [-X, -9.5], [X, -9.5]][(i >> 1) % 4];
      this.bits.push({
        p: cannon ? new THREE.Vector3(cx, 1.9, cz) : new THREE.Vector3((Math.random() - 0.5) * 50 * SET[this.layout].scale, 21 + Math.random() * 2, -3.8 + (Math.random() - 0.5) * 3),
        v: cannon
          ? new THREE.Vector3(-Math.sign(cx) * (8 + Math.random() * 22), 18 + Math.random() * 12, -Math.sign(cz) * Math.random() * 8)
          : new THREE.Vector3((Math.random() - 0.5) * 2, -Math.random() * 1.5, 2 + Math.random() * 4),
        axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        angle: Math.random() * 6.28,
        spin: 4 + Math.random() * 8,
        phase: Math.random() * 6.28,
        life: 0,
      });
      this.confetti.setColorAt(i, colours[i % colours.length]);
    }
    if (this.confetti.instanceColor) this.confetti.instanceColor.needsUpdate = true;
  }

  private stepConfetti(dt: number): void {
    const bits = this.bits;
    if (!bits.length) return;
    const drag = Math.exp(-1.6 * dt);
    let n = 0;
    for (let i = 0; i < bits.length; i++) {
      const b = bits[i];
      b.life += dt;
      // Up on the blast, then fluttering down slowly.
      b.v.y -= 9.8 * dt;
      b.v.multiplyScalar(drag);
      if (b.v.y < -1.9) b.v.y = -1.9;
      b.p.addScaledVector(b.v, dt);
      b.p.x += Math.sin(b.life * 2.2 + b.phase) * 1.4 * dt;
      b.p.z += Math.cos(b.life * 1.7 + b.phase) * 0.8 * dt;
      const floor = Math.abs(b.p.x) < SET[this.layout].stage && b.p.z > -11.5 && b.p.z < 8.5 ? 0.85 : 0.05;
      if (b.p.y < floor) {
        b.p.y = floor;
        b.v.set(0, 0, 0);
        b.spin = 0;
      }
      b.angle += b.spin * dt;
      q1.setFromAxisAngle(b.axis, b.angle);
      m4.compose(b.p, q1, ONE);
      this.confetti.setMatrixAt(i, m4);
      n = i + 1;
    }
    this.confetti.count = n;
    this.confetti.instanceMatrix.needsUpdate = true;
  }
}
