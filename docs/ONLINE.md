# Online play: how it works and how to host it

Zenith GP's online mode is private rooms for up to six people, found by a
5-character code or an invite link, with computer pilots in the empty places.
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
| `GET /` and static files | The built game. Hashed assets are cached for a year; everything else is revalidated. The build writes a brotli and a gzip copy of each file (26 MB of game goes as 7), which are sent as they are: the server never compresses anything large itself |
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

- **Online hub.** Your squad's three positions, with Create room, Join
  room, Grand Prix, Invite to squad, Join a squad and your callsign. Entering Online
  makes you the leader of a squad of one.
- **Callsign.** Asked for once, 3 to 16 characters, passed through a short
  word filter, and changeable on the hub.
- **Room.** Two teams of three places, with the host's settings (circuit,
  format, computer pilots' skill), Ready, Invite, and Leave. Each team shows
  its three frames: who has locked each in, who has picked it, or the
  computer pilot who flies it. Pick a frame on either team to fly it (on the
  other team, that moves you there if it has a free place). **Ready locks
  your frame in**: it is refused while a teammate has that frame locked, so
  the first to lock a frame keeps it, and Not ready unlocks it. Picking is
  free, so anyone can look at any frame in the hangar (Y), with its stats
  and kit; while you are locked in, the hangar's Frame row is locked too.
  The host can remove someone from their frame's menu. A team's faction is
  picked with its name above its frames: by its captain (whoever joined it
  first), or by the host, who can set both teams', including a team of
  computer pilots. When everyone connected is ready, a 5-second countdown
  starts; any change cancels it. The host can start early.
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
  seconds, then everyone is back in the lobby on their teams. A rematch is
  just readying up again.
- **Late arrivals** wait on the room screen and take a computer pilot's
  place, in a frame nobody on their team has, at the next round.
- **Squads.** The leader picks the faction and takes everyone into rooms:
  when the leader makes or joins a room, the others follow by themselves. The
  room holds places on one team for them for 20 seconds; someone slower than
  that still joins the squad's team if it has a place free. Everyone picks
  whatever frame they like in the hangar; two of a frame is marked on the
  Online screen, not refused, and Ready sorts it out in the room. (For
  matchmaking, when there is some, the squad will have to be on different
  frames to queue.) Invite to squad shows while there is an open place,
  Join a squad only while you are on your own.
- **Grand Prix with your squad.** The hub's Grand Prix is always there, and
  opens for a squad of two or three, from its leader (highlighted, it says
  which it is waiting for). The leader picks the Horizon Cup or the Zenith
  Cup season and the difficulty, and the squad follows into its own room:
  the event as offline, for the squad's faction, the squad on one team (a
  computer teammate in any frame nobody flies) and every rival a computer
  pilot. Each round opens on its briefing (the rival, the circuit, the
  squad's three frames and the table so far): pick a frame, Ready locks it
  in, and the round starts when everyone is ready. After the match, the
  round's standings, with the other factions' results as they come in; the
  next briefing follows when everyone presses Continue, or 30 seconds after
  the last result. A season's matchday off is its standings alone. At the
  end, the award; Back to Online leaves. It is played in one sitting:
  nothing is saved and no medals or cups are recorded. Only the squad can
  join (and anyone who was in it, after a reload), nobody can sit on the
  rivals' team, the event sets the factions, circuit, format and skill, and
  a match is not ended early. Leaving hands your frame to a computer
  teammate and the squad carries on.

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
- **A squad's Grand Prix** is a race room made with `gp` in its create
  options: the room keeps the event (`src/gp/grandPrix.ts`, the same as
  offline), sets each round up from it, and goes lobby (the briefing),
  match, `standings`, lobby... to `award`, sending the event with the
  lobby. The lobby is `fixed`: side 0 only, factions and settings from the
  event. The other factions' fixtures are raced on the server
  (`FixtureSim`), 40 ticks (`GP_BACKGROUND_TICKS`) on each of the room's
  updates, so a race takes about 5 seconds and the server is never held up
  for one; they start when the room is made, so a round's results are in
  long before its standings. A Continue carries the phase it was pressed
  in, so a late press on a match's results cannot skip the standings.
- **The lobby rules** (teams and places, frame picks and lock-in, captains,
  factions, shot callers, squads) are plain functions in `src/net/lobby.ts`.
  When a match starts, `settleFrames` gives each person their locked-in
  frame, and anyone who had not locked in (someone who dropped, a late
  arrival) a frame nobody on their team has; computer pilots fly the rest.

## Limits

| | |
|---|---|
| People per room | 6 (a 7th sees "Room full") |
| Squad | 3 |
| Codes | 5 characters from 31 that cannot be misread (no 0/O, 1/I/L): about 28 million |
| Code guessing | 30 room codes a minute per address, when `FORWARDED_HOPS` is set |
| A dropped seat | Kept 60 s |
| A squad's Grand Prix | Its squad only; the rivals' team is computer pilots |
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
| A squad's Grand Prix, while it races the other factions' fixtures | about 9% of one core more, for about 5 s a race (a cup has 3, a season up to 30) |
| Inputs predicted ahead on localhost | 1 to 6 ticks; up to 16 with 12 bots on the same machine |
| Confirmed race vs server | identical at every checksum, in tests and in 12-bot runs (no resyncs) |

## Testing

- `npm test` includes the lobby rules, the squad rules, and whole online
  races between a room and test clients with set latencies, over a fake
  network (`tests/net-*.test.ts`). They check that each client's confirmed
  race matches the server's, that prediction runs ahead by about a round
  trip, reconnecting mid-race, the shot caller in the race, the pause
  menu's computer pilot, and late arrivals. `tests/net-gp.test.ts` plays a
  squad's cup through (briefing, match, standings, award), a season's
  matchday off, and who may come in.
- `tools/online-gp-check.mjs` takes two browsers through a squad's cup:
  the hub's Grand Prix (locked alone, open with two), the setup, following
  the leader in, picking frames in the briefing, the races, the standings
  and the award. Start the server with `TEST_LAPS=1` for one-lap races.
- `npm run bots -- 6 4` puts four rooms of six bots on a running server
  (`npm start`, or `npm run server`), races them, and reports resyncs. It is
  also the load test.
- `node tools/online-check.mjs` drives real browsers through the hub, a
  squad of three, a room, the invite link, frame picks and lock-in,
  factions, shot calling, a race, the results and back to the room, with
  clicks and keys as a player would. `node tools/video-check.mjs` does the
  Video settings. Both need Playwright.

All of that ran on one machine. **Not tested:** real networks with real
latency and packet loss (the tests use set delays on a fake network),
Firefox and Safari against a Node server, phones, and a server behind a real
proxy (the `X-Forwarded-For` reading has only seen headers the tests wrote).
