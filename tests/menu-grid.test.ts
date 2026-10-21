import { describe, expect, it } from 'vitest';
import { spatialStep } from '../src/client/ui/menus';

/** Stand-ins for laid-out elements: just their boxes. */
const box = (x: number, y: number, w: number, h: number) => ({ getBoundingClientRect: () => ({ left: x, top: y, width: w, height: h, right: x + w, bottom: y + h }) }) as unknown as HTMLElement;

/** `n` cells of `size`, `cols` to a row. */
const grid = (n: number, cols: number, size = 40, gap = 6) => Array.from({ length: n }, (_, i) => box((i % cols) * (size + gap), Math.floor(i / cols) * (size + gap), size, size));

describe('moving through a grid by where things sit', () => {
  const faces = grid(15, 5);

  it('goes across a row and round to its other end', () => {
    expect(spatialStep(faces, 0, 'right')).toBe(1);
    expect(spatialStep(faces, 4, 'right')).toBe(0);
    expect(spatialStep(faces, 5, 'left')).toBe(9);
    expect(spatialStep(faces, 7, 'left')).toBe(6);
  });

  it('goes up and down a column and round to the far row', () => {
    expect(spatialStep(faces, 2, 'down')).toBe(7);
    expect(spatialStep(faces, 7, 'down')).toBe(12);
    expect(spatialStep(faces, 12, 'down')).toBe(2);
    expect(spatialStep(faces, 1, 'up')).toBe(11);
  });

  it('lands on the nearest across in a short last row', () => {
    const paints = grid(34, 11);
    expect(spatialStep(paints, 27, 'down')).toBe(33);
    expect(spatialStep(paints, 33, 'up')).toBe(22);
    expect(spatialStep(paints, 33, 'right')).toBe(33);
  });

  it('goes from a keyboard\'s keys to the buttons under it and back', () => {
    const keys = grid(40, 10);
    // Done, Delete and ABC: wider, in a row of their own under the keys.
    const buttons = [box(0, 190, 200, 44), box(210, 190, 110, 44), box(330, 190, 80, 44)];
    const all = [...keys, ...buttons];
    expect(spatialStep(all, 31, 'down')).toBe(40); // Done, under the left of the keys
    expect(spatialStep(all, 32, 'down')).toBe(40);
    expect(spatialStep(all, 36, 'down')).toBe(41); // Delete
    expect(spatialStep(all, 39, 'down')).toBe(42); // ABC
    expect(spatialStep(all, 40, 'right')).toBe(41);
    expect(spatialStep(all, 42, 'right')).toBe(40);
    expect(spatialStep(all, 41, 'up')).toBe(35);
    // Round the ends: off the bottom to the top row, off the top to the buttons.
    expect(spatialStep(all, 40, 'down')).toBe(2);
    expect(spatialStep(all, 2, 'up')).toBe(40);
  });

  it('passes over what is not showing', () => {
    const cells = grid(6, 3);
    const some = [cells[0], box(0, 0, 0, 0), cells[2], cells[3], cells[4], cells[5]];
    expect(spatialStep(some, 0, 'right')).toBe(2);
    expect(spatialStep(some, 4, 'up')).toBe(0);
    // From something not showing, nowhere.
    expect(spatialStep(some, 1, 'down')).toBe(1);
  });
});
