// Written by tools/head-seats.ts: do not edit by hand (run it again instead).
//
// How far (metres, up) a design's head is moved on another design's chest of
// its frame, so it sits on that chest's top, sunk into it only as far as the
// shallower of the two takes a head. By chest, then head; a head not listed
// sits where the skeleton puts it.
export const HEAD_SEATS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  sunhawk: { razor: 0.26, anubis: -0.04, seraph: -0.04, kamaitachi: -0.04 },
  razor: { sunhawk: 0.4, anubis: -0.02, seraph: -0.08, kamaitachi: -0.08 },
  anubis: { sunhawk: 0.38, razor: 0.26, seraph: -0.02, kamaitachi: -0.02 },
  seraph: { sunhawk: 0.46, razor: 0.32, anubis: 0.06 },
  kamaitachi: { sunhawk: 0.46, razor: 0.32, anubis: 0.06 },
  daystar: { stinger: 0.14 },
  horus: { daystar: 0.18, stinger: 0.32, longbow: 0.08, fujin: 0.08 },
  longbow: { daystar: 0.1, stinger: 0.24 },
  fujin: { daystar: 0.1, stinger: 0.24 },
  rampart: { maul: 0.12, sobek: 0.58, paladin: 0.36, raijin: 0.16 },
  maul: { sobek: 0.46, paladin: 0.22, raijin: 0.04 },
  paladin: { sobek: 0.24 },
  raijin: { sobek: 0.42, paladin: 0.18 },
};
