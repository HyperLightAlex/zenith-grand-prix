// Grand Prix: the hub (cups and the season), the round briefing, the
// standings after a round, and the award at the end.

import { TRACKS } from '../../../sim/index';
import {
  CUPS,
  GP_DIFFICULTY,
  average,
  eventName,
  isOver,
  playedRounds,
  roundComplete,
  standings,
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

const ORD = ['1st', '2nd', '3rd', '4th', '5th'];
const MEDAL_NAMES: Record<string, string> = { gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };

function emblem(f: number): HTMLElement {
  const el = h('i.emb');
  el.style.backgroundImage = `url(${emblemUrl(f)})`;
  return el;
}

function circuitName(id: string): string {
  return TRACKS.find((t) => t.id === id)?.name ?? id;
}

/** The five-faction table after rounds 0..upTo. */
export function gpTable(ev: GpEvent, upTo: number): HTMLElement {
  const rows = standings(ev, upTo);
  const cup = ev.kind === 'cup';
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

function fixtureLine(f: GpFixture, ev: GpEvent): HTMLElement {
  const a = factionName(LIVERIES[f.a]);
  const b = factionName(LIVERIES[f.b]);
  const r = f.result;
  const score = !r ? 'racing…' : ev.kind === 'cup' ? `${r.points[0]}–${r.points[1]}` : `${r.wins[0]}–${r.wins[1]}`;
  return h('div.fixture' + (f.a === ev.faction ? '.me' : ''), emblem(f.a), h('span', a), h('b', score), h('span', b), emblem(f.b));
}

export function registerGrandPrix(m: Menus, g: Game): void {
  m.register('gp', {
    render(m) {
      const col = h('div.col.gp');
      const list = h('div.list');
      const diff = g.gpDifficulty();
      const medals = g.gpMedals();
      for (const kind of ['cup', 'season'] as GpKind[]) {
        const ev = g.gpEvent(kind);
        const name = kind === 'cup' ? CUPS[0].name : 'Zenith Cup season';
        let note: string;
        if (ev && !isOver(ev)) note = `Continue: round ${Math.min(playedRounds(ev), yourRoundNumber(ev))} of ${playedRounds(ev)}, ${GP_DIFFICULTY[ev.difficulty]}, ${factionName(LIVERIES[ev.faction])}`;
        else if (kind === 'cup') {
          const won = GP_DIFFICULTY.map((d, i) => `${d}: ${medals.cup[i] ? MEDAL_NAMES[medals.cup[i]!] : '–'}`).join(', ');
          note = `Three races, a medal for the top three. ${won}`;
        } else {
          const n = medals.season[diff] ?? 0;
          note = `Five matchdays, best of 3 each. Zenith Cups won at ${GP_DIFFICULTY[diff]}: ${n}`;
        }
        m.button(list, name, () => g.openGp(kind), { key: kind, note });
      }
      m.choice(list, 'Difficulty', GP_DIFFICULTY[diff], (dir) => g.setGpDifficulty((diff + dir + 3) % 3), { key: 'difficulty' });
      for (const kind of ['cup', 'season'] as GpKind[]) {
        const ev = g.gpEvent(kind);
        if (ev && !isOver(ev)) {
          m.button(list, kind === 'cup' ? 'Abandon the cup' : 'Abandon the season', () =>
            confirmDialog(m, kind === 'cup' ? 'Abandon the cup?' : 'Abandon the season?', 'Its races so far are lost. Medals and cups already won are kept.', 'Abandon', () => {
              g.abandonGp(kind);
              m.refresh();
            }),
          { key: 'abandon-' + kind });
        }
      }
      col.append(h('div.context', 'Grand Prix'), h('h1', 'Grand Prix'), h('p', 'Difficulty sets the rival pilots. It applies to a new cup or season; one under way keeps its own.'), list);
      m.root.append(h('div.shade'), col, m.footer(SELECT, CHANGE, BACK));
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
        col.append(
          h('h1', `Round ${yourRoundNumber(ev)} of ${total}`),
          h('div.versus', emblem(ev.faction), h('span', factionName(LIVERIES[ev.faction])), h('b', 'vs'), h('span', factionName(LIVERIES[rival])), emblem(rival)),
          h('p', `${circuitName(r.circuit)}. ${ev.kind === 'cup' ? 'A single race.' : 'Best of 3.'} ${TRACK_BLURBS[r.circuit] ?? ''}`),
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
      const side = h('div.panel.standings', h('h2', ev.current > 0 ? `Standings after ${ev.kind === 'cup' ? 'round' : 'matchday'} ${ev.current}` : 'Standings'), gpTable(ev, ev.current - 1));
      m.root.append(h('div.shade'), col, side, m.footer(SELECT, { pad: 'Y', keys: 'Y', label: 'Hangar', press: 'y' }, BACK));
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
      col.append(h('div.context', `${eventName(ev)} · ${GP_DIFFICULTY[ev.difficulty]}`), h('h1', ev.kind === 'cup' ? `After round ${ev.current + 1}` : `After matchday ${ev.current + 1}`));
      const fx = h('div.fixtures');
      for (const f of r.you ? [r.you, ...r.others] : r.others) fx.append(fixtureLine(f, ev));
      col.append(fx);
      const list = h('div.list');
      const last = ev.current >= ev.rounds.length - 1;
      m.button(list, ready ? (last ? 'Final standings' : 'Continue') : 'Waiting for the other races…', () => (ready ? g.gpAdvance(d.kind) : m.toast('The other races are still running')), { key: 'go', go: ready });
      col.append(list);
      const side = h('div.panel.standings', h('h2', 'Standings'), gpTable(ev, ev.current));
      m.root.append(h('div.shade.full'), col, side, m.footer(SELECT));
    },
    back() {},
  });

  m.register<GpData & { place: number; medal: string | null }>('award', {
    render(m, d) {
      const ev = g.gpEvent(d.kind);
      if (!ev) return void m.pop();
      const col = h('div.col.gp-award');
      let headline: string;
      let line: string;
      if (ev.kind === 'cup') {
        headline = d.medal ? `${MEDAL_NAMES[d.medal]} medal` : `${ORD[d.place - 1]} place`;
        line = d.medal ? `${eventName(ev)} at ${GP_DIFFICULTY[ev.difficulty]}: ${factionName(LIVERIES[ev.faction])} finish ${ORD[d.place - 1]}.` : `${factionName(LIVERIES[ev.faction])} finish ${ORD[d.place - 1]}: a medal needs the top three.`;
      } else {
        headline = d.place === 1 ? 'The Zenith Cup' : `${ORD[d.place - 1]} in the season`;
        line = d.place === 1 ? `${factionName(LIVERIES[ev.faction])} top the table at ${GP_DIFFICULTY[ev.difficulty]}. The cup is yours.` : `${factionName(LIVERIES[ev.faction])} finish ${ORD[d.place - 1]}. Only the top of the table takes the cup.`;
      }
      const badge = h('div.medal.' + (ev.kind === 'season' ? (d.place === 1 ? 'cup' : 'none') : (d.medal ?? 'none')));
      col.append(h('div.context', eventName(ev)), badge, h('h1', headline), h('p', line));
      const list = h('div.list');
      m.button(list, 'Back to Grand Prix', () => g.finishGp(d.kind), { key: 'done', go: true });
      col.append(list);
      const side = h('div.panel.standings', h('h2', 'Final standings'), gpTable(ev, ev.rounds.length - 1));
      m.root.append(h('div.shade.full'), col, side, m.footer(SELECT));
    },
    back: () => {},
  });
}
