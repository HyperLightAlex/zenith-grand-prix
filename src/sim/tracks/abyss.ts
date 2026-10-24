import { jump, type CircuitDef, type ForkSpec } from '../circuit';

// Abyss Line: glass tubes on the sea floor beside an undersea town, a
// hundred metres down. From the line, inside the edge of the town's dome,
// north and then east through the Braid: a fork whose two tubes twist round
// each other twice like a double helix, crossing over and under, the other
// strand in view all the way. South over the shelf's edge and down into the
// trench, along its floor through the Twist (a long straight on which the
// road runs twice round the inside of its tube, slow and dreamy), up out of
// it and west down the Run-up's pad to the Trench Leap, out of the broken
// end of the tube across a chasm. North into the town through the Lantern
// Streets, then the Dome Run: up the inside of the town's great glass dome,
// across under its roof upside down with the town's lights overhead, and
// down; and out to the line. 8.3 km, clockwise.
//
// The Dome's and the Twist's measures are the road's, and the scenery takes
// them from here: src/client/render/abyss.ts.

/** The Dome: the radius of its glass (the road across its roof runs just under it), and how far the road moves across on the way round. */
export const DOME = { radius: 330, under: 8, across: 66 };
/** The Twist: the radius of its tube (the road runs round its inside), its length and turns. */
export const TWIST = { radius: 26, length: 700, turns: 2 };

const BRAID: ForkSpec = { id: 'braid', median: 6, braid: { turns: 2, radius: 36 } };
const inBraid = { width: 44, fork: BRAID };

// The Dome Run: up from its floor on a tight arc, across under its roof on
// one concentric with the glass, down the far side on another tight arc.
const TOP = DOME.radius - DOME.under;
const TOP_DEG = 60;
const SIDE_DEG = (360 - TOP_DEG) / 2;
/** The tight arcs' radius, so the arc across the roof is centred on the dome's middle, on its floor. */
const SIDE_R = (TOP * Math.cos(((TOP_DEG / 2) * Math.PI) / 180)) / (1 - Math.cos((SIDE_DEG * Math.PI) / 180));
const lenSide = SIDE_R * SIDE_DEG;
const lenTop = TOP * TOP_DEG;
const across = (l: number) => (DOME.across * l) / (2 * lenSide + lenTop);

export const ABYSS_LINE: CircuitDef = {
  id: 'abyss',
  name: 'Abyss Line',
  theme: 'abyss',
  halfWidth: 22,
  height: 20,
  bankGain: 70,
  maxBank: 0.3,
  pieces: [
    /*  0 */ { straight: 400, name: 'start straight' },
    /*  1 */ { turn: [180, 90], bank: 12, name: 'T1' },
    /*  2 */ { straight: 80 },
    /*  3 */ { straight: 900, ...inBraid, name: 'the Braid' },
    /*  4 */ { straight: 380 },
    /*  5 */ { turn: [180, 90], bank: 12, name: 'T2' },
    /*  6 */ { straight: 60, name: 'the Shelf Edge' },
    /*  7 */ { climb: [560, -130], name: 'the Descent' },
    /*  8 */ { straight: 60 },
    /*  9 */ { barrel: [TWIST.length, 360 * TWIST.turns, TWIST.radius], width: 20, name: 'the Twist' },
    /* 10 */ { straight: 60 },
    /* 11 */ { turn: [180, 90], bank: 12, name: 'T3' },
    /* 12 */ { climb: [600, 130], name: 'the Ascent' },
    /* 13 */ { straight: 220, name: 'the Run-up' },
    ...jump({ ramp: 10, down: 18, speed: 105, gap: 0.75, land: 120 }), // 14-19 the Trench Leap
    /* 20 */ { straight: 60 },
    /* 21 */ { straight: 200, name: 'closing A' },
    /* 22 */ { turn: [180, 90], bank: 12, name: 'T4' },
    /* 23 */ { climb: [300, 0], name: 'up to the town' },
    /* 24 */ { straight: 60, name: 'into the town' },
    /* 25 */ { turn: [130, -40], bank: 8, name: 'the Lantern Streets' },
    /* 26 */ { straight: 40 },
    /* 27 */ { turn: [130, 80], bank: 8 },
    /* 28 */ { straight: 40 },
    /* 29 */ { turn: [130, -40], bank: 8 },
    /* 30 */ { straight: 60 },
    /* 31 */ { pitch: [SIDE_R, SIDE_DEG, across(lenSide)], name: 'the Dome Run' },
    /* 32 */ { pitch: [TOP, TOP_DEG, across(lenTop)], name: 'under the roof' },
    /* 33 */ { pitch: [SIDE_R, SIDE_DEG, across(lenSide)] },
    /* 34 */ { straight: 200, name: 'out of the town' },
    /* 35 */ { straight: 300, name: 'run to the line' },
  ],
  closeWith: [21, 35],
  settle: 23,
  strips: [
    { piece: 0, at: 0.3, len: 180, d: 12, halfW: 5 },
    { piece: 3, at: 0.25, len: 200, d: -25, halfW: 5 }, // the Braid's left strand
    { piece: 7, at: 0.2, len: 200, d: -10, halfW: 5 }, // down into the trench
    { piece: 9, at: 0.2, len: 220, d: 8, halfW: 5 }, // round the Twist
    { piece: 12, at: 0.3, len: 200, d: 10, halfW: 5 }, // up out of it
    { piece: 21, at: 0, len: 150, d: -12, halfW: 5 },
    { piece: 34, at: 0.1, len: 150, d: -10, halfW: 5 }, // out of the town
    { piece: 35, at: 0.3, len: 150, d: 12, halfW: 5 },
  ],
  gates: [
    { piece: 1, at: 0.6, d: -16, halfW: 4.5 }, // outside of T1
    { piece: 3, at: 0.7, d: -25, halfW: 4.5 }, // the Braid's left strand
    { piece: 5, at: 0.6, d: -16, halfW: 4.5 }, // outside of T2
    { piece: 9, at: 0.5, d: -8, halfW: 4.5 }, // half way round the Twist
    { piece: 11, at: 0.6, d: -16, halfW: 4.5 }, // outside of T3
    { piece: 22, at: 0.6, d: -16, halfW: 4.5 }, // outside of T4
  ],
  pads: [
    { piece: 3, at: 0.45, len: 60, d: 25, halfW: 6 }, // the Braid's right strand
    { piece: 13, at: 0.35, len: 50, d: 0, halfW: 8 }, // the Run-up to the Leap
  ],
};
