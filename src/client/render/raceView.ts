// Draws one race: places the mechs from simulation state every frame, runs
// their animation and effects, and turns simulation events into spectacle.
import * as THREE from 'three';
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
  type MechState,
  type SimEvent,
} from '../../sim/index';
import type { Session } from '../game/session';
import type { Feel } from '../game/tuning';
import { CameraRig } from './cameraRig';
import { Fx, Trail, makeBubble, makeLockRing, makeShadow, makeShield, makeSnareRing } from './fx';
import { MechAnimator } from './mech/animate';
import { buildFrame } from './mech/frames';
import type { MechRig } from './mech/rig';
import { COLORS, LIVERIES, SUN_DIR, type Livery } from './palette';
import type { Renderer } from './renderer';
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
  facing: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  smokeT: number;
  sparkT: number;
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
}

const m4 = new THREE.Matrix4();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const ndc = new THREE.Vector3();
const shadowScale = new THREE.Matrix4();
const GOLD = new THREE.Color(COLORS.cell);
const AMBER = new THREE.Color(0xffa030);
const WHITE = new THREE.Color(0xffffff);
const tint = new THREE.Color();
/** Speed the effects treat as "flat out": a forward's top speed on the speed lap. */
const FULL_SPEED = 160;

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class RaceView {
  readonly group = new THREE.Group();
  readonly cam: CameraRig;
  readonly fx = new Fx();
  readonly plates: Plate[] = [];
  /** The mech the camera follows. */
  focusId: number;
  /** Screen shake and hit-stop requests for the game to forward. */
  onImpact: (strength: number) => void = () => {};
  private mechs: MechVisual[] = [];
  private ring = makeLockRing();
  private time = 0;
  private flashUniform = 0;
  private hurt = 0;
  private fxFov = 0;

  constructor(
    private renderer: Renderer,
    private session: Session,
    private trackVis: TrackVisual,
    private feel: Feel,
  ) {
    const race = session.race;
    this.focusId = session.localId >= 0 ? session.localId : 0;
    this.cam = new CameraRig(renderer.camera, session.track, feel);
    for (const m of race.mechs) {
      const livery = LIVERIES[m.team];
      const rig = buildFrame(m.role, livery, String(m.role + 1));
      rig.root.matrixAutoUpdate = false;
      const shield = makeShield(livery.glow);
      const bubble = makeBubble(COLORS.cell, CLASSES[m.role].radius * 1.5 + 2.4);
      rig.root.add(shield, bubble);
      const snare = makeSnareRing(COLORS.snare);
      const trails = [new Trail(livery.glow), new Trail(livery.glow)];
      const shadow = makeShadow();
      this.group.add(rig.root, shadow, snare, trails[0].mesh, trails[1].mesh);
      this.mechs.push({
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
        facing: m.facing,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        smokeT: 0,
        sparkT: 0,
      });
      this.plates.push({ id: m.id, x: 0, y: 0, cx: 0, cy: 0, dist: 0, visible: false });
    }
    this.group.add(this.ring, this.fx.group);
    renderer.scene.add(this.group);
    this.resize();
  }

  resize(): void {
    this.fxFov = this.renderer.camera.fov;
    this.fx.resize(this.renderer.canvas.clientHeight || window.innerHeight, this.fxFov);
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
    for (const v of this.mechs) {
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

    // ---- place and animate every mech
    for (const m of race.mechs) {
      const v = this.mechs[m.id];
      v.s = this.session.prevS[m.id] + (m.s - this.session.prevS[m.id]) * alpha;
      v.d = this.session.prevD[m.id] + (m.d - this.session.prevD[m.id]) * alpha;
      v.facing = lerpAngle(this.session.prevFacing[m.id], m.facing, alpha);
      trackMatrix(track, v.s, v.d, 0, v.facing, m4);
      v.rig.root.matrix.copy(m4);
      v.rig.root.matrixWorldNeedsUpdate = true;
      v.anim.update(dt, m, alpha);
      v.rig.root.updateMatrixWorld(true);
      trackPoint(track, v.s, v.d, 4.2, v.pos);
      trackDir(track, v.s, m.vs, m.vd, v.vel).multiplyScalar(Math.hypot(m.vs, m.vd));

      // Shadow: a soft blob stretched away from the low sun.
      const sh = worldDirToTrackAngle(track, v.s, -SUN_DIR.x, -SUN_DIR.z);
      trackMatrix(track, v.s + Math.cos(sh) * 2.2, v.d + Math.sin(sh) * 2.2, 0.05, sh, m4);
      const r = CLASSES[m.role].radius;
      shadowScale.makeScale(r * 2.6, 1, r * 4.4);
      v.shadow.matrix.multiplyMatrices(m4, shadowScale);
      v.shadow.matrixWorldNeedsUpdate = true;

      // Light trails off the heels: team colour, gold in Overdrive, amber in a Ram.
      const battle = m.mode === MODE.BATTLE;
      const surge = m.overdriveT > 0 && !m.retired;
      const ramming = m.ramT > 0 && !m.retired;
      let glow = Math.min(1, Math.max(0, (m.speed - 25) / 70)) * (battle ? 0.7 : 0.9);
      if (m.boosting) glow = 1.7;
      if (surge) glow = 2.4;
      if (m.retired) glow = 0;
      v.trailColor.lerp(surge ? GOLD : ramming ? AMBER : v.glow, 1 - Math.exp(-10 * dt));
      trackDir(track, v.s, 0, 1, v2);
      for (let i = 0; i < 2; i++) {
        v.rig.heels[i].getWorldPosition(v1);
        v.trails[i].setColor(v.trailColor);
        v.trails[i].update(v1, v2, glow * 0.8 * this.feel.trails, surge ? 0.5 : m.boosting ? 0.34 : 0.2);
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
        if (m.snareT > 0 && !m.retired) {
          trackPoint(track, v.s, v.d, 3 + Math.random() * 3, v1);
          this.fx.burst(v1, v.vel, 1, 10, COLORS.snare, 0.3, 0.3);
        }
      }
      if (m.retired || m.hp < CLASSES[m.role].maxHp * 0.25) {
        v.smokeT -= dt;
        if (v.smokeT <= 0) {
          v.smokeT = m.retired ? 0.07 : 0.16;
          trackPoint(track, v.s, v.d, 5, v1);
          this.fx.puff(v1, v.vel, 1, m.retired ? 0x2b2b33 : 0x55555f, m.retired ? 2.6 : 1.6, m.retired ? 1.5 : 0.9);
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

    // ---- tracers
    this.fx.beginTracers();
    for (const p of race.projectiles) {
      const back = DT * (1 - alpha);
      const ps = p.s - p.vs * back;
      const pd = p.d - p.vd * back;
      const ang = Math.atan2(p.vd - focus.vd, p.vs - focus.vs);
      trackMatrix(track, ps, pd, 4.3, ang, m4);
      const snareBolt = p.attack === ATK.MF_SNARE;
      this.fx.tracer(m4, snareBolt ? 9 : ATTACKS[p.attack].shot!.pellets > 1 ? 2.2 : 4.2, snareBolt ? COLORS.snare : LIVERIES[p.team].glow);
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

    // ---- Cell gates: lit while the mech being followed can still score them
    const gates = this.trackVis.gates;
    const open = race.phase !== PHASE.FINISHED && focus.lap < race.rules.gateLaps && !focus.retired;
    for (let i = 0; i < track.gates.length; i++) {
      const taken = (focus.gateMask & (1 << i)) !== 0;
      gates.setLit(i, open && !taken ? (focus.cells < race.rules.cellMax ? 1 : 0.35) : 0);
    }

    // ---- camera
    const fv = this.mechs[this.focusId];
    const tgt = focus.target >= 0 ? this.mechs[focus.target] : null;
    this.cam.update(dt, { s: fv.s, d: fv.d, mech: focus, target: tgt ? { s: tgt.s, d: tgt.d } : null }, panX, panY, lookBack);
    // Sparks are sized in pixels from the field of view, which now swings with speed.
    if (Math.abs(this.renderer.camera.fov - this.fxFov) > 1.5) this.resize();
    this.fx.update(dt, this.renderer.camera);

    // A mech right on top of the lens would fill the frame: drop it for a moment.
    for (const m of race.mechs) {
      const v = this.mechs[m.id];
      v.rig.root.visible = m.id === this.focusId || v.pos.distanceToSquared(this.renderer.camera.position) > 7.5 * 7.5;
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
    tint.copy(surging ? GOLD : WHITE);
    (u.uTint.value as THREE.Vector3).set(tint.r, tint.g, tint.b);
    this.renderer.setBloom(F.bloom);
    this.flashUniform = Math.max(0, this.flashUniform - dt * 4.5);
    this.hurt = Math.max(0, this.hurt - dt * 1.8);
    u.uFlash.value = this.flashUniform * 0.55;
    const critical = focus.hp < CLASSES[focus.role].maxHp * 0.25 && !focus.retired ? 0.35 + Math.sin(this.time * 6) * 0.15 : 0;
    u.uHurt.value = Math.max(this.hurt, critical);

    // ---- screen positions for the HUD
    const cam = this.renderer.camera;
    const w = this.renderer.canvas.clientWidth || window.innerWidth;
    const h = this.renderer.canvas.clientHeight || window.innerHeight;
    for (const m of race.mechs) {
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
    }
  }

  /** React to something the simulation reported. */
  handleEvent(e: SimEvent): void {
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
        if (e.blocked) {
          v.shieldFlash = 1;
          this.fx.burst(v1, v.vel, 8, 26, v.livery.glow, 0.4, 0.3);
          this.fx.flash(v1, 4.5, v.livery.glow, 0.14, v.rig.root, true);
        } else {
          const melee = atk.kind === 'melee';
          this.fx.burst(v1, v.vel, melee ? (big ? 34 : 16) : 6, big ? 52 : 34, melee ? 0xffb040 : a.livery.glow, melee ? 0.55 : 0.4, 0.45);
          this.fx.flash(v1, big ? 8.5 : melee ? 5.5 : 3.2, melee ? 0xfff2c8 : a.livery.glow, big ? 0.2 : 0.12, v.rig.root);
          if (big) this.fx.flash(v1, 7, 0xffffff, 0.28, v.rig.root, true);
        }
        if (e.victim === local) {
          this.cam.shake(e.blocked ? 0.18 : big ? 0.62 : atk.kind === 'melee' ? 0.38 : 0.16);
          if (!e.blocked) this.hurt = Math.min(1, this.hurt + (big ? 0.7 : 0.35));
          this.onImpact(e.blocked ? 0.2 : big ? 1 : 0.5);
        } else if (e.attacker === local) {
          this.cam.shake(big ? 0.4 : atk.kind === 'melee' ? 0.2 : 0.04);
          if (atk.kind === 'melee') this.onImpact(big ? 0.8 : 0.35);
        }
        break;
      }
      case 'parry': {
        const v = this.mechs[e.mech];
        v.shieldFlash = 1.6;
        trackPoint(track, v.s, v.d, 4.4, v1);
        this.fx.flash(v1, 12, 0xffffff, 0.28, v.rig.root, true);
        this.fx.flash(v1, 9, v.livery.glow, 0.2, v.rig.root);
        this.fx.burst(v1, v.vel, 30, 60, 0xffffff, 0.5, 0.4);
        if (e.mech === local || e.attacker === local) {
          this.cam.shake(0.45);
          this.flash(0.35);
          this.onImpact(0.9);
        }
        break;
      }
      case 'guardBreak': {
        const v = this.mechs[e.mech];
        trackPoint(track, v.s, v.d, 4.4, v1);
        this.fx.flash(v1, 13, 0xff5a3c, 0.3, v.rig.root, true);
        this.fx.burst(v1, v.vel, 40, 55, v.livery.glow, 0.6, 0.55);
        if (e.mech === local || e.by === local) {
          this.cam.shake(0.7);
          this.onImpact(1);
        }
        break;
      }
      case 'splat': {
        const v = this.mechs[e.mech];
        const side = race.mechs[e.mech].d > 0 ? 1 : -1;
        trackPoint(track, v.s, v.d + side * 3, 3.5, v1);
        this.fx.flash(v1, 10, 0xffd9a0, 0.24);
        this.fx.burst(v1, v.vel, 36, 50, 0xffb040, 0.55, 0.5);
        if (e.mech === local) {
          this.cam.shake(0.7);
          this.hurt = 1;
          this.onImpact(1);
        }
        break;
      }
      case 'ko': {
        const v = this.mechs[e.mech];
        trackPoint(track, v.s, v.d, 4.5, v1);
        this.fx.flash(v1, 26, 0xffffff, 0.45, v.rig.root);
        this.fx.flash(v1, 20, 0xff8a30, 0.6, v.rig.root, true);
        this.fx.burst(v1, v.vel, 90, 80, 0xffa040, 0.8, 0.9);
        this.fx.puff(v1, v.vel, 12, 0x2b2b33, 3.5, 1.8);
        const near = this.mechs[local].pos.distanceTo(v.pos) < 140;
        if (near) {
          this.cam.shake(e.mech === local ? 1 : 0.6);
          this.flash(e.mech === local ? 1 : 0.5);
          this.onImpact(1);
        }
        break;
      }
      case 'wall': {
        const v = this.mechs[e.mech];
        const side = race.mechs[e.mech].d > 0 ? 1 : -1;
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
        v.rig.muzzle.getWorldPosition(v1);
        this.fx.flash(v1, ATTACKS[e.attack].shot!.pellets > 1 ? 2.6 : 3.4, v.livery.glow, 0.07, v.rig.root);
        if (e.mech === local) this.cam.shake(ATTACKS[e.attack].shot!.pellets > 1 ? 0.07 : 0.1);
        break;
      }
      case 'swing': {
        const v = this.mechs[e.mech];
        const atk = ATTACKS[e.attack];
        if (atk.kind === 'melee') {
          // A streak of sparks along the strike.
          trackPoint(track, v.s + Math.cos(v.facing) * 3.5, v.d + Math.sin(v.facing) * 3.5, 4.6, v1);
          this.fx.burst(v1, v.vel, atk.heavy ? 10 : 5, 20, v.livery.glow, 0.35, 0.22);
        }
        break;
      }
      case 'dash': {
        const v = this.mechs[e.mech];
        trackPoint(track, v.s, v.d, 1.2, v1);
        this.fx.flash(v1, 8, v.livery.glow, 0.2, null, true);
        this.fx.burst(v1, v.vel, 14, 30, v.livery.glow, 0.4, 0.3);
        break;
      }
      case 'boost': {
        const v = this.mechs[e.mech];
        trackPoint(track, v.s - 2, v.d, 3.5, v1);
        this.fx.flash(v1, 9, v.livery.glow, 0.25, v.rig.root, true);
        this.fx.burst(v1, v.vel, 18, 36, v.livery.glow, 0.45, 0.35);
        if (e.mech === local) this.cam.shake(0.2);
        break;
      }
      case 'launch': {
        const v = this.mechs[e.mech];
        trackPoint(track, v.s, v.d, 0.6, v1);
        this.fx.burst(v1, v.vel, 26, 34, v.livery.glow, 0.5, 0.5);
        this.fx.flash(v1, 8, 0xffffff, 0.2, null, true);
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
      case 'gate': {
        const v = this.mechs[e.mech];
        if (e.mech === local) this.trackVis.gates.pulse(e.gate);
        trackPoint(track, v.s, v.d, 4.2, v1);
        this.fx.flash(v1, 9, COLORS.cell, 0.22, v.rig.root, true);
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
              this.flash(0.3);
              this.onImpact(0.7);
            }
            break;
          case ABILITY.BREAKAWAY:
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
