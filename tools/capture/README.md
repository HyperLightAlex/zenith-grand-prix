# Capture tools

Pictures of the game at known moments, for checking how something looks
and for footage. Everything runs against the built game in a headless,
software-rendered Chromium (no GPU needed) and steps the game on a virtual
clock, so frames come out smooth however slowly the machine draws. The
races are the seeded demo races (`?auto=FW&demo=1&seed=N`): the computer
flies every mech, so the same seed and tick is the same moment every time.

Needs the game built and served, and Playwright (not a project dependency):

```sh
npm run build && npm start          # the game on http://127.0.0.1:8090/
npm i -D playwright && npx playwright install chromium   # once, if missing
pip install pillow                  # for the sheets
```

| Tool | What it does |
|---|---|
| `capture.mjs <shots.json> <dir> [ids...]` | Renders shots: moments of a seeded race through scripted cameras, a JPEG a frame, into `<dir>/<shot id>/` |
| `sheet.py <dir> <out.png> [per-row] [width] [ids...]` | A contact sheet: a row of evenly picked frames per shot |
| `compare.py <before dir> <after dir> <shot> <out.png> [frames]` | Before above after, frame for frame |
| `build-ref.sh <ref> [port]` | Builds the game as it was at a git ref and serves it on a second port (8091), for "before" |
| `events.mjs <seed> <track> <from> <to> <types>` | Lists sim events (boost, shot, swing, hit, ability, ko...) between two ticks: where to point a camera |
| `scan.mjs <seed> <out.json> [team] [rival] [track]` | A whole race's events and mech states, for `fights.py` |
| `fights.py <scans...>` | Finds the fights in scans, scored for how they would read on screen |
| `sprite-probe.mjs <seed> <track> <from> <to> [kind]` | Prints how a pointing effect is turned, frame by frame (finds flipping) |

Settings: `BASE=http://host:port/` for another server, `AUTO=MF` (or `DF`)
to follow that role's mech with the game camera, `QUERY='&look=plain'` (or
any URL setting) added to the page, `PREVIEW=4` for four small frames a
shot while framing.

## Shots

```json
{ "seed": 3, "shots": [
  { "id": "boost-front", "tick": 1587, "frames": 8, "step": 0.0167, "w": 960, "h": 540,
    "cam": { "type": "orbit", "mech": 0, "a": 0, "R": 11, "y": 4, "ly": 4, "fov": 45 } }
]}
```

- `tick`: where in the race (60 a second). The race is run ahead to 30
  ticks before it without drawing (`warm` to change that).
- `step`: race seconds per frame. 1/60 (0.0167) is every tick; 1/24 is
  real time at 24 frames a second; smaller is slow motion.
- `race`: `{ seed, track, team, rival }` for a shot from another race than
  the file's. The simulation is the same whichever factions sit in the
  seats, so a moment found with one pair can be shot with any other.
- Cameras (`cam.type`):
  - `game`: the game's own camera (follows `AUTO`'s mech).
  - `orbit`: round `mech` at angle `a` (degrees; 0 in front, 180 behind),
    radius `R`, height `y`, looking at height `ly`. With `with`, between
    two mechs (`bias` 0 to 1 toward the second), standing back `fit` times
    their distance.
  - `mech`: offsets in the track's frame at the mech (`x` right, `y` up,
    `z` ahead; `lx`, `ly`, `lz` where it looks); `at: 'head'` for a joint.
  - `fixed`: beside the track at `s` (distance along it), `d` across, `h`
    up, looking at the mech or at `look: { s, d, h }`.
  - Any number can move over the shot: `[from, to]` (eased) or
    `[a, b, c...]`. `fov`, `roll`; `speed`, `boost`, `travel` set the speed
    effects for shots whose camera is not the game's.
- `impact: [frame]` and `still: [[frame, seconds]]` fire the impact frame
  and the painted still on those frames.

The effects are placed for the shot's camera, not the game's, after it is
set (camera-facing sprites, what they point along, how near they are
drawn). Until 2026-10-17 they were placed for the game's camera, so
pointing effects in earlier captures (the opening's footage among them)
can be a little off.

## Before and after

```sh
tools/capture/build-ref.sh main            # "before": main, on :8091 (leave it running)
BASE=http://127.0.0.1:8091/ node tools/capture/capture.mjs tools/capture/examples/effects-depth.json captures/before
node tools/capture/capture.mjs tools/capture/examples/effects-depth.json captures/after
python3 tools/capture/compare.py captures/before captures/after boost-front captures/boost-front.png
```

Capture the same shot ids in the same order for both: the capture runs
the race ahead from where the previous shot left it, and stepping it in a
different order can land on a slightly different race. `captures/` is
ignored by git.

`examples/effects-depth.json` holds the shots that checked what effects
show through (docs/ART.md): the boost ring from in front and behind, a
melee exchange, and the midfielder firing from behind.

## Finding a moment

```sh
node tools/capture/events.mjs 3 canyon 1200 4800 boost,ability
node tools/capture/scan.mjs 5 scans/s5-0v1.json 0 1 canyon
python3 tools/capture/fights.py scans/*.json --top 8
```

`fights.py` reads the team and rival from the scan's name
(`<anything>-<team>v<rival>.json`).
