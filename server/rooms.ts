// The rooms the server offers.

import type { Server } from '@colyseus/core';
import { RaceRoom } from './raceRoom';
import { SquadRoom } from './squadRoom';

export function defineRooms(server: Server): void {
  // A private room, found by its code.
  server.define('race', RaceRoom);
  // Quick Play: a search is put into the fullest room of its playlist and
  // build with places for its party, or a new one (raceRoom.ts keeps each
  // room's listing up to date).
  server.define('quick', RaceRoom).filterBy(['quick', 'version', 'fit1', 'fit2', 'fit3']).sortBy({ people: -1 });
  server.define('squad', SquadRoom);
}
