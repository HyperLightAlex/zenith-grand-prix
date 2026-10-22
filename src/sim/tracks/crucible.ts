import { spiralRun, type CircuitDef, type PieceProps } from '../circuit';
import { GRAVITY } from '../config';

// Neon Crucible: the vertical one, at night, in and over an open-pit mine
// lit with neon, molten metal glowing at the bottom. Out across the pit on
// the start straight, then the Leap, a jump over the middle of it, straight
// into the Hook: three quarters of a loop that lets go pointing straight
// down, so the field falls through the Plunge, the gap the Leap has just
// flown across (the two jumps cross at right angles). The road picks them
// up still going straight down, the Drill: two barrel rolls down a wall to
// the floor, the Hearth. Then the Coil, the mine's haul road, climbs back
// up round the drop, four and a quarter turns, each wider than the last,
// with no barrier on the inside for one turn half way up: a knock that way
// is a fall into the pit. Out at the rim and round onto the start straight.
// Runs clockwise.

/** The Leap: cleared at the formation-lap limiter (110), not much short of it. */
const LEAP_SPEED = 100;
const CREST = (LEAP_SPEED * LEAP_SPEED) / GRAVITY;
const RAMP = 14;
const DOWN = 10;
const GAP = 0.75;
const ARC = RAMP + DOWN;
const LIP = (ARC * (1 - GAP)) / 2;

/** The Coil, as one spiral cut in three: open on the inside for the one turn between 450 and 900 degrees, walled below and above. */
const COIL_DEGREES = 1545;
const COIL_CUTS = [450, 900];
const COIL: PieceProps[] = [{ name: 'the Coil, bottom turns' }, { open: 'right', name: 'the Coil, open turn' }, { name: 'the Coil, top turns' }];

export const CRUCIBLE: CircuitDef = {
  id: 'crucible',
  name: 'Neon Crucible',
  theme: 'crucible',
  halfWidth: 24,
  height: 450,
  bankGain: 70,
  maxBank: 0.3,
  pieces: [
    /*  0 */ { straight: 500, name: 'start straight' },
    /*  1 */ { pitch: [CREST * 0.6, RAMP], name: 'the Leap' },
    /*  2 */ { pitch: [CREST, -LIP], name: 'lip' },
    /*  3 */ { pitch: [CREST, -ARC * GAP], gap: true, name: 'gap' },
    /*  4 */ { pitch: [CREST, -LIP], name: 'landing' },
    /*  5 */ { straight: 20, name: 'landing slope' },
    // From the landing slope straight up and over: it lets go pointing down,
    // 0.83 of its radius back, over the middle of the Leap's gap.
    /*  6 */ { pitch: [80, 270 + DOWN], width: 20, name: 'the Hook' },
    /*  7 */ { straight: 110, gap: true, width: 20, name: 'the Plunge' },
    /*  8 */ { roll: [300, 720], width: 20, name: 'the Drill' },
    /*  9 */ { pitch: [70, 90], width: 22, name: 'pull-out' },
    /* 10 */ { straight: 20, name: 'the Hearth' },
    /* 11 */ { turn: [45, 90], name: 'the Hearth hairpin' },
    // 12-14 the Coil: the haul road up the pit wall, round the drop.
    ...spiralRun({ r0: 135, r1: 360, degrees: COIL_DEGREES, grade: 0.0575, cuts: COIL_CUTS, parts: COIL, props: { width: 26, bank: 14 } }),
    /* 15 */ { straight: 200, name: 'the Rim' },
    /* 16 */ { climb: [300, 10], name: 'up to the line' },
    /* 17 */ { turn: [120, 165], bank: 10, name: 'the Gantry turn' },
    /* 18 */ { straight: 120, name: 'run to the line' },
  ],
  closeWith: [0, 15],
  settle: 16,
  strips: [
    { piece: 0, at: 0.04, len: 170, d: 14, halfW: 5 },
    { piece: 12, at: 0.22, len: 210, d: -15, halfW: 5 }, // up the bottom turn, on the wall side
    { piece: 12, at: 0.7, len: 200, d: 12, halfW: 5 },
    { piece: 13, at: 0.35, len: 200, d: 12, halfW: 5 }, // the open turn, nearer the drop
    { piece: 14, at: 0.08, len: 200, d: -15, halfW: 5 },
    { piece: 14, at: 0.4, len: 200, d: 12, halfW: 5 },
    { piece: 14, at: 0.72, len: 200, d: -15, halfW: 5 },
    { piece: 15, at: 0.05, len: 190, d: -14, halfW: 5 },
  ],
  gates: [
    { piece: 0, at: 0.6, d: -16, halfW: 4.5 }, // out on the start straight, off the line for the Leap
    { piece: 12, at: 0.1, d: -19, halfW: 4.5 }, // out of the hairpin, high on the wall
    { piece: 13, at: 0.15, d: 15, halfW: 4.5 }, // by the open edge
    { piece: 14, at: 0.25, d: -19, halfW: 4.5 }, // high on the wall
    { piece: 14, at: 0.85, d: 15, halfW: 4.5 }, // inside, on the top turn
    { piece: 17, at: 0.5, d: -18, halfW: 4.5 }, // outside of the Gantry turn
  ],
  pads: [
    { piece: 0, at: 0.82, len: 60, d: 0, halfW: 7 }, // into the Leap
    { piece: 13, at: 0.7, len: 60, d: -4, halfW: 7 },
  ],
};
