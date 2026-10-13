# Zenith GP

A 3-on-3 mech racing and combat game for the browser. Two teams of three (a
forward, a midfielder and a defender) run three laps of an elevated circuit:
a formation lap, a battle lap, and a flat-out speed lap. First place is worth
15 points, as much as second, third and fourth put together, so the whole race
is about getting your forward home first and stopping theirs.

"Zenith GP", the teams, pilots and frames are original working names. The
title lives in `index.html` and `src/client/ui/menus.ts` if you want to change
it.

This is version 0.4: three circuits, solo play with computer pilots in the
other five seats, single races or a match of several rounds. New in 0.4:
carving, more boost, contested gates, support points for the midfielder and
defender, guard on the left trigger with a guard swing, and fights that are
easier to read. The simulation is
already written to run on a server, which is a later milestone. See
[docs/DESIGN.md](docs/DESIGN.md).

**On the `art-80s` branch** the game is drawn as an 80s mecha anime: cel
shading and ink, film grain and halation, poses and effects on twos, drawn
speed lines and sparks, impact frames, a painted still on a knockout, title
cards and an eyecatch. Press **G** to switch between that and the plain look.
See [docs/ART.md](docs/ART.md).

## Play

**No install:** open `play/index.html` in a browser. It is the whole game in
one file.

**From source** (needs Node 20.19 or newer):

```sh
npm install
npm run dev        # http://localhost:5173
```

Plug in a gamepad before or after the page loads and press any button. The
keyboard works too, and the on-screen hints follow whichever you touched last.

## Controls

| | Gamepad | Keyboard |
|---|---|---|
| Steer | Left stick | A D |
| Accelerate / brake | RT / LT | W / S |
| Carve (hold through a corner, let go for a burst) | LT with the stick pushed over | S with A or D |
| Boost (uses Drive) | A | Space |
| Ability (uses a Cell) | B | R |
| Lock on to an enemy / let go (the one it would take is marked) | LB | Q |
| Escort a teammate / let go | Click the left stick | E |
| Attack / special | X / Y | J / K |
| Guard (while locked on; press just before a hit to parry) | LT (RB works too) | L |
| Dash (while locked on) | A | Space |
| Guard swing: arc round your target (while guarding) | Stick left or right + A | A or D + Space |
| Switch target (while locked on) | Right stick left / right, hold to keep stepping | Z C |
| Look around / look back | Right stick / R3 | V |
| Team plays: Blitz, Run, Shield, Mark | D-pad up, right, down, left | 1 2 3 4 |
| Pause | Start | Esc |
| Tuning panel | Back | T |
| Full screen | | F |
| Switch the look (80s anime / plain) | Pause → Look | G |

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
| Swift (forward) | **Overdrive**: 4 s at +30% speed, ignoring armour damage | **Break Away**: works even mid-hit. Cancels the stagger, shakes off every lock and throws you clear |
| Vector (midfielder) | **Snare**: a bolt that cuts the target's top speed by a quarter for 3.5 s and stops it boosting | **Disruptor**: a pulse that interrupts every enemy close by and drains their Drive |
| Bulwark (defender) | **Ram**: 3.5 s of unstoppable charge. Whatever its front hits takes heavy damage and is thrown aside | **Aegis**: 4 s shield over itself and teammates nearby. A third of the damage, no stagger |

They answer each other. Overdrive and Break Away both burn off a Snare, an
Aegis shrugs off a Ram and a Snare, a guard blunts a Ram or a Disruptor.

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

Pick the format in the garage:

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
| `npm run build` | Type-check, then build to `dist/` |
| `npm run build:single` | Type-check, then build the one-file version to `play/` |
| `npm test` | Simulation test suite (822 tests) |
| `npm run sim` | Run a race with computer pilots in every seat and print what happened |
| `npm run sim -- 100` | Run 100 races and print balance statistics |
| `npm run sim -- 100 1 tow3=0.12 koPoints=4` | The same with any rule overridden |
| `npm run sim -- 100 1 track=canyon` | The same on another circuit (`meridian`, `canyon`, `helios`) |
| `npx tsx tools/circuit-plot.ts canyon` | Plan, height and features of a circuit, as numbers and an SVG |

The browser-driving helpers in `tools/` (`shot.mjs`, `playtest.mjs`,
`audio-check.mjs`) need Playwright, which is not a dependency of the project:
`npm i -D playwright && npx playwright install chromium` if you want them.

Dev shortcuts on the page URL: `?auto=FW` (or `MF`, `DF`) jumps straight into
a race, `&demo=1` lets the computer fly your mech, `&skip=95` starts that many
seconds in, `&seed=7` repeats a race exactly, `&team=1` puts you on Vanta,
`&rivals=0..2` sets rival skill, `&match=0..4` picks the match format,
`&track=canyon` (or `helios`, `meridian`) picks the circuit, `&look=plain`
(or `anime`) picks the look for that visit, `&tune=1` opens the tuning panel,
`&mute=1` turns sound off, and `?debug=mechs` opens a model viewer.

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
src/client/     Everything you see and hear.
  game/         Game shell, the Session layer, the tuning store
  render/       Three.js: circuit, gates, world, mechs, effects, camera
  input/        Gamepad and keyboard
  ui/           HUD, menus and the tuning panel (DOM + CSS)
  audio/        Synthesised sound and music (Web Audio, no files)
tests/          Simulation tests (vitest)
tools/          Headless race runner, track plotter, screenshot and audio checks
docs/           Design document, and ART.md for the anime look
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
