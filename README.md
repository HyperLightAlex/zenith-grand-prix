# Zenith GP

A 3-on-3 mech racing and combat game for the browser. Two teams of three (a
forward, a midfielder and a defender) run three laps of an elevated circuit:
a formation lap, a battle lap, and a flat-out speed lap. First place is worth
15 points, as much as second, third and fourth put together, so the whole race
is about getting your forward home first and stopping theirs.

"Zenith GP", the teams, pilots and frames are original working names. The
title lives in `index.html` and `src/client/ui/menus.ts` if you want to change
it.

This is version 0.2: one circuit, solo play with computer pilots in the other
five seats, single races or a match of several rounds. The simulation is
already written to run on a server, which is a later milestone. See
[docs/DESIGN.md](docs/DESIGN.md).

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
| Boost (uses Drive) | A | Space |
| Ability (uses a Cell) | B | R |
| Lock on to an enemy / let go | LB | Q |
| Escort a teammate / let go | Click the left stick | E |
| Attack / special | X / Y | J / K |
| Guard (press just before a hit to parry) | RB | L |
| Dash (while locked on) | A | Space |
| Switch target (while locked on) | Right stick left / right, hold to keep stepping | Z C |
| Look around / look back | Right stick / R3 | V |
| Team plays: Blitz, Run, Shield, Mark | D-pad up, right, down, left | 1 2 3 4 |
| Pause | Start | Esc |
| Tuning panel | Back | T |
| Full screen | | F |

While you are free you steer like any racer. Lock on and the track carries
you: the stick now moves you around your target (toward it, away from it,
circling it) and your mech faces it, even if that means skating backwards.
A fight is carried at race pace, so locking on never parks you.

Locked on, push the right stick left or right to move the lock to the next
enemy that way on screen. The name tags of the rivals you can switch to show
a small ◀ or ▶. If your target is knocked out or finishes, the lock moves on
to the nearest rival by itself.

## How a race goes

1. **Formation lap.** Weapons are locked and a limiter holds everyone to
   330 mph. Your Drive gauge starts empty and fills only on the cyan charge
   strips. Six gold gates stand around the lap: thread one for half a Cell.
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

## Cells and abilities

Each frame has two abilities on one button: one while free steering, another
while locked on. Each use burns one Cell and you can hold three. Cells come
from the gold gates, which are lit on every lap (each gate once a lap), so a
Cell spent defending yourself on lap 2 can be earned back, at the price of
leaving the racing line to do it.

| Frame | Free steering | Locked on |
|---|---|---|
| Swift (forward) | **Overdrive**: 4 s at +30% speed, ignoring armour damage | **Break Away**: works even mid-hit. Cancels the stagger, shakes off every lock and throws you clear |
| Vector (midfielder) | **Snare**: a bolt that cuts the target's top speed by a quarter for 3.5 s and stops it boosting | **Disruptor**: a pulse that interrupts every enemy close by and drains their Drive |
| Bulwark (defender) | **Ram**: 3.5 s of unstoppable charge. Whatever its front hits takes heavy damage and is thrown aside | **Aegis**: 4 s shield over itself and teammates nearby. A third of the damage, no stagger |

They answer each other. Overdrive and Break Away both burn off a Snare, an
Aegis shrugs off a Ram and a Snare, a guard blunts a Ram or a Disruptor.

## Scoring and matches

Placing points are 15, 7, 5, 3, 2, 1. A mech that is knocked out scores no
placing points, and the team that knocked it out gets 3. So a team whose
forward wins but whose other two mechs are knocked out loses the round, 15 to
21, to a team that finished second, third and fourth.

Pick the format in the garage:

- **Single race.**
- **Series**, best of 3 or 5. Most points takes the round; level on points,
  it goes to the team whose mech came home first.
- **Points race** to 50 or 80. Points carry over, and the first team past the
  target at the end of a round wins.

The teams swap sides of the grid each round.

## Tuning panel

Press T (or Back on a pad) at any time. It has sliders for the limiters, top
speed, boost, the slipstream, Drive and Cells, every ability, knockout
points, the camera, the effects and the sound. Changes apply at once, to the
race you are in, and are remembered in the browser.

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
| `npm test` | Simulation test suite (718 tests) |
| `npm run sim` | Run a race with computer pilots in every seat and print what happened |
| `npm run sim -- 100` | Run 100 races and print balance statistics |
| `npm run sim -- 100 1 tow3=0.12 koPoints=4` | The same with any rule overridden |

The browser-driving helpers in `tools/` (`shot.mjs`, `playtest.mjs`,
`audio-check.mjs`) need Playwright, which is not a dependency of the project:
`npm i -D playwright && npx playwright install chromium` if you want them.

Dev shortcuts on the page URL: `?auto=FW` (or `MF`, `DF`) jumps straight into
a race, `&demo=1` lets the computer fly your mech, `&skip=95` starts that many
seconds in, `&seed=7` repeats a race exactly, `&team=1` puts you on Vanta,
`&rivals=0..2` sets rival skill, `&match=0..4` picks the match format,
`&tune=1` opens the tuning panel, `&mute=1` turns sound off, and
`?debug=mechs` opens a model viewer.

## Layout

```
src/sim/        The race itself: track, physics, combat, AI, scoring. No DOM,
                no rendering, deterministic. Runs in the browser and in Node.
  rules.ts      Every tunable rule, with its default and its allowed range
  config.ts     Frame data: classes, attacks, timings
  match.ts      Series and points-race scoring across rounds
src/client/     Everything you see and hear.
  game/         Game shell, the Session layer, the tuning store
  render/       Three.js: circuit, gates, world, mechs, effects, camera
  input/        Gamepad and keyboard
  ui/           HUD, menus and the tuning panel (DOM + CSS)
  audio/        Synthesised sound and music (Web Audio, no files)
tests/          Simulation tests (vitest)
tools/          Headless race runner, track plotter, screenshot and audio checks
docs/           Design document
play/           Prebuilt single-file game
```

Rules live in `src/sim/rules.ts`, frame data in `src/sim/config.ts`, and the
circuit (straights, arcs, strips and gates) in `src/sim/tracks/meridian.ts`.
Change a number, run `npm run sim -- 100`, and read the summary. Camera and
effect defaults are in `src/client/game/tuning.ts`.
