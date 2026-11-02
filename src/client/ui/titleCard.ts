// The circuit's title card, over the flight above it before a race: what is
// being raced (the event, the round), the circuit's name large, its laps and
// length, and who is racing whom.

import { h, setClass } from './dom';

export interface TitleCardSides {
  name: string;
  emblem: string;
  css: string;
}

export class TitleCard {
  readonly root = h('div.ui.titlecard');
  private event = h('div.tc-event');
  private name = h('div.tc-name');
  private facts = h('div.tc-facts');
  private sides = h('div.tc-sides');
  private skip = h('div.tc-skip');

  constructor(parent: HTMLElement) {
    this.root.append(h('div.tc-band', this.event, this.name, this.facts, this.sides), this.skip);
    this.root.hidden = true;
    parent.append(this.root);
  }

  show(c: { event: string; circuit: string; facts: string; sides: readonly TitleCardSides[]; skip: string }): void {
    this.event.textContent = c.event;
    this.name.textContent = c.circuit;
    this.facts.textContent = c.facts;
    this.sides.replaceChildren();
    c.sides.forEach((s, i) => {
      if (i > 0) this.sides.append(h('span.tc-vs', 'vs'));
      const em = h<'img'>('img');
      em.src = s.emblem;
      em.alt = '';
      const side = h('span.tc-side', em, h('b', s.name));
      side.style.setProperty('--side', s.css);
      this.sides.append(side);
    });
    this.skip.textContent = c.skip;
    this.skip.hidden = !c.skip;
    this.root.hidden = false;
    setClass(this.root, 'out', false);
    // (Drawn once off, so its entrance runs.)
    setClass(this.root, 'in', false);
    void this.root.offsetWidth;
    setClass(this.root, 'in', true);
  }

  /** Away, with its exit. */
  hide(): void {
    if (this.root.hidden) return;
    setClass(this.root, 'out', true);
    window.setTimeout(() => {
      if (this.root.classList.contains('out')) this.root.hidden = true;
    }, 350);
  }
}
