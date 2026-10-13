# The 80s anime look

An experiment on the `art-80s` branch: the same game, drawn as if it were a
mecha series from the 1980s (Gundam, Macross, the look Evangelion inherited),
the way Orbitals on the Switch 2 dresses a modern game as a cel-animated
show. Nothing in the race changes. The simulation, its timing and its tests
are untouched; this is all presentation.

The look is on by default on this branch. To compare:

- **G** on the keyboard switches between the anime look and the plain one at
  any time, even mid-race.
- **Pause → Look** does the same from a pad.
- **Tuning panel (T) → Look** has the switch and its settings.
- **`?look=plain`** or **`?look=anime`** on the URL picks one for that visit
  without remembering it.

## What it copies

Not a filter. The look copies the limits of how those shows were made, and
each limit is one piece of the code.

| On a 1980s production | Here |
|---|---|
| Characters painted on cels in two flat tones, the shadow a separate colour mixed for each paint, often toward violet | Cel shading on every mech: one lit tone, one shadow tone, a highlight, a band of bounced light at the shadow's edge, a hard rim when the sun is behind |
| Backgrounds painted separately, softer, with little or no line | The circuit and scenery get gentler cel tones and a light line in their own colour that fades with distance |
| Every character traced in ink, heavier on the outside, thinner inside | An ink pass: a heavy contour round each mech that thins with distance, thin lines where parts overlap, fold or change paint, none where a paint meets its own shadow |
| Each drawing traced again by hand, so lines shimmer | The lines are traced a fraction of a pixel off on every new drawing ("boil") |
| Animation on twos (12 drawings a second) and threes for held poses | Mech poses at 12 a second, 8 when held (boosting, carving, a burst); effects change shape on the same drawings; movement, the camera and the race stay at 60 |
| Effects drawn by hand: sparks as stars, smoke as shapes, glows as flat rings | The big effects are painted cel animation, a few drawings each (see Drawn effects below); the small sparks are four-pointed stars with a white core, light trails flat bands, the bloom cut into rings |
| Speed shown with drawn lines, not blur | Drawn speed lines, mostly white and a few in ink, new on every drawing; the radial blur cut to a third |
| Shot on film | A film pass: halation (bright light bleeding orange into the emulsion), a little colour fringe and softness, gate weave, grain at 24 frames a second, a grade toward the painted palette, blacks that are paint rather than black |
| Big moments cut to something else | Impact frames on heavy blows, the knockout held as a painted still, title cards for the lap phases, an eyecatch before the results |

## The moments

- **Impact frame.** On a heavy blow, a momentum strike, a parry, a guard
  break or a ring-out that involves you: one drawing in negative, then one in
  two flat tones with the lines in red, about a tenth of a second in all. No
  more than one every 1.2 s, so they keep their punch and never strobe.
- **Painted still.** On a knockout you had a hand in (the same rule as the
  slow motion), after the impact frame the frame is held for 0.7 s and laid
  down again as a painting: brush strokes that wander across it, the tones
  set in a few flat values, hatching in the shadows, heavier ink, warm rough
  paper, a deep vignette, pushing slowly in. The race clock stops for it,
  then the slow motion carries on.
- **Title cards.** "Battle lap" and "Speed lap" come up as episode cards: a
  hard cut to a black band across the frame, heavy serif type set tall
  (Hiragino Mincho on a Mac, Yu Mincho on Windows, Times otherwise), a red
  rule, an episode line over the title ("Lap two"). The card lands inverted
  for one drawing. Your finish and the knockouts you take part in use the
  same card.
- **Eyecatch.** When the round ends, before the results, the last frame is
  held as a painted still for two seconds under the show's title on a
  slanted black card, the way a broadcast went to its break.

## Drawn effects

Each effect is a few drawings painted as cels on a sheet (`art/fx-sheets`,
painted by an image model to one brief, then checked one at a time). Glows
are painted in cyan with white cores and recoloured in the game to the
team, the weapon or the moment; smoke is painted grey in two tones with an
ink line and shaded in the game to the dust or smoke it needs; the
knockout keeps its own colours. They play on the drawing clock.

| Effect | Sheet | Where it shows |
|---|---|---|
| Hit spark | 1 | Light hits, blocked hits, gunfire |
| Heavy impact | 2 | Heavy and momentum blows, guard breaks |
| Parry glint | 3 | Parries |
| Blade smears | 4, 4B | Light and heavy cuts, kicks, hammers |
| Lance thrust | 5 | The lance |
| Shock ring | 6 | Momentum strikes, and every ring flash (Pulse, Aegis, Overdrive, a snare) |
| Ground ring | 6B | Dashes, launches, hard landings, recovery |
| Thruster flames | 7 | Every nozzle while boosting, gold in Overdrive |
| Smoke | 8 | Dust off landings, launches and the barrier, in the circuit's dust colour; smoke trailing a badly hurt mech, darker clouds off a wreck |
| Barrier strike | 9B | Hitting a barrier (amber) and ring-outs (pink): flat side on the barrier, bursting back over the road |
| Energy crackle | 10 | Bolts round a snared mech (orange) or one breaking away (its team colour); a ring on the road round a mech in Overdrive (gold) |
| Pickup sparkle | 11 | Cell gates (gold), speed pads (magenta), recovery (team colour) |
| Knockout explosion | 12 | Knockouts: flash, fireball, smoke closing over it, smoke breaking up; the painted still holds the fireball |

`tools/fx/ingest.py` keys out a sheet's magenta and cuts its panels (and
can take out smoke an image model painted into a glow);
`tools/fx/build_sprites.py` makes the game's atlases from them, lining up
what needs lining up (the barrier strike's flat side, a row painted off its
panel). `src/client/render/sprites.ts` plays them: one-off effects run
through their drawings once, some held for two; loops (the crackle) are
asked for every frame they should show, and play their drawings in a
random order, flipped and turned, so three drawings never visibly repeat.
The procedural explosion the painted one replaced is still in
`sprites/explosion.png` (`tools/fx/explosion.py`).

## Settings (tuning panel, Look tab)

| Setting | Default | |
|---|---|---|
| 80s anime look | on | Everything below only applies while it is on |
| Film | 1 | Grain, halation, softness and fringe, 0 to 2 |
| Ink lines | 1 | 0 turns the ink pass off (the mechs get their plain outline back) |
| Line boil | 1 | How far lines and grain move between drawings |
| Drawings a second | 12 | Poses and effects. 8 is on threes, 0 is smooth |
| Impact frames | on | |
| Knockout still | on | |

## How it is built

The look is one switch, `look.on`, copied from the tuning values every
frame, and a drawing clock that ticks at the drawing rate. Everything that
should only change on a new drawing (a pose, an effect's shape, the boil of
the lines, the speed lines) keys off that clock.

```
RenderPass ─► Ink ─► Bloom (banded) ─► Speed (drawn lines) ─► Film ─► Output (ACES, sRGB)
   │           │
   │           └ depth texture + the colour buffer's alpha (1 = background, 0.5 = a character)
   └ cel-shaded materials write the character mark
```

- `src/client/render/look.ts`: the switch and its settings, the drawing
  clock, and the cel shading. `celify()` patches every toon and Lambert
  material once (chaining any patch it already had, like the armour's) and
  is switched by a uniform, so changing the look never recompiles a shader.
  The lit tone is as bright as the plain look lights that surface at a
  typical angle, so the two looks agree on how bright a circuit is. The key
  light is lifted toward overhead for the shading: a low sun would otherwise
  leave half of every mech in shadow from every angle. Mechs are marked as
  characters (`markCharacter`) and write alpha 0.5, which is how the ink
  pass tells a cel from a background.
- `src/client/render/lookPasses.ts`: the ink pass and the film pass, and
  each circuit's ink colour and grade. The ink pass finds outlines from the
  depth's second difference (large on the near side of a step, small across
  a plane however steeply it is seen, so a road running to the horizon is
  never inked) and paint edges from the ratio of brightness across a pixel
  (paint changes it a lot, a shadow much less). Line widths are set for a
  1080-line frame and scale with the resolution.
- `src/client/render/renderer.ts`: the pass chain, the banded bloom, the
  drawn speed lines, and the moments (impact frames and stills, rate-limited
  and only while racing).
- `src/client/render/fx.ts`: the drawn sparks, smoke, bursts, slashes,
  trails and shadows, and the stepping of effect shapes. The wind-up tells
  stay smooth: they are for timing a parry.
- `src/client/render/raceView.ts`: poses on the drawing clock, and the
  triggers for impact frames.
- `src/client/ui/hud.ts`, `src/client/ui/eyecatch.ts`, `styles.css`: the
  title cards and the eyecatch.

## Cost

Two full-screen passes (ink, about 17 texture reads a pixel; film, about
20) and some extra branches in the materials. In a software renderer the
whole frame costs about 17% more than the plain look; on a GPU the passes
are a small part of the frame. The renderer's resolution scaling still
works as before, and on the low quality setting the ink pass is skipped.

## What it does not do yet

These are the parts that would take it from a convincing pass to a finished
style, roughly in order of payoff.

- **Painted backgrounds.** The scenery is still flat-coloured geometry. A
  background painter's work (texture in the sky and the cliffs, painted
  light on the buildings, the sea as brushwork) needs painted textures or a
  painterly shader per surface.
- **A shadow colour per paint.** Shadows are one tint per circuit applied
  to every colour. A cel painter mixed a shadow for each paint (the white
  armour's lavender, the red's maroon). A small table per livery would do
  it.
- **The last effect sheets.** Sheets 13 to 16 (the stun kick, the breaker
  hammer, muzzle blasts, the ram's charge) are written into the same brief
  but not painted yet; until then those use the hit sparks and impacts.
- **Coloured lines.** Lines are ink everywhere. Productions used coloured
  lines inside light areas (on a glow, on the sky side of a cloud).
- **Lines between two overlapping mechs** fall back to the depth test, so
  two mechs at the same distance can merge. An id buffer would separate
  them.
- **Faces and decals.** Number decals and the team emblems are textures
  that the ink pass reads as paint edges, which is mostly right but can be
  busy at a distance.
- **A 30 frames a second option** for the whole picture, as Orbitals does.
  Racing feels worse at 30, so it would be a setting, not the default.
- **The garage and title screens** use the look as it is; neither has a
  composition of its own yet (a key-art title, a model sheet garage).

## Checking it

`?look=plain` and `?look=anime` with the usual shortcuts
(`?auto=FW&demo=1&seed=7&track=canyon`) give the same race in each look,
which is how the comparison shots for this branch were made.
