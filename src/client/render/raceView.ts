// Draws one race: places the mechs from simulation state every frame, runs
// their animation and effects, and turns simulation events into spectacle.
import * as THREE from 'three';
import { updateMechDetail } from './mech/detail';
import {
  ABILITY,
  ACT,
  ATK,
  ATTACKS,
  CLASSES,
  COUNTDOWN_TICKS,
  DT,
  MODE,
  PHASE,
  ROLE,
  TICK_RATE,
  roadAt,
  weaponsFree,
  type MechState,
  type SimEvent,
} from '../../sim/index';
import type { Session } from '../game/session';
import { inKnockout } from '../game/moments';
import { TELL_COLOR, tellOf, type TellKind } from '../game/tells';
import type { Feel } from '../game/tuning';
import { CameraRig } from './cameraRig';
import { Fx, Trail, makeBubble, makeLockRing, makeShadow, makeShield, makeSnareRing, shadowTexture } from './fx';
import { MUZZLE_EDGE, RAM_TIP, WALL_EDGE } from './sprites';
import { MechAnimator } from './mech/animate';
import { buildFrame } from './mech/frames';
import { drawClock, drawingStep, look, markCharacter } from './look';
import type { MechRig } from './mech/rig';
import { CARVE_COLORS, COLORS, LIVERIES, SUN_DIR, type Livery } from './palette';
import { markTraveller, type Renderer } from './renderer';
import type { TrackVisual } from './trackMesh';
import { trackDir, trackMatrix, trackPoint, worldDirToTrackAngle } from './trackSpace';

const toward = (v: number, target: number, rate: number, dt: number) => v + (target - v) * (1 - Math.exp(-rate * dt));

interface MechVisual {
  rig: MechRig;
  anim: MechAnimator;
  livery: Livery;
  trails: Trail[];
  shadow: THREE.Mesh;
  shield: THREE.Mesh;
  shieldPower: number;
  shieldFlash: number;
  bubble: THREE.Mesh;
  bubblePower: number;
  snare: THREE.Mesh;
  glow: THREE.Color;
  trailColor: THREE.Color;
  prevSpeed: number;
  s: number;
  d: number;
  /** Height above the road (in the air, or falling). */
  h: number;
  facing: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  smokeT: number;
  sparkT: number;
  /** A Breakaway's drawn crackle, seconds left. */
  crackleT: number;
  /** How long the current ram has been going, seconds. */
  ramAge: number;
  /** The tick of the last drawn muzzle blast (a scatter cannon reports every pellet). */
  shotTick: number;
  /** The tier of the carve burst running now, for its colour. */
  burstTier: number;
  /** Which cut of a combo is next, for the blade arcs. */
  cut: number;
  /** Time gathered since the pose was last drawn, and which drawing that was (the anime look poses on twos). */
  poseAcc: number;
  poseIdx: number;
}

/** Where a mech sits on screen, for name plates and the lock reticle. */
export interface Plate {
  id: number;
  /** Just above the head. */
  x: number;
  y: number;
  /** Centre of the body. */
  cx: number;
  cy: number;
  dist: number;
  visible: boolean;
  /**
   * Which way the mech lies from the middle of the screen, in screen pixels
   * (y down), right even when it is behind the camera: for edge arrows.
   */
  ex: number;
  ey: number;
}

const m4 = new THREE.Matrix4();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const v4 = new THREE.Vector3();
const camFwd = new THREE.Vector3();
const ndc = new THREE.Vector3();
const shadowScale = new THREE.Matrix4();
/** A drawn ring lying on the road: the road's orientation, turned so the sprite's face is the road's. */
const flatQ = new THREE.Quaternion();
const layFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const GOLD = new THREE.Color(COLORS.cell);
const AMBER = new THREE.Color(0xffa030);
/** Momentum: trails run hot while the next blow is primed, and a momentum strike flares in it. */
const HOT = new THREE.Color(0xff7a2a);
const HOT_HEX = 0xff8a3a;
const CARVE = CARVE_COLORS.map((c) => new THREE.Color(c));

/** A colour for each weapon: its swing, and the sparks it throws off what it hits. */
const WEAPON_COLOR: Record<string, number> = {
  fw_slash1: 0x8ff0ff,
  fw_slash2: 0x8ff0ff,
  fw_slash3: 0xd8fbff,
  fw_lance: 0x5f9dff,
  mf_burst: 0xffe27a,
  mf_kick: 0xb8ff5a,
  mf_snare: COLORS.snare,
  mf_pulse: 0xb28cff,
  df_hammer1: 0xff9a3a,
  df_hammer2: 0xffb24a,
  df_scatter: 0xff6a3a,
  df_ram: 0xffa030,
};
const weaponColor = (attack: number): number => WEAPON_COLOR[ATTACKS[attack]?.key ?? ''] ?? 0xffb040;
const WHITE = new THREE.Color(0xffffff);
const tint = new THREE.Color();
/** Speed the effects treat as "flat out": a forward's top speed on the speed lap. */
const FULL_SPEED = 160;
/** The speed stretch's shutter, in seconds: about a seventh of a frame at 60. */
const STRETCH_SHUTTER = 0.0024;

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const DUST: Record<string, number> = { meridian: 0x9aa2b0, canyon: 0xc98a5a, helios: 0xe8eef8 };

export class RaceView {
  /** Which gates were dark last frame, to flash them as they relight. */
  private gateDark: boolean[] = [];
  /** Who the mech being followed was last locked on to (a knockout clears the lock). */
  private lastTarget = -1;
  private lastTargetAt = 0;
  readonly group = new THREE.Group();
  /** The garage: only the mech being followed is shown, lit from overhead in its hangar. */
  solo = false;
  readonly cam: CameraRig;
  readonly fx = new Fx();
  readonly plates: Plate[] = [];
  /** The mech the camera follows. */
  focusId: number;
  /** Screen shake and hit-stop requests for the game to forward. */
  onImpact: (strength: number) => void = () => {};
  /** A heavy blow has started winding up (`atFocus`: aimed at the mech the camera follows). */
  onTell: (kind: TellKind, mech: number, atFocus: boolean) => void = () => {};
  private mechs: MechVisual[] = [];
  /** Garage views allocate only the selected pilot; race views allocate all six. */
  private readonly mechIds: number[];
  reviewDetailLevels(): string {
    return this.mechs.filter((v) => v.rig.detailLevels.length > 1)
      .map((v) => `${v.rig.root.userData.modelId ?? 'sunhawk'}:${v.rig.detailLevel}`).join(',');
  }
  private ring = makeLockRing();
  private time = 0;
  private flashUniform = 0;
  private hurt = 0;
  private fxFov = 0;

  /** Colour of the dust a landing kicks up: red sand in the canyon, cloud white up high. */
  private readonly dust: number;

  /** Each race team's livery: the factions racing. */
  readonly liveries: Livery[];

  constructor(
    private renderer: Renderer,
    private session: Session,
    private trackVis: TrackVisual,
    private feel: Feel,
    /** Which faction each race team is (an index into LIVERIES). */
    factions: [number, number] = [0, 1],
    private readonly previewOnly = false,
  ) {
    const race = session.race;
    this.liveries = factions.map((f) => LIVERIES[f] ?? LIVERIES[0]);
    this.dust = DUST[session.track.def.theme ?? 'meridian'] ?? DUST.meridian;
    this.focusId = session.localId >= 0 ? session.localId : 0;
    this.mechIds = previewOnly ? [this.focusId] : race.mechs.map((m) => m.id);
    this.solo = previewOnly;
    this.cam = new CameraRig(renderer.camera, session.track, feel);
    // A new session is a cut: the last one's speed effects end with it (the
    // garage would otherwise open smeared by the title screen's race).
    const u = renderer.speedPass.uniforms;
    u.uSpeed.value = u.uBoost.value = u.uTravel.value = 0;
    for (const id of this.mechIds) {
      const m = race.mechs[id];
      const livery = this.liveries[m.team];
      const rig = buildFrame(m.role, livery, String(m.role + 1));
      rig.root.matrixAutoUpdate = false;
      // Inked and shaded as a cel character in the anime look; and left sharp
      // by the speed stretch, since it travels with the camera.
      markCharacter(rig.root, m.id);
      markTraveller(rig.root);
      const shield = makeShield(livery.glow);
      const bubble = makeBubble(COLORS.cell, CLASSES[m.role].radius * 1.5 + 2.4);
      rig.root.add(shield, bubble);
      const snare = makeSnareRing(COLORS.snare);
      const trails = [new Trail(livery.glow), new Trail(livery.glow)];
      const shadow = makeShadow();
      this.group.add(rig.root, shadow, snare, trails[0].mesh, trails[1].mesh);
      this.mechs[m.id] = {
        rig,
        anim: new MechAnimator(rig),
        livery,
        trails,
        shadow,
        shield,
        shieldPower: 0,
        shieldFlash: 0,
        bubble,
        bubblePower: 0,
        snare,
        glow: new THREE.Color(livery.glow),
        trailColor: new THREE.Color(livery.glow),
        prevSpeed: m.speed,
        s: m.s,
        d: m.d,
        h: m.h,
        facing: m.facing,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        smokeT: 0,
        sparkT: 0,
        crackleT: 0,
        ramAge: 0,
        shotTick: -1,
        burstTier: 0,
        cut: 0,
        poseAcc: 0,
        poseIdx: -1,
      };
      this.plates[m.id] = { id: m.id, x: 0, y: 0, cx: 0, cy: 0, dist: 0, visible: false, ex: 0, ey: 0 };
    }
    this.group.add(this.ring, this.fx.group);
    renderer.scene.add(this.group);
    this.resize();
  }

  resize(): void {
    this.fxFov = this.renderer.camera.fov;
    this.fx.resize(this.renderer.canvas.clientHeight || window.innerHeight, this.fxFov);
  }

  /** Swap presentation assets while preserving the race, camera and animation. */
  refreshMechModels(scope: 'sunhawk' | 'roster' | 'all'): void {
    for (const id of this.mechIds) {
      const m = this.session.race.mechs[id];
      const v = this.mechs[m.id];
      const sunhawk=m.role===ROLE.FW && v.livery.id==='solstice';
      if ((scope==='sunhawk' && !sunhawk) || (scope==='roster' && sunhawk)) continue;
      const old = v.rig;
      const rig = buildFrame(m.role,v.livery,String(m.role+1));
      rig.root.matrixAutoUpdate = false;
      rig.root.matrix.copy(old.root.matrix);
      rig.root.visible = old.root.visible;
      rig.body.rotation.copy(old.body.rotation);
      rig.flames.forEach((f,i) => { if (old.flames[i]) f.mesh.scale.z = old.flames[i].mesh.scale.z; });
      rig.root.add(v.shield,v.bubble);
      markCharacter(rig.root,m.id);
      markTraveller(rig.root);
      v.rig = rig;
      v.anim.replaceRig(rig);
      rig.root.updateMatrixWorld(true);
      this.group.add(rig.root);
      this.group.remove(old.root);
      old.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        if (mesh.userData.ownMaterial) {
          const mat = mesh.material as THREE.MeshBasicMaterial;
          mat.map?.dispose(); mat.dispose();
        }
      });
    }
  }

  dispose(): void {
    this.renderer.scene.remove(this.group);
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.userData.ownMaterial) {
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
    });
    // Materials this view made for itself. The armour and glow materials of
    // the mech kit are shared between views and stay, as does the shadow texture.
    for (const id of this.mechIds) {
      const v = this.mechs[id];
      for (const mesh of [v.shield, v.bubble, v.snare, v.shadow, v.trails[0].mesh, v.trails[1].mesh]) (mesh.material as THREE.Material).dispose();
    }
    (this.ring.material as THREE.Material).dispose();
    this.fx.dispose();
  }

  /** World position of a mech's chest, for the HUD. */
  positionOf(id: number): THREE.Vector3 {
    return this.mechs[id].pos;
  }

  flash(amount: number): void {
    this.flashUniform = Math.max(this.flashUniform, amount);
  }

  update(dt: number, panX: number, panY: number, lookBack: boolean): void {
    const { race, track } = this.session;
    const alpha = this.session.alpha;
    this.time += dt;
    const focus = race.mechs[this.focusId];
    // Remember the lock for a few seconds after it goes.
    if (focus.target >= 0) {
      this.lastTarget = focus.target;
      this.lastTargetAt = race.tick;
    } else if (race.tick - this.lastTargetAt > 5 * TICK_RATE) {
      this.lastTarget = -1;
    }

    // ---- place and animate every mech
    const armed = weaponsFree(race);
    for (const id of this.mechIds) {
      const m = race.mechs[id];
      const v = this.mechs[m.id];
      v.s = this.session.prevS[m.id] + (m.s - this.session.prevS[m.id]) * alpha;
      v.d = this.session.prevD[m.id] + (m.d - this.session.prevD[m.id]) * alpha;
      v.facing = lerpAngle(this.session.prevFacing[m.id], m.facing, alpha);
      v.h = this.session.prevH[m.id] + (m.h - this.session.prevH[m.id]) * alpha;
      trackMatrix(track, v.s, v.d, v.h, v.facing, m4);
      v.rig.root.matrix.copy(m4);
      v.rig.root.matrixWorldNeedsUpdate = true;
      // The pose: every frame, or in the anime look only on each new drawing
      // (twelve a second, eight for a held pose: a boost, a carve, a burst),
      // while the mech itself moves smoothly.
      v.poseAcc += dt;
      const held = !m.retired && (m.boosting || m.carving || m.overdriveT > 0 || (m.carveT > 0 && m.mode === MODE.SPEED));
      const step = drawingStep(held ? 8 : 0);
      const idx = step > 0 ? Math.floor(drawClock.time / step) : -2;
      // Steering feedback must not wait up to 125 ms for an 8 Hz drawing.
      // Only the human pilot's bank runs every frame; stride/actions stay on twos.
      const responsive = !this.solo && m.id === this.session.localId && m.human;
      if (step <= 0 || idx !== v.poseIdx) {
        v.anim.display = this.solo && m.id === this.focusId;
        v.anim.update(v.poseAcc, m, alpha, responsive ? dt : v.poseAcc);
        v.poseAcc = 0;
        v.poseIdx = idx;
      } else if (responsive) {
        v.anim.updateSteering(dt, m);
      }
      v.rig.root.updateMatrixWorld(true);
      trackPoint(track, v.s, v.d, 4.2 + v.h, v.pos);
      trackDir(track, v.s, m.vs, m.vd, v.vel).multiplyScalar(Math.hypot(m.vs, m.vd));

      // Shadow: a soft blob stretched away from the low sun, shrinking as the
      // mech climbs away from the road, and gone with no road under it.
      // (In the hangar the light is overhead, so the blob sits right under it.)
      const sh = worldDirToTrackAngle(track, v.s, -SUN_DIR.x, -SUN_DIR.z);
      const off = this.solo ? 0 : 2.2;
      trackMatrix(track, v.s + Math.cos(sh) * off, v.d + Math.sin(sh) * off, 0.05, sh, m4);
      const r = CLASSES[m.role].radius;
      const lift = v.h > 0 ? Math.max(0.25, 1 - v.h / 40) : 1;
      v.shadow.visible = v.h > -2 && roadAt(track, m.s, m.d);
      (v.shadow.material as THREE.MeshBasicMaterial).map = shadowTexture(look.on);
      shadowScale.makeScale(r * 2.6 * lift, 1, r * 4.4 * lift);
      v.shadow.matrix.multiplyMatrices(m4, shadowScale);
      v.shadow.matrixWorldNeedsUpdate = true;

      // Light trails off the heels: team colour, gold in Overdrive, amber in a
      // Ram, and running hot while momentum has the next blow primed.
      const battle = m.mode === MODE.BATTLE;
      const surge = m.overdriveT > 0 && !m.retired;
      const ramming = m.ramT > 0 && !m.retired;
      const primed = m.momentum > 0 && !m.retired && armed;
      // A carve's tier, and then its burst, run in the carve's colour.
      const carveTier = m.carving && !m.retired && m.carveTier > 0 ? m.carveTier : 0;
      const bursting = m.carveT > 0 && !m.retired && !battle;
      let glow = Math.min(1, Math.max(0, (m.speed - 25) / 70)) * (battle ? 0.7 : 0.9);
      if (primed) glow = Math.max(glow, 1.3);
      if (carveTier > 0) glow = Math.max(glow, 1 + carveTier * 0.25);
      if (m.boosting || bursting) glow = 1.7;
      if (surge) glow = 2.4;
      if (m.retired) glow = 0;
      const tint = surge ? GOLD : ramming ? AMBER : bursting ? CARVE[v.burstTier] : carveTier > 0 ? CARVE[carveTier] : primed ? HOT : v.glow;
      v.trailColor.lerp(tint, 1 - Math.exp(-10 * dt));
      trackDir(track, v.s, 0, 1, v2);
      for (let i = 0; i < 2; i++) {
        v.rig.heels[i].getWorldPosition(v1);
        v.trails[i].setColor(v.trailColor);
        v.trails[i].update(v1, v2, glow * 0.8 * this.feel.trails, surge ? 0.5 : m.boosting || bursting ? 0.34 : 0.2);
      }

      // Guard shield, which also serves as the prow of a ram.
      const su = (v.shield.material as THREE.ShaderMaterial).uniforms;
      v.shieldPower = toward(v.shieldPower, m.guarding ? 1 : ramming ? 1.25 : 0, 18, dt);
      v.shieldFlash = Math.max(0, v.shieldFlash - dt * 5);
      const sp = v.shieldPower * 0.75 + v.shieldFlash;
      v.shield.visible = sp > 0.02;
      if (v.shield.visible) {
        (su.uColor.value as THREE.Color).copy(ramming && !m.guarding ? AMBER : v.glow);
        su.uPower.value = sp;
        su.uTime.value = this.time;
      }
      // Aegis bubble.
      v.bubblePower = toward(v.bubblePower, m.shieldT > 0 && !m.retired ? Math.min(1, m.shieldT / 24) : 0, 14, dt);
      v.bubble.visible = v.bubblePower > 0.02;
      if (v.bubble.visible) {
        const bu = (v.bubble.material as THREE.ShaderMaterial).uniforms;
        bu.uPower.value = v.bubblePower * (0.8 + Math.sin(this.time * 9) * 0.08);
        bu.uTime.value = this.time;
      }
      // Snare hoop riding up and down the body.
      v.snare.visible = m.snareT > 0 && !m.retired;
      if (v.snare.visible) {
        const r = CLASSES[m.role].radius + 0.9;
        trackMatrix(track, v.s, v.d, 3.6 + Math.sin(this.time * 7 + m.id) * 2.6, this.time * 3, m4);
        shadowScale.makeScale(r, 1, r);
        v.snare.matrix.multiplyMatrices(m4, shadowScale);
        v.snare.matrixWorldNeedsUpdate = true;
      }
      // Drawn crackle (the anime look): bolts bracketing a snared mech in the
      // Snare's colour, or one breaking away in its own; a ring of it on the
      // road round a mech in Overdrive, in gold.
      v.crackleT = Math.max(0, v.crackleT - dt);
      if (!m.retired && (m.snareT > 0 || v.crackleT > 0)) {
        this.fx.drawnKeep(`bracket${m.id}`, 'crackle', v.pos, 13, { row: 0, tint: m.snareT > 0 ? COLORS.snare : v.livery.glow, gain: 1.3 });
      }
      if (surge) {
        trackMatrix(track, v.s, v.d, v.h + 0.2, 0, m4);
        m4.decompose(v1, flatQ, v2);
        flatQ.multiply(layFlat);
        this.fx.drawnKeep(`surge${m.id}`, 'crackle', v1, 15, { row: 1, tint: COLORS.cell, flat: flatQ, turn: true, depth: true, gain: 1.25 });
      }
      // A staggered mech shorting out round its head and shoulders.
      if (!m.retired && m.act === ACT.STAGGER) {
        this.fx.drawnKeep(`stun${m.id}`, 'stun', v.pos, CLASSES[m.role].radius * 3.4, { tint: 0xfff0a0, gain: 1.3 });
      }
      // The ram's prow: its bow shock ahead of the mech, once the charge's
      // own first drawings have played.
      if (ramming) {
        v.ramAge += dt;
        if (v.ramAge > 0.25) this.ramProw(v, m, `ram${m.id}`);
      } else {
        v.ramAge = 0;
      }

      // Ambient sparks and smoke.
      const accel = dt > 0 ? (m.speed - v.prevSpeed) / dt : 0;
      v.prevSpeed = m.speed;
      v.sparkT -= dt;
      if (v.sparkT <= 0) {
        v.sparkT = 0.03;
        const sf = m.speed / FULL_SPEED;
        if (!m.retired && m.speed > 45 && this.feel.sparks > 0) {
          // Skate sparks: a steady trickle at speed, a shower when the mech is
          // leaning on its edges in a corner or standing on the brakes.
          const lean = battle ? Math.min(1, Math.abs(m.vd) / 30) : Math.abs(m.steer);
          const hard = accel < -25 ? 1 : 0;
          const want = (0.12 + sf * 0.35 + lean * 1.1 + hard * 1.6 + (surge ? 1.4 : 0)) * this.feel.sparks;
          const n = Math.floor(want) + (Math.random() < want % 1 ? 1 : 0);
          if (n > 0) {
            const side = lean > 0.15 ? ((battle ? m.vd : m.steer) > 0 ? 0 : 1) : Math.random() < 0.5 ? 0 : 1;
            v.rig.heels[side].getWorldPosition(v1);
            // Left behind by the mech: they keep only a little of its speed.
            v3.copy(v.vel).multiplyScalar(0.25);
            trackDir(track, v.s, -0.3, side === 0 ? -0.5 : 0.5, v2);
            this.fx.spray(v1, v3, v2, n, 16, surge ? COLORS.cell : hard ? 0xffb060 : 0xffe2b0, 0.26, 0.28);
          }
        }
        if (m.act === ACT.DASH && m.arcDir !== 0 && !m.retired && this.feel.sparks > 0) {
          // A guard swing throws a spray off both skates, out from the circle.
          for (const heel of [0, 1]) {
            v.rig.heels[heel].getWorldPosition(v1);
            trackDir(track, v.s, -0.4, heel === 0 ? -0.8 : 0.8, v2);
            this.fx.spray(v1, v.vel, v2, Math.ceil(2.5 * this.feel.sparks), 22, CARVE_COLORS[1], 0.32, 0.3);
          }
        }
        if (m.carving && !m.air && !m.retired && this.feel.sparks > 0) {
          // Carve sparks off the outside skate, thicker and brighter with
          // each tier, and from the inside one as well once it is charged.
          const tier = m.carveTier;
          const want = (1.4 + tier * 1.1) * this.feel.sparks;
          const n = Math.floor(want) + (Math.random() < want % 1 ? 1 : 0);
          const out = m.carveDir > 0 ? 0 : 1;
          v3.copy(v.vel).multiplyScalar(0.3);
          for (const heel of tier > 0 ? [out, 1 - out] : [out]) {
            v.rig.heels[heel].getWorldPosition(v1);
            trackDir(track, v.s, -0.55, heel === 0 ? -0.75 : 0.75, v2);
            this.fx.spray(v1, v3, v2, heel === out ? n : Math.ceil(n / 2), 18 + tier * 5, CARVE_COLORS[tier], 0.28 + tier * 0.07, 0.3 + tier * 0.04);
          }
        }
        if (m.onStrip && !m.retired) {
          trackPoint(track, v.s, v.d + (Math.random() - 0.5) * 3, 0.3, v1);
          this.fx.spray(v1, v.vel, v3.set(0, 1, 0), 2, 9, COLORS.charge, 0.4, 0.5);
        }
        if (m.wall > 0 && m.speed > 25 && !m.retired) {
          const side = m.d > 0 ? 1 : -1;
          trackPoint(track, v.s, v.d + side * CLASSES[m.role].radius, 1.4, v1);
          trackDir(track, v.s, -1, -side * 0.4, v3);
          this.fx.spray(v1, v.vel, v3, 3, 26, 0xffc66e, 0.4, 0.4);
        }
        if (m.boosting || surge) {
          v.rig.heels[Math.random() < 0.5 ? 0 : 1].getWorldPosition(v1);
          trackDir(track, v.s, -1, 0, v3);
          this.fx.spray(v1, v.vel, v3, surge ? 2 : 1, 30, surge ? COLORS.cell : v.livery.glow, 0.35, 0.3);
        }
        if (m.snareT > 0 && !m.retired && !look.on) {
          trackPoint(track, v.s, v.d, 3 + Math.random() * 3, v1);
          this.fx.burst(v1, v.vel, 1, 10, COLORS.snare, 0.3, 0.3);
        }
      }
      if (m.retired || m.hp < m.maxHp * 0.25) {
        v.smokeT -= dt;
        if (v.smokeT <= 0) {
          trackPoint(track, v.s, v.d, 5, v1);
          // Drawn, a puff every few drawings, left behind as the mech goes:
          // a dark cloud off a wreck, a grey puff off a mech that is hurt.
          v3.copy(v.vel).multiplyScalar(0.5);
          const roll = (Math.random() - 0.5) * 0.6;
          if (this.fx.drawnSprite('smoke', v1, m.retired ? 7.5 : 4.5, { row: m.retired ? 1 : 0, tint: m.retired ? 0x5a5662 : 0x8c8894, vel: v3, roll, flip: Math.random() < 0.5, depth: true })) {
            v.smokeT = m.retired ? 0.2 : 0.24;
          } else {
            v.smokeT = m.retired ? 0.07 : 0.16;
            this.fx.puff(v1, v.vel, 1, m.retired ? 0x2b2b33 : 0x55555f, m.retired ? 2.6 : 1.6, m.retired ? 1.5 : 0.9);
          }
          if (m.retired && Math.random() < 0.25) this.fx.burst(v1, v.vel, 3, 14, 0xffa040, 0.3, 0.4);
        }
      }
    }

    // ---- lock ring under the focus mech's target
    if (focus.target >= 0 && !focus.retired) {
      const t = race.mechs[focus.target];
      const tv = this.mechs[t.id];
      trackMatrix(track, tv.s, tv.d, 0.08, this.time * 1.6, m4);
      const r = (CLASSES[t.role].radius + 2.2) * (1 + Math.sin(this.time * 7) * 0.04);
      shadowScale.makeScale(r, 1, r);
      this.ring.matrix.multiplyMatrices(m4, shadowScale);
      this.ring.matrixWorldNeedsUpdate = true;
      (this.ring.material as THREE.MeshBasicMaterial).color.set(t.team === focus.team ? 0x49f0c0 : 0xff4d4d).multiplyScalar(1.5);
      this.ring.visible = true;
    } else {
      this.ring.visible = false;
    }

    // ---- wind-up tells: a ring closing on any mech winding up a heavy blow
    if (this.feel.tells > 0) {
      for (const id of this.mechIds) {
        const m = race.mechs[id];
        // Rivals only: a team-mate's wind-up is nothing you need to read.
        if (m.team === focus.team) continue;
        const t = tellOf(m, race.tick);
        if (!t) continue;
        const v = this.mechs[m.id];
        const strong = m.target === this.focusId;
        const color = TELL_COLOR[t.kind];
        const size = (CLASSES[m.role].radius + 1.2) * this.feel.tells;
        if (this.fx.tell(t.key, v.pos, size, color, Math.max(0, t.left - alpha), t.now, strong)) {
          // The glint: a hard little star at the head as the blow is committed.
          v1.copy(v.pos);
          v1.y += v.rig.dims.height * 0.35;
          this.fx.flash(v1, strong ? 7 : 4.5, color, 0.22, v.rig.root);
          this.onTell(t.kind, m.id, strong);
        }
      }
    }

    // ---- tracers
    this.fx.beginTracers();
    for (const p of race.projectiles) {
      const back = DT * (1 - alpha);
      const ps = p.s - p.vs * back;
      const pd = p.d - p.vd * back;
      const ang = Math.atan2(p.vd - focus.vd, p.vs - focus.vs);
      trackMatrix(track, ps, pd, 4.3, ang, m4);
      const snareBolt = p.attack === ATK.MF_SNARE;
      this.fx.tracer(m4, snareBolt ? 9 : ATTACKS[p.attack].shot!.pellets > 1 ? 2.2 : 4.2, snareBolt ? COLORS.snare : this.liveries[p.team].glow);
    }
    this.fx.endTracers();

    // ---- start lights
    const lights = this.trackVis.lights;
    if (race.phase === PHASE.COUNTDOWN) {
      const lit = Math.floor((race.tick / COUNTDOWN_TICKS) * 5.6);
      lights.forEach((b, i) => (b.material as THREE.MeshBasicMaterial).color.setHex(i < lit ? 0xff2a1a : 0x200808).multiplyScalar(i < lit ? 2.4 : 1));
    } else {
      const since = race.tick - COUNTDOWN_TICKS;
      const on = since < 150;
      lights.forEach((b) => (b.material as THREE.MeshBasicMaterial).color.setHex(on ? 0x30ff60 : 0x081a0c).multiplyScalar(on ? 2.2 : 1));
    }

    // ---- Cell gates: lit while the mech being followed can still score them.
    // A gate someone has just taken is dark for everyone, glowing back up as
    // it comes round to relighting; it flashes when it is live again.
    const gates = this.trackVis.gates;
    const gateWorth = focus.lap <= 0 ? race.rules.gateValue : race.rules.gateValueLater;
    const open = race.phase !== PHASE.FINISHED && focus.lap < race.rules.gateLaps && gateWorth > 0 && !focus.retired && !focus.finished;
    const relight = Math.max(1, race.rules.gateRelight * TICK_RATE);
    for (let i = 0; i < track.gates.length; i++) {
      const taken = (focus.gateMask & (1 << i)) !== 0;
      const darkFor = race.gateDark[i] - race.tick;
      const dark = darkFor > 0;
      if (this.gateDark[i] && !dark && open && !taken) gates.pulse(i);
      this.gateDark[i] = dark;
      let lit = open && !taken ? (focus.cells < race.rules.cellMax ? 1 : 0.35) : 0;
      if (dark && lit > 0) lit = 0.06 + 0.22 * (1 - darkFor / relight);
      gates.setLit(i, lit);
    }

    // ---- camera
    const fv = this.mechs[this.focusId];
    const tgt = focus.target >= 0 ? this.mechs[focus.target] : null;
    this.cam.update(dt, { s: fv.s, d: fv.d, h: fv.h, mech: focus, target: tgt ? { s: tgt.s, d: tgt.d } : null }, panX, panY, lookBack);
    // Sparks are sized in pixels from the field of view, which now swings with speed.
    if (Math.abs(this.renderer.camera.fov - this.fxFov) > 1.5) this.resize();
    this.fx.update(dt, this.renderer.camera);

    // A mech right on top of the lens would fill the frame: drop it for a moment.
    for (const id of this.mechIds) {
      const m = race.mechs[id];
      const v = this.mechs[m.id];
      v.rig.root.visible = m.id === this.focusId || (!this.solo && v.pos.distanceToSquared(this.renderer.camera.position) > 7.5 * 7.5);
      updateMechDetail(v.rig, this.renderer.camera, this.renderer.renderer.domElement.clientHeight);
      if (this.solo && m.id !== this.focusId) v.shadow.visible = v.snare.visible = v.trails[0].mesh.visible = v.trails[1].mesh.visible = false;
    }

    // ---- post effects
    const u = this.renderer.speedPass.uniforms;
    const F = this.feel;
    const speedFrac = Math.min(1.5, focus.speed / FULL_SPEED);
    // A fight is carried along at racing speed, so it keeps (by default all of) the speed effects.
    const fxScale = focus.retired ? 0.2 : focus.mode === MODE.BATTLE ? F.lockSpeedFx : 1;
    const surging = focus.overdriveT > 0 && !focus.retired && focus.mode === MODE.SPEED;
    u.uSpeed.value = toward(u.uSpeed.value, speedFrac * speedFrac * 1.15 * fxScale, 4, dt);
    u.uBoost.value = toward(u.uBoost.value, surging ? 1.5 : focus.boosting ? 1 : focus.ramT > 0 ? 0.5 : 0, 6, dt);
    u.uBlurK.value = F.speedBlur;
    u.uLineK.value = F.speedLines;
    // The stretch: how far the camera goes in the blur's shutter, so near
    // things smear by how fast they go past. It smears away from the middle
    // of the frame, the way the camera is going: never toward a bend ahead,
    // which set the streaks at an angle to the travel through a corner.
    u.uTravel.value = toward(u.uTravel.value, (focus.retired ? 0 : focus.speed) * STRETCH_SHUTTER * fxScale, 8, dt);
    tint.copy(surging ? GOLD : WHITE);
    (u.uTint.value as THREE.Vector3).set(tint.r, tint.g, tint.b);
    this.renderer.setBloom(F.bloom);
    this.flashUniform = Math.max(0, this.flashUniform - dt * 4.5);
    this.hurt = Math.max(0, this.hurt - dt * 1.8);
    u.uFlash.value = this.flashUniform * 0.55;
    const critical = focus.hp < focus.maxHp * 0.25 && !focus.retired ? 0.35 + Math.sin(this.time * 6) * 0.15 : 0;
    u.uHurt.value = Math.max(this.hurt, critical);

    // ---- screen positions for the HUD
    const cam = this.renderer.camera;
    const w = this.renderer.canvas.clientWidth || window.innerWidth;
    const h = this.renderer.canvas.clientHeight || window.innerHeight;
    for (const id of this.mechIds) {
      const m = race.mechs[id];
      const v = this.mechs[m.id];
      const plate = this.plates[m.id];
      ndc.copy(v.pos);
      ndc.y += v.rig.dims.height - 3.4;
      plate.dist = ndc.distanceTo(cam.position);
      ndc.project(cam);
      plate.visible = ndc.z < 1 && ndc.z > -1 && Math.abs(ndc.x) < 1.1 && Math.abs(ndc.y) < 1.1;
      plate.x = (ndc.x * 0.5 + 0.5) * w;
      plate.y = (-ndc.y * 0.5 + 0.5) * h;
      ndc.copy(v.pos).project(cam);
      plate.cx = (ndc.x * 0.5 + 0.5) * w;
      plate.cy = (-ndc.y * 0.5 + 0.5) * h;
      // Behind the camera the projection comes out mirrored through the middle.
      const flip = ndc.z > 1 ? -1 : 1;
      plate.ex = ndc.x * flip * w * 0.5;
      plate.ey = -ndc.y * flip * h * 0.5;
    }
  }

  /** Who the mech being followed has been locked on to in the last few seconds, or -1. */
  get recentTarget(): number {
    return this.lastTarget;
  }

  /**
   * The anime look's drawn swing: a painted smear round the mech, facing the
   * camera as a cel would. Light cuts alternate their direction through a
   * combo; a heavy blow uses the heavy smear, a kick its own rising one, a
   * hammer its own coming down; the lance is a thrust pointing along the
   * dash. Returns false in the plain look.
   */
  private drawnSwing(v: MechVisual, attack: number, color: number, tilt: number): boolean {
    const { track } = this.session;
    const atk = ATTACKS[attack];
    if (attack === ATK.FW_LANCE) {
      trackPoint(track, v.s + Math.cos(v.facing) * 6, v.d + Math.sin(v.facing) * 6, 4.6, v1);
      trackDir(track, v.s, Math.cos(v.facing), Math.sin(v.facing), v3);
      return this.fx.drawnSprite('lance', v1, 18, { tint: color, follow: v.rig.root, dir: v3, gain: 1.3 });
    }
    if (attack === ATK.MF_KICK) {
      trackPoint(track, v.s, v.d, 4.8, v1);
      return this.fx.drawnSprite('kick', v1, 11, { tint: color, follow: v.rig.root, roll: tilt, flip: v.cut % 2 === 1, gain: 1.25 });
    }
    if (attack === ATK.DF_HAMMER1 || attack === ATK.DF_HAMMER2) {
      // Brought down in front of the mech.
      trackPoint(track, v.s + Math.cos(v.facing) * 2, v.d + Math.sin(v.facing) * 2, 6, v1);
      return this.fx.drawnSprite('hammer', v1, attack === ATK.DF_HAMMER2 ? 17 : 15, { tint: color, follow: v.rig.root, flip: v.cut % 2 === 1, gain: 1.25 });
    }
    trackPoint(track, v.s, v.d, 4.8, v1);
    const size = atk.heavy ? 13 : 10;
    if (atk.heavy) {
      return this.fx.drawnSprite('cutHeavy', v1, size, { tint: color, follow: v.rig.root, roll: tilt, flip: v.cut % 2 === 1, gain: 1.2 });
    }
    return this.fx.drawnSprite('cutLight', v1, size, { tint: color, follow: v.rig.root, roll: tilt, row: v.cut % 2, gain: 1.2 });
  }

  /** A ring painted flat on the road under a mech (the anime look), or false in the plain look. */
  private groundRing(v: MechVisual, size: number, color: number): boolean {
    const { track } = this.session;
    trackMatrix(track, v.s, v.d, 0.15, 0, m4);
    m4.decompose(v1, flatQ, v2);
    flatQ.multiply(layFlat);
    return this.fx.drawnSprite('groundRing', v1, size, { tint: color, flat: flatQ, roll: Math.random() * Math.PI * 2, gain: 1.2 });
  }

  /**
   * The anime look's barrier strike: a burst with its flat side on the
   * barrier (the road's edge at `face`, on `side`) bursting back over the
   * road, `h` up, carried a little way by the mech; then a puff of dust off
   * the barrier a drawing or two later. Returns false in the plain look.
   */
  private wallStrike(v: MechVisual, face: number, side: number, h: number, size: number, color: number): boolean {
    const { track } = this.session;
    trackDir(track, v.s, 0, -side, v3);
    // The barrier is WALL_EDGE in from the drawing's left: move its middle
    // that far off the barrier, toward the road.
    trackPoint(track, v.s, face - side * (0.5 - WALL_EDGE) * size, h, v1);
    v2.copy(v.vel).multiplyScalar(0.5);
    if (!this.fx.drawnSprite('wall', v1, size, { tint: color, dir: v3, vel: v2, gain: 1.3 })) return false;
    trackPoint(track, v.s, face - side * size * 0.15, h, v1);
    this.fx.drawnSprite('smoke', v1, size * 0.5, { row: 0, tint: this.dust, vel: v2, delay: 2, flip: side > 0, depth: true });
    return true;
  }

  /**
   * The cracks a hammer slam leaves on the road round the mech it hit (the
   * anime look): a couple of drawings after the blow, once the impact's
   * flash, which covers the feet, has shrunk.
   */
  private groundCracks(v: MechVisual, color: number): boolean {
    if (v.h > 1) return false;
    trackMatrix(this.session.track, v.s, v.d, 0.12, 0, m4);
    m4.decompose(v1, flatQ, v2);
    flatQ.multiply(layFlat);
    // Carried along under the mech: at racing speed, cracks left where the
    // blow landed would be behind the camera before they had drawn.
    return this.fx.drawnSprite('cracks', v1, 20, { tint: color, flat: flatQ, follow: v.rig.root, roll: Math.random() * Math.PI * 2, delay: 2, depth: true, gain: 1.3 });
  }

  /**
   * The ram's prow, its tip just ahead of the mech, pointing the way it
   * faces: the charge starting (`key` null, riding on the mech) or the loop
   * while it lasts (kept under `key`). Seen from behind (a ram charging away
   * up the track, as the player's own does) it is drawn smaller and pushed
   * back along the line of sight, behind the mech, so the mech stands in
   * front of it with the prow flaring round it. Returns false in the plain
   * look.
   */
  private ramProw(v: MechVisual, m: MechState, key: string | null): boolean {
    const r = CLASSES[m.role].radius;
    trackDir(this.session.track, v.s, Math.cos(v.facing), Math.sin(v.facing), v3);
    const cam = this.renderer.camera;
    cam.getWorldDirection(camFwd);
    const away = v3.dot(camFwd) > 0.3;
    let size = (6 + r * 2.4) * (away ? 0.65 : 1);
    v4.copy(v.pos).addScaledVector(v3, r + 1.5 - (RAM_TIP - 0.5) * size);
    if (away) {
      // Further along the same line of sight, and bigger by as much: the same
      // place on screen, but behind the mech.
      v2.copy(v4).sub(cam.position);
      const d = v2.length() || 1;
      const k = (d + r * 2.5) / d;
      v4.copy(cam.position).addScaledVector(v2, k);
      size *= k;
    }
    const o = { row: key ? 1 : 0, tint: 0xffa030, dir: v3, gain: 1.3, depth: away, follow: key ? null : v.rig.root };
    return key ? this.fx.drawnKeep(key, 'ram', v4, size, o) : this.fx.drawnSprite('ram', v4, size, o);
  }

  /**
   * The muzzle blast along a shot (the anime look): the rifle's or, for a
   * gun throwing pellets, the scatter cannon's. Once a volley: a scatter
   * cannon reports each pellet. Returns false in the plain look.
   */
  private drawnMuzzle(v: MechVisual, mech: number, proj: number, scatter: boolean): boolean {
    if (!look.on) return false;
    const { race, track } = this.session;
    if (v.shotTick === race.tick) return true;
    v.shotTick = race.tick;
    const m = race.mechs[mech];
    const p = race.projectiles.find((q) => q.id === proj);
    const aim = p ? Math.atan2(p.vd - m.vd, p.vs - m.vs) : m.facing;
    trackDir(track, v.s, Math.cos(aim), Math.sin(aim), v3);
    const size = scatter ? 7 : 6;
    v.rig.muzzle.getWorldPosition(v1).addScaledVector(v3, (0.5 - MUZZLE_EDGE) * size);
    return this.fx.drawnSprite('muzzle', v1, size, { row: scatter ? 1 : 0, tint: v.livery.glow, follow: v.rig.root, dir: v3, gain: 1.3 });
  }

  /** React to something the simulation reported. */
  handleEvent(e: SimEvent): void {
    if (this.previewOnly) return;
    const { race, track } = this.session;
    const local = this.focusId;
    switch (e.type) {
      case 'hit': {
        const v = this.mechs[e.victim];
        const a = this.mechs[e.attacker];
        const atk = ATTACKS[e.attack];
        // Put the impact on the side facing the attacker.
        v1.copy(a.pos).sub(v.pos);
        const gap = v1.length() || 1;
        v1.multiplyScalar(Math.min(2.6, gap * 0.5) / gap).add(v.pos);
        v1.y += (Math.random() - 0.3) * 1.6;
        const big = e.heavy && !e.blocked;
        // A momentum strike lands with a shockwave in the colour of the heat it carried.
        const surge = e.charged && !e.blocked;
        const spin = Math.random() * Math.PI * 2;
        const mirror = Math.random() < 0.5;
        if (e.blocked) {
          v.shieldFlash = 1;
          this.fx.burst(v1, v.vel, 8, 26, v.livery.glow, 0.4, 0.3);
          // Drawn: a spark in the blocker's colour.
          if (!this.fx.drawnSprite('spark', v1, 6, { tint: v.livery.glow, follow: v.rig.root, roll: spin, flip: mirror, gain: 1.25 })) this.fx.flash(v1, 4.5, v.livery.glow, 0.14, v.rig.root, true);
        } else {
          const melee = atk.kind === 'melee';
          const wc = weaponColor(e.attack);
          this.fx.burst(v1, v.vel, melee ? (big ? 34 : 16) : 6, big ? 52 : 34, wc, melee ? 0.55 : 0.4, 0.45);
          // Drawn: the heavy impact for a big blow (in the heat's colour for a
          // momentum strike), a hit spark for the rest, gunfire's smaller.
          const drawn = big || surge
            ? this.fx.drawnSprite('impact', v1, surge ? 14 : 11, { tint: surge ? HOT_HEX : wc, follow: v.rig.root, gain: 1.4, roll: spin, flip: mirror })
            : this.fx.drawnSprite('spark', v1, melee ? 6.5 : 4, { tint: wc, follow: v.rig.root, roll: spin, flip: mirror, gain: 1.25 });
          if (!drawn) {
            this.fx.flash(v1, big ? 8.5 : melee ? 5.5 : 3.2, melee ? 0xfff2c8 : wc, big ? 0.2 : 0.12, v.rig.root);
            if (big) this.fx.flash(v1, 7, 0xffffff, 0.28, v.rig.root, true);
          }
        }
        if (surge) {
          if (!this.fx.drawnSprite('ring', v1, 16, { tint: HOT_HEX, follow: v.rig.root, gain: 1.3, roll: spin })) {
            this.fx.flash(v1, 13, HOT_HEX, 0.3, v.rig.root, true);
            this.fx.flash(v1, 10, 0xffe6c0, 0.18, v.rig.root);
          }
          this.fx.burst(v1, v.vel, 40, 70, HOT_HEX, 0.6, 0.5);
        }
        // Drawn: a hammer slam cracks the road round the mech it hit.
        if (e.attack === ATK.DF_HAMMER2) this.groundCracks(v, weaponColor(e.attack));
        if ((e.victim === local || e.attacker === local) && (big || surge)) {
          this.cam.punch(surge ? 0.9 : 0.6);
          this.renderer.impactFrame(surge ? 0.12 : 0.09);
        }
        if (e.victim === local) {
          this.cam.shake(e.blocked ? 0.18 : surge ? 0.8 : big ? 0.62 : atk.kind === 'melee' ? 0.38 : 0.16);
          if (!e.blocked) this.hurt = Math.min(1, this.hurt + (big || surge ? 0.7 : 0.35));
          // Gunfire rumbles but does not stop the clock; blades and fists do.
          this.onImpact(e.blocked ? 0.2 : big || surge ? 1 : atk.kind === 'melee' ? 0.5 : 0.25);
        } else if (e.attacker === local) {
          this.cam.shake(surge ? 0.55 : big ? 0.4 : atk.kind === 'melee' ? 0.2 : 0.04);
          if (atk.kind === 'melee') this.onImpact(surge ? 1 : big ? 0.8 : 0.35);
          if (surge) this.flash(0.25);
        }
        break;
      }
      case 'parry': {
        const v = this.mechs[e.mech];
        v.shieldFlash = 1.6;
        trackPoint(track, v.s, v.d, 4.4, v1);
        // Drawn: the glint, clean and geometric, so a parry never reads as a hit.
        if (!this.fx.drawnSprite('parry', v1, 13, { tint: v.livery.glow, follow: v.rig.root, gain: 1.45 })) {
          this.fx.flash(v1, 12, 0xffffff, 0.28, v.rig.root, true);
          this.fx.flash(v1, 9, v.livery.glow, 0.2, v.rig.root);
        }
        this.fx.burst(v1, v.vel, 30, 60, 0xffffff, 0.5, 0.4);
        if (e.mech === local || e.attacker === local) {
          this.cam.shake(0.45);
          this.cam.punch(0.75);
          this.flash(0.35);
          this.onImpact(0.9);
          this.renderer.impactFrame(0.09);
        }
        break;
      }
      case 'guardBreak': {
        const v = this.mechs[e.mech];
        trackPoint(track, v.s, v.d, 4.4, v1);
        if (!this.fx.drawnSprite('impact', v1, 14, { tint: 0xff5a3c, follow: v.rig.root, gain: 1.4, roll: Math.random() * Math.PI * 2 })) this.fx.flash(v1, 13, 0xff5a3c, 0.3, v.rig.root, true);
        this.fx.burst(v1, v.vel, 40, 55, v.livery.glow, 0.6, 0.55);
        if (e.mech === local || e.by === local) {
          this.cam.shake(0.7);
          this.cam.punch(0.85);
          this.onImpact(1);
          this.renderer.impactFrame(0.11);
        }
        break;
      }
      case 'splat': {
        // A ring-out: the barrier flares where the mech struck it and a pulse
        // runs away along it both ways.
        const v = this.mechs[e.mech];
        const hard = Math.min(1.5, 0.6 + e.intensity / 40);
        this.trackVis.pulseWall(e.s, e.face, hard * this.feel.wallPulse, true);
        if (!this.wallStrike(v, e.face, e.side, 3.2 + v.h, 16, 0xff6ab0)) {
          trackPoint(track, v.s, e.face - e.side * 0.3, 3.2 + v.h, v1);
          this.fx.flash(v1, 16, 0xff6ab0, 0.32);
          this.fx.flash(v1, 11, 0xffffff, 0.2, null, true);
        }
        trackPoint(track, v.s, e.face - e.side * 0.3, 3.2 + v.h, v1);
        trackDir(track, v.s, 0.2, -e.side, v3);
        this.fx.spray(v1, v.vel, v3, 46, 46, 0xffb0d8, 0.5, 0.55);
        this.fx.burst(v1, v.vel, 30, 50, 0xffb040, 0.55, 0.5);
        if (e.mech === local || e.by === local) {
          this.cam.shake(e.mech === local ? 0.85 : 0.55);
          if (e.mech === local) this.hurt = 1;
          this.flash(0.3);
          this.onImpact(1);
          this.renderer.impactFrame(0.11);
        }
        break;
      }
      case 'ko': {
        const v = this.mechs[e.mech];
        trackPoint(track, v.s, v.d, 4.5, v1);
        if (this.fx.explosion(v1, v.vel, 28)) {
          // The anime look: the painted explosion (flash, fireball, smoke
          // closing over it and breaking up), with a shock ring and sparks.
          this.fx.flash(v1, 20, 0xff8a30, 0.5, v.rig.root, true);
          this.fx.burst(v1, v.vel, 40, 80, 0xffa040, 0.8, 0.9);
        } else {
          this.fx.flash(v1, 26, 0xffffff, 0.45, v.rig.root);
          this.fx.flash(v1, 20, 0xff8a30, 0.6, v.rig.root, true);
          this.fx.burst(v1, v.vel, 90, 80, 0xffa040, 0.8, 0.9);
          this.fx.puff(v1, v.vel, 12, 0x2b2b33, 3.5, 1.8);
        }
        const near = this.mechs[local].pos.distanceTo(v.pos) < 140;
        if (inKnockout(race, e.mech, e.by, local, this.lastTarget)) this.cam.punch(1);
        if (near) {
          this.cam.shake(e.mech === local ? 1 : 0.6);
          this.flash(e.mech === local ? 1 : 0.5);
          this.onImpact(1);
        }
        break;
      }
      case 'wall': {
        const v = this.mechs[e.mech];
        const side = e.side;
        this.trackVis.pulseWall(e.s, e.face, Math.min(0.9, Math.max(0.25, e.intensity / 30)) * this.feel.wallPulse, false);
        this.wallStrike(v, e.face, side, 2.4 + v.h, 6 + Math.min(6, e.intensity * 0.15), 0xffc66e);
        trackPoint(track, v.s, v.d + side * 3, 1.6, v1);
        trackDir(track, v.s, -1, -side * 0.5, v3);
        this.fx.spray(v1, v.vel, v3, Math.min(30, 6 + e.intensity), 30, 0xffc66e, 0.45, 0.45);
        if (e.mech === local) {
          this.cam.shake(Math.min(0.6, 0.12 + e.intensity * 0.02));
          this.onImpact(Math.min(0.8, e.intensity * 0.03));
        }
        break;
      }
      case 'bump': {
        const a = this.mechs[e.a];
        const b = this.mechs[e.b];
        v1.copy(a.pos).add(b.pos).multiplyScalar(0.5);
        this.fx.burst(v1, a.vel, Math.min(20, 4 + e.intensity * 0.6), 24, 0xfff0c0, 0.4, 0.3);
        if (e.a === local || e.b === local) {
          this.cam.shake(Math.min(0.4, e.intensity * 0.02));
          this.onImpact(Math.min(0.6, e.intensity * 0.03));
        }
        break;
      }
      case 'shot': {
        const v = this.mechs[e.mech];
        const scatter = ATTACKS[e.attack].shot!.pellets > 1;
        if (!this.drawnMuzzle(v, e.mech, e.proj, scatter)) {
          v.rig.muzzle.getWorldPosition(v1);
          this.fx.flash(v1, scatter ? 2.6 : 3.4, v.livery.glow, 0.07, v.rig.root);
        }
        if (e.mech === local) this.cam.shake(scatter ? 0.07 : 0.1);
        break;
      }
      case 'windup': {
        if (!e.charged) break;
        // Thrown with momentum: the heat in the trails goes into the blow.
        const v = this.mechs[e.mech];
        this.fx.flash(v.pos, 11, HOT_HEX, 0.26, v.rig.root, true);
        this.fx.burst(v.pos, v.vel, 22, 40, HOT_HEX, 0.5, 0.35);
        if (e.mech === local) this.cam.shake(0.25);
        break;
      }
      case 'swing': {
        const v = this.mechs[e.mech];
        const atk = ATTACKS[e.attack];
        if (atk.kind === 'melee') {
          // The blade arc, alternating rising and falling cuts through a
          // combo, and a streak of sparks along the strike.
          v.cut = (v.cut + 1) % 4;
          const tilt = atk.heavy ? 0 : [0.35, -0.3, 0.15, -0.4][v.cut];
          const wc = weaponColor(e.attack);
          if (!this.drawnSwing(v, e.attack, wc, tilt)) this.fx.slash(v.rig.root, wc, atk.heavy, tilt, v.cut % 2 === 1);
          trackPoint(track, v.s + Math.cos(v.facing) * 3.5, v.d + Math.sin(v.facing) * 3.5, 4.6, v1);
          this.fx.burst(v1, v.vel, atk.heavy ? 10 : 5, 20, wc, 0.35, 0.22);
        }
        break;
      }
      case 'dash': {
        const v = this.mechs[e.mech];
        trackPoint(track, v.s, v.d, 1.2, v1);
        if (!this.groundRing(v, 11, v.livery.glow)) this.fx.flash(v1, 8, v.livery.glow, 0.2, null, true);
        trackPoint(track, v.s, v.d, 1.2, v1);
        this.fx.burst(v1, v.vel, 14, 30, v.livery.glow, 0.4, 0.3);
        break;
      }
      case 'charge': {
        // A heavy held to charge: a ring in the pilot's colour as it starts,
        // a bigger one and a jolt when it is full.
        const v = this.mechs[e.mech];
        trackPoint(track, v.s, v.d, 4.2, v1);
        this.fx.flash(v1, e.full ? 10 : 5, v.livery.glow, e.full ? 0.3 : 0.2, v.rig.root, true);
        if (e.full) this.fx.burst(v1, v.vel, 14, 26, v.livery.glow, 0.4, 0.3);
        if (e.full && e.mech === local) this.cam.shake(0.15);
        break;
      }
      case 'boost': {
        const v = this.mechs[e.mech];
        trackPoint(track, v.s - 2, v.d, 3.5, v1);
        // (Drawn, the ring is smaller: the painted flames carry the boost.)
        this.fx.flash(v1, look.on ? 5.5 : 9, v.livery.glow, 0.25, v.rig.root, true);
        this.fx.burst(v1, v.vel, 18, 36, v.livery.glow, 0.45, 0.35);
        if (e.mech === local) {
          this.cam.shake(0.2);
          this.cam.lurch(1);
        }
        break;
      }
      case 'arc': {
        // Off on a guard swing: a kick of sparks and a flash in the pilot's colour.
        const v = this.mechs[e.mech];
        trackPoint(track, v.s, v.d, 1.2, v1);
        this.fx.flash(v1, 6, v.livery.glow, 0.18, v.rig.root, true);
        this.fx.burst(v1, v.vel, 18, 32, CARVE_COLORS[1], 0.4, 0.3);
        if (e.mech === local) this.cam.shake(0.12);
        break;
      }
      case 'carve': {
        // A tier reached: a pop of its colour off the skates.
        const v = this.mechs[e.mech];
        const out = race.mechs[e.mech].carveDir > 0 ? 0 : 1;
        v.rig.heels[out].getWorldPosition(v1);
        this.fx.burst(v1, v.vel, 8 + e.tier * 6, 16 + e.tier * 5, CARVE_COLORS[e.tier], 0.4, 0.35);
        if (e.tier >= 3) this.fx.flash(v1, 4, CARVE_COLORS[e.tier], 0.14, v.rig.root, true);
        break;
      }
      case 'carveBurst': {
        // Let go: the charge goes out the back in a flash of its colour.
        const v = this.mechs[e.mech];
        v.burstTier = e.tier;
        trackPoint(track, v.s - 2, v.d, 2.5, v1);
        this.fx.flash(v1, 3.5 + e.tier, CARVE_COLORS[e.tier], 0.2, v.rig.root, true);
        this.fx.burst(v1, v.vel, 10 + e.tier * 8, 26 + e.tier * 6, CARVE_COLORS[e.tier], 0.45, 0.35);
        if (e.mech === local) this.cam.shake(0.08 + e.tier * 0.05);
        break;
      }
      case 'launch': {
        const v = this.mechs[e.mech];
        trackPoint(track, v.s, v.d, 0.6, v1);
        this.fx.burst(v1, v.vel, 26, 34, v.livery.glow, 0.5, 0.5);
        if (!this.groundRing(v, 12, v.livery.glow)) this.fx.flash(v1, 8, 0xffffff, 0.2, null, true);
        // Drawn: the road's dust kicked up behind.
        trackPoint(track, v.s - 1.5, v.d, 1.4, v1);
        v3.copy(v.vel).multiplyScalar(0.2);
        this.fx.drawnSprite('smoke', v1, 6, { row: 0, tint: this.dust, vel: v3, flip: Math.random() < 0.5, depth: true });
        break;
      }
      case 'evade':
      case 'escape': {
        const v = this.mechs[e.mech];
        trackPoint(track, v.s, v.d, 4.2, v1);
        this.fx.flash(v1, e.type === 'escape' ? 12 : 6, v.livery.glow, 0.22, v.rig.root, true);
        break;
      }
      case 'lapPhase':
        this.flash(0.4);
        break;
      case 'airborne': {
        // Off a ramp or a crest: the skates let go in a spit of sparks.
        const v = this.mechs[e.mech];
        trackPoint(track, v.s, v.d, 0.4, v1);
        trackDir(track, v.s, -1, 0, v3);
        this.fx.spray(v1, v.vel, v3, 14, 24, 0xffe2b0, 0.35, 0.35);
        break;
      }
      case 'land': {
        // Touchdown: dust and sparks thrown out sideways, harder for a longer drop.
        const v = this.mechs[e.mech];
        const k = Math.min(1, e.intensity / 40);
        trackPoint(track, v.s, v.d, 0.3, v1);
        for (const side of [-1, 1]) {
          trackDir(track, v.s, 0.2, side, v3);
          this.fx.spray(v1, v.vel, v3, Math.round(6 + k * 20), 18 + k * 20, 0xffd8a0, 0.4, 0.4);
        }
        // Drawn: a puff of the road's dust off each skate, a cloud for a long drop.
        v3.copy(v.vel).multiplyScalar(0.3);
        let dusted = false;
        for (const side of [-1, 1]) {
          trackPoint(track, v.s, v.d + side * 2.4, 1 + k, v4);
          dusted = this.fx.drawnSprite('smoke', v4, 4 + k * 5, { row: k > 0.5 ? 1 : 0, tint: this.dust, vel: v3, flip: side > 0, depth: true, rise: 1.5 });
        }
        if (!dusted) this.fx.puff(v1, v.vel, Math.round(2 + k * 5), this.dust, 2.2 + k * 2, 0.9);
        if (k > 0.3 && !this.groundRing(v, 8 + k * 9, 0xfff2d0)) this.fx.flash(v1, 6 + k * 6, 0xfff2d0, 0.12, null, true);
        if (e.mech === local) {
          this.cam.shake(0.1 + k * 0.5);
          this.onImpact(Math.min(0.8, k * 0.9));
        }
        break;
      }
      case 'fall': {
        // Over the edge: a flash where the mech left the road.
        const v = this.mechs[e.mech];
        trackPoint(track, v.s, v.d, 2 + v.h, v1);
        this.fx.flash(v1, 12, 0xff6ab0, 0.3, null, true);
        this.fx.burst(v1, v.vel, 24, 40, 0xffb0d8, 0.5, 0.5);
        if (e.mech === local) {
          this.cam.shake(0.5);
          this.hurt = 1;
        } else if (e.by === local) {
          this.cam.shake(0.3);
          this.flash(0.2);
        }
        break;
      }
      case 'recover': {
        // Set back down by the recovery drone: a column of light where it lands.
        const v = this.mechs[e.mech];
        const pos = race.mechs[e.mech];
        trackPoint(track, pos.s, pos.d, 6, v1);
        if (!this.fx.drawnSprite('sparkle', v1, 16, { tint: v.livery.glow, gain: 1.4 })) this.fx.flash(v1, 16, v.livery.glow, 0.4, null, true);
        trackPoint(track, pos.s, pos.d, 0.5, v1);
        this.fx.spray(v1, v.vel, v3.set(0, 1, 0), 30, 30, v.livery.glow, 0.5, 0.6);
        this.groundRing(v, 15, v.livery.glow);
        if (e.mech === local) this.flash(0.35);
        break;
      }
      case 'pad': {
        // A speed pad: a magenta kick of light under the skates.
        const v = this.mechs[e.mech];
        trackPoint(track, v.s, v.d, 0.6, v1);
        // Drawn: a sparkle off the skates, riding along.
        trackPoint(track, v.s, v.d, 2.2, v4);
        if (!this.fx.drawnSprite('sparkle', v4, 9, { tint: 0xff3d9a, follow: v.rig.root, gain: 1.35 })) this.fx.flash(v1, 9, 0xff3d9a, 0.22, null, true);
        trackDir(track, v.s, -1, 0, v3);
        this.fx.spray(v1, v.vel, v3, 22, 40, 0xff6ab8, 0.4, 0.35);
        if (e.mech === local) {
          this.cam.shake(0.15);
          this.flash(0.12);
        }
        break;
      }
      case 'gate': {
        const v = this.mechs[e.mech];
        if (e.mech === local) this.trackVis.gates.pulse(e.gate);
        trackPoint(track, v.s, v.d, 4.2, v1);
        if (!this.fx.drawnSprite('sparkle', v1, 12, { tint: COLORS.cell, follow: v.rig.root, gain: 1.4 })) this.fx.flash(v1, 9, COLORS.cell, 0.22, v.rig.root, true);
        this.fx.burst(v1, v.vel, 18, 30, COLORS.cell, 0.4, 0.4);
        if (e.mech === local) this.flash(0.12);
        break;
      }
      case 'ability': {
        const v = this.mechs[e.mech];
        const mine = e.mech === local;
        trackPoint(track, v.s, v.d, 4.2, v1);
        switch (e.ability) {
          case ABILITY.OVERDRIVE:
            this.fx.flash(v1, 16, COLORS.cell, 0.34, v.rig.root, true);
            this.fx.flash(v1, 10, 0xffffff, 0.2, v.rig.root);
            this.fx.burst(v1, v.vel, 44, 46, COLORS.cell, 0.5, 0.5);
            if (mine) {
              this.cam.shake(0.4);
              this.cam.lurch(1.4);
              this.flash(0.3);
              this.onImpact(0.7);
            }
            break;
          case ABILITY.BREAKAWAY:
            v.crackleT = 0.6;
            this.fx.flash(v1, 14, 0xffffff, 0.3, v.rig.root, true);
            this.fx.flash(v1, 20, v.livery.glow, 0.42, null, true);
            this.fx.burst(v1, v.vel, 36, 60, 0xffffff, 0.45, 0.4);
            if (mine) {
              this.cam.shake(0.35);
              this.flash(0.35);
              this.onImpact(0.6);
            }
            break;
          case ABILITY.SNARE:
            v.rig.muzzle.getWorldPosition(v1);
            this.fx.flash(v1, 6, COLORS.snare, 0.14, v.rig.root);
            if (mine) this.cam.shake(0.18);
            break;
          case ABILITY.PULSE:
            this.fx.flash(v1, race.rules.pulseRange * 1.3, 0xb48cff, 0.4, v.rig.root, true);
            this.fx.flash(v1, race.rules.pulseRange * 0.7, 0xffffff, 0.22, v.rig.root, true);
            this.fx.burst(v1, v.vel, 50, 70, 0xb48cff, 0.5, 0.45);
            if (mine || this.mechs[local].pos.distanceTo(v.pos) < race.rules.pulseRange * 1.4) this.cam.shake(0.45);
            break;
          case ABILITY.RAM:
            v.ramAge = 0;
            this.ramProw(v, race.mechs[e.mech], null);
            this.fx.flash(v1, 12, 0xffa030, 0.3, v.rig.root, true);
            this.fx.burst(v1, v.vel, 30, 40, 0xffa030, 0.5, 0.45);
            if (mine) {
              this.cam.shake(0.35);
              this.onImpact(0.7);
            }
            break;
          case ABILITY.AEGIS:
            this.fx.flash(v1, race.rules.aegisRange * 1.1, COLORS.cell, 0.45, v.rig.root, true);
            this.fx.burst(v1, v.vel, 30, 36, COLORS.cell, 0.45, 0.5);
            break;
        }
        break;
      }
      case 'snared': {
        const v = this.mechs[e.mech];
        trackPoint(track, v.s, v.d, 4.2, v1);
        this.fx.flash(v1, 10, COLORS.snare, 0.3, v.rig.root, true);
        this.fx.burst(v1, v.vel, 26, 34, COLORS.snare, 0.45, 0.5);
        if (e.mech === local) {
          this.cam.shake(0.4);
          this.hurt = Math.min(1, this.hurt + 0.4);
          this.onImpact(0.6);
        }
        break;
      }
      default:
        break;
    }
    void ACT;
  }
}

export type { MechState };
