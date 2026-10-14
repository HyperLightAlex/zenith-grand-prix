// Menus: title, garage (pick your frame), controls, pause and results.
// Driven by the same MenuInput from pad or keyboard; items also take clicks.
import { ABILITIES, ATTACKS, AWARD_NAMES, CLASSES, ROLE_NAMES, TRACKS, roundsToWin, type MatchConfig, type MatchState, type RaceState, type Role } from '../../sim/index';
import type { MenuInput } from '../input/input';
import { LIVERIES } from '../render/palette';
import { h, setClass, setText } from './dom';
import { COVER, LOGO } from './keyArt';
import { pencilLine, pencilRing } from './pencil';

export type Screen = 'title' | 'garage' | 'controls' | 'pause' | 'results' | null;
type Device = 'pad' | 'keys';

export interface GarageChoice {
  role: Role;
  team: number;
  /** 0 rookie, 1 pro, 2 ace. */
  rivals: number;
  /** Index into MATCH_OPTIONS. */
  match: number;
  /** Circuit id. */
  track: string;
}

/** What the garage says about each circuit. */
export const TRACK_BLURBS: Record<string, string> = {
  meridian: 'The original. An elevated loop over the sea at golden hour: sweepers, a hairpin and long straights.',
  canyon: 'Built for fighting. The Narrows, a corkscrew, a bowl you can take flat out, a fork whose routes cross, and a sky bridge with no barriers.',
  helios: 'Built for speed and air, above the clouds. The Drop, a full loop, the Carousel, and Split Decision: a jump or the safe way round.',
};

/** The match formats on offer. A single race is a series of one. */
export const MATCH_OPTIONS: Array<{ label: string; blurb: string; cfg: MatchConfig }> = [
  { label: 'Single race', blurb: 'One race. Most points wins.', cfg: { mode: 'series', bestOf: 1, target: 50 } },
  { label: 'Series, best of 3', blurb: 'Win two rounds. A round level on points goes to whoever came home first.', cfg: { mode: 'series', bestOf: 3, target: 50 } },
  { label: 'Series, best of 5', blurb: 'Win three rounds. A round level on points goes to whoever came home first.', cfg: { mode: 'series', bestOf: 5, target: 50 } },
  { label: 'Points race to 50', blurb: 'Points carry over. First team to 50 at the end of a round wins.', cfg: { mode: 'points', bestOf: 3, target: 50 } },
  { label: 'Points race to 80', blurb: 'Points carry over. First team to 80 at the end of a round wins.', cfg: { mode: 'points', bestOf: 3, target: 80 } },
];

export interface MenuCallbacks {
  onStart(choice: GarageChoice): void;
  onPreview(choice: GarageChoice): void;
  onResume(): void;
  /** Run the current round again from the grid. */
  onRestart(): void;
  /** From the results: the next round, or a fresh match if this one is over. */
  onNext(): void;
  onTuning(): void;
  /** Switch the 80s anime look on or off; returns whether it is now on. */
  onToggleLook(): boolean;
  /** Whether the 80s anime look is on. */
  lookOn(): boolean;
  onQuit(): void;
  onGarage(): void;
  onSound(name: 'ui_move' | 'ui_select' | 'ui_back'): void;
}

const RIVALS = ['Rookie', 'Pro', 'Ace'];
const KIT_TEXT: Record<number, [string, string]> = {
  0: ['Three quick blade strikes. Light, fast, hard to interrupt you out of.', 'An armoured lunge that closes a 30 m gap. Costs Drive.'],
  1: ['Three-round bursts out to 60 m. Works at racing speed, without a lock.', 'Boots an attacker away to make room for the carbine.'],
  2: ['Two heavy blows. The second one breaks a guard.', 'A close-range blast. Works at racing speed.'],
};

interface Item {
  el: HTMLElement;
  activate?: () => void;
  change?: (dir: number) => void;
}

const CONTROLS: Array<[string, Array<[string, string, string]>]> = [
  [
    'Racing',
    [
      ['Steer', 'Left stick', 'A D'],
      ['Accelerate', 'RT', 'W'],
      ['Brake', 'LT', 'S'],
      ['Carve (hold through a corner, let go to burst)', 'LT + left stick', 'S + A or D'],
      ['Boost (uses Drive)', 'A', 'Space'],
      ['Ability (uses a Cell)', 'B', 'R'],
      ['Look around', 'Right stick', ''],
      ['Look back', 'R3', 'V'],
      ['Pause', 'Start', 'Esc'],
      ['Tuning panel', 'Back', 'T'],
      ['Full screen', '', 'F'],
    ],
  ],
  [
    'Fighting',
    [
      ['Lock on / let go', 'LB', 'Q'],
      ['Move around the target', 'Left stick', 'W A S D'],
      ['Attack', 'X', 'J'],
      ['Special', 'Y', 'K'],
      ['Guard (tap late to parry)', 'LT (or RB)', 'L'],
      ['Dash', 'A', 'Space'],
      ['Guard swing: arc round your target', 'Guard + stick ◀▶ + A', 'L + A/D + Space'],
      ['Ability (a different one)', 'B', 'R'],
      ['Switch target', 'Right stick', 'Z C'],
    ],
  ],
  [
    'Team',
    [
      ['Escort a teammate', 'L3', 'E'],
      ['Blitz: everyone attacks', 'D-pad up', '1'],
      ['Run: avoid fights, race', 'D-pad right', '2'],
      ['Shield: protect our forward', 'D-pad down', '3'],
      ['Mark: all on my target', 'D-pad left', '4'],
    ],
  ],
];

export class Menus {
  readonly root = h('div.ui.menu');
  screen: Screen = null;
  choice: GarageChoice = { role: 0, team: 0, rivals: 1, match: 1, track: 'meridian' };
  /** The match the results screen reports on. */
  match: MatchState | null = null;
  private items: Item[] = [];
  private sel = 0;
  private device: Device = 'keys';
  private returnTo: Screen = 'title';
  private lastRace: RaceState | null = null;
  private lastLocal = 0;
  private ring: SVGSVGElement | null = null;

  constructor(parent: HTMLElement, private cb: MenuCallbacks) {
    this.root.hidden = true;
    parent.append(this.root);
  }

  setDevice(d: Device): void {
    if (this.device === d) return;
    this.device = d;
    if (this.screen) this.render();
  }

  show(screen: Screen, race?: RaceState, localId?: number): void {
    if (screen === 'controls') this.returnTo = this.screen ?? 'title';
    if (race) {
      this.lastRace = race;
      this.lastLocal = localId ?? 0;
    }
    this.screen = screen;
    this.sel = 0;
    this.root.hidden = screen === null;
    setClass(this.root, 'anime', this.cb.lookOn());
    if (screen) this.render();
  }

  private key(pad: string, keys: string): HTMLElement {
    return h('span.key', this.device === 'pad' ? pad : keys);
  }

  private footer(...hints: Array<[string, string, string]>): HTMLElement {
    return h('div.footer-hints', ...hints.map(([pad, keys, label]) => h('span', this.key(pad, keys), label)));
  }

  private addItem(list: HTMLElement, el: HTMLElement, activate?: () => void, change?: (dir: number) => void): void {
    const index = this.items.length;
    this.items.push({ el, activate, change });
    el.addEventListener('pointerenter', () => this.select(index, false));
    el.addEventListener('click', () => {
      this.select(index, false);
      if (change) {
        change(1);
        this.cb.onSound('ui_move');
      } else if (activate) {
        this.cb.onSound('ui_select');
        activate();
      }
    });
    list.append(el);
  }

  private select(i: number, sound = true): void {
    if (!this.items.length) return;
    this.sel = (i + this.items.length) % this.items.length;
    this.items.forEach((it, k) => setClass(it.el, 'sel', k === this.sel));
    this.ringRow(this.items[this.sel].el);
    if (sound) this.cb.onSound('ui_move');
  }

  /** The anime look's paper menus mark the chosen row with a red pencil ring (hidden in the plain look). */
  private ringRow(el: HTMLElement): void {
    this.ring?.remove();
    const em = parseFloat(getComputedStyle(el).fontSize) || 16;
    // The ring's box runs past the row a little (see .pencil.ring in the styles).
    const w = (el.offsetWidth || 300) + em * 0.9;
    const ht = (el.offsetHeight || 40) + em * 0.5;
    this.ring = pencilRing(w, ht, Math.max(1.6, em * 0.11));
    el.append(this.ring);
  }

  private render(): void {
    const R = this.root;
    R.replaceChildren();
    // The styles lay each screen out by name (the anime look's paper sheets).
    R.dataset.screen = this.screen ?? '';
    this.items = [];
    this.ring = null;
    switch (this.screen) {
      case 'title':
        this.renderTitle();
        break;
      case 'garage':
        this.renderGarage();
        break;
      case 'controls':
        this.renderControls();
        break;
      case 'pause':
        this.renderPause();
        break;
      case 'results':
        this.renderResults();
        break;
      default:
        break;
    }
    if (this.items.length) this.select(Math.min(this.sel, this.items.length - 1), false);
  }

  private renderTitle(): void {
    const col = h('div.col');
    col.append(
      h('div.logo', h('div.a', 'ZENITH'), h('div.b', 'GRAND PRIX'), h('div.rule'), art(LOGO.url, 'img.logo-art', 'Zenith Grand Prix')),
      h('div.tagline', 'Three mechs a side. Three laps. First across the line takes fifteen points, and nobody said you had to let them get there.'),
      h('div.press', this.key('A', 'Enter'), 'Start'),
    );
    // Browsers only allow sound after a click or key press; a pad button does not count.
    if (this.device === 'pad') col.append(h('div.sound-hint', 'On a gamepad? Click the page once so the browser lets the sound through.'));
    // In the anime look the show's cover is up behind it (the race runs on underneath).
    this.root.append(art(COVER, 'img.cover', ''), h('div.shade.title'), col, h('div.small-print', 'Working title. Version 0.2, solo play against computer pilots.'));
    this.root.onclick = () => {
      if (this.screen === 'title') this.confirm();
    };
  }

  private frameInfo = h('div.frame-info');
  private statEls: HTMLElement[] = [];
  private frameLabel = h('span.choice', '');
  private trackLabel = h('span.choice', '');
  private teamLabel = h('span.choice', '');
  private rivalLabel = h('span.choice', '');
  private matchLabel = h('span.choice', '');
  private matchBlurb = h('div.match-blurb', '');
  private blurb = h('p', '');
  private kit = h('div.kit');
  // The anime look's title block, as on a model sheet.
  private sheetName = h('b', '');
  private sheetRole = h('span.role', '');
  private sheetPaint = h('div.tb-paint');
  private sheetNo = h('span.no', '');

  private renderGarage(): void {
    this.root.onclick = null;
    const col = h('div.col');
    const list = h('div.list');
    this.frameLabel = h('span.choice', '');
    this.trackLabel = h('span.choice', '');
    this.teamLabel = h('span.choice', '');
    this.rivalLabel = h('span.choice', '');
    this.matchLabel = h('span.choice', '');
    this.matchBlurb = h('div.match-blurb', '');
    this.addItem(list, h('div.item', h('span', 'Circuit'), this.trackLabel), undefined, (dir) => {
      const i = Math.max(0, TRACKS.findIndex((t) => t.id === this.choice.track));
      this.choice.track = TRACKS[(i + dir + TRACKS.length) % TRACKS.length].id;
      this.refreshGarage(true);
    });
    this.addItem(list, h('div.item', h('span', 'Frame'), this.frameLabel), undefined, (dir) => {
      this.choice.role = ((this.choice.role + dir + 3) % 3) as Role;
      this.refreshGarage(true);
    });
    this.addItem(list, h('div.item', h('span', 'Team'), this.teamLabel), undefined, (dir) => {
      this.choice.team = (this.choice.team + dir + 2) % 2;
      this.refreshGarage(true);
    });
    this.addItem(list, h('div.item', h('span', 'Rival pilots'), this.rivalLabel), undefined, (dir) => {
      this.choice.rivals = (this.choice.rivals + dir + 3) % 3;
      this.refreshGarage(false);
    });
    this.addItem(list, h('div.item', h('span', 'Match'), this.matchLabel), undefined, (dir) => {
      const n = MATCH_OPTIONS.length;
      this.choice.match = (this.choice.match + dir + n) % n;
      this.refreshGarage(false);
    });
    this.addItem(list, h('div.item.go', h('span', 'Start')), () => this.cb.onStart({ ...this.choice }));
    this.addItem(list, h('div.item', h('span', 'Controls')), () => this.show('controls'));

    this.blurb = h('p', '');
    this.statEls = [];
    this.frameInfo = h('div.frame-info');
    for (const name of ['Top speed', 'Armour', 'Handling', 'Hitting power']) {
      const fill = h('i');
      this.statEls.push(fill);
      this.frameInfo.append(h('div.stat', h('span', name), h('div.bar', fill)));
    }
    this.kit = h('div.kit');
    this.sheetName = h('b', '');
    this.sheetRole = h('span.role', '');
    this.sheetPaint = h('div.tb-paint');
    this.sheetNo = h('span.no', '');
    const titleBlock = h('div.tb', h('div.tb-main', h('div.tb-name', this.sheetName, this.sheetRole), this.sheetPaint), h('div.tb-side', h('span', 'Garage'), this.sheetNo));
    col.append(pegs(), titleBlock, h('h1', 'Garage'), this.blurb, list, this.matchBlurb, this.frameInfo);
    this.root.append(h('div.shade'), col, this.kit, this.footer(['D-pad', '↑ ↓', 'Choose'], ['◀ ▶', '← →', 'Change'], ['A', 'Enter', 'Confirm'], ['B', 'Esc', 'Back']));
    this.refreshGarage(true);
  }

  private refreshGarage(preview: boolean): void {
    const c = CLASSES[this.choice.role];
    setText(this.frameLabel, `${c.frame}, ${ROLE_NAMES[c.role].toLowerCase()}`);
    setText(this.teamLabel, LIVERIES[this.choice.team].name.replace('Team ', ''));
    setText(this.rivalLabel, RIVALS[this.choice.rivals]);
    const opt = MATCH_OPTIONS[this.choice.match] ?? MATCH_OPTIONS[0];
    setText(this.matchLabel, opt.label);
    const circuit = TRACKS.find((t) => t.id === this.choice.track) ?? TRACKS[0];
    setText(this.trackLabel, circuit.name);
    setText(this.matchBlurb, `${TRACK_BLURBS[circuit.id] ?? ''} ${opt.blurb}`);
    setText(this.blurb, c.blurb);
    const livery = LIVERIES[this.choice.team];
    setText(this.sheetName, c.frame);
    setText(this.sheetRole, ROLE_NAMES[c.role].toLowerCase());
    setText(this.sheetNo, `Sheet ${c.role + 1} of ${CLASSES.length}`);
    const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
    this.sheetPaint.replaceChildren(...[livery.primary, livery.secondary, livery.trim].map((col) => {
      const chip = h('i');
      chip.style.background = hex(col);
      return chip;
    }), h('span', `${livery.name.replace('Team ', '')} paint`));
    this.root.style.setProperty('--mine', livery.css);
    const power = [0.6, 0.55, 1][c.role];
    const stats = [(c.topSpeed - 130) / 30, c.maxHp / 2200, (c.grip - 60) / 40, power];
    stats.forEach((v, i) => (this.statEls[i].style.transform = `scaleX(${Math.max(0.08, Math.min(1, v)).toFixed(2)})`));
    const [p, s] = KIT_TEXT[c.role];
    const free = ABILITIES[c.abilityFree];
    const locked = ABILITIES[c.abilityLocked];
    this.kit.replaceChildren(
      h('h2', `${c.frame}: weapons`),
      h('div', this.key('X', 'J'), h('b', ATTACKS[c.primary].name + '. '), p),
      h('div', this.key('Y', 'K'), h('b', ATTACKS[c.secondary].name + '. '), s),
      h('h2.cells', 'Abilities, one Cell each'),
      h('div.cellkit', this.key('B', 'R'), h('b', free.name + ' '), h('i', '(free steering). '), free.blurb),
      h('div.cellkit', this.key('B', 'R'), h('b', locked.name + ' '), h('i', '(locked on). '), locked.blurb),
      h('div.note', 'Cells come from the gold gates. They are lit on every lap, so a spent Cell can be earned back.'),
    );
    if (preview) this.cb.onPreview({ ...this.choice });
  }

  private renderControls(): void {
    this.root.onclick = null;
    const box = h('div.controls', pegs(), h('h1', 'Controls'), h('p', 'Free steering while you race. Lock on and the track carries you, so the stick moves you around your target instead.'));
    const grid = h('div.grid');
    const left = h('div');
    const right = h('div');
    const keycaps = (text: string) => h('span.keys', ...(text ? text.split(' ').map((part) => (/^(stick|up|down|left|right)$/i.test(part) ? h('span.word', part) : h('span.key', part))) : ['']));
    CONTROLS.forEach(([title, rows], i) => {
      const into = i === 0 ? left : right;
      into.append(h('h2', title));
      if (i < 2) into.append(h('div.rowc.head', h('span', ''), h('span', 'Gamepad'), h('span', 'Keyboard')));
      for (const [label, pad, keys] of rows) {
        into.append(h('div.rowc', h('span', label), keycaps(pad), keycaps(keys)));
      }
    });
    grid.append(left, right);
    box.append(grid);
    this.root.append(h('div.shade.full'), box, this.footer(['B', 'Esc', 'Back']));
  }

  /**
   * The anime look's art (the cover, the painted logo, the paper sheets)
   * shows by the root's class. The pencil marks were drawn to the old look's
   * layout, so they are drawn again.
   */
  private syncLook(): void {
    const on = this.cb.lookOn();
    if (this.root.classList.contains('anime') === on) return;
    setClass(this.root, 'anime', on);
    if (this.screen === 'results') this.render();
    else if (this.items.length) this.ringRow(this.items[this.sel].el);
  }

  /** The look was switched from outside the menu (G): bring its label up to date. */
  refreshLook(): void {
    this.syncLook();
    this.root.querySelectorAll('.look-label').forEach((el) => (el.textContent = `Look: ${this.cb.lookOn() ? '80s anime' : 'plain'}`));
  }

  private renderPause(): void {
    this.root.onclick = null;
    const col = h('div.col');
    const list = h('div.list');
    this.addItem(list, h('div.item', h('span', 'Resume')), () => this.cb.onResume());
    this.addItem(list, h('div.item', h('span', 'Restart this race')), () => this.cb.onRestart());
    this.addItem(list, h('div.item', h('span', 'Tuning')), () => this.cb.onTuning());
    const lookLabel = h('span.look-label', `Look: ${this.cb.lookOn() ? '80s anime' : 'plain'}`);
    this.addItem(list, h('div.item', lookLabel), () => {
      lookLabel.textContent = `Look: ${this.cb.onToggleLook() ? '80s anime' : 'plain'}`;
    });
    this.addItem(list, h('div.item', h('span', 'Controls')), () => this.show('controls'));
    this.addItem(list, h('div.item', h('span', 'Back to garage')), () => this.cb.onGarage());
    this.addItem(list, h('div.item', h('span', 'Quit to title')), () => this.cb.onQuit());
    col.append(pegs(), h('h1', 'Paused'), list);
    this.root.append(h('div.shade'), col, this.footer(['A', 'Enter', 'Confirm'], ['B', 'Esc', 'Resume']));
  }

  private renderResults(): void {
    this.root.onclick = null;
    const race = this.lastRace;
    if (!race) return;
    const me = race.mechs[this.lastLocal];
    const match = this.match;
    const round = match && match.rounds.length ? match.rounds[match.rounds.length - 1] : null;
    const pts = round ? round.points : [0, 0];
    if (!round) for (const m of race.mechs) pts[m.team] += m.points;
    const mine = pts[me.team];
    const theirs = pts[1 - me.team];
    const names = LIVERIES.map((l) => l.name.replace('Team ', ''));
    const myTeam = names[me.team];
    const box = h('div.results', pegs());
    const single = !match || (match.cfg.mode === 'series' && match.cfg.bestOf === 1);
    const over = !match || match.winner >= 0;
    const roundWinner = round ? round.winner : mine >= theirs ? me.team : 1 - me.team;

    // Headline: the match if it has just been decided, otherwise the round.
    if (match && !single && over) {
      const won = match.winner === me.team;
      const tally = match.cfg.mode === 'series' ? `${match.wins[me.team]}–${match.wins[1 - me.team]}` : `${match.totals[me.team]}–${match.totals[1 - me.team]}`;
      box.append(h('div.headline', `${myTeam} ${won ? 'win' : 'lose'} the match `, h('span.pts', tally)));
    } else if (single) {
      box.append(h('div.headline', `${myTeam} ${roundWinner === me.team ? 'win' : 'lose'} `, h('span.pts', `${mine}–${theirs}`)));
    } else {
      // The winner's score first, to match the name in front of it.
      box.append(h('div.headline', `${names[roundWinner]} take round ${round ? round.round : 1} `, h('span.pts', `${pts[roundWinner]}–${pts[1 - roundWinner]}`)));
    }

    const ord = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
    const fromSupport = me.support > 0 ? `, ${me.support} of them from support` : '';
    const own = me.retired
      ? `You were knocked out${me.points > 0 ? `, but still scored ${me.points}${fromSupport}` : ' and scored nothing'}.`
      : `You finished ${ord[me.place - 1]} for ${me.points} point${me.points === 1 ? '' : 's'}${fromSupport}.`;
    const lines = [own];
    if (round) {
      const parts = [`Placing ${round.place[me.team]}–${round.place[1 - me.team]}`];
      if (round.ko[0] + round.ko[1] > 0) parts.push(`knockouts ${round.ko[me.team]}–${round.ko[1 - me.team]}`);
      if (round.support[0] + round.support[1] > 0) parts.push(`support ${round.support[me.team]}–${round.support[1 - me.team]}`);
      if (parts.length > 1) lines.push(parts.join(', ') + '.');
      if (round.tied) lines.push(`Level on points, so the round goes to ${names[round.winner]}, who came home first.`);
    }
    box.append(h('div.subline', lines.join(' ')));

    // How the match stands.
    if (match && !single) {
      const strip = h('div.matchstrip');
      if (match.cfg.mode === 'series') {
        const need = roundsToWin(match.cfg);
        for (const team of [me.team, 1 - me.team]) {
          const pips = h('span.pips');
          for (let i = 0; i < need; i++) pips.append(h('i' + (i < match.wins[team] ? '.on' : '')));
          strip.append(h('span.side' + (team ? '.t1' : ''), h('b', names[team]), pips));
        }
        strip.append(h('span.note', over ? `Best of ${match.cfg.bestOf}, decided in ${match.rounds.length}` : `Best of ${match.cfg.bestOf}. Round ${match.rounds.length + 1} next`));
      } else {
        for (const team of [me.team, 1 - me.team]) {
          const fill = h('i');
          fill.style.transform = `scaleX(${Math.min(1, match.totals[team] / match.cfg.target).toFixed(3)})`;
          strip.append(h('span.side' + (team ? '.t1' : ''), h('b', names[team]), h('span.total', String(match.totals[team])), h('div.bar', fill)));
        }
        strip.append(h('span.note', over ? `First to ${match.cfg.target}, after ${match.rounds.length} round${match.rounds.length === 1 ? '' : 's'}` : `First to ${match.cfg.target}. Round ${match.rounds.length + 1} next`));
      }
      box.append(strip);
    }

    const table = h<'table'>('table');
    const head = h<'tr'>('tr');
    for (const [label, num] of [['', false], ['', false], ['Pilot', false], ['Frame', false], ['Time', true], ['Damage dealt', true], ['Knockouts', true], ['Support', true], ['Points', true]] as const) {
      const th = h<'th'>('th' + (num ? '.num' : ''), label);
      head.append(th);
    }
    table.append(head);
    const winner = race.mechs.find((m) => m.place === 1);
    const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
    for (const m of [...race.mechs].sort((a, b) => a.place - b.place)) {
      const tr = h<'tr'>('tr' + (m.team ? '.t1' : '') + (m.id === me.id ? '.me' : '') + (m.retired ? '.out' : ''));
      let time = 'Retired';
      if (!m.retired) {
        if (m.finishTime > 1e6) time = 'Flagged';
        else if (winner && m !== winner && winner.finishTime < 1e6) time = `+${(m.finishTime - winner.finishTime).toFixed(2)}`;
        else time = fmt(m.finishTime - 4);
      }
      tr.append(
        h<'td'>('td.flag'),
        h<'td'>('td', String(m.place)),
        h<'td'>('td', m.name + (m.id === me.id ? ' (you)' : '')),
        h<'td'>('td', `${CLASSES[m.role].frame}, ${ROLE_NAMES[m.role].toLowerCase()}`),
        h<'td'>('td.num', time),
        h<'td'>('td.num', String(Math.round(m.dmgDealt))),
        h<'td'>('td.num', String(m.kos)),
        h<'td'>('td.num', m.support > 0 ? String(m.support) : '–'),
        h<'td'>('td.num.pts', String(m.points)),
      );
      table.append(tr);
    }
    const sheet = h('div.sheet-table', table);
    box.append(sheet);

    // Where the support points came from, pilot by pilot: your team first.
    const supporters = race.mechs.filter((m) => m.support > 0).sort((a, b) => (a.team === me.team ? 0 : 1) - (b.team === me.team ? 0 : 1) || b.support - a.support);
    if (supporters.length > 0) {
      const sup = h('div.supportlist');
      for (const m of supporters) {
        const chips = h('span.chips');
        AWARD_NAMES.forEach((name, kind) => {
          if (m.awardPts[kind] > 0) chips.append(h('span.chip', `${name} `, h('b', String(m.awardPts[kind]))));
        });
        const capped = m.support >= race.rules.supportCap ? h('span.cap', 'max') : '';
        sup.append(h('div.row' + (m.team ? '.t1' : '') + (m.id === me.id ? '.me' : ''), h('span.who', m.name, h('small', ROLE_NAMES[m.role])), chips, h('span.total', `+${m.support}`), capped));
      }
      box.append(h('div.suphead', 'Support points'), sup);
    }
    const list = h('div.list');
    this.addItem(list, h('div.item.go', h('span', over ? (single ? 'Race again' : 'New match') : 'Next round')), () => this.cb.onNext());
    this.addItem(list, h('div.item', h('span', 'Back to garage')), () => this.cb.onGarage());
    this.addItem(list, h('div.item', h('span', 'Quit to title')), () => this.cb.onQuit());
    box.append(list);
    this.root.append(h('div.shade.full'), box);
    // Your own row underlined in red pencil (the anime look only), once the table is laid out.
    const myRow = table.querySelector<HTMLElement>('tr.me');
    if (myRow) {
      const em = parseFloat(getComputedStyle(sheet).fontSize) || 16;
      const line = pencilLine(sheet.offsetWidth || 600, em * 0.7, Math.max(1.6, em * 0.13));
      line.style.top = `${((table.offsetTop + myRow.offsetTop + myRow.offsetHeight) / em - 0.3).toFixed(3)}em`;
      sheet.append(line);
    }
  }

  private confirm(): void {
    if (this.screen === 'title') {
      this.cb.onSound('ui_select');
      this.cb.onGarage();
      return;
    }
    const it = this.items[this.sel];
    if (!it) return;
    if (it.activate) {
      this.cb.onSound('ui_select');
      it.activate();
    } else if (it.change) {
      it.change(1);
      this.cb.onSound('ui_move');
    }
  }

  private back(): void {
    this.cb.onSound('ui_back');
    if (this.screen === 'controls') this.show(this.returnTo);
    else if (this.screen === 'garage') this.cb.onQuit();
    else if (this.screen === 'pause') this.cb.onResume();
  }

  /** Feed navigation presses, in the order they happened. */
  handle(presses: MenuInput[]): void {
    // The look can change from the tuning panel too; this runs every frame a menu is up.
    this.syncLook();
    for (const m of presses) {
      if (!this.screen) return;
      const horizontal = this.screen === 'results';
      if (m === 'confirm') this.confirm();
      else if (m === 'back' || (m === 'pause' && this.screen === 'pause')) this.back();
      else if (m === (horizontal ? 'left' : 'up')) this.select(this.sel - 1);
      else if (m === (horizontal ? 'right' : 'down')) this.select(this.sel + 1);
      else if (!horizontal && (m === 'left' || m === 'right')) {
        const it = this.items[this.sel];
        if (it?.change) {
          it.change(m === 'left' ? -1 : 1);
          this.cb.onSound('ui_move');
        }
      }
    }
  }
}

/** Animation paper's peg holes, along the top of a paper sheet (the anime look only). */
function pegs(): HTMLElement {
  return h('div.pegs', h('i'), h('i'), h('i'));
}

/** A painted image, as an element. */
function art(url: string, spec: string, alt: string): HTMLImageElement {
  const img = h<'img'>(spec);
  img.src = url;
  img.alt = alt;
  img.draggable = false;
  return img;
}
