// The tutorial's two pieces of screen (see game/tutorial.ts): the card that
// holds the race while it is up, and the try-it line that stays up after it.
// Controls in the words are drawn as key caps for the device in hand.

import type { Device } from '../input/input';
import type { CardText, GoalView } from '../game/tutorial';
import { TELL_COLOR } from '../game/tells';
import { h, setClass } from './dom';
import { KEYS } from './keyNames';

/** Names the key table has no entry for: the stick, and the plays on the pad as one. */
const EXTRA: Record<Device, Record<string, string>> = {
  pad: { steer: 'L stick' },
  keys: { steer: 'A / D' },
  touch: {},
};

/** What `[name]` reads as on this device: its key, or the name as written (a touch button's). */
export function keyLabel(device: Device, name: string): string {
  return EXTRA[device][name] || KEYS[device][name] || name;
}

/** A line of a card, its `[marks]` as key caps. */
function line(text: string, device: Device): HTMLElement {
  const el = h('span');
  for (const part of text.split(/(\[[^\]]+\])/)) {
    if (!part) continue;
    const m = /^\[([^\]]+)\]$/.exec(part);
    el.append(m ? h('span.key', keyLabel(device, m[1])) : part);
  }
  return el;
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export class TutorialPanel {
  readonly root = h('div.ui.tutorial');
  private card = h('div.tcard');
  private goal = h('div.tgoal');
  private cardKey = '';
  private goalKey = '';
  /** Continue, by a tap or a click on the card. */
  onContinue: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.card.hidden = true;
    this.goal.hidden = true;
    this.card.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.onContinue();
    });
    this.root.append(this.card, this.goal);
    this.root.hidden = true;
    parent.append(this.root);
  }

  show(on: boolean): void {
    this.root.hidden = !on;
  }

  /** The card for this frame (null: none), and whether it can be closed yet. */
  setCard(text: CardText | null, device: Device, ready: boolean): void {
    const key = text ? `${device}|${text.title}|${text.lines.join('|')}` : '';
    if (key !== this.cardKey) {
      this.cardKey = key;
      this.card.hidden = !text;
      if (text) this.build(text, device);
    }
    setClass(this.card, 'ready', ready);
  }

  private build(text: CardText, device: Device): void {
    const body = h('div.tc-body');
    for (const l of text.lines) body.append(h('p', line(l, device)));
    const parts: HTMLElement[] = [h('div.tc-title', text.title), body];
    if (text.legend) {
      const legend = h('div.tc-legend');
      for (const row of text.legend) {
        const ring = h('i.ring');
        ring.style.setProperty('--c', hex(TELL_COLOR[row.kind]));
        legend.append(h('div.row', ring, line(row.text, device)));
      }
      parts.push(legend);
    }
    const go = device === 'touch' ? h('span', 'Tap to continue') : h('span', h('span.key', device === 'pad' ? 'A' : 'Enter'), 'Continue');
    parts.push(h('div.tc-foot', go));
    this.card.replaceChildren(...parts);
  }

  /** The try-it line (null: none). */
  setGoal(goal: GoalView | null, device: Device): void {
    const key = goal ? `${device}|${goal.id}|${goal.text}|${goal.done}|${goal.missed}|${goal.note}` : '';
    if (key === this.goalKey) return;
    this.goalKey = key;
    this.goal.hidden = !goal;
    if (!goal) return;
    this.goal.className = 'tgoal' + (goal.done ? ' done' : goal.missed ? ' missed' : '');
    const mark = h('i.mark', goal.done ? '✓' : '');
    // Done, it says how it went (or just what was done); let go, why.
    const text = (goal.done || goal.missed) && goal.note ? h('span', goal.note) : line(goal.text, device);
    const note = !goal.done && !goal.missed && goal.note ? h('small', goal.note) : null;
    this.goal.replaceChildren(mark, h('div.gt', goal.done || goal.missed ? null : h('b', 'Try it'), text, note));
  }
}
