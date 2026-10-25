import { jump, type CircuitDef, type ForkSpec } from '../circuit';

// Monsoon Ruins: a jungle temple city in a downpour. From the line north
// through the plaza, east to the great pyramid and up the Stairway: three
// steep ramps zigzagging up its west face, two hairpins between them, then
// across its summit and off its far edge, through a ring of carved stone and
// over the gorge onto the plateau beyond. South along the river, over it,
// and down into its valley to where it pours into a sinkhole, the cenote, and
// down the Waterfall Corkscrew: twice
// round its wall, the falls dropping clear of the rim so the road passes
// behind them on every turn. Out at its foot through a cave in the cliff,
// west through the Rainforest, and home through the Temple Halls, a fork on
// the last bend: the tight inner route through the halls, walled and roofed,
// with the gate; or the raised causeway sweeping round the outside of them,
// with the pads. About 8.5 km, clockwise.
//
// The Stairway's, the cenote's and the Ring's measures are the road's, and
// the scenery takes them from here: src/client/render/monsoon.ts.

/** The Stairway's ramps and hairpins: its road's half width, and the hairpins' radius. */
export const STAIRWAY = { width: 20, hairpin: 55 };
/** The Waterfall Corkscrew: its radius at the top and at the foot, its turn and drop. */
export const CORKSCREW = { r0: 105, r1: 85, degrees: 720, drop: 84 };
/** The Ring the Summit Leap flies through: its radius, and its middle's height over the arc a mech flies. */
export const STONE_RING = { radius: 36, lift: 8 };

const HALLS: ForkSpec = {
  id: 'halls',
  median: 6,
  // The causeway sweeps round the outside, raised; the halls keep low on the inside.
  left: { shift: -40, rise: 8 },
  right: { shift: 26, rise: -2 },
};
const inHalls = { width: 40, fork: HALLS };
const stair = { width: STAIRWAY.width };
const R = STAIRWAY.hairpin;

export const MONSOON_RUINS: CircuitDef = {
  id: 'monsoon',
  name: 'Monsoon Ruins',
  theme: 'monsoon',
  halfWidth: 22,
  height: 14,
  bankGain: 70,
  maxBank: 0.3,
  pieces: [
    /*  0 */ { straight: 450, name: 'start straight' },
    /*  1 */ { turn: [160, 90], bank: 12, name: 'T1' },
    /*  2 */ { straight: 320, name: 'to the pyramid' },
    /*  3 */ { turn: [110, -90], bank: 10, name: 'T2' },
    /*  4 */ { climb: [340, 44], ...stair, name: 'the Stairway' },
    /*  5 */ { spiral: [R, R, 180, 14], ...stair, bank: 10, name: 'first hairpin' },
    /*  6 */ { climb: [340, 44], ...stair, name: 'second ramp' },
    /*  7 */ { spiral: [R, R, -180, 14], ...stair, bank: 10, name: 'second hairpin' },
    /*  8 */ { climb: [140, 26], ...stair, name: 'top ramp' },
    /*  9 */ { spiral: [90, 90, 90, 10], ...stair, bank: 10, name: 'onto the summit' },
    /* 10 */ { straight: 180, name: 'the summit' },
    ...jump({ ramp: 12, down: 16, speed: 100, gap: 0.7, land: 120 }), // 11-16 the Summit Leap, through the Ring
    /* 17 */ { straight: 200, name: 'the plateau' },
    /* 18 */ { turn: [150, 90], bank: 12, name: 'T3' },
    /* 19 */ { straight: 499, name: 'along the river' },
    /* 20 */ { turn: [220, -35], bank: 8, name: 'the river bend' },
    /* 21 */ { straight: 120 },
    /* 22 */ { turn: [220, 35], bank: 8 },
    /* 23 */ { climb: [200, -16], name: 'to the falls' },
    /* 24 */ { spiral: [CORKSCREW.r0, CORKSCREW.r1, CORKSCREW.degrees, -CORKSCREW.drop], bank: 18, name: 'the Waterfall Corkscrew' },
    /* 25 */ { straight: 200, name: 'the cave' },
    /* 26 */ { turn: [140, 90], bank: 12, name: 'T4' },
    /* 27 */ { straight: 120 },
    /* 28 */ { spiral: [150, 150, -50, -8], bank: 10, name: 'the Rainforest' },
    /* 29 */ { straight: 60 },
    /* 30 */ { spiral: [150, 150, 100, 14], bank: 10 },
    /* 31 */ { straight: 60 },
    /* 32 */ { spiral: [150, 150, -50, -6], bank: 10 },
    /* 33 */ { straight: 408, name: 'closing A' },
    /* 34 */ { climb: [300, 0], name: 'settle' },
    /* 35 */ { straight: 160, ...inHalls, name: 'the Temple Halls' },
    /* 36 */ { turn: [230, 90], ...inHalls, bank: 6 },
    /* 37 */ { straight: 140, ...inHalls },
    /* 38 */ { straight: 220, name: 'run to the line' },
  ],
  closeWith: [19, 33],
  settle: 34,
  strips: [
    { piece: 0, at: 0.3, len: 180, d: 12, halfW: 5 },
    { piece: 2, at: 0.2, len: 150, d: -10, halfW: 5 },
    { piece: 6, at: 0.3, len: 140, d: 6, halfW: 5 }, // up the second ramp
    { piece: 17, at: 0.2, len: 140, d: -10, halfW: 5 }, // on the plateau
    { piece: 24, at: 0.4, len: 200, d: 10, halfW: 5 }, // down the Corkscrew, behind the falls
    { piece: 33, at: 0.2, len: 180, d: 12, halfW: 5 },
    { piece: 36, at: 0.3, len: 120, d: 23, halfW: 5 }, // through the halls
    { piece: 38, at: 0.3, len: 150, d: -12, halfW: 5 },
  ],
  gates: [
    { piece: 1, at: 0.6, d: -16, halfW: 4.5 }, // outside of T1
    { piece: 4, at: 0.75, d: -8, halfW: 4.5 }, // near the top of the first ramp
    { piece: 18, at: 0.6, d: -16, halfW: 4.5 }, // outside of T3
    { piece: 24, at: 0.55, d: -12, halfW: 4.5 }, // on the Corkscrew's outside, against the cliff
    { piece: 30, at: 0.5, d: -14, halfW: 4.5 }, // outside of the Rainforest's right-hander
    { piece: 36, at: 0.5, d: 23, halfW: 4.5 }, // in the halls
  ],
  pads: [
    { piece: 10, at: 0.3, len: 50, d: 0, halfW: 8 }, // the summit, before the Leap
    { piece: 35, at: 0.3, len: 50, d: -23, halfW: 6 }, // onto the causeway
    { piece: 36, at: 0.55, len: 50, d: -23, halfW: 6 }, // round it
  ],
};
