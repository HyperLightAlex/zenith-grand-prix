// Video settings: the picture as the player likes it. Everything applies at
// once, behind the menu, and is kept on this device (see video.ts).

import type { Game } from '../../game/game';
import { canFullscreen, isFullscreen, toggleFullscreen } from '../../fullscreen';
import { video } from '../../video';
import { h } from '../dom';
import type { Menus } from '../menus';
import { BACK, CHANGE } from './common';

const ABOUT: Record<string, string> = {
  panels: 'The panel lines cut into the mechs\' armor.',
  crt: 'A tube TV: scanlines, the phosphor mask, colour that bleeds along the line, and the tube\'s dark corners.',
  drawings: 'How often the mechs\' poses and the effects are redrawn. 12 is animation on twos, as the series was drawn; 30 is smoother. The race itself always runs at full speed.',
  aspect: '16:9 fills the screen. 4:3 is the shape of an old TV, with the picture boxed in the middle. On a phone held upright the menus fill the screen either way.',
  full: 'The game on the whole screen, without the browser round it. On a keyboard, F does the same.',
};

export function registerVideo(m: Menus, g: Game): void {
  // What the highlighted setting does.
  const about = h('div.match-blurb');
  const say = (key: string) => (about.textContent = ABOUT[key] ?? 'Changes show at once and are kept on this device.');
  m.register('video', {
    render(m) {
      const col = h('div.col.video');
      const list = h('div.list');
      m.choice(list, 'Armor panel lines', video.panels ? 'On' : 'Off', () => g.setVideo({ panels: !video.panels }), { key: 'panels' });
      m.choice(list, 'CRT screen', video.crt ? 'On' : 'Off', () => g.setVideo({ crt: !video.crt }), { key: 'crt' });
      const steps = g.drawingsPerSecond;
      m.choice(list, 'Animation', `${steps} drawings a second`, () => g.setDrawings(steps === 30 ? 12 : 30), {
        key: 'drawings',
        locked: g.lookOn() ? null : 'The plain look always animates smoothly',
      });
      m.choice(list, 'Screen shape', video.aspect === 'classic' ? '4:3' : '16:9', () => g.setVideo({ aspect: video.aspect === 'classic' ? 'wide' : 'classic' }), { key: 'aspect' });
      if (canFullscreen()) m.choice(list, 'Full screen', isFullscreen() ? 'On' : 'Off', () => void toggleFullscreen().then(() => m.refresh()), { key: 'full' });
      m.button(list, 'Done', () => m.pop(), { key: 'done', go: true });
      col.append(h('div.context', 'Settings'), h('h1', 'Video'), list, about);
      m.root.append(h('div.shade'), m.panes(col), m.footer({ pad: 'D-pad', keys: '↑ ↓', label: 'Choose' }, CHANGE, BACK));
    },
    selected: (_m, key) => say(key),
  });
}
