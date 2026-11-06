// Records: your career's totals (Free Play and the Grand Prix), and the
// fastest speed lap and race on each circuit in each frame (game/records.ts).
// Each speed lap record keeps its lap as a ghost, for time trials.

import { ROLE, ROLE_NAMES, TRACKS } from '../../../sim/index';
import type { Game } from '../../game/game';
import { fmtRecord } from '../../game/records';
import { h } from '../dom';
import type { Menus } from '../menus';
import { BACK, SELECT, confirmDialog } from './common';

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((100 * n) / d)}%` : '–');

export function registerRecords(m: Menus, g: Game): void {
  m.register('records', {
    render(m) {
      const book = g.records;
      const c = book.data.career;
      const col = h('div.col.records');
      col.append(h('div.context', 'Free Play and the Grand Prix, on this device'), h('h1', 'Records'));
      // The career.
      const medals = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
      for (const cup of Object.values(g.progress.byCup)) for (const medal of Object.values(cup)) if (medal in medals) medals[medal as keyof typeof medals]++;
      const cups = Object.values(g.progress.season).reduce((a, b) => a + b, 0);
      const sprint = { platinum: 0, gold: 0, silver: 0, bronze: 0 };
      for (const cup of Object.values(g.progress.sprint ?? {})) for (const medal of Object.values(cup)) if (medal in sprint) sprint[medal as keyof typeof sprint]++;
      const facts: Array<[string, string]> = [
        ['Races', String(c.races)],
        ['Wins', c.races ? `${c.wins} (${pct(c.wins, c.races)})` : '0'],
        ['In the first three', String(c.podiums)],
        ['Points', String(c.points)],
        ['Support points', String(c.support)],
        ['Knockouts', String(c.kos)],
        ['Knocked out', String(c.out)],
        ['MVP of a match', String(c.mvps)],
        ['Grand Prix medals', `${medals.platinum ? `${medals.platinum} platinum, ` : ''}${medals.gold} gold, ${medals.silver} silver, ${medals.bronze} bronze`],
        ['Zenith Cups', String(cups)],
        ['Sprint series medals', `${sprint.platinum ? `${sprint.platinum} platinum, ` : ''}${sprint.gold} gold, ${sprint.silver} silver, ${sprint.bronze} bronze`],
      ];
      const dl = h('div.career');
      for (const [k, v] of facts) dl.append(h('span', k), h('b', v));
      col.append(dl);
      const roles = h('div.career.roles');
      [ROLE.FW, ROLE.MF, ROLE.DF].forEach((r) => {
        const x = c.byRole[r] ?? { races: 0, wins: 0 };
        roles.append(h('span', ROLE_NAMES[r]), h('b', x.races ? `${x.races} ${x.races === 1 ? 'race' : 'races'}, ${x.wins} won` : 'No races yet'));
      });
      col.append(h('h2', 'By frame'), roles);
      const list = h('div.list');
      m.button(list, 'Back', () => m.pop(), { key: 'back', go: true });
      m.button(
        list,
        'Clear records',
        () =>
          confirmDialog(m, 'Clear your records?', 'Every lap and race record, its ghost, and the career totals go. Grand Prix medals and cups stay.', 'Clear', () => {
            book.clear();
            m.refresh();
          }),
        { key: 'clear', note: 'Medals and cups stay' },
      );
      col.append(list);

      // The circuits: the fastest speed lap in each frame, the race under it, the wins.
      const side = h('div.panel.records-table');
      side.append(h('h2', 'Fastest speed laps'), h('p.note', 'The third lap, flat out. Each is kept as a ghost to race against in a time trial.'));
      const table = h<'table'>('table.records');
      const head = h<'tr'>('tr', h<'th'>('th', 'Circuit'));
      for (const r of [ROLE.FW, ROLE.MF, ROLE.DF]) head.append(h<'th'>('th.num', ROLE_NAMES[r]));
      head.append(h<'th'>('th.num', 'Wins'));
      table.append(head);
      for (const t of TRACKS) {
        const tr = h<'tr'>('tr', h<'td'>('td.who', t.name));
        for (const r of [ROLE.FW, ROLE.MF, ROLE.DF]) {
          const lap = book.lap(t.id, r);
          const race = book.raceBest(t.id, r);
          tr.append(h<'td'>('td.num' + (lap ? '' : '.none'), lap ? fmtRecord(lap.time) : '–', race ? h('small', `race ${fmtRecord(race.time)}`) : null));
        }
        const bt = c.byTrack[t.id];
        tr.append(h<'td'>('td.num', bt ? `${bt.wins}/${bt.races}` : '–'));
        table.append(tr);
      }
      side.append(table);
      m.root.append(h('div.shade'), m.panes(col, side), m.footer(SELECT, BACK));
    },
  });
}
