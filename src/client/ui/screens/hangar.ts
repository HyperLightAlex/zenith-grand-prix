// The Hangar: what is yours whatever team you race for (docs/CUSTOMIZATION.md).
// Your pilot (callsign, portrait, colour) and your own mech of each frame,
// made and changed here for no faction: in the league's hangar, lit in your
// colour. Opened from the Play menu, and from the Paddock (Y) before any race,
// where you pick whether to race your own mech or the stock one.

import { CLASSES, ROLE, ROLE_NAMES, type Role } from '../../../sim/index';
import type { Game } from '../../game/game';
import { LIVERIES, factionName } from '../../render/palette';
import { VICTORY_IDS, VICTORY_NAMES } from '../../render/mech/victoryPoses';
import { openOf } from '../../game/unlocks';
import { h } from '../dom';
import type { Menus } from '../menus';
import { BACK, CHANGE, SELECT } from './common';
import { customName, openCustom } from './custom';
import { frameCard } from './paddock';

const FRAMES: Role[] = [ROLE.FW, ROLE.MF, ROLE.DF];

export function registerHangar(m: Menus, g: Game): void {
  m.register('hangar', {
    render(m) {
      // The bay shows the frame last looked at here.
      const role = g.hangarRole;
      const start = LIVERIES[g.startingFaction()];
      const name = (r: Role) => {
        const b = g.customMech(r);
        return b ? customName(r, b) : `${start.models[r]} (stock)`;
      };
      const card = frameCard(m, g, -1, role, 'Your mechs', name(role));
      const col = h('div.col');
      const list = h('div.list');
      m.button(list, `Pilot: ${g.pilotName}`, () => m.push('pilot'), { key: 'pilot', hint: 'Your callsign, your portrait and your colour' });
      for (const r of FRAMES) {
        const b = g.customMech(r);
        m.button(list, b ? `${ROLE_NAMES[r]}: ${customName(r, b)}` : `${ROLE_NAMES[r]}: make your own ${CLASSES[r].frame}`, () => openCustom(m, g, r), {
          key: `mech-${r}`,
          hint: b ? undefined : `It starts as the ${factionName(start)} ${start.models[r]}: swap its parts for other teams' and paint it`,
        });
      }
      // (Through the poses open: the rest the Grand Prix earns.)
      m.choice(list, 'Victory pose', VICTORY_NAMES[g.victoryPose], (dir) => {
        const open = openOf('pose', VICTORY_IDS, g.progress);
        const i = open.indexOf(g.victoryPose);
        g.setVictoryPose(open[i < 0 ? 0 : (i + dir + open.length) % open.length]);
        m.refresh();
      }, { key: 'pose' });
      m.button(list, 'Done', () => m.pop(), { key: 'done', go: true });
      col.append(
        h('div.context', 'Hangar'),
        card.head,
        h('h1', 'Hangar'),
        h('p', 'Your pilot and your own mechs, whatever team you race for. Before each race, the Paddock picks your team and frame, and whether you race your own mech or the stock one.'),
        list,
        card.info,
      );
      m.root.append(h('div.shade'), card.bay, m.panes(col, h('div.hangar-side', card.kit)), m.footer({ pad: 'D-pad', keys: '↑ ↓', label: 'Choose' }, CHANGE, SELECT, BACK));
    },
    selected(m, key) {
      // On a frame: it in the bay, and its panels.
      const r = /^mech-(\d)$/.exec(key);
      if (!r || Number(r[1]) === g.hangarRole) return;
      g.setHangarRole(Number(r[1]) as Role);
      m.refresh();
    },
  });
}
