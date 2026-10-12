import { jump, type CircuitDef, type ForkSpec } from '../circuit';

// Corkscrew Canyon: the technical one, built for fighting. A narrow cut
// through the rock where nobody can get past without a fight, a corkscrew,
// a bowl banked so steeply it can be taken flat out, a fork whose two routes
// cross over and under each other, a sky bridge with no barriers (a ring-out
// there is a fall) and a short hop over a gap. Runs clockwise.

const CROSSOVER: ForkSpec = {
  id: 'crossover',
  median: 5,
  // The left route climbs and swings over the top of the right one, which dips under it.
  left: { shift: 44, rise: 30 },
  right: { shift: -44, rise: -10 },
};

export const CANYON: CircuitDef = {
  id: 'canyon',
  name: 'Corkscrew Canyon',
  theme: 'canyon',
  halfWidth: 28,
  height: 60,
  bankGain: 70,
  maxBank: 0.3,
  pieces: [
    /*  0 */ { straight: 260, name: 'start straight' },
    /*  1 */ { turn: [300, 90], bank: 14, name: 'T1 Mesa Right' },
    /*  2 */ { straight: 370 },
    /*  3 */ { climb: [320, -45], name: 'down into the canyon' },
    /*  4 */ { straight: 240, width: 17, name: 'the Narrows' },
    /*  5 */ { turn: [520, -14], width: 17, name: 'the Narrows, kink left' },
    /*  6 */ { turn: [520, 14], width: 17, name: 'the Narrows, kink right' },
    /*  7 */ { straight: 140, width: 17 },
    /*  8 */ { turn: [200, -90], width: 20, bank: 10, name: 'T2 Narrows exit' },
    /*  9 */ { climb: [400, 50], name: 'the climb out' },
    /* 10 */ { roll: [360, 360], name: 'the Corkscrew' },
    /* 11 */ { straight: 80 },
    /* 12 */ { turn: [180, 180], bank: 58, width: 30, name: 'T3 the Bowl' },
    /* 13 */ { straight: 160, name: 'closing A' },
    /* 14 */ { straight: 640, width: 40, fork: CROSSOVER, name: 'the Crossover' },
    /* 15 */ { climb: [300, 25], name: 'up to the bridge' },
    /* 16 */ { turn: [300, 90], bank: 14, name: 'T4' },
    /* 17 */ { straight: 320, width: 24, open: 'both', name: 'the Sky Bridge' },
    /* 18 */ { straight: 70 },
    ...jump({ ramp: 9, speed: 78, gap: 0.6, land: 90 }), // 19-24 the Hop
    /* 25 */ { straight: 200, name: 'closing B' },
    /* 26 */ { climb: [360, -20], name: 'down from the rim (settles the height)' },
    /* 27 */ { turn: [260, -45], width: 24, name: 'T5 esses left' },
    /* 28 */ { turn: [260, 45], width: 24, name: 'T6 esses right' },
    /* 29 */ { straight: 40 },
    /* 30 */ { turn: [260, 90], bank: 18, name: 'T7 Final' },
    /* 31 */ { straight: 200, name: 'run to the line' },
  ],
  closeWith: [13, 25],
  settle: 26,
  strips: [
    { piece: 0, at: 0.25, len: 200, d: -14, halfW: 5 },
    { piece: 4, at: 0.1, len: 200, d: 0, halfW: 5 }, // the middle of the Narrows: fight for it
    { piece: 9, at: 0.2, len: 150, d: 14, halfW: 5 },
    { piece: 14, at: 0.5, len: 200, d: 24, halfW: 5 }, // right (lower) route of the Crossover: Drive below, the Cell above
    { piece: 25, at: 0.1, len: 160, d: -15, halfW: 5 },
    { piece: 31, at: 0.0, len: 150, d: 14, halfW: 5 },
  ],
  gates: [
    { piece: 2, at: 0.6, d: 17, halfW: 4.5 },
    { piece: 12, at: 0.5, d: -21, halfW: 4.5 }, // high on the Bowl's wall
    { piece: 14, at: 0.7, d: -22, halfW: 4.5 }, // upper route of the Crossover
    { piece: 17, at: 0.5, d: 15, halfW: 4.5 }, // out by the open edge of the Sky Bridge
    { piece: 27, at: 0.5, d: 18, halfW: 4.5 },
    { piece: 31, at: 0.3, d: 17, halfW: 4.5 },
  ],
  pads: [
    { piece: 14, at: 0.3, len: 60, d: 22, halfW: 6 }, // lower route of the Crossover
    { piece: 18, at: 0.1, len: 50, d: 0, halfW: 7 }, // run-up to the Hop
  ],
};
