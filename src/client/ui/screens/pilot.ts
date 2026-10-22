// The Pilot screen, off the hangar: who you are on the grid. Your callsign
// and portrait are worn by your seat everywhere it shows (the radio, the
// target panel, the results, the hangar's card), offline and online; your
// colour where you fly for no faction (a Sprint): your mech's lights, your
// name plate, your line in the standings and your seat in a room.

import { PILOT_COLOURS, PILOT_COLOUR_NAMES, PORTRAITS, portraitColour } from '../../../net/protocol';
import type { Game } from '../../game/game';
import { LIVERIES } from '../../render/palette';
import { h, setClass } from '../dom';
import { colourCss } from '../sides';
import { emblemUrl, faceUrl } from '../factionArt';
import type { Menus } from '../menus';
import { BACK, CHANGE, SELECT } from './common';

export function registerPilot(m: Menus, g: Game): void {
  m.register('pilot', {
    render(m) {
      const team = g.loadout.team;
      const role = g.loadout.role;
      const livery = LIVERIES[team] ?? LIVERIES[0];
      const chosen = g.callsign !== '';

      // The hangar computer's card (the anime look): your face and callsign.
      const emblem = h('i');
      emblem.style.backgroundImage = `url(${emblemUrl(team)})`;
      const face = h('i');
      const faceName = h('span');
      const head = h(
        'div.hh',
        h('div.hh-bar', h('span', `${livery.name.replace('Team ', '')} hangar`), h('span', 'Pilot record')),
        h('div.hh-name', emblem, h('b', g.pilotName), h('span', chosen ? 'Your callsign' : 'Made up for you: change it'), h('div.hh-pilot', face, faceName)),
      );

      // Every portrait, to pick from by sight.
      const faces = h('div.faces');
      const cells: HTMLElement[] = [];
      for (let i = 0; i < PORTRAITS; i++) {
        const f = h('i.face');
        f.style.backgroundImage = `url(${faceUrl(team, role, i)})`;
        f.title = `Face ${i + 1}`;
        cells.push(f);
        faces.append(f);
      }

      /** Wear a portrait: only what shows it changes. */
      const wear = (i: number) => {
        const p = ((i % PORTRAITS) + PORTRAITS) % PORTRAITS;
        g.setPortrait(p);
        show();
      };
      const show = () => {
        const p = g.portrait;
        face.style.backgroundImage = `url(${faceUrl(team, role, p)})`;
        faceName.textContent = `Face ${p + 1}`;
        m.update('portrait', { value: `${p + 1} of ${PORTRAITS}` });
        cells.forEach((c, i) => setClass(c, 'on', i === p));
        // The first swatch follows the portrait.
        auto.style.setProperty('--c', colourCss(portraitColour(p)));
        auto.style.setProperty('--s', colourCss(portraitColour(p)));
        const name = PILOT_COLOUR_NAMES[g.pilotColour];
        m.update('colour', { value: g.colourFromPortrait ? `${name}, your portrait's` : name });
        tints.forEach((c, i) => setClass(c, 'on', i === tintOn()));
      };
      const pickFace = m.grid({ cells, on: () => g.portrait, set: wear });

      // Your colour: your portrait's (the first swatch, which follows it), or one picked.
      const colours = h('div.swatches.colours');
      const swatch = (i: number, follows = false) => {
        const el = h('i.swatch' + (follows ? '.follow' : ''));
        el.style.setProperty('--c', colourCss(i));
        el.style.setProperty('--s', colourCss(i));
        el.title = follows ? "Your portrait's" : PILOT_COLOUR_NAMES[i];
        return el;
      };
      const auto = swatch(portraitColour(g.portrait), true);
      const tints = [auto, ...PILOT_COLOURS.map((_, i) => swatch(i))];
      colours.append(...tints);
      const tintOn = () => (g.colourFromPortrait ? 0 : g.pilotColour + 1);
      const tint = (k: number) => {
        const n = tints.length;
        g.setPilotColour((((k % n) + n) % n) - 1);
        show();
      };
      const pickColour = m.grid({ cells: tints, on: tintOn, set: tint });

      const col = h('div.col');
      const list = h('div.list');
      m.choice(list, 'Portrait', '', (dir) => wear(g.portrait + dir), { key: 'portrait', open: pickFace });
      m.choice(list, 'Colour', '', (dir) => tint(tintOn() + dir), { key: 'colour', open: pickColour });
      m.button(list, `Callsign: ${g.pilotName}`, () => g.askCallsign(undefined, 'The name on your seat: the radio, the results, and online. 3 to 16 characters.'), {
        key: 'callsign',
        hint: chosen ? undefined : 'Made up for you until you pick one',
      });
      m.button(list, 'Done', () => m.pop(), { key: 'done', go: true });
      col.append(h('div.context', 'Hangar'), head, h('h1', 'Pilot'), h('p', 'Your seat wears your callsign and portrait on the radio, the target panel and the results, offline and online. In a Sprint you fly for no faction: your colour lights your mech and marks your name.'), list);

      const gallery = h('div.kit.pilot-gallery', h('h2', 'Portraits'), faces, h('h2', 'Colour'), colours);
      m.root.append(h('div.shade'), m.panes(col, h('div.hangar-side', gallery)), m.footer({ pad: 'D-pad', keys: '↑ ↓', label: 'Choose' }, CHANGE, SELECT, BACK));
      show();
    },
  });
}
