// The race HUD: place, running order, team score, map, gauges, speed,
// tactics, radio, target and banners. Plain DOM over the canvas.
import {
  ABILITIES,
  ABILITY,
  CLASSES,
  CRITICAL_HP,
  DRIVE_MAX,
  DT,
  LOCK_BREAK,
  MODE,
  MPH_PER_UNIT,
  PHASE,
  ROLE_KEYS,
  ROLE_NAMES,
  TACTIC,
  TICK_RATE,
  abilityFor,
  deltaS,
  limiterOf,
  wrapAngle,
  packBonus,
  teamPoints,
  weaponsFree,
  wrapS,
  type MechState,
  type RaceState,
  type SimEvent,
  type Track,
} from '../../sim/index';
import { LIVERIES } from '../render/palette';
import type { Plate } from '../render/raceView';
import { h, setClass, setText } from './dom';

const ORD = ['st', 'nd', 'rd', 'th', 'th', 'th'];
const PHASE_NAMES = ['', 'Formation lap', 'Battle lap', 'Speed lap'];
const TACTIC_LABEL = ['Free', 'Blitz', 'Run', 'Shield', 'Mark'];

type Device = 'pad' | 'keys';

const KEYS: Record<Device, Record<string, string>> = {
  pad: { accel: 'RT', brake: 'LT', boost: 'A', dash: 'A', lock: 'LB', ally: 'L3', ability: 'B', x: 'X', y: 'Y', guard: 'RB', swap: 'R stick ◀ ▶', up: '▲', right: '▶', down: '▼', left: '◀', pause: 'Start' },
  keys: { accel: 'W', brake: 'S', boost: 'Space', dash: 'Space', lock: 'Q', ally: 'E', ability: 'R', x: 'J', y: 'K', guard: 'L', swap: 'Z C', up: '1', right: '2', down: '3', left: '4', pause: 'Esc' },
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
};

function me0(race: RaceState, id: number): number {
  return race.mechs[id]?.cells ?? 0;
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
  // gauges
  private armour = h('div.line.armour');
  private armourFill = h('i.fill');
  private armourGhost = h('i.ghost');
  private armourVal = h('span.val', '');
  private guardFill = h('i');
  private drive = h('div.line.drive');
  private driveFill = h('i');
  private driveVal = h('span.val', '');
  private cellsLine = h('div.line.cells');
  private cellPips = h('div.pips');
  private pipFills: HTMLElement[] = [];
  private cellsVal = h('span.val', '');
  private abilityTag = h('span.ability');
  private abilityKey = h('span.key', 'B');
  private abilityName = h('span', '');
  private chipAbility = h('span.chip.cell', '');
  private chipSnared = h('span.chip.snared', 'Snared');
  private chipSling = h('span.chip.draft', 'Slingshot');
  private lastCells = 0;
  private chipLocked = h('span.chip.locked', 'Weapons locked');
  private chipMode = h('span.chip.battle', '');
  private chipCharge = h('span.chip.charge', 'Charging');
  private chipDraft = h('span.chip.draft', 'Slipstream');
  private chipLink = h('span.chip.link', 'Linked');
  private hints = h('div.hints');
  private hintKey = '';
  // speed
  private speedBox = h('div.speed');
  private mph = h('span.mph', '0');
  private limiter = h('div.limiter', 'Limiter 330');
  // tactics
  private tacticEls: HTMLElement[] = [];
  private tacticHub = h('div.hub', 'Team play');
  // radio, target, plates
  private comms = h('div.comms');
  private target = h('div.target');
  private targetName = h('div.name', '');
  private targetRole = h('span', '');
  private targetDist = h('span', '');
  private targetHp = h('i');
  private targetGd = h('i');
  private reticle = h('div.reticle', h('i'), h('i'), h('i'), h('i'));
  private plates: Array<{ el: HTMLElement; hp: HTMLElement; cue: HTMLElement; side: number }> = [];
  private lastTarget = -1;
  // banners
  private banner = h('div.banner');
  private bannerBig = h('div.big', '');
  private bannerSmall = h('div.small', '');
  private bannerTimer = 0;
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
      h('div.score', h('div.side.a', this.nameA, this.ptsA), this.clock, h('div.side.b', this.nameB, this.ptsB)),
      this.matchLine,
      h('div.mapbox', this.map),
    );
    this.armour.append(h('span.label', 'Armour'), h('div.bar', this.armourGhost, this.armourFill), this.armourVal);
    this.drive.append(h('span.label', 'Drive'), h('div.bar', this.driveFill), this.driveVal);
    this.abilityTag.append(this.abilityKey, this.abilityName);
    this.cellsLine.append(h('span.label', 'Cells'), h('div.cellrow', this.cellPips, this.abilityTag), this.cellsVal);
    R.append(
      h('div.chips', this.chipLocked, this.chipMode, this.chipAbility, this.chipSnared, this.chipCharge, this.chipDraft, this.chipSling, this.chipLink),
      h('div.gauges', this.armour, h('div.line.guard', h('span.label', 'Guard'), h('div.bar', this.guardFill), h('span.val', '')), this.drive, this.cellsLine),
      this.hints,
    );
    this.speedBox.append(h('div', this.mph, h('span.unit', 'mph')), this.limiter);
    R.append(this.speedBox);
    const tact = h('div.tactics', this.tacticHub);
    for (const [cls, tac] of [['up', TACTIC.BLITZ], ['right', TACTIC.RUN], ['down', TACTIC.SHIELD], ['left', TACTIC.MARK]] as const) {
      const el = h('div.t.' + cls);
      el.dataset.tactic = String(tac);
      this.tacticEls[tac] = el;
      tact.append(el);
    }
    R.append(tact, this.comms);
    this.target.append(this.targetName, h('div.sub', this.targetRole, this.targetDist), h('div.bar.hp', this.targetHp), h('div.bar.gd', this.targetGd));
    R.append(this.target, this.reticle);
    this.banner.append(h('div.strip', this.bannerBig, this.bannerSmall));
    this.notice.append(this.noticeText);
    this.retired.append(h('div.big', 'Retired'), this.retiredSmall);
    R.append(this.banner, this.count, this.notice, this.retired);
    this.banner.hidden = true;
    this.count.hidden = true;
    this.notice.hidden = true;
    this.retired.hidden = true;
    this.target.hidden = true;
    this.reticle.hidden = true;
    R.hidden = true;
    parent.append(R);
  }

  setDevice(d: Device): void {
    this.device = d;
    this.hintKey = '';
    const k = KEYS[d];
    const set = (tac: number, key: string) => {
      const el = this.tacticEls[tac];
      el.replaceChildren(h('span.key', key), TACTIC_LABEL[tac]);
    };
    set(TACTIC.BLITZ, k.up);
    set(TACTIC.RUN, k.right);
    set(TACTIC.SHIELD, k.down);
    set(TACTIC.MARK, k.left);
  }

  /** Set up for a new race. */
  begin(race: RaceState, track: Track, localId: number): void {
    this.track = track;
    this.localId = localId;
    this.names = race.mechs.map((m) => m.name);
    this.lastHp = race.mechs.map((m) => m.hp);
    this.spoke = race.mechs.map(() => -9999);
    this.root.hidden = false;
    this.root.style.setProperty('--team0', LIVERIES[0].css);
    this.root.style.setProperty('--team1', LIVERIES[1].css);
    setText(this.nameA, LIVERIES[0].name.replace('Team ', ''));
    setText(this.nameB, LIVERIES[1].name.replace('Team ', ''));

    this.tower.replaceChildren();
    this.rows = [];
    this.plates.forEach((p) => p.el.remove());
    this.plates = [];
    for (const m of race.mechs) {
      const pos = h('span.pos', '');
      const hp = h('i');
      const gap = h('span.gap', '');
      const el = h('div.row' + (m.team ? '.t1' : '') + (m.id === localId ? '.me' : ''), pos, h('span.flag'), h('span.who', m.name, h('small', ROLE_KEYS[m.role])), h('div.bar.hp', hp), gap);
      this.tower.append(el);
      this.rows.push({ el, pos, hp, gap, place: -1 });
      const php = h('i');
      const cue = h('span.cue', '');
      const plate = h('div.plate' + (m.team ? '.t1' : ''), cue, h('span.tag', `${m.name} ${ROLE_KEYS[m.role]}`), h('div.bar', php));
      plate.hidden = true;
      // Under the panels, so a name never covers the running order.
      this.root.prepend(plate);
      this.plates.push({ el: plate, hp: php, cue, side: 0 });
    }
    this.buildPips(race.rules.cellMax);
    this.lastCells = me0(race, localId);
    this.comms.replaceChildren();
    this.pops.forEach((p) => p.el.remove());
    this.pops = [];
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

  /** One pip per whole Cell the rules allow (the tuning panel can change that mid-race). */
  private buildPips(cellMax: number): void {
    const n = Math.max(0, Math.min(6, Math.ceil(cellMax)));
    if (n === this.pipFills.length) return;
    this.cellPips.replaceChildren();
    this.pipFills = [];
    for (let i = 0; i < n; i++) {
      const fill = h('i');
      this.pipFills.push(fill);
      this.cellPips.append(h('div.pip', fill));
    }
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
    if (pilot.lap < race.rules.gateLaps && gateWorth > 0 && !pilot.retired && !pilot.finished && pilot.cells < race.rules.cellMax) {
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
        g.fill();
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
      g.fillStyle = m.retired ? '#5b6272' : LIVERIES[m.team].css;
      g.fill();
      g.lineWidth = size * (me ? 0.02 : 0.012);
      g.strokeStyle = me ? '#ffffff' : 'rgba(15,21,36,0.9)';
      g.stroke();
    }
  }

  // ---- per-frame update ---------------------------------------------------

  update(dt: number, race: RaceState, plates: Plate[], focusId: number): void {
    this.frame++;
    const me = race.mechs[this.localId];
    const c = CLASSES[me.role];
    const k = KEYS[this.device];

    // Place, lap, phase.
    setText(this.placeNum, String(me.place));
    setText(this.placeOrd, ORD[me.place - 1] ?? 'th');
    const lap = Math.min(race.laps, Math.max(1, Math.floor(Math.max(0, me.s) / this.track.length) + 1));
    setText(this.lapNum, `Lap ${lap}/${race.laps}`);
    setText(this.phase, PHASE_NAMES[race.lapPhase]);
    this.phase.className = 'phase p' + race.lapPhase;

    // Score and clock.
    setText(this.ptsA, String(teamPoints(race, 0)));
    setText(this.ptsB, String(teamPoints(race, 1)));
    const secs = Math.max(0, race.tick * DT - 4);
    setText(this.clock, `${Math.floor(secs / 60)}:${(secs % 60).toFixed(1).padStart(4, '0')}`);

    // Gauges.
    const hpF = Math.max(0, me.hp / c.maxHp);
    this.armourFill.style.transform = `scaleX(${hpF.toFixed(3)})`;
    this.armourGhost.style.transform = `scaleX(${hpF.toFixed(3)})`;
    setText(this.armourVal, String(Math.ceil(me.hp)));
    setClass(this.armour, 'low', hpF < CRITICAL_HP && !me.retired);
    this.guardFill.style.transform = `scaleX(${Math.max(0, me.guard / c.guardMax).toFixed(3)})`;
    this.driveFill.style.transform = `scaleX(${(me.drive / DRIVE_MAX).toFixed(3)})`;
    setText(this.driveVal, String(Math.floor(me.drive)));
    setClass(this.drive, 'gain', me.onStrip || me.linked);

    // Cells and the ability they pay for.
    this.buildPips(race.rules.cellMax);
    for (let i = 0; i < this.pipFills.length; i++) {
      this.pipFills[i].style.transform = `scaleX(${Math.max(0, Math.min(1, me.cells - i)).toFixed(2)})`;
    }
    setText(this.cellsVal, String(Math.round(me.cells * 10) / 10));
    if (me.cells > this.lastCells + 0.01) {
      this.cellsLine.classList.remove('gain');
      void this.cellsLine.offsetWidth;
      this.cellsLine.classList.add('gain');
    }
    this.lastCells = me.cells;
    const ab = abilityFor(me);
    const shown = ab === -1 ? c.abilityFree : ab;
    setText(this.abilityKey, k.ability);
    setText(this.abilityName, ABILITIES[shown].name);
    setClass(this.abilityTag, 'ready', ab !== -1 && me.cells >= 1 && weaponsFree(race) && !me.retired && !me.finished);

    // Chips.
    const battle = me.mode === MODE.BATTLE && me.target >= 0;
    this.chipLocked.hidden = !(race.phase === PHASE.RACING && race.lapPhase < 2);
    this.chipMode.hidden = !battle;
    if (battle) {
      const t = race.mechs[me.target];
      setText(this.chipMode, t.team === me.team ? `Escorting ${t.name}` : `Locked on ${t.name}`);
      setClass(this.chipMode, 'link', t.team === me.team);
      setClass(this.chipMode, 'battle', t.team !== me.team);
    }
    this.chipCharge.hidden = !me.onStrip;
    this.chipDraft.hidden = !me.drafting;
    this.chipSling.hidden = !(me.tow > 0.05 && !me.drafting && me.mode === MODE.SPEED && !me.retired);
    this.chipLink.hidden = !me.linked;
    // Whichever ability effect is running, with the seconds left.
    const left = (ticks: number) => (ticks / TICK_RATE).toFixed(1);
    let effect = '';
    if (me.overdriveT > 0) effect = `Overdrive ${left(me.overdriveT)}`;
    else if (me.ramT > 0) effect = `Ram ${left(me.ramT)}`;
    else if (me.shieldT > 0) effect = `Aegis ${left(me.shieldT)}`;
    else if (me.cloakT > 0) effect = 'Clear';
    this.chipAbility.hidden = effect === '' || me.retired;
    if (effect) setText(this.chipAbility, effect);
    this.chipSnared.hidden = !(me.snareT > 0) || me.retired;
    if (me.snareT > 0) setText(this.chipSnared, `Snared ${left(me.snareT)}`);

    // Speed and limiter.
    setText(this.mph, String(Math.round(me.speed * MPH_PER_UNIT)));
    setClass(this.speedBox, 'boost', me.boosting);
    if (race.lapPhase >= 3) {
      setText(this.limiter, 'Limiter off');
      this.limiter.className = 'limiter off';
    } else {
      const bonus = packBonus(race, me);
      if (bonus > 0.005) {
        setText(this.limiter, `Limiter +${Math.round(bonus * 100)}% to catch the pack`);
        this.limiter.className = 'limiter pack';
      } else {
        setText(this.limiter, `Limiter ${Math.round(limiterOf(race) * MPH_PER_UNIT)}`);
        this.limiter.className = 'limiter';
      }
    }

    // Tactics.
    const tactic = race.teams[me.team].tactic;
    for (let i = 1; i <= 4; i++) setClass(this.tacticEls[i], 'on', tactic === i);
    setText(this.tacticHub, tactic === TACTIC.FREE ? 'Team play' : TACTIC_LABEL[tactic]);

    // Hints: only what matters right now.
    const hintKey = `${this.device}|${me.retired ? 'r' : battle ? 'b' : 's'}|${race.lapPhase}|${me.finished ? 'f' : ''}|${shown}`;
    if (hintKey !== this.hintKey) {
      this.hintKey = hintKey;
      const items: Array<[string, string]> = [];
      if (me.retired || me.finished) {
        items.push([k.lock, 'Next camera'], [k.pause, 'Pause']);
      } else if (battle) {
        items.push([k.x, 'Attack'], [k.y, 'Special'], [k.guard, 'Guard'], [k.dash, 'Dash'], [k.ability, ABILITIES[shown].name], [k.swap, 'Switch target'], [k.lock, 'Let go']);
      } else {
        items.push([k.accel, 'Accelerate'], [k.brake, 'Brake'], [k.boost, 'Boost'], [k.lock, 'Lock on'], [k.ally, 'Escort']);
        if (race.lapPhase >= 2) items.push([k.x, 'Attack'], [k.ability, ABILITIES[shown].name]);
      }
      this.hints.replaceChildren(...items.map(([key, label]) => h('span', h('span.key', key), label)));
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
      setText(this.targetRole, `${ROLE_NAMES[t.role]}, ${LIVERIES[t.team].name.replace('Team ', '')}`);
      const dist = Math.hypot(deltaS(this.track, t.s, focus.s), t.d - focus.d);
      setText(this.targetDist, dist > LOCK_BREAK * 0.8 ? 'Losing lock' : `${Math.round(dist)} m`);
      this.targetHp.style.transform = `scaleX(${Math.max(0, t.hp / tc.maxHp).toFixed(3)})`;
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

    // Name plates. While locked on to a rival, the others you could switch to
    // carry an arrow for the way to flick the stick.
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
      if (side !== pl.side) {
        pl.side = side;
        setText(pl.cue, side > 0 ? '▶' : side < 0 ? '◀' : '');
        setClass(pl.el, 'cand', side !== 0);
      }
      if (show) {
        const sc = Math.max(0.62, Math.min(1.05, 60 / p.dist + 0.5));
        pl.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%) scale(${sc.toFixed(2)})`;
        pl.hp.style.transform = `scaleX(${Math.max(0, m.hp / CLASSES[m.role].maxHp).toFixed(2)})`;
      }
    }

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
          row.el.style.transform = `translateY(${(m.place - 1) * 2.1}em)`;
          setText(row.pos, String(m.place));
        }
        row.hp.style.transform = `scaleX(${Math.max(0, m.hp / CLASSES[m.role].maxHp).toFixed(2)})`;
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
      setText(this.retiredSmall, me.retired ? `Watching ${focus.name}. You can still call team plays.` : `Watching ${focus.name}.`);
    }

    // Radio lines that depend on thresholds rather than events.
    for (const m of race.mechs) {
      const before = this.lastHp[m.id] / CLASSES[m.role].maxHp;
      const now = m.hp / CLASSES[m.role].maxHp;
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

  // ---- messages -----------------------------------------------------------

  showBanner(big: string, small: string, cls = '', seconds = 2.6): void {
    this.banner.className = 'banner ' + cls;
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
    this.count.replaceChildren(h('span', text));
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
    const el = h('div.msg' + (from ? (from.team ? '.t1' : '') : '.ctl'), h('b', from ? from.name : 'Race control'), text);
    this.comms.append(el);
    this.onRadio();
    while (this.comms.children.length > 3) this.comms.firstElementChild!.remove();
    window.setTimeout(() => el.classList.add('fade'), 4200);
    window.setTimeout(() => el.remove(), 4800);
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
            const text = `Gates are lit ${when}. Gold arches, ${worth} each.`;
            window.setTimeout(() => this.say(null, text), 1400);
          }
        }
        break;
      case 'launch':
        if (e.mech === this.localId) this.showNotice('Perfect launch');
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
          this.showBanner('Battle lap', 'Weapons free', 'p2', 3);
          if (mates[0]) this.say(mates[0], pick(LINES.battle, this.seq++));
        } else if (e.lap === 3) {
          this.showBanner('Speed lap', 'Limiters off', 'p3', 3);
          if (mates[0]) this.say(mates[mates.length - 1], pick(LINES.speed, this.seq++));
        }
        break;
      case 'denied':
        if (e.mech === this.localId) {
          const why = { weapons: 'Weapons and abilities are locked until the battle lap', drive: 'Not enough Drive', target: 'No target in range', cells: race.rules.gateLaps <= 1 || race.rules.gateValueLater <= 0 ? 'No Cells. The gates only light on the formation lap' : 'No Cells. Thread a gold gate to earn one back', switch: 'No other target in reach' }[e.reason];
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
          this.showBanner('Knocked out', by ? `by ${by.name}` : '', 'p2', 3);
        } else if (victim.team === me.team) {
          this.say(victim, pick(LINES.out, this.seq++));
        } else if (by && by.id === this.localId) {
          this.showBanner('Knockout', race.rules.koPoints > 0 ? `${victim.name} is out · +${race.rules.koPoints} points` : `${victim.name} is out`, '', 2.4);
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
          const el = h('div.pop' + (mine ? '' : '.taken') + (e.heavy && !e.blocked ? '.big' : '') + (e.blocked ? '.blocked' : ''), e.blocked ? `${dmg} blocked` : String(dmg));
          this.root.append(el);
          this.pops.push({ el, victim: e.victim, t: 0, dx: (Math.random() - 0.5) * 50 });
          while (this.pops.length > 12) this.pops.shift()!.el.remove();
        }
        break;
      case 'parry':
        if (e.mech === this.localId) this.showNotice('Parry');
        break;
      case 'guardBreak':
        if (e.mech === this.localId) this.showNotice('Guard broken', true);
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
        if (e.mech === this.localId) this.showBanner(`Finished ${e.place}${ORD[e.place - 1]}`, '', 'p3', 3);
        else if (m.team === me.team) this.say(m, pick(LINES.finish, this.seq++));
        else if (e.place === 1) this.say(null, `${m.name} takes the flag.`);
        break;
      }
      default:
        break;
    }
  }
}
