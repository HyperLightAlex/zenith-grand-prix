// While a race loads: the circuit being raced, over the dark, and how far its
// loading has got, so the race opens on a circuit that is all there (its
// titan, its painted textures, every shader ready) rather than filling in
// during the flight over it. It gives way to the flight's title card, the
// same band in the same place.

import { h, setClass } from './dom';

export class LoadingCard {
  readonly root = h('div.ui.loadcard');
  private event = h('div.tc-event');
  private name = h('div.tc-name');
  private what = h('div.lc-what');
  private fill = h('i');
  private bar = h('div.lc-bar', this.fill);
  private shownAt = 0;

  constructor(parent: HTMLElement) {
    this.bar.setAttribute('role', 'progressbar');
    this.bar.setAttribute('aria-valuemin', '0');
    this.bar.setAttribute('aria-valuemax', '100');
    this.root.append(h('div.tc-band', this.event, this.name, this.what, this.bar));
    this.root.hidden = true;
    parent.append(this.root);
  }

  get showing(): boolean {
    return !this.root.hidden && !this.root.classList.contains('out');
  }

  show(c: { event: string; circuit: string }): void {
    this.event.textContent = c.event;
    this.name.textContent = c.circuit;
    this.progress(0, 'Loading the circuit');
    this.root.hidden = false;
    setClass(this.root, 'out', false);
    this.shownAt = performance.now();
  }

  /** How far it has got (0 to 1), and what it is doing. */
  progress(f: number, what?: string): void {
    const pct = Math.round(Math.max(0, Math.min(1, f)) * 100);
    this.fill.style.width = `${pct}%`;
    this.bar.setAttribute('aria-valuenow', String(pct));
    if (what !== undefined) this.what.textContent = what;
  }

  /**
   * Away, fading, once it has been up long enough to read (a circuit already
   * loaded is quick: it does not flash); resolves as it starts to go.
   */
  async hide(): Promise<void> {
    if (this.root.hidden) return;
    const wait = 450 - (performance.now() - this.shownAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    setClass(this.root, 'out', true);
    window.setTimeout(() => {
      if (this.root.classList.contains('out')) this.root.hidden = true;
    }, 400);
  }

  /** Gone at once (the race it was for is gone). */
  drop(): void {
    this.root.hidden = true;
    setClass(this.root, 'out', false);
  }
}
