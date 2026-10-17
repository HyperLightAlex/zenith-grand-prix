// The boot screen: race control's computer powering up while the game loads.
// The page draws it from the first moment (index.html: the tube, the scope,
// the first lines of the log); this takes it over once the program has
// arrived and fills it with the real progress: the count in the scope, the
// meter, and a line in the log for each mech as its models land.

/** Display names for the mechs the boot log links, by asset id. */
const NAMES: Record<string, string> = { sunhawk: 'Sunhawk' };

export class BootScreen {
  private readonly root: HTMLElement;
  private readonly log: HTMLElement;
  private readonly pct: HTMLElement;
  private readonly count: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly fill: HTMLElement;
  private total = 1;
  private done = 0;
  private frames = 0;
  private framesTotal = 0;
  /** The link has failed: later arrivals change nothing. */
  private failed = false;

  constructor() {
    const root = document.getElementById('boot');
    // A page without the markup (an old cached one): build a bare copy.
    this.root = root ?? BootScreen.build();
    this.log = this.root.querySelector('#boot-log')!;
    this.pct = this.root.querySelector('#boot-pct')!;
    this.count = this.root.querySelector('#boot-count')!;
    this.bar = this.root.querySelector('#boot-bar')!;
    this.fill = this.bar.querySelector('i')!;
  }

  private static build(): HTMLElement {
    const root = document.createElement('div');
    root.id = 'boot';
    root.className = 'boot';
    root.innerHTML = '<div class="boot-tube"><div class="boot-head"><span>Zenith race control</span><b>Frame link</b></div><div class="boot-main"><div class="boot-scope" aria-hidden="true"><div class="readout"><b id="boot-pct">00</b><i>%</i></div><div class="units" id="boot-count"></div></div><ol class="boot-log" id="boot-log" aria-hidden="true"></ol></div><div class="boot-bar" id="boot-bar" role="progressbar" aria-label="Loading the mechs" aria-valuemin="0" aria-valuemax="100"><i></i></div></div>';
    document.body.append(root);
    return root;
  }

  /** The program is here: from now on the meter counts `files` model files, for `frames` mechs. */
  start(files: number, frames: number): void {
    this.total = Math.max(1, files);
    this.framesTotal = frames;
    this.root.classList.add('live');
    this.log.querySelector('li.now')?.remove();
    this.line('Race program', 'OK');
    this.line('Linking frames', '', true);
    this.show();
  }

  /** One more model file has landed. */
  file(): void {
    if (this.failed) return;
    this.done = Math.min(this.total, this.done + 1);
    this.show();
  }

  /** A mech's models have all landed: its line in the log. */
  frame(id: string): void {
    if (this.failed) return;
    this.frames++;
    const name = NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
    const li = this.line(`Frame ${String(this.frames).padStart(2, '0')}\u2002${name}`, 'Linked');
    li.classList.add('frame');
    this.show();
  }

  /** Everything is loaded and the game is built: the last lines, then the tube switches off. */
  async finish(): Promise<void> {
    this.log.querySelector('li.now')?.remove();
    this.line(`All ${this.framesTotal} frames`, 'Online');
    this.line('Pilots standing by', '');
    this.done = this.total;
    this.show();
    // A beat to read it (not for automated runs, which only wait).
    if (!navigator.webdriver) await wait(550);
    this.root.classList.add('off');
    await wait(reducedMotion() ? 220 : 440);
    this.root.remove();
  }

  /** The models could not load: say so, and offer to try again. */
  fail(): void {
    this.failed = true;
    this.log.querySelector('li.now')?.remove();
    const li = this.line('Frame link failed. Check the connection and try again.', '');
    li.classList.add('fail');
    this.count.textContent = 'Link failed';
    const retry = document.createElement('button');
    retry.className = 'boot-retry';
    retry.textContent = 'Try again';
    retry.onclick = () => location.reload();
    this.root.querySelector('.boot-tube')!.append(retry);
    retry.focus();
  }

  /** Remove at once (the model viewer, which has no title to hand over to). */
  close(): void {
    this.root.remove();
  }

  private line(text: string, status: string, waiting = false): HTMLElement {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = text;
    li.append(span);
    if (status) {
      const em = document.createElement('em');
      em.textContent = status;
      li.append(em);
    }
    if (waiting) li.classList.add('now');
    // New lines go above the waiting one, which stays last (and is not typed again).
    this.log.insertBefore(li, this.log.querySelector('li.now'));
    // Only the last lines fit; the oldest scroll off the top.
    while (this.log.children.length > 1 && this.log.scrollHeight > this.log.clientHeight + 1) {
      this.log.firstElementChild!.remove();
      this.log.classList.add('full');
    }
    return li;
  }

  private show(): void {
    const p = Math.round((this.done / this.total) * 100);
    this.pct.textContent = String(p).padStart(2, '0');
    this.count.textContent = this.framesTotal ? `Frames ${String(this.frames).padStart(2, '0')} / ${this.framesTotal}` : '';
    this.fill.style.width = `${p}%`;
    this.bar.setAttribute('aria-valuenow', String(p));
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
