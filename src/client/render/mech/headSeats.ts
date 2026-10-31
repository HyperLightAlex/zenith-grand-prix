// Written by tools/head-seats.ts: do not edit by hand (run it again instead).
//
// Shipped geometry's seating snapshot: metres up, by chest then donor head.
// Includes authored neck interfaces and reviewed pair corrections. Native
// assets use nativeMounts.ts directly; the generator independently verifies
// every native pair against it. Legacy-only pairs use this fallback table.
// An omitted pair preserves the receiving skeleton's head position.
export const HEAD_SEATS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  sunhawk: { razor: 0.26, anubis: -0.04, seraph: 0.06, kamaitachi: 0.06 },
  razor: { sunhawk: 0.1, anubis: -0.02, seraph: 0.1, kamaitachi: 0.16 },
  anubis: { sunhawk: 0.08, razor: 0.26, seraph: 0.12, kamaitachi: 0.18 },
  seraph: { sunhawk: 0.06, razor: 0.34, anubis: 0.04, kamaitachi: 0.12 },
  kamaitachi: { sunhawk: -0.06, razor: 0.22, anubis: -0.08 },
  daystar: { stinger: 0.04, horus: -0.1, fujin: -0.06 },
  stinger: { horus: -0.06, fujin: 0.02 },
  horus: { daystar: 0.26, stinger: 0.32, longbow: 0.08, fujin: 0.1 },
  longbow: { daystar: 0.2, stinger: 0.24, horus: -0.08, fujin: 0.02 },
  fujin: { daystar: 0.2, stinger: 0.24, horus: -0.08 },
  rampart: { sobek: 0.42, paladin: 0.18 },
  maul: { rampart: 0.04, sobek: 0.46, paladin: 0.22, raijin: 0.04 },
  sobek: { rampart: -0.3, maul: -0.3, paladin: -0.24, raijin: -0.3 },
  paladin: { sobek: 0.24 },
  raijin: { sobek: 0.42, paladin: 0.18 },
};
