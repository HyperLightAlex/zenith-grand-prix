# Online play: how it works and how to host it

Zenith GP's online mode is private rooms for up to six people, found by a
5-character code or an invite link, with computer pilots in the empty seats.
Friends can form a **squad** of up to three that moves from room to room
together and always takes the same team. There is no matchmaking yet, and
no accounts.

## Hosting it

The server is one Node process. It serves the built game and runs the
rooms, both on one port. It runs behind a domain the same way Dead End Dash's
server does.

```sh
npm install
npm run build      # the game into dist/, the server into dist-server/
npm start          # http://localhost:8090: the game and its rooms
```

Open `http://localhost:8090`. For friends on the same network, share
`http://<your-LAN-address>:8090`. For friends elsewhere, point your domain
(or a tunnel) at that port. WebSockets have to pass through whatever sits in
front. The game always talks to the address that served the page, so nothing
is configured per domain. It also works below a path (`example.com/zenith/`)
if the proxy passes that path through.

| Environment | Default | What it does |
|---|---|---|
| `PORT` | 8090 | The port (Dead End Dash's default is 8080, so the two can run side by side) |
| `HOST` | 0.0.0.0 | The address to listen on |
| `ALLOWED_ORIGINS` | any | Comma-separated origins allowed to create and join rooms (set it on a public server, e.g. `https://zenith.example.com`) |
| `FORWARDED_HOPS` | unset | Where a player's address is: `0` if players connect straight to this server, `1` behind one proxy you run (read from `X-Forwarded-For`), and so on. Unset, the per-address limit on trying codes is off, because behind a proxy every player shares one address |
| `ROOMS_ONLY` | unset | `1`: serve the rooms and the health check, no game files |
| `STATIC_DIR` | `dist/` | Where the built game is |
| `QUIET` | unset | `1`: no log lines |
| `TEST_LAPS` | unset | Testing only: races of this many laps |

Endpoints:

| | |
|---|---|
| `GET /` and static files | The built game. Hashed assets are cached for a year; everything else is revalidated |
| `GET /health` (and `/healthz`) | `ok` |
| `/matchmake/...` | Colyseus: create a room or squad, join one by code |
| WebSocket `/<process>/<room>` | Colyseus: a room's connection |

`SIGTERM` closes the rooms cleanly. A restart ends every room in progress;
players see "You lost the connection to the room" and go back to the
Online screen.

**Updates.** The build is stamped with the package version and the commit
(`dist/build.json`). A page from an older build cannot make or join rooms
("The game has been updated: reload the page"), and a room only takes players
on the build that made it. Deploy by building and restarting. Players on an
open page are told to reload.

**Development.** `npm run dev` serves the game on 5173 with hot reload, and
`npm run server` runs the room server on 8090, restarting when its code
changes. The dev page finds the server on port 8090 of the same host by
itself. `?server=URL` on the page points it at another server, and
`&player=2` gives a tab its own identity, so two tabs of one browser can be
two players.

## What a player sees

- **Online hub.** Your squad in the hangar's three bays, with Create room,
  Join room, Invite to squad, Join a squad and your callsign. Entering Online
  makes you the leader of a squad of one.
- **Callsign.** Asked for once, 3 to 16 characters, passed through a short
  word filter, and changeable on the hub.
- **Room.** Two teams of three seats, with the host's settings (circuit,
  format, computer pilots' skill), Ready, Invite, and Leave. Pick an empty
  seat on either team to move into it, or someone's seat to ask them to
  swap (one question per ask, however often it is asked). The host can
  remove someone from their seat's menu. A team's faction is picked with
  its name above its seats: by its captain (whoever sat there first), or
  by the host, who can set both teams', including a team of computer
  pilots. Y opens the hangar to change frame. When everyone connected is
  ready, a 5-second countdown starts; any change cancels it. The host can
  start early.
- **Shot caller.** On a team of two people and one computer pilot, one of the
  two gives the computer pilot its orders. It starts with the team's captain
  (or the squad leader) and can be passed on or asked for. Alone with two
  computer pilots you call automatically. A team of three has nobody to
  order.
- **In the race.** Start opens the pause menu, but the race carries on and
  your seat's computer pilot flies until you resume. Hit-stop and the
  knockout still only hold your picture, which then catches up. There is no
  slow motion online.
- **Dropping out.** Your seat is kept for 60 seconds, with its computer pilot
  flying. Reloading the page, or opening the invite link again, puts you
  back. After 60 seconds the computer keeps the seat until the match ends.
  If the shot caller drops, their teammate calls. If everyone on a team
  drops, the computer captain takes over.
- **Between rounds.** The next round starts when everyone presses Continue,
  or after 15 seconds. After the match the final results stay up for 10
  seconds, then everyone is back in the lobby with their seats. A rematch is
  just readying up again.
- **Late arrivals** wait on the room screen and take a computer pilot's seat
  at the next round.
- **Squads.** The leader picks the faction and takes everyone into rooms:
  when the leader makes or joins a room, the others follow by themselves. The
  room holds seats on one team for them for 20 seconds; someone slower than
  that still joins the squad's team if it has a seat free. Sort frames gives
  everyone a different frame, keeping first choices where it can.

## How it works

```
 browser ──inputs (numbered, every tick)──▶  room server (Node, Colyseus)
    ▲                                         runs stepRace at 60 Hz with the
    └─inputs it used, every 2nd tick; a       inputs, the computer pilots and
      checksum every 30; the whole race       the match scoring
      every 300, or when asked
```

- **The server owns the race.** `src/net/roomCore.ts` holds a room's lobby
  and match and steps the same `src/sim` the game uses. It takes one queued
  input per human seat per tick, repeats the last one if the next is late,
  and folds inputs together if a client gets too far ahead. It gives the
  seat to its computer pilot when inputs stop for half a second. Everything
  that comes in is checked and clamped. Inputs are numbered per connection
  (an *epoch* that goes up on every reconnect), so inputs still in flight
  from before a reconnect are dropped instead of being taken as new ones.
- **The client runs the same race.** `src/net/prediction.ts` keeps two
  copies. The *confirmed* race is stepped with exactly the inputs the server
  used, so it matches the server tick for tick. The tests and the bots
  compare checksums. The *predicted* race is the confirmed one plus your own
  inputs the server has not used yet, replayed on top, with the other people
  assumed to keep doing what they last did. Computer pilots are predicted
  exactly. The prediction is drawn, so your mech answers at once.
  `src/client/game/netSession.ts` eases corrections in over about a tenth of
  a second.
- **Drift.** Browsers other than Chrome may round some maths differently
  from Node. A checksum every half second catches it, and the client asks
  for the whole race (about 20 KB) to put itself right.
- **Events** (sounds, sparks, HUD calls) come from the confirmed race,
  except your own actions, which play from the prediction the moment you
  press (once per input: a replay after a correction does not play them
  again).
- **The shot caller** is a per-team field of the race (`TeamState.caller`).
  The room sets it at the start of a round and changes it between ticks
  when people drop or come back. The change rides with the inputs, so every
  copy of the race makes it at the same tick.
- **Squads** are their own small Colyseus room (`src/net/squadCore.ts`).
- **The lobby rules** (seats, captains, factions, shot callers, squads, ready
  marks) are plain functions in `src/net/lobby.ts`.

## Limits

| | |
|---|---|
| People per room | 6 (a 7th sees "Room full") |
| Squad | 3 |
| Codes | 5 characters from 31 that cannot be misread (no 0/O, 1/I/L): about 28 million |
| Code guessing | 30 room codes a minute per address, when `FORWARDED_HOPS` is set |
| A dropped seat | Kept 60 s |
| Inbound message | 16 KB at most |

Codes are an invitation, not a secret. Anyone with a code can join until the
room is full. The host can remove people, and a removed device cannot come
back to that room.

**Trust model.** The server decides everything that happens in the race; a
modified client can only send inputs, and those are clamped. Names are only
ever shown as text. There are no accounts, so a callsign is not unique and
proves nothing.

## Measured

On this sandbox's 2-core Linux machine, with Node 22:

| | |
|---|---|
| Traffic per player (2 people racing) | 4.6 KB/s down, 2.2 KB/s up |
| Server CPU, two full rooms of six bots racing | 5% of one core, about 2.5% per room |
| Rooms per core (from that) | about 40 |
| Inputs predicted ahead on localhost | 1 to 6 ticks; up to 16 with 12 bots on the same machine |
| Confirmed race vs server | identical at every checksum, in tests and in 12-bot runs (no resyncs) |

## Testing

- `npm test` includes the lobby rules, the squad rules, and whole online
  races between a room and test clients with set latencies, over a fake
  network (`tests/net-*.test.ts`). They check that each client's confirmed
  race matches the server's, that prediction runs ahead by about a round
  trip, reconnecting mid-race, the shot caller in the race, the pause
  menu's computer pilot, and late arrivals.
- `npm run bots -- 6 4` puts four rooms of six bots on a running server
  (`npm start`, or `npm run server`), races them, and reports resyncs. It is
  also the load test.
- `node tools/online-check.mjs` drives two real browsers through the hub, a
  room, the invite link, a race, the results and back to the room. It needs
  Playwright.

All of that ran on one machine. **Not tested:** real networks with real
latency and packet loss (the tests use set delays on a fake network),
Firefox and Safari against a Node server, phones, and a server behind a real
proxy (the `X-Forwarded-For` reading has only seen headers the tests wrote).
