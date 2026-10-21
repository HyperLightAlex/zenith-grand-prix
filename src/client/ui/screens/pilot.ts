// The Pilot screen, off the hangar: who you are on the grid. Your callsign
// and portrait are worn by your seat everywhere it shows (the radio, the
// target panel, the results, the hangar's card), offline and online.

import { PORTRAITS } from '../../../net/protocol';
import type { Game } from '../../game/game';
import { LIVERIES } from '../../render/palette';
import { h } from '../dom';
import { emblemUrl, faceUrl } from '../factionArt';
import type { Menus } from '../menus';
import { BACK, CHANGE, SELECT } from './common';

export function registerPilot(m: Menus, g: Game): void {
  m.register('pilot', {
    render(m) {
      const team = g.loadout.team;
      const role = g.loadout.role;
      const livery = LIVERIES[team] ?? LIVERIES[0];
      const p = g.portrait;
      const chosen = g.callsign !== '';
      const pick = (i: number) => {
        g.setPortrait(((i % PORTRAITS) + PORTRAITS) % PORTRAITS);
        m.refresh();
      };

      // The hangar computer's card (the anime look): your face and callsign.
      const emblem = h('i');
      emblem.style.backgroundImage = `url(${emblemUrl(team)})`;
      const face = h('i');
      face.style.backgroundImage = `url(${faceUrl(team, role, p)})`;
      const head = h(
        'div.hh',
        h('div.hh-bar', h('span', `${livery.name.replace('Team ', '')} hangar`), h('span', 'Pilot record')),
        h('div.hh-name', emblem, h('b', g.pilotName), h('span', chosen ? 'Your callsign' : 'Made up for you: change it'), h('div.hh-pilot', face, h('span', `Face ${p + 1}`))),
      );

      const col = h('div.col');
      const list = h('div.list');
      m.choice(list, 'Portrait', `${p + 1} of ${PORTRAITS}`, (dir) => pick(p + dir), { key: 'portrait' });
      m.button(list, `Callsign: ${g.pilotName}`, () => g.askCallsign(undefined, 'The name on your seat: the radio, the results, and online. 3 to 16 characters.'), {
        key: 'callsign',
        hint: chosen ? undefined : 'Made up for you until you pick one',
      });
      m.button(list, 'Done', () => m.pop(), { key: 'done', go: true });
      col.append(h('div.context', 'Hangar'), head, h('h1', 'Pilot'), h('p', 'Your seat wears your callsign and portrait on the radio, the target panel and the results, offline and online.'), list);

      // Every portrait, to pick from by sight (a tap or a click picks one).
      const faces = h('div.faces');
      for (let i = 0; i < PORTRAITS; i++) {
        const f = h('i.face' + (i === p ? '.on' : ''));
        f.style.backgroundImage = `url(${faceUrl(team, role, i)})`;
        f.title = `Face ${i + 1}`;
        f.addEventListener('click', (e) => {
          e.stopPropagation();
          g.audio.play('ui_select');
          pick(i);
        });
        faces.append(f);
      }
      const gallery = h('div.kit.pilot-gallery', h('h2', 'Portraits'), faces);
      m.root.append(h('div.shade'), m.panes(col, h('div.hangar-side', gallery)), m.footer({ pad: 'D-pad', keys: '↑ ↓', label: 'Choose' }, CHANGE, SELECT, BACK));
    },
  });
}
