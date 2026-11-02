// Photo mode's screen: how to pose the camera (for the device in hand), the
// buttons to take the picture, switch the look and go back, and a flash and
// a word when a picture is saved. Hidden by hand, it leaves only the picture.

import type { Device } from '../input/input';
import type { PhotoAction } from '../game/photo';
import { h, setClass, setText } from './dom';

const HINTS: Record<Device, Array<[string, string]>> = {
  pad: [['L stick', 'turn'], ['RT LT', 'zoom'], ['LB RB', 'lens'], ['◀ ▶', 'tilt'], ['Y', 'look'], ['X', 'hide this'], ['A', 'take photo'], ['B', 'back']],
  keys: [['W A S D', 'turn (or drag)'], ['Z C', 'zoom (or wheel)'], ['Q E', 'lens'], ['2 4', 'tilt'], ['Y', 'look'], ['X', 'hide this'], ['Enter', 'take photo'], ['Esc', 'back']],
  touch: [['Drag', 'turn'], ['Pinch', 'zoom']],
};

export class PhotoPanel {
  readonly root = h('div.ui.photo');
  private hints = h('div.photo-hints');
  private toast = h('div.photo-toast');
  private flash = h('div.photo-flash');
  private device: Device | null = null;
  private toastT = 0;

  constructor(parent: HTMLElement, act: (a: PhotoAction) => void) {
    const btn = (label: string, a: PhotoAction, cls = '') => {
      const el = h('div.photo-btn' + cls, label);
      el.addEventListener('pointerdown', (e) => (e.stopPropagation(), act(a)));
      return el;
    };
    this.root.append(this.flash, h('div.photo-bar', this.hints, h('div.photo-btns', btn('Look', 'look'), btn('Hide', 'hints'), btn('Back', 'back'), btn('Take photo', 'take', '.go'))), this.toast);
    this.toast.hidden = true;
    this.root.hidden = true;
    parent.append(this.root);
  }

  show(on: boolean, device: Device, hintsHidden: boolean): void {
    this.root.hidden = !on;
    if (!on) return;
    setClass(this.root, 'bare', hintsHidden);
    if (device !== this.device) {
      this.device = device;
      this.hints.replaceChildren(...HINTS[device].map(([k, what]) => h('span', h('span.key', k), what)));
    }
  }

  /** The shutter: a flash, and what was saved. */
  taken(name: string): void {
    this.flash.classList.remove('go');
    void this.flash.offsetWidth;
    this.flash.classList.add('go');
    setText(this.toast, `Saved ${name}`);
    this.toast.hidden = false;
    this.toastT = 2.5;
  }

  failed(why: string): void {
    setText(this.toast, why);
    this.toast.hidden = false;
    this.toastT = 3;
  }

  update(dt: number): void {
    if (this.toastT <= 0) return;
    this.toastT -= dt;
    if (this.toastT <= 0) this.toast.hidden = true;
  }
}
