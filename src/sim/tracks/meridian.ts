import type { TrackDef } from '../track';

// Meridian Skyway — the V1 circuit. An elevated loop over open water.
// Forward at the start line is -z and right is +x, so the lap runs clockwise.
export const MERIDIAN: TrackDef = {
  id: 'meridian',
  name: 'Meridian Skyway',
  length: 8640, // 90 s at the 96 u/s pace limit
  halfWidth: 28,
  bankGain: 75,
  maxBank: 0.32,
  segments: [
    { straight: 760 }, //  0  Grand Straight (second half)
    { arc: [430, 78] }, //  1  T1  Sunrise Sweep, climbing
    { straight: 260 }, //  2
    { arc: [300, -52] }, //  3  T2  the Esses, left
    { arc: [300, 84] }, //  4  T3  the Esses, right
    { straight: 620 }, //  5  Crest Straight
    { arc: [540, 100] }, //  6  T4  the Carousel, long banked right
    { straight: 380 }, //  7  (closing straight A)
    { arc: [230, -70] }, //  8  T5  Drop Left
    { straight: 420 }, //  9  the descent
    { arc: [180, 160] }, // 10  T6  Harbour Hairpin
    { straight: 700 }, // 11  (closing straight B)
    { arc: [270, -55] }, // 12  T7  chicane left
    { arc: [270, 55] }, // 13  T8  chicane right
    { straight: 480 }, // 14
    { arc: [390, 60] }, // 15  T9  Final Sweep
    { straight: 420 }, // 16  Grand Straight (first half)
  ],
  closeWith: [7, 11],
  heights: [
    [0.0, 40],
    [0.08, 40],
    [0.2, 70],
    [0.3, 112],
    [0.4, 118],
    [0.5, 84],
    [0.58, 56],
    [0.66, 24],
    [0.74, 20],
    [0.82, 44],
    [0.88, 52],
    [0.95, 40],
  ],
  // Charge strips: ride them to fill the Drive gauge. Several sit on the
  // slower outside line, so topping up costs track position.
  strips: [
    { at: 0.03, len: 240, d: -15, halfW: 5 }, // Grand Straight, left
    { at: 0.115, len: 220, d: -17, halfW: 5 }, // outside of Sunrise Sweep
    { at: 0.29, len: 260, d: 13, halfW: 5 }, // Crest Straight, right
    { at: 0.385, len: 300, d: -18, halfW: 5 }, // outside of the Carousel
    { at: 0.5, len: 260, d: 0, halfW: 5 }, // the descent, centre
    { at: 0.552, len: 200, d: 16, halfW: 5 }, // the descent, right
    { at: 0.735, len: 260, d: -14, halfW: 5 }, // after the hairpin, left
    { at: 0.86, len: 220, d: 12, halfW: 5 }, // before Final Sweep
    { at: 0.955, len: 200, d: 16, halfW: 5 }, // Grand Straight run-in, right
  ],
};
