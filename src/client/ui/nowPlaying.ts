// What the hangar's music is playing: a small label in the corner of the
// hangar screens, with the way on to the next track (a tap or click on it,
// M on the keyboard, the right stick pressed on a pad). It comes in as a
// track starts, stays while it plays, and is gone in the quiet between.

import type { Device } from '../input/input';
import { h } from './dom';

export class NowPlaying {
  private readonly layer: HTMLElement;
  private readonly chip: HTMLElement;
  private readonly title = h('span.np-title');
  private readonly key = h('span.key');
  private shown = '';

  constructor(root: HTMLElement, onNext: () => void) {
    this.chip = h('div.now-playing', h('span.np-note', '♪'), this.title, h('span.np-next', this.key, 'Next'));
    this.chip.title = 'On to the next track';
    this.chip.addEventListener('click', (e) => {
      e.stopPropagation();
      onNext();
    });
    this.layer = h('div.ui.np-layer', this.chip);
    this.layer.hidden = true;
    root.append(this.layer);
  }

  /** Each frame: the title playing (null: nothing to show), for the device in hand. */
  update(title: string | null, device: Device): void {
    const key = device === 'pad' ? 'R3' : device === 'keys' ? 'M' : '';
    const state = `${title ?? ''}\n${key}`;
    if (state === this.shown) return;
    const fresh = title !== null && !this.shown.startsWith(`${title}\n`);
    this.shown = state;
    this.layer.hidden = title === null;
    if (title === null) return;
    this.title.textContent = title;
    this.key.textContent = key;
    this.key.hidden = !key;
    if (fresh) {
      // (Comes in again for each new track.)
      this.chip.classList.remove('fresh');
      void this.chip.offsetWidth;
      this.chip.classList.add('fresh');
    }
  }
}
