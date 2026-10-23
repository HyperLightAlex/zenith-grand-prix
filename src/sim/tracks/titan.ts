import { jump, type CircuitDef, type ForkSpec } from '../circuit';

// Titan's Rest: a morning in a white desert, on and round a colossus that
// fell in a war long over, lying on its back half buried in the dunes. From
// the line onto its outstretched hand and up the Arm to the shoulder; along
// its collar and over its brow, through the Halo, the broken ring standing
// behind its head, rolling a full turn as it goes; off the crown in the
// Crown Drop. Back along its far side, the Long Flank, then in through
// the wound in its flank, the Breach: a full loop inside its ribs, and the
// Hull, a fork through its body (the corridors, walled and roofed, with the
// Cell; or the breastbone, high along the top of its chest and open on its
// outside, with the pad). Out the
// other side, up the wreckage to the hilt of its sword, driven into the
// sand at a slant, and the Sword: corkscrewing twice round down its blade
// to the point. Home across the dunes. Runs clockwise.

const HULL: ForkSpec = {
  id: 'hull',
  median: 6,
  // The corridors keep low through the body on the left; the breastbone runs high along the top of its chest on the right.
  left: { shift: -26, rise: -4 },
  right: { shift: 30, rise: 28 },
};
const inHull = { width: 40, fork: HULL };

export const TITANS_REST: CircuitDef = {
  id: 'titan',
  name: "Titan's Rest",
  theme: 'titan',
  halfWidth: 26,
  height: 20,
  bankGain: 70,
  maxBank: 0.3,
  pieces: [
    /*  0 */ { straight: 450, name: 'start straight' },
    /*  1 */ { climb: [220, 40], name: 'the Palm' },
    /*  2 */ { climb: [480, 140], width: 24, name: 'the Arm' },
    /*  3 */ { turn: [140, -90], bank: 12, name: 'T1 the Shoulder' },
    /*  4 */ { straight: 100, name: 'the Collar' },
    /*  5 */ { straight: 160, name: 'the Brow' },
    /*  6 */ { roll: [260, -360], width: 22, name: 'the Halo' },
    /*  7 */ { straight: 60 },
    ...jump({ ramp: 8, down: 30, speed: 100, gap: 0.78, land: 100 }), // 8-13 the Crown Drop
    /* 14 */ { climb: [260, -62], name: 'down to the sand' },
    /* 15 */ { turn: [180, 90], bank: 12, name: 'T2' },
    /* 16 */ { straight: 200, name: 'closing A' },
    /* 17 */ { turn: [180, 90], bank: 12, name: 'T3' },
    /* 18 */ { straight: 900, name: 'the Long Flank' },
    /* 19 */ { turn: [700, -10], name: 'under the Elbow' },
    /* 20 */ { turn: [700, 10] },
    /* 21 */ { straight: 900 },
    /* 22 */ { turn: [160, 90], bank: 14, name: 'T4 the Breach' },
    /* 23 */ { straight: 80 },
    /* 24 */ { loop: [72, 70], name: 'the Ribcage' },
    /* 25 */ { straight: 60 },
    /* 26 */ { straight: 520, ...inHull, open: 'right', name: 'the Hull' },
    /* 27 */ { straight: 100 },
    /* 28 */ { climb: [440, 190], name: 'up to the hilt' },
    /* 29 */ { pitch: [200, -28], name: 'over the crossguard' },
    /* 30 */ { barrel: [300, 720, -40], width: 20, name: 'the Sword' },
    /* 31 */ { pitch: [200, 28], name: 'off the point' },
    /* 32 */ { straight: 310 },
    /* 33 */ { turn: [200, 90], bank: 14, name: 'T5' },
    /* 34 */ { straight: 300, name: 'the home dunes' },
    /* 35 */ { climb: [200, 0], name: 'settles the height' },
    /* 36 */ { turn: [180, 90], bank: 16, name: 'T6 Homecoming' },
    /* 37 */ { straight: 200, name: 'run to the line' },
  ],
  closeWith: [16, 34],
  settle: 35,
  strips: [
    { piece: 0, at: 0.3, len: 180, d: 14, halfW: 5 },
    { piece: 2, at: 0.35, len: 180, d: -12, halfW: 5 }, // up the arm
    { piece: 5, at: 0, len: 150, d: 12, halfW: 5 }, // over the brow
    { piece: 18, at: 0.2, len: 200, d: -14, halfW: 5 }, // the Long Flank
    { piece: 21, at: 0.4, len: 200, d: 14, halfW: 5 },
    { piece: 26, at: 0.3, len: 200, d: -23, halfW: 5 }, // the corridors
    { piece: 32, at: 0.1, len: 180, d: 0, halfW: 5 }, // off the sword's point
    { piece: 34, at: 0, len: 150, d: 14, halfW: 5 },
  ],
  gates: [
    { piece: 3, at: 0.6, d: 16, halfW: 4.5 }, // outside of the Shoulder
    { piece: 15, at: 0.5, d: -18, halfW: 4.5 }, // outside of T2
    { piece: 22, at: 0.6, d: -18, halfW: 4.5 }, // outside of the Breach
    { piece: 26, at: 0.65, d: -24, halfW: 4.5 }, // the corridors
    { piece: 28, at: 0.5, d: 16, halfW: 4.5 }, // up to the hilt
    { piece: 33, at: 0.5, d: -18, halfW: 4.5 }, // outside of T5
  ],
  pads: [
    { piece: 26, at: 0.4, len: 60, d: 24, halfW: 6 }, // the breastbone
    { piece: 7, at: 0, len: 50, d: 0, halfW: 8 }, // into the Crown Drop
  ],
};
