import { describe, expect, it } from 'vitest';
import { frameFor } from '../src/client/video';

// The layout follows the frame (the window, or the 4:3 box in it), never the
// window alone: a 4:3 handheld and a 4:3 picture on a wide phone lay out alike.
describe('the frame and its layout', () => {
  it('lays a desktop window out as drawn', () => {
    const f = frameFor(1280, 720, 'wide');
    expect(f).toMatchObject({ w: 1280, h: 720, narrow: false, compact: false, portrait: false, layout: 'roomy' });
    expect(f.em).toBeCloseTo(12.6);
  });

  it('gives a handheld 4:3 screen (the Retroid Pocket Nova in a browser) one scrolling column', () => {
    const f = frameFor(640, 480, 'wide');
    expect(f).toMatchObject({ narrow: true, compact: true, portrait: false, layout: 'single' });
    expect(f.em).toBe(11);
  });

  it('gives a phone held sideways columns that scroll', () => {
    expect(frameFor(844, 390, 'wide')).toMatchObject({ narrow: false, compact: true, layout: 'cols' });
    expect(frameFor(667, 375, 'wide')).toMatchObject({ compact: true, layout: 'cols' });
  });

  it('boxes a 4:3 picture in a wide window and lays out the box', () => {
    const f = frameFor(844, 390, 'classic');
    expect(f.w).toBeCloseTo(520);
    expect(f.h).toBe(390);
    expect(f.x).toBeCloseTo(162);
    expect(f).toMatchObject({ narrow: true, compact: true, layout: 'single' });
    const desk = frameFor(1280, 720, 'classic');
    expect(desk).toMatchObject({ w: 960, h: 720, narrow: true, compact: false, layout: 'cols' });
  });

  it('fills a phone held upright, whatever the picture setting', () => {
    for (const aspect of ['wide', 'classic'] as const) {
      const f = frameFor(390, 844, aspect);
      expect(f).toMatchObject({ w: 390, h: 844, x: 0, y: 0, portrait: true, layout: 'single' });
    }
  });

  it('never sets type under 11 px or over 24', () => {
    expect(frameFor(320, 240, 'wide').em).toBe(11);
    expect(frameFor(3840, 2160, 'wide').em).toBe(24);
  });

  it('only counts the screen edges that fall inside the frame as unsafe', () => {
    const notch = { l: 47, r: 47, t: 0, b: 21 };
    expect(frameFor(844, 390, 'wide', notch).safe).toEqual(notch);
    // The 4:3 box sits 162 px in from each side: clear of the notch.
    expect(frameFor(844, 390, 'classic', notch).safe).toEqual({ l: 0, r: 0, t: 0, b: 21 });
  });
});

describe('narrow frames', () => {
  it('uses the compact layouts for a frame too narrow for the roomy ones', () => {
    expect(frameFor(700, 1000, 'wide')).toMatchObject({ portrait: true, compact: true });
    expect(frameFor(768, 1024, 'wide')).toMatchObject({ portrait: true, compact: true });
    expect(frameFor(1024, 768, 'wide')).toMatchObject({ compact: false, narrow: true, layout: 'cols' });
  });
});
