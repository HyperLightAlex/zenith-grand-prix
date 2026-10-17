# Visual workflow

How Zenith GP gets its look, and how to add to it without losing it: where
each part is written down, the method every painted asset goes through, a
checklist for each kind of addition, and how a change is checked before it
ships. The rules of the look itself (what it copies from 1980s anime and
how each piece is built) are in [ART.md](ART.md); this is the front door.

## Where everything is

| What | Where |
|---|---|
| The look's rules: cel and ink, drawing on twos, the film, the moments, drawn effects and what they show through, backgrounds, HUD, menus, hangar, mech lines; how it is built and what it costs | [docs/ART.md](ART.md) |
| The five factions' design languages, palettes and pilots | [docs/FACTIONS.md](FACTIONS.md), `src/client/render/palette.ts` |
| Each painted sheet: its prompt, what to attach, its key colour, how the game uses it, its status | `art/<kind>-sheets/README.md` (fx, bg, track, hud, hangar, key, faction, mech, model) |
| Turning sheets into game files | `tools/fx/` (effects), `tools/bg/` (everything else) |
| The 3D roster: building each mech in Blender from its sheet, exporting it, its QA record | `art/blender/roster/README.txt`, `QA.txt`; the Sunhawk in `art/blender/sunhawk/README.txt` |
| The mechs' ink lines (geometry ink), with how to reproduce the comparison | [docs/mech-lines-report.md](mech-lines-report.md), `art/blender/ink_geometry.py`, `ink-overrides.json` |
| Pictures of the game for checking: scripted cameras, before and after, finding moments | [tools/capture/README.md](../tools/capture/README.md) |
| Every screen at every screen size | `tools/screens.mjs` |
| The mechs' line work, build A against build B | `tools/ink-compare.mjs`, `tools/ink-perf.mjs` |
| The anime opening, from shot list to encode | [tools/trailer/README.md](../tools/trailer/README.md) |

## The method for painted art

Every painted asset (effects, skies and horizons, the track kit, the HUD,
the hangar, the cover and logo, panel lines and markings, model sheets,
faction art) has been made the same way. Keep to it: it is why the pieces
match.

1. **One brief, kept with the art.** The prompt goes in the folder's
   README before the sheet is made, under a table of what each sheet is and
   how the game will use it. A redo gets its own prompt and its own letter
   (9 becomes 9B) rather than the old one being overwritten, so the history
   stays readable.
2. **A sheet is a grid on a flat key colour.** Panels in a set grid (3x2
   for effects, 2x2 or 3x2 for most others, strips for horizons), on pure
   green `#00FF00` or pure magenta `#FF00FF`: magenta for the effects, green
   for most of the rest, and magenta wherever the art itself has green in
   it (Tempest's sheet). The prompt says "perfectly flat, no shading,
   texture, gradient, glow or shadow on the green", every time. Tiling
   textures are asked for evenly lit.
3. **Attach the references.** The design comes from the key art (K1, the
   cover) and the model sheets; what a mech carries comes from a render of
   the game's model; a faction's look from its sheet. Each README lists what
   to attach to each sheet.
4. **One sheet at a time, checked before the next.** Look at every panel:
   the shape, the line, the colour, anything painted onto the key colour
   (smoke in a glow, a shadow on the green). Note in the README's status
   table what was used, what was not, and why.
5. **Cut and build with the scripts, never by hand.** `tools/fx/ingest.py`
   keys a sheet and cuts its panels; `tools/fx/build_sprites.py` and the
   `tools/bg/build_*.py` scripts make the game's atlases and WebPs from the
   sheets, lining up what has to line up (a muzzle's edge, a prow's tip, a
   barrier strike's flat side). The sheet stays the source: rebuilding from
   it must give the same files.
6. **Into the game, then checked in both looks** (below).

**Record the image model.** The READMEs keep every prompt but not which
image model or settings made the sheets, so a sheet cannot be made again
exactly. Add a line to the README with the model, its version and the
image size whenever a sheet is made.

## Checklists

**A new drawn effect**

1. Brief and sheet in `art/fx-sheets/` (3x2 on magenta), with a row in its
   README's table.
2. `python3 tools/fx/ingest.py <sheet> <out> [rows|all] [size] [centre]`
   to try the cut (it writes a preview over a sky and a road colour, and a
   looping GIF), then add it to `tools/fx/build_sprites.py` and run that.
3. Add its kind and atlas in `src/client/render/sprites.ts` (columns,
   rows, how long each drawing holds, `rise`, where its tip or edge is).
4. Trigger it from `src/client/render/raceView.ts` with
   `fx.drawnSprite` (a one-off) or `fx.drawnKeep` (a loop), with a plain-look
   fallback where it replaces one.
5. **Choose what it shows through** (`depth`, see ART.md "What an effect
   shows through"): `DEPTH.ON_MECH` for anything on a mech's surface,
   `DEPTH.AROUND` for a strike or a hit between fighters, `true` for
   anything in the scene (smoke, rings on the road), nothing only for a
   warning that must always be seen. A big ring or burst centred on a mech
   takes `wide(size)`.
6. A row in ART.md's effects table, and captures of it from in front and
   behind (`tools/capture`).

**A circuit's look**: four sheets in `art/bg-sheets/` (sky, the sky's other
half, horizon strips, clouds) and the track kit in `art/track-sheets/`,
then `tools/bg/build_backgrounds.py <circuit>` and
`tools/bg/build_track.py`; its ink colour and grade in
`src/client/render/lookPasses.ts`; a row in each README's status table.

**A faction**: its sheet in `art/faction-sheets/` (pilots, emblem, hangar
lettering), `tools/bg/build_hud.py` and `tools/bg/build_hangar.py`; its
livery and pilots in `src/client/render/palette.ts`; its design language in
FACTIONS.md; its three mechs through the roster below.

**A mech for the roster**: its model sheet in `art/model-sheets/` (four
views at one scale, from the cover and the current render); the Blender
build in `art/blender/roster/` (regenerate from the script, never by hand:
see README.txt), exported as LOD0 to LOD2 GLBs; its ink exceptions in
`ink-overrides.json`; `tests/roster-assets.test.ts` (joints, normals, LODs,
weapons at their firing anchors); the gallery
(`node tools/roster/review.mjs`); a line in QA.txt.

**HUD, menu or hangar art**: `art/hud-sheets/` or `art/hangar-sheets/`,
`tools/bg/build_hud.py` or `build_hangar.py`; then the layouts at every
size (`tools/screens.mjs`), since painted art has to fit 4:3 as well as
16:9.

## Checking a change

The look is judged by eye, so every visual change is looked at before it
ships, in pictures that can be compared.

- **Both looks.** `G` switches anime and plain at any time; `?look=plain`
  and `?look=anime` pick one for a visit. A change to one must not break
  the other.
- **The same moment, before and after.** Seeded demo races
  (`?auto=FW&demo=1&seed=7&track=canyon`, `&skip=95` to start later) repeat
  exactly. `tools/capture/build-ref.sh main` serves the old build on a
  second port; `tools/capture/capture.mjs` renders the same shots from both;
  `compare.py` sets them one above the other. Look at more than one camera:
  the game's own, and an orbit from in front and behind (an effect that is
  right from behind can be wrong from in front).
- **Every screen size.** `node tools/screens.mjs out` tours every screen at
  every size; at least `nova43` (the 4:3 handheld), `phone-l` and
  `desktop169`. In a race, the Video setting's Screen shape (4:3) too.
- **On the devices.** The handheld (Nova, 4:3) and a phone (RedMagic 8 Pro)
  show what software rendering cannot: frame rate, the ink at the real
  resolution, touch.
- **The cost.** `tools/ink-perf.mjs` for the mechs' lines; ART.md's Cost
  section for the passes. Note any change in the doc that owns it.
- **Write it down where it lives**: the rule in ART.md, the sheet's status
  in its README, a roster change in QA.txt.

## Footage and the opening

The opening is made from the game, through the same capture rig: the shot
lists in `tools/trailer` place each shot on the song and in a seeded race,
`tools/capture/capture.mjs` renders the footage at 1080p, and the
compositor draws the titles, lyrics and graphics over it. Any new trailer
or clip can start from it; see [tools/trailer/README.md](../tools/trailer/README.md).
