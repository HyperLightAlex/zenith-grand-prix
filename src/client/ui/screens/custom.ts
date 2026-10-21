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
import { h, setClass, setText } from '../dom';
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

/** A paint's swatch: the paint over its shadow colour, as a cel shades it. `follow`: a part's "as the mech" (marked as such). */
function swatch(p: Paint, follow = false): HTMLElement {
  const el = h('i.swatch' + (follow ? '.follow' : ''));
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  el.style.setProperty('--c', hex(p.color));
  el.style.setProperty('--s', hex(p.shade));
  el.title = follow ? `As the mech: ${p.name}` : p.name;
  return el;
}

/** The right stick (or a drag across the bay) turns the mech. */
const TURN = { pad: 'R stick', keys: 'Drag', label: 'Turn' };

/** The shade over the bay: a drag across it (the mouse, or a finger) turns the mech. */
function bayShade(g: Game): HTMLElement {
  const el = h('div.shade.spin');
  let from: number | null = null;
  let id = -1;
  el.addEventListener('pointerdown', (e) => {
    from = e.clientX;
    id = e.pointerId;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (from === null || e.pointerId !== id) return;
    g.turnHangar(e.clientX - from);
    from = e.clientX;
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId === id) from = null;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
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
  /** Keep a change: the mech in the bay shows it; each screen shows it in place (nothing is drawn again). */
  const save = (d: CustomData, b: MechBuild) => g.setCustomMech(d.role, b);

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
            save(d, { ...mech(d), name });
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
            { label: 'Start again', go: true, run: () => { save(d, { ...stockBuild(d.team), name: mech(d).name }); m.pop(); } },
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
      m.root.append(bayShade(g), m.panes(col, h('div.hangar-side', side)), m.footer(TURN, { pad: 'D-pad', keys: '↑ ↓', label: 'Choose' }, SELECT, BACK));
    },
  });

  // ---- parts ------------------------------------------------------------------
  const about = h('div.note');
  const describe = (d: CustomData, key: string) => {
    const slot = (key === 'arms' ? 'armR' : key) as PartSlot;
    if (!PART_SLOTS.includes(slot)) return setText(about, '');
    const f = mech(d).parts[slot];
    setText(about, `${key === 'arms' ? 'Both arms' : PART_NAMES[slot]}: from the ${designName(d.role, f)}, ${factionName(LIVERIES[f])}'s ${CLASSES[d.role].frame}.`);
  };
  m.register<CustomData>('custom-parts', {
    render(m, d) {
      const col = h('div.col');
      const list = h('div.list');
      const step = (v: number, dir: number) => (((v + dir) % 5) + 5) % 5;
      const set = (slots: PartSlot[], v: number) => {
        const b = mech(d);
        save(d, { ...b, parts: { ...b.parts, ...Object.fromEntries(slots.map((s) => [s, v])) } });
        show();
      };
      for (const s of PART_SLOTS) {
        if (s === 'armL') m.choice(list, 'Both arms', '', (dir) => set(['armL', 'armR'], step(mech(d).parts.armR, dir)), { key: 'arms' });
        m.choice(list, PART_NAMES[s], '', (dir) => set([s], step(mech(d).parts[s], dir)), { key: s });
      }
      m.button(list, 'Done', () => m.pop(), { key: 'done', go: true });
      /** What the rows say: only the values change. */
      const show = () => {
        const b = mech(d);
        m.update('arms', { value: b.parts.armL === b.parts.armR ? designName(d.role, b.parts.armR) : 'Mixed' });
        for (const s of PART_SLOTS) m.update(s, { value: designName(d.role, b.parts[s]) });
        describe(d, m.selectedKey);
      };
      const b = mech(d);
      col.append(h('div.context', customName(d.role, b)), card(g, d, b, 'Parts'), h('h1', 'Parts'), list);
      const side = h('div.kit.custom-sheet', h('h2', 'Parts'), about, h('div.note', `Every part fits any ${CLASSES[d.role].frame}: the five teams' designs of the frame share its joints. The weapon comes with the right arm.`));
      m.root.append(bayShade(g), m.panes(col, h('div.hangar-side', side)), m.footer(TURN, { pad: 'D-pad', keys: '↑ ↓', label: 'Choose' }, CHANGE, BACK));
      show();
    },
    selected(_m, key, d) {
      describe(d, key);
    },
  });

  // ---- paint ------------------------------------------------------------------
  // The side panel: on a colour's row, the catalogue for it (each paint over
  // its shadow colour, to pick by sight); on any other row, what is painted.
  const chipsTitle = h('h2');
  const chips = h('div.swatches');
  const summary = h('div.paint-row');
  let showSide: (key: string) => void = () => {};
  m.register<PaintData>('custom-paint', {
    render(m, d) {
      const col = h('div.col');
      const list = h('div.list');
      const targets: Array<'mech' | PartSlot> = ['mech', ...PART_SLOTS];
      const label = (t: 'mech' | PartSlot) => (t === 'mech' ? 'Whole mech' : PART_NAMES[t]);
      const part = (): PartSlot | null => (d.target === 'mech' ? null : d.target);
      const has = (): Set<Channel> => {
        const p = part();
        return p ? partChannels(d.role, mech(d).parts[p], p) : new Set(CHANNELS);
      };
      const mechPaint = (ch: Channel) => listOf(ch)[mech(d).paint[ch]];
      /** A channel's paint now (undefined: a part following the mech's). */
      const current = (ch: Channel): number | undefined => {
        const b = mech(d);
        const p = part();
        return p ? b.own[p]?.[ch] : b.paint[ch];
      };
      const valueText = (ch: Channel) => {
        const v = current(ch);
        return v === undefined ? `Mech's: ${mechPaint(ch).name}` : listOf(ch)[v].name;
      };
      /** Set a channel (undefined: a part follows the mech's paint again). */
      const setPaint = (ch: Channel, v: number | undefined) => {
        const b = mech(d);
        const p = part();
        if (!p) save(d, { ...b, paint: { ...b.paint, [ch]: v! } });
        else {
          const own = { ...(b.own[p] ?? {}) };
          if (v === undefined) delete own[ch];
          else own[ch] = v;
          const all = { ...b.own };
          if (Object.keys(own).length) all[p] = own;
          else delete all[p];
          save(d, { ...b, own: all });
        }
        show();
      };

      m.choice(list, 'Painting', '', (dir) => {
        d.target = targets[(targets.indexOf(d.target) + dir + targets.length) % targets.length];
        show();
      }, { key: 'target' });
      for (const ch of CHANNELS) {
        const n = listOf(ch).length;
        m.choice(list, CHANNEL_NAMES[ch], '', (dir) => {
          const v = current(ch);
          if (!part()) return setPaint(ch, ((((v ?? 0) + dir) % n) + n) % n);
          // A part's choices: the mech's paint, then every paint.
          const i = v === undefined ? 0 : v + 1;
          const next = (((i + dir) % (n + 1)) + n + 1) % (n + 1);
          setPaint(ch, next === 0 ? undefined : next - 1);
        }, { key: ch, open: () => openChips() });
      }
      m.button(list, '', () => {
        const p = part();
        if (!p) return;
        const own = { ...mech(d).own };
        delete own[p];
        save(d, { ...mech(d), own });
        show();
      }, { key: 'follow' });
      m.button(list, 'Done', () => m.pop(), { key: 'done', go: true });
      const note = h('div.match-blurb');
      const b = mech(d);
      col.append(h('div.context', customName(d.role, b)), card(g, d, b, 'Paint'), h('h1', 'Paint'), list, note);

      // The side panel. The catalogue is made once per colour (and per part: a
      // part's starts with the mech's paint); a change only moves what is on.
      let chipsFor = '';
      let cells: HTMLElement[] = [];
      let openChips: () => void = () => {};
      const cellValue = (i: number): number | undefined => (part() ? (i === 0 ? undefined : i - 1) : i);
      const cellOn = (ch: Channel): number => {
        const v = current(ch);
        return part() ? (v === undefined ? 0 : v + 1) : (v ?? -1);
      };
      showSide = (key: string) => {
        const ch = (CHANNELS as readonly string[]).includes(key) && has().has(key as Channel) ? (key as Channel) : null;
        chips.hidden = !ch;
        summary.hidden = !!ch;
        if (!ch) {
          chipsFor = '';
          setText(chipsTitle, part() ? `The ${label(d.target).toLowerCase()}'s paint` : "The mech's paint");
          summary.replaceChildren();
          const hs = has();
          for (const c of CHANNELS.filter((c) => hs.has(c))) {
            const v = current(c);
            summary.append(h('div', swatch(v === undefined ? mechPaint(c) : listOf(c)[v], v === undefined), h('small', `${CHANNEL_NAMES[c]}: ${valueText(c)}`)));
          }
          return;
        }
        const id = `${ch}/${d.target}`;
        if (id !== chipsFor) {
          chipsFor = id;
          setText(chipsTitle, ch === 'frame' ? 'Metals' : 'Paints');
          cells = listOf(ch).map((p) => swatch(p));
          if (part()) cells.unshift(swatch(mechPaint(ch), true));
          chips.replaceChildren(...cells);
          openChips = m.grid({ cells, on: () => cellOn(ch), set: (i) => setPaint(ch, cellValue(i)) });
        }
        const on = cellOn(ch);
        cells.forEach((c, i) => setClass(c, 'on', i === on));
      };

      /** What the screen says: only what changed changes. */
      const show = () => {
        const b = mech(d);
        const p = part();
        const hs = has();
        m.update('target', { value: label(d.target) });
        for (const ch of CHANNELS) {
          const there = hs.has(ch);
          m.update(ch, {
            value: there ? valueText(ch) : 'None',
            locked: there ? null : `The ${designName(d.role, b.parts[p!])}'s ${PART_NAMES[p!].toLowerCase()} has no ${CHANNEL_NAMES[ch].toLowerCase()} to paint.`,
          });
        }
        m.update('follow', { label: p ? `Paint the ${PART_NAMES[p].toLowerCase()} as the mech` : '', hidden: !(p && b.own[p]) });
        const missing = p ? CHANNELS.filter((ch) => !hs.has(ch)).map((ch) => CHANNEL_NAMES[ch].toLowerCase()) : [];
        setText(
          note,
          p
            ? missing.length
              ? `The ${designName(d.role, b.parts[p])}'s ${PART_NAMES[p].toLowerCase()} has no ${missing.join(' or ')} to paint.`
              : `Anything left as the mech's follows the whole mech's paint.`
            : "Main, accent and trim are paints; the frame is bare metal. The glow and the lenses stay your team's colour.",
        );
        showSide(m.selectedKey);
      };

      const side = h('div.kit.custom-sheet', chipsTitle, chips, summary, h('div.note', 'Each swatch is the paint over the shadow colour mixed for it.'));
      m.root.append(bayShade(g), m.panes(col, h('div.hangar-side', side)), m.footer(TURN, { pad: 'D-pad', keys: '↑ ↓', label: 'Choose' }, CHANGE, SELECT, BACK));
      show();
    },
    selected(_m, key) {
      showSide(key);
    },
  });
}

/** Open the editor on your custom mech of a frame, making it from the stock mech you were looking at if you have none, and flying it. */
export function openCustom(m: Menus, g: Game, role: Role, team: number): void {
  if (!g.customMech(role)) g.setCustomMech(role, stockBuild(team));
  g.setFliesCustom(role, true);
  m.push<CustomData>('custom', { role, team });
}

