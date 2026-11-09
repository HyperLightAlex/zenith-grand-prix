// The crowd's flags and camera flashes (client/render/crowd.ts) run on each
// stand's own clocks, so a cheer dying away slows them smoothly. They used to
// multiply the time since the start by a rate that changed with the cheer, so
// as a cheer died away the flags thrashed faster the later in the race it was.

import { describe, expect, it } from 'vitest';
import { Crowd } from '../src/client/render/crowd';

interface Clocks {
  ripple: number[];
  bob: number[];
  flashClock: number[];
  excite: number[];
}

describe('the crowd', () => {
  it('waves no faster as a cheer dies away, however late in the race', () => {
    const crowd = new Crowd(undefined, [
      { field: 0xff0000, band: 0xffffff, emblem: '' },
      { field: 0x0000ff, band: 0xffffff, emblem: '' },
    ]);
    const c = crowd as unknown as Clocks;
    const dt = 1 / 60;
    // Five minutes in, then a big cheer, then watch it die away.
    for (let i = 0; i < 300 * 60; i++) crowd.update(dt);
    crowd.cheer(null, 1.2);
    let most = 0;
    let prev = [...c.ripple];
    let prevFlash = [...c.flashClock];
    for (let i = 0; i < 6 * 60; i++) {
      crowd.update(dt);
      for (let k = 0; k < c.ripple.length; k++) {
        // The step this frame, the wrap at a full turn allowed for.
        const step = (c.ripple[k] - prev[k] + Math.PI * 2) % (Math.PI * 2);
        most = Math.max(most, step / dt);
        expect(c.flashClock[k] - prevFlash[k]).toBeLessThanOrEqual(dt * (1 + 1.2 * 7) + 1e-9);
        expect(c.flashClock[k]).toBeGreaterThanOrEqual(prevFlash[k]);
      }
      prev = [...c.ripple];
      prevFlash = [...c.flashClock];
    }
    // At most the cheer's own pace (5 + 7 x 1.2 radians a second: about two waves a second).
    expect(most).toBeLessThanOrEqual(5 + 1.2 * 7 + 1e-6);
    expect(Math.max(...c.excite)).toBe(0);
    crowd.dispose();
  });
});
