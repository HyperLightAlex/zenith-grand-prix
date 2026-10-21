// The custom mech editor, off the hangar (docs/CUSTOMIZATION.md): your mech
// of a frame, its parts (each from any design of the frame) and its paint
// (a scheme for the whole mech, and any part's own). Every change shows at
// once on the mech in the bay and is kept in your pilot record.

import { CLASSES, ROLE_NAMES, type Role } from '../../../sim/index';
import {
  CHANNEL_NAMES,
  CHANNELS,
  METALS,
  PAINTS,
  PART_NAMES,
  PART_SLOTS,
  customName,
  nameProblem,
  stockBuild,
  type Channel,
  type MechBuild,
  type Paint,
  type PartSlot,
} from '../../../custom/mechBuild';
import { CALLSIGN_MAX } from '../../../net/protocol';
import type { Game } from '../../game/game';
import { partChannels } from '../../render/mech/customFrame';
import { LIVERIES, factionName } from '../../render/palette';
import { h } from '../dom';
import { emblemUrl, faceUrl } from '../factionArt';
import type { Menus } from '../menus';
import { BACK, CHANGE, SELECT, type DialogData, type EntryData } from './common';

/** Which of your mechs the editor is on: a frame, and the faction you fly for (its glow and markings). */
export interface CustomData {
  role: Role;
  team: number;
}

/** What the paint screen is painting: the whole mech, or one part. */
export interface PaintData extends CustomData {
  target: 'mech' | PartSlot;
}

/** A design's name (its faction's model of the frame). */
export function designName(role: Role, design: number): string {
  return LIVERIES[design]?.models[role] ?? '?';
}

export { customName };

/** A paint's swatch: the paint over its shadow colour, as a cel shades it. */
function swatch(p: Paint): HTMLElement {
  const el = h('i.swatch');
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  el.style.setProperty('--c', hex(p.color));
  el.style.setProperty('--s', hex(p.shade));
  el.title = p.name;
  return el;
}

const listOf = (ch: Channel): readonly Paint[] => (ch === 'frame' ? METALS : PAINTS);

/** The hangar computer's card for your custom mech (the anime look). */
function card(g: Game, d: CustomData, b: MechBuild, bar: string): HTMLElement {
  const livery = LIVERIES[d.team] ?? LIVERIES[0];
  const emblem = h('i');
  emblem.style.backgroundImage = `url(${emblemUrl(d.team)})`;
  const face = h('i');
  face.style.backgroundImage = `url(${faceUrl(d.team, d.role, g.portrait)})`;
  return h(
    'div.hh',
    h('div.hh-bar', h('span', `${livery.name.replace('Team ', '')} hangar`), h('span', bar)),
    h('div.hh-name', emblem, h('b', customName(d.role, b)), h('span', `${CLASSES[d.role].frame} class, ${ROLE_NAMES[d.role].toLowerCase()}`), h('div.hh-pilot', face, h('span', g.pilotName))),
  );
}

export function registerCustom(m: Menus, g: Game): void {
  const mech = (d: CustomData): MechBuild => g.customMech(d.role) ?? stockBuild(d.team);
  const save = (d: CustomData, b: MechBuild) => {
    g.setCustomMech(d.role, b);
    m.refresh();
  };

  m.register<CustomData>('custom', {
    render(m, d) {
      const b = mech(d);
      const col = h('div.col');
      const list = h('div.list');
      m.button(list, 'Parts', () => m.push<CustomData>('custom-parts', { ...d }), { key: 'parts', note: 'Each part from any of the five designs of the frame' });
      m.button(list, 'Paint', () => m.push<PaintData>('custom-paint', { ...d, target: 'mech' }), { key: 'paint', note: 'The whole mech, or a part at a time' });
      m.button(list, `Name: ${b.name || '(none)'}`, () => {
        m.push<EntryData>('entry', {
          title: 'Name your mech',
          hint: `Shown with it in the hangar and the results. Up to ${CALLSIGN_MAX} characters; leave it empty for "${customName(d.role, null)}".`,
          kind: 'callsign',
          value: b.name,
          submit: (v) => {
            const name = v.trim().replace(/\s+/g, ' ');
            const problem = nameProblem(name);
            if (problem) return problem;
            g.setCustomMech(d.role, { ...mech(d), name });
            m.pop();
            return null;
          },
        });
      }, { key: 'name' });
      const stock = `${factionName(LIVERIES[d.team])} ${designName(d.role, d.team)}`;
      m.button(list, `Start again from the ${stock}`, () => {
        m.push<DialogData>('dialog', {
          title: 'Start again?',
          text: `Your ${customName(d.role, b)} becomes the stock ${stock} again, in its colours. Its name stays.`,
          options: [
            { label: 'Start again', go: true, run: () => { m.pop(); save(d, { ...stockBuild(d.team), name: b.name }); } },
            { label: 'Keep it', run: () => m.pop() },
          ],
        });
      }, { key: 'reset' });
      m.button(list, 'Delete it', () => {
        m.push<DialogData>('dialog', {
          title: `Delete your ${customName(d.role, b)}?`,
          text: `You fly the stock ${CLASSES[d.role].frame} of the team you race for instead.`,
          options: [
            { label: 'Delete', go: true, run: () => { g.setCustomMech(d.role, null); m.pop(); m.pop(); } },
            { label: 'Keep it', run: () => m.pop() },
          ],
        });
      }, { key: 'delete' });
      m.button(list, 'Done', () => m.pop(), { key: 'done', go: true });
      col.append(h('div.context', 'Hangar'), card(g, d, b, 'Custom mech'), h('h1', customName(d.role, b)), list);

      // What it is made of, and its colours.
      const side = h('div.kit.custom-sheet', h('h2', 'Parts'));
      const parts = h('div.part-list');
      for (const s of PART_SLOTS) parts.append(h('div', h('span', PART_NAMES[s]), h('b', designName(d.role, b.parts[s]))));
      const paint = h('div.paint-row');
      for (const ch of CHANNELS) paint.append(h('div', swatch(listOf(ch)[b.paint[ch]]), h('small', `${CHANNEL_NAMES[ch]}: ${listOf(ch)[b.paint[ch]].name}`)));
      const own = PART_SLOTS.filter((s) => b.own[s]).map((s) => PART_NAMES[s].toLowerCase());
      side.append(parts, h('h2', 'Paint'), paint, own.length ? h('div.note', `Painted on their own: ${own.join(', ')}.`) : '');
      m.root.append(h('div.shade'), m.panes(col, h('div.hangar-side', side)), m.footer({ pad: 'D-pad', keys: '↑ ↓', label: 'Choose' }, SELECT, BACK));
    },
  });

  // ---- parts ------------------------------------------------------------------
  const about = h('div.note');
  m.register<CustomData>('custom-parts', {
    render(m, d) {
      const b = mech(d);
      const col = h('div.col');
      const list = h('div.list');
      const step = (v: number, dir: number) => (((v + dir) % 5) + 5) % 5;
      const set = (slots: PartSlot[], v: number) => save(d, { ...b, parts: { ...b.parts, ...Object.fromEntries(slots.map((s) => [s, v])) } });
      for (const s of PART_SLOTS) {
        if (s === 'armL') {
          const same = b.parts.armL === b.parts.armR;
          m.choice(list, 'Both arms', same ? designName(d.role, b.parts.armR) : 'Mixed', (dir) => set(['armL', 'armR'], step(b.parts.armR, dir)), { key: 'arms' });
        }
        m.choice(list, PART_NAMES[s], designName(d.role, b.parts[s]), (dir) => set([s], step(b.parts[s], dir)), { key: s });
      }
      m.button(list, 'Done', () => m.pop(), { key: 'done', go: true });
      col.append(h('div.context', customName(d.role, b)), card(g, d, b, 'Parts'), h('h1', 'Parts'), list);
      const side = h('div.kit.custom-sheet', h('h2', 'Parts'), about, h('div.note', `Every part fits any ${CLASSES[d.role].frame}: the five teams' designs of the frame share its joints. The weapon comes with the right arm.`));
      m.root.append(h('div.shade'), m.panes(col, h('div.hangar-side', side)), m.footer({ pad: 'D-pad', keys: '↑ ↓', label: 'Choose' }, CHANGE, BACK));
    },
    selected(_m, key, d) {
      const b = mech(d);
      const slot = (key === 'arms' ? 'armR' : key) as PartSlot;
      if (!PART_SLOTS.includes(slot)) {
        about.textContent = '';
        return;
      }
      const f = b.parts[slot];
      about.textContent = `${key === 'arms' ? 'Both arms' : PART_NAMES[slot]}: from the ${designName(d.role, f)}, ${factionName(LIVERIES[f])}'s ${CLASSES[d.role].frame}.`;
    },
  });

  // ---- paint ------------------------------------------------------------------
  const chips = h('div.swatches');
  const chipsTitle = h('h2');
  let showChips: (key: string) => void = () => {};
  m.register<PaintData>('custom-paint', {
    render(m, d) {
      const b = mech(d);
      const col = h('div.col');
      const list = h('div.list');
      const targets: Array<'mech' | PartSlot> = ['mech', ...PART_SLOTS];
      const ti = targets.indexOf(d.target);
      const label = (t: 'mech' | PartSlot) => (t === 'mech' ? 'Whole mech' : PART_NAMES[t]);
      m.choice(list, 'Painting', label(d.target), (dir) => {
        d.target = targets[(ti + dir + targets.length) % targets.length];
        m.refresh();
      }, { key: 'target' });
      const part = d.target === 'mech' ? null : d.target;
      const has = part ? partChannels(d.role, b.parts[part], part) : new Set(CHANNELS);
      const mechPaint = (ch: Channel) => listOf(ch)[b.paint[ch]];
      /** Set a channel (undefined: a part follows the mech's paint again). */
      const setPaint = (ch: Channel, v: number | undefined) => {
        if (!part) return save(d, { ...b, paint: { ...b.paint, [ch]: v! } });
        const own = { ...(b.own[part] ?? {}) };
        if (v === undefined) delete own[ch];
        else own[ch] = v;
        const all = { ...b.own };
        if (Object.keys(own).length) all[part] = own;
        else delete all[part];
        save(d, { ...b, own: all });
      };
      const current = (ch: Channel): number | undefined => (part ? b.own[part]?.[ch] : b.paint[ch]);
      for (const ch of CHANNELS) {
        if (!has.has(ch)) continue;
        const n = listOf(ch).length;
        const v = current(ch);
        const value = v === undefined ? `Mech's: ${mechPaint(ch).name}` : listOf(ch)[v].name;
        m.choice(list, CHANNEL_NAMES[ch], value, (dir) => {
          if (!part) return setPaint(ch, (((v ?? 0) + dir) % n + n) % n);
          // A part's choices: the mech's paint, then every paint.
          const i = v === undefined ? 0 : v + 1;
          const next = (((i + dir) % (n + 1)) + n + 1) % (n + 1);
          setPaint(ch, next === 0 ? undefined : next - 1);
        }, { key: ch });
      }
      if (part && b.own[part]) {
        m.button(list, `Paint the ${PART_NAMES[part].toLowerCase()} as the mech`, () => {
          const own = { ...b.own };
          delete own[part];
          save(d, { ...b, own });
        }, { key: 'follow' });
      }
      m.button(list, 'Done', () => m.pop(), { key: 'done', go: true });
      const missing = part ? CHANNELS.filter((ch) => !has.has(ch)).map((ch) => CHANNEL_NAMES[ch].toLowerCase()) : [];
      const note = part
        ? missing.length
          ? `The ${designName(d.role, b.parts[part])}'s ${PART_NAMES[part].toLowerCase()} has no ${missing.join(' or ')} to paint.`
          : `Anything left as the mech's follows the whole mech's paint.`
        : 'Main, accent and trim are paints; the frame is bare metal. The glow and the lenses stay your team\'s colour.';
      col.append(h('div.context', customName(d.role, b)), card(g, d, b, 'Paint'), h('h1', 'Paint'), list, h('div.match-blurb', note));

      // The catalogue for the highlighted channel: each paint over its shadow colour, to pick by sight.
      showChips = (key: string) => {
        chips.replaceChildren();
        const ch = (CHANNELS as readonly string[]).includes(key) ? (key as Channel) : null;
        chipsTitle.textContent = ch ? (ch === 'frame' ? 'Metals' : 'Paints') : 'Paints';
        if (!ch) return;
        const on = current(ch) ?? (part ? -1 : b.paint[ch]);
        listOf(ch).forEach((p, i) => {
          const el = swatch(p);
          if (i === on) el.classList.add('on');
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            g.audio.play('ui_select');
            setPaint(ch, i);
          });
          chips.append(el);
        });
      };
      const side = h('div.kit.custom-sheet', chipsTitle, chips, h('div.note', 'Each swatch is the paint over the shadow colour mixed for it.'));
      m.root.append(h('div.shade'), m.panes(col, h('div.hangar-side', side)), m.footer({ pad: 'D-pad', keys: '↑ ↓', label: 'Choose' }, CHANGE, BACK));
    },
    selected(_m, key) {
      showChips(key);
    },
  });
}

/** Open the editor on your custom mech of a frame, making it from the stock mech you were looking at if you have none, and flying it. */
export function openCustom(m: Menus, g: Game, role: Role, team: number): void {
  if (!g.customMech(role)) g.setCustomMech(role, stockBuild(team));
  g.setFliesCustom(role, true);
  m.push<CustomData>('custom', { role, team });
}

