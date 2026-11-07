// The custom mech editor, off the Hangar (docs/CUSTOMIZATION.md): your mech
// of a frame, its parts (each from any design of the frame) and its paint
// (a scheme for the whole mech, and any part's own). It belongs to no
// faction: the bay is the league's, the mech lit in your colour (in a team
// race it is lit in your team's). Every change shows at once on the mech in
// the bay and is kept in your pilot record.

import { CLASSES, ROLE_NAMES, type Role } from '../../../sim/index';
import {
  CHANNEL_NAMES,
  CHANNELS,
  FINISHES,
  FINISH_NAMES,
  LINES,
  LINES_NAMES,
  METALS,
  NUMBER_MAX,
  PAINTS,
  PATTERNS,
  PATTERN_NAMES,
  WEARS,
  WEAR_NAMES,
  styleOf,
  type LiveryStyle,
  PART_NAMES,
  PART_SLOTS,
  PLURAL_PARTS,
  customName,
  nameProblem,
  stockBuild,
  type Channel,
  type MechBuild,
  type Paint,
  type PartSlot,
} from '../../../custom/mechBuild';
import { CALLSIGN_MAX, PILOT_COLOURS } from '../../../net/protocol';
import type { Game } from '../../game/game';
import { UNLOCKS, earned, howTo, lockedWhy, openOf, paintOpen, unlockName, type UnlockKind } from '../../game/unlocks';
import { partChannels } from '../../render/mech/customFrame';
import { LIVERIES, factionName, leagueLivery } from '../../render/palette';
import { h, setClass, setText } from '../dom';
import { emblemUrl, faceUrl } from '../factionArt';
import type { Menus } from '../menus';
import { BACK, CHANGE, SELECT, type DialogData, type EntryData } from './common';

/** Which of your mechs the editor is on: a frame. */
export interface CustomData {
  role: Role;
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

/** What the Grand Prix still has to earn of these kinds, and how (for the side panel). */
export function toEarn(g: Game, kinds: ReadonlyArray<UnlockKind>): HTMLElement[] {
  const left = UNLOCKS.filter((u) => kinds.includes(u.kind) && !earned(u, g.progress));
  if (!left.length) return [];
  return [h('h2', 'Earned in the Grand Prix'), h('div.rewards', ...left.map((u) => h('div.reward', h('b', unlockName(u)), h('span', howTo(u)))))];
}

/** A livery in a line: its pattern, number, finish and wear. */
function liverySummary(role: Role, s: LiveryStyle): string {
  const pattern = s.pattern ? `${PATTERN_NAMES[PATTERNS[s.pattern]]} in ${PAINTS[s.patternPaint].name}` : 'No pattern';
  const number = s.number < 0 ? `the frame's number (${role + 1})` : `number ${s.number}`;
  return `${pattern}, ${number}, a ${FINISH_NAMES[FINISHES[s.finish]].toLowerCase()} finish, panel lines ${LINES_NAMES[LINES[s.lines]].toLowerCase()}; wear: ${WEAR_NAMES[WEARS[s.wear]].toLowerCase()}.`;
}

/** The right stick (or a drag across the bay) inspects the mech from any side and elevation. */
const TURN = { pad: 'R stick', keys: 'Drag', label: 'Inspect' };

/** The shade over the bay: a mouse or finger drag orbits the mech on both axes. */
function bayShade(g: Game): HTMLElement {
  const el = h('div.shade.spin');
  let from: { x: number; y: number } | null = null;
  let id = -1;
  el.addEventListener('pointerdown', (e) => {
    from = { x: e.clientX, y: e.clientY };
    id = e.pointerId;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (from === null || e.pointerId !== id) return;
    g.turnHangar(e.clientX - from.x, e.clientY - from.y);
    from = { x: e.clientX, y: e.clientY };
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId === id) from = null;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  return el;
}

/** "has" or "have", for a part's name. */
const hasOrHave = (s: PartSlot) => (PLURAL_PARTS.has(s) ? 'have' : 'has');

const listOf = (ch: Channel): readonly Paint[] => (ch === 'frame' ? METALS : PAINTS);

/** The hangar computer's card for your custom mech (the anime look): the league's, for no faction, in your colour. */
function card(g: Game, d: CustomData, b: MechBuild, bar: string): HTMLElement {
  const livery = leagueLivery(PILOT_COLOURS[g.pilotColour] ?? PILOT_COLOURS[0]);
  const emblem = h('i');
  emblem.style.backgroundImage = `url(${emblemUrl(-1)})`;
  const face = h('i');
  face.style.backgroundImage = `url(${faceUrl(-1, d.role, g.portrait, g.pilotColour)})`;
  return h(
    'div.hh.custom-heading',
    h('div.hh-bar', h('span', `${livery.name.replace('Team ', '')} hangar`), h('span', bar)),
    h('div.hh-name', emblem, h('b', customName(d.role, b)), h('span', `${CLASSES[d.role].frame} class, ${ROLE_NAMES[d.role].toLowerCase()}`), h('div.hh-pilot', face, h('span', g.pilotName))),
  );
}

export function registerCustom(m: Menus, g: Game): void {
  const mech = (d: CustomData): MechBuild => g.hangarBuild(d.role);
  /** Keep a change: the mech in the bay shows it; each screen shows it in place (nothing is drawn again). */
  const save = (d: CustomData, b: MechBuild) => g.setCustomMech(d.role, b);

  m.register<CustomData>('custom', {
    render(m, d) {
      const b = mech(d);
      const col = h('div.col');
      const list = h('div.list');
      m.button(list, 'Parts', () => m.push<CustomData>('custom-parts', { ...d }), { key: 'parts', note: 'Each part from any of the five designs of the frame' });
      m.button(list, 'Paint', () => m.push<PaintData>('custom-paint', { ...d, target: 'mech' }), { key: 'paint', note: 'The whole mech, or a part at a time' });
      m.button(list, 'Livery', () => m.push<CustomData>('custom-livery', { ...d }), { key: 'livery', note: 'A pattern, the race number, the finish and the wear' });
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
      // (From the stock mech of the faction you last raced for.)
      const from = g.startingFaction();
      const stock = `${factionName(LIVERIES[from])} ${designName(d.role, from)}`;
      m.button(list, `Start again from the ${stock}`, () => {
        m.push<DialogData>('dialog', {
          title: 'Start again?',
          text: `Your ${customName(d.role, b)} becomes the stock ${stock} again, in its colours. Its name stays.`,
          options: [
            { label: 'Start again', go: true, run: () => { save(d, { ...stockBuild(from), name: mech(d).name }); m.pop(); } },
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
      col.append(h('div.context', 'Hangar'), card(g, d, b, 'Your mech'), h('h1', customName(d.role, b)), list);

      // What it is made of, and its colours.
      const side = h('div.kit.custom-sheet', h('h2', 'Parts'));
      const parts = h('div.part-list');
      for (const s of PART_SLOTS) parts.append(h('div', h('span', PART_NAMES[s]), h('b', designName(d.role, b.parts[s]))));
      const paint = h('div.paint-row');
      for (const ch of CHANNELS) paint.append(h('div', swatch(listOf(ch)[b.paint[ch]]), h('small', `${CHANNEL_NAMES[ch]}: ${listOf(ch)[b.paint[ch]].name}`)));
      const own = PART_SLOTS.filter((s) => b.own[s]).map((s) => PART_NAMES[s].toLowerCase());
      side.append(parts, h('h2', 'Paint'), paint, own.length ? h('div.note', `Painted on their own: ${own.join(', ')}.`) : '', h('h2', 'Livery'), h('div.note', liverySummary(d.role, styleOf(b))));
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

  // ---- livery ------------------------------------------------------------------
  // A pattern over the main paint (in a paint of its own), the race number,
  // the finish and the wear; each change shows on the mech in the bay.
  m.register<CustomData>('custom-livery', {
    render(m, d) {
      const col = h('div.col');
      const list = h('div.list');
      const style = (): LiveryStyle => styleOf(mech(d));
      const set = (c: Partial<LiveryStyle>) => {
        save(d, { ...mech(d), style: { ...style(), ...c } });
        m.refresh();
      };
      const step = (v: number, dir: number, n: number) => (((v + dir) % n) + n) % n;
      // On through what is open (the rest the Grand Prix earns: listed at the side).
      const next = <T extends string>(all: readonly T[], open: readonly T[], v: number, dir: number): number => {
        const at = open.indexOf(all[v]);
        return all.indexOf(open[at < 0 ? 0 : step(at, dir, open.length)]);
      };
      const p = g.progress;
      const s = style();
      m.choice(list, 'Pattern', PATTERN_NAMES[PATTERNS[s.pattern]], (dir) => set({ pattern: next(PATTERNS, openOf('pattern', PATTERNS, p), s.pattern, dir) }), { key: 'pattern' });
      m.choice(list, 'Pattern paint', PAINTS[s.patternPaint].name, (dir) => {
        let i = s.patternPaint;
        do i = step(i, dir, PAINTS.length);
        while (!paintOpen(i, p) && i !== s.patternPaint);
        set({ patternPaint: i });
      }, {
        key: 'patternPaint',
        locked: s.pattern === 0 ? 'Choose a pattern first' : null,
      });
      // The frame's own number first, then 0 to 99.
      m.choice(list, 'Race number', s.number < 0 ? `The frame's (${d.role + 1})` : String(s.number), (dir) => set({ number: step(s.number + 1, dir, NUMBER_MAX + 2) - 1 }), { key: 'number' });
      m.choice(list, 'Finish', FINISH_NAMES[FINISHES[s.finish]], (dir) => set({ finish: next(FINISHES, openOf('finish', FINISHES, p), s.finish, dir) }), { key: 'finish' });
      m.choice(list, 'Wear', WEAR_NAMES[WEARS[s.wear]], (dir) => set({ wear: next(WEARS, openOf('wear', WEARS, p), s.wear, dir) }), { key: 'wear' });
      // The panel lines are drawn over the paint and the pattern alike: either, both or neither.
      m.choice(list, 'Panel lines', LINES_NAMES[LINES[s.lines]], (dir) => set({ lines: step(s.lines, dir, LINES.length) }), {
        key: 'lines',
        locked: g.panelLinesShown ? null : 'Panel lines are off in Video: turn them on there to see them',
      });
      m.button(list, 'Done', () => m.pop(), { key: 'done', go: true });
      const b = mech(d);
      col.append(h('div.context', customName(d.role, b)), card(g, d, b, 'Livery'), h('h1', 'Livery'), list);
      const side = h(
        'div.kit.custom-sheet',
        h('h2', 'Livery'),
        h('div.note', liverySummary(d.role, s)),
        s.pattern ? h('div.paint-row', h('div', swatch(PAINTS[s.patternPaint]), h('small', `Pattern: ${PAINTS[s.patternPaint].name}`))) : '',
        h('div.note', 'The pattern goes over the main paint, a part at a time, and the panel lines over it (if they are on in Video). Wear shows in a race: scuffed to the metal and scorched as the armour goes.'),
        ...toEarn(g, ['pattern', 'finish', 'wear']),
      );
      m.root.append(bayShade(g), m.panes(col, h('div.hangar-side', side)), m.footer(TURN, { pad: 'D-pad', keys: '↑ ↓', label: 'Choose' }, CHANGE, BACK));
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
      // (A paint the Grand Prix has not yet opened is stepped over: the side lists how to earn it.)
      const usable = (ch: Channel, i: number) => ch === 'frame' || paintOpen(i, g.progress);
      for (const ch of CHANNELS) {
        const n = listOf(ch).length;
        m.choice(list, CHANNEL_NAMES[ch], '', (dir) => {
          const v = current(ch);
          if (!part()) {
            let i = v ?? 0;
            do i = (((i + dir) % n) + n) % n;
            while (!usable(ch, i) && i !== (v ?? 0));
            return setPaint(ch, i);
          }
          // A part's choices: the mech's paint, then every paint.
          let i = v === undefined ? 0 : v + 1;
          const from = i;
          do i = (((i + dir) % (n + 1)) + n + 1) % (n + 1);
          while (i > 0 && !usable(ch, i - 1) && i !== from);
          setPaint(ch, i === 0 ? undefined : i - 1);
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
          cells = listOf(ch).map((p, i) => {
            const sw = swatch(p);
            // Not yet earned: shown, locked, and what opens it on it.
            if (ch !== 'frame' && !paintOpen(i, g.progress)) {
              sw.classList.add('locked');
              sw.title = `${p.name}: ${lockedWhy('paint', p.name, g.progress) ?? ''}`;
            }
            return sw;
          });
          if (part()) cells.unshift(swatch(mechPaint(ch), true));
          chips.replaceChildren(...cells);
          openChips = m.grid({
            cells,
            on: () => cellOn(ch),
            set: (i) => {
              const v = cellValue(i);
              if (v !== undefined && !usable(ch, v)) return void m.toast(`${PAINTS[v].name}: ${lockedWhy('paint', PAINTS[v].name, g.progress) ?? 'not yet earned'}`);
              setPaint(ch, v);
            },
          });
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
            locked: there ? null : `The ${designName(d.role, b.parts[p!])}'s ${PART_NAMES[p!].toLowerCase()} ${hasOrHave(p!)} no ${CHANNEL_NAMES[ch].toLowerCase()} to paint.`,
          });
        }
        m.update('follow', { label: p ? `Paint the ${PART_NAMES[p].toLowerCase()} as the mech` : '', hidden: !(p && b.own[p]) });
        const missing = p ? CHANNELS.filter((ch) => !hs.has(ch)).map((ch) => CHANNEL_NAMES[ch].toLowerCase()) : [];
        setText(
          note,
          p
            ? missing.length
              ? `The ${designName(d.role, b.parts[p])}'s ${PART_NAMES[p].toLowerCase()} ${hasOrHave(p)} no ${missing.join(' or ')} to paint.`
              : `Anything left as the mech's follows the whole mech's paint.`
            : "Main, accent and trim are paints; the frame is bare metal. The glow and the lenses are your team's colour in a team race, and your own in a Sprint.",
        );
        showSide(m.selectedKey);
      };

      const side = h('div.kit.custom-sheet', chipsTitle, chips, summary, h('div.note', 'Each swatch is the paint over the shadow colour mixed for it.'), ...toEarn(g, ['paint']));
      m.root.append(bayShade(g), m.panes(col, h('div.hangar-side', side)), m.footer(TURN, { pad: 'D-pad', keys: '↑ ↓', label: 'Choose' }, CHANGE, SELECT, BACK));
      show();
    },
    selected(_m, key) {
      showSide(key);
    },
  });
}

/**
 * Open the editor on your own mech of a frame, making it if you have none
 * (from the stock mech of the faction you last raced for) and flying it.
 */
export function openCustom(m: Menus, g: Game, role: Role): void {
  if (!g.customMech(role)) g.setCustomMech(role, stockBuild(g.startingFaction()));
  g.setFliesCustom(role, true);
  m.push<CustomData>('custom', { role });
}

