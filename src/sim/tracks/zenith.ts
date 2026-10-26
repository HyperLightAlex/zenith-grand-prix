import { jump, type CircuitDef, type ForkSpec } from '../circuit';

// Zenith Ring: the finale, in orbit, on a station high over the Earth. From
// the line, north into the Ring (a wheel standing on edge, its axle the
// station's spine, running east), in through the Intake at the foot of its
// band and up its inside, the road curving up ahead and over your head;
// through the Hatch at the top, rolling over onto the outside of the band,
// and down its far side upside down, the Earth overhead; out from under it
// and upright again. East up the Spine to the core, then the Möbius: a loop
// round the core whose road barrel rolls all the way round it, a full turn
// to each third, up the inside, over the top on the outside (half way
// through the middle roll) and down the inside again. South
// off the core onto the Mass Driver, a run of speed pads between glowing
// coils that throws you off its end, across open space and through the
// docking ring onto the module beyond; the Dock, a fork through the module
// (walled and roofed, with the Cell) or over its back (open on its outside,
// with the pad); then the Solar Wings, bends over the arrays with no barrier
// on their outsides, and home down the station's south side to the line.
// 9 km, clockwise.
//
// The Ring's measures (its centre, its band) are the road's, and the
// scenery takes them from here: src/client/render/zenith.ts.

/** The Ring: the radius of its band's inner face (the road up the inside), the band's thickness (the road down the outside runs on its outer face) and how far the road moves across it on the way round. */
export const RING = { radius: 260, band: 28, across: 84 };
/** The Möbius: the radius of its loop round the core, and how far along the core it moves on the way round. */
export const MOBIUS = { radius: 110, across: 90 };

// The Ring's 360 degrees: up the inside, through the Hatch, down the outside;
// each moving across the band in proportion to its length.
const IN_DEG = 150;
const HATCH_DEG = 60;
const OUT_DEG = 360 - IN_DEG - HATCH_DEG;
const lenIn = RING.radius * IN_DEG;
const lenHatch = (RING.radius + RING.band / 2) * HATCH_DEG;
const lenOut = (RING.radius + RING.band) * OUT_DEG;
const share = (l: number) => (RING.across * l) / (lenIn + lenHatch + lenOut);

const DOCK: ForkSpec = {
  id: 'dock',
  median: 6,
  // The left route runs through the module, walled and roofed; the right
  // runs over its back, open on its outside, with the pad.
  left: { shift: -26, rise: -2 },
  right: { shift: 28, rise: 26 },
  // Too short (round the station's module) to part gently enough to steer: the routes carry a mech apart.
  carried: true,
};
const inDock = { width: 40, fork: DOCK };

export const ZENITH_RING: CircuitDef = {
  id: 'zenith',
  name: 'Zenith Ring',
  theme: 'zenith',
  halfWidth: 24,
  height: 120,
  bankGain: 70,
  maxBank: 0.3,
  pieces: [
    /*  0 */ { straight: 300, name: 'start straight' },
    /*  1 */ { straight: 160, name: 'the Intake' },
    /*  2 */ { pitch: [RING.radius, IN_DEG, share(lenIn)], name: 'up the inside' },
    /*  3 */ { twist: [RING.radius, HATCH_DEG, 180, share(lenHatch), RING.band], name: 'the Hatch' },
    // Rolled over, the road's right is the other way across the band.
    /*  4 */ { pitch: [RING.radius + RING.band, -OUT_DEG, -share(lenOut)], hold: true, name: 'down the outside' },
    /*  5 */ { straight: 80, hold: true, name: 'the Underside' },
    /*  6 */ { roll: [180, 180], name: 'out from under' },
    /*  7 */ { straight: 40 },
    /*  8 */ { turn: [160, 90], bank: 12, name: 'T1' },
    /*  9 */ { straight: 100 },
    /* 10 */ { climb: [1040, 178], name: 'up the Spine' },
    /* 11 */ { straight: 100 },
    /* 12 */ { turn: [160, 90], bank: 12, name: 'T2' },
    /* 13 */ { straight: 300 },
    // A loop round the core, barrel rolling the whole way round: a full roll
    // up its inside, another over the top (onto its outside half way, over
    // the core) and a third down its inside, each easing in and out. (One
    // slow roll over the whole loop turned the road under a mech nearly 80
    // degrees one way and back; a roll to each third, 25.)
    /* 14 */ { twist: [MOBIUS.radius, 120, 360, MOBIUS.across / 3], width: 20, name: 'the Möbius' },
    /* 15 */ { twist: [MOBIUS.radius, 120, 360, MOBIUS.across / 3], width: 20, name: 'over the core' },
    /* 16 */ { twist: [MOBIUS.radius, 120, 360, MOBIUS.across / 3], width: 20 },
    /* 17 */ { straight: 60 },
    /* 18 */ { straight: 300, name: 'the Mass Driver' },
    ...jump({ ramp: 10, down: 24, speed: 105, gap: 0.75, land: 160 }), // 19-24 the docking ring
    /* 25 */ { straight: 40 },
    /* 26 */ { straight: 300, ...inDock, open: 'right', name: 'the Dock' },
    /* 27 */ { straight: 40 },
    /* 28 */ { turn: [160, 90], bank: 12, name: 'T3' },
    /* 29 */ { straight: 100, name: 'closing A' },
    /* 30 */ { turn: [240, -40], open: 'right', name: 'the Solar Wings' },
    /* 31 */ { straight: 60, open: 'both' },
    /* 32 */ { turn: [240, 80], open: 'left' },
    /* 33 */ { straight: 60, open: 'both' },
    /* 34 */ { turn: [240, -40], open: 'right' },
    /* 35 */ { climb: [320, -64], name: 'down off the wings' },
    /* 36 */ { straight: 100 },
    /* 37 */ { turn: [160, 90], bank: 14, name: 'T4' },
    /* 38 */ { straight: 300, name: 'run to the line' },
  ],
  closeWith: [29, 38],
  settle: 35,
  strips: [
    { piece: 0, at: 0.3, len: 180, d: 12, halfW: 5 },
    { piece: 5, at: 0, len: 80, d: 0, halfW: 5 }, // the Underside, upside down
    { piece: 10, at: 0.15, len: 200, d: -12, halfW: 5 }, // up the Spine
    { piece: 10, at: 0.6, len: 200, d: 12, halfW: 5 },
    { piece: 13, at: 0.2, len: 150, d: 0, halfW: 5 }, // to the core
    { piece: 26, at: 0.2, len: 120, d: -23, halfW: 5 }, // through the module
    { piece: 35, at: 0.2, len: 150, d: 12, halfW: 5 }, // down off the wings
    { piece: 38, at: 0.3, len: 150, d: -12, halfW: 5 },
  ],
  gates: [
    { piece: 8, at: 0.6, d: -16, halfW: 4.5 }, // outside of T1
    { piece: 12, at: 0.6, d: -16, halfW: 4.5 }, // outside of T2
    { piece: 26, at: 0.65, d: -24, halfW: 4.5 }, // through the module
    { piece: 28, at: 0.6, d: -16, halfW: 4.5 }, // outside of T3
    { piece: 32, at: 0.5, d: -16, halfW: 4.5 }, // outside of the wings' right-hander, nothing past it
    { piece: 37, at: 0.6, d: -16, halfW: 4.5 }, // outside of T4
  ],
  pads: [
    // The Mass Driver.
    { piece: 18, at: 0.12, len: 50, d: -10, halfW: 7 },
    { piece: 18, at: 0.42, len: 50, d: 10, halfW: 7 },
    { piece: 18, at: 0.72, len: 50, d: 0, halfW: 8 },
    { piece: 26, at: 0.4, len: 60, d: 24, halfW: 6 }, // over the module's back
    { piece: 10, at: 0.42, len: 50, d: 0, halfW: 7 }, // half way up the Spine, between its strips
    { piece: 38, at: 0.4, len: 50, d: 12, halfW: 6 }, // the run to the line: the pad on the right, or the strip on the left
  ],
};
