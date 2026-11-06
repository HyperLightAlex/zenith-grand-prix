// The podium's screen: who is on it, a card each as they take their places
// (third, second, then the winners), an event's medal on each card that has
// one; then the award, as the winners strike their poses (your medal or the
// cup, or a match's MVP); and what to press: on to the readout, or photo
// mode.

import type { Device } from '../input/input';
import { h, setClass } from './dom';
import { medalBadgeUrl } from './factionArt';

export interface PodiumCard {
  name: string;
  /** The frame and the team ("Rampart, Solstice"). */
  detail: string;
  css: string;
  emblem: string;
  you: boolean;
  /** Seconds after the podium goes up that the card shows. */
  at: number;
  /** An event's medal for the place, or none. */
  medal?: 'platinum' | 'gold' | 'silver' | 'bronze' | '';
}

/** The award as it comes up: your medal or the cup (or neither), its title and a line under it. */
export interface PodiumAward {
  badge: 'platinum' | 'gold' | 'silver' | 'bronze' | 'cup' | '';
  title: string;
  line: string;
  /** Seconds after the podium goes up. */
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
  private award = h('div.podium-award');
  private awardAt = Infinity;
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
    this.root.append(this.title, this.award, this.cards, h('div.podium-btns', btn(this.photoKey, h('span', 'Photo mode'), () => act.photo()), this.go));
    this.root.hidden = true;
    parent.append(this.root);
  }

  /** Up, with its cards (first to third), the award, and what going on is called. */
  open(title: string, cards: readonly PodiumCard[], goLabel: string, device: Device, at = 0, award: PodiumAward | null = null): void {
    this.title.textContent = title;
    this.goLabel.textContent = goLabel;
    this.t = at;
    this.shown = [];
    this.cards.replaceChildren();
    cards.forEach((c, place) => {
      const emblem = h<'img'>('img.emblem');
      emblem.src = c.emblem;
      emblem.alt = '';
      const medal = h('i.medal.' + (c.medal || 'none'));
      if (c.medal) medal.style.setProperty('--badge', `url(${medalBadgeUrl(c.medal)})`);
      const el = h(
        'div.podium-card' + (c.you ? '.you' : ''),
        h('b.place', String(place + 1)),
        emblem,
        h('span.who', h('b', c.name + (c.you ? ' (you)' : '')), h('small', c.detail)),
        c.medal ? medal : '',
      );
      el.style.setProperty('--side', c.css);
      this.cards.append(el);
      this.shown.push({ el, at: c.at });
    });
    this.award.replaceChildren();
    this.awardAt = Infinity;
    if (award) {
      const badge = h('i.medal.' + (award.badge || 'none'));
      if (award.badge) badge.style.setProperty('--badge', `url(${medalBadgeUrl(award.badge === 'cup' ? 'gold' : award.badge)})`);
      this.award.append(award.badge ? badge : '', h('span', h('b', award.title), h('small', award.line)));
      this.awardAt = award.at;
    }
    setClass(this.award, 'has-badge', !!award?.badge);
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
    setClass(this.award, 'in', this.t >= this.awardAt);
    setClass(this.go, 'ready', this.t >= 1.5);
  }
}
