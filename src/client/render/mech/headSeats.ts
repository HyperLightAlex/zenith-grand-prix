// Written by tools/head-seats.ts: do not edit by hand (run it again instead).
//
// How far (metres, up) a design's head is moved on another design's chest of
// its frame, so it sits on that chest's top, sunk into it only as far as the
// shallower of the two takes a head. By chest, then head; a head not listed
// sits where the skeleton puts it.
export const HEAD_SEATS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  sunhawk: { razor: 0.26, anubis: 0.5, seraph: -0.04, kamaitachi: -0.04 },
  razor: { sunhawk: 0.4, anubis: 0.3, seraph: -0.08, kamaitachi: -0.08 },
  anubis: { sunhawk: 0.38, razor: 0.04, seraph: -0.06, kamaitachi: -0.06 },
  seraph: { sunhawk: 0.46, razor: 0.32, anubis: 0.26 },
  kamaitachi: { sunhawk: 0.46, razor: 0.32, anubis: 0.28 },
  daystar: { stinger: 0.14 },
  stinger: { horus: 0.28, fujin: 0.04 },
  horus: { daystar: 0.18, stinger: 0.32, longbow: 0.08, fujin: 0.08 },
  longbow: { daystar: 0.1, stinger: 0.24 },
  fujin: { daystar: 0.1, stinger: 0.24 },
  rampart: { maul: 0.12, sobek: 0.4, paladin: 0.36, raijin: 0.16 },
  maul: { sobek: 0.26, paladin: 0.22, raijin: 0.04 },
  sobek: { rampart: -0.18, maul: -0.18, paladin: -0.18, raijin: -0.18 },
  paladin: { sobek: 0.04 },
  raijin: { sobek: 0.22, paladin: 0.18 },
};
