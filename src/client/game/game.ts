// The game shell: owns the renderer, the current session and view, the HUD,
// menus, input and audio, and moves between title, garage, race and results.
import * as THREE from 'three';
import {
  ABILITY,
  ATK,
  ATTACKS,
  BTN,
  CLASSES,
  MODE,
  PHASE,
  ROLE,
  TICK_RATE,
  buildTrack,
  createMatch,
  deltaS,
  recordRound,
  trackById,
  TRACKS,
  type MatchState,
  type RaceState,
  type Role,
  type SeatConfig,
  type SimEvent,
} from '../../sim/index';
import { NullAudio, type AudioEngine, type AudioScene, type SfxName } from '../audio/audio';
import { Input } from '../input/input';
import { RaceView } from '../render/raceView';
import { Renderer } from '../render/renderer';
import { buildTrackVisual, type TrackVisual } from '../render/trackMesh';
import { buildWorld, type World } from '../render/world';
import { disposeTree, themeFor } from '../render/themes';
import { CEL, celify, drawClock, look, readLook, setCelTheme, tickDrawings } from '../render/look';
import { setPaintedMarkings } from '../render/mech/decals';
import { setHullOutlines } from '../render/mech/kit';
import { DRAWN_FLAMES } from '../render/mech/parts';
import { LIVERIES } from '../render/palette';
import { Eyecatch } from '../ui/eyecatch';
import { Hud } from '../ui/hud';
import { MATCH_OPTIONS, Menus, type GarageChoice } from '../ui/menus';
import { TuningPanel } from '../ui/tuningPanel';
import { inKnockout } from './moments';
import { LocalSession } from './session';
import { TUNE_GROUPS, Tuning } from './tuning';

type State = 'title' | 'garage' | 'race' | 'paused' | 'results';

const NAMES = [
  ['Kite', 'Lark', 'Atlas'],
  ['Shrike', 'Moth', 'Golem'],
];
const RIVAL_SKILL = [0.28, 0.55, 0.82];

export interface GameOptions {
  /** Start a race at once in this role (dev shortcut). */
  auto?: Role;
  /** Let the computer fly the player's seat (demo / testing). */
  demo?: boolean;
  /** Skip ahead this many seconds before showing the race. */
  skip?: number;
  seed?: number;
  team?: number;
  rivals?: number;
  /** Match format, an index into MATCH_OPTIONS. */
  match?: number;
  /** Open the tuning panel at once. */
  tune?: boolean;
  /** Circuit id to race on (see TRACKS). */
  track?: string;
  audio?: AudioEngine;
}

const ABILITY_SFX: SfxName[] = ['overdrive', 'breakaway', 'snare_shot', 'pulse', 'ram', 'aegis'];
/**
 * Semitones to move the race stingers by on each circuit so they land in the
 * key its music is in (they are written for Meridian's A minor, B minor and
 * D major): the lap chime, the battle-lap stab, the speed-lap fanfare and the flag.
 */
const STINGER_KEY: Record<string, Partial<Record<SfxName, number>>> = {
  meridian: {},
  canyon: { lap: 1, lap_phase: -5, final_lap: -6, finish: -1 },
  helios: { lap_phase: 2, final_lap: 5, finish: 2 },
};
/** Semitones above the gate chime's home note for each gate banked: steps of A minor. */
const GATE_STEPS = [0, 2, 3, 5, 7];
/** The carve chime climbs with the tier: root, a fourth, then the octave. */
const CARVE_TIER_PITCH = [1, 2 ** (5 / 12), 2];

export class Game {
  readonly renderer: Renderer;
  readonly input = new Input();
  readonly hud: Hud;
  readonly menus: Menus;
  readonly tuning = new Tuning();
  readonly panel: TuningPanel;
  audio: AudioEngine;
  private trackVis!: TrackVisual;
  private world!: World;
  /** Id of the circuit whose scenery is built. */
  private trackId = '';
  private session!: LocalSession;
  private view!: RaceView;
  private state: State = 'title';
  private choice: GarageChoice = { role: ROLE.FW, team: 0, rivals: 1, match: 1, track: 'meridian' };
  /** The match being played: one or more rounds between the same two teams. */
  private match: MatchState | null = null;
  private roundScored = false;
  private rumbleT = 0;
  private time = 0;
  private last = performance.now();
  private attractTimer = 0;
  private resultsAt = -1;
  private prevButtons = 0;
  private lastShotKey = '';
  private slowmo = 0;
  /** The eyecatch before the results: on screen in the anime look, once a round. */
  private eyecatch: Eyecatch;
  private eyecaught = false;
  /** A ?look= on the URL: the look for this visit, not remembered (until G or the menu switches it). */
  private lookParam: number | null = null;
  /** Time for the scenery's own motion, which stops while a painted still is up. */
  private worldTime = 0;
  private ownLock = -1;
  private ownLockAt = 0;
  private scene: AudioScene = { racing: false, speed: 0, throttle: 0, boosting: false, battle: false, lapPhase: 1, onStrip: false, drafting: false, scraping: false, critical: false };

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement, private opts: GameOptions = {}) {
    this.audio = opts.audio ?? new NullAudio();
    this.renderer = new Renderer(canvas);
    if (opts.track && trackById(opts.track)) this.choice.track = opts.track;
    // The circuit and its surroundings are built when it is chosen and
    // shared by every race on it.
    this.useTrack(this.choice.track);
    this.hud = new Hud(uiRoot);
    this.eyecatch = new Eyecatch(uiRoot);
    this.hud.onRadio = () => this.audio.play('comms', { volume: 0.7 });
    this.hud.onCritical = () => this.audio.play('critical');
    this.menus = new Menus(uiRoot, {
      onStart: (c) => this.startMatch(c),
      onPreview: (c) => this.showGarage(c),
      onResume: () => this.resume(),
      // Once a round has been banked, "restart" can only mean moving on.
      onRestart: () => (this.roundScored ? this.next() : this.startRound()),
      onNext: () => this.next(),
      onTuning: () => this.panel.show(),
      onToggleLook: () => this.toggleLook(),
      lookOn: () => look.on,
      onQuit: () => this.showTitle(),
      onGarage: () => {
        this.menus.show('garage');
      },
      onSound: (n) => this.audio.play(n),
    });
    this.panel = new TuningPanel(uiRoot, this.tuning, {
      onClose: () => {},
      onSound: (n) => this.audio.play(n),
    });
    // A rule changed on the panel reaches the race in progress as well as the next one.
    this.tuning.onChange = (kind) => {
      if (kind !== 'feel' && this.session) Object.assign(this.session.race.rules, this.tuning.rules);
      this.input.rumbleScale = this.tuning.feel.rumble;
      if (kind !== 'rule') this.applySound();
    };
    this.input.rumbleScale = this.tuning.feel.rumble;
    this.applySound();
    this.input.onDeviceChange = (d) => {
      this.hud.setDevice(d);
      this.menus.setDevice(d);
    };
    this.input.onFirstGesture = () => this.audio.unlock();
    window.addEventListener('resize', () => this.view?.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'race') this.pause();
    });
    if (opts.team !== undefined) this.choice.team = opts.team;
    if (opts.rivals !== undefined) this.choice.rivals = opts.rivals;
    if (opts.match !== undefined && MATCH_OPTIONS[opts.match]) this.choice.match = opts.match;
    else if (opts.auto !== undefined) this.choice.match = 0;
    if (opts.auto !== undefined) this.choice.role = opts.auto;
    this.menus.choice = { ...this.choice };
    if (opts.auto !== undefined) {
      this.startMatch(this.choice);
    } else {
      this.showTitle();
    }
    if (opts.tune) this.panel.show();
    // ?look=plain or ?look=anime picks the look for this visit without remembering it.
    const lk = new URLSearchParams(location.search).get('look');
    if (lk === 'plain' || lk === 'anime') this.lookParam = lk === 'anime' ? 1 : 0;
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---- sessions -----------------------------------------------------------

  private seats(choice: GarageChoice | null): { seats: SeatConfig[]; localId: number } {
    const seats: SeatConfig[] = [];
    let localId = -1;
    for (const role of [ROLE.FW, ROLE.MF, ROLE.DF]) {
      for (let team = 0; team < 2; team++) {
        const human = choice !== null && choice.team === team && choice.role === role;
        if (human) localId = seats.length;
        const rival = choice !== null && team !== choice.team;
        seats.push({ team, role, human, name: NAMES[team][role], skill: rival ? RIVAL_SKILL[choice.rivals] : 0.6 });
      }
    }
    return { seats, localId };
  }

  private setSession(choice: GarageChoice | null, seed: number, gridFlip = false): void {
    this.view?.dispose();
    const { seats, localId } = this.seats(choice);
    this.useTrack(choice?.track ?? this.trackId);
    this.session = new LocalSession(trackById(this.trackId) ?? TRACKS[0], { seed, seats, rules: { ...this.tuning.rules }, gridFlip }, localId);
    this.view = new RaceView(this.renderer, this.session, this.trackVis, this.tuning.feel);
    // The mechs (and anything else the view made) take the cel shading too.
    celify(this.renderer.scene);
    this.view.onImpact = (strength) => {
      this.input.rumble(strength, 90 + strength * 160);
      // Hit-stop: a beat's pause on every blow you land or take, longer for the big ones.
      if (strength >= 0.8) this.session.freeze(0.075);
      else if (strength >= 0.35) this.session.freeze(0.035);
    };
    // A heavy blow winding up at the mech you are flying: warn by ear as well as by eye.
    this.view.onTell = (kind, mech, atFocus) => {
      if (this.state !== 'race' || !atFocus || this.view.focusId !== this.session.localId) return;
      const h = this.heard(mech);
      this.audio.play(kind === 'parry' ? 'tell' : 'tell_dodge', { volume: 0.9, pan: h.pan });
    };
    this.resultsAt = -1;
    this.slowmo = 0;
    this.eyecaught = false;
    this.eyecatch?.hide();
    this.renderer.clearMoments();
    this.ownLock = -1;
    this.ownLockAt = 0;
    this.session.timeScale = 1;
  }

  /** Build the circuit and its scenery, replacing the last one's. */
  private useTrack(id: string): void {
    const def = trackById(id) ?? TRACKS[0];
    if (def.id === this.trackId) return;
    this.trackId = def.id;
    const scene = this.renderer.scene;
    if (this.trackVis) {
      scene.remove(this.trackVis.group, this.world.group);
      disposeTree(this.trackVis.group);
      disposeTree(this.world.group);
    }
    const track = buildTrack(def);
    const theme = themeFor(def.theme);
    this.trackVis = buildTrackVisual(track, theme);
    this.world = buildWorld(track, theme);
    this.renderer.setTheme(theme);
    setCelTheme(theme);
    celify(this.trackVis.group);
    celify(this.world.group);
    scene.add(this.trackVis.group, this.world.group);
  }

  private showTitle(): void {
    this.state = 'title';
    this.hud.hide();
    this.menus.show('title');
    this.audio.setMusic('menu');
    this.startAttract();
  }

  /** A race between computer pilots running behind the title screen. */
  private startAttract(): void {
    this.setSession(null, (Math.random() * 1e9) | 0);
    this.session.fastForward(88 + Math.random() * 24);
    this.view.focusId = (Math.random() * 6) | 0;
    this.view.cam.mode = 'play';
    this.attractTimer = 0;
  }

  private showGarage(choice: GarageChoice): void {
    this.choice = choice;
    this.state = 'garage';
    this.hud.hide();
    // The grid, stationary, with your mech in front of the camera.
    this.setSession(choice, 1);
    this.view.cam.mode = 'orbit';
    this.view.cam.reset();
  }

  /**
   * Switch the 80s anime look on or off (remembered like any tuning value,
   * and it replaces a ?look= on the URL). Returns whether it is now on.
   */
  private toggleLook(): boolean {
    const on = !look.on;
    this.lookParam = null;
    const item = TUNE_GROUPS.flatMap((g) => g.items).find((i) => i.key === 'look');
    if (item) this.tuning.set(item, on ? 1 : 0);
    look.on = on;
    this.hud.showNotice(on ? 'Look: 80s anime' : 'Look: plain', false, 1.2);
    this.menus.refreshLook();
    return on;
  }

  /** Volumes and the layer mix from the tuning panel's Sound tab. */
  private applySound(): void {
    const f = this.tuning.feel;
    this.audio.setVolumes(f.volMaster, f.volMusic, f.volEffects);
    this.audio.setLayerMix({
      engine: f.mixEngine,
      wind: f.mixWind,
      afterburner: f.mixAfterburner,
      strip: f.mixStrip,
      slipstream: f.mixSlipstream,
      scrape: f.mixScrape,
      alarm: f.mixAlarm,
    });
  }

  /** From the results (or a restart after the flag): the next round, or a fresh match if this one is decided. */
  private next(): void {
    if (this.match && this.match.winner < 0) this.startRound();
    else this.startMatch(this.choice);
  }

  /** A new match in the format picked in the garage, starting with round one. */
  private startMatch(choice: GarageChoice): void {
    this.choice = choice;
    this.match = createMatch((MATCH_OPTIONS[choice.match] ?? MATCH_OPTIONS[0]).cfg);
    this.startRound();
  }

  /** What the HUD shows under the score: the format, the round, and how the match stands. */
  private matchLabel(): string {
    const m = this.match;
    if (!m || (m.cfg.mode === 'series' && m.cfg.bestOf === 1)) return '';
    const a = LIVERIES[0].name.replace('Team ', '');
    const b = LIVERIES[1].name.replace('Team ', '');
    const round = `Round ${m.rounds.length + 1}`;
    if (m.cfg.mode === 'series') return `Best of ${m.cfg.bestOf} · ${round} · ${a} ${m.wins[0]}–${m.wins[1]} ${b}`;
    return `First to ${m.cfg.target} · ${round} · ${a} ${m.totals[0]}–${m.totals[1]} ${b}`;
  }

  /** Start (or restart) the next unscored round of the match. */
  private startRound(): void {
    const choice = this.choice;
    if (!this.match) this.match = createMatch(MATCH_OPTIONS[choice.match]?.cfg);
    this.roundScored = false;
    this.state = 'race';
    this.menus.show(null);
    this.input.swallowHeld();
    // The teams swap sides of the grid from one round to the next.
    const round = this.match.rounds.length;
    this.setSession(choice, this.opts.seed !== undefined ? this.opts.seed + round : (Math.random() * 1e9) | 0, round % 2 === 1);
    if (this.opts.demo) this.session.race.mechs[this.session.localId].human = false;
    if (this.opts.skip) this.session.fastForward(this.opts.skip);
    this.hud.begin(this.session.race, this.session.track, this.session.localId);
    this.hud.setMatch(this.matchLabel());
    this.hud.setDevice(this.input.device);
    this.view.cam.reset();
    this.view.cam.mode = this.session.race.phase === PHASE.COUNTDOWN ? 'intro' : 'play';
    this.audio.setMusic('race', this.session.track.def.theme ?? 'meridian');
  }

  private pause(): void {
    if (this.state !== 'race') return;
    this.state = 'paused';
    this.menus.show('pause');
    this.audio.play('ui_select');
  }

  private resume(): void {
    this.state = 'race';
    this.menus.show(null);
    // The button that chose "Resume" must not also fire a boost, a dash or an ability.
    this.input.swallowHeld();
  }

  // ---- events -------------------------------------------------------------

  /** Volume and stereo position of something happening at mech `id`. */
  private heard(id: number): { volume: number; pan: number } {
    const race = this.session.race;
    const f = race.mechs[this.view.focusId];
    const m = race.mechs[id];
    const ds = deltaS(this.session.track, m.s, f.s);
    const dd = m.d - f.d;
    const dist = Math.hypot(ds, dd);
    return { volume: id === this.view.focusId ? 1 : Math.max(0, 1 - dist / 240) ** 1.5, pan: Math.max(-1, Math.min(1, dd / 26)) };
  }

  private onEvent(e: SimEvent): void {
    const race = this.session.race;
    const local = this.session.localId;
    const inRace = this.state === 'race';
    this.view.handleEvent(e);
    if (inRace) this.hud.onEvent(e, race);
    const quiet = inRace ? 1 : 0.25;
    const A = this.audio;
    switch (e.type) {
      case 'countdown':
        if (inRace) A.play(e.n > 0 ? 'count_beep' : 'count_go');
        if (e.n === 0) this.view.cam.mode = this.state === 'garage' ? 'orbit' : 'play';
        break;
      case 'launch':
        if (e.mech === local && inRace) A.play('launch');
        break;
      case 'lapPhase':
        if (inRace) this.sting(e.lap >= 3 ? 'final_lap' : 'lap_phase');
        break;
      case 'lap':
        if (e.mech === local && inRace) this.sting('lap');
        break;
      case 'finish':
        if (e.mech === local && inRace) this.sting('finish');
        break;
      case 'airborne': {
        const h = this.heard(e.mech);
        if (h.volume > 0.05) A.play('takeoff', { volume: h.volume * 0.8 * quiet, pan: h.pan });
        break;
      }
      case 'land': {
        const h = this.heard(e.mech);
        const v = h.volume * Math.min(1, 0.35 + e.intensity * 0.02) * quiet;
        if (v > 0.03) A.play('land', { volume: v, pan: h.pan });
        if (e.mech === this.view.focusId && e.intensity > 12) this.input.rumble(Math.min(1, e.intensity * 0.02), 140);
        break;
      }
      case 'fall': {
        const h = this.heard(e.mech);
        const v = Math.max(e.mech === local || e.by === local ? 0.7 : 0, h.volume) * quiet;
        if (v > 0.03) A.play('fall', { volume: v, pan: h.pan });
        if (inRace && e.by === local) this.slowmo = 0.6;
        break;
      }
      case 'recover': {
        const h = this.heard(e.mech);
        const v = Math.max(e.mech === local ? 0.8 : 0, h.volume) * quiet;
        if (v > 0.05) A.play('recover', { volume: v, pan: h.pan });
        break;
      }
      case 'pad': {
        const h = this.heard(e.mech);
        if (h.volume > 0.05) A.play('pad', { volume: h.volume * (e.mech === local ? 1 : 0.5) * quiet, pan: h.pan });
        break;
      }
      case 'swing': {
        const h = this.heard(e.mech);
        if (h.volume > 0.02) A.play(ATTACKS[e.attack].heavy ? 'swing_heavy' : 'swing_light', { volume: h.volume * 0.8 * quiet, pan: h.pan });
        break;
      }
      case 'shot': {
        // A scatter blast raises one event per pellet; play it once. The Snare has its own sound.
        const key = `${race.tick}:${e.mech}`;
        if (e.attack !== ATK.MF_SNARE && key !== this.lastShotKey) {
          this.lastShotKey = key;
          const h = this.heard(e.mech);
          if (h.volume > 0.02) A.play(ATTACKS[e.attack].shot!.pellets > 1 ? 'shot_scatter' : 'shot_carbine', { volume: h.volume * quiet, pan: h.pan });
        }
        break;
      }
      case 'charge': {
        // A heavy held to charge: a rising note as it starts, the charged chord when it is full.
        const h = this.heard(e.mech);
        if (h.volume > 0.02) A.play(e.full ? 'momentum' : 'tell', { volume: h.volume * (e.full ? 1 : 0.6) * quiet, pan: h.pan, pitch: e.full ? 1 : 1.5 });
        break;
      }
      case 'windup':
        if (e.charged) {
          const h = this.heard(e.mech);
          if (h.volume > 0.02) A.play('momentum', { volume: h.volume * quiet, pan: h.pan });
        }
        break;
      case 'hit': {
        const h = this.heard(e.victim);
        if (h.volume > 0.02) {
          const melee = ATTACKS[e.attack].kind === 'melee';
          const name = e.blocked ? 'block' : e.charged ? 'momentum_hit' : melee ? (e.heavy ? 'hit_heavy' : 'hit_light') : 'bullet_hit';
          A.play(name, { volume: h.volume * (melee ? 1 : 0.6) * quiet, pan: h.pan });
        }
        break;
      }
      case 'parry':
        A.play('parry', { volume: this.heard(e.mech).volume * quiet });
        break;
      case 'guardBreak':
        A.play('guard_break', { volume: this.heard(e.mech).volume * quiet });
        break;
      case 'splat': {
        const h = this.heard(e.mech);
        A.play('ringout', { volume: Math.max(e.by === local ? 0.5 : 0, h.volume) * quiet, pan: h.pan });
        break;
      }
      case 'ko': {
        const h = this.heard(e.mech);
        A.play('ko', { volume: Math.max(0.35, h.volume) * quiet, pan: h.pan });
        // Slow motion for any knockout the player had a hand in. In the anime
        // look the moment is cut first: an impact frame, then the frame held
        // as a painted still while the clock stops, then the slow motion.
        if (inRace && inKnockout(race, e.mech, e.by, local, this.ownLock)) {
          this.slowmo = 0.9;
          if (look.on && look.still) {
            const hold = 0.7;
            this.renderer.impactFrame(0.11, true);
            this.renderer.paintedStill(hold);
            this.view.fx.skipExplosionsTo(2);
            this.session.freeze(hold + 0.11);
            this.slowmo += hold + 0.11;
          }
        }
        // Lost the mech we were riding with: move the camera to a teammate.
        if (e.mech === this.view.focusId) {
          const session = this.session;
          window.setTimeout(() => {
            if (this.session === session) this.cycleFocus();
          }, 2200);
        }
        break;
      }
      case 'wall': {
        const h = this.heard(e.mech);
        A.play('wall', { volume: h.volume * Math.min(1, 0.3 + e.intensity * 0.04) * quiet, pan: h.pan });
        break;
      }
      case 'bump': {
        const h = this.heard(e.a);
        A.play('bump', { volume: h.volume * Math.min(1, e.intensity * 0.05) * quiet, pan: h.pan });
        break;
      }
      case 'dash':
        A.play('dash', { volume: this.heard(e.mech).volume * 0.8 * quiet });
        break;
      case 'boost':
        A.play('boost', { volume: this.heard(e.mech).volume * quiet });
        break;
      case 'award':
        // Your own support points chime, a step higher for a 2.
        if (e.mech === local && inRace) A.play('award', { pitch: e.points >= 2 ? 2 ** (4 / 12) : 1 });
        break;
      case 'arc': {
        // A guard swing: the dash's whoosh and the skates' edges biting.
        const h = this.heard(e.mech);
        A.play('dash', { volume: h.volume * 0.8 * quiet, pitch: 0.85 });
        A.play('carve_burst', { volume: h.volume * 0.45 * quiet, pan: h.pan, pitch: 1.15 });
        if (e.mech === local && inRace) this.input.rumble(0.3, 110);
        break;
      }
      case 'carve':
        // Only your own carve chimes: a field of them would be a wind chime.
        if (e.mech === this.view.focusId && inRace) {
          A.play('carve_tier', { pitch: CARVE_TIER_PITCH[e.tier - 1] });
          if (e.mech === local) this.input.rumble(0.12 + e.tier * 0.08, 70);
        }
        break;
      case 'carveBurst': {
        const h = this.heard(e.mech);
        A.play('carve_burst', { volume: Math.max(e.mech === this.view.focusId ? 0.55 + e.tier * 0.15 : 0, h.volume * 0.6) * quiet, pan: h.pan, pitch: 1 + (e.tier - 1) * 0.06 });
        if (e.mech === local && inRace) this.input.rumble(0.25 + e.tier * 0.12, 120 + e.tier * 40);
        break;
      }
      case 'lock':
        if (e.mech === local && inRace) A.play('lock');
        break;
      case 'unlock':
        if (e.mech === local && inRace) A.play('unlock', { volume: 0.6 });
        break;
      case 'denied':
        if (e.mech === local && inRace) A.play('denied');
        break;
      case 'tactic':
        if (inRace && local >= 0 && e.team === race.mechs[local].team) A.play('command');
        break;
      case 'gateShare':
        // A teammate's gate paid you: the gate's chime, softer and lower.
        if (e.mech === local && inRace) A.play('gate', { volume: 0.5, pitch: 0.84 });
        break;
      case 'gate':
        if (e.mech === local && inRace) {
          // Each gate rings a step higher up the scale; the last one resolves.
          if (e.cells >= race.rules.cellMax) A.play('cells_full');
          else {
            const n = Math.max(0, Math.round(e.cells / Math.max(0.25, race.rules.gateValue)) - 1);
            A.play('gate', { pitch: 2 ** (GATE_STEPS[Math.min(n, GATE_STEPS.length - 1)] / 12) });
          }
        }
        else {
          const h = this.heard(e.mech);
          if (h.volume > 0.05) A.play('gate', { volume: h.volume * 0.35 * quiet, pan: h.pan });
        }
        break;
      case 'ability': {
        const h = this.heard(e.mech);
        A.play(ABILITY_SFX[e.ability], { volume: Math.max(e.ability === ABILITY.OVERDRIVE ? 0.3 : 0.15, h.volume) * quiet, pan: h.pan });
        break;
      }
      case 'snared': {
        const h = this.heard(e.mech);
        A.play('snared', { volume: Math.max(e.by === local ? 0.6 : 0.1, h.volume) * quiet, pan: h.pan });
        break;
      }
      case 'raceEnd':
        if (inRace) this.finishRound();
        else if (this.state === 'title') this.attractTimer = -3;
        break;
      default:
        break;
    }
  }

  /** A race stinger, moved into the key of this circuit's music. */
  private sting(name: SfxName): void {
    const semis = STINGER_KEY[this.session.track.def.theme ?? 'meridian']?.[name] ?? 0;
    this.audio.play(name, semis ? { pitch: 2 ** (semis / 12) } : undefined);
  }

  /**
   * In the anime look, put up the eyecatch over a painted still the first
   * time the results are due, and push the results back until it has run.
   * Returns whether it did.
   */
  private eyecatchFor(race: RaceState): boolean {
    if (!look.on || this.eyecaught) return false;
    this.eyecaught = true;
    const hold = 2.1;
    const me = race.mechs[this.session.localId];
    const m = this.match;
    const round = m?.rounds[m.rounds.length - 1];
    const winner = m && m.winner >= 0 ? m.winner : round ? round.winner : me ? me.team : 0;
    const what = m && m.winner >= 0 && m.rounds.length > 1 ? 'the match' : 'the round';
    this.eyecatch.show(m ? `Round ${m.rounds.length}` : 'The flag', `${LIVERIES[winner].name} take ${what}`, hold);
    this.renderer.paintedStill(hold);
    // The race has finished; hold it so nothing moves under the painting.
    this.session.freeze(hold);
    this.hud.hide();
    this.resultsAt = this.time + hold;
    return true;
  }

  /** The flag has fallen: bank the round and bring the results up in a moment. */
  private finishRound(): void {
    if (this.resultsAt > 0) return;
    const race = this.session.race;
    this.resultsAt = this.time + 2.8;
    // Bank the round. A round restarted from the pause menu never gets here.
    if (this.match && !this.roundScored) {
      this.roundScored = true;
      const round = recordRound(this.match, race);
      this.audio.play(round.winner === race.mechs[this.session.localId].team ? 'win' : 'lose');
    }
    this.view.cam.mode = 'orbit';
    this.view.cam.clock = 0;
  }

  /** Point the camera at the next mech worth watching. */
  private cycleFocus(): void {
    const race = this.session.race;
    const local = this.session.localId;
    const team = local >= 0 ? race.mechs[local].team : -1;
    const n = race.mechs.length;
    for (let k = 1; k <= n; k++) {
      const m = race.mechs[(this.view.focusId + k) % n];
      if (m.retired) continue;
      if (team >= 0 && m.team !== team && race.mechs.some((o) => o.team === team && !o.retired)) continue;
      this.view.focusId = m.id;
      this.view.cam.reset();
      return;
    }
  }

  // ---- frame --------------------------------------------------------------

  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, Math.max(0.0005, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    // The look: its settings for this frame, and the drawing clock. (A held
    // frame is a held cel: the drawings stop with it, and with the pause.)
    readLook(this.tuning.feel);
    if (this.lookParam !== null) look.on = this.lookParam >= 0.5;
    const paused = this.state === 'paused';
    tickDrawings(this.renderer.stillShowing || paused ? 0 : dt * (this.state === 'race' ? this.session.timeScale : 1));
    this.eyecatch.update(paused ? 0 : dt);
    this.renderer.paused = paused;
    CEL.uCel.value = look.on ? 1 : 0;
    // The ink pass draws the mechs' contours itself; the hull outlines are for the plain look.
    setHullOutlines(!this.renderer.inking);
    // The painted markings on the mechs, with the look.
    setPaintedMarkings(look.on);
    // Painted thruster flames, on the look's drawings.
    DRAWN_FLAMES.uDrawn.value = look.on ? 1 : 0;
    DRAWN_FLAMES.uFrame.value = drawClock.drawing % 3;
    this.world.sky.uniforms.uBands.value = look.on ? 9 : 0;
    this.hud.anime = look.on;
    this.renderer.moments = this.state === 'race';
    const mine = this.session.race.mechs[this.session.localId];
    this.input.battle = this.state === 'race' && !!mine && mine.mode === MODE.BATTLE && !mine.retired;
    this.input.poll();
    let menu = this.input.consumeMenu();
    // G switches the look, anywhere.
    if (menu.includes('look')) {
      this.toggleLook();
      menu = menu.filter((m) => m !== 'look');
    }
    // The tuning panel opens over anything. While a race is running it is
    // worked with the mouse only, so the pad and keys keep flying the mech.
    if (menu.includes('tune')) {
      if (this.state === 'race' || !this.panel.open) {
        this.panel.toggle();
        this.audio.play('ui_select');
        menu = menu.filter((m) => m !== 'tune');
      }
    }
    if (this.panel.open && this.state !== 'race') {
      this.panel.handle(menu);
      menu = [];
    }
    const race = this.session.race;
    const local = this.session.localId;
    let simDt = dt;

    switch (this.state) {
      case 'title': {
        this.menus.handle(menu);
        this.session.update(dt, null);
        for (const e of this.session.events) this.onEvent(e);
        // Cut between pilots every few seconds, like a broadcast.
        this.attractTimer += dt;
        if (this.attractTimer > 7) {
          this.attractTimer = 0;
          this.cycleFocus();
        }
        if (race.phase === PHASE.FINISHED && this.attractTimer >= 0 && this.attractTimer < dt * 2) this.startAttract();
        break;
      }
      case 'garage':
        this.menus.handle(menu);
        simDt = dt;
        break;
      case 'race': {
        if (menu.includes('pause')) {
          this.pause();
          break;
        }
        const me = race.mechs[local];
        // Slow motion around a knockout you were part of.
        if (this.slowmo > 0) {
          this.slowmo -= dt;
          this.session.timeScale = this.slowmo > 0.25 ? 0.3 : 0.3 + (1 - this.slowmo / 0.25) * 0.7;
        } else {
          this.session.timeScale = 1;
        }
        const flying = me.human && !me.retired && !me.finished;
        this.session.update(dt, flying || me.retired ? this.input.state : null);
        for (const e of this.session.events) this.onEvent(e);
        // Out of the race: the lock button changes whose camera you ride.
        const pressed = this.input.state.buttons & ~this.prevButtons;
        this.prevButtons = this.input.state.buttons;
        if (!flying && pressed & BTN.LOCK) this.cycleFocus();
        if (flying) this.view.focusId = local;
        if (flying) this.roadRumble(dt);
        // The race can also end while nobody is watching (a dev skip past the flag).
        if (race.phase === PHASE.FINISHED && this.resultsAt < 0) this.finishRound();
        if (this.resultsAt > 0 && this.time >= this.resultsAt && this.eyecatchFor(race)) {
          // The anime look cuts to an eyecatch first; the results come up after it.
        } else if (this.resultsAt > 0 && this.time >= this.resultsAt) {
          this.resultsAt = -1;
          this.eyecatch.hide();
          this.state = 'results';
          this.hud.hide();
          this.menus.match = this.match;
          this.menus.show('results', race, local);
          this.audio.setMusic('menu');
        }
        break;
      }
      case 'paused':
        this.menus.handle(menu);
        simDt = 0;
        break;
      case 'results':
        this.menus.handle(menu);
        this.session.update(dt, null);
        for (const e of this.session.events) this.view.handleEvent(e);
        break;
    }

    const cur = this.session.race;
    // Whether this frame is drawn (the anime look's 30 fps option skips every
    // other): the HUD's marks over the mechs move with the picture.
    this.renderer.frameCap = look.on && this.tuning.feel.lookThirty >= 0.5 ? 30 : 0;
    const drawDt = this.renderer.beginFrame(dt, this.time);
    const flyingNow = this.state === 'race' && this.view.focusId === local;
    // A painted still holds everything, the camera and the sparks included.
    const viewDt = this.renderer.stillShowing ? 0 : simDt * (this.state === 'race' ? this.session.timeScale : 1);
    this.view.update(viewDt, flyingNow ? this.input.camX : 0, flyingNow ? this.input.camY : 0, flyingNow && this.input.lookBack);
    if (this.state === 'race' && drawDt > 0) this.hud.update(drawDt, cur, this.view.plates, this.view.focusId);
    // The scenery's own motion (water, lights) holds for a painted still too.
    if (!this.renderer.stillShowing) this.worldTime += dt;
    this.trackVis.update(this.worldTime);
    this.world.update(this.worldTime, this.renderer.camera);

    // The player's own lock, remembered for a few seconds after it goes (a
    // knockout clears it), for the slow motion on knockouts they had a hand in.
    const own = cur.mechs[this.session.localId];
    if (own && own.target >= 0) {
      this.ownLock = own.target;
      this.ownLockAt = cur.tick;
    } else if (cur.tick - this.ownLockAt > 5 * TICK_RATE) {
      this.ownLock = -1;
    }

    // Continuous sound follows whoever the camera is on.
    const f = cur.mechs[this.view.focusId];
    const sc = this.scene;
    sc.racing = (this.state === 'race' || this.state === 'results') && cur.phase !== PHASE.COUNTDOWN && !f.retired;
    sc.speed = f.speed;
    // (Home, the computer drives it on: the engine is its throttle, not the pad's.)
    sc.throttle = this.state === 'race' && f.id === local && !f.finished ? Math.max(this.input.state.throttle, f.mode === MODE.BATTLE ? 0.6 : 0) : 0.8;
    sc.boosting = f.boosting || f.overdriveT > 0;
    sc.surge = f.overdriveT > 0;
    sc.battle = f.mode === MODE.BATTLE;
    sc.lapPhase = cur.lapPhase;
    sc.onStrip = f.onStrip;
    sc.drafting = f.drafting;
    sc.scraping = f.wall > 0 && f.speed > 20;
    sc.carve = f.carving && !f.air ? Math.max(0.15, Math.abs(f.steer)) : 0;
    sc.carveTier = f.carving ? f.carveTier : 0;
    sc.critical = f.hp > 0 && f.hp < 0.25 * f.maxHp && !f.retired && this.state === 'race';
    this.audio.update(dt, sc);

    if (drawDt > 0) this.renderer.render(drawDt, this.time);
  }

  /** A low rumble that follows the road: speed, charge strips, the wall, boost and Overdrive. */
  private roadRumble(dt: number): void {
    this.rumbleT -= dt;
    if (this.rumbleT > 0) return;
    this.rumbleT = 0.09;
    const m = this.session.race.mechs[this.session.localId];
    if (this.session.race.phase !== PHASE.RACING) return;
    const sf = Math.min(1.4, m.speed / 160);
    let weak = Math.max(0, sf - 0.35) * 0.16;
    let strong = 0;
    if (m.onStrip) weak += 0.12;
    if (m.boosting) weak += 0.14;
    if (m.overdriveT > 0) {
      weak += 0.25;
      strong += 0.2;
    }
    if (m.ramT > 0) strong += 0.18;
    if (m.wall > 0 && m.speed > 20) strong += 0.4;
    if (m.mode === MODE.SPEED && Math.abs(m.steer) > 0.6) weak += (Math.abs(m.steer) - 0.6) * 0.3 * sf;
    // Carving: the edges chatter, harder as the charge climbs.
    if (m.carving && !m.air) weak += 0.08 + m.carveTier * 0.05;
    if (weak + strong > 0.015) this.input.rumbleRoad(strong, weak, 130);
  }

  /** For automated checks. */
  debugState(): object {
    const r = this.session.race;
    return {
      state: this.state,
      match: this.match ? { mode: this.match.cfg.mode, rounds: this.match.rounds.length, wins: this.match.wins, totals: this.match.totals, winner: this.match.winner } : null,
      tick: r.tick,
      phase: r.phase,
      lapPhase: r.lapPhase,
      focus: this.view.focusId,
      mechs: r.mechs.map((m) => ({ name: m.name, s: Math.round(m.s), speed: Math.round(m.speed), hp: Math.round(m.hp), drive: Math.round(m.drive), cells: m.cells, place: m.place, mode: m.mode, retired: m.retired, finished: m.finished })),
    };
  }
}

export { THREE };
