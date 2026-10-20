// The title, the mode select, the controls, dialogs and text entry.

import { DEV_TOOLS } from '../../devTools';
import type { Game } from '../../game/game';
import { CALLSIGN_CHARS, CALLSIGN_MAX, CODE_CHARS, CODE_LENGTH } from '../../../net/protocol';
import { h } from '../dom';
import { COVER, LOGO } from '../keyArt';
import { art, type Menus } from '../menus';

const RECORDED_MUSIC = typeof location !== 'undefined' && new URLSearchParams(location.search).get('music') === 'suno';

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
      ...(DEV_TOOLS ? [['Tuning panel', 'Back', 'T'] as [string, string, string], ['80s look on and off', '', 'G'] as [string, string, string]] : []),
      ['Full screen', '', 'F'],
    ],
  ],
  [
    'Fighting',
    [
      ['Lock on / let go', 'LB', 'Q'],
      ['Move around the target', 'Left stick', 'W A S D'],
      ['Ease off, so a target behind catches up', 'Let go of RT', 'W, with the target behind'],
      ['Attack', 'X', 'J'],
      ['Special', 'Y', 'K'],
      ['Guard (tap late to parry)', 'LT (or RB)', 'L'],
      ['Dash (at the target, hold to boost at it)', 'A', 'Space'],
      ['Guard swing: arc round your target', 'Guard + stick ◀▶ + A', 'L + A/D + Space'],
      ['Ability (a different one)', 'B', 'R'],
      ['Switch target', 'Right stick', 'Z C'],
    ],
  ],
  [
    'Team',
    [
      ['Escort a teammate / back to the fight', 'L3', 'E'],
      ['Blitz: everyone attacks', 'D-pad up', '1'],
      ['Run: avoid fights, race', 'D-pad right', '2'],
      ['Shield: protect our forward', 'D-pad down', '3'],
      ['Mark: all on my target', 'D-pad left', '4'],
    ],
  ],
  // The hangar's music is a setlist only with the recorded music (?music=suno).
  ...(RECORDED_MUSIC ? [['Hangar', [['Next track', 'R3', 'M']]] as [string, Array<[string, string, string]>]] : []),
];

/** The same controls on the touch screen, by the rows' labels ('' for one with no touch control). */
const TOUCH: Record<string, string> = {
  'Next track': 'Tap what plays, bottom right',
  Steer: 'Left thumb, anywhere on the left',
  Accelerate: 'Held for you',
  Brake: 'Carve (tap)',
  'Carve (hold through a corner, let go to burst)': 'Hold Carve + steer',
  'Boost (uses Drive)': 'Boost',
  'Ability (uses a Cell)': 'Ability',
  Pause: 'Pause, top right',
  'Lock on / let go': 'Lock on / Let go',
  'Move around the target': 'Left thumb',
  'Ease off, so a target behind catches up': 'Push toward it',
  Attack: 'Attack',
  Special: 'Special',
  'Guard (tap late to parry)': 'Guard',
  'Dash (at the target, hold to boost at it)': 'Dash (hold to boost)',
  'Guard swing: arc round your target': 'Hold Guard, steer, Dash',
  'Ability (a different one)': 'Ability',
  'Switch target': 'Switch',
  'Escort a teammate / back to the fight': 'Escort (Fight while escorting)',
  'Blitz: everyone attacks': 'Team, then Blitz',
  'Run: avoid fights, race': 'Team, then Run',
  'Shield: protect our forward': 'Team, then Shield',
  'Mark: all on my target': 'Team, then Mark',
};

export const BACK = { pad: 'B', keys: 'Esc', label: 'Back', press: 'back' as const };
export const SELECT = { pad: 'A', keys: 'Enter', label: 'Select', press: 'confirm' as const };
export const CHANGE = { pad: '◀ ▶', keys: '← →', label: 'Change' };

export interface DialogData {
  title: string;
  text?: string | HTMLElement;
  options: Array<{ label: string; run: () => void; go?: boolean }>;
  /** What Back does (default: close the dialog). */
  cancel?: () => void;
}

export interface EntryData {
  title: string;
  hint?: string;
  kind: 'code' | 'callsign';
  value?: string;
  /** Called with the text; returns why it is not accepted (shown), or null to close. May be async. */
  submit: (value: string) => string | null | Promise<string | null>;
  /** Back: default closes. */
  cancel?: () => void;
}

export function registerCommon(m: Menus, g: Game): void {
  m.register('title', {
    render(m) {
      const col = h('div.col');
      col.append(
        h('div.logo', h('div.a', 'ZENITH'), h('div.b', 'GRAND PRIX'), h('div.rule'), art(LOGO.url, 'img.logo-art', 'Zenith Grand Prix')),
        h('div.tagline', 'Three mechs a side. Three laps. First across the line takes fifteen points, and nobody said you had to let them get there.'),
        h('div.press', m.key('A', 'Enter'), m.device === 'touch' ? 'Tap to start' : 'Start'),
      );
      if (m.device === 'pad') col.append(h('div.sound-hint', 'On a gamepad? Click the page once so the browser lets the sound through.'));
      const build = typeof __BUILD__ === 'string' && __BUILD__ !== 'dev' ? `Build ${__BUILD__}. ` : '';
      m.root.append(art(COVER, 'img.cover', ''), h('div.shade.title'), m.panes(col), h('div.small-print', `${build}Grand Prix, Free Play and online rooms.`));
      m.root.onclick = () => {
        // On a phone the browser's bars take a lot of a small screen: starting by touch goes full screen.
        g.enterFullscreenFromTap();
        m.handle(['confirm']);
      };
      // Confirm anywhere on the title: an invisible item takes it.
      m.addItem(h('div'), h('div'), () => m.push('modes'));
    },
    back() {},
  });

  m.register('modes', {
    render(m) {
      const col = h('div.col.modes');
      const list = h('div.list');
      m.button(list, 'Grand Prix', () => m.push('gp'), { key: 'gp', note: 'Cups for medals, or a season for the Zenith Cup' });
      m.button(list, 'Free Play', () => g.openFreePlay(), { key: 'free', note: 'Any circuit, any rival, any format' });
      m.button(list, 'Online', () => g.openOnline(), {
        key: 'online',
        note: g.online.available ? 'Private rooms with friends, by code or link' : 'Needs the game from its server: not this saved copy',
      });
      m.button(list, 'Controls', () => m.push('controls'), { key: 'controls' });
      m.button(list, 'Video', () => m.push('video'), { key: 'video', note: 'Panel lines, CRT screen, animation, screen shape' });
      col.append(h('h1', 'Play'), list);
      m.root.append(h('div.shade'), m.panes(col), m.footer(SELECT, BACK));
    },
    back: () => g.showTitle(),
  });

  m.register('controls', {
    render(m) {
      const touch = m.device === 'touch';
      const box = h(
        'div.controls',
        h('h1', 'Controls'),
        h('p', touch ? 'Steer with your left thumb anywhere on the left of the screen: the throttle is held for you. The buttons under your right thumb change when you lock on.' : 'Free steering while you race. Lock on and the track carries you, so the stick moves you around your target instead.'),
      );
      const grid = h('div.grid' + (touch ? '.touch' : ''));
      const left = h('div');
      const right = h('div');
      const keycaps = (text: string) => h('span.keys', ...(text ? text.split(' ').map((part) => (/^(stick|up|down|left|right)$/i.test(part) ? h('span.word', part) : h('span.key', part))) : ['']));
      CONTROLS.forEach(([title, rows], i) => {
        const into = i === 0 ? left : right;
        into.append(h('h2', title));
        if (i < 2) into.append(h('div.rowc.head', h('span', ''), h('span', touch ? 'Touch' : 'Gamepad'), h('span', touch ? 'Gamepad' : 'Keyboard')));
        for (const [label, pad, keys] of rows) {
          if (touch) {
            const t = TOUCH[label];
            if (t === undefined) continue;
            into.append(h('div.rowc', h('span', label), h('span.keys', h('span.word', t || '–')), keycaps(pad)));
          } else into.append(h('div.rowc', h('span', label), keycaps(pad), keycaps(keys)));
        }
      });
      grid.append(left, right);
      box.append(grid);
      m.root.append(h('div.shade.full'), m.panes(box), m.footer(BACK));
    },
  });

  m.register<DialogData>('dialog', {
    render(m, d) {
      const box = h('div.dialog');
      box.dataset.scroll = '';
      box.append(h('h2', d.title));
      if (d.text) box.append(typeof d.text === 'string' ? h('p', d.text) : d.text);
      const list = h('div.list');
      d.options.forEach((o, i) => m.button(list, o.label, o.run, { key: 'o' + i, go: o.go }));
      box.append(list);
      m.root.append(h('div.shade.full'), box, m.footer(SELECT, BACK));
    },
    back(m, d) {
      if (d.cancel) d.cancel();
      else m.pop();
    },
  });

  m.register<EntryData & { error?: string; busy?: boolean; shift?: boolean }>('entry', {
    render(m, d) {
      const box = h('div.entry');
      box.dataset.scroll = '';
      box.append(h('h2', d.title));
      if (d.hint) box.append(h('p', d.hint));
      const input = h<'input'>('input.field');
      input.value = d.value ?? '';
      input.maxLength = d.kind === 'code' ? 64 : CALLSIGN_MAX;
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.placeholder = d.kind === 'code' ? 'K7Q2X' : 'Your callsign';
      if (d.kind === 'code') input.style.textTransform = 'uppercase';
      input.addEventListener('input', () => {
        d.value = input.value;
      });
      box.append(input);
      const err = h('div.error', d.error ?? '');
      box.append(err);
      // The pad's keyboard: a grid of the characters this field takes.
      const chars = d.kind === 'code' ? CODE_CHARS : d.shift ? CALLSIGN_CHARS.slice(26, 52) + '0123456789 -_.' : CALLSIGN_CHARS.slice(0, 26) + '0123456789 -_.';
      const grid = h('div.keygrid');
      const typeChar = (ch: string) => {
        const max = d.kind === 'code' ? CODE_LENGTH : CALLSIGN_MAX;
        if ((d.value ?? '').length >= max) return;
        d.value = (d.value ?? '') + ch;
        input.value = d.value;
      };
      for (const ch of chars) {
        const el = h('div.k', ch === ' ' ? '␣' : ch);
        m.addItem(grid, el, () => typeChar(ch), undefined, { key: 'k' + ch });
      }
      box.append(grid);
      const list = h('div.list.row');
      m.button(list, d.busy ? 'Working…' : 'Done', () => void submit(), { key: 'done', go: true });
      m.button(list, 'Delete', () => {
        d.value = (d.value ?? '').slice(0, -1);
        input.value = d.value;
      }, { key: 'del' });
      if (d.kind === 'callsign') m.button(list, d.shift ? 'abc' : 'ABC', () => ((d.shift = !d.shift), m.refresh()), { key: 'shift' });
      box.append(list);
      m.root.append(h('div.shade.full'), box, m.footer({ pad: 'A', keys: 'Enter', label: 'Type / Done', press: 'confirm' }, { pad: 'X', keys: '⌫', label: 'Delete', press: 'x' }, { pad: 'Y', keys: '', label: 'Done', press: 'y' }, BACK));
      const submit = async () => {
        if (d.busy) return;
        d.busy = true;
        d.error = '';
        m.refresh();
        let problem: string | null = null;
        try {
          problem = await d.submit((d.value ?? '').trim());
        } catch (e) {
          problem = e instanceof Error ? e.message : String(e);
        }
        d.busy = false;
        if (problem !== null) {
          d.error = problem;
          if (m.data === d) m.refresh();
        }
      };
      (box as HTMLElement & { submit?: () => void }).submit = submit;
      // Enter in the field (a keyboard's, or the phone's own) is Done.
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          void submit();
        }
      });
      // Typing goes straight into the field on a keyboard; on a phone a tap on
      // it brings up the phone's own keyboard, so the pad's grid stands aside.
      if (m.device === 'keys') {
        requestAnimationFrame(() => {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        });
        m.focus('done');
      }
      if (m.device === 'touch') {
        grid.hidden = true;
        input.enterKeyHint = 'done';
        m.focus('done');
      }
    },
    press(m, key, d) {
      if (key === 'x') {
        d.value = (d.value ?? '').slice(0, -1);
        m.refresh();
        return true;
      }
      if (key === 'y') {
        const box = m.root.querySelector('.entry') as (HTMLElement & { submit?: () => void }) | null;
        box?.submit?.();
        return true;
      }
      return false;
    },
    back(m, d) {
      (document.activeElement as HTMLElement | null)?.blur?.();
      if (d.cancel) d.cancel();
      else m.pop();
    },
  });
}

/** A yes/no question. */
export function confirmDialog(m: Menus, title: string, text: string, yes: string, run: () => void, no = 'Cancel'): void {
  m.push<DialogData>('dialog', {
    title,
    text,
    options: [
      { label: yes, go: true, run: () => (m.pop(), run()) },
      { label: no, run: () => m.pop() },
    ],
  });
}

/** A message with one way out. */
export function messageDialog(m: Menus, title: string, text: string, ok = 'OK', then?: () => void): void {
  m.push<DialogData>('dialog', { title, text, options: [{ label: ok, go: true, run: () => (m.pop(), then?.()) }], cancel: () => (m.pop(), then?.()) });
}
