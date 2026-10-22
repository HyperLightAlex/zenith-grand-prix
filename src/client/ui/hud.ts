// The race HUD: place, running order, team score, map, gauges, speed,
// tactics, radio, target and banners. Plain DOM over the canvas.
import { mechName } from '../../custom/mechBuild';
import {
  ABILITIES,
  ABILITY,
  ACT,
  ATTACKS,
  AWARD_NAMES,
  CHARGE_BONUS,
  CARVE_BURST,
  CARVE_TIERS,
  CLASSES,
  DT,
  LOCK_BREAK,
  MODE,
  MPH_PER_UNIT,
  PHASE,
  REV_GOOD,
  REV_PERFECT,
  REV_RED,
  ROLE,
  START,
  ROLE_KEYS,
  ROLE_NAMES,
  TACTIC,
  TICK_RATE,
  abilityFor,
  attackTotal,
  deltaS,
  limiterOf,
  pickTarget,
  wrapAngle,
  packBonus,
  pointsFor,
  teamPoints,
  weaponsFree,
  wrapS,
  type MechState,
  type RaceState,
  type SimEvent,
  type Track,
} from '../../sim/index';
import { TELL_LABEL, tellOf, type TellKind } from '../game/tells';
import { CARVE_COLORS } from '../render/palette';
import type { Plate } from '../render/raceView';
import { h, setClass, setText } from './dom';
import { faceUrl } from './factionArt';
import { factionLook, teamLooks, type TeamLook } from './sides';
import { COUNT, ICONS, type IconName } from './hudArt';
import { Dash } from './dash';
import type { Device } from '../input/input';
import { frame } from '../video';

const ORD = ['st', 'nd', 'rd', 'th', 'th', 'th'];
const PHASE_NAMES = ['', 'Formation lap', 'Battle lap', 'Speed lap'];
const TACTIC_LABEL = ['Free', 'Blitz', 'Run', 'Shield', 'Mark'];

const KEYS: Record<Device, Record<string, string>> = {
  pad: { accel: 'RT', brake: 'LT', carve: 'LT + stick', boost: 'A', dash: 'A', swing: 'LT + ◀▶ + A', lock: 'LB', ally: 'L3', ability: 'B', x: 'X', y: 'Y', guard: 'LT', swap: 'R stick ◀ ▶', up: '▲', right: '▶', down: '▼', left: '◀', pause: 'Start' },
  keys: { accel: 'W', brake: 'S', carve: 'S + A/D', boost: 'Space', dash: 'Space', swing: 'L + A/D + Space', lock: 'Q', ally: 'E', ability: 'R', x: 'J', y: 'K', guard: 'L', swap: 'Z C', up: '1', right: '2', down: '3', left: '4', pause: 'Esc' },
  // The on-screen buttons go by their names, and the HUD shows no keys for them (no hints bar, no plays diamond).
  touch: { accel: '', brake: 'Carve', carve: 'Carve', boost: 'Boost', dash: 'Dash', swing: 'Guard + Dash', lock: '◎', ally: 'Escort', ability: '', x: 'Attack', y: 'Special', guard: 'Guard', swap: 'Switch', up: '', right: '', down: '', left: '', pause: '' },
};

/** Radio lines. {t} is replaced by a target's callsign. */
const LINES = {
  blitz: ['All in. Pick a target.', 'Finally. Going loud.', 'Copy, hitting everything that moves.'],
  run: ['Heads down, running clean.', 'Breaking off. See you at the line.', 'Copy. No heroics.'],
  shield: ['Closing up on our forward.', 'On your shoulder. Nobody gets through.', 'Copy, forming up.'],
  mark: ['Marked. I am on {t}.', '{t} is mine.', 'Copy. {t} goes down.'],
  free: ['Back to my own game.', 'Copy, playing it by ear.'],
  battle: ['Weapons are free. Stay sharp.', 'Here we go. Battle lap.'],
  speed: ['Limiters off! Go, go, go!', 'Speed lap. Everything you have got.'],
  hurt: ['Taking hits here.', 'They are all over me!', 'Could use a hand.'],
  critical: ['Armour is critical!', 'I cannot take much more of this.'],
  out: ['I am out. Sorry, team.', 'Frame is gone. It is on you now.'],
  kill: ['{t} is down!', 'Scratch one. {t} is out.'],
  praise: ['Beautiful! {t} is out of it.', 'That is how it is done.'],
  warnYou: ['You are smoking. Get out of there!', 'Your armour is nearly gone. Back off!'],
  marked: ['They have marked {t}. Watch out.', 'Heads up, they are all going for {t}.'],
  finish: ['Across the line. Bring it home.', 'I am in. Go get them.'],
  overdrive: ['Overdrive! Hold on!', 'Lighting it up!'],
  breakaway: ['Not today. Breaking away!', 'I am out of here!'],
  snare: ['Snare away!', 'Slowing {t} down for you.'],
  snared: ['Got {t}. Go, go!', '{t} is snared!'],
  pulse: ['Disruptor! Back off, all of you!', 'Pulse out!'],
  ram: ['Ramming speed!', 'Coming through!'],
  aegis: ['Aegis up! Stay close!', 'Shield is on you!'],
  fell: ['I am over the edge! Drone, where are you?', 'Lost the road. Back in a moment.'],
  sentOver: ['{t} went over the side!', 'And {t} is off the circuit.'],
};

// The painted HUD art (the anime look; hidden in the plain one): white icons
// drawn as masks in the colour of the text round them, the pilots, the emblems.
const ABILITY_ICON: IconName[] = ['overdrive', 'breakaway', 'snare', 'disruptor', 'ram', 'aegis'];
const ROLE_ICON: IconName[] = ['forward', 'midfielder', 'defender'];
const TACTIC_ICON: Array<IconName | null> = [null, 'blitz', 'run', 'shield', 'mark'];
const TELL_ICON: Record<TellKind, IconName> = { parry: 'parry', dodge: 'dodge', block: 'guard' };
/** The special's name on the hints (the secondary attack: the Y button). */
const SPECIAL = 'Special';

/**
 * The ability the ability button would use now (the free-steering one, or
 * the locked-on one), and whether it can: a Cell, weapons free, and for
 * Overdrive the speed lap (rules.overdriveLap). The gauges and the touch
 * button both show this.
 */
export function abilityShown(race: RaceState, me: MechState): { id: number; name: string; icon: IconName; ready: boolean; waiting: boolean } {
  const ab = abilityFor(me, race);
  const id = ab === -1 ? CLASSES[me.role].abilityFree : ab;
  const waiting = id === ABILITY.OVERDRIVE && race.lapPhase < race.rules.overdriveLap;
  const ready = ab !== -1 && !waiting && me.cells >= 1 && weaponsFree(race) && !me.retired && !me.finished;
  return { id, name: ABILITIES[id].name, icon: ABILITY_ICON[id], ready, waiting };
}

/** A painted icon, in the colour of the text round it. */
function icon(name: IconName | null = null): HTMLElement {
  const el = h('i.ico');
  if (name) setIcon(el, name);
  return el;
}

function setIcon(el: HTMLElement, name: IconName): void {
  if (el.dataset.icon === name) return;
  el.dataset.icon = name;
  el.style.setProperty('--ico', `url(${ICONS[name]})`);
}

/** How each race team looks, for the race on now (set by `begin`). */
let looks: TeamLook[] = [];

/** A race team's look: its faction's, or (no faction) the league's in its pilot's colour. */
const lookOf = (team: number) => looks[team] ?? factionLook(team);

/** A seat's portrait: its person's own, or its faction's pilot. */
function pilotOf(m: MechState): string {
  return faceUrl(lookOf(m.team).faction, m.role, m.portrait);
}

/** Colour an element (a running order row, a name plate, a radio line) for a team: its colour and emblem. */
function teamStyle(el: HTMLElement, team: number): void {
  const t = lookOf(team);
  el.style.setProperty('--tc', t.css);
  el.style.setProperty('--te', `url(${t.emblem})`);
}

function pick(list: string[], seed: number): string {
  return list[Math.abs(seed) % list.length];
}

interface Row {
  el: HTMLElement;
  pos: HTMLElement;
  hp: HTMLElement;
  gap: HTMLElement;
  place: number;
}

/** A colour number as CSS. */
function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

export class Hud {
  readonly root = h('div.ui.hud');
  private device: Device = 'keys';
  private localId = 0;
  private track!: Track;
  private names: string[] = [];

  // top left
  private placeNum = h('span.num', '1');
  private placeOrd = h('span.ord', 'st');
  private lapNum = h('div.lapnum', 'Lap 1/3');
  private phase = h('div.phase.p1', 'Formation lap');
  private tower = h('div.tower');
  private rows: Row[] = [];
  // top centre
  private ptsA = h('span.pts', '0');
  private ptsB = h('span.pts', '0');
  private nameA = h('span.name', '');
  private nameB = h('span.name', '');
  private clock = h('div.mid', '0:00.0');
  private matchLine = h('div.matchline', '');
  // top right
  private map = h<'canvas'>('canvas');
  private mapPath: Float32Array = new Float32Array(0);
  // the dash: speed, Drive, armour, guard, Cells and the ability (dash.ts)
  private dash = new Dash();
  private chipAbilityIco = icon();
  private chipAbilityText = h('span', '');
  private chipAbility = h('span.chip.cell', this.chipAbilityIco, this.chipAbilityText);
  private chipSnaredText = h('span', 'Snared');
  private chipSnared = h('span.chip.snared', icon('snared'), this.chipSnaredText);
  private chipSling = h('span.chip.draft', icon('slingshot'), h('span', 'Slingshot'));
  private chipLocked = h('span.chip.locked', icon('weaponsLocked'), h('span', 'Weapons locked'));
  private chipModeIco = icon('lockedOn');
  private chipModeText = h('span', '');
  private chipMode = h('span.chip.battle', this.chipModeIco, this.chipModeText);
  private chipCharge = h('span.chip.charge', icon('charging'), h('span', 'Charging'));
  private chipDraft = h('span.chip.draft', icon('slipstream'), h('span', 'Slipstream'));
  private chipLink = h('span.chip.link', icon('escorting'), h('span', 'Linked'));
  private chipMomentum = h('span.chip.momentum', icon('momentum'), h('span', 'Momentum'));
  private hints = h('div.hints');
  /** The special's hint, and how far back (percent) it was last shown to be. */
  private specialHint: HTMLElement | null = null;
  private specialShown = -1;
  private hintKey = '';
  // support points: what you and your teammates just earned
  private awardFeed = h('div.awards');
  private awardItems: Array<{ el: HTMLElement; t: number }> = [];
  private capShown = false;
  /** When the next support prompt may show (seconds of HUD time), and the clock. */
  private promptAt = 0;
  private hudTime = 0;
  // carve meter: three segments that fill in the tier colours
  private carve = h('div.carve');
  private carveSegs: HTMLElement[] = [];
  private carveLabel = h('span.label', 'Carve');
  private carveFade = 0;
  /** The charge meter: a heavy held to charge, how far, and a moment's linger after. */
  private chargeBox = h('div.chargebar');
  private chargeLabel = h('span.label', 'Charge');
  private chargeFill = h('i');
  private chargeFade = 0;
  private chargeShown = 0;
  /**
   * The rev-up gauge: front and centre under the countdown, its bands the
   * starts (the green a perfect launch, short of it a good one, the red a
   * bog), then the start the revs earned, for a moment after GO.
   */
  private revBox = h('div.revbar');
  private revLabel = h('div.label');
  private revFill = h('i');
  private revHintFor = '';
  private revResultT = 0;
  /**
   * The guard meter, under your mech where the charge meter goes: up while
   * you guard and while it refills in a fight, lingering a moment after.
   */
  private guardBox = h('div.guardbar');
  private guardLabel = h('span', 'Guard');
  private guardFill = h('i');
  private guardFade = 0;
  /** Seconds the guard meter shows a break or a parry for. */
  private guardFlash = 0;
  /** The tier the last carve reached, held through its burst. */
  private carveShown = 0;
  // tactics
  private tacticEls: HTMLElement[] = [];
  private tacticHub = h('div.hub', 'Team play');
  // radio, target, plates
  private comms = h('div.comms');
  private target = h('div.target');
  private targetPilot = h('div.pilot');
  private targetName = h('div.name', '');
  private targetRoleIco = icon();
  private targetRole = h('span', '');
  private targetDist = h('span', '');
  private targetHp = h('i');
  private targetGd = h('i');
  private reticle = h('div.reticle', h('i'), h('i'), h('i'), h('i'));
  /** Free steering: who the lock button would take, before you press it. */
  private preview = h('div.reticle.preview', h('i'), h('i'), h('i'), h('i'));
  private plates: Array<{
    el: HTMLElement;
    hp: HTMLElement;
    cue: HTMLElement;
    cueText: string;
    warn: HTMLElement;
    warnIco: HTMLElement;
    warnText: HTMLElement;
    warnKey: string;
    edge: HTMLElement;
    edgeArrow: HTMLElement;
    edgeIco: HTMLElement;
    edgeLabel: HTMLElement;
    edgeKey: string;
  }> = [];
  private lastTarget = -1;
  // banners
  private banner = h('div.banner');
  private bannerKick = h('div.kick', '');
  private bannerBig = h('div.big', '');
  private bannerSmall = h('div.small', '');
  private bannerTimer = 0;
  /** The 80s anime look is on: banners come up as title cards. */
  anime = false;
  private count = h('div.count');
  private notice = h('div.notice');
  private noticeText = h('span', '');
  private noticeTimer = 0;
  private retired = h('div.retired');
  private retiredSmall = h('div.small', '');
  private frame = 0;
  /** Damage numbers over whoever was hit, for blows the player lands or takes. */
  private pops: Array<{ el: HTMLElement; victim: number; t: number; dx: number }> = [];
  private lastHp: number[] = [];
  private spoke: number[] = [];
  private seq = 0;
  /** Hooks for sound: a radio line was shown, the armour warning fired. */
  onRadio: () => void = () => {};
  onCritical: () => void = () => {};

  constructor(parent: HTMLElement) {
    const R = this.root;
    R.append(
      h('div.hud-place', h('div', this.placeNum, this.placeOrd), h('div.hud-lap', this.lapNum, this.phase)),
      this.tower,
      h('div.score', h('div.side.a', h('i.emblem.e0'), this.nameA, this.ptsA), this.clock, h('div.side.b', h('i.emblem.e1'), this.nameB, this.ptsB)),
      this.matchLine,
      h('div.mapbox', this.map),
    );
    R.append(h('div.chips', this.chipLocked, this.chipMode, this.chipMomentum, this.chipAbility, this.chipSnared, this.chipCharge, this.chipDraft, this.chipSling, this.chipLink), this.hints);
    const segs = h('div.segs');
    for (let i = 0; i < CARVE_TIERS.length; i++) {
      const fill = h('i');
      fill.style.background = hex(CARVE_COLORS[i + 1]);
      this.carveSegs.push(fill);
      segs.append(h('div.seg', fill));
    }
    this.carve.append(this.carveLabel, segs);
    this.dash.hold(this.carve);
    R.append(this.dash.root, this.awardFeed);
    this.chargeBox.append(this.chargeLabel, h('div.bar', this.chargeFill));
    this.guardBox.append(h('span.label', icon('guard'), this.guardLabel), h('div.bar', this.guardFill));
    R.append(this.chargeBox, this.guardBox);
    const band = (cls: string, from: number, to: number) => {
      const el = h(`span.${cls}`);
      el.style.left = `${from * 100}%`;
      el.style.width = `${(to - from) * 100}%`;
      return el;
    };
    this.revBox.append(this.revLabel, h('div.gauge', band('good', REV_GOOD, REV_PERFECT), band('green', REV_PERFECT, REV_RED), band('red', REV_RED, 1), this.revFill));
    R.append(this.revBox);
    const tact = h('div.tactics', this.tacticHub);
    for (const [cls, tac] of [['up', TACTIC.BLITZ], ['right', TACTIC.RUN], ['down', TACTIC.SHIELD], ['left', TACTIC.MARK]] as const) {
      const el = h('div.t.' + cls);
      el.dataset.tactic = String(tac);
      this.tacticEls[tac] = el;
      tact.append(el);
    }
    R.append(tact, this.comms);
    this.target.append(this.targetPilot, h('div.info', this.targetName, h('div.sub', h('span', this.targetRoleIco, this.targetRole), this.targetDist), h('div.bar.hp', this.targetHp), h('div.bar.gd', this.targetGd)));
    R.append(this.target, this.reticle, this.preview);
    this.banner.append(h('div.strip', this.bannerKick, this.bannerBig, this.bannerSmall));
    this.notice.append(this.noticeText);
    this.retired.append(h('div.big', 'Retired'), this.retiredSmall);
    R.append(this.banner, this.count, this.notice, this.retired);
    this.banner.hidden = true;
    this.count.hidden = true;
    this.notice.hidden = true;
    this.retired.hidden = true;
    this.target.hidden = true;
    this.reticle.hidden = true;
    this.preview.hidden = true;
    R.hidden = true;
    parent.append(R);
  }

  setDevice(d: Device): void {
    this.device = d;
    this.hintKey = '';
    const k = KEYS[d];
    const set = (tac: number, key: string) => {
      const el = this.tacticEls[tac];
      el.replaceChildren(h('span.key', key), icon(TACTIC_ICON[tac]), TACTIC_LABEL[tac]);
    };
    set(TACTIC.BLITZ, k.up);
    set(TACTIC.RUN, k.right);
    set(TACTIC.SHIELD, k.down);
    set(TACTIC.MARK, k.left);
  }

  /** Set up for a new race between `factions` (which faction each race team is; -1 for none). */
  begin(race: RaceState, track: Track, localId: number, factions: readonly number[] = [0, 1]): void {
    looks = teamLooks(race, factions);
    this.track = track;
    this.localId = localId;
    this.names = race.mechs.map((m) => m.name);
    this.lastHp = race.mechs.map((m) => m.hp);
    this.spoke = race.mechs.map(() => -9999);
    this.root.hidden = false;
    // A Sprint: every pilot for themselves. The score is yours (the points
    // your place is worth), in your colours; and there are no team plays.
    setClass(this.root, 'sprint', race.sprint);
    const a = race.sprint ? (race.mechs[localId]?.team ?? 0) : 0;
    this.root.style.setProperty('--team0', lookOf(a).css);
    this.root.style.setProperty('--team1', lookOf(1).css);
    this.root.style.setProperty('--emblem0', `url(${lookOf(a).emblem})`);
    this.root.style.setProperty('--emblem1', `url(${lookOf(1).emblem})`);
    setText(this.nameA, race.sprint ? 'Points' : lookOf(0).name);
    setText(this.nameB, lookOf(1).name);

    this.tower.replaceChildren();
    this.rows = [];
    this.plates.forEach((p) => {
      p.el.remove();
      p.edge.remove();
    });
    this.plates = [];
    for (const m of race.mechs) {
      const pos = h('span.pos', '');
      const hp = h('i');
      const gap = h('span.gap', '');
      const el = h('div.row' + (m.team ? '.t1' : '') + (m.id === localId ? '.me' : ''), pos, h('span.flag'), h('span.who', m.name, h('small', h('span.rolekey', ROLE_KEYS[m.role]), icon(ROLE_ICON[m.role]))), h('div.bar.hp', hp), gap);
      teamStyle(el, m.team);
      this.tower.append(el);
      this.rows.push({ el, pos, hp, gap, place: -1 });
      const php = h('i');
      const cue = h('span.cue', '');
      const warnIco = icon();
      const warnText = h('span', '');
      const warn = h('div.warn', warnIco, warnText);
      warn.hidden = true;
      const plate = h('div.plate' + (m.team ? '.t1' : ''), warn, cue, h('span.tag', icon(ROLE_ICON[m.role]), m.name, h('span.rolekey', ` ${ROLE_KEYS[m.role]}`)), h('div.bar', php));
      teamStyle(plate, m.team);
      plate.hidden = true;
      // Under the panels, so a name never covers the running order.
      this.root.prepend(plate);
      // An arrow at the edge of the screen for a blow winding up at you from
      // someone you cannot see.
      const edgeArrow = h('i.arrow');
      const edgeIco = icon();
      const edgeLabel = h('b', '');
      const edge = h('div.edgewarn', edgeArrow, h('span', edgeIco, edgeLabel));
      edge.hidden = true;
      this.root.append(edge);
      this.plates.push({ el: plate, hp: php, cue, cueText: '', warn, warnIco, warnText, warnKey: '', edge, edgeArrow, edgeIco, edgeLabel, edgeKey: '' });
    }
    this.comms.replaceChildren();
    this.pops.forEach((p) => p.el.remove());
    this.pops = [];
    this.awardItems.forEach((a) => a.el.remove());
    this.awardItems = [];
    this.capShown = false;
    this.promptAt = this.hudTime + 8;
    this.carveShown = 0;
    this.carveFade = 0;
    this.banner.hidden = true;
    this.count.hidden = true;
    this.notice.hidden = true;
    this.retired.hidden = true;
    this.setDevice(this.device);
    this.buildMap();
    this.frame = 0;
  }

  hide(): void {
    this.root.hidden = true;
  }

  /** One line under the score: which round of what, and how the match stands. */
  setMatch(text: string): void {
    setText(this.matchLine, text);
    this.matchLine.hidden = text === '';
  }

  // ---- map ----------------------------------------------------------------

  private buildMap(): void {
    const t = this.track;
    const n = 220;
    let minX = 1e9;
    let maxX = -1e9;
    let minZ = 1e9;
    let maxZ = -1e9;
    for (let i = 0; i < t.n; i++) {
      minX = Math.min(minX, t.px[i]);
      maxX = Math.max(maxX, t.px[i]);
      minZ = Math.min(minZ, t.pz[i]);
      maxZ = Math.max(maxZ, t.pz[i]);
    }
    const span = Math.max(maxX - minX, maxZ - minZ);
    const pad = 0.1;
    this.mapPath = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const j = Math.floor((i / n) * t.n);
      this.mapPath[i * 2] = pad + ((t.px[j] - (minX + maxX) / 2) / span + 0.5) * (1 - pad * 2);
      this.mapPath[i * 2 + 1] = pad + ((t.pz[j] - (minZ + maxZ) / 2) / span + 0.5) * (1 - pad * 2);
    }
  }

  private mapPoint(s: number): [number, number] {
    const n = this.mapPath.length / 2;
    const f = (wrapS(this.track, s) / this.track.length) * n;
    const i = Math.floor(f) % n;
    const j = (i + 1) % n;
    const k = f - Math.floor(f);
    return [this.mapPath[i * 2] + (this.mapPath[j * 2] - this.mapPath[i * 2]) * k, this.mapPath[i * 2 + 1] + (this.mapPath[j * 2 + 1] - this.mapPath[i * 2 + 1]) * k];
  }

  private drawMap(race: RaceState): void {
    const c = this.map;
    const size = Math.round(c.clientWidth * Math.min(2, window.devicePixelRatio || 1));
    if (size <= 0) return;
    if (c.width !== size) {
      c.width = size;
      c.height = size;
    }
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, size, size);
    const n = this.mapPath.length / 2;
    const path = () => {
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const j = i % n;
        const x = this.mapPath[j * 2] * size;
        const y = this.mapPath[j * 2 + 1] * size;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
    };
    g.lineJoin = 'round';
    path();
    g.strokeStyle = 'rgba(15,21,36,0.85)';
    g.lineWidth = size * 0.07;
    g.stroke();
    path();
    g.strokeStyle = '#f3f5fa';
    g.lineWidth = size * 0.028;
    g.stroke();
    // Charge strips.
    g.strokeStyle = '#35f0ff';
    g.lineWidth = size * 0.03;
    for (const st of this.track.strips) {
      g.beginPath();
      for (let s = st.s0; s <= st.s1; s += 40) {
        const [x, y] = this.mapPoint(s);
        if (s === st.s0) g.moveTo(x * size, y * size);
        else g.lineTo(x * size, y * size);
      }
      g.stroke();
    }
    // Cell gates still open to the player.
    const pilot = race.mechs[this.localId];
    const gateWorth = pilot.lap <= 0 ? race.rules.gateValue : race.rules.gateValueLater;
    // (Only while there is room to bank one: fuller than that, a gate is passed by.)
    if (pilot.lap < race.rules.gateLaps && gateWorth > 0 && !pilot.retired && !pilot.finished && race.rules.cellMax > 0 && pilot.cells <= race.rules.cellMax - Math.min(gateWorth, race.rules.cellMax)) {
      g.fillStyle = '#ffc93a';
      this.track.gates.forEach((gt, i) => {
        if (pilot.gateMask & (1 << i)) return;
        const [x, y] = this.mapPoint(gt.s);
        const r = size * 0.034;
        g.beginPath();
        g.moveTo(x * size, y * size - r);
        g.lineTo(x * size + r, y * size);
        g.lineTo(x * size, y * size + r);
        g.lineTo(x * size - r, y * size);
        g.closePath();
        // Dark (someone has just taken it): an outline until it relights.
        if (race.gateDark[i] > race.tick) {
          g.strokeStyle = '#ffc93a';
          g.lineWidth = Math.max(1, size * 0.008);
          g.stroke();
        } else {
          g.fill();
        }
      });
    }
    // Start line.
    const [sx, sy] = this.mapPoint(0);
    g.fillStyle = '#ff7a1a';
    g.fillRect(sx * size - size * 0.035, sy * size - size * 0.012, size * 0.07, size * 0.024);
    // Mechs: wrecks first, the player last so it sits on top.
    const order = [...race.mechs].sort((a, b) => (a.id === this.localId ? 1 : 0) - (b.id === this.localId ? 1 : 0) || (a.retired ? -1 : 0) - (b.retired ? -1 : 0));
    for (const m of order) {
      const [x, y] = this.mapPoint(m.s);
      const me = m.id === this.localId;
      const r = size * (me ? 0.05 : 0.036);
      g.beginPath();
      g.arc(x * size, y * size, r, 0, Math.PI * 2);
      g.fillStyle = m.retired ? '#5b6272' : lookOf(m.team).css;
      g.fill();
      g.lineWidth = size * (me ? 0.02 : 0.012);
      g.strokeStyle = me ? '#ffffff' : 'rgba(15,21,36,0.9)';
      g.stroke();
    }
  }

  // ---- per-frame update ---------------------------------------------------

  update(dt: number, race: RaceState, plates: Plate[], focusId: number): void {
    this.frame++;
    setClass(this.root, 'anime', this.anime);
    const me = race.mechs[this.localId];
    const k = KEYS[this.device];

    // Place, lap, phase.
    setText(this.placeNum, String(me.place));
    setText(this.placeOrd, ORD[me.place - 1] ?? 'th');
    const lap = Math.min(race.laps, Math.max(1, Math.floor(Math.max(0, me.s) / this.track.length) + 1));
    setText(this.lapNum, `Lap ${lap}/${race.laps}`);
    setText(this.phase, PHASE_NAMES[race.lapPhase]);
    this.phase.className = 'phase p' + race.lapPhase;

    // Score and clock (a Sprint: the points your place is worth now).
    setText(this.ptsA, String(race.sprint ? pointsFor(me, true) : teamPoints(race, 0)));
    if (!race.sprint) setText(this.ptsB, String(teamPoints(race, 1)));
    const secs = Math.max(0, race.tick * DT - 4);
    setText(this.clock, `${Math.floor(secs / 60)}:${(secs % 60).toFixed(1).padStart(4, '0')}`);

    // The dash: speed, Drive, armour, guard, Cells and the ability they pay for.
    const abl = abilityShown(race, me);
    const shown = abl.id;
    // Chips.
    const battle = me.mode === MODE.BATTLE && me.target >= 0;
    this.chipLocked.hidden = !(race.phase === PHASE.RACING && race.lapPhase < 2);
    this.chipMode.hidden = !battle;
    if (battle) {
      const t = race.mechs[me.target];
      setText(this.chipModeText, t.team === me.team ? `Escorting ${t.name}` : `Locked on ${t.name}`);
      setIcon(this.chipModeIco, t.team === me.team ? 'escorting' : 'lockedOn');
      setClass(this.chipMode, 'link', t.team === me.team);
      setClass(this.chipMode, 'battle', t.team !== me.team);
    }
    this.chipCharge.hidden = !me.onStrip;
    this.chipDraft.hidden = !me.drafting;
    this.chipSling.hidden = !(me.tow > 0.05 && !me.drafting && me.mode === MODE.SPEED && !me.retired);
    this.chipLink.hidden = !me.linked;
    // Momentum: the next blow is primed by the boost or the tow.
    this.chipMomentum.hidden = !(me.momentum > 0 && weaponsFree(race) && !me.retired && !me.finished);
    // Whichever ability effect is running, with the seconds left.
    const left = (ticks: number) => (ticks / TICK_RATE).toFixed(1);
    let effect = '';
    let effectIcon: IconName = 'overdrive';
    if (me.overdriveT > 0) effect = `Overdrive ${left(me.overdriveT)}`;
    else if (me.ramT > 0) [effect, effectIcon] = [`Ram ${left(me.ramT)}`, 'ram'];
    else if (me.shieldT > 0) [effect, effectIcon] = [`Aegis ${left(me.shieldT)}`, 'aegis'];
    else if (me.cloakT > 0) [effect, effectIcon] = ['Clear', 'breakaway'];
    this.chipAbility.hidden = effect === '' || me.retired;
    if (effect) {
      setText(this.chipAbilityText, effect);
      setIcon(this.chipAbilityIco, effectIcon);
    }
    this.chipSnared.hidden = !(me.snareT > 0) || me.retired;
    if (me.snareT > 0) setText(this.chipSnaredText, `Snared ${left(me.snareT)}`);

    // The rev-up: through the countdown, then the start it earned.
    if (race.phase === PHASE.COUNTDOWN) {
      const r = me.rev;
      this.revFill.style.transform = `scaleX(${r.toFixed(3)})`;
      this.revBox.dataset.zone = r > REV_RED ? 'red' : r >= REV_PERFECT ? 'green' : r >= REV_GOOD ? 'good' : '';
      setClass(this.revBox, 'on', true);
      this.revBox.dataset.grade = '';
      if (this.revHintFor !== this.device) {
        this.revHintFor = this.device;
        this.revLabel.replaceChildren(...(k.accel ? ['Hold ', h('span.key', k.accel), ' to rev up: go in the green'] : ['Hold the stick to rev up: go in the green']));
      }
    } else {
      this.revResultT = Math.max(0, this.revResultT - dt);
      setClass(this.revBox, 'on', this.revResultT > 0);
      this.revHintFor = '';
    }

    // Charge meter: up while a heavy is held charging, lingering a moment after.
    {
      const a = me.act === ACT.ATTACK ? ATTACKS[me.attack] : null;
      const full = a?.charge ?? 0;
      const charging = !!a && full > 0 && me.chargeOn && me.chargeT > 0 && me.actT === a.windup - 1 && !me.retired;
      if (charging) this.chargeShown = Math.min(1, me.chargeT / full);
      this.chargeFade = charging ? 0.35 : Math.max(0, this.chargeFade - dt);
      setClass(this.chargeBox, 'on', charging || this.chargeFade > 0);
      setClass(this.chargeBox, 'full', this.chargeShown >= 1);
      this.chargeFill.style.transform = `scaleX(${this.chargeShown.toFixed(3)})`;
      setText(this.chargeLabel, this.chargeShown >= 1 ? `Charged +${Math.round(CHARGE_BONUS * 100)}%` : `Charge +${Math.round(CHARGE_BONUS * this.chargeShown * 100)}%`);
    }

    // Guard meter: while guarding, while it refills in a fight, or showing a break or a parry.
    {
      const charging = this.chargeBox.classList.contains('on');
      const gmax = CLASSES[me.role].guardMax;
      const gF = Math.max(0, Math.min(1, me.guard / gmax));
      const fighting = me.mode === MODE.BATTLE && me.target >= 0 && !me.retired && !me.finished;
      this.guardFlash = Math.max(0, this.guardFlash - dt);
      const want = !charging && !me.retired && (me.guarding || (fighting && gF < 0.995) || this.guardFlash > 0);
      this.guardFade = want ? 0.7 : Math.max(0, this.guardFade - dt);
      setClass(this.guardBox, 'on', want || (this.guardFade > 0 && !charging));
      setClass(this.guardBox, 'low', gF < 0.35);
      setClass(this.guardBox, 'up', me.guarding);
      this.guardFill.style.transform = `scaleX(${gF.toFixed(3)})`;
      this.placeUnderMech(plates[this.localId]);
      if (this.guardFlash <= 0) {
        setClass(this.guardBox, 'broken', false);
        setClass(this.guardBox, 'parry', false);
        setText(this.guardLabel, 'Guard');
      }
    }

    // Carve meter: up while carving, and through the burst after.
    const bursting = me.carveT > 0 && me.mode === MODE.SPEED;
    const carveOn = (me.carving || bursting) && !me.retired;
    this.carveFade = carveOn ? 0.5 : Math.max(0, this.carveFade - dt);
    setClass(this.carve, 'on', carveOn || this.carveFade > 0);
    if (carveOn) {
      let lo = 0;
      for (let i = 0; i < CARVE_TIERS.length; i++) {
        const f = me.carving ? Math.min(1, Math.max(0, (me.carveCharge - lo) / (CARVE_TIERS[i] - lo))) : i < this.carveShown ? 1 : 0;
        this.carveSegs[i].style.transform = `scaleX(${f.toFixed(3)})`;
        lo = CARVE_TIERS[i];
      }
      const tier = me.carving ? me.carveTier : this.carveShown;
      if (me.carving) this.carveShown = me.carveTier;
      this.carve.style.setProperty('--tier', hex(CARVE_COLORS[tier]));
      setClass(this.carve, 'burst', bursting && !me.carving);
      setText(this.carveLabel, bursting && !me.carving ? `Burst +${Math.round(CARVE_BURST[Math.max(0, tier - 1)] * race.rules.carveBurst * 100)}%` : 'Carve');
    }

    // Speed and limiter.
    let limiter: { text: string; kind: '' | 'off' | 'pack' };
    if (race.lapPhase >= 3) limiter = { text: 'Limiter off', kind: 'off' };
    else {
      const bonus = packBonus(race, me);
      limiter = bonus > 0.005 ? { text: frame.compact ? `Limiter +${Math.round(bonus * 100)}%` : `Limiter +${Math.round(bonus * 100)}% to catch the pack`, kind: 'pack' } : { text: `Limiter ${Math.round(limiterOf(race) * MPH_PER_UNIT)}`, kind: '' };
    }
    this.dash.update(race, me, abl, k.ability, Math.round(me.speed * MPH_PER_UNIT), me.boosting || bursting, limiter);

    // Tactics.
    const tactic = race.teams[me.team].tactic;
    for (let i = 1; i <= 4; i++) setClass(this.tacticEls[i], 'on', tactic === i);
    setText(this.tacticHub, tactic === TACTIC.FREE ? 'Team play' : TACTIC_LABEL[tactic]);

    // Hints: only what matters right now.
    // On a small or narrow screen, only the few that matter most (the Controls screen has the rest).
    const compact = frame.compact || frame.narrow;
    const escorting = battle && race.mechs[me.target].team === me.team;
    const hintKey = `${this.device}|${me.retired ? 'r' : battle ? (escorting ? 'e' : 'b') : 's'}|${race.lapPhase}|${me.finished ? 'f' : ''}|${shown}|${compact ? 'c' : ''}`;
    if (hintKey !== this.hintKey) {
      this.hintKey = hintKey;
      let items: Array<[string, string]> = [];
      if (this.device === 'touch') {
        // The buttons are labelled: nothing to hint.
      } else if (me.retired || me.finished) {
        items.push([k.lock, 'Next camera'], [k.pause, 'Pause']);
      } else if (battle) {
        items.push([k.x, 'Attack'], [k.y, SPECIAL], [k.guard, 'Guard'], [k.dash, 'Dash / boost'], [k.swing, 'Swing'], [k.ability, ABILITIES[shown].name], [k.swap, 'Switch target'], escorting ? [k.ally, 'Back to the fight'] : [k.lock, 'Let go']);
        if (compact) items = [items[0], items[2], items[3], items[7]];
      } else {
        items.push([k.accel, 'Accelerate'], [k.brake, 'Brake'], [k.carve, 'Carve'], [k.boost, 'Boost'], [k.lock, 'Lock on']);
        // (Nobody to escort in a Sprint.)
        if (!race.sprint) items.push([k.ally, 'Escort']);
        if (race.lapPhase >= 2) items.push([k.x, 'Attack'], [k.ability, ABILITIES[shown].name]);
        // Compact: boost, carve, lock on, and the ability once weapons are free (else escort, if there is anyone to).
        if (compact) items = [items[3], items[2], items[4], ...(race.lapPhase >= 2 ? [items[items.length - 1]] : items.slice(5, 6))];
      }
      this.hints.replaceChildren(...items.map(([key, label]) => h('span' + (label === SPECIAL ? '.special' : ''), h('span.key', key), label)));
      this.specialHint = this.hints.querySelector<HTMLElement>('.special');
      this.specialShown = -1;
    }
    // The special while it recharges: dimmed, a line under it filling as it comes back.
    if (this.specialHint) {
      const special = ATTACKS[CLASSES[me.role].secondary];
      const back = me.cdSecondary > 0 ? Math.round(100 * (1 - Math.min(1, me.cdSecondary / (attackTotal(special) + special.cooldown)))) : 100;
      if (back !== this.specialShown) {
        this.specialShown = back;
        setClass(this.specialHint, 'cooling', back < 100);
        this.specialHint.style.setProperty('--p', `${back}%`);
      }
    }

    // Target panel and reticle.
    const focus = race.mechs[focusId];
    if (focus.target >= 0 && !focus.retired) {
      const t = race.mechs[focus.target];
      const tc = CLASSES[t.role];
      const ally = t.team === focus.team;
      this.target.hidden = false;
      setClass(this.target, 'ally', ally);
      setText(this.targetName, t.name);
      setText(this.targetRole, `${mechName(t, lookOf(t.team).livery.models[t.role])}, ${lookOf(t.team).name}`);
      setIcon(this.targetRoleIco, ROLE_ICON[t.role]);
      const portrait = `url(${pilotOf(t)})`;
      if (this.targetPilot.style.backgroundImage !== portrait) this.targetPilot.style.backgroundImage = portrait;
      const dist = Math.hypot(deltaS(this.track, t.s, focus.s), t.d - focus.d);
      setText(this.targetDist, dist > LOCK_BREAK * 0.8 ? 'Losing lock' : `${Math.round(dist)} m`);
      this.targetHp.style.transform = `scaleX(${Math.max(0, t.hp / t.maxHp).toFixed(3)})`;
      this.targetGd.style.transform = `scaleX(${Math.max(0, t.guard / tc.guardMax).toFixed(3)})`;
      const p = plates[t.id];
      this.reticle.hidden = !p.visible;
      if (p.visible) {
        const sc = Math.max(0.5, Math.min(1.6, 34 / p.dist + 0.35));
        this.reticle.style.transform = `translate(${p.cx.toFixed(1)}px, ${p.cy.toFixed(1)}px) scale(${sc.toFixed(2)})`;
        setClass(this.reticle, 'ally', ally);
      }
      if (this.lastTarget !== t.id) {
        this.lastTarget = t.id;
        this.reticle.classList.remove('snap');
        void this.reticle.offsetWidth;
        this.reticle.classList.add('snap');
      }
    } else {
      this.target.hidden = true;
      this.reticle.hidden = true;
      this.lastTarget = -1;
    }

    // Free steering: show who the lock button would take, so pressing it is
    // never a guess. The same choice the simulation makes.
    const flying = focusId === this.localId && race.phase === PHASE.RACING && !focus.retired && !focus.finished && focus.mode === MODE.SPEED;
    const previewId = flying ? pickTarget(race, this.track, focus, false, -1) : -1;
    const pv = previewId >= 0 ? plates[previewId] : null;
    this.preview.hidden = !pv || !pv.visible;
    if (pv && pv.visible) {
      const sc = Math.max(0.5, Math.min(1.6, 34 / pv.dist + 0.35));
      this.preview.style.transform = `translate(${pv.cx.toFixed(1)}px, ${pv.cy.toFixed(1)}px) scale(${sc.toFixed(2)})`;
    }

    // Name plates. While locked on to a rival, the others you could switch to
    // carry an arrow for the way to flick the stick; while free, the one the
    // lock would take carries the lock key. A rival winding up a heavy blow
    // at you carries a warning: what answers it, lit white when it is time.
    const lockedOn = focus.target >= 0 && !focus.retired ? race.mechs[focus.target] : null;
    const curAng = lockedOn ? wrapAngle(Math.atan2(lockedOn.d - focus.d, deltaS(this.track, lockedOn.s, focus.s)) - focus.facing) : 0;
    for (const m of race.mechs) {
      const p = plates[m.id];
      const pl = this.plates[m.id];
      const show = p.visible && m.id !== focusId && !m.retired && p.dist < 330 && p.dist > 14;
      if (pl.el.hidden === show) pl.el.hidden = !show;
      let side = 0;
      if (lockedOn && m !== lockedOn && m.id !== focusId && (m.team === focus.team) === (lockedOn.team === focus.team) && !m.retired && !m.finished) {
        const ds = deltaS(this.track, m.s, focus.s);
        if (Math.hypot(ds, m.d - focus.d) <= LOCK_BREAK && (m.team === focus.team || m.cloakT <= 0)) {
          side = wrapAngle(Math.atan2(m.d - focus.d, ds) - focus.facing) >= curAng ? 1 : -1;
        }
      }
      const cueText = side > 0 ? '▶' : side < 0 ? '◀' : m.id === previewId ? k.lock : '';
      if (cueText !== pl.cueText) {
        pl.cueText = cueText;
        setText(pl.cue, cueText);
        setClass(pl.el, 'cand', side !== 0);
        setClass(pl.el, 'preview', side === 0 && cueText !== '');
      }
      const tell = m.target === focusId && m.team !== focus.team && !focus.retired ? tellOf(m, race.tick) : null;
      const warnKey = tell ? `${tell.kind}${tell.now ? '!' : ''}` : '';
      if (warnKey !== pl.warnKey) {
        pl.warnKey = warnKey;
        pl.warn.hidden = !tell;
        if (tell) {
          setText(pl.warnText, TELL_LABEL[tell.kind]);
          setIcon(pl.warnIco, TELL_ICON[tell.kind]);
          pl.warn.className = `warn ${tell.kind}${tell.now ? ' now' : ''}`;
        }
      }
      // Off screen, the warning moves to an arrow on the edge pointing at them.
      const offscreen = tell !== null && !p.visible;
      const edgeKey = offscreen && tell ? `${tell.kind}${tell.now ? '!' : ''}` : '';
      if (edgeKey !== pl.edgeKey) {
        pl.edgeKey = edgeKey;
        pl.edge.hidden = !offscreen;
        if (offscreen && tell) {
          pl.edge.className = `edgewarn ${tell.kind}${tell.now ? ' now' : ''}`;
          setText(pl.edgeLabel, TELL_LABEL[tell.kind]);
          setIcon(pl.edgeIco, TELL_ICON[tell.kind]);
        }
      }
      if (offscreen) {
        const W = this.root.clientWidth || window.innerWidth;
        const H = this.root.clientHeight || window.innerHeight;
        const len = Math.hypot(p.ex, p.ey) || 1;
        const ux = p.ex / len;
        const uy = p.ey / len;
        const reach = Math.min((W * 0.5 - 64) / Math.max(1e-6, Math.abs(ux)), (H * 0.5 - 64) / Math.max(1e-6, Math.abs(uy)));
        pl.edge.style.transform = `translate(${(W * 0.5 + ux * reach).toFixed(1)}px, ${(H * 0.5 + uy * reach).toFixed(1)}px) translate(-50%, -50%)`;
        pl.edgeArrow.style.transform = `rotate(${Math.atan2(uy, ux).toFixed(3)}rad)`;
      }
      if (show) {
        const sc = Math.max(0.62, Math.min(1.05, 60 / p.dist + 0.5));
        pl.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%) scale(${sc.toFixed(2)})`;
        pl.hp.style.transform = `scaleX(${Math.max(0, m.hp / m.maxHp).toFixed(2)})`;
      }
    }

    // Support awards: each line rises and fades after a couple of seconds.
    this.hudTime += dt;
    for (let i = this.awardItems.length - 1; i >= 0; i--) {
      const it = this.awardItems[i];
      it.t += dt;
      if (it.t > 2.4) {
        it.el.remove();
        this.awardItems.splice(i, 1);
      }
    }
    this.supportPrompt(race, me);

    // Damage numbers: rise and fade over the mech that took the hit.
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const pop = this.pops[i];
      pop.t += dt;
      const p = plates[pop.victim];
      if (pop.t > 0.9 || !p || !p.visible) {
        pop.el.remove();
        this.pops.splice(i, 1);
        continue;
      }
      const rise = 46 + pop.t * 70;
      pop.el.style.transform = `translate(${(p.cx + pop.dx).toFixed(1)}px, ${(p.cy - rise).toFixed(1)}px) translate(-50%, -50%) scale(${(pop.t < 0.08 ? 1.5 - pop.t * 6 : 1).toFixed(2)})`;
      pop.el.style.opacity = String(pop.t < 0.55 ? 1 : Math.max(0, 1 - (pop.t - 0.55) / 0.35));
    }

    // Tower and map, a few times a second.
    if (this.frame % 6 === 1) {
      const leader = race.mechs.reduce((a, b) => (b.place < a.place ? b : a));
      for (const m of race.mechs) {
        const row = this.rows[m.id];
        if (row.place !== m.place) {
          row.place = m.place;
          // Each row slides to its place (the spacing is the layout's: see .tower .row).
          row.el.style.setProperty('--i', String(m.place - 1));
          setText(row.pos, String(m.place));
        }
        row.hp.style.transform = `scaleX(${Math.max(0, m.hp / m.maxHp).toFixed(2)})`;
        setClass(row.el, 'out', m.retired);
        setClass(row.el, 'done', m.finished && !m.retired);
        let gap = '';
        if (m.retired) gap = 'OUT';
        else if (m.finished) gap = 'FIN';
        else if (m === leader) gap = 'Lead';
        else if (!leader.finished) gap = `+${((leader.s - m.s) / Math.max(60, leader.speed, limiterOf(race))).toFixed(1)}`;
        setText(row.gap, gap);
      }
      this.drawMap(race);
    }

    // Timers.
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0.3) this.banner.classList.add('out');
      if (this.bannerTimer <= 0) this.banner.hidden = true;
    }
    if (this.noticeTimer > 0) {
      this.noticeTimer -= dt;
      if (this.noticeTimer <= 0) this.notice.hidden = true;
    }

    // Retired / finished overlay.
    const showOut = (me.retired || me.finished) && race.phase === PHASE.RACING;
    if (this.retired.hidden === showOut) this.retired.hidden = !showOut;
    if (showOut) {
      setText(this.retired.firstElementChild as HTMLElement, me.retired ? 'Retired' : `Finished ${me.place}${ORD[me.place - 1]}`);
      (this.retired.firstElementChild as HTMLElement).style.background = me.retired ? '' : 'var(--charge)';
      (this.retired.firstElementChild as HTMLElement).style.color = me.retired ? '' : 'var(--ink)';
      setText(this.retiredSmall, me.retired && !race.sprint ? `Watching ${focus.name}. You can still call team plays.` : `Watching ${focus.name}.`);
    }

    // Radio lines that depend on thresholds rather than events.
    for (const m of race.mechs) {
      const before = this.lastHp[m.id] / m.maxHp;
      const now = m.hp / m.maxHp;
      this.lastHp[m.id] = m.hp;
      if (m.team !== me.team || m.retired) continue;
      if (m.id !== this.localId) {
        if (before >= 0.25 && now < 0.25) this.say(m, pick(LINES.critical, this.seq++));
        else if (before >= 0.55 && now < 0.55) this.say(m, pick(LINES.hurt, this.seq++));
      } else if (before >= 0.25 && now < 0.25) {
        const mate = race.mechs.find((o) => o.team === me.team && o.id !== me.id && !o.retired);
        if (mate) this.say(mate, pick(LINES.warnYou, this.seq++));
        this.showNotice('Armour critical', true, 2.5);
        this.onCritical();
      }
    }
  }

  /**
   * The guard and charge meters hang just under your mech's feet (the body's
   * centre mirrored from the head), kept clear of the bottom of the screen.
   * With touch controls they stack over the dash instead (styles.css).
   */
  private placeUnderMech(p: Plate | undefined): void {
    const boxes = [this.guardBox, this.chargeBox];
    if (this.device === 'touch' || !p || !p.visible || !(boxes[0].classList.contains('on') || boxes[1].classList.contains('on'))) {
      if (this.device === 'touch') for (const b of boxes) b.style.left = b.style.top = '';
      return;
    }
    const H = this.root.clientHeight || window.innerHeight;
    const W = this.root.clientWidth || window.innerWidth;
    const em = frame.em;
    const feet = p.cy + (p.cy - p.y) * 0.92;
    const top = Math.max(H * 0.42, Math.min(H - (frame.compact ? 6.6 : 9.4) * em, feet + 0.3 * em));
    // Level with the dash in the corner, it stays to the dash's left.
    const [dashW, dashH, half, tall] = frame.compact ? [19.9, 8.4, 5.3, 2.3] : [27.1, 11.6, 6.2, 2.7];
    const beside = top + tall * em > H - dashH * em;
    const left = Math.max(8 * em, Math.min(W - (beside ? dashW + half + 0.6 : 8) * em, p.cx));
    for (const b of boxes) {
      b.style.left = `${left.toFixed(0)}px`;
      b.style.top = `${top.toFixed(0)}px`;
    }
  }

  /** The guard meter shows a break or a parry for a moment. */
  private flashGuard(kind: 'broken' | 'parry', text: string): void {
    this.guardFlash = kind === 'broken' ? 1.1 : 0.45;
    setClass(this.guardBox, 'broken', kind === 'broken');
    setClass(this.guardBox, 'parry', kind === 'parry');
    setText(this.guardLabel, text);
  }

  // ---- messages -----------------------------------------------------------

  /**
   * A banner across the screen. With the anime look on it is a title card
   * instead: a hard cut to a black band, heavy serif type and a red rule, with
   * `kick` (an episode-style line, "Lap two") over the title.
   */
  showBanner(big: string, small: string, cls = '', seconds = 2.6, kick = ''): void {
    this.banner.className = 'banner ' + cls + (this.anime ? ' anime' : '');
    setText(this.bannerKick, this.anime ? kick : '');
    this.bannerKick.hidden = !this.anime || !kick;
    setText(this.bannerBig, big);
    setText(this.bannerSmall, small);
    this.banner.hidden = false;
    // Restart the entrance animation.
    const strip = this.banner.firstElementChild as HTMLElement;
    strip.style.animation = 'none';
    void strip.offsetWidth;
    strip.style.animation = '';
    this.bannerTimer = seconds;
  }

  showCount(text: string, go = false): void {
    this.count.className = 'count' + (go ? ' go' : '');
    // The anime look: the numbers and GO! as painted.
    const art = this.anime ? COUNT[text] : undefined;
    if (art) {
      const img = h<'img'>('img');
      img.src = art.url;
      img.alt = text;
      this.count.replaceChildren(h('span.painted', img));
    } else {
      this.count.replaceChildren(h('span', text));
    }
    this.count.hidden = false;
  }

  showNotice(text: string, warn = false, seconds = 1.6): void {
    setText(this.noticeText, text);
    this.notice.className = 'notice' + (warn ? ' warn' : '');
    this.notice.hidden = false;
    this.noticeTimer = seconds;
  }

  /** A line on the radio from a pilot (or race control when `from` is null). */
  say(from: MechState | null, text: string): void {
    // The anime look: a cut-in of the pilot's face beside the line, as on a comms screen.
    const face = from ? h('i.pilot') : null;
    if (face && from) face.style.backgroundImage = `url(${pilotOf(from)})`;
    const el = h('div.msg' + (from ? (from.team ? '.t1' : '') : '.ctl'), face, h('span.line', h('b', from ? from.name : 'Race control'), text));
    if (from) teamStyle(el, from.team);
    this.comms.append(el);
    this.onRadio();
    while (this.comms.children.length > 3) this.comms.firstElementChild!.remove();
    window.setTimeout(() => el.classList.add('fade'), 4200);
    window.setTimeout(() => el.remove(), 4800);
  }

  private pop(el: HTMLElement, victim: number): void {
    this.root.append(el);
    this.pops.push({ el, victim, t: 0, dx: (Math.random() - 0.5) * 50 });
    while (this.pops.length > 12) this.pops.shift()!.el.remove();
  }

  /**
   * Short prompts for a support pilot: its forward is in a fight nearby, or on
   * the speed lap is sitting in its tow. One at a time, and not too often.
   */
  private supportPrompt(race: RaceState, me: MechState): void {
    if (me.role === ROLE.FW || me.retired || me.finished || this.hudTime < this.promptAt || race.phase !== PHASE.RACING) return;
    const fw = race.mechs.find((m) => m.team === me.team && m.role === ROLE.FW && !m.retired && !m.finished);
    if (!fw) return;
    const ds = deltaS(this.track, fw.s, me.s);
    const near = Math.hypot(ds, fw.d - me.d) < 220;
    if (weaponsFree(race) && near) {
      const attacker = race.mechs.find((o) => o.team !== me.team && !o.retired && o.target === fw.id && o.mode === MODE.BATTLE);
      if (attacker && me.target !== attacker.id) {
        this.showNotice(me.role === ROLE.DF ? `Your forward is under attack: peel ${attacker.name} off` : `Your forward is in a fight: back them up`, false, 2.2);
        this.promptAt = this.hudTime + 12;
        return;
      }
    }
    if (race.lapPhase >= 3 && fw.towBy === me.id && race.tick - fw.towByTick <= 1 && ds < 0 && ds > -60 && me.mode === MODE.SPEED) {
      this.showNotice('Your forward is in your tow: hold the line for a Lead-out', false, 2.2);
      this.promptAt = this.hudTime + 20;
    }
  }

  /** Returns a sound cue name when the event deserves one from the HUD's side. */
  onEvent(e: SimEvent, race: RaceState): void {
    const me = race.mechs[this.localId];
    const mates = race.mechs.filter((m) => m.team === me.team && m.id !== me.id && !m.retired);
    switch (e.type) {
      case 'countdown':
        if (e.n > 0) this.showCount(String(e.n));
        else {
          this.showCount('GO', true);
          window.setTimeout(() => (this.count.hidden = true), 900);
          if (this.track.gates.length > 0 && race.rules.gateLaps >= 1 && race.rules.gateValue > 0) {
            // Later laps only count if a gate is worth something on them.
            const laps = race.rules.gateValueLater > 0 ? Math.min(race.rules.gateLaps, race.laps) : 1;
            const worth = race.rules.gateValue === 0.5 ? 'half a Cell' : race.rules.gateValue === 1 ? 'a Cell' : `${race.rules.gateValue} of a Cell`;
            const when = laps <= 1 ? 'this lap only' : laps >= race.laps ? 'on every lap' : `for ${laps} laps`;
            const dark = race.rules.gateRelight > 0 ? ` Take one and it goes dark for everyone for ${race.rules.gateRelight} s.` : '';
            const text = `Gates are lit ${when}. Gold arches, ${worth} each.${dark}`;
            window.setTimeout(() => this.say(null, text), 1400);
          }
          if (me.role !== ROLE.FW && race.rules.supportCap > 0) {
            const what = me.role === ROLE.DF ? 'Peel and save for your forward, guard it, ring rivals out' : 'Snare, interrupt, back up your teammates, wear down their forward';
            window.setTimeout(() => this.say(null, `Support points count for the team: ${what}. Up to ${race.rules.supportCap} a race.`), 4200);
          }
        }
        break;
      case 'launch': {
        // The start the revs earned, in the gauge's place; a plain one just clears it.
        if (e.mech !== this.localId) break;
        const said = e.grade === START.PERFECT ? 'Perfect start!' : e.grade === START.GOOD ? 'Good start' : e.grade === START.BOG ? 'Over-revved!' : '';
        this.revBox.dataset.grade = said ? String(e.grade) : '';
        this.revLabel.replaceChildren(said);
        this.revResultT = said ? 1.4 : 0.25;
        break;
      }
      case 'award': {
        // Your own in large, your teammates' in small, theirs not at all.
        const who = race.mechs[e.mech];
        if (who.team !== me.team) break;
        const mine = e.mech === this.localId;
        const el = h('div.award' + (mine ? '.me' : ''), h('b', `+${e.points}`), h('span', AWARD_NAMES[e.kind]), mine ? '' : h('small', who.name));
        this.awardFeed.prepend(el);
        this.awardItems.push({ el, t: 0 });
        while (this.awardItems.length > 5) this.awardItems.shift()!.el.remove();
        if (mine && !this.capShown && who.support >= race.rules.supportCap) {
          this.capShown = true;
          window.setTimeout(() => this.showNotice(`Support points maxed: ${race.rules.supportCap} for the team this race`, false, 2.2), 600);
        }
        break;
      }
      case 'gateShare':
        if (e.mech === this.localId) {
          // A teammate's gate paid this pilot its share.
          const from = race.mechs[e.from];
          const share = (from.lap <= 0 ? race.rules.gateValue : race.rules.gateValueLater) * race.rules.gateShare;
          const amount = share === 0.5 ? '½' : String(Math.round(share * 100) / 100);
          const total = Math.round(e.cells * 10) / 10;
          this.showNotice(e.cells >= race.rules.cellMax ? `${from.name}'s gate: Cells full` : `${from.name}'s gate: +${amount} Cell (${total} of ${race.rules.cellMax})`, false, 1.3);
        }
        break;
      case 'gate':
        if (e.mech === this.localId) {
          const full = e.cells >= race.rules.cellMax;
          const amount = Math.round(e.cells * 100) / 100;
          this.showNotice(full ? 'Cells full' : Number.isInteger(e.cells) ? `Cell banked: ${amount} of ${race.rules.cellMax}` : e.cells === 0.5 ? 'Half a Cell' : `Cells: ${amount} of ${race.rules.cellMax}`, false, 1.3);
        }
        break;
      case 'ability': {
        const who = race.mechs[e.mech];
        const key = (['overdrive', 'breakaway', 'snare', 'pulse', 'ram', 'aegis'] as const)[e.ability];
        if (e.mech === this.localId) this.showNotice(ABILITIES[e.ability].name, false, 1.4);
        else if (who.team === me.team) this.say(who, pick(LINES[key], this.seq++).replace('{t}', 'them'));
        else if (e.ability === ABILITY.OVERDRIVE) this.say(null, `${who.name} is in Overdrive.`);
        if (e.ability === ABILITY.AEGIS && who.team === me.team && e.mech !== this.localId && me.shieldT > 0) this.showNotice('Aegis: you are shielded', false, 1.6);
        break;
      }
      case 'snared': {
        const victim = race.mechs[e.mech];
        const by = race.mechs[e.by];
        if (e.mech === this.localId) this.showNotice('Snared: speed cut, no boost', true, 2.2);
        else if (e.by === this.localId) this.showNotice(`${victim.name} is snared`, false, 1.6);
        else if (by.team === me.team) this.say(by, pick(LINES.snared, this.seq++).replace('{t}', victim.name));
        break;
      }
      case 'lapPhase':
        if (e.lap === 2) {
          this.showBanner('Battle lap', 'Weapons free', 'p2', 3, 'Lap two');
          if (mates[0]) this.say(mates[0], pick(LINES.battle, this.seq++));
        } else if (e.lap === 3) {
          this.showBanner('Speed lap', 'Limiters off', 'p3', 3, 'Final lap');
          if (mates[0]) this.say(mates[mates.length - 1], pick(LINES.speed, this.seq++));
        }
        break;
      case 'denied':
        if (e.mech === this.localId) {
          const who = race.mechs[e.mech];
          const special = ATTACKS[CLASSES[who.role].secondary];
          const why = {
            cooldown: `${special.name} recharging: ready in ${Math.max(0.1, who.cdSecondary * DT).toFixed(1)} s`, weapons: 'Weapons and abilities are locked until the battle lap', drive: 'Not enough Drive', target: 'No target in range', cells: race.rules.gateLaps <= 1 || race.rules.gateValueLater <= 0 ? 'No Cells. The gates only light on the formation lap' : 'No Cells. Thread a gold gate to earn one back', switch: 'No other target in reach', lap: 'Overdrive opens on the speed lap' }[e.reason];
          this.showNotice(why, e.reason === 'weapons');
        }
        break;
      case 'tactic': {
        if (e.team === me.team) {
          const key = (['free', 'blitz', 'run', 'shield', 'mark'] as const)[e.tactic];
          const tName = e.mark >= 0 ? race.mechs[e.mark].name : '';
          mates.forEach((m, i) => {
            window.setTimeout(() => this.say(m, pick(LINES[key], this.seq++ + i).replace('{t}', tName)), 250 + i * 650);
          });
        } else if (e.tactic === TACTIC.MARK && e.mark >= 0 && race.mechs[e.mark].team === me.team) {
          // The other side just called a focus on one of ours.
          const victim = race.mechs[e.mark];
          const caller = mates.find((m) => m.id !== victim.id) ?? mates[0];
          const who = victim.id === this.localId ? 'you' : victim.name;
          if (caller) this.say(caller, pick(LINES.marked, this.seq++).replace('{t}', who));
          else this.say(null, `They have marked ${who}.`);
        }
        break;
      }
      case 'ko': {
        const victim = race.mechs[e.mech];
        const by = e.by >= 0 ? race.mechs[e.by] : null;
        if (victim.id === this.localId) {
          this.showBanner('Knocked out', by ? `by ${by.name}` : '', 'p2', 3, 'Retired');
        } else if (victim.team === me.team) {
          this.say(victim, pick(LINES.out, this.seq++));
        } else if (by && by.id === this.localId) {
          this.showBanner('Knockout', race.rules.koPoints > 0 && !race.sprint ? `${victim.name} is out · +${race.rules.koPoints} points` : `${victim.name} is out`, '', 2.4);
          if (mates[0]) this.say(mates[0], pick(LINES.praise, this.seq++).replace('{t}', victim.name));
        } else if (by && by.team === me.team) {
          this.say(by, pick(LINES.kill, this.seq++).replace('{t}', victim.name));
        } else {
          this.say(null, `${victim.name} has retired.`);
        }
        break;
      }
      case 'hit':
        if (e.attacker === this.localId || e.victim === this.localId) {
          const mine = e.attacker === this.localId;
          const dmg = Math.round(e.damage);
          if (dmg <= 0 && !e.blocked) break;
          const surge = e.charged && !e.blocked;
          const cls = 'div.pop' + (mine ? '' : '.taken') + (e.heavy && !e.blocked ? '.big' : '') + (e.blocked ? '.blocked' : '') + (surge ? '.momentum' : '');
          const el = surge ? h(cls, h('small', 'Momentum'), String(dmg)) : h(cls, e.blocked ? `${dmg} blocked` : String(dmg));
          this.pop(el, e.victim);
        }
        break;
      case 'splat':
        if (e.by === this.localId || e.mech === this.localId) {
          const mine = e.by === this.localId;
          this.pop(h('div.pop.ring' + (mine ? '' : '.taken'), h('small', 'Ring-out'), String(Math.round(e.damage))), e.mech);
          if (mine) this.showNotice('Ring-out', false, 1.2);
        }
        break;
      case 'fall': {
        // Off an open edge or short of a jump: a drone fetches the mech back, at a price.
        const victim = race.mechs[e.mech];
        const by = e.by >= 0 ? race.mechs[e.by] : null;
        if (e.mech === this.localId) {
          this.showNotice(by ? `Knocked off by ${by.name}` : 'Off the edge', true, 2);
          this.pop(h('div.pop.ring.taken', h('small', 'Fall'), String(Math.round(e.damage))), e.mech);
        } else if (by && by.id === this.localId) {
          this.pop(h('div.pop.ring', h('small', 'Over the edge'), String(Math.round(e.damage))), e.mech);
          this.showNotice(`${victim.name} is over the edge`, false, 1.4);
        } else if (victim.team === me.team) {
          this.say(victim, pick(LINES.fell, this.seq++));
        } else if (by && by.team === me.team) {
          this.say(by, pick(LINES.sentOver, this.seq++).replace('{t}', victim.name));
        }
        break;
      }
      case 'recover':
        if (e.mech === this.localId) this.showNotice('Back on the road', false, 1.2);
        break;
      case 'parry':
        if (e.mech === this.localId) {
          this.showNotice('Parry');
          this.flashGuard('parry', 'Parry');
        }
        break;
      case 'guardBreak':
        if (e.mech === this.localId) {
          this.showNotice('Guard broken', true);
          this.flashGuard('broken', 'Guard broken');
        }
        else if (e.by === this.localId) this.showNotice('Guard break');
        break;
      case 'escape':
        if (e.mech === this.localId) this.showNotice('Broke free');
        break;
      case 'lap':
        if (e.mech === this.localId && e.lap === race.laps) this.showNotice('Final lap');
        break;
      case 'finish': {
        const m = race.mechs[e.mech];
        if (e.mech === this.localId) this.showBanner(`Finished ${e.place}${ORD[e.place - 1]}`, '', 'p3', 3, 'The flag');
        else if (m.team === me.team) this.say(m, pick(LINES.finish, this.seq++));
        else if (e.place === 1) this.say(null, `${m.name} takes the flag.`);
        break;
      }
      default:
        break;
    }
  }
}
