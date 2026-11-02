// The podium's screen: who is on it, a card each as they take their places
// (third, second, then the winner), and what to press: on to the results,
// or photo mode.

import type { Device } from '../input/input';
import { h, setClass } from './dom';

export interface PodiumCard {
  name: string;
  /** The frame and the team ("Rampart, Solstice"). */
  detail: string;
  css: string;
  emblem: string;
  you: boolean;
  /** Seconds after the podium goes up that the card shows. */
  at: number;
}

const KEYS: Record<Device, { go: string; photo: string }> = {
  pad: { go: 'A', photo: 'X' },
  keys: { go: 'Enter', photo: 'X' },
  touch: { go: '', photo: '' },
};

export class PodiumPanel {
  readonly root = h('div.ui.podium');
  private title = h('div.podium-title', '');
  private cards = h('div.podium-cards');
  private go: HTMLElement;
  private goKey = h('span.key', '');
  private goLabel = h('span', 'Results');
  private photoKey = h('span.key', '');
  private shown: Array<{ el: HTMLElement; at: number }> = [];
  private t = 0;

  constructor(parent: HTMLElement, act: { go(): void; photo(): void }) {
    const btn = (key: HTMLElement, label: HTMLElement, run: () => void, cls = '') => {
      const el = h('div.podium-btn' + cls, key, label);
      el.addEventListener('pointerdown', (e) => (e.stopPropagation(), run()));
      return el;
    };
    this.go = btn(this.goKey, this.goLabel, () => act.go(), '.go');
    this.root.append(this.title, this.cards, h('div.podium-btns', btn(this.photoKey, h('span', 'Photo mode'), () => act.photo()), this.go));
    this.root.hidden = true;
    parent.append(this.root);
  }

  /** Up, with its cards (first to third) and what going on is called. */
  open(title: string, cards: readonly PodiumCard[], goLabel: string, device: Device, at = 0): void {
    this.title.textContent = title;
    this.goLabel.textContent = goLabel;
    this.t = at;
    this.shown = [];
    this.cards.replaceChildren();
    cards.forEach((c, place) => {
      const emblem = h<'img'>('img.emblem');
      emblem.src = c.emblem;
      emblem.alt = '';
      const el = h(
        'div.podium-card' + (c.you ? '.you' : ''),
        h('b.place', String(place + 1)),
        emblem,
        h('span.who', h('b', c.name + (c.you ? ' (you)' : '')), h('small', c.detail)),
      );
      el.style.setProperty('--side', c.css);
      this.cards.append(el);
      this.shown.push({ el, at: c.at });
    });
    this.setDevice(device);
    this.root.hidden = false;
    this.update(0);
  }

  close(): void {
    this.root.hidden = true;
  }

  setDevice(d: Device): void {
    this.goKey.textContent = KEYS[d].go;
    this.photoKey.textContent = KEYS[d].photo;
    this.goKey.hidden = !KEYS[d].go;
    this.photoKey.hidden = !KEYS[d].photo;
  }

  update(dt: number): void {
    if (this.root.hidden) return;
    this.t += dt;
    for (const s of this.shown) setClass(s.el, 'in', this.t >= s.at);
    setClass(this.go, 'ready', this.t >= 1.5);
  }
}
