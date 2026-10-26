// The game shell: owns the renderer, the current session and view, the HUD,
// menus, input and audio, and moves between the title, the menus, the race
// and the results, for each of the three modes:
//
//   Free Play   today's garage, reorganised: hangar, then match setup.
//   Grand Prix  cups and the season (src/gp/), with the other factions'
//               races run in the background.
//   Online      private rooms on the game server, with squads.
import { DEV_TOOLS } from '../devTools';
import * as THREE from 'three';
import {
  ABILITY,
  ATK,
  ATTACKS,
  BTN,
  MODE,
  PHASE,
  REV_PERFECT,
  REV_RED,
  START,
  ROLE,
  ROLE_NAMES,
  TICK_RATE,
  buildTrack,
  createMatch,
  deltaS,
  recordRound,
  sprintGrid,
  standings,
  trackById,
  TRACKS,
  weaponsFree,
  type MatchConfig,
  type MatchState,
  type RaceState,
  type Role,
  type SeatConfig,
  type SimEvent,
} from '../../sim/index';
import {
  CUPS,
  GP_SKILL,
  GP_TEAMMATE_SKILL,
  advance,
  eventName,
  finalPlace,
  isOver,
  matchFormat,
  medalFor,
  newCup,
  newSeason,
  newTour,
  playedRounds,
  singleRaces,
  recordYours,
  yourRoundNumber,
  type GpEvent,
  type GpKind,
  type Medal,
} from '../../gp/grandPrix';
import { normalizeCode, type Loadout, type MatchStartMsg, type SquadTicket } from '../../net/protocol';
import { NullAudio, type AudioEngine, type AudioScene, type SfxName } from '../audio/audio';
import { Input, type Device } from '../input/input';
import { TouchControls } from '../input/touch';
import { holdLandscape, isFullscreen, setFullscreen } from '../fullscreen';
import { Hangar } from '../render/hangar';
import { RaceView } from '../render/raceView';
import { Renderer } from '../render/renderer';
import { buildTrackVisual, type TrackVisual } from '../render/trackMesh';
import { buildWorld, type World } from '../render/world';
import { disposeTree, themeFor } from '../render/themes';
import { CEL, celify, drawClock, look, readLook, setCelTheme, tickDrawings } from '../render/look';
import { setPaintedMarkings } from '../render/mech/decals';
import { setHullOutlines } from '../render/mech/kit';
import { DRAWN_FLAMES } from '../render/mech/parts';
import { useOldSwift } from '../render/mech/frames';
import { cycleSunhawkModel, getSunhawkModel, setSunhawkPanels, SUNHAWK_LABELS } from '../render/mech/sunhawkSelection';
import { toggleRosterModel, rosterLabel } from '../render/mech/rosterSelection';
import { LIVERIES, factionName } from '../render/palette';
import { trackMatrix } from '../render/trackSpace';
import { Eyecatch } from '../ui/eyecatch';
import { NowPlaying } from '../ui/nowPlaying';
import { emblemUrl } from '../ui/factionArt';
import { Hud, abilityShown } from '../ui/hud';
import { MATCH_OPTIONS, Menus, SPRINT_OPTIONS, type GarageChoice, type ScreenId } from '../ui/menus';
import { confirmDialog, messageDialog, registerCommon, type DialogData, type EntryData } from '../ui/screens/common';
import { registerGarage, type HangarData } from '../ui/screens/garage';
import { registerPilot } from '../ui/screens/pilot';
import { registerCustom } from '../ui/screens/custom';
import { registerGrandPrix } from '../ui/screens/grandPrix';
import { inviteDialog, registerOnline } from '../ui/screens/online';
import { gpBlocked, registerOnlineGp } from '../ui/screens/onlineGp';
import { registerRace } from '../ui/screens/race';
import { registerVideo } from '../ui/screens/video';
import { applyFrame, frame, onFrame, RESOLUTIONS, saveVideo, video, type VideoSettings } from '../video';
import { TuningPanel } from '../ui/tuningPanel';
import { GpRunner } from '../gp/gpRunner';
import * as gpStore from '../gp/gpStore';
import { callsign as savedCallsign, colourFromPortrait, customLook, customMech, fliesCustom, pilotColour, pilotName, portrait as pilotPortrait, seatLook, setCallsign, setCustomMech, setFliesCustom, setPilotColour, setPortrait as savePortrait } from '../net/identity';
import { stockBuild, type MechBuild } from '../../custom/mechBuild';
import { Online, failure } from '../net/online';
import { inKnockout } from './moments';
import { NetSession } from './netSession';
import { LocalSession } from './session';
import { TUNE_GROUPS, Tuning } from './tuning';

type State = 'title' | 'garage' | 'race' | 'paused' | 'results';
export type GameMode = 'free' | 'gp' | 'online';

const RIVAL_SKILL = [0.28, 0.55, 0.82];
/** The garage's mech sits this far right of centre (of the screen's width), clear of the menu. */
const GARAGE_SHIFT = 0.07;

/**
 * Where the hangar's mech sits for the layout in use, as [right of centre,
 * above centre] in fractions of the screen: clear of the menu's panels.
 */
function garageShift(): [number, number] {
  if (frame.portrait) return [0, 0.24];
  if (frame.layout === 'single') return [0.26, 0];
  if (frame.layout === 'cols') return [0.03, 0];
  return [GARAGE_SHIFT, 0];
}
/** Screens shown over the hangar, with your mech in its bay. */
const HANGAR_SCREENS = new Set<ScreenId>(['hangar', 'pilot', 'custom', 'custom-parts', 'custom-paint', 'setup', 'gp', 'briefing', 'standings', 'award', 'online', 'online-gp', 'room']);

export interface GameOptions {
  /** Start a race at once in this role (dev shortcut). */
  auto?: Role;
  /** Let the computer fly the player's seat (demo / testing). */
  demo?: boolean;
  /** Skip ahead this many seconds before showing the race. */
  skip?: number;
  seed?: number;
  team?: number;
  /** The rival team (a faction index); otherwise one is picked at random. */
  rival?: number;
  rivals?: number;
  /** Match format, an index into MATCH_OPTIONS. */
  match?: number;
  /** A Sprint in this format (an index into SPRINT_OPTIONS) rather than a team race. */
  sprint?: number;
  /** Open the tuning panel at once. */
  tune?: boolean;
  /** Circuit id to race on (see TRACKS). */
  track?: string;
  /** An invite link: the room or squad code to go straight to. */
  room?: string;
  squad?: string;
  audio?: AudioEngine;
}

const ABILITY_SFX: SfxName[] = ['overdrive', 'breakaway', 'snare_shot', 'pulse', 'ram', 'aegis'];
/** Screens the results' music carries on under: the results, the award, and what opens over them. */
const RESULTS_MUSIC_SCREENS = new Set<ScreenId>(['results', 'award', 'controls', 'video', 'dialog', 'pause']);
/** Screens that open over others: the music is the one for the screen under them. */
const OVER_SCREENS = new Set<ScreenId>(['controls', 'video', 'dialog', 'pause']);
/** The custom mech editor's screens: the mech in the bay is turned by hand on them, not drifting round (naming it too). */
const CUSTOM_SCREENS = new Set<ScreenId>(['custom', 'custom-parts', 'custom-paint']);
const OVER_EDITOR = new Set<ScreenId>([...OVER_SCREENS, 'entry']);
/**
 * Semitones to move the race stingers by on each circuit so they land in the
 * key its music is in (they are written for Meridian's A minor, B minor and
 * D major): the lap chime, the battle-lap stab, the speed-lap fanfare and the flag.
 */
const STINGER_KEY: Record<string, Partial<Record<SfxName, number>>> = {
  meridian: {},
  canyon: { lap: 1, lap_phase: -5, final_lap: -6, finish: -1 },
  helios: { lap_phase: 2, final_lap: 5, finish: 2 },
  // Its synthesised music is Helios's (its song has its own: see tools/music/songs/crucible.json).
  crucible: { lap_phase: 2, final_lap: 5, finish: 2 },
  // Helios's synthesised music too, until it has a song of its own.
  frostline: { lap_phase: 2, final_lap: 5, finish: 2 },
  // Canyon's synthesised music, until it has a song of its own.
  titan: { lap: 1, lap_phase: -5, final_lap: -6, finish: -1 },
  // Meridian's synthesised music, until it has a song of its own.
  abyss: {},
  // Canyon's synthesised music, until it has a song of its own.
  monsoon: { lap: 1, lap_phase: -5, final_lap: -6, finish: -1 },
  // Helios's synthesised music, until it has a song of its own.
  zenith: { lap_phase: 2, final_lap: 5, finish: 2 },
};
/** Semitones above the gate chime's home note for each gate banked: steps of A minor. */
const GATE_STEPS = [0, 2, 3, 5, 7];
/** The carve chime climbs with the tier: root, a fourth, then the octave. */
const CARVE_TIER_PITCH = [1, 2 ** (5 / 12), 2];

/** What the round being raced is: who, where, and against whom. */
interface RoundSetup {
  /** Which faction each race team is (a team race: you are team 0 offline). A Sprint's are its seats'. */
  factions: number[];
  /** A Sprint: six Forwards, every pilot for themselves (you, and one computer pilot from each faction). */
  sprint?: boolean;
  role: Role;
  /** The rival team's computer pilots. */
  rivalSkill: number;
  /** What your seat flies, if not as your loadout has it (the hangar on a Sprint's setup: your own Forward). */
  look?: string;
  /** Your teammates. */
  teamSkill: number;
  track: string;
  cfg: MatchConfig;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage blocked: this visit only */
  }
}

export class Game {
  readonly renderer: Renderer;
  readonly input = new Input();
  readonly hud: Hud;
  readonly menus: Menus;
  readonly tuning = new Tuning();
  readonly panel: TuningPanel;
  readonly online = new Online();
  readonly gpRunner = new GpRunner();
  audio: AudioEngine;
  private trackVis!: TrackVisual;
  private world!: World;
  /** The garage's set, built once; stood round your mech while a hangar screen is up. */
  private readonly hangar = new Hangar();
  private readonly hangarFrame = new THREE.Matrix4();
  /** Id of the circuit whose scenery is built. */
  private trackId = '';
  session!: LocalSession | NetSession;
  private view!: RaceView;
  private state: State = 'title';
  /** The mode being played (null on the title and between modes). */
  mode: GameMode | null = null;
  /** Your faction and frame, remembered, and the default in every mode. */
  loadout: { team: number; role: Role } = readJson('zgp.loadout', { team: 0, role: ROLE.FW as Role });
  /** Free Play's setup, remembered. */
  free: GarageChoice = readJson('zgp.free', { role: ROLE.FW as Role, team: 0, rival: -1, rivals: 1, match: 1, track: 'meridian', mode: 'teams', sprint: 1 });
  private gpEvents: Record<GpKind, GpEvent | null> = { cup: gpStore.loadEvent('cup'), tour: gpStore.loadEvent('tour'), season: gpStore.loadEvent('season') };
  /** The Grand Prix event being played. */
  gpKind: GpKind = 'cup';
  private setup: RoundSetup | null = null;
  /** The match being played: one or more rounds between the same two teams. */
  match: MatchState | null = null;
  private roundScored = false;
  /** What the results screen reports on. */
  resultsRace: RaceState | null = null;
  resultsLocal = 0;
  /** Online: what the hub and room say while something is under way. */
  onlineStatus = '';
  private rumbleT = 0;
  private time = 0;
  private last = performance.now();
  private attractTimer = 0;
  private resultsAt = -1;
  /** The music last asked for: results music gives way to the menu's once its screens are left. */
  private musicNow: 'menu' | 'race' | 'results' | null = null;
  /** Which of the menus' music plays: the hangar's on the hangar screens, else the title theme's. */
  private menuMusic: 'menu' | 'hangar' | null = null;
  private readonly nowPlaying: NowPlaying;
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
  private garageShown: { team: number; role: Role; sprint: boolean; colour: number } | null = null;
  /** The race behind the title is on screen. */
  private attracting = false;
  /** The player's revs on the grid, by band (0 below the green, 2 in it, 3 past it), for the tick into the green. */
  private revZone = 0;
  private scene: AudioScene = { racing: false, speed: 0, throttle: 0, boosting: false, battle: false, lapPhase: 1, onStrip: false, drafting: false, scraping: false, critical: false, finished: false };

  /** The on-screen controls (a race played by touch). */
  private touchPad: TouchControls;
  /** "Turn your phone sideways": a race on a phone held upright. */
  private rotateEl: HTMLElement;
  /** The race was paused because the phone was turned upright: it goes on when it is turned back. */
  private rotatePaused = false;
  private heldLandscape = false;
  /** A finger is the main pointer here (a phone or tablet), whatever was used last. */
  private coarse = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement, private opts: GameOptions = {}) {
    this.audio = opts.audio ?? new NullAudio();
    this.renderer = new Renderer(canvas);
    this.renderer.scene.add(this.hangar.root);
    this.hangar.preload(LIVERIES.map((_, f) => emblemUrl(f)));
    if (opts.track && trackById(opts.track)) this.free.track = opts.track;
    // The circuit and its surroundings are built when it is chosen and
    // shared by every race on it.
    this.useTrack(this.free.track);
    this.hud = new Hud(uiRoot);
    this.eyecatch = new Eyecatch(uiRoot);
    this.nowPlaying = new NowPlaying(uiRoot, () => this.nextTrack());
    this.hud.onRadio = () => this.audio.play('comms', { volume: 0.7 });
    this.hud.onCritical = () => this.audio.play('critical');
    this.menus = new Menus(uiRoot, {
      sound: (n) => this.audio.play(n),
      lookOn: () => look.on,
      screenChanged: (id) => this.screenChanged(id),
    });
    registerCommon(this.menus, this);
    registerGarage(this.menus, this);
    registerPilot(this.menus, this);
    registerCustom(this.menus, this);
    registerGrandPrix(this.menus, this);
    registerOnline(this.menus, this);
    registerOnlineGp(this.menus, this);
    registerRace(this.menus, this);
    registerVideo(this.menus, this);
    this.renderer.crt = video.crt;
    this.applyResolution();
    this.panel = new TuningPanel(uiRoot, this.tuning, {
      onClose: () => {},
      onSound: (n) => this.audio.play(n),
    });
    // A rule changed on the panel reaches the race in progress as well as the
    // next one; online the room's rules stand.
    this.tuning.onChange = (kind) => {
      if (kind !== 'feel' && this.session instanceof LocalSession) Object.assign(this.session.race.rules, this.tuning.rules);
      this.input.rumbleScale = this.tuning.feel.rumble;
      if (kind !== 'rule') this.applySound();
    };
    this.input.rumbleScale = this.tuning.feel.rumble;
    this.applySound();
    this.touchPad = new TouchControls(document.body);
    this.touchPad.frameRect = () => frame;
    this.input.attachTouch(this.touchPad);
    this.rotateEl = document.createElement('div');
    this.rotateEl.className = 'rotate-hint';
    this.rotateEl.hidden = true;
    this.rotateEl.innerHTML = '<div class="phone"></div><b>Turn your phone sideways</b><span>The race is played in landscape.</span>';
    document.body.append(this.rotateEl);
    this.input.onDeviceChange = (d) => this.deviceChanged(d);
    this.deviceChanged(this.input.device, true);
    let layout = '';
    onFrame((f) => {
      this.touchPad.layout();
      // A new layout (not just a new size): draw the menu again so the highlight is in view.
      const now = `${f.layout}|${f.compact}|${f.portrait}`;
      if (now !== layout && this.menus.screen) this.menus.refresh();
      layout = now;
    });
    document.addEventListener('fullscreenchange', () => {
      if (this.menus.screen === 'video') this.menus.refresh();
    });
    this.input.onFirstGesture = () => this.audio.unlock();
    window.addEventListener('resize', () => this.view?.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'race') this.pause();
    });
    this.gpRunner.onResult = () => {
      const s = this.menus.screen;
      if (s === 'briefing' || s === 'standings' || s === 'gp') this.menus.refresh();
    };
    this.wireOnline();
    if (opts.team !== undefined && LIVERIES[opts.team]) this.loadout.team = opts.team;
    if (opts.rival !== undefined) this.free.rival = opts.rival;
    if (opts.rivals !== undefined) this.free.rivals = opts.rivals;
    if (opts.match !== undefined && MATCH_OPTIONS[opts.match]) this.free.match = opts.match;
    else if (opts.auto !== undefined) this.free.match = 0;
    if (opts.auto !== undefined) this.loadout.role = opts.auto;
    // (Kept from an older visit, or nonsense: a team race, and the Sprint's second format.)
    if (this.free.mode !== 'sprint') this.free.mode = 'teams';
    if (!SPRINT_OPTIONS[this.free.sprint]) this.free.sprint = 1;
    if (opts.sprint !== undefined) {
      this.free.mode = 'sprint';
      this.free.sprint = SPRINT_OPTIONS[opts.sprint] ? opts.sprint : 0;
    } else if (opts.auto !== undefined) this.free.mode = 'teams';
    if (opts.auto !== undefined || opts.sprint !== undefined) {
      this.startFree();
    } else {
      this.showTitle();
      void this.bootOnline();
    }
    if (opts.tune) this.panel.show();
    // ?look=plain or ?look=anime picks the look for this visit without remembering it.
    const lk = new URLSearchParams(location.search).get('look');
    if (lk === 'plain' || lk === 'anime') this.lookParam = lk === 'anime' ? 1 : 0;
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---- shared by the screens ------------------------------------------------------

  sound(n: 'ui_move' | 'ui_select' | 'ui_back'): void {
    this.audio.play(n);
  }

  lookOn(): boolean {
    return look.on;
  }

  openTuning(): void {
    this.panel.note = this.tuningNote();
    this.panel.show();
  }

  /** Online the room's rules stand: the panel says so. */
  private tuningNote(): string {
    return this.mode === 'online' ? "Online the room plays the standard rules. Rule changes here apply to your offline races; camera, look and sound apply now." : '';
  }

  /** Which faction each race team is (-1 for none: a person in a Sprint). */
  get factions(): readonly number[] {
    return this.raceFactions;
  }
  private raceFactions: number[] = [0, 1];

  /** The callsign you chose ('' until you have: online asks for one). */
  get callsign(): string {
    return savedCallsign();
  }

  /** The name your seat wears: your callsign, or the one made up for you until you choose. */
  get pilotName(): string {
    return pilotName();
  }

  /** Your portrait (an index into the gallery). */
  get portrait(): number {
    return pilotPortrait();
  }

  /** Wear another portrait (an index into the gallery). */
  setPortrait(i: number): void {
    savePortrait(i);
    this.tellPilotSoon();
  }

  /** Your colour (an index into PILOT_COLOURS): worn when you fly for no faction, in a Sprint. */
  get pilotColour(): number {
    return pilotColour();
  }

  /** Whether your colour is your portrait's (you have not picked one). */
  get colourFromPortrait(): boolean {
    return colourFromPortrait();
  }

  /** Pick your colour (-1: your portrait's). */
  setPilotColour(c: number): void {
    setPilotColour(c);
    this.tellPilotSoon();
  }

  /**
   * Your custom Forward, made from your faction's stock one if you have
   * none: a Sprint is raced in it (every person in their own mech, flying
   * for no faction). Returns it as a seat carries it.
   */
  sprintMech(): string {
    if (!customMech(ROLE.FW)) setCustomMech(ROLE.FW, stockBuild(this.loadout.team));
    return customLook(ROLE.FW);
  }

  // ---- your custom mechs (docs/CUSTOMIZATION.md) ----------------------------

  /** Your custom mech of a frame, or null if you have not made one. */
  customMech(role: Role): MechBuild | null {
    return customMech(role);
  }

  /** Whether you fly your custom mech in a frame (rather than your faction's stock one). */
  fliesCustom(role: Role): boolean {
    return fliesCustom(role);
  }

  /** Keep your custom mech of a frame (null deletes it); the hangar shows it at once. */
  setCustomMech(role: Role, b: MechBuild | null): void {
    setCustomMech(role, b);
    this.refreshPreviewMech();
    this.tellPilotSoon();
  }

  /** Fly your custom mech in a frame, or the stock one. */
  setFliesCustom(role: Role, on: boolean): void {
    setFliesCustom(role, on);
    this.refreshPreviewMech();
    this.tellPilotSoon();
  }

  private tellTimer = 0;
  /** How fast the right stick is turning the mech in the editor (radians a second, eased). */
  private turnRate = 0;

  /** A drag across the bay in the custom mech editor: `dx` pixels to the right turns the mech that way. */
  turnHangar(dx: number): void {
    this.view.cam.turn((dx / Math.max(320, innerWidth)) * Math.PI * 1.6);
  }

  /** A room or squad hears of your mechs once the changes settle (not at every step through the paints). */
  private tellPilotSoon(): void {
    clearTimeout(this.tellTimer);
    this.tellTimer = window.setTimeout(() => this.tellPilot(), 600);
  }

  private previewTimer = 0;

  /**
   * The hangar's mech again, as you fly it now (stock or custom, as last
   * changed). Changes in quick succession (left and right through the paints)
   * rebuild it once they settle.
   */
  refreshPreviewMech(): void {
    clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(() => {
      if (this.state !== 'garage' || !this.session) return;
      const m = this.session.race.mechs[this.session.localId];
      if (!m) return;
      // (Behind a Sprint's setup: your own Forward, flown or not.)
      m.look = this.garageShown?.sprint ? customLook(m.role) : seatLook(m.role);
      this.view?.refreshMechModels('all');
    }, 200);
  }

  /** A room or squad you are in hears of a change to your pilot (it shows from the next race). */
  private tellPilot(): void {
    if (!this.callsign) return;
    const msg = { callsign: this.callsign, portrait: this.portrait, looks: [seatLook(0), seatLook(1), seatLook(2)], colour: pilotColour(), sprint: customLook(ROLE.FW) };
    this.online.sendRoom('pilot', msg);
    this.online.sendSquad('pilot', msg);
  }

  setLoadout(l: { team: number; role: Role }): void {
    this.loadout = { team: l.team, role: l.role };
    writeJson('zgp.loadout', this.loadout);
  }

  saveFree(): void {
    writeJson('zgp.free', this.free);
  }

  /** Show this faction and frame in the hangar behind the menus (`sprint`: your own Forward, as a Sprint is raced in). */
  preview(l: { team: number; role: Role; sprint?: boolean }): void {
    if (this.state === 'race' || this.state === 'paused' || this.state === 'results') return;
    this.showGarage(l);
  }

  /** The setup screen's mech again, after a change of mode. */
  previewSetup(): void {
    this.preview(this.previewLoadout('setup'));
  }

  // ---- sessions -----------------------------------------------------------

  /**
   * The grid offline. You are always race team 0, flying for your faction;
   * race team 1 is the rival faction. Your seat wears your pilot (callsign
   * and portrait); each other seat its faction's pilot, as yours does in a
   * demo (the captures stay the same from run to run).
   */
  private seats(setup: RoundSetup | null): { seats: SeatConfig[]; localId: number } {
    if (setup?.sprint) return this.sprintSeats(setup);
    const seats: SeatConfig[] = [];
    let localId = -1;
    for (const role of [ROLE.FW, ROLE.MF, ROLE.DF]) {
      for (let team = 0; team < 2; team++) {
        const human = setup !== null && team === 0 && setup.role === role;
        if (human) localId = seats.length;
        const yours = human && !this.opts.demo;
        const name = yours ? pilotName() : (LIVERIES[this.raceFactions[team]] ?? LIVERIES[team]).pilots[role];
        seats.push({ team, role, human, name, portrait: yours ? pilotPortrait() : -1, look: yours ? (setup?.look ?? seatLook(role)) : '', colour: yours ? pilotColour() : -1, skill: setup === null ? 0.6 : team === 1 ? setup.rivalSkill : setup.teamSkill });
      }
    }
    return { seats, localId };
  }

  /**
   * A Sprint's grid offline: you (seat 0) in your own Forward, flying for no
   * faction, in your colour; and a computer pilot from each faction in its
   * stock Forward. Each seat is its own team.
   */
  private sprintSeats(setup: RoundSetup): { seats: SeatConfig[]; localId: number } {
    const seats: SeatConfig[] = [
      { team: 0, role: ROLE.FW, human: true, name: pilotName(), portrait: pilotPortrait(), look: this.sprintMech(), colour: pilotColour(), skill: setup.teamSkill },
    ];
    LIVERIES.forEach((l, f) => seats.push({ team: f + 1, role: ROLE.FW, human: false, name: l.pilots[ROLE.FW], skill: setup.rivalSkill }));
    return { seats, localId: 0 };
  }

  /** Put a session on screen: its view, effects, the scenery back. */
  private attach(session: LocalSession | NetSession, previewOnly: boolean): void {
    this.view?.dispose();
    this.attracting = false;
    this.session = session;
    this.view = new RaceView(this.renderer, this.session, this.trackVis, this.tuning.feel, this.raceFactions, previewOnly);
    // Out of the hangar, if the garage had it up: the circuit is back.
    this.hangar.hide();
    this.garageShown = null;
    this.trackVis.group.visible = true;
    this.world.group.visible = true;
    this.renderer.outdoors = true;
    // The mechs (and anything else the view made) take the cel shading too.
    celify(this.renderer.scene);
    this.view.onImpact = (strength) => {
      // Only the race you are flying shakes the pad: not the race behind the
      // menus, nor yours run on by the computer behind the results.
      if (this.state === 'race') this.input.rumble(strength, 90 + strength * 160);
      // Hit-stop: a beat's pause on every blow you land or take, longer for
      // the big ones (online it only holds the picture; the race runs on).
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

  /**
   * Start an offline session: the seats, the circuit (unless `keepTrack`: the
   * garage, which hides the circuit, keeps whichever is built), the race and its view.
   */
  private setSession(setup: RoundSetup | null, seed: number, gridFlip = false, keepTrack = false): void {
    if (!setup) {
      // Between races on the title screen: any two factions.
      const a = (Math.random() * LIVERIES.length) | 0;
      this.raceFactions = [a, (a + 1 + ((Math.random() * (LIVERIES.length - 1)) | 0)) % LIVERIES.length];
    } else this.raceFactions = [...setup.factions];
    const { seats, localId } = this.seats(setup);
    if (!keepTrack) this.useTrack(setup?.track ?? this.trackId);
    // A Sprint's grid: by lot for its first race, then the standings reversed.
    const sprint = !!setup?.sprint;
    const grid = sprint ? sprintGrid(this.match, seats.length, seed) : undefined;
    const session = new LocalSession(trackById(this.trackId) ?? TRACKS[0], { seed, seats, rules: { ...this.tuning.rules }, gridFlip, mode: sprint ? 'sprint' : 'teams', grid }, localId);
    this.attach(session, keepTrack);
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
    this.hangar.setSky(this.world.sky, theme.sunLight);
    this.renderer.setTheme(theme);
    setCelTheme(theme);
    celify(this.trackVis.group);
    celify(this.world.group);
    scene.add(this.trackVis.group, this.world.group);
    this.circuitAhead(def.id);
  }

  /**
   * The next race is likely on this circuit (it is built, or shown on the
   * screen before a race): its race music can get ready. A recorded song
   * takes a moment to decode, so this is said as early as it is known.
   */
  circuitAhead(id: string): void {
    const def = trackById(id);
    if (def) this.audio.prepareMusic?.(def.theme ?? 'meridian');
  }

  showTitle(): void {
    this.mode = null;
    if (this.online.room) void this.online.leaveRoom();
    this.hud.hide();
    this.menus.reset('title');
    this.music('menu');
  }

  /**
   * A different device in hand: the HUD's hints, the menus' prompts, the
   * on-screen controls. Picking up the screen changes the layout, so that
   * waits for the finger to lift: a tap must land on what it was aimed at.
   */
  private deviceChanged(d: Device, now = false): void {
    const apply = () => {
      if (this.input.device !== d) return;
      document.documentElement.classList.toggle('touch', d === 'touch');
      this.hud.setDevice(d);
      this.menus.setDevice(d);
    };
    if (d !== 'touch' || now) apply();
    else window.addEventListener('pointerup', () => setTimeout(apply, 0), { once: true, capture: true });
  }

  private music(track: 'menu' | 'race' | 'results', style?: string): void {
    // The menus' music depends on the screen (the hangar's or the title
    // theme), which is often only settled just after this is asked for: it
    // is chosen each frame (menusMusic), the next one included.
    if (track === 'menu') {
      if (this.musicNow !== 'menu') this.menuMusic = null;
      this.musicNow = 'menu';
      return;
    }
    this.musicNow = track;
    this.menuMusic = null;
    this.audio.setMusic(track, style);
  }

  /** Each frame, in the menus: the hangar's music on the hangar screens, the title theme on the rest. */
  private menusMusic(): void {
    if (this.musicNow !== 'menu') return;
    const under = this.menus.under(OVER_SCREENS);
    const want = under !== null && HANGAR_SCREENS.has(under) ? 'hangar' : 'menu';
    if (want === this.menuMusic) return;
    this.menuMusic = want;
    this.audio.setMusic(want);
  }

  /** On to the next track of the hangar's music, if it is playing. */
  private nextTrack(): void {
    if (this.musicNow !== 'menu' || this.menuMusic !== 'hangar' || !this.audio.skipTrack) return;
    this.audio.skipTrack();
    this.audio.play('ui_select');
  }

  /**
   * Whether the player's team won the round just raced: the results' music
   * (null when nobody here raced, or the round is not scored yet).
   */
  private wonRound(race: RaceState, local: number): boolean | null {
    const me = local >= 0 ? race.mechs[local] : undefined;
    const round = this.match?.rounds[this.match.rounds.length - 1];
    return me && round ? round.winner === me.team : null;
  }

  /** The results screen's music: the win or loss theme, or the menu's when it is not known. */
  private resultsMusic(): void {
    const won = this.resultsRace ? this.wonRound(this.resultsRace, this.resultsLocal) : null;
    if (won === null) this.music('menu');
    else this.music('results', won ? 'win' : 'loss');
  }

  /** The scene behind the menus follows the screen on top: the attract race, or your mech in the hangar. */
  private screenChanged(id: ScreenId | null): void {
    // Off the results (or the Grand Prix award) to anywhere but a dialog over them: the menu music again.
    if (this.musicNow === 'results' && id !== null && !RESULTS_MUSIC_SCREENS.has(id)) this.music('menu');
    if (this.state === 'race' || this.state === 'paused' || this.state === 'results') {
      if (id === null || id === 'pause' || id === 'results' || id === 'controls' || id === 'video' || id === 'dialog') return;
    }
    if (id === null) return;
    if (id === 'title' || id === 'modes') {
      if (!this.attracting) this.startAttract();
      return;
    }
    if (HANGAR_SCREENS.has(id)) this.showGarage(this.previewLoadout(id));
  }

  /** Whose mech the hangar shows for a screen. */
  private previewLoadout(id: ScreenId): { team: number; role: Role; sprint?: boolean } {
    // A Sprint (Free Play's setup, or a room set to one): your own Forward, in your colour.
    const room = this.online.lobby;
    const sprintRoom = this.menus.has('room') && !!room && !room.gp && room.settings.mode === 'sprint';
    const sprintSetup = this.menus.has('setup') && this.free.mode === 'sprint' && this.mode === 'free';
    // The editor: the mech being edited (from a Sprint, lit as it races there).
    if (CUSTOM_SCREENS.has(id)) {
      const d = this.menus.data as { role?: Role; team?: number } | undefined;
      if (d?.role !== undefined) return { team: d.team ?? this.loadout.team, role: d.role, sprint: (sprintSetup || sprintRoom) && d.role === ROLE.FW };
    }
    if (sprintRoom) return { team: this.loadout.team, role: ROLE.FW, sprint: true };
    if (id === 'room' || this.menus.has('room')) {
      const v = this.online.lobby;
      const me = v?.players.find((p) => p.pid === this.online.pid);
      if (v && me && me.side >= 0) return { team: v.sides[me.side].faction, role: me.role };
    }
    if (id === 'briefing' || id === 'standings' || id === 'award' || this.menus.has('briefing')) {
      const ev = this.gpEvents[this.gpKind];
      if (ev) return { team: ev.faction, role: this.loadout.role };
    }
    if ((id === 'online' || this.menus.has('online')) && this.online.squadView && this.online.squadSize > 1) {
      return { team: this.online.squadView.faction, role: this.loadout.role };
    }
    if (id === 'setup' && sprintSetup) return { team: this.loadout.team, role: ROLE.FW, sprint: true };
    return this.loadout;
  }

  /** A race between computer pilots running behind the title screen. */
  private startAttract(): void {
    this.state = 'title';
    this.setSession(null, (Math.random() * 1e9) | 0);
    this.attracting = true;
    (this.session as LocalSession).fastForward(88 + Math.random() * 24);
    this.view.focusId = (Math.random() * 6) | 0;
    this.view.cam.mode = 'play';
    this.attractTimer = 0;
  }

  /** Your mech, alone, in your team's hangar. */
  showGarage(l: { team: number; role: Role; sprint?: boolean }): void {
    const started = this.renderer.reviewProbe ? performance.now() : 0;
    // A change of circuit, rival or match changes nothing on screen: only a
    // new team or frame (or your Sprint mech for the stock one) rebuilds the scene.
    const sprint = !!l.sprint;
    // (A Sprint's mech is lit in your colour: a new colour shows it again.)
    const colour = sprint ? pilotColour() : -1;
    const shown = this.garageShown;
    if (this.state === 'garage' && shown && shown.team === l.team && shown.role === l.role && shown.sprint === sprint && shown.colour === colour) return;
    this.state = 'garage';
    this.hud.hide();
    // The grid, stationary, with your mech in front of the camera, on whichever circuit is built.
    // (A Sprint's mech flies for no faction: lit in your colour.)
    const setup: RoundSetup = { factions: [sprint ? -1 : l.team, (l.team + 1) % LIVERIES.length], role: l.role, rivalSkill: 0.55, teamSkill: 0.6, track: this.trackId, cfg: MATCH_OPTIONS[0].cfg, look: sprint ? this.sprintMech() : undefined };
    this.setSession(setup, 1, false, true);
    this.garageShown = { team: l.team, role: l.role, sprint, colour };
    this.view.cam.mode = 'orbit';
    [this.view.cam.shiftX, this.view.cam.shiftY] = garageShift();
    this.view.cam.reset();
    const m = this.session.race.mechs[this.session.localId];
    const livery = LIVERIES[l.team] ?? LIVERIES[0];
    trackMatrix(this.session.track, m.s, m.d, 0, m.facing, this.hangarFrame);
    this.hangar.setTeam({ id: livery.id, name: factionName(livery).toUpperCase(), css: livery.css, glow: livery.glow, emblem: emblemUrl(l.team) });
    this.hangar.setBay(l.role + 1);
    this.hangar.show(this.hangarFrame);
    this.trackVis.group.visible = false;
    this.world.group.visible = false;
    // Indoors: none of the circuit's weather (Monsoon's rain on the mechs).
    this.renderer.outdoors = false;
    this.view.solo = true;
    this.view.cam.orbitFrame = this.hangarFrame;
    this.renderer.reviewProbe?.recordPreview(performance.now() - started);
  }

  /**
   * Switch the 80s anime look on or off (remembered like any tuning value,
   * and it replaces a ?look= on the URL). Returns whether it is now on.
   */
  toggleLook(): boolean {
    const on = !look.on;
    this.lookParam = null;
    const item = TUNE_GROUPS.flatMap((g) => g.items).find((i) => i.key === 'look');
    if (item) this.tuning.set(item, on ? 1 : 0);
    look.on = on;
    this.hud.showNotice(on ? 'Look: 80s anime' : 'Look: plain', false, 1.2);
    this.menus.refreshLook();
    return on;
  }

  // ---- video settings -------------------------------------------------------

  /** Change video settings: applied at once and kept on this device. */
  setVideo(change: Partial<VideoSettings>): void {
    const panels = change.panels !== undefined && change.panels !== video.panels;
    Object.assign(video, change);
    saveVideo();
    this.renderer.crt = video.crt;
    if (change.resolution !== undefined) this.applyResolution();
    applyFrame();
    if (panels) {
      setSunhawkPanels(video.panels);
      this.refreshSunhawk('all');
    }
    this.menus.refresh();
  }

  /** The video setting's resolution, on the renderer. */
  private applyResolution(): void {
    this.renderer.setResolution(RESOLUTIONS.find((r) => r.id === video.resolution)?.scale ?? 1);
  }

  /** The mechs' and effects' drawings a second in the anime look (the look's own tuning value). */
  get drawingsPerSecond(): number {
    return Math.round(this.tuning.feel.lookSteps);
  }

  setDrawings(n: number): void {
    const item = TUNE_GROUPS.flatMap((g) => g.items).find((i) => i.key === 'lookSteps');
    if (item) this.tuning.set(item, n);
    this.menus.refresh();
  }

  private cycleSunhawk(dir = 1): void {
    cycleSunhawkModel(dir);
    this.refreshSunhawk();
    this.hud.showNotice(`Sunhawk: ${SUNHAWK_LABELS[getSunhawkModel()]}`, false, 1.8);
  }

  private cycleRoster(): void {
    toggleRosterModel();
    this.refreshSunhawk('roster');
    this.hud.showNotice(`Mechs: ${rosterLabel()}`, false, 1.8);
  }

  private refreshSunhawk(scope: 'sunhawk' | 'roster' | 'all' = 'sunhawk'): void {
    useOldSwift(false);
    this.view.refreshMechModels(scope);
    celify(this.renderer.scene);
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

  // ---- Free Play -----------------------------------------------------------------

  private freeHangar(): HangarData {
    return { context: 'Free Play', confirm: 'Match setup', onConfirm: () => this.menus.push('setup') };
  }

  openFreePlay(): void {
    this.mode = 'free';
    this.menus.push<HangarData>('hangar', this.freeHangar());
  }

  /** A Free Play match in the format picked in setup, starting with round one. */
  startFree(): void {
    this.mode = 'free';
    const c = this.free;
    if (c.mode === 'sprint') {
      // You and one computer pilot from each faction, in Forwards.
      const cfg = (SPRINT_OPTIONS[c.sprint] ?? SPRINT_OPTIONS[0]).cfg;
      this.setup = { factions: [-1, ...LIVERIES.map((_, f) => f)], sprint: true, role: ROLE.FW, rivalSkill: RIVAL_SKILL[c.rivals] ?? 0.55, teamSkill: 0.6, track: c.track, cfg };
      this.match = createMatch(cfg, this.setup.factions.length);
      return this.startRound();
    }
    const others = LIVERIES.map((_, f) => f).filter((f) => f !== this.loadout.team);
    const rival = c.rival >= 0 && c.rival !== this.loadout.team && c.rival < LIVERIES.length ? c.rival : others[(Math.random() * others.length) | 0];
    const cfg = (MATCH_OPTIONS[c.match] ?? MATCH_OPTIONS[0]).cfg;
    this.setup = { factions: [this.loadout.team, rival], role: this.loadout.role, rivalSkill: RIVAL_SKILL[c.rivals] ?? 0.55, teamSkill: 0.6, track: c.track, cfg };
    this.match = createMatch(cfg);
    this.startRound();
  }

  /** From the pause menu or the results: back to the mode's setup screen. */
  toSetup(): void {
    this.hud.hide();
    this.eyecatch.hide();
    if (this.state === 'race' || this.state === 'paused' || this.state === 'results') this.state = 'garage';
    if (this.mode === 'gp') {
      const ev = this.gpEvents[this.gpKind];
      if (ev && ev.rounds[ev.current]?.you && !ev.rounds[ev.current].you!.result) this.menus.reset('briefing', { kind: this.gpKind }, ['title', 'modes', 'gp']);
      else this.menus.reset('gp', undefined, ['title', 'modes']);
    } else {
      this.mode = 'free';
      this.menus.reset('setup', undefined, ['title', 'modes', { id: 'hangar', data: this.freeHangar() }]);
    }
    this.music('menu');
  }

  /** From the results (or a restart after the flag): the next round, or what follows the match. */
  next(): void {
    if (this.mode === 'online') return void this.online.sendRoom('continue', { at: this.online.lobby?.phase });
    if (this.match && this.match.winner < 0) return this.startRound();
    if (this.mode === 'gp') return this.gpMatchDone();
    this.startFree();
  }

  restart(): void {
    if (this.mode === 'online') return;
    // Once a round has been banked, "restart" can only mean moving on.
    if (this.roundScored) this.next();
    else this.startRound();
  }

  /** What the HUD shows under the score: the format, the round, and how the match stands. */
  private matchLabel(): string {
    const m = this.match;
    if (this.session.race.sprint) return m ? this.sprintLabel(m) : 'Sprint';
    const a = factionName(LIVERIES[this.raceFactions[0]]);
    const b = factionName(LIVERIES[this.raceFactions[1]]);
    let gp = '';
    const ev = this.mode === 'gp' ? this.gpEvents[this.gpKind] : this.mode === 'online' ? this.online.lobby?.gp : null;
    if (ev) gp = `${eventName(ev)}, round ${yourRoundNumber(ev)} of ${playedRounds(ev)}`;
    if (!m || (m.cfg.mode === 'series' && m.cfg.bestOf === 1)) return gp;
    const round = `Round ${m.rounds.length + 1}`;
    const pre = gp ? `${gp} · ` : '';
    if (m.cfg.mode === 'series') return `${pre}Best of ${m.cfg.bestOf} · ${round} · ${a} ${m.wins[0]}–${m.wins[1]} ${b}`;
    return `${pre}First to ${m.cfg.target} · ${round} · ${a} ${m.totals[0]}–${m.totals[1]} ${b}`;
  }

  /**
   * A Sprint's line under the score: the format, the race, where you stand
   * and who leads (a single race: just "Sprint").
   */
  private sprintLabel(m: MatchState): string {
    const race = this.session.race;
    const name = (i: number) => race.mechs.find((x) => x.team === i)?.name ?? '';
    const k = m.rounds.length + 1;
    if (m.cfg.mode === 'races' && (m.cfg.races ?? 1) <= 1) return 'Sprint';
    const order = standings(m);
    const me = race.mechs[this.session.localId];
    const lead = order[0];
    const wins = m.cfg.mode === 'wins';
    const score = (i: number) => (wins ? `${m.wins[i]} win${m.wins[i] === 1 ? '' : 's'}` : `${m.totals[i]} pts`);
    const head = wins ? `Sprint, first to ${m.cfg.wins} wins · Race ${k}` : `Sprint · Race ${k} of ${m.cfg.races}`;
    if (!m.rounds.length) return head;
    if (!me) return `${head} · ${name(lead)} leads, ${score(lead)}`;
    const place = order.indexOf(me.team) + 1;
    const you = `You ${['1st', '2nd', '3rd', '4th', '5th', '6th'][place - 1]}, ${score(me.team)}`;
    return lead === me.team ? `${head} · ${you}` : `${head} · ${you} · ${name(lead)} leads, ${score(lead)}`;
  }

  /** Start (or restart) the next unscored round of an offline match. */
  private startRound(): void {
    const setup = this.setup;
    if (!setup) return;
    if (!this.match) this.match = createMatch(setup.cfg, setup.factions.length);
    this.roundScored = false;
    this.state = 'race';
    this.menus.show(null);
    this.input.swallowHeld();
    // The teams swap sides of the grid from one round to the next.
    const round = this.match.rounds.length;
    this.setSession(setup, this.opts.seed !== undefined ? this.opts.seed + round : (Math.random() * 1e9) | 0, round % 2 === 1);
    const local = this.session as LocalSession;
    if (this.opts.demo) local.race.mechs[local.localId].human = false;
    if (this.opts.skip) local.fastForward(this.opts.skip);
    this.beginRace();
  }

  /** The HUD, camera and music for a race just put on screen. */
  private beginRace(): void {
    this.hud.begin(this.session.race, this.session.track, this.session.localId, this.raceFactions);
    this.hud.setMatch(this.matchLabel());
    this.hud.setDevice(this.input.device);
    this.view.cam.reset();
    this.view.cam.mode = this.session.race.phase === PHASE.COUNTDOWN ? 'intro' : 'play';
    this.music('race', this.session.track.def.theme ?? 'meridian');
  }

  private pause(): void {
    if (this.state !== 'race') return;
    this.state = 'paused';
    if (this.session instanceof NetSession) this.session.autopilot = true;
    this.menus.reset('pause');
    this.audio.play('ui_select');
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'race';
    if (this.session instanceof NetSession) this.session.autopilot = false;
    this.menus.show(null);
    // The button that chose "Resume" must not also fire a boost, a dash or an ability.
    this.input.swallowHeld();
  }

  // ---- Grand Prix ----------------------------------------------------------------

  gpEvent(kind: GpKind): GpEvent | null {
    return this.gpEvents[kind];
  }

  gpDifficulty(): number {
    return gpStore.difficulty();
  }

  setGpDifficulty(d: number): void {
    gpStore.setDifficulty(d);
    this.menus.refresh();
  }

  /** Medals won, by cup id (and the Grand Tour's), each by difficulty; Zenith Cups won, by difficulty. */
  gpMedals(): { byCup: Record<string, Record<number, Medal | undefined>>; season: Record<number, number> } {
    return { byCup: gpStore.medals(), season: gpStore.cupsWon() };
  }

  /**
   * From the hub: carry on with the event, or pick a faction and start one
   * (`cup`: which cup; one cup is under way at a time, and the hub asks
   * before another is started in its place).
   */
  openGp(kind: GpKind, cup = CUPS[0].id): void {
    this.mode = 'gp';
    this.gpKind = kind;
    const ev = this.gpEvents[kind];
    if (ev && (kind !== 'cup' || ev.cup === cup)) {
      this.gpRunner.run(ev);
      if (isOver(ev)) {
        const place = finalPlace(ev);
        this.menus.push('award', { kind, place, medal: singleRaces(ev) ? medalFor(place) : null });
      } else if (ev.rounds[ev.current].you?.result) this.menus.push('standings', { kind });
      else this.menus.push('briefing', { kind });
      return;
    }
    const name = kind === 'cup' ? (CUPS.find((c) => c.id === cup)?.name ?? 'Cup') : kind === 'tour' ? 'Grand Tour' : 'Zenith Cup season';
    this.menus.push<HangarData>('hangar', {
      context: `Grand Prix · ${name} · pick the faction you will race for`,
      confirm: kind === 'cup' ? 'Start the cup' : kind === 'tour' ? 'Start the Grand Tour' : 'Start the season',
      onConfirm: () => {
        this.newGp(kind, cup);
        this.menus.replace('briefing', { kind });
      },
    });
  }

  newGp(kind: GpKind, cup = CUPS[0].id): void {
    const seed = (Math.random() * 1e9) | 0;
    const team = this.loadout.team;
    const diff = this.gpDifficulty();
    const ev = kind === 'cup' ? newCup(cup, team, diff, seed) : kind === 'tour' ? newTour(team, diff, seed) : newSeason(team, diff, seed);
    gpStore.saveEvent(ev);
    this.gpEvents[kind] = ev;
    this.gpKind = kind;
    this.gpRunner.run(ev);
  }

  abandonGp(kind: GpKind): void {
    gpStore.clearEvent(kind);
    this.gpEvents[kind] = null;
    if (this.gpKind === kind) this.gpRunner.run(null);
  }

  openGpHangar(kind: GpKind): void {
    const ev = this.gpEvents[kind];
    if (!ev) return;
    this.menus.push<HangarData>('hangar', {
      context: `${eventName(ev)} · round ${yourRoundNumber(ev)} of ${playedRounds(ev)}`,
      confirm: 'Done',
      onConfirm: () => this.menus.pop(),
      team: ev.faction,
      factionLock: `Your faction is fixed for the whole ${kind === 'cup' ? 'cup' : kind === 'tour' ? 'Grand Tour' : 'season'}`,
      onChange: (_t, r) => this.setLoadout({ team: this.loadout.team, role: r }),
    });
  }

  startGpRound(kind: GpKind): void {
    const ev = this.gpEvents[kind];
    const r = ev?.rounds[ev.current];
    if (!ev || !r?.you) return;
    this.mode = 'gp';
    this.gpKind = kind;
    const cfg = matchFormat(ev);
    this.setup = { factions: [ev.faction, r.you.b], role: this.loadout.role, rivalSkill: GP_SKILL[ev.difficulty] ?? 0.55, teamSkill: GP_TEAMMATE_SKILL, track: r.circuit, cfg };
    this.match = createMatch(cfg);
    this.gpRunner.run(ev);
    this.startRound();
  }

  /** Your match of this round is decided: bank it and show the standings. */
  private gpMatchDone(): void {
    const ev = this.gpEvents[this.gpKind];
    const m = this.match;
    if (!ev || !m) return;
    recordYours(ev, { wins: [m.wins[0], m.wins[1]], points: [m.totals[0], m.totals[1]], races: m.rounds.length, winner: m.winner === 1 ? 1 : 0 });
    gpStore.saveEvent(ev);
    this.match = null;
    this.state = 'garage';
    this.hud.hide();
    this.music('menu');
    this.menus.reset('standings', { kind: this.gpKind }, ['title', 'modes', 'gp']);
  }

  /** On from the standings (or a matchday off): the next briefing, or the award. */
  gpAdvance(kind: GpKind): void {
    const ev = this.gpEvents[kind];
    if (!ev || !advance(ev)) return;
    gpStore.saveEvent(ev);
    // (The Grand Tour's decider only now has its other race to run.)
    this.gpRunner.run(ev);
    if (isOver(ev)) {
      const place = finalPlace(ev);
      const medal = singleRaces(ev) ? medalFor(place) : null;
      if (singleRaces(ev)) gpStore.awardMedal(ev.cup, ev.difficulty, medal);
      else if (place === 1) gpStore.awardZenithCup(ev.difficulty);
      this.menus.replace('award', { kind, place, medal });
      // (The music first: the jingle is only for the synthesised music.)
      this.music('results', place === 1 ? 'win' : 'loss');
      this.resultJingle(place === 1);
    } else {
      this.menus.replace('briefing', { kind });
    }
  }

  /** The award seen: the event is put away, its medals and cups kept. */
  finishGp(kind: GpKind): void {
    gpStore.clearEvent(kind);
    this.gpEvents[kind] = null;
    if (!this.menus.popTo('gp')) this.menus.reset('gp', undefined, ['title', 'modes']);
  }

  // ---- Online ----------------------------------------------------------------------

  private loadoutMsg(): Loadout {
    return { faction: this.loadout.team, role: this.loadout.role };
  }

  /** The squad coming into a room with you, when you lead one of two or three. */
  private squadTicket(): SquadTicket | undefined {
    const v = this.online.squadView;
    return v && v.members.length > 1 && this.online.leading ? { id: v.code, size: v.members.length } : undefined;
  }

  openOnline(): void {
    if (!this.online.available) return void this.menus.push('online');
    if (!this.callsign)
      return this.askCallsign(() => {
        this.menus.replace('online');
        void this.ensureSquad();
      }, 'Pick a callsign: the name your friends see on the grid.');
    this.menus.push('online');
    void this.ensureSquad();
  }

  /** You always have a squad online, even a squad of one: it is how friends join you. */
  private ensureSquad(): Promise<void> {
    if (this.online.squad || !this.online.available) return Promise.resolve();
    // One at a time: a squad leave and the hub can both ask for one.
    this.squadMaking ??= (async () => {
      this.onlineStatus = 'Connecting…';
      this.menus.refresh();
      try {
        await this.online.createSquad(this.loadoutMsg());
        this.onlineStatus = '';
      } catch (e) {
        this.onlineStatus = failure(e);
      }
      this.squadMaking = null;
      if (this.menus.screen === 'online') this.menus.refresh();
    })();
    return this.squadMaking;
  }
  private squadMaking: Promise<void> | null = null;

  leaveOnline(): void {
    const others = this.online.squadSize > 1;
    const go = () => {
      void this.online.leaveRoom();
      void this.online.leaveSquad();
      this.mode = null;
      if (!this.menus.popTo('modes')) this.menus.reset('modes', undefined, ['title']);
    };
    if (others) confirmDialog(this.menus, 'Leave Online?', 'You leave your squad too.', 'Leave', go);
    else go();
  }

  askCallsign(then?: () => void, hint = 'The name your friends see on the grid and the results. 3 to 16 characters.'): void {
    this.menus.push<EntryData>('entry', {
      title: 'Callsign',
      hint,
      kind: 'callsign',
      // Until you choose, the one made up for you: Done keeps it.
      value: this.callsign || this.pilotName,
      submit: (v) => {
        const problem = setCallsign(v);
        if (problem) return problem;
        this.tellPilot();
        if (then) then();
        else this.menus.pop();
        return null;
      },
    });
  }

  async createRoom(): Promise<void> {
    this.onlineStatus = 'Making a room…';
    this.menus.refresh();
    try {
      await this.online.createRoom(this.loadoutMsg(), this.squadTicket());
      this.onlineStatus = '';
      if (this.squadTicket() && this.online.room) this.online.sendSquad('go', { code: this.online.room.roomId });
      this.menus.push('room');
    } catch (e) {
      this.onlineStatus = '';
      this.menus.refresh();
      this.menus.toast(failure(e), 4);
    }
  }

  /** The squad's Grand Prix (its leader only): the online hub's Grand Prix screen. */
  openOnlineGp(): void {
    const why = gpBlocked(this);
    if (why) return this.menus.toast(why);
    this.menus.push('online-gp');
  }

  /** A room that is the squad's cup, Grand Tour or (short) season; the squad follows the leader in. */
  async createGpRoom(kind: GpKind, cup?: string): Promise<void> {
    const why = gpBlocked(this);
    const ticket = this.squadTicket();
    if (why || !ticket) return this.menus.toast(why ?? 'The Grand Prix online is for a squad of two or three');
    this.onlineStatus = kind === 'cup' ? 'Setting up the cup…' : kind === 'tour' ? 'Setting up the Grand Tour…' : 'Setting up the season…';
    this.menus.refresh();
    try {
      await this.online.createRoom(this.loadoutMsg(), ticket, { kind, difficulty: this.gpDifficulty(), ...(cup ? { cup } : {}) });
      this.onlineStatus = '';
      if (this.online.room) this.online.sendSquad('go', { code: this.online.room.roomId });
      this.toRoom();
    } catch (e) {
      this.onlineStatus = '';
      this.menus.refresh();
      this.menus.toast(failure(e), 4);
    }
  }

  askRoomCode(): void {
    this.menus.push<EntryData>('entry', {
      title: 'Join room',
      hint: 'The 5-character code your friend sees on their room screen, or their invite link.',
      kind: 'code',
      submit: async (v) => {
        const code = normalizeCode(v);
        if (!code) return 'Codes are 5 characters, like K7Q2X';
        try {
          await this.online.joinRoom(code, this.loadoutMsg(), this.squadTicket());
        } catch (e) {
          return failure(e);
        }
        if (this.squadTicket()) this.online.sendSquad('go', { code });
        this.menus.replace('room');
        return null;
      },
    });
  }

  async inviteToSquad(): Promise<void> {
    await this.ensureSquad();
    const code = this.online.squadView?.code ?? this.online.squad?.roomId;
    if (code) inviteDialog(this.menus, this, 'squad', code);
    else this.menus.toast(this.onlineStatus || "Can't reach the game server.");
  }

  askSquadCode(): void {
    this.menus.push<EntryData>('entry', {
      title: 'Join a squad',
      hint: "Your friend's squad code, from Invite to squad on their Online screen.",
      kind: 'code',
      submit: async (v) => {
        const code = normalizeCode(v);
        if (!code) return 'Codes are 5 characters, like K7Q2X';
        try {
          await this.online.joinSquad(code, this.loadoutMsg());
        } catch (e) {
          return failure(e);
        }
        this.menus.pop();
        return null;
      },
    });
  }

  async leaveSquad(): Promise<void> {
    await this.online.leaveSquad();
    await this.ensureSquad();
  }

  openOnlineHangar(): void {
    // Read the squad as it is at each update: the leader may change the
    // faction, people may join, leave or pick other frames.
    const o = this.online;
    const grouped = () => !!o.squadView && o.squadView.members.length > 1;
    const following = () => grouped() && !o.leading;
    this.menus.push<HangarData>('hangar', {
      context: () => (grouped() ? `Online · your squad · ${factionName(LIVERIES[o.squadView!.faction])}` : 'Online'),
      confirm: 'Done',
      onConfirm: () => this.menus.pop(),
      // Your own pick, always: anyone may look at any frame.
      live: () => ({ team: following() ? o.squadView!.faction : this.loadout.team, role: this.loadout.role }),
      factionLock: () => (following() ? "Your squad's leader picks its faction" : null),
      onChange: (t, r) => {
        this.setLoadout({ team: following() ? this.loadout.team : t, role: r });
        o.sendSquad('loadout', { faction: this.loadout.team, role: r });
      },
      crew: {
        title: () => (grouped() ? 'Your squad' : 'Your squad: just you so far'),
        at: (r) => {
          const sv = o.squadView;
          const people = sv ? sv.members.filter((x) => (x.pid === o.squadPid ? this.loadout.role : x.role) === r).map((x) => ({ name: x.callsign, you: x.pid === o.squadPid, locked: false })) : [];
          if (!sv && r === this.loadout.role) people.push({ name: this.pilotName, you: true, locked: false });
          return { people };
        },
      },
    });
  }

  openRoomHangar(): void {
    const v = this.online.lobby;
    const me = v?.players.find((p) => p.pid === this.online.pid);
    if (!v || !me || me.side < 0) return;
    if (v.phase !== 'lobby' && v.phase !== 'countdown') return this.menus.toast(v.gp ? 'Frames change at the next briefing' : 'Seats change between matches');
    // Everything is read from the room as it is at each update: the captain
    // may change the faction, teammates pick and lock in, the captain may leave.
    const o = this.online;
    const seat = () => {
      const now = o.lobby;
      const cur = now?.players.find((p) => p.pid === o.pid);
      return now && cur && cur.side >= 0 ? { now, cur, side: now.sides[cur.side] } : null;
    };
    // Your team's captain picks its faction, and so can the host (not in a Grand Prix: the event set it).
    const captain = () => {
      const s = seat();
      return !!s && !s.now.gp && (s.side.captain === o.pid || s.now.host === o.pid);
    };
    this.menus.push<HangarData>('hangar', {
      context: () => {
        const s = seat();
        if (s?.now.gp) return `${eventName(s.now.gp)} · ${factionName(LIVERIES[s.side.faction])} · online`;
        return s ? `Room ${s.now.code} · ${factionName(LIVERIES[s.side.faction])}` : `Room ${v.code}`;
      },
      confirm: 'Done',
      onConfirm: () => this.menus.pop(),
      // Your own pick, always: anyone may look at any frame; Ready locks it in.
      live: () => {
        const s = seat();
        return s ? { team: s.side.faction, role: s.cur.role } : null;
      },
      factionLock: () => {
        const gp = o.lobby?.gp;
        if (gp) return `Your faction is fixed for the whole ${gp.kind === 'cup' ? 'cup' : gp.kind === 'tour' ? 'Grand Tour' : 'season'}`;
        return captain() ? null : "Your team's captain or the host picks its faction";
      },
      factionTaken: (f) => {
        const s = seat();
        return s && f === s.now.sides[1 - s.cur.side].faction ? 'The other team flies that faction' : null;
      },
      crew: {
        title: () => 'Your team',
        at: (r) => {
          const s = seat();
          if (!s) return { people: [] };
          const people = s.now.players.filter((p) => p.side === s.cur.side && p.role === r).map((p) => ({ name: p.callsign, you: p.pid === o.pid, locked: p.ready }));
          return { people, cpu: people.length ? undefined : LIVERIES[s.side.faction].pilots[r] };
        },
        frameLock: () => (seat()?.cur.ready ? "You're locked in: press Not ready to change your frame" : null),
      },
      onChange: (t, r) => {
        const s = seat();
        if (!s) return;
        const lead = captain();
        if (lead && t !== s.side.faction) o.sendRoom('faction', { faction: t, side: s.cur.side });
        if (r !== s.cur.role) o.sendRoom('pick', { role: r });
        this.setLoadout({ team: lead ? t : this.loadout.team, role: r });
      },
    });
  }

  confirmLeaveRoom(): void {
    const v = this.online.lobby;
    if (v?.gp) {
      if (v.phase === 'award') return this.leaveRoom();
      return confirmDialog(this.menus, 'Leave the Grand Prix?', 'Your squad carries on without you, and a computer pilot takes your frame.', 'Leave', () => this.leaveRoom());
    }
    const inMatch = !!v && v.phase !== 'lobby' && v.phase !== 'countdown';
    confirmDialog(this.menus, 'Leave the room?', inMatch ? 'Your seat goes to a computer pilot for the rest of this match.' : 'You can come back with its code while it is open.', 'Leave', () => this.leaveRoom());
  }

  leaveMatch(): void {
    this.leaveRoom();
  }

  leaveRoom(): void {
    void this.online.leaveRoom();
    this.backToHub(null);
  }

  /** Out of the room (left, removed, or it closed): the Online hub. */
  private backToHub(text: string | null): void {
    this.mode = null;
    this.hud.hide();
    this.eyecatch.hide();
    if (this.state === 'race' || this.state === 'paused' || this.state === 'results') this.state = 'garage';
    this.menus.reset('online', undefined, ['title', 'modes']);
    this.music('menu');
    void this.ensureSquad();
    if (text) messageDialog(this.menus, 'Out of the room', text);
  }

  /** The dialog for a request made to you (shot calling), and the one you last answered. */
  private request: { key: string; dialog: DialogData } | null = null;
  private answered: string | null = null;

  /**
   * Requests made to you, kept in step with the room: one dialog per
   * request however often it is asked, gone by itself once the request is
   * settled or withdrawn, and not shown again while your answer is on its way.
   */
  private syncRequests(): void {
    const o = this.online;
    const v = o.lobby;
    const me = v?.players.find((p) => p.pid === o.pid);
    let want: { key: string; from: string } | null = null;
    if (this.menus.has('room') && v && me && me.side >= 0 && (v.phase === 'lobby' || v.phase === 'countdown')) {
      const asker = v.sides[me.side].caller === me.pid ? v.callerAsks[me.side] : null;
      if (asker && asker !== me.pid) want = { key: `caller:${asker}`, from: asker };
    }
    if (want?.key !== this.answered) this.answered = null;
    if (this.request && this.request.key !== want?.key) {
      this.menus.remove(this.request.dialog);
      this.request = null;
    }
    if (!want || this.request || want.key === this.answered) return;
    const { key, from } = want;
    const who = v?.players.find((p) => p.pid === from)?.callsign ?? 'Your teammate';
    const answer = (accept: boolean) => () => {
      if (this.request) this.menus.remove(this.request.dialog);
      this.request = null;
      this.answered = key;
      o.sendRoom('caller', { action: accept ? 'accept' : 'decline' });
    };
    const dialog: DialogData = { title: 'Shot calling', text: `${who} asks to give your computer pilot its orders.`, options: [{ label: 'Hand it over', go: true, run: answer(true) }, { label: 'Keep it', run: answer(false) }], cancel: answer(false) };
    this.request = { key, dialog };
    this.menus.push<DialogData>('dialog', dialog);
  }

  /** The match is over (or was ended): out of the race and back to the room's screen. */
  private roomAgain(toast: string | null): void {
    const wasRacing = this.state === 'race' || this.state === 'paused' || this.state === 'results';
    this.mode = null;
    if (wasRacing) {
      this.state = 'garage';
      this.hud.hide();
      this.eyecatch.hide();
      this.music('menu');
    }
    this.toRoom();
    if (toast) this.menus.toast(toast);
  }

  /** Into the room's screen (a fresh stack beneath it: title, play, online). */
  private toRoom(): void {
    this.menus.reset('room', undefined, ['title', 'modes', 'online']);
  }

  /** Invite links, and the room or squad this tab was in before a reload. */
  private async bootOnline(): Promise<void> {
    if (!this.online.available) return;
    const room = this.opts.room ? normalizeCode(this.opts.room) : null;
    const squad = this.opts.squad ? normalizeCode(this.opts.squad) : null;
    // The code goes from the address bar, so a reload does not join again.
    if (room || squad) {
      const u = new URL(location.href);
      u.searchParams.delete('room');
      u.searchParams.delete('squad');
      history.replaceState(null, '', u.toString());
    }
    const go = async () => {
      if (room) {
        this.onlineStatus = 'Joining…';
        this.toRoom();
        try {
          await this.online.joinRoom(room, this.loadoutMsg());
          this.onlineStatus = '';
          this.menus.refresh();
        } catch (e) {
          this.onlineStatus = '';
          this.menus.reset('online', undefined, ['title', 'modes']);
          messageDialog(this.menus, "Couldn't join", failure(e));
        }
        void this.ensureSquad();
      } else if (squad) {
        this.menus.reset('online', undefined, ['title', 'modes']);
        try {
          await this.online.joinSquad(squad, this.loadoutMsg());
        } catch (e) {
          messageDialog(this.menus, "Couldn't join the squad", failure(e));
          void this.ensureSquad();
        }
        this.menus.refresh();
      }
    };
    if (room || squad) {
      if (!this.callsign) {
        this.menus.reset('title');
        this.menus.push('modes');
        this.askCallsign(() => void go(), room ? 'Pick a callsign to join your friend: the name they see on the grid.' : 'Pick a callsign to join the squad.');
      } else await go();
      return;
    }
    // A reload: back where this tab was.
    try {
      const back = await this.online.resume(this.loadoutMsg());
      if (back) this.toRoom();
      else if (this.online.squad) this.menus.reset('online', undefined, ['title', 'modes']);
    } catch {
      /* nothing to resume */
    }
  }

  private wireOnline(): void {
    const o = this.online;
    o.on('lobby', (v) => {
      // Still in a race the room has finished with (its lobbyAgain was missed
      // while the connection was down): back to the room with everyone else.
      const racing = this.state === 'race' || this.state === 'paused' || this.state === 'results';
      if (this.mode === 'online' && racing && v.phase !== 'race' && v.phase !== 'results' && v.phase !== 'final') return this.roomAgain(null);
      // A room set to a Sprint: it is raced in your own Forward, made now from your faction's if you have none.
      if (v.settings.mode === 'sprint' && !v.gp && !customMech(ROLE.FW)) {
        this.sprintMech();
        this.tellPilot();
      }
      const s = this.menus.screen;
      if (s === 'room') {
        this.menus.refresh();
        const l = this.previewLoadout('room');
        this.preview(l);
      } else if (s === 'results' && this.mode === 'online') this.menus.refresh();
      else if (s === 'hangar' && this.menus.has('room')) this.menus.refresh();
      this.syncRequests();
    });
    o.on('matchStart', (msg) => this.startNetRound(msg));
    o.on('tick', (msg) => {
      if (this.session instanceof NetSession) this.session.onTicks(msg);
    });
    o.on('key', (msg) => {
      if (this.session instanceof NetSession) this.session.onKey(msg);
    });
    o.on('roundEnd', (msg) => {
      this.match = msg.match;
      const me = this.session instanceof NetSession && this.session.localId >= 0 ? this.session.race.mechs[this.session.localId] : null;
      if (me && this.state === 'race') this.resultJingle(msg.round.winner === me.team);
      if (this.menus.screen === 'results') this.menus.refresh();
      // (Should the room's word come after the results are up, their music follows it.)
      if (this.state === 'results' && this.menus.screen === 'results') this.resultsMusic();
    });
    o.on('lobbyAgain', (msg) => {
      if (this.mode !== 'online' && !this.menus.has('room')) return;
      this.roomAgain(msg.reason === 'ended' ? 'The host ended the match' : null);
    });
    o.on('callerAsk', () => this.syncRequests());
    o.on('notice', ({ text }) => {
      if (this.state === 'race') this.hud.showNotice(text, false, 2.2);
      else this.menus.toast(text);
    });
    o.on('error', ({ code, text }) => {
      if (code === 'kicked' || code === 'replaced') return;
      if (this.state === 'race') this.hud.showNotice(text, true, 3);
      else this.menus.toast(text, 4);
    });
    o.on('roomLeft', ({ text }) => {
      if (this.menus.has('room') || this.mode === 'online') this.backToHub(text);
    });
    o.on('drop', () => {
      if (this.state === 'race' || this.state === 'paused') this.hud.showNotice('Connection lost: reconnecting…', true, 4);
      else this.menus.toast('Connection lost: reconnecting…', 4);
    });
    o.on('reconnect', () => {
      if (this.state === 'race' || this.state === 'paused') this.hud.showNotice('Reconnected', false, 1.6);
      else this.menus.toast('Reconnected');
    });
    o.on('squad', (v) => {
      this.syncRequests();
      // A squad is one team: members fly the leader's faction. The hub, or
      // the hangar opened from it, shows the squad as it is now (a room
      // above them shows the room's teams instead).
      if (!this.menus.has('online') || this.menus.has('room')) return;
      if (this.menus.screen === 'online' || this.menus.screen === 'online-gp' || this.menus.screen === 'hangar') this.menus.refresh();
      this.preview(this.previewLoadout(this.menus.screen ?? 'online'));
    });
    o.on('follow', ({ code, size }) => {
      // (The squad's code is its room's: known from joining it, before its first view.)
      const squad = o.squadView?.code ?? o.squad?.roomId;
      if (!squad) return;
      // Your leader has gone into a room (or is in one as you join their squad): follow them in.
      void (async () => {
        try {
          await o.joinRoom(code, this.loadoutMsg(), { id: squad, size, follow: true });
          if (this.state === 'race' || this.state === 'paused' || this.state === 'results') {
            this.state = 'garage';
            this.hud.hide();
          }
          this.toRoom();
          this.menus.toast('Following your leader');
        } catch (e) {
          this.menus.toast(`Couldn't follow your leader: ${failure(e)}`, 4);
        }
      })();
    });
    o.on('squadLeft', ({ text }) => {
      if (text && this.menus.has('online')) this.menus.toast(text, 4);
      // Removed from a squad (or it closed): a squad of your own again, wherever you are online.
      if (this.menus.has('online')) void this.ensureSquad();
      if (this.menus.screen === 'online') this.menus.refresh();
    });
  }

  /** The room's race begins (or a reconnect rejoins one under way). */
  private startNetRound(msg: MatchStartMsg): void {
    if (msg.seat < 0) return;
    this.mode = 'online';
    this.raceFactions = [...msg.factions];
    this.useTrack(msg.track);
    const session = new NetSession(
      msg,
      // Nothing goes out while the connection is down: the room starts a new
      // epoch when it comes back, and the race picks up from its keyframe.
      (out) => {
        if (!this.online.dropped) this.online.sendRoom('input', out);
      },
      () => this.online.sendRoom('resync'),
    );
    this.attach(session, false);
    this.match = msg.match;
    this.roundScored = false;
    this.state = 'race';
    this.menus.show(null);
    this.input.swallowHeld();
    this.beginRace();
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
        // The start the revs earned: the launch's burst (smaller for a good one), or the engine bogging.
        if (e.mech === local && inRace) {
          if (e.grade === START.PERFECT) A.play('launch');
          else if (e.grade === START.GOOD) A.play('launch', { volume: 0.55, pitch: 0.94 });
          else if (e.grade === START.BOG) A.play('bog');
        }
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
        if (e.mech === local && inRace && e.intensity > 12) this.input.rumble(Math.min(1, e.intensity * 0.02), 140);
        break;
      }
      case 'fall': {
        const h = this.heard(e.mech);
        const v = Math.max(e.mech === local || e.by === local ? 0.7 : 0, h.volume) * quiet;
        if (v > 0.03) A.play('fall', { volume: v, pan: h.pan });
        if (inRace && e.by === local) {
          if (this.mode === 'online') this.view.cam.punch(0.8);
          else this.slowmo = 0.6;
        }
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
          const name = e.blocked ? (e.heavy ? 'block_heavy' : 'block') : e.charged ? 'momentum_hit' : melee ? (e.heavy ? 'hit_heavy' : 'hit_light') : 'bullet_hit';
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
          // Online the race does not stop: a shorter still, which only holds
          // the picture, and no slow motion.
          const online = this.mode === 'online';
          if (!online) this.slowmo = 0.9;
          if (look.on && look.still) {
            const hold = online ? 0.3 : 0.7;
            this.renderer.impactFrame(0.11, true);
            this.renderer.paintedStill(hold);
            this.view.fx.skipExplosionsTo(2);
            this.session.freeze(hold + 0.11);
            if (!online) this.slowmo += hold + 0.11;
          } else if (online) this.view.cam.punch(1);
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
        if (e.mech === local && inRace) this.input.rumble(0.35, 90);
        break;
      case 'boost':
        A.play('boost', { volume: this.heard(e.mech).volume * quiet });
        // The kick of lighting the boost; the rumble under it follows in roadRumble.
        if (e.mech === local && inRace) this.input.rumble(0.55, 200);
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
        if (inRace || this.state === 'paused') this.finishRound();
        else if (this.state === 'title') this.attractTimer = -3;
        break;
      default:
        break;
    }
  }

  /**
   * A race stinger, moved into the key of this circuit's music. Over a
   * recorded song only the lap chime plays: the song marks the lap phases
   * and the finish itself (see recordedMusic in audio.ts), and the chime is
   * the player's word that their lap counted.
   */
  private sting(name: SfxName): void {
    if (name !== 'lap' && this.audio.recordedMusic?.()) return;
    // (A recorded song can have keys of its own for them.)
    const keys = this.audio.stingerKey?.() ?? STINGER_KEY[this.session.track.def.theme ?? 'meridian'];
    const semis = keys?.[name] ?? 0;
    this.audio.play(name, semis ? { pitch: 2 ** (semis / 12) } : undefined);
  }

  /**
   * The jingle for a round or a Grand Prix won or lost, after the synthesised
   * music. With a recorded song playing there is none: the race song plays
   * its ending, and the results have songs of their own.
   */
  private resultJingle(won: boolean): void {
    if (!this.audio.recordedMusic?.()) this.audio.play(won ? 'win' : 'lose');
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
    if (race.sprint) {
      // A Sprint is won by a pilot: them, by name (you, if it was you).
      const who = race.mechs.find((x) => x.team === winner);
      const you = !!me && me.team === winner;
      const what = m && m.winner >= 0 && m.rounds.length > 1 ? 'the Sprint' : 'the race';
      this.eyecatch.show(m && m.rounds.length > 1 ? `Race ${m.rounds.length}` : 'The flag', `${you ? 'You take' : `${who?.name ?? 'The winner'} takes`} ${what}`, hold);
    } else {
      const what = m && m.winner >= 0 && m.rounds.length > 1 ? 'the match' : 'the round';
      this.eyecatch.show(m ? `Round ${Math.max(1, m.rounds.length)}` : 'The flag', `${LIVERIES[this.raceFactions[winner]].name} take ${what}`, hold);
    }
    this.renderer.paintedStill(hold);
    // The race has finished; hold it so nothing moves under the painting.
    this.session.freeze(hold);
    this.hud.hide();
    this.resultsAt = this.time + hold;
    return true;
  }

  /** The flag has fallen: bank the round (offline) and bring the results up in a moment. */
  private finishRound(): void {
    if (this.resultsAt > 0) return;
    const race = this.session.race;
    this.resultsAt = this.time + 2.8;
    // Bank the round. A round restarted from the pause menu never gets here.
    // Online the room scores it and says so (roundEnd).
    if (this.mode !== 'online' && this.match && !this.roundScored) {
      this.roundScored = true;
      const round = recordRound(this.match, race);
      this.resultJingle(round.winner === race.mechs[this.session.localId].team);
    }
    this.view.cam.mode = 'orbit';
    this.view.cam.shiftX = 0;
    this.view.cam.shiftY = 0;
    this.view.cam.restartOrbit();
  }

  /**
   * Each frame: the on-screen controls (shown in a race played by touch,
   * matched to what you are doing), a race on a phone held upright (it asks
   * to be turned, and offline it waits), the right stick scrolling a menu's
   * text, and the hangar's mech kept clear of the menu's panels.
   */
  private touchFrame(dt: number): void {
    const race = this.session.race;
    const local = this.session.localId;
    const me = local >= 0 ? race.mechs[local] : undefined;
    const touch = this.input.device === 'touch';
    // A phone held upright during a race: ask for it sideways, and hold the race (online: your computer pilot flies).
    const handheld = touch || !!this.coarse?.matches;
    const upright = frame.portrait && handheld;
    if (upright && this.state === 'race') {
      this.pause();
      this.rotatePaused = true;
    }
    if (!upright && this.rotatePaused) {
      this.rotatePaused = false;
      if (this.state === 'paused' && this.menus.screen === 'pause') this.resume();
    }
    if (this.state !== 'paused') this.rotatePaused = false;
    this.rotateEl.hidden = !(upright && this.rotatePaused);
    // The controls.
    const racing = this.state === 'race' && !!me && !upright;
    this.touchPad.show(touch && racing);
    if (touch && racing && me) {
      const battle = me.mode === MODE.BATTLE && me.target >= 0 && !me.retired;
      const out = me.retired || me.finished || !me.human;
      const ab = abilityShown(race, me);
      const escorting = battle && race.mechs[me.target].team === me.team;
      this.touchPad.setState(out ? 'out' : battle ? 'battle' : 'race', { name: ab.name, icon: ab.icon, ready: ab.ready }, weaponsFree(race) && !out, escorting, me.cdSecondary === 0, race.sprint);
      this.touchPad.countdown = race.phase === PHASE.COUNTDOWN;
    }
    // In full screen on a phone, the race holds the screen sideways.
    const hold = touch && this.state === 'race' && isFullscreen();
    if (hold !== this.heldLandscape) {
      this.heldLandscape = hold;
      holdLandscape(hold);
    }
    // The right stick reads a menu's text.
    if (this.menus.screen && Math.abs(this.input.camY) > 0.05) this.menus.scrollBy(this.input.camY * dt * 900);
    // The custom mech editor: the mech stands still in the bay, and the right stick (across) turns it.
    const under = this.menus.under(OVER_EDITOR);
    const turning = this.state === 'garage' && under !== null && CUSTOM_SCREENS.has(under);
    this.view.cam.turntable = turning;
    const want = Math.abs(this.input.camX) > 0.12 ? this.input.camX * 2.1 : 0;
    this.turnRate = turning ? this.turnRate + (want - this.turnRate) * (1 - Math.exp(-12 * dt)) : 0;
    if (Math.abs(this.turnRate) > 1e-3) this.view.cam.turn(this.turnRate * dt);
    // The hangar's mech, clear of the panels for the layout in use.
    if (this.state === 'garage' && this.view.cam.mode === 'orbit') {
      [this.view.cam.shiftX, this.view.cam.shiftY] = garageShift();
      this.view.cam.orbitFov = frame.portrait ? 72 : 50;
    } else this.view.cam.orbitFov = 50;
  }

  /** Full screen from a tap on the title (a phone: the browser's bars take a lot of a small screen). */
  enterFullscreenFromTap(): void {
    if (this.input.device === 'touch' && !isFullscreen()) void setFullscreen(true);
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
    const online = this.session instanceof NetSession;
    // The look: its settings for this frame, and the drawing clock. (A held
    // frame is a held cel: the drawings stop with it, and with the pause
    // offline; online the race behind the pause menu goes on.)
    readLook(this.tuning.feel);
    if (this.lookParam !== null) look.on = this.lookParam >= 0.5;
    const paused = this.state === 'paused' && !online;
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
    // How far behind the mech the lock's target is (1 dead astern): on the
    // keys and the touch screen, pushing toward it eases off the pace.
    let behind = 0;
    if (this.input.battle && mine && mine.target >= 0) {
      const t = this.session.race.mechs[mine.target];
      const ds = deltaS(this.session.track, t.s, mine.s);
      behind = Math.max(0, -ds / (Math.hypot(ds, t.d - mine.d) || 1));
    }
    this.input.battleBehind = behind;
    this.input.poll();
    let menu = this.input.consumeMenu();
    if (menu.includes('model')) {
      this.cycleSunhawk();
      menu = menu.filter((m) => m !== 'model');
    }
    if (menu.includes('rosterModel')) {
      this.cycleRoster();
      menu = menu.filter((m) => m !== 'rosterModel');
    }
    // The hangar's music: on to the next track (M, or the right stick pressed).
    if (menu.includes('track')) {
      this.nextTrack();
      menu = menu.filter((m) => m !== 'track');
    }
    this.menusMusic();
    const playing = this.musicNow === 'menu' && this.menuMusic === 'hangar' && this.menus.screen !== null ? (this.audio.nowPlaying?.()?.title ?? null) : null;
    this.nowPlaying.update(playing, this.input.device);
    // The look switch (G) and the tuning panel (T, the pad's Back) are tools
    // for working on the game: without DEV_TOOLS their keys do nothing.
    if (!DEV_TOOLS) menu = menu.filter((m) => m !== 'look' && m !== 'tune');
    // G switches the look, anywhere.
    if (menu.includes('look')) {
      this.toggleLook();
      menu = menu.filter((m) => m !== 'look');
    }
    // The tuning panel opens over anything. While a race is running it is
    // worked with the mouse only, so the pad and keys keep flying the mech.
    if (menu.includes('tune')) {
      if (this.state === 'race' || !this.panel.open) {
        this.panel.note = this.tuningNote();
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
        // The title card itself holds the race behind it (no sound, no
        // rumble); it runs on behind the main menu.
        if (this.menus.screen === 'title') {
          simDt = 0;
          break;
        }
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
        // Slow motion around a knockout you were part of (offline only: online
        // the race does not wait for anyone).
        if (this.slowmo > 0 && !online) {
          this.slowmo -= dt;
          this.session.timeScale = this.slowmo > 0.25 ? 0.3 : 0.3 + (1 - this.slowmo / 0.25) * 0.7;
        } else {
          this.slowmo = 0;
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
        this.resultsWhenDue(race, local, online);
        break;
      }
      case 'paused':
        this.menus.handle(menu);
        if (online) {
          // Online the race carries on behind the menu, your computer pilot
          // flying, and the results come up over it when they are due.
          this.session.update(dt, null);
          for (const e of this.session.events) this.onEvent(e);
          if (race.phase === PHASE.FINISHED && this.resultsAt < 0) this.finishRound();
          if (this.state === 'paused') this.resultsWhenDue(race, local, online);
        } else simDt = 0;
        break;
      case 'results':
        this.menus.handle(menu);
        this.session.update(dt, null);
        for (const e of this.session.events) this.view.handleEvent(e);
        break;
    }

    this.touchFrame(dt);

    const cur = this.session.race;
    // Whether this frame is drawn (the anime look's 30 fps option skips every
    // other): the HUD's marks over the mechs move with the picture.
    this.renderer.frameCap = look.on && this.tuning.feel.lookThirty >= 0.5 ? 30 : 0;
    const drawDt = this.renderer.beginFrame(dt, this.time);
    const flyingNow = this.state === 'race' && this.view.focusId === local;
    // A painted still holds everything, the camera and the sparks included.
    const viewDt = this.renderer.stillShowing ? 0 : simDt * (this.state === 'race' ? this.session.timeScale : 1);
    this.view.update(viewDt, flyingNow ? this.input.camX : 0, flyingNow ? this.input.camY : 0, flyingNow && this.input.lookBack);
    if ((this.state === 'race' || (this.state === 'paused' && online)) && drawDt > 0) this.hud.update(drawDt, cur, this.view.plates, this.view.focusId);
    // The scenery's own motion (water, lights) holds for a painted still too.
    if (!this.renderer.stillShowing) this.worldTime += dt;
    this.trackVis.update(this.worldTime);
    this.world.update(this.worldTime, this.renderer.camera);
    if (this.hangar.showing) this.hangar.update(this.renderer.camera);

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
    sc.racing = (this.state === 'race' || this.state === 'results' || (this.state === 'paused' && online)) && cur.phase !== PHASE.COUNTDOWN && !f.retired;
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
    // On the grid the engine runs on the revs; a tick as the player's come into the green.
    const grid = cur.phase === PHASE.COUNTDOWN && this.state === 'race' && !f.retired;
    sc.rev = grid ? f.rev : undefined;
    const zone = grid && own ? (own.rev > REV_RED ? 3 : own.rev >= REV_PERFECT ? 2 : 0) : 0;
    if (zone === 2 && this.revZone !== 2) this.audio.play('rev_green');
    this.revZone = zone;
    // Over for the player: a recorded song plays its ending.
    sc.finished = (!!own && own.finished) || cur.phase === PHASE.FINISHED;
    this.audio.update(dt, sc);

    if (drawDt > 0) {
      this.renderer.reviewProbe?.setContext(`${this.state} · tick ${cur.tick} · lap ${f.lap}`, this.view.reviewDetailLevels());
      this.renderer.render(drawDt, this.time);
    }
  }

  /** The results, once the flag has fallen and the moment after it has passed. */
  private resultsWhenDue(race: RaceState, local: number, online: boolean): void {
    if (this.resultsAt < 0 || this.time < this.resultsAt) return;
    // The anime look cuts to an eyecatch first; the results come up after it.
    if (this.state === 'race' && this.eyecatchFor(race)) return;
    this.resultsAt = -1;
    this.eyecatch.hide();
    if (this.session instanceof NetSession) this.session.autopilot = false;
    this.state = 'results';
    this.hud.hide();
    this.resultsRace = online ? (this.session as NetSession).confirmed : race;
    this.resultsLocal = local;
    this.menus.reset('results');
    this.resultsMusic();
  }

  /**
   * The continuous rumble, kept for what the player did: a boost, Overdrive,
   * a ram, scraping the wall, and a light buzz on a charge strip. Plain
   * driving and steering are quiet, and so is a carve between its tiers
   * (each tier has its own pulse), so the hits, the boosts and the big
   * moments stand out instead of riding on a rumble that never stops.
   */
  private roadRumble(dt: number): void {
    this.rumbleT -= dt;
    if (this.rumbleT > 0) return;
    this.rumbleT = 0.09;
    const m = this.session.race.mechs[this.session.localId];
    if (this.session.race.phase !== PHASE.RACING) return;
    let weak = 0;
    let strong = 0;
    if (m.onStrip) weak += 0.06;
    if (m.boosting) {
      weak += 0.22;
      strong += 0.06;
    }
    if (m.overdriveT > 0) {
      weak += 0.25;
      strong += 0.2;
    }
    if (m.ramT > 0) strong += 0.18;
    if (m.wall > 0 && m.speed > 20) strong += 0.4;
    if (weak + strong > 0.015) this.input.rumbleRoad(strong, weak, 130);
  }

  /** For automated checks. */
  debugState(): object {
    const r = this.session.race;
    const net = this.session instanceof NetSession ? this.session.predictor : null;
    return {
      state: this.state,
      mode: this.mode,
      screen: this.menus.screen,
      match: this.match ? { mode: this.match.cfg.mode, rounds: this.match.rounds.length, wins: this.match.wins, totals: this.match.totals, winner: this.match.winner } : null,
      tick: r.tick,
      phase: r.phase,
      lapPhase: r.lapPhase,
      focus: this.view.focusId,
      online: { room: this.online.room?.roomId ?? null, squad: this.online.squad?.roomId ?? null, pid: this.online.pid, phase: this.online.lobby?.phase ?? null, rtt: Math.round(this.online.rtt) },
      net: net ? { confirmed: net.confirmed.tick, predicted: net.predicted.tick, ahead: net.ahead, rebuilds: net.rebuilds, gaps: net.gaps } : null,
      mechs: r.mechs.map((m) => ({ name: m.name, s: Math.round(m.s), speed: Math.round(m.speed), hp: Math.round(m.hp), drive: Math.round(m.drive), cells: m.cells, place: m.place, mode: m.mode, retired: m.retired, finished: m.finished })),
    };
  }
}

export { THREE };
