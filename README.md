# Zenith GP

A 3-on-3 mech racing and combat game for the browser. Two teams of three (a
forward, a midfielder and a defender) run three laps of an elevated circuit:
a formation lap, a battle lap, and a flat-out speed lap. First place is worth
15 points, as much as second, third and fourth put together, so the whole race
is about getting your forward home first and stopping theirs.

"Zenith GP", the teams, pilots and frames are original working names. The
title lives in `index.html` and `src/client/ui/menus.ts` if you want to change
it.

This is version 0.5: three circuits and three ways to play.

- **Grand Prix**, offline: a **cup** of three races, each against a different
  faction, for gold, silver or bronze; or a **season**, a best of 3 against
  each of the other four factions, for the Zenith Cup. The other factions
  race each other in the background, so the table is real.
- **Free Play**: any circuit, rival and format against computer pilots.
- **Online**: private rooms for up to six people, joined by code or invite
  link, with computer pilots in the empty seats. Friends can form a squad of
  up to three that stays together from room to room.

The garage is now a **hangar** (your faction and frame, shared by every mode)
and a setup screen for each mode. How online works and how to host it is in
[docs/ONLINE.md](docs/ONLINE.md); the rest of the design is in
[docs/DESIGN.md](docs/DESIGN.md).

**The look.** The game is drawn as an 80s mecha anime: cel shading and
ink, film grain and halation, poses and effects on twos, drawn speed lines
and sparks, impact frames, a painted still on a knockout, title cards and
an eyecatch. Press **G** to switch between that and the plain look. The
rules are in [docs/ART.md](docs/ART.md); how its art is made and checked is
in [docs/VISUAL-WORKFLOW.md](docs/VISUAL-WORKFLOW.md).

## Play

**No install:** open `play/index.html` in a browser. It is the whole game in
one file: Grand Prix and Free Play. Online needs the server.

**With online play** (needs Node 20.19 or newer):

```sh
npm install
npm run build      # the game into dist/, the server into dist-server/
npm start          # http://localhost:8090: the game and its rooms on one port
```

Share `http://<your-LAN-address>:8090` with friends on the same network, or
put the server behind your domain like any Node web app (WebSockets must
pass through). `PORT`, `HOST`, `ALLOWED_ORIGINS` and `FORWARDED_HOPS` are
read from the environment; [docs/ONLINE.md](docs/ONLINE.md) has the details.

**Developing:**

```sh
npm run dev        # the game, with hot reload, on http://localhost:5173
npm run server     # the room server on 8090 (the dev page finds it)
```

Plug in a gamepad before or after the page loads and press any button. The
keyboard works too, and the on-screen hints follow whichever you touched last.
Menus work with either, or the mouse: A (Enter) confirms, B (Esc) goes back,
X and Y are each screen's own actions, and the bottom bar names them.

**Phones, tablets and handhelds.** Open the same address in the phone's
browser. Touch the screen and touch controls take over (a pad or keyboard
takes back over the moment it is used); starting from the title by touch goes
full screen. The menus work held either way round and scroll where they do
not fit; races are played sideways (held upright, a race asks to be turned,
and offline it waits). A handheld with its own controls, such as a Retroid
Pocket, works as a gamepad on its own screen. The layouts follow the picture,
so 16:9 and 4:3 (Video, Screen shape) both fit any screen. The picture is
drawn at full resolution unless you choose otherwise: on a slower device,
Video, Resolution trades sharpness for speed (85%, 70%, 55%, or Automatic,
which follows the frame rate).

## Controls

| | Gamepad | Keyboard | Touch |
|---|---|---|---|
| Steer | Left stick | A D | Left thumb anywhere on the left of the screen |
| Accelerate / brake | RT / LT | W / S | Held for you / Carve |
| Locked on: ease off, so a target behind catches up | Let go of RT | W, with the target behind | Push toward a target behind |
| Carve (hold through a corner, let go for a burst) | LT with the stick pushed over | S with A or D | Hold Carve and steer |
| Boost (uses Drive) | A | Space | Boost |
| Ability (uses a Cell) | B | R | The ability's own button |
| Lock on to an enemy / let go (the one it would take is marked) | LB | Q | Lock on / Let go |
| Escort a teammate / back to the fight | Click the left stick | E | Escort / Fight |
| Attack / special | X / Y | J / K | Attack / Special |
| Guard (while locked on; press just before a hit to parry) | LT (RB works too) | L | Guard |
| Dash (while locked on; forward or no stick goes at the target, hold to boost at it) | A | Space | Dash |
| Guard swing: arc round your target (while guarding) | Stick left or right + A | A or D + Space | Hold Guard, steer, Dash |
| Switch target (while locked on; teammates while escorting) | Right stick left / right, hold to keep stepping | Z C | Switch |
| Look around / look back | Right stick / R3 | V | |
| Team plays: Blitz, Run, Shield, Mark | D-pad up, right, down, left | 1 2 3 4 | Team, then the play |
| Pause | Start | Esc | Pause (top right) |
| Tuning panel | Back | T | |
| Full screen | Video → Full screen | F | Video → Full screen |
| Switch the look (80s anime / plain) | Pause → Look | G | |
| Compare Sunhawk designs | Garage / Pause → Sunhawk design | B | |

While you are free you steer like any racer. Lock on and the track carries
you: the stick now moves you around your target (toward it, away from it,
circling it) and your mech faces it, even if that means skating backwards.
A fight is carried at race pace, so locking on never parks you.

The lock takes whoever is nearest the middle of the screen, leaning toward
the rival forward, and while you are free steering the one it would take is
marked with pale corner brackets and the lock key beside its name. Locked on,
push the right stick left or right to move the lock to the next enemy that
way on screen. The name tags of the rivals you can switch to show a small ◀
or ▶. If your target is knocked out or finishes, the lock moves on to the
nearest rival by itself.

## How a race goes

1. **Formation lap.** Weapons are locked and a limiter holds everyone to
   330 mph, so this is a pure racing lap: boost, carve, tuck into a
   slipstream, scramble for the gates. Your Drive gauge starts empty and
   fills on the cyan charge strips, in a slipstream, from clean landings and
   from passing rivals close. Six gold gates stand around the lap: thread one
   for a full Cell, and it goes dark for everyone behind you for 4 seconds.
   The gates sit across the road from the strips or on the long way round a
   corner, so you cannot have everything.
2. **Battle lap.** Weapons and abilities free, limiter up to 375 mph. It
   opens further for anyone who drops off the back, so the field stays
   together and there is nowhere to hide. Damage is permanent, and a mech
   whose armour reaches zero is out of the race.
3. **Speed lap.** Limiter off. Each frame has its own top speed (480 mph for
   a forward), cut by at most 6% for missing armour. The slipstream reaches a
   long way back on this lap and lingers after you pull out, so a mech that
   is behind can reel the leader in and slingshot past.

Your two teammates follow the play you call with the D-pad. Call the same play
again to cancel it.

## Carving

Pull the left trigger with the stick pushed over and the mech drops into a
carve that way: down on its edges, gripping far harder than free steering,
bleeding a little speed. It is a held drift. Once it is on, the stick only
shapes it (centred it turns at about half lock, pushed into the turn it
tightens, pushed out it opens wide), and it lasts until you let go of the
trigger. With the stick near the middle the trigger is still a brake.

While you carve, the sparks off your skates climb three colours: cyan, gold,
then magenta. The tighter you hold it, the tighter the bend and the faster
you go, the quicker they climb; on a straight they barely move. Let go for a
burst over the limiter: +15%, +25% or +35%, for half a second to a second.
Scraping the barrier loses the charge, and a blow that lands, locking on or
going over an edge ends the carve with nothing. Every circuit has corners
tight enough that carving is the quick way round, with a straight after
each to spend the burst on.

## Circuits

Pick one in the garage (the first row). Each has its own scenery and its own
race music.

- **Meridian Skyway.** The original: an elevated loop over the sea at golden
  hour. Sweepers, the Esses, a chicane and the Harbour Hairpin (the best
  carve on any circuit) between long straights, barriers all the way round.
- **Corkscrew Canyon.** Built for fighting, at dusk in a red desert. The
  Narrows (a cut through the rock too narrow to pass without a fight), a
  corkscrew, the Bowl (banked so steeply you can take it flat out), the
  Crossover (a fork whose two routes swap sides over and under each other),
  the Sky Bridge (no barriers on either side) and the Hop, a short jump.
- **Helios Drop.** Built for speed and air, above a sea of cloud. The Drop
  (a wide jump off the top of a long climb, through the Sun Gate: at the
  formation-lap limiter you clear it by about half its width, and anything
  much slower falls in), the Switchback (a left-right flick to carve on the
  way down), a full loop, the Carousel (a long banked right),
  the Skyline crest, and Split Decision: a fork with a speed pad and a second
  jump on one side (take the pad and you clear it easily) and the Drive strip
  and a gate on the other.

What the new circuits add:

- **Jumps.** Fast enough and you fly the gap and land on the far side. Too
  slow (you were fighting, or snared) and you fall short.
- **Falls.** Off an open edge or into a gap, a recovery drone puts you back on
  the road further on. It costs a couple of seconds and 70 armour, and if
  somebody hit you just before, the fall is credited to them like a ring-out
  (a fall can knock a damaged mech out).
- **Forks.** A wall runs down the middle. Nobody can lock on, hit, shoot,
  draft or bump across it, so picking the other route is a way out of a
  fight, and each route has something the other does not.
- **Loops and corkscrews.** The skates hold you to the road all the way round
  at any speed.
- **Banked turns** grip harder the steeper they are banked.
- **Speed pads** (magenta chevrons) lift your top speed for a second.
- **Crests** throw you into the air if you take them fast.

## Cells and abilities

Each frame has two abilities on one button: one while free steering, another
while locked on. Each use burns one Cell and you can hold three. Cells come
from the gold gates, which are lit on every lap (each gate once a lap), so a
Cell spent defending yourself on lap 2 can be earned back, at the price of
leaving the racing line to do it. A gate goes to whoever reaches it first and
then stays dark for 4 seconds, so a chaser can take one from under the
leader's nose; a mech that is already full passes through without using it.

| Frame | Free steering | Locked on |
|---|---|---|
| Swift (forward) | **Overdrive**, on the speed lap only: 4 s at +30% speed, ignoring armour damage | **Break Away**: works even mid-hit. Cancels the stagger, shakes off every lock and throws you clear |
| Vector (midfielder) | **Disruptor**: a pulse that interrupts every enemy close by and drains their Drive | **Snare**: a bolt at your target that cuts its top speed by a quarter for 3.5 s and stops it boosting |
| Bulwark (defender) | **Aegis**: 4 s shield over itself and teammates nearby. A third of the damage, no stagger | **Ram**: 3.5 s of unstoppable charge, driving straight at your target until it lands. Whatever its front hits takes heavy damage and is thrown aside |

They answer each other. Overdrive and Break Away both burn off a Snare, an
Aegis shrugs off a Ram and a Snare, a guard blunts a Ram or a Disruptor.
On the battle lap a forward has Break Away but not Overdrive, so it cannot
simply outrun the fight: its support has to carry it to lap 3 (the rule is
`overdriveLap`). Escorting a team-mate, the defender's button is its Aegis
and the midfielder's its Disruptor.

## Fighting

- **Momentum strikes.** A boost, an Overdrive or a charged slipstream primes
  your next blow for three quarters of a second after it ends ("Momentum" on
  the HUD, and your trails run hot). Swing in that time and the first blow
  hits a third harder and throws much further. Arrive in a fight at speed and
  strike as you get there. Guns do not take it.
- **Ring-outs.** Heavy blows throw a rival across the road, so get it between
  you and the barrier. A mech knocked into the barrier while reeling takes
  heavy damage, tumbles, and bounces back into the fight, and the barrier
  pulses where it hit. The ring-out is yours: its damage, some Drive, and the
  knockout if it finishes them.
- **Reading a blow.** A ring closes on any rival winding up a heavy blow and
  meets it as the blow lands, turning white for the moment a guard would
  parry. Gold: parry it. Red: a guard breaker, dash out of it. Orange: a heavy
  gun, guard. A rival aiming one at you also gets the answer written over its
  name, and a warning sound; if it is off screen, an arrow at the edge of the
  screen points to it.
- **Guard swing.** With the guard up, push the stick left or right and press
  A: you carve a fast half-circle round your target to that side, out of the
  way of what was coming and onto its flank or past it. You are untouchable
  for the first part of it, and it costs what a dash costs. From further out
  it goes less far round.
- **Pace in a fight.** Locked on, the trigger sets the pace: held, the fight
  is carried at race pace; let go and it eases to three quarters of that, so
  a rival behind comes back to you. A tap of A with the stick forward or
  centred is a quick dash at your target; hold it to boost at the target for
  Drive, which catches a rival who is running and brakes toward one behind.
- **Big moments.** The camera darts in for a moment on a heavy blow, a parry,
  a guard break or a knockout you are part of (a slider sets how much), each
  weapon has its own colour of swing and sparks, and any knockout you had a
  hand in plays in slow motion.

## Scoring and matches

Placing points are 15, 7, 5, 3, 2, 1. A mech that is knocked out scores no
placing points, and the team that knocked it out gets 3. So a team whose
forward wins but whose other two mechs are knocked out loses the round, 15 to
21, to a team that finished second, third and fourth.

**Support points** count for the team too, up to 8 per pilot per race:

| Who | For | Points |
|---|---|---|
| Vector | Snare a rival (the rival forward: 2) | 1 |
| Vector | Interrupt: break a wind-up with the Disruptor or the Stun Kick | 2 |
| Vector | Pressure: every 150 damage on the rival forward | 1 |
| Vector | Back-up: every 80 damage on rivals fighting a teammate | 1 |
| Bulwark | Peel: hit a rival attacking your forward (break its attack: Save, 2) | 1 |
| Bulwark | Bodyguard: block or parry beside your forward | 1 |
| Bulwark | Aegis: your shield keeps 100 damage off the team | 2 |
| Bulwark | Ring-out a rival (the rival forward: 2) | 1 |
| Vector, Bulwark | Lead-out: on lap 3 your forward leaves your slipstream and passes someone | 2 |
| Anyone | Assist: you hurt a rival in the 5 s before a teammate knocked it out | 2 |

The same action on the same rival scores once every 6 seconds. Each one pops
up as it lands, a support pilot gets a prompt when its forward needs it, and
the results show where every support point came from.

Pick the format in Free Play's match setup, or the host picks it for a room:

- **Single race.**
- **Series**, best of 3 or 5. Most points takes the round; level on points,
  it goes to the team whose mech came home first.
- **Points race** to 50 or 80. Points carry over, and the first team past the
  target at the end of a round wins.

The teams swap sides of the grid each round.

## Tuning panel

Press T (or Back on a pad) at any time. The first tab, Look, switches the
80s anime look and sets its film, ink, line boil, drawings a second, impact
frames and knockout still. The others have sliders for the limiters, top
speed, boost, carving, the slipstream, Drive and Cells, every ability,
knockout and support points, combat (lock-on movement, momentum, ring-outs,
the guard swing, armour), the camera (including the punch-in), the
effects (including the size of the wind-up tells and the brightness of the
barrier pulse) and the sound. Changes apply at once, to the race you are in,
and are remembered in the browser.

The Sound tab sets the master, music and effects volumes and the level of
each continuous layer (engine, wind, afterburner, strip hum, slipstream,
barrier scrape, low-armour alarm). Under them, "Sound test" plays any of the
game's one-shot sounds by name, which is the quickest way to find one that
grates. "Copy values" gives a small block
of text with whatever you changed; "Load values" takes one back.

During a race the panel is worked with the mouse so the pad and keys keep
flying the mech. Opened from the pause menu it also takes the pad or keys.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run server` | The room server for development, on port 8090 |
| `npm run build` | Type-check, then build the game to `dist/` and the server to `dist-server/` |
| `npm start` | Serve the built game and run the rooms on one port |
| `npm run build:single` | Type-check, then build the one-file version to `play/` |
| `npm test` | Test suite: simulation, Grand Prix, lobby and online races (1,000 tests) |
| `npm run bots -- 6 4` | Four rooms of six bot players on a running server: a check and a load test |
| `npm run sim` | Run a race with computer pilots in every seat and print what happened |
| `npm run sim -- 100` | Run 100 races and print balance statistics |
| `npm run sim -- 100 1 tow3=0.12 koPoints=4` | The same with any rule overridden |
| `npm run sim -- 100 1 track=canyon` | The same on another circuit (`meridian`, `canyon`, `helios`) |
| `npx tsx tools/circuit-plot.ts canyon` | Plan, height and features of a circuit, as numbers and an SVG |

The browser-driving helpers in `tools/` (`shot.mjs`, `screens.mjs`,
`playtest.mjs`, `audio-check.mjs`, `song-check.mjs`, `online-check.mjs` and
`online-gp-check.mjs`, which take two browsers through an online room and a
squad's Grand Prix, and the capture tools in `tools/capture`, which render
the game through scripted cameras for checking and footage) need
Playwright, which is not a dependency of the project:
`npm i -D playwright && npx playwright install chromium` if you want them.

Dev shortcuts on the page URL: `?auto=FW` (or `MF`, `DF`) jumps straight into
a race, `&demo=1` lets the computer fly your mech, `&skip=95` starts that many
seconds in, `&seed=7` repeats a race exactly, `&team=1` puts you on Vanta,
`&rivals=0..2` sets rival skill, `&rival=2` picks the rival team,
`&oldswift=1` flies Solstice's first Swift design in place of the Sunhawk,
`&match=0..4` picks the match format,
`&track=canyon` (or `helios`, `meridian`) picks the circuit, `&look=plain`
(or `anime`) picks the look for that visit, `&tune=1` opens the tuning panel,
`&mute=1` turns sound off, `&music=suno` plays a recorded song as the race
music where a circuit has one (Meridian and Canyon, built up lap by lap: see
[tools/music](tools/music/README.md)), and `?debug=mechs` opens a model viewer.
Online: `?room=K7Q2X` and `?squad=K7Q2X` are invite links, `&server=URL` uses
another game server, and `&player=2` gives the tab its own identity, so two
tabs of one browser can be two players.

## Sunhawk model comparison

The updated Sunhawk is the approved visual standard for future frame work:
broad readable armor, controlled cel shadows, restrained surface detail and
distinct mechanical joints. Its production blend is the reference asset.
Normal play uses the approved updated models with their armor panel lines on.
Design and finish selectors have been removed from the garage and pause menus.

Comparisons remain available with explicit URL flags: `?sunhawk=current|updated|game`,
`&roster=current|updated`, and `&sunhawkPanels=0` (clean armor, no panel lines).
These do not persist into future sessions. With `?artReview=1`, **B** cycles Sunhawk
and **N** toggles the rest of the roster without resetting the race or animation.
**G** still compares anime/plain rendering while developing (`npm run dev`, or
`?dev=1` on a built game), along with **T** for the tuning panel; players get
neither. For a controlled side-by-side view,
open `?debug=mechs&compare=1&pose=standby&bg=e4e6ec`; `pose` also accepts
`boost`, `carveRight`, `guard`, `slashHit`, and the other names in `poses.ts`.
This studio viewer uses the base materials; use the garage/race for the full anime
postprocessing and animated effects. Add `&bank=0.45` to inspect grounded skates
under body lean, or `&lod=0|1|2` to inspect the updated model's near/medium/far mesh.
For jet-angle checks use `&jets=0.7&yaw=180` with a single pose; change `yaw` to
inspect the circular rear jet fading into the side flame. `&look=plain` checks
the plain cone instead. The updated model blends these two anime drawings with
complementary opacity; the current reference retains its original effects.

The production source is **`art/blender/sunhawk/sunhawk-production.blend`**.
The original `sunhawk-comparison.blend` remains an unchanged art-study checkpoint;
both painted references and modeling scripts live alongside it. To re-export,
open the production file, select **SUNHAWK • Art comparison**, and run
`export_game.py` from Blender's Text Editor or Python console. It writes four
GLBs under `src/client/render/mech/assets/` and `game-export-manifest.json`.
It preserves the source scene, evaluates bevels and authored normals, removes
preview outlines/markings, and exports separate shoulder-tower and hip-armor hinges.
The game merges parts per moving joint and assigns its own shaders, decals,
glows, thruster flames, weapon and skate-effect anchors.

The updated model has arm/hip/knee clearance adjustments, restrained bevels,
cooler armor shadows, reduced glow, a tailored tuck/guard, and road-relative skate
targets while banking. Both designs have corrected hand chirality: inner thumbs,
forward white back plates, and fingers curling into rear-facing palms. The current
reference's other geometry, materials and arm/leg poses are preserved. Both models'
towers now hinge back as their arms rise, clearing the victory pose while retaining
their upright racing placement. Tower decals and every LOD share these hinges.

Seven conforming UV overlays use the shared 1024px `sunhawk-details.png` atlas for
sparse service seams and stencils on the chest, forearms, thighs and shins. These
details use the game's toon/anime lighting; the optional projected panel mask and
existing emblems, race numbers, damage flashes and effects still work.

| Updated Sunhawk | Triangles | When used |
| --- | ---: | --- |
| Near | 25,948 | Garage and close racing; UV details visible |
| Medium | 13,918 | Below 180px projected height |
| Far | 7,328 | Below 65px projected height |

The return thresholds are 220px and 85px to prevent flicker. All three levels share
the same moving pivots, effects and animation state. Indexed geometry preserves
normal/paint seams; the current reference remains at 23,876 triangles.
`?perf=1` adds a local review overlay with race frame timing, render calls/triangles
across all passes, resolution, quality and active Sunhawk detail levels. It sends
no telemetry. Timing reflects the current machine, browser load and quality settings.

To reproduce preparation from the archived study: run `polish_updated.py`, then
`fix_hands.py`; generate the atlas with `paint_details.py` (Python + Pillow), run
`uv_details.py` in Blender, then `export_game.py`. Export decimation is temporary;
the production blend retains the full editable meshes. Rebuild a detail overlay
after changing the armor face it follows. `npm run build:single` embeds all model
levels and the atlas in `play/index.html`.

## Layout

```
src/sim/        The race itself: track, physics, combat, AI, scoring. No DOM,
                no rendering, deterministic. Runs in the browser and in Node.
  rules.ts      Every tunable rule, with its default and its allowed range
  config.ts     Frame data: classes, attacks, timings
  track.ts      Built track: samples, frames and lookups (road, lanes, forks)
  circuit.ts    Builder for 3D circuits from pieces (turns, climbs, loops...)
  tracks/       The circuits: meridian.ts, canyon.ts, helios.ts
  match.ts      Series and points-race scoring across rounds
  snapshot.ts   Copying a race and putting it back, and its checksum
src/gp/         Grand Prix: cups and seasons, standings, the background races
src/net/        Online, shared by the game and the server (no DOM):
  protocol.ts   Messages, codes, inputs on the wire
  lobby.ts      A room's lobby rules: seats, captains, shot callers, squads
  roomCore.ts   The authoritative room: lobby, match, the race at 60 Hz
  squadCore.ts  Squads
  prediction.ts A client's confirmed and predicted races
server/         The server: static files and the Colyseus rooms, on one port
src/client/     Everything you see and hear.
  game/         Game shell and modes, the Session layer (LocalSession,
                NetSession), the tuning store
  gp/           Grand Prix saves and the background-race worker
  net/          The connection to the server, identity (callsign, device key)
  render/       Three.js: circuit, gates, world, mechs, effects, camera
  input/        Gamepad and keyboard
  ui/           HUD, the tuning panel and the menus (DOM + CSS); each menu
                screen is in ui/screens/
  audio/        Synthesised sound and music (Web Audio, no files); song.ts
                plays a recorded song instead, with ?music=suno
tests/          Simulation, Grand Prix, lobby, online and model tests (vitest)
tools/          Headless race runner, bots, track plotter, screenshot, online
                and audio checks; music/ builds a recorded song's layers
public/music/   Recorded race music, as tools/music builds it
docs/           Design document, ONLINE.md, and ART.md for the anime look
play/           Prebuilt single-file game
```

Rules live in `src/sim/rules.ts`, frame data in `src/sim/config.ts`, and the
circuits in `src/sim/tracks/`. Meridian is a flat plan of straights and arcs;
Canyon and Helios are lists of pieces (`straight`, `turn`, `climb`, `pitch`,
`loop`, `roll`, plus `jump()`), each with optional width, banking, a gap, an
open edge or a fork. The builder lengthens the two `closeWith` straights and
sets the `settle` climb so the lap closes. Change a number, run
`npm run sim -- 100 1 track=canyon`, and read the summary. Each circuit's
scenery is in `src/client/render/world.ts` and `themes.ts`, its music in
`src/client/audio/music.ts`. Camera and effect defaults are in
`src/client/game/tuning.ts`.
