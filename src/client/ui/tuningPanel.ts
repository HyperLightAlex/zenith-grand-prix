// The tuning panel: sliders for race rules, camera and effects that take
// effect at once. It sits down the right-hand side and never pauses the game,
// so a value can be changed with the mouse while the race carries on. Opened
// from the pause menu it can also be driven from the pad or the keyboard.
import type { SfxName } from '../audio/audio';
import type { MenuInput } from '../input/input';
import { TUNE_GROUPS, showValue, type TuneItem, type Tuning } from '../game/tuning';
import { h, setClass, setText } from './dom';

interface Row {
  item: TuneItem;
  el: HTMLElement;
  input: HTMLInputElement;
  value: HTMLElement;
}

export interface TuningPanelCallbacks {
  onClose(): void;
  onSound(name: SfxName): void;
}

/** Every one-shot sound, by what it is for, so a sound can be found by ear and named. */
const SOUND_TEST: Array<[SfxName, string]> = [
  ['boost', 'Boost (lit)'],
  ['dash', 'Dash'],
  ['launch', 'Perfect launch'],
  ['rev_green', 'Revs in the green'],
  ['bog', 'Over-revved start'],
  ['lock', 'Lock on'],
  ['unlock', 'Let go'],
  ['denied', 'Refused'],
  ['swing_light', 'Light swing'],
  ['swing_heavy', 'Heavy swing'],
  ['hit_light', 'Light hit'],
  ['hit_heavy', 'Heavy hit'],
  ['block', 'Block'],
  ['block_heavy', 'Block (heavy blow)'],
  ['parry', 'Parry'],
  ['tell', 'Wind-up: parry it'],
  ['tell_dodge', 'Wind-up: dodge it'],
  ['momentum', 'Momentum strike thrown'],
  ['momentum_hit', 'Momentum strike lands'],
  ['ringout', 'Ring-out'],
  ['guard_break', 'Guard break'],
  ['shot_carbine', 'Carbine'],
  ['shot_scatter', 'Scatter cannon'],
  ['bullet_hit', 'Bullet hit'],
  ['wall', 'Barrier hit'],
  ['bump', 'Bump'],
  ['ko', 'Knockout'],
  ['critical', 'Armour critical'],
  ['gate', 'Gate'],
  ['cells_full', 'Cells full'],
  ['overdrive', 'Overdrive'],
  ['breakaway', 'Break Away'],
  ['snare_shot', 'Snare shot'],
  ['snared', 'Snared'],
  ['pulse', 'Disruptor'],
  ['ram', 'Ram'],
  ['aegis', 'Aegis'],
  ['count_beep', 'Countdown'],
  ['count_go', 'Go'],
  ['lap', 'Lap'],
  ['lap_phase', 'Battle lap'],
  ['final_lap', 'Speed lap'],
  ['finish', 'Finish'],
  ['command', 'Team play'],
  ['comms', 'Radio'],
];

export class TuningPanel {
  readonly root = h('div.ui.tune');
  open = false;
  private tab = 0;
  private sel = -1; // -1 is the row of group tabs
  private tabs: HTMLElement[] = [];
  private body = h('div.tune-body');
  private rows: Row[] = [];
  private count = h('span.changed', '');
  private text = h<'textarea'>('textarea');
  private textBox = h('div.tune-text');
  private status = h('div.status', '');
  private noteEl = h('div.tune-note', '');
  /** A line under the title (online: the room's rules stand). */
  note = '';

  constructor(parent: HTMLElement, private tuning: Tuning, private cb: TuningPanelCallbacks) {
    const R = this.root;
    R.hidden = true;
    const head = h('div.tune-head', h('div.title', 'Tuning', this.count));
    const buttons = h('div.tune-buttons');
    const button = (label: string, fn: () => void) => {
      const b = h('span.btn', label);
      b.addEventListener('click', fn);
      buttons.append(b);
    };
    button('Copy values', () => this.copy());
    button('Load values', () => this.load());
    button('Reset all', () => {
      this.tuning.reset();
      this.refresh();
      this.say('Everything is back to the defaults.');
    });
    button('Close', () => this.hide());
    head.append(buttons);

    const tabRow = h('div.tune-tabs');
    TUNE_GROUPS.forEach((g, i) => {
      const t = h('span.tab', g.title);
      t.addEventListener('click', () => this.setTab(i));
      this.tabs.push(t);
      tabRow.append(t);
    });

    this.text.rows = 6;
    this.text.spellcheck = false;
    // Typing in the box must not fly the mech. Only key presses are held back:
    // a release still has to reach the game, or a key held when the box took
    // the focus would stay down for good.
    this.text.addEventListener('keydown', (e) => e.stopPropagation());
    this.textBox.append(this.text);
    this.textBox.hidden = true;

    R.append(head, this.noteEl, tabRow, this.body, this.textBox, this.status, h('div.tune-foot', 'Changes apply straight away and are remembered on this device. Rules marked for the grid (starting Drive and Cells) apply from the next race.'));
    parent.append(R);
    this.setTab(0);
  }

  toggle(): void {
    if (this.open) this.hide();
    else this.show();
  }

  show(): void {
    this.open = true;
    this.root.hidden = false;
    setText(this.noteEl, this.note);
    this.noteEl.hidden = !this.note;
    this.refresh();
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.root.hidden = true;
    this.textBox.hidden = true;
    this.text.blur();
    this.cb.onClose();
  }

  private say(text: string): void {
    setText(this.status, text);
  }

  private setTab(i: number): void {
    this.tab = (i + TUNE_GROUPS.length) % TUNE_GROUPS.length;
    this.tabs.forEach((t, k) => setClass(t, 'on', k === this.tab));
    this.body.replaceChildren();
    this.rows = [];
    for (const item of TUNE_GROUPS[this.tab].items) {
      const input = h<'input'>('input');
      input.type = 'range';
      input.min = String(item.min);
      input.max = String(item.max);
      input.step = String(item.step);
      const value = h('span.value', '');
      const reset = h('span.reset', '↺');
      reset.title = 'Back to the default';
      const el = h('div.tune-row', h('span.label', item.label), input, value, reset);
      if (item.hint) el.append(h('div.hint', item.hint));
      const row: Row = { item, el, input, value };
      input.addEventListener('input', () => {
        this.tuning.set(item, Number(input.value));
        this.paint(row);
      });
      // Let go of the slider the moment the mouse does, so every key goes on
      // reaching the game. (The pad and keys work the panel through handle().)
      for (const ev of ['change', 'pointerup', 'pointercancel'] as const) input.addEventListener(ev, () => input.blur());
      input.addEventListener('keydown', (e) => e.preventDefault());
      reset.addEventListener('click', () => {
        this.tuning.set(item, this.tuning.defaultOf(item));
        this.paint(row);
      });
      this.rows.push(row);
      this.body.append(el);
    }
    if (TUNE_GROUPS[this.tab].title === 'Sound') {
      // Play any effect on its own, to find the one that grates and name it.
      const grid = h('div.sound-test');
      for (const [name, label] of SOUND_TEST) {
        const b = h('span.btn', label);
        b.title = name;
        b.addEventListener('click', () => {
          this.cb.onSound(name);
          this.say(`Played "${label}" (${name}).`);
        });
        grid.append(b);
      }
      this.body.append(h('div.tune-sub', 'Sound test: click to play'), grid);
    }
    this.sel = Math.min(this.sel, this.rows.length - 1);
    this.refresh();
  }

  private paint(row: Row): void {
    const v = this.tuning.get(row.item);
    if (Number(row.input.value) !== v) row.input.value = String(v);
    setText(row.value, showValue(row.item, v));
    setClass(row.el, 'changed', Math.abs(v - this.tuning.defaultOf(row.item)) > 1e-9);
    const n = this.tuning.changedCount();
    setText(this.count, n ? `${n} changed` : '');
  }

  refresh(): void {
    this.rows.forEach((r, i) => {
      this.paint(r);
      setClass(r.el, 'sel', i === this.sel);
    });
    this.tabs.forEach((t, k) => setClass(t, 'sel', this.sel === -1 && k === this.tab));
    const n = this.tuning.changedCount();
    setText(this.count, n ? `${n} changed` : '');
  }

  private copy(): void {
    const text = this.tuning.exportText();
    this.text.value = text;
    this.textBox.hidden = false;
    this.text.focus();
    this.text.select();
    this.say('Select the text and copy it if it was not copied for you.');
    try {
      void navigator.clipboard.writeText(text).then(
        () => {
          this.say('Copied. Paste it into the chat to make these the defaults.');
          this.text.blur();
        },
        () => {},
      );
    } catch {
      /* the text box is there for a manual copy */
    }
  }

  private load(): void {
    if (this.textBox.hidden) {
      this.text.value = '';
      this.textBox.hidden = false;
      this.text.focus();
      this.say('Paste a block of values into the box, then press Load values again.');
      return;
    }
    if (this.tuning.importText(this.text.value)) {
      this.say('Loaded.');
      this.textBox.hidden = true;
      this.text.blur();
      this.refresh();
    } else {
      this.say('That does not look like a block of tuning values.');
    }
  }

  /** Pad and keyboard navigation, used while the game is paused. */
  handle(presses: MenuInput[]): void {
    for (const m of presses) {
      if (!this.open) return;
      if (m === 'back' || m === 'tune' || m === 'pause') {
        this.cb.onSound('ui_back');
        this.hide();
        return;
      }
      if (m === 'up' || m === 'down') {
        const n = this.rows.length;
        this.sel = ((this.sel + 1 + (m === 'down' ? 1 : n)) % (n + 1)) - 1;
        this.cb.onSound('ui_move');
        this.refresh();
        this.rows[this.sel]?.el.scrollIntoView({ block: 'nearest' });
      } else if (m === 'left' || m === 'right') {
        const dir = m === 'left' ? -1 : 1;
        if (this.sel < 0) this.setTab(this.tab + dir);
        else {
          const row = this.rows[this.sel];
          this.tuning.set(row.item, Math.round((this.tuning.get(row.item) + dir * row.item.step) / row.item.step) * row.item.step);
          this.paint(row);
        }
        this.cb.onSound('ui_move');
      } else if (m === 'confirm' && this.sel >= 0) {
        // Confirm puts the selected value back to its default.
        const row = this.rows[this.sel];
        this.tuning.set(row.item, this.tuning.defaultOf(row.item));
        this.paint(row);
        this.cb.onSound('ui_select');
      }
    }
  }
}
