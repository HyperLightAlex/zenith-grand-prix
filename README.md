# Zenith GP

A 3-on-3 mech racing and combat game for the browser. Two teams of three (a
forward, a midfielder and a defender) run three laps of an elevated circuit:
a formation lap, a battle lap, and a flat-out speed lap. First place is worth
15 points, as much as second, third and fourth put together, so the whole race
is about getting your forward home first and stopping theirs.

"Zenith GP", the teams, pilots and frames are original working names. The
title lives in `index.html` and `src/client/ui/menus.ts` if you want to change
it.

This is version 0.1: one circuit, solo play with computer pilots in the other
five seats. The simulation is already written to run on a server, which is the
next milestone. See [docs/DESIGN.md](docs/DESIGN.md).

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
| Lock on to an enemy / let go | LB | Q |
| Escort a teammate / let go | B | E |
| Attack / special | X / Y | J / K |
| Guard (press just before a hit to parry) | RB | L |
| Dash (while locked on) | A | Space |
| Switch target | Flick right stick | Z C |
| Look around / look back | Right stick / R3 | V |
| Team plays: Blitz, Run, Shield, Mark | D-pad up, right, down, left | 1 2 3 4 |
| Pause | Start | Esc |

While you are free you steer like any racer. Lock on and the track carries
you: the stick now moves you around your target (toward it, away from it,
circling it) and your mech faces it, even if that means skating backwards.

## How a race goes

1. **Formation lap.** Weapons are locked and a limiter holds everyone to
   288 mph. Ride the cyan charge strips to fill your Drive gauge, find a
   slipstream, and get where you want to be.
2. **Battle lap.** Weapons free. The limiter is still on and it opens up for
   anyone who drops off the back, so the field stays together and there is
   nowhere to hide. Damage is permanent, and a mech whose armour reaches zero
   is out of the race and scores nothing.
3. **Speed lap.** Limiter off. Each frame has its own top speed, cut by up to
   14% for missing armour. Forwards are fastest, if they got through lap two.

Your two teammates follow the play you call with the D-pad. Call the same play
again to cancel it.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check, then build to `dist/` |
| `npm run build:single` | Type-check, then build the one-file version to `play/` |
| `npm test` | Simulation test suite (277 tests) |
| `npm run sim` | Run a race with computer pilots in every seat and print what happened |
| `npm run sim -- 100` | Run 100 races and print balance statistics |

The browser-driving helpers in `tools/` (`shot.mjs`, `playtest.mjs`,
`audio-check.mjs`) need Playwright, which is not a dependency of the project:
`npm i -D playwright && npx playwright install chromium` if you want them.

Dev shortcuts on the page URL: `?auto=FW` (or `MF`, `DF`) jumps straight into
a race, `&demo=1` lets the computer fly your mech, `&skip=95` starts that many
seconds in, `&seed=7` repeats a race exactly, `&team=1` puts you on Vanta,
`&rivals=0..2` sets rival skill, `&mute=1` turns sound off, and `?debug=mechs`
opens a model viewer.

## Layout

```
src/sim/        The race itself: track, physics, combat, AI, scoring. No DOM,
                no rendering, deterministic. Runs in the browser and in Node.
src/client/     Everything you see and hear.
  game/         Game shell and the Session layer the server will plug into
  render/       Three.js: circuit, world, mechs, effects, camera
  input/        Gamepad and keyboard
  ui/           HUD and menus (DOM + CSS)
  audio/        Synthesised sound and music (Web Audio, no files)
tests/          Simulation tests (vitest)
tools/          Headless race runner, track plotter, screenshot and audio checks
docs/           Design document
play/           Prebuilt single-file game
```

Tuning lives in `src/sim/config.ts` (speeds, armour, every attack) and
`src/sim/tracks/meridian.ts` (the circuit as a list of straights and arcs).
Change a number, run `npm run sim -- 100`, and read the summary.
