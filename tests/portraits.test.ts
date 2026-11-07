import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PILOT_COLOURS, PORTRAITS } from '../src/net/protocol';
import { castTeam, repaint, repainted, suitColours } from '../src/client/ui/portraits';

// The cast's portraits in any team's colours (ui/portraits.ts), from the
// pictures tools/portraits/suits.py makes.
const DIR = new URL('../src/client/ui/art/pilots/', import.meta.url);
const suits = JSON.parse(readFileSync(new URL('suits.json', DIR), 'utf8')) as {
  cast: string[];
  keys: string[];
  shades: number;
  ink: number[];
  teams: Record<string, number[]>[];
  plain: string[];
};

describe('the portraits in team colours', () => {
  it('has every cast pilot cut out and mapped, and every team its ground and colours', () => {
    const files = readdirSync(DIR);
    expect(suits.cast).toHaveLength(PORTRAITS);
    for (const n of suits.cast) {
      expect(files).toContain(`face-${n}.webp`);
      expect(files).toContain(`suit-${n}.png`);
    }
    for (const t of ['solstice', 'vanta', 'mirage', 'aurora', 'tempest', 'league']) expect(files).toContain(`ground-${t}.webp`);
    expect(suits.teams).toHaveLength(5);
    for (const t of suits.teams) for (const k of suits.keys) expect(t[k]).toHaveLength(3);
    // The map's values fit a byte: 1 + shades x 8 keys at most.
    expect(1 + suits.shades * suits.keys.length).toBeLessThanOrEqual(256);
  });

  it('repaints a portrait on any team but its own, and Squall (his bolt left out) on his own too', () => {
    const squall = suits.cast.indexOf('squall');
    for (let p = 0; p < PORTRAITS; p++) {
      for (let f = -1; f < 5; f++) {
        const own = f === castTeam(p);
        expect(repainted(p, f), `${suits.cast[p]} on ${f}`).toBe(!own || p === squall);
      }
    }
    expect(repainted(-1, 2)).toBe(false);
    expect(castTeam(squall)).toBe(4);
  });

  it("paints each team's suit colours, and the league's lit in the pilot colour", () => {
    const mirage = suitColours(2, -1);
    expect(mirage).toEqual(suits.keys.map((k) => suits.teams[2][k]));
    const red = suitColours(-1, 1);
    const glow = PILOT_COLOURS[1];
    expect(red[2]).toEqual([(glow >> 16) & 255, (glow >> 8) & 255, glow & 255]);
    expect(suitColours(-1, 7)[2]).not.toEqual(red[2]);
  });

  it('paints a suit pixel from the ink to its key colour by its shade, and leaves the rest', () => {
    const px = new Uint8ClampedArray([9, 9, 9, 255, 9, 9, 9, 255, 9, 9, 9, 255, 9, 9, 9, 128]);
    const S = suits.shades;
    // Not suit; the accent at full shade; the main at no shade (the ink); trim halfway.
    const map = new Uint8Array([0, 1 + 2 * S + (S - 1), 1 + 0 * S + 0, 1 + 4 * S + Math.round((S - 1) / 2)]);
    const colours = suitColours(1, -1);
    const ink = suits.ink as [number, number, number];
    repaint(px, map, colours);
    expect([...px.slice(0, 4)]).toEqual([9, 9, 9, 255]);
    expect([...px.slice(4, 7)]).toEqual(colours[2].map(Math.round));
    expect([...px.slice(8, 11)]).toEqual(ink);
    const t = Math.round((S - 1) / 2) / (S - 1);
    for (let c = 0; c < 3; c++) expect(px[12 + c]).toBeCloseTo(ink[c] + t * (colours[4][c] - ink[c]), 0);
    // Alpha is left as it was.
    expect(px[15]).toBe(128);
  });
});
