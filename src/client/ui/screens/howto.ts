// How to play: the tutorial (to play or play again), a primer on each frame
// (what it is for, its weapons and abilities, how it scores), and the
// controls. A primer stands in the hangar, the frame in your colours in the
// bay; opened from the pause menu it is over the race instead.

import { CLASSES, ROLE, ROLE_NAMES, type Role } from '../../../sim/index';
import type { Game } from '../../game/game';
import { PRIMERS } from '../../game/primers';
import { h } from '../dom';
import type { Menus } from '../menus';
import { BACK, CHANGE, SELECT } from './common';
import { frameCard } from './garage';

export interface PrimerData {
  role: Role;
  /** Opened from the pause menu: no hangar, and no going off to race. */
  inRace?: boolean;
}

const ROLES: Role[] = [ROLE.FW, ROLE.MF, ROLE.DF];

export function registerHowTo(m: Menus, g: Game): void {
  m.register('howto', {
    render(m) {
      const col = h('div.col.modes');
      const list = h('div.list');
      m.button(list, 'Tutorial', () => g.startTutorial(), {
        key: 'tutorial',
        note: g.tutorialDone ? 'The guided first race, to play again' : 'Start here: a guided first race that shows you the controls',
      });
      for (const role of ROLES) {
        m.button(list, ROLE_NAMES[role], () => m.push<PrimerData>('primer', { role }), { key: `frame${role}`, note: PRIMERS[role].line });
      }
      m.button(list, 'Controls', () => m.push('controls'), { key: 'controls', note: 'Every button, on a pad, the keys and the touch screen' });
      col.append(h('h1', 'How to play'), list);
      m.root.append(h('div.shade'), m.panes(col), m.footer(SELECT, BACK));
    },
  });

  m.register<PrimerData>('primer', {
    render(m, d) {
      const role = d.role;
      const p = PRIMERS[role];
      const team = g.loadout.team;
      const card = frameCard(m, g, team, role, 'Frame guide');
      const col = h('div.col.primer');
      const list = h('div.list');
      m.choice(
        list,
        'Frame',
        `${ROLE_NAMES[role]} (${CLASSES[role].frame})`,
        (dir) => {
          d.role = ROLES[(ROLES.indexOf(role) + dir + ROLES.length) % ROLES.length];
          g.preview({ team, role: d.role });
          m.refresh();
        },
        { key: 'frame' },
      );
      if (!d.inRace) {
        m.button(list, `Race the ${ROLE_NAMES[role]} in Free Play`, () => {
          g.setLoadout({ team, role });
          g.openFreePlay();
        }, { key: 'race' });
      }
      const job = h('ul.primer-job');
      for (const line of p.job) job.append(h('li', line));
      col.append(h('div.context', d.inRace ? 'Paused' : 'How to play'), card.head, h('h1', ROLE_NAMES[role]), h('p', p.synopsis), job, list, card.info);
      // How it scores, under the weapons and abilities.
      const score = h('div.primer-score', h('h2', 'How it scores'), h('div', p.scoreNote));
      if (p.awards.length) {
        const awards = h('div.primer-awards');
        for (const [what, pts] of p.awards) awards.append(h('div.primer-award', h('span', what), h('b', `+${pts}`)));
        score.append(awards);
      }
      card.kit.append(score);
      m.root.append(h('div.shade' + (d.inRace ? '.full' : '')), d.inRace ? '' : card.bay, m.panes(col, h('div.hangar-side', card.kit)), m.footer(CHANGE, BACK));
    },
  });
}
