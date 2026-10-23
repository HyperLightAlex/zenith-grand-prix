import { jump, type CircuitDef, type ForkSpec } from '../circuit';

// Frostline: an ice shelf at the blue hour, under the aurora. Along the
// shelf's edge from the line, then the Aurora Split: the high route is an
// ice bridge with no barrier on its outside and a speed pad, the low route
// runs through ice caves, walled and longer, with the Cell. Back together
// for the Seracs, quick lefts and rights through the ice pillars, where the
// fighting is; then into the glacier's foot and up through the Ice Barrel,
// a tunnel that rolls the road a full turn round its inside as it climbs.
// Out on top, round the Nunatak and off the glacier's face, the Calving: a
// jump down onto the lower shelf. Down the Icefall, a spiral round a frozen
// waterfall, through the Aurora Loop and home. Runs clockwise.

const AURORA: ForkSpec = {
  id: 'aurora',
  median: 6,
  // The bridge climbs away to the left; the caves keep to the shelf on the right.
  left: { shift: -34, rise: 26 },
  right: { shift: 28, rise: 0 },
};
const inSplit = { width: 40, fork: AURORA };

export const FROSTLINE: CircuitDef = {
  id: 'frostline',
  name: 'Frostline',
  theme: 'frostline',
  halfWidth: 26,
  height: 60,
  bankGain: 70,
  maxBank: 0.3,
  pieces: [
    /*  0 */ { straight: 420, name: 'start straight' },
    /*  1 */ { turn: [220, 90], bank: 14, name: 'T1 Shelf' },
    /*  2 */ { straight: 160, name: 'closing A' },
    /*  3 */ { straight: 800, ...inSplit, open: 'left', name: 'the Aurora Split' },
    /*  4 */ { straight: 120 },
    /*  5 */ { turn: [150, -90], bank: 12, name: 'T2 the Glacier Foot' },
    /*  6 */ { straight: 40, name: 'to the glacier' },
    /*  7 */ { pitch: [300, 24], name: 'into the glacier' },
    /*  8 */ { roll: [380, 360], width: 22, name: 'the Ice Barrel' },
    /*  9 */ { pitch: [300, -24], name: 'out on top' },
    /* 10 */ { straight: 40 },
    /* 11 */ { turn: [120, -90], name: 'the Seracs, left' },
    /* 12 */ { turn: [120, 60], name: 'the Seracs, right' },
    /* 13 */ { turn: [120, -60], name: 'the Seracs, left again' },
    /* 14 */ { straight: 40 },
    /* 15 */ { turn: [190, -90], bank: 16, name: 'T3 the Nunatak' },
    /* 16 */ { straight: 810, name: 'the crest' },
    ...jump({ ramp: 10, down: 34, speed: 100, gap: 0.8, land: 80 }), // 17-22 the Calving
    /* 23 */ { straight: 100 },
    /* 24 */ { spiral: [130, 95, 360, -80], bank: 26, name: 'the Icefall' },
    /* 25 */ { straight: 320 },
    /* 26 */ { loop: [70, -80], name: 'the Aurora Loop' },
    /* 27 */ { straight: 210 },
    /* 28 */ { turn: [200, 90], bank: 14, name: 'T4 the Floe' },
    /* 29 */ { straight: 20, name: 'the floe' },
    /* 30 */ { pitch: [520, 6], name: 'the Pressure Ridges' },
    /* 31 */ { pitch: [520, -12] },
    /* 32 */ { pitch: [520, 12] },
    /* 33 */ { pitch: [520, -12] },
    /* 34 */ { pitch: [520, 6] },
    /* 35 */ { straight: 20 },
    /* 36 */ { climb: [160, 0], name: 'settles the height' },
    /* 37 */ { turn: [180, 90], bank: 16, name: 'T5 Homecoming' },
    /* 38 */ { straight: 260, name: 'run to the line' },
  ],
  closeWith: [2, 38],
  settle: 36,
  strips: [
    { piece: 0, at: 0.25, len: 180, d: 14, halfW: 5 },
    { piece: 3, at: 0.3, len: 200, d: 23, halfW: 5 }, // the caves
    { piece: 16, at: 0.15, len: 200, d: -14, halfW: 5 }, // along the crest
    { piece: 16, at: 0.55, len: 180, d: 14, halfW: 5 },
    { piece: 25, at: 0.2, len: 200, d: 0, halfW: 5 }, // out of the Icefall
    { piece: 27, at: 0.1, len: 150, d: -14, halfW: 5 }, // out of the Loop
    { piece: 29, at: 0, len: 150, d: 14, halfW: 5 }, // into the Pressure Ridges
    { piece: 38, at: 0.1, len: 160, d: -14, halfW: 5 },
  ],
  gates: [
    { piece: 1, at: 0.6, d: -18, halfW: 4.5 }, // outside of T1
    { piece: 3, at: 0.6, d: 24, halfW: 4.5 }, // the caves
    { piece: 12, at: 0.5, d: -18, halfW: 4.5 }, // outside of the Seracs' right
    { piece: 16, at: 0.82, d: 18, halfW: 4.5 }, // off the line for the Calving
    { piece: 24, at: 0.5, d: -20, halfW: 4.5 }, // high on the Icefall's outside
    { piece: 37, at: 0.5, d: -18, halfW: 4.5 }, // outside of Homecoming
  ],
  pads: [
    { piece: 3, at: 0.45, len: 60, d: -24, halfW: 6 }, // the bridge
    { piece: 16, at: 0.88, len: 60, d: 0, halfW: 8 }, // into the Calving
  ],
};
