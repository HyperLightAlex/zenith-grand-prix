// The hangar (who you race as: faction and frame, shared by every mode) and
// Free Play's match setup (what you play).

import { ABILITIES, ATTACKS, CLASSES, ROLE_NAMES, TRACKS, type Role } from '../../../sim/index';
import type { Game } from '../../game/game';
import { LIVERIES, factionName } from '../../render/palette';
import { h } from '../dom';
import { emblemUrl, pilotUrl } from '../factionArt';
import { MATCH_OPTIONS, RIVALS, TRACK_BLURBS, type Menus } from '../menus';
import { BACK, CHANGE, SELECT } from './common';

const KIT_TEXT: Record<number, [string, string]> = {
  0: ['Three quick blade strikes. Light, fast, hard to interrupt you out of.', 'An armoured lunge that closes a 30 m gap. Costs Drive.'],
  1: ['Three-round bursts out to 60 m. Works at racing speed, without a lock.', 'Boots an attacker away to make room for the carbine.'],
  2: ['Two heavy blows. The second one breaks a guard.', 'A close-range blast. Works at racing speed.'],
};

/** A value, or a function giving it as it is now (for a room or squad that changes while the hangar is open). */
type Live<T> = T | (() => T);
const now = <T,>(v: Live<T>): T => (typeof v === 'function' ? (v as () => T)() : v);

/** Why the hangar is open, and what its choices may be. */
export interface HangarData {
  /** The context strip: where you came from ("Free Play", "Grand Prix · Round 2 of 4"...). */
  context: Live<string>;
  /** The confirm item: named for what happens next. */
  confirm: string;
  onConfirm(): void;
  /** Set when the mode has fixed the faction: the reason. */
  factionLock?: Live<string | null>;
  /**
   * What a room or squad says your faction and frame are now. The hangar shows
   * it on every update, so a captain's or leader's change reaches it, except
   * for a moment after a change of your own while the server catches up.
   */
  live?: () => { team: number; role: Role } | null;
  /** When you last changed something here (performance.now()). */
  changedAt?: number;
  /** For each faction, why it cannot be chosen (the other team flies it), or null. */
  factionTaken?: (faction: number) => string | null;
  /**
   * A squad or a room team: who has each position. Picking a frame someone
   * has asks them to swap (`askFrame`) instead of changing yours; the panel
   * shows everyone's.
   */
  crew?: {
    title: () => string;
    /** Each position's holder (null: open, or a computer pilot's, named in `cpu`). */
    at: (role: Role) => { name: string; you: boolean; note?: string } | { name: null; cpu?: string };
    askFrame: (role: Role) => void;
  };
  /** The faction and frame shown (defaults to your loadout). */
  team?: number;
  role?: Role;
  /** A choice was made (default: it becomes your loadout). */
  onChange?: (team: number, role: Role) => void;
}

/** The hangar computer's card and the frame's panels, for whichever faction and frame. */
function frameCard(m: Menus, team: number, role: Role): { head: HTMLElement; info: HTMLElement; kit: HTMLElement; blurb: HTMLElement; bay: HTMLElement } {
  const c = CLASSES[role];
  const livery = LIVERIES[team] ?? LIVERIES[0];
  const model = livery.models[c.role];
  const emblem = h('i');
  emblem.style.backgroundImage = `url(${emblemUrl(team)})`;
  const pilot = h('i');
  pilot.style.backgroundImage = `url(${pilotUrl(team, c.role)})`;
  const name = h('b', model);
  const head = h(
    'div.hh',
    h('div.hh-bar', h('span', `${livery.name.replace('Team ', '')} hangar`), h('span', 'Frame setup')),
    h('div.hh-name', emblem, name, h('span', `${c.frame} class, ${ROLE_NAMES[c.role].toLowerCase()}`), h('div.hh-pilot', pilot, h('span', livery.pilots[c.role]))),
  );
  const fit = () => {
    name.style.fontSize = '';
    if (!name.isConnected || name.clientWidth === 0) return;
    let size = 3.3;
    while (name.scrollWidth > name.clientWidth + 1 && size > 2.2) {
      size -= 0.1;
      name.style.fontSize = `${size.toFixed(2)}em`;
    }
  };
  requestAnimationFrame(fit);
  const info = h('div.frame-info');
  const power = [0.6, 0.55, 1][c.role];
  const stats = [(c.topSpeed - 130) / 30, c.maxHp / 2200, (c.grip - 60) / 40, power];
  ['Top speed', 'Armour', 'Handling', 'Hitting power'].forEach((label, i) => {
    const fill = h('i');
    fill.style.setProperty('--v', Math.max(0.08, Math.min(1, stats[i])).toFixed(2));
    info.append(h('div.stat', h('span', label), h('div.bar', fill)));
  });
  const [p, s] = KIT_TEXT[c.role];
  const free = ABILITIES[c.abilityFree];
  const locked = ABILITIES[c.abilityLocked];
  const kit = h(
    'div.kit',
    h('h2', `${model}: weapons`),
    h('div', m.key('X', 'J'), h('b', ATTACKS[c.primary].name + '. '), p),
    h('div', m.key('Y', 'K'), h('b', ATTACKS[c.secondary].name + '. '), s),
    h('h2.cells', 'Abilities, one Cell each'),
    h('div.cellkit', m.key('B', 'R'), h('b', free.name + ' '), h('i', '(free steering). '), free.blurb),
    h('div.cellkit', m.key('B', 'R'), h('b', locked.name + ' '), h('i', '(locked on). '), locked.blurb),
    h('div.note', 'Cells come from the gold gates. They are lit on every lap, so a spent Cell can be earned back.'),
  );
  m.root.style.setProperty('--phos', '#' + livery.glow.toString(16).padStart(6, '0'));
  return { head, info, kit, blurb: h('p', c.blurb), bay: h('div.bay', h('span.bay-label', `Bay ${c.role + 1}: ${model}`)) };
}

export function registerGarage(m: Menus, g: Game): void {
  m.register<HangarData>('hangar', {
    render(m, data) {
      // Opened with nothing said about why (an old tool's menus.show('garage')): a plain hangar.
      const d = data ?? { context: 'Hangar', confirm: 'Done', onConfirm: () => m.pop() };
      const live = d.live?.() ?? null;
      const yours = d.changedAt !== undefined && performance.now() - d.changedAt < 2000;
      if (live && !yours) {
        d.team = live.team;
        d.role = live.role;
      }
      const team = d.team ?? g.loadout.team;
      const role = d.role ?? g.loadout.role;
      const factionLock = now(d.factionLock ?? null);
      if (live) g.preview({ team, role });
      const set = (t: number, r: Role) => {
        d.team = t;
        d.role = r;
        d.changedAt = performance.now();
        if (d.onChange) d.onChange(t, r);
        else g.setLoadout({ team: t, role: r });
        g.preview({ team: t, role: r });
        m.refresh();
      };
      const card = frameCard(m, team, role);
      const col = h('div.col');
      const list = h('div.list');
      const n = LIVERIES.length;
      m.choice(
        list,
        'Team',
        factionName(LIVERIES[team]),
        (dir) => {
          // Step over factions that are taken.
          for (let k = 1; k < n; k++) {
            const t = (((team + dir * k) % n) + n) % n;
            if (!d.factionTaken?.(t)) return set(t, role);
          }
        },
        { key: 'team', locked: factionLock },
      );
      const frameLabel = (r: Role) => `${LIVERIES[team].models[r]} (${CLASSES[r].frame})`;
      m.choice(
        list,
        'Frame',
        frameLabel(role),
        (dir) => {
          const r = (((role + dir) % 3) + 3) % 3 as Role;
          // A squadmate's or teammate's frame: ask them to swap.
          const there = d.crew?.at(r);
          if (there && there.name !== null && !there.you) {
            d.crew!.askFrame(r);
            return m.toast(`Asked ${there.name} to swap: they fly the ${LIVERIES[team].models[r]}`);
          }
          set(team, r);
        },
        { key: 'frame' },
      );
      m.button(list, d.confirm, () => d.onConfirm(), { key: 'go', go: true });
      m.button(list, 'Controls', () => m.push('controls'), { key: 'controls' });
      const strip = h('div.context', now(d.context));
      col.append(strip, card.head, h('h1', 'Hangar'), card.blurb, list, card.info);
      // Who flies what: your squad, or your team in a room.
      let crew: HTMLElement | string = '';
      if (d.crew) {
        crew = h('div.panel.crew', h('h2', d.crew.title()));
        for (const r of [0, 1, 2] as Role[]) {
          const at = d.crew.at(r);
          const who = at.name !== null ? at.name : at.cpu ?? 'Open';
          crew.append(
            h(
              'div.crew-row' + (at.name !== null && at.you ? '.you' : at.name === null ? '.open' : ''),
              h('span.role', ['FW', 'MF', 'DF'][r]),
              h('b', who),
              h('span', at.name !== null && at.note ? at.note : at.name === null && at.cpu ? 'Computer pilot' : at.name === null ? 'Pick it as your frame to move here' : LIVERIES[team].models[r]),
            ),
          );
        }
      }
      m.root.append(h('div.shade'), card.bay, col, crew, card.kit, m.footer({ pad: 'D-pad', keys: '↑ ↓', label: 'Choose' }, CHANGE, SELECT, BACK));
    },
  });

  m.register('setup', {
    render(m) {
      const c = g.free;
      const col = h('div.col');
      const list = h('div.list');
      const circuit = TRACKS.find((t) => t.id === c.track) ?? TRACKS[0];
      const opt = MATCH_OPTIONS[c.match] ?? MATCH_OPTIONS[0];
      const save = () => {
        g.saveFree();
        m.refresh();
      };
      m.choice(list, 'Circuit', circuit.name, (dir) => {
        const i = Math.max(0, TRACKS.findIndex((t) => t.id === c.track));
        c.track = TRACKS[(i + dir + TRACKS.length) % TRACKS.length].id;
        save();
      }, { key: 'track' });
      m.choice(list, 'Rival team', c.rival >= 0 ? factionName(LIVERIES[c.rival]) : 'Random', (dir) => {
        const options = [-1, ...LIVERIES.map((_, f) => f).filter((f) => f !== g.loadout.team)];
        const i = Math.max(0, options.indexOf(c.rival));
        c.rival = options[(i + dir + options.length) % options.length];
        save();
      }, { key: 'rival' });
      m.choice(list, 'Rival pilots', RIVALS[c.rivals], (dir) => {
        c.rivals = (c.rivals + dir + 3) % 3;
        save();
      }, { key: 'rivals' });
      m.choice(list, 'Match', opt.label, (dir) => {
        const n = MATCH_OPTIONS.length;
        c.match = (c.match + dir + n) % n;
        save();
      }, { key: 'match' });
      m.button(list, 'Start', () => g.startFree(), { key: 'start', go: true });
      const livery = LIVERIES[g.loadout.team];
      const you = h('div.context', `Free Play · ${factionName(livery)}, ${livery.models[g.loadout.role]}`);
      col.append(you, h('h1', 'Match setup'), list, h('div.match-blurb', `${TRACK_BLURBS[circuit.id] ?? ''} ${opt.blurb}`));
      m.root.append(h('div.shade'), col, m.footer({ pad: 'D-pad', keys: '↑ ↓', label: 'Choose' }, CHANGE, SELECT, { pad: 'Y', keys: 'Y', label: 'Hangar', press: 'y' }, BACK));
    },
    press(m, key) {
      if (key === 'y') {
        m.pop();
        return true;
      }
      return false;
    },
  });
}
