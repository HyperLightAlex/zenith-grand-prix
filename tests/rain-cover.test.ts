// The rain's cover (client/render/rain.ts): what a circuit roofs over (a
// hall's vault, a lintel over the road, a deck over the turn below) on a
// grid of heights. No streak is drawn under it, nor any splash; Monsoon's
// rain used to fall straight through its halls.

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { coverAt, coverGrid } from '../src/client/render/rain';

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

describe('the rain\'s cover', () => {
  it('a flat roof covers what is under it, and nothing beside it', () => {
    const c = coverGrid([[v(0, 10, 0), v(20, 10, 0), v(20, 10, 20), v(0, 10, 20)]])!;
    expect(coverAt(c, 10, 10)).toBeCloseTo(10, 6);
    expect(coverAt(c, 1.2, 18.8)).toBeCloseTo(10, 6);
    expect(coverAt(c, -5, 10)).toBe(-Infinity);
    expect(coverAt(c, 10, 40)).toBe(-Infinity);
  });

  it('a sloping roof at its own height, and the higher of two over one place', () => {
    const c = coverGrid([
      [v(0, 0, 0), v(40, 40, 0), v(40, 40, 10), v(0, 0, 10)],
      [v(0, 25, 0), v(10, 25, 0), v(10, 25, 10), v(0, 25, 10)],
    ])!;
    // (Cells are 2 wide: the slope read at the middle of the cell.)
    expect(coverAt(c, 30.5, 5)).toBeCloseTo(31, 0);
    expect(coverAt(c, 5, 5)).toBe(25);
  });

  it('nothing roofed, no cover', () => {
    expect(coverGrid([])).toBeNull();
  });
});
