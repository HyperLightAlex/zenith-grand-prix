// Menus: title, garage (pick your frame), controls, pause and results.
// Driven by the same MenuInput from pad or keyboard; items also take clicks.
import { ATTACKS, CLASSES, ROLE_NAMES, type RaceState, type Role } from '../../sim/index';
import type { MenuInput } from '../input/input';
import { LIVERIES } from '../render/palette';
import { h, setClass, setText } from './dom';

export type Screen = 'title' | 'garage' | 'controls' | 'pause' | 'results' | null;
type Device = 'pad' | 'keys';

export interface GarageChoice {
  role: Role;
  team: number;
  /** 0 rookie, 1 pro, 2 ace. */
  rivals: number;
}

export interface MenuCallbacks {
  onStart(choice: GarageChoice): void;
  onPreview(choice: GarageChoice): void;
  onResume(): void;
  onRestart(): void;
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
      ['Boost (uses Drive)', 'A', 'Space'],
      ['Look around', 'Right stick', ''],
      ['Look back', 'R3', 'V'],
      ['Pause', 'Start', 'Esc'],
    ],
  ],
  [
    'Fighting',
    [
      ['Lock on / let go', 'LB', 'Q'],
      ['Move around the target', 'Left stick', 'W A S D'],
      ['Attack', 'X', 'J'],
      ['Special', 'Y', 'K'],
      ['Guard (tap late to parry)', 'RB', 'L'],
      ['Dash', 'A', 'Space'],
      ['Switch target', 'Right stick', 'Z C'],
    ],
  ],
  [
    'Team',
    [
      ['Escort a teammate', 'B', 'E'],
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
  choice: GarageChoice = { role: 0, team: 0, rivals: 1 };
  private items: Item[] = [];
  private sel = 0;
  private device: Device = 'keys';
  private returnTo: Screen = 'title';
  private lastRace: RaceState | null = null;
  private lastLocal = 0;

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
    if (sound) this.cb.onSound('ui_move');
  }

  private render(): void {
    const R = this.root;
    R.replaceChildren();
    this.items = [];
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
      h('div.logo', h('div.a', 'ZENITH'), h('div.b', 'GRAND PRIX'), h('div.rule')),
      h('div.tagline', 'Three mechs a side. Three laps. First across the line takes fifteen points, and nobody said you had to let them get there.'),
      h('div.press', this.key('A', 'Enter'), 'Start'),
    );
    this.root.append(h('div.shade'), col, h('div.small-print', 'Working title. Version 0.1, solo play against computer pilots.'));
    this.root.onclick = () => {
      if (this.screen === 'title') this.confirm();
    };
  }

  private frameInfo = h('div.frame-info');
  private statEls: HTMLElement[] = [];
  private frameLabel = h('span.choice', '');
  private teamLabel = h('span.choice', '');
  private rivalLabel = h('span.choice', '');
  private blurb = h('p', '');
  private kit = h('div.kit');

  private renderGarage(): void {
    this.root.onclick = null;
    const col = h('div.col');
    const list = h('div.list');
    this.frameLabel = h('span.choice', '');
    this.teamLabel = h('span.choice', '');
    this.rivalLabel = h('span.choice', '');
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
    this.addItem(list, h('div.item.go', h('span', 'Start race')), () => this.cb.onStart({ ...this.choice }));
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
    this.frameInfo.append(this.kit);
    col.append(h('h1', 'Garage'), this.blurb, list, this.frameInfo);
    this.root.append(h('div.shade'), col, this.footer(['D-pad', '↑ ↓', 'Choose'], ['◀ ▶', '← →', 'Change'], ['A', 'Enter', 'Confirm'], ['B', 'Esc', 'Back']));
    this.refreshGarage(true);
  }

  private refreshGarage(preview: boolean): void {
    const c = CLASSES[this.choice.role];
    setText(this.frameLabel, `${c.frame}, ${ROLE_NAMES[c.role].toLowerCase()}`);
    setText(this.teamLabel, LIVERIES[this.choice.team].name.replace('Team ', ''));
    setText(this.rivalLabel, RIVALS[this.choice.rivals]);
    setText(this.blurb, c.blurb);
    const power = [0.6, 0.55, 1][c.role];
    const stats = [(c.topSpeed - 104) / 24, c.maxHp / 2200, (c.grip - 60) / 40, power];
    stats.forEach((v, i) => (this.statEls[i].style.transform = `scaleX(${Math.max(0.08, Math.min(1, v)).toFixed(2)})`));
    const [p, s] = KIT_TEXT[c.role];
    this.kit.replaceChildren(
      h('div', this.key('X', 'J'), h('b', ATTACKS[c.primary].name + '. '), p),
      h('div', this.key('Y', 'K'), h('b', ATTACKS[c.secondary].name + '. '), s),
    );
    (this.kit.children[1] as HTMLElement).style.marginTop = '0.35em';
    if (preview) this.cb.onPreview({ ...this.choice });
  }

  private renderControls(): void {
    this.root.onclick = null;
    const box = h('div.controls', h('h1', 'Controls'), h('p', 'Free steering while you race. Lock on and the track carries you, so the stick moves you around your target instead.'));
    const grid = h('div.grid');
    const left = h('div');
    const right = h('div');
    const keycaps = (text: string) => h('span.keys', ...(text ? text.split(' ').map((part) => (/^(stick|up|down|left|right)$/i.test(part) ? ` ${part} ` : h('span.key', part))) : ['']));
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

  private renderPause(): void {
    this.root.onclick = null;
    const col = h('div.col');
    const list = h('div.list');
    this.addItem(list, h('div.item', h('span', 'Resume')), () => this.cb.onResume());
    this.addItem(list, h('div.item', h('span', 'Restart race')), () => this.cb.onRestart());
    this.addItem(list, h('div.item', h('span', 'Controls')), () => this.show('controls'));
    this.addItem(list, h('div.item', h('span', 'Back to garage')), () => this.cb.onGarage());
    this.addItem(list, h('div.item', h('span', 'Quit to title')), () => this.cb.onQuit());
    col.append(h('h1', 'Paused'), list);
    this.root.append(h('div.shade'), col, this.footer(['A', 'Enter', 'Confirm'], ['B', 'Esc', 'Resume']));
  }

  private renderResults(): void {
    this.root.onclick = null;
    const race = this.lastRace;
    if (!race) return;
    const me = race.mechs[this.lastLocal];
    const pts = [0, 0];
    for (const m of race.mechs) pts[m.team] += m.points;
    const mine = pts[me.team];
    const theirs = pts[1 - me.team];
    const box = h('div.results');
    const myTeam = LIVERIES[me.team].name.replace('Team ', '');
    const headline = mine > theirs ? `${myTeam} win ` : mine < theirs ? `${myTeam} lose ` : 'Dead heat ';
    box.append(h('div.headline', headline, h('span.pts', `${mine}–${theirs}`)));
    const ord = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
    const own = me.retired ? 'You were knocked out and scored nothing.' : `You finished ${ord[me.place - 1]} for ${me.points} point${me.points === 1 ? '' : 's'}.`;
    box.append(h('div.subline', own));

    const table = h<'table'>('table');
    const head = h<'tr'>('tr');
    for (const [label, num] of [['', false], ['', false], ['Pilot', false], ['Frame', false], ['Time', true], ['Damage dealt', true], ['Knockouts', true], ['Points', true]] as const) {
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
        h<'td'>('td.num.pts', String(m.points)),
      );
      table.append(tr);
    }
    box.append(table);
    const list = h('div.list');
    this.addItem(list, h('div.item.go', h('span', 'Race again')), () => this.cb.onRestart());
    this.addItem(list, h('div.item', h('span', 'Back to garage')), () => this.cb.onGarage());
    this.addItem(list, h('div.item', h('span', 'Quit to title')), () => this.cb.onQuit());
    box.append(list);
    this.root.append(h('div.shade.full'), box);
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
    for (const m of presses) {
      if (!this.screen) return;
      const horizontal = this.screen === 'results';
      if (m === 'confirm') this.confirm();
      else if (m === 'back') this.back();
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
