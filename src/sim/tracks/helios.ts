import { jump, type CircuitDef, type ForkSpec } from '../circuit';

// Helios Drop: the fast one, built for air, high above a sea of cloud. A
// long climb to the Drop, a jump over open sky; a full loop; the Carousel, a
// big banked right you can hold flat out; Split Decision, a fork where the
// left route is a speed pad and a second jump and the right route is the
// safe way with the Drive and the Cell; and the Skyline crest, which only
// throws you into the air at speed-lap pace. Runs clockwise.

const SPLIT: ForkSpec = {
  id: 'split',
  median: 6,
  // The jump route climbs away to the left; the safe route keeps low.
  left: { shift: -36, rise: 18 },
  right: { shift: 30, rise: -6 },
};
const inSplit = { width: 42, fork: SPLIT };

export const HELIOS: CircuitDef = {
  id: 'helios',
  name: 'Helios Drop',
  theme: 'helios',
  halfWidth: 28,
  height: 90,
  bankGain: 70,
  maxBank: 0.3,
  pieces: [
    /*  0 */ { straight: 360, name: 'start straight' },
    /*  1 */ { turn: [520, 90], bank: 16, name: 'T1 Sunward' },
    /*  2 */ { straight: 400 },
    /*  3 */ { climb: [560, 70], name: 'the long climb' },
    /*  4 */ { straight: 220, name: 'top of the climb' },
    ...jump({ ramp: 22, down: 10, speed: 106, gap: 0.88, land: 200 }), // 5-10 the Drop
    /* 11 */ { climb: [440, -85], name: 'down off the Drop' },
    /* 12 */ { straight: 240 },
    /* 13 */ { turn: [300, 90], bank: 20, name: 'T2 Overlook' },
    /* 14 */ { straight: 200, name: 'closing A' },
    /* 15 */ { loop: [62, 74], name: 'the Loop' },
    /* 16 */ { straight: 240 },
    /* 17 */ { pitch: [620, 6], name: 'the Skyline' },
    /* 18 */ { pitch: [620, -12] },
    /* 19 */ { pitch: [620, 6] },
    /* 20 */ { straight: 120 },
    /* 21 */ { turn: [330, 140], bank: 42, width: 32, name: 'T3 the Carousel' },
    /* 22 */ { straight: 140 },
    /* 23 */ { turn: [420, -50], bank: 10, name: 'T4 the Unwind' },
    /* 24 */ { straight: 220, ...inSplit, name: 'Split Decision' },
    ...jump({ ramp: 14, down: 8, speed: 112, gap: 0.88, land: 120, side: 'left', props: inSplit }), // 25-30
    /* 31 */ { straight: 200, ...inSplit },
    /* 32 */ { straight: 300, name: 'closing B' },
    /* 33 */ { climb: [400, -20], name: 'settles the height' },
    /* 34 */ { turn: [300, 90], bank: 20, name: 'T5 Homecoming' },
    /* 35 */ { straight: 220, name: 'run to the line' },
  ],
  closeWith: [14, 32],
  settle: 33,
  strips: [
    { piece: 0, at: 0.25, len: 200, d: 14, halfW: 5 },
    { piece: 2, at: 0.1, len: 200, d: -15, halfW: 5 },
    { piece: 16, at: 0.1, len: 180, d: 0, halfW: 5 },
    { piece: 24, at: 0.1, len: 190, d: 24, halfW: 5 }, // safe route of Split Decision
    { piece: 31, at: 0.0, len: 180, d: -24, halfW: 5 }, // after the jump route's landing
    { piece: 32, at: 0.2, len: 200, d: -14, halfW: 5 },
  ],
  gates: [
    { piece: 1, at: 0.6, d: -18, halfW: 4.5 }, // outside of Sunward
    { piece: 12, at: 0.5, d: 16, halfW: 4.5 },
    { piece: 21, at: 0.55, d: -24, halfW: 4.5 }, // high on the Carousel's wall
    { piece: 28, at: 0.5, d: 24, halfW: 4.5 }, // safe route of Split Decision, over the hump
    { piece: 20, at: 0.5, d: -17, halfW: 4.5 },
    { piece: 35, at: 0.5, d: 17, halfW: 4.5 },
  ],
  pads: [
    { piece: 24, at: 0.55, len: 60, d: -24, halfW: 6 }, // jump route of Split Decision
    { piece: 16, at: 0.6, len: 60, d: 0, halfW: 8 }, // run-up to the Skyline
  ],
};
