// The eyecatch: in the anime look, the cut from the race to the results. The
// last frame of the race is held as a painted still and the show's title
// comes up over it, the way an 80s broadcast went to its break.
import { h, setText } from './dom';
import { LOGO } from './keyArt';

export class Eyecatch {
  private el: HTMLElement;
  private kick = h('div.ec-kick', '');
  private sub = h('div.ec-sub', '');
  private timer = 0;

  constructor(root: HTMLElement) {
    // The show's logo, as painted.
    const logo = h<'img'>('img.ec-logo');
    logo.src = LOGO.url;
    logo.alt = 'Zenith Grand Prix';
    this.el = h('div.eyecatch', h('div.ec-card', this.kick, logo, this.sub));
    this.el.hidden = true;
    root.append(this.el);
  }

  /** Show it for `seconds`. */
  show(kick: string, sub: string, seconds: number): void {
    setText(this.kick, kick);
    setText(this.sub, sub);
    this.el.hidden = false;
    // Restart the cut-in.
    this.el.classList.remove('in');
    void this.el.offsetWidth;
    this.el.classList.add('in');
    this.timer = seconds;
  }

  update(dt: number): void {
    if (this.timer <= 0) return;
    this.timer -= dt;
    if (this.timer <= 0) this.el.hidden = true;
  }

  hide(): void {
    this.timer = 0;
    this.el.hidden = true;
  }

  get showing(): boolean {
    return this.timer > 0;
  }
}
