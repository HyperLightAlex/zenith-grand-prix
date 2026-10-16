import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Input } from '../src/client/input/input';
import type { TouchControls } from '../src/client/input/touch';
import { BTN } from '../src/sim/index';

let events: EventTarget;
let pad: Gamepad;

function key(type: string, code: string): void {
  events.dispatchEvent(Object.assign(new Event(type), { code, repeat: false }));
}

beforeEach(() => {
  events = new EventTarget();
  pad = {
    connected: true, mapping: 'standard', id: 'Test controller', index: 0,
    axes: [0, 0, 0, 0], buttons: Array.from({length: 16}, () => ({ pressed: false, touched: false, value: 0 })),
    timestamp: 0,
  } as unknown as Gamepad;
  vi.stubGlobal('window', events);
  vi.stubGlobal('location', {search: ''});
  vi.stubGlobal('navigator', {getGamepads: () => [pad]});
});

afterEach(() => vi.unstubAllGlobals());

describe('controller steering', () => {
  it('accepts a small stick correction after keyboard menu navigation', () => {
    const input = new Input();
    key('keydown', 'Enter');
    key('keyup', 'Enter');
    input.poll();
    expect(input.device).toBe('keys');
    // Outside the .16 dead zone, but below the former .30 device threshold.
    (pad.axes as number[])[0] = .24;
    input.poll();
    expect(input.device).toBe('pad');
    expect(input.state.mx).toBeCloseTo(.1);
  });

  it('samples reversals and release on the very next poll without smoothing', () => {
    const input = new Input();
    for (const axis of [1, -1, .24, 0]) {
      (pad.axes as number[])[0] = axis;
      input.poll();
      expect(input.state.mx).toBeCloseTo(axis === .24 ? .1 : axis);
    }
  });

  it('ignores stick drift inside the dead zone without taking keyboard control', () => {
    const input = new Input();
    key('keydown', 'KeyD');
    (pad.axes as number[])[0] = .1;
    input.poll();
    expect(input.device).toBe('keys');
    expect(input.state.mx).toBe(1);
  });
});

describe('touch controls', () => {
  function fakeTouch(read: ReturnType<TouchControls['read']>): TouchControls {
    return { read: () => read, onTouch: () => {}, onMenu: () => {} } as unknown as TouchControls;
  }
  function tap(kind: string): void {
    events.dispatchEvent(Object.assign(new Event('pointerdown'), { pointerType: kind }));
  }

  it('takes over from the keys at a finger on the screen, and gives way to the mouse', () => {
    const input = new Input();
    input.attachTouch(fakeTouch({ mx: 0.5, my: 0, throttle: 1, brake: 0, buttons: BTN.A, cmd: 0 }));
    key('keydown', 'KeyD');
    input.poll();
    expect(input.device).toBe('keys');
    expect(input.state.mx).toBe(1);
    tap('touch');
    input.poll();
    expect(input.device).toBe('touch');
    expect(input.state.mx).toBe(0.5);
    expect(input.state.throttle).toBe(1);
    expect(input.state.buttons).toBe(BTN.A);
    tap('mouse');
    expect(input.device).toBe('keys');
  });

  it('gives way to the pad as soon as the pad is used', () => {
    const input = new Input();
    input.attachTouch(fakeTouch({ mx: -1, my: 0, throttle: 1, brake: 0, buttons: 0, cmd: 0 }));
    tap('touch');
    input.poll();
    expect(input.state.mx).toBe(-1);
    (pad.axes as number[])[0] = 0.24;
    input.poll();
    expect(input.device).toBe('pad');
    expect(input.state.mx).toBeCloseTo(0.1);
  });
});
