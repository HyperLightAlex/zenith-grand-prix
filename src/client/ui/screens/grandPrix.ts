// Grand Prix: the hub (the cups, the Grand Tour and the season), the round
// briefing, the standings after a round, and the award at the end.

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
import { h } from '../dom';
import { emblemUrl } from '../factionArt';
import { TRACK_BLURBS, type Menus } from '../menus';
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

export function registerGrandPrix(m: Menus, g: Game): void {
  m.register('gp', {
    render(m) {
      const col = h('div.col.gp');
      const list = h('div.list');
      const diff = g.gpDifficulty();
      const medals = g.gpMedals();
      const won = (id: string) => GP_DIFFICULTY.map((d, i) => `${d}: ${medals.byCup[id]?.[i] ? MEDAL_NAMES[medals.byCup[id][i]!] : '–'}`).join(', ');
      const under = (ev: GpEvent) => `Continue: round ${Math.min(playedRounds(ev), yourRoundNumber(ev))} of ${playedRounds(ev)}, ${GP_DIFFICULTY[ev.difficulty]}, ${factionName(LIVERIES[ev.faction])}`;
      // The cups, each open once the one before it has given a medal. One is under way at a time.
      const cupEv = g.gpEvent('cup');
      const going = cupEv && !isOver(cupEv) ? cupEv : null;
      CUPS.forEach((c, i) => {
        const open = cupOpen(c.id, medals.byCup);
        const mine = cupEv && cupEv.cup === c.id ? cupEv : null;
        const note = mine && !isOver(mine) ? under(mine) : !open ? `Opens with a medal in the ${CUPS[i - 1].name}` : `${c.circuits.map(circuitName).join(', ')}. ${won(c.id)}`;
        m.button(
          list,
          c.name,
          () => {
            if (going && going.cup !== c.id) {
              confirmDialog(m, `Put the ${eventName(going)} away?`, `One cup at a time: the ${eventName(going)} under way is abandoned (its races so far are lost) and the ${c.name} starts. Medals already won are kept.`, `Start the ${c.name}`, () => {
                g.abandonGp('cup');
                g.openGp('cup', c.id);
              });
            } else g.openGp('cup', c.id);
          },
          { key: 'cup-' + c.id, note, locked: open ? null : `A medal in the ${CUPS[i - 1].name} opens it` },
        );
      });
      const tour = g.gpEvent('tour');
      const tourIsOpen = tourOpen(medals.byCup);
      m.button(list, 'Grand Tour', () => g.openGp('tour'), {
        key: 'tour',
        locked: tourIsOpen || tour ? null : 'A medal in each of the three cups opens it',
        note: tour && !isOver(tour) ? under(tour) : !tourIsOpen ? 'Opens with a medal in each of the three cups' : `Nine races, every circuit from Meridian to Zenith Ring, the last a decider. ${won(TOUR_ID)}`,
      });
      const season = g.gpEvent('season');
      m.button(list, 'Zenith Cup season', () => g.openGp('season'), {
        key: 'season',
        note: season && !isOver(season) ? under(season) : `Ten matchdays: every other faction twice, best of 3. Zenith Cups won at ${GP_DIFFICULTY[diff]}: ${medals.season[diff] ?? 0}`,
      });
      m.choice(list, 'Difficulty', GP_DIFFICULTY[diff], (dir) => g.setGpDifficulty((diff + dir + 3) % 3), { key: 'difficulty' });
      for (const kind of ['cup', 'tour', 'season'] as GpKind[]) {
        const ev = g.gpEvent(kind);
        if (ev && !isOver(ev)) {
          const name = eventName(ev);
          m.button(
            list,
            `Abandon the ${name}`,
            () =>
              confirmDialog(m, `Abandon the ${name}?`, 'Its races so far are lost. Medals and cups already won are kept.', 'Abandon', () => {
                g.abandonGp(kind);
                m.refresh();
              }),
            { key: 'abandon-' + kind },
          );
        }
      }
      col.append(h('div.context', 'Grand Prix'), h('h1', 'Grand Prix'), h('p', 'Difficulty sets the rival pilots. It applies to a new cup, Grand Tour or season; one under way keeps its own.'), list);
      m.root.append(h('div.shade'), m.panes(col), m.footer(SELECT, CHANGE, BACK));
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
