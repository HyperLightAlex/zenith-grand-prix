// The factions' names and pilots, for the server and anything else that
// cannot load the client's palette (which brings three.js with it). A test
// checks these against the palette.

export const FACTION_NAMES = ['Team Solstice', 'Team Vanta', 'Team Mirage', 'Team Aurora', 'Team Tempest'] as const;

/** Each faction's pilots by role: forward, midfielder, defender. */
export const PILOT_NAMES: ReadonlyArray<readonly [string, string, string]> = [
  ['Kite', 'Lark', 'Atlas'],
  ['Shrike', 'Moth', 'Golem'],
  ['Sirocco', 'Ibis', 'Dune'],
  ['Orion', 'Vesper', 'Bastion'],
  ['Squall', 'Gale', 'Anvil'],
];
