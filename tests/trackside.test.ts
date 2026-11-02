// The trackside: brake boards stand before every tight corner that comes
// after a straight, on its outside (render/brakeBoards.ts).

import { describe, expect, it } from 'vitest';
import { TRACKS, buildTrack } from '../src/sim/index';
import { brakeBoardCorners } from '../src/client/render/brakeBoards';

describe('brake boards', () => {
  it('stand before a tight corner after a straight, on every circuit, on its outside', () => {
    for (const def of TRACKS) {
      const track = buildTrack(def);
      const corners = brakeBoardCorners(track);
      expect(corners.length, def.id).toBeGreaterThan(0);
      for (const c of corners) {
        const i = Math.round(c.s / track.ds);
        // Tight here, and turning away from the side the boards are on.
        expect(Math.abs(track.kappa[i]), `${def.id} at ${c.s}`).toBeGreaterThan(0.004);
        expect(Math.sign(track.kappa[i]), `${def.id} at ${c.s}`).toBe(-c.side);
        // Nothing half as tight for the 220 m before it.
        for (let k = 1; k * track.ds < 220; k++) expect(Math.abs(track.kappa[(i - k + track.n) % track.n])).toBeLessThan(0.004);
      }
    }
  });
});
