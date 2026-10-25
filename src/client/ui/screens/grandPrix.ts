// Grand Prix: the hub (Cup, Grand Tour, Season and the difficulty, with what
// the highlighted one holds shown beside it), the cup select (the three cups
// side by side, each with its circuits and the medals it has given), the
// round briefing, the standings after a round, and the award at the end.

import { TRACKS } from '../../../sim/index';
import {
  CUPS,
  GP_DIFFICULTY,
  TOUR_ID,
  average,
  cupOpen,
  eventName,
  isOver,
  playedRounds,
  roundComplete,
  singleRaces,
  standings,
  tourOpen,
  yourRoundNumber,
  type GpEvent,
  type GpFixture,
  type GpKind,
} from '../../../gp/grandPrix';
import type { Game } from '../../game/game';
import { LIVERIES, factionName } from '../../render/palette';
import { paintedTrack } from '../../render/painted';
import { h } from '../dom';
import { emblemUrl } from '../factionArt';
import { TRACK_BLURBS, type Menus } from '../menus';
import type { Medal } from '../../../gp/grandPrix';
import { BACK, CHANGE, SELECT, confirmDialog } from './common';

export interface GpData {
  kind: GpKind;
}

export const ORD = ['1st', '2nd', '3rd', '4th', '5th'];
export const MEDAL_NAMES: Record<string, string> = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };

export function emblem(f: number): HTMLElement {
  const el = h('i.emb');
  el.style.backgroundImage = `url(${emblemUrl(f)})`;
  return el;
}

export function circuitName(id: string): string {
  return TRACKS.find((t) => t.id === id)?.name ?? id;
}

/** The five-faction table after rounds 0..upTo. */
export function gpTable(ev: GpEvent, upTo: number): HTMLElement {
  const rows = standings(ev, upTo);
  const cup = singleRaces(ev);
  const table = h<'table'>('table.gptable');
  const head = h<'tr'>('tr');
  const cols = cup ? ['', 'Team', 'Races', 'Won', 'Points', 'Average'] : ['', 'Team', 'Played', 'Won', 'Lost', 'Rounds', 'Points'];
  cols.forEach((c, i) => head.append(h<'th'>('th' + (i >= 2 ? '.num' : ''), c)));
  table.append(head);
  rows.forEach((r, i) => {
    const tr = h<'tr'>('tr' + (r.faction === ev.faction ? '.me' : ''));
    const name = h<'td'>('td.team', emblem(r.faction), factionName(LIVERIES[r.faction]));
    const cells = cup
      ? [String(r.races), String(r.won), String(r.points), r.races ? average(r).toFixed(1) : '–']
      : [String(r.played), String(r.won), String(r.lost), `${r.roundsFor}–${r.roundsAgainst}`, String(r.points)];
    tr.append(h<'td'>('td.pos', String(i + 1)), name, ...cells.map((c) => h<'td'>('td.num', c)));
    table.append(tr);
  });
  return table;
}

export function fixtureLine(f: GpFixture, ev: GpEvent): HTMLElement {
  const a = factionName(LIVERIES[f.a]);
  const b = factionName(LIVERIES[f.b]);
  const r = f.result;
  const score = !r ? 'racing…' : singleRaces(ev) ? `${r.points[0]}–${r.points[1]}` : `${r.wins[0]}–${r.wins[1]}`;
  return h('div.fixture' + (f.a === ev.faction ? '.me' : ''), emblem(f.a), h('span', a), h('b', score), h('span', b), emblem(f.b));
}

/** The award: the medal or cup (if any), the headline and a line under it. */
export function awardLines(ev: GpEvent, place: number, medal: string | null): HTMLElement[] {
  let headline: string;
  let line: string;
  if (singleRaces(ev)) {
    headline = medal ? `${MEDAL_NAMES[medal]} medal` : `${ORD[place - 1]} place`;
    line = medal ? `${eventName(ev)} at ${GP_DIFFICULTY[ev.difficulty]}: ${factionName(LIVERIES[ev.faction])} finish ${ORD[place - 1]}.` : `${factionName(LIVERIES[ev.faction])} finish ${ORD[place - 1]}: a medal needs the top three.`;
  } else {
    headline = place === 1 ? 'The Zenith Cup' : `${ORD[place - 1]} in the season`;
    line = place === 1 ? `${factionName(LIVERIES[ev.faction])} top the table at ${GP_DIFFICULTY[ev.difficulty]}. The cup is yours.` : `${factionName(LIVERIES[ev.faction])} finish ${ORD[place - 1]}. Only the top of the table takes the cup.`;
  }
  const badge = h('div.medal.' + (ev.kind === 'season' ? (place === 1 ? 'cup' : 'none') : (medal ?? 'none')));
  return [badge, h('h1', headline), h('p', line)];
}

/** A circuit's board (its name and emblem, painted), for the cups and the previews. */
function board(id: string): HTMLElement {
  const own = paintedTrack.circuits[id];
  if (!own) return h('div.board.plain', circuitName(id));
  const img = h<'img'>('img.board');
  img.src = own.url;
  img.alt = circuitName(id);
  img.draggable = false;
  return img;
}

/** The medals an event has given, one place for each difficulty. */
function pips(won: Record<number, Medal | undefined> | undefined): HTMLElement {
  return h(
    'div.pips',
    ...GP_DIFFICULTY.map((d, i) => {
      const m = won?.[i];
      const el = h('span.pip', h('i.' + (m ?? 'empty')), d);
      el.title = `${d}: ${m ? MEDAL_NAMES[m] : 'no medal yet'}`;
      return el;
    }),
  );
}

/** A trophy, in a cup's colours (or the Grand Tour's, or the Zenith Cup's). */
function trophy(id: string): HTMLElement {
  return h('div.trophy.' + id, h('i'));
}

/** Where an event under way is: "round 2 of 3". */
function progress(ev: GpEvent): string {
  return `${singleRaces(ev) ? 'Round' : 'Matchday'} ${singleRaces(ev) ? Math.min(playedRounds(ev), yourRoundNumber(ev)) : ev.current + 1} of ${singleRaces(ev) ? playedRounds(ev) : ev.rounds.length}`;
}

/** The hub's preview pane, filled for the highlighted item. */
let preview: HTMLElement | null = null;

export function registerGrandPrix(m: Menus, g: Game): void {
  const fill = (key: string) => {
    const side = preview;
    if (!side) return;
    const medals = g.gpMedals();
    const diff = g.gpDifficulty();
    side.replaceChildren();
    if (key === 'cup') {
      const cupEv = g.gpEvent('cup');
      side.append(h('h2', 'Cups'), h('p', 'Three races, each against a different faction: gold, silver or bronze for the top three. A medal opens the next cup.'));
      CUPS.forEach((c, i) => {
        const open = cupOpen(c.id, medals.byCup);
        const going = cupEv && cupEv.cup === c.id && !isOver(cupEv) ? cupEv : null;
        side.append(
          h(
            'div.prev-cup' + (open ? '' : '.locked'),
            trophy(c.id),
            h('div.prev-name', h('b', c.name), h('small', going ? `Under way: ${progress(going)}` : open ? '' : `A medal in the ${CUPS[i - 1].name} opens it`)),
            pips(medals.byCup[c.id]),
            h('div.prev-boards', ...c.circuits.map(board)),
          ),
        );
      });
    } else if (key === 'tour') {
      const tour = g.gpEvent('tour');
      const open = tourOpen(medals.byCup) || !!tour;
      side.append(
        h('h2', 'Grand Tour'),
        h('p', open ? 'Nine races, every circuit in turn. Each rival twice, then a decider at Zenith Ring against the team nearest you on the table.' : 'Opens with a medal in each of the three cups.'),
        h('div.prev-grid.nine' + (open ? '' : '.locked'), ...TRACKS.map((t) => board(t.id))),
        h('div.prev-foot', trophy('tour'), tour && !isOver(tour) ? h('b', `Under way: ${progress(tour)}`) : pips(medals.byCup[TOUR_ID])),
      );
    } else if (key === 'season') {
      const season = g.gpEvent('season');
      const ids = TRACKS.map((t) => t.id).filter((id) => id !== 'zenith');
      side.append(
        h('h2', 'Zenith Cup season'),
        h('p', 'Ten matchdays: every other faction twice, best of 3, two days off. Top the table for the Zenith Cup. It keeps between sittings.'),
        h('div.prev-half', h('small', 'First half'), h('div.prev-boards', ...[...ids.slice(0, 4), 'zenith'].map(board))),
        h('div.prev-half', h('small', 'Second half'), h('div.prev-boards', ...[...ids.slice(4, 8), 'zenith'].map(board))),
        h('div.prev-foot', trophy('season'), h('b', season && !isOver(season) ? `Under way: ${progress(season)}` : `Zenith Cups won: ${GP_DIFFICULTY.map((d, i) => `${d} ${medals.season[i] ?? 0}`).join(' · ')}`)),
      );
    } else {
      side.append(
        h('h2', 'Difficulty'),
        h('p', 'How well the rival pilots race. Your teammates race the same at every difficulty. It applies to a new cup, Grand Tour or season; one under way keeps its own.'),
        h('div.prev-levels', ...GP_DIFFICULTY.map((d, i) => h('div' + (i === diff ? '.on' : ''), h('b', d), h('small', ['New to it: rivals who leave room.', 'A fair fight.', 'Rivals who race to win, and know the lines.'][i])))),
      );
    }
  };

  m.register('gp', {
    render(m) {
      const col = h('div.col.gp');
      const list = h('div.list');
      const diff = g.gpDifficulty();
      const medals = g.gpMedals();
      const cupEv = g.gpEvent('cup');
      const tour = g.gpEvent('tour');
      const season = g.gpEvent('season');
      const tourIsOpen = tourOpen(medals.byCup) || !!tour;
      m.button(list, 'Cup', () => m.push('gp-cups'), { key: 'cup', note: cupEv && !isOver(cupEv) ? `${eventName(cupEv)}: ${progress(cupEv).toLowerCase()}` : 'Three cups, three races each' });
      m.button(list, 'Grand Tour', () => g.openGp('tour'), {
        key: 'tour',
        locked: tourIsOpen ? null : 'A medal in each of the three cups opens it',
        note: tour && !isOver(tour) ? progress(tour) : tourIsOpen ? 'Nine races, every circuit' : 'A medal in each cup opens it',
      });
      m.button(list, 'Season', () => g.openGp('season'), { key: 'season', note: season && !isOver(season) ? progress(season) : 'Ten matchdays for the Zenith Cup' });
      m.choice(list, 'Difficulty', GP_DIFFICULTY[diff], (dir) => g.setGpDifficulty((diff + dir + 3) % 3), { key: 'difficulty' });
      col.append(h('div.context', 'Grand Prix'), h('h1', 'Grand Prix'), list);
      preview = h('div.panel.gp-preview');
      m.root.append(h('div.shade'), m.panes(col, preview), m.footer(SELECT, CHANGE, BACK));
    },
    selected(_m, key) {
      fill(key);
    },
  });

  m.register('gp-cups', {
    spatial: true,
    render(m) {
      const medals = g.gpMedals();
      const diff = g.gpDifficulty();
      const cupEv = g.gpEvent('cup');
      const going = cupEv && !isOver(cupEv) ? cupEv : null;
      const col = h('div.col.gp-cups-side');
      col.append(
        h('div.context', `Grand Prix · ${GP_DIFFICULTY[going ? going.difficulty : diff]}`),
        h('h1', 'Choose a cup'),
        h('p', going ? `The ${eventName(going)} is under way (${progress(going).toLowerCase()}). Choosing another cup puts it away.` : 'Three races, each against a different faction. A medal in one cup opens the next.'),
      );
      const row = h('div.cuprow');
      CUPS.forEach((c, i) => {
        const open = cupOpen(c.id, medals.byCup);
        const mine = going && going.cup === c.id ? going : null;
        const card = h(
          'div.item.cupcard' + (mine ? '.going' : ''),
          trophy(c.id),
          h('h3', c.name),
          h('div.boards', ...c.circuits.map(board)),
          pips(medals.byCup[c.id]),
          h('div.status', mine ? `Continue: ${progress(mine).toLowerCase()}` : open ? '' : `A medal in the ${CUPS[i - 1].name} opens it`),
        );
        m.addItem(
          row,
          card,
          () => {
            if (going && going.cup !== c.id) {
              confirmDialog(m, `Put the ${eventName(going)} away?`, `One cup at a time: the ${eventName(going)} under way is abandoned (its races so far are lost) and the ${c.name} starts. Medals already won are kept.`, `Start the ${c.name}`, () => {
                g.abandonGp('cup');
                g.openGp('cup', c.id);
              });
            } else g.openGp('cup', c.id);
          },
          undefined,
          { key: c.id, locked: open ? null : `A medal in the ${CUPS[i - 1].name} opens it` },
        );
      });
      const pane = h('div.panel.cups', row);
      m.root.append(h('div.shade'), m.panes(col, pane), m.footer(SELECT, BACK));
      // The cup under way, or else the furthest one open.
      const first = going ? going.cup : [...CUPS].reverse().find((c) => cupOpen(c.id, medals.byCup))?.id;
      if (first) m.focus(first);
    },
  });

  m.register<GpData>('briefing', {
    render(m, d) {
      const ev = g.gpEvent(d.kind);
      if (!ev) return void m.pop();
      const r = ev.rounds[ev.current];
      const col = h('div.col.briefing');
      const list = h('div.list');
      const total = playedRounds(ev);
      col.append(h('div.context', `${eventName(ev)} · ${GP_DIFFICULTY[ev.difficulty]} · ${factionName(LIVERIES[ev.faction])}`));
      if (r.you) {
        const rival = r.you.b;
        g.circuitAhead(r.circuit);
        col.append(
          h('h1', `Round ${yourRoundNumber(ev)} of ${total}`),
          h('div.versus', emblem(ev.faction), h('span', factionName(LIVERIES[ev.faction])), h('b', 'vs'), h('span', factionName(LIVERIES[rival])), emblem(rival)),
          h('p', `${circuitName(r.circuit)}. ${singleRaces(ev) ? 'A single race.' : 'Best of 3.'} ${ev.kind === 'tour' && ev.current === ev.rounds.length - 1 ? 'The decider: against the team nearest you on the table.' : ''} ${TRACK_BLURBS[r.circuit] ?? ''}`),
        );
        m.button(list, 'Start round', () => g.startGpRound(d.kind), { key: 'start', go: true });
      } else {
        const ready = roundComplete(ev, ev.current);
        col.append(h('h1', `Matchday ${ev.current + 1}`), h('p', 'You sit this one out. The other four race; their results go on the table.'));
        const fx = h('div.fixtures');
        for (const f of r.others) fx.append(fixtureLine(f, ev));
        col.append(fx);
        m.button(list, ready ? 'Continue' : 'Waiting for the other races…', () => (ready ? g.gpAdvance(d.kind) : m.toast('The other races are still running')), { key: 'start', go: ready });
      }
      m.button(list, 'Hangar', () => g.openGpHangar(d.kind), { key: 'hangar' });
      m.button(
        list,
        `Abandon the ${eventName(ev)}`,
        () =>
          confirmDialog(m, `Abandon the ${eventName(ev)}?`, 'Its races so far are lost. Medals and cups already won are kept.', 'Abandon', () => {
            g.abandonGp(d.kind);
            if (!m.popTo('gp')) m.reset('gp', undefined, ['title', 'modes']);
          }),
        { key: 'abandon' },
      );
      col.append(list);
      const side = h('div.panel.standings', h('h2', ev.current > 0 ? `Standings after ${singleRaces(ev) ? 'round' : 'matchday'} ${ev.current}` : 'Standings'), gpTable(ev, ev.current - 1));
      m.root.append(h('div.shade'), m.panes(col, side), m.footer(SELECT, { pad: 'Y', keys: 'Y', label: 'Hangar', press: 'y' }, BACK));
    },
    press(m, key, d) {
      if (key === 'y') {
        g.openGpHangar(d.kind);
        return true;
      }
      return false;
    },
    back(m) {
      if (!m.popTo('gp')) m.pop();
    },
  });

  m.register<GpData>('standings', {
    render(m, d) {
      const ev = g.gpEvent(d.kind);
      if (!ev) return void m.pop();
      const r = ev.rounds[ev.current];
      const ready = roundComplete(ev, ev.current);
      const col = h('div.col.standings-screen');
      col.append(h('div.context', `${eventName(ev)} · ${GP_DIFFICULTY[ev.difficulty]}`), h('h1', singleRaces(ev) ? `After round ${ev.current + 1}` : `After matchday ${ev.current + 1}`));
      const fx = h('div.fixtures');
      for (const f of r.you ? [r.you, ...r.others] : r.others) fx.append(fixtureLine(f, ev));
      col.append(fx);
      const list = h('div.list');
      const last = ev.current >= ev.rounds.length - 1;
      m.button(list, ready ? (last ? 'Final standings' : 'Continue') : 'Waiting for the other races…', () => (ready ? g.gpAdvance(d.kind) : m.toast('The other races are still running')), { key: 'go', go: ready });
      col.append(list);
      const side = h('div.panel.standings', h('h2', 'Standings'), gpTable(ev, ev.current));
      m.root.append(h('div.shade.full'), m.panes(col, side), m.footer(SELECT));
    },
    back() {},
  });

  m.register<GpData & { place: number; medal: string | null }>('award', {
    render(m, d) {
      const ev = g.gpEvent(d.kind);
      if (!ev) return void m.pop();
      const col = h('div.col.gp-award');
      col.append(h('div.context', eventName(ev)), ...awardLines(ev, d.place, d.medal));
      const list = h('div.list');
      m.button(list, 'Back to Grand Prix', () => g.finishGp(d.kind), { key: 'done', go: true });
      col.append(list);
      const side = h('div.panel.standings', h('h2', 'Final standings'), gpTable(ev, ev.rounds.length - 1));
      m.root.append(h('div.shade.full'), m.panes(col, side), m.footer(SELECT));
    },
    back: () => {},
  });
}
