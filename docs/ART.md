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
| Animation on twos (12 drawings a second) and threes for held poses | Mech poses at 12 a second, 8 when held (boosting, carving, a burst); effects change shape on the same drawings. The human pilot's banking and foot placement respond every display frame, so steering never waits for a drawing; movement and the camera stay smooth, and the race simulates at 60 Hz. |
| Effects drawn by hand: sparks as stars, smoke as shapes, glows as flat rings | The big effects are painted cel animation, a few drawings each (see Drawn effects below); the small sparks are four-pointed stars with a white core, light trails flat bands, the bloom cut into rings |
| Speed shown with drawn lines | Drawn speed lines, mostly white and a few in ink, new on every drawing, more of them the faster it goes. Under them, in both looks, the world stretches past: each pixel smears away from the middle of the frame (the way the camera is going, so the streaks never lean into a bend ahead) by as far as the camera travels in a seventh of a frame over that pixel's distance (from the depth buffer), so the road, the barriers and the stands streak and the sky and the far hills hold still. The mechs, which travel with the camera, are drawn into a small mask each frame and left sharp. (The look first cut the blur to a third, and the road's dashes then went past crisp and read slower than the plain look.) |
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
| Thruster flames | 7 | Every nozzle while boosting, gold in Overdrive. A card along the flame, so it shows side on; end on (the chase camera looking into the back thrusters) a drawn burner takes over: a flat white core in rings of the team's colour with spikes that grow with the thrust, a new drawing on each of the flame loop's three, fading in as the view comes round to look into the nozzle (drawn in code, not from the sheet) |
| Smoke | 8 | Dust off landings, launches and the barrier, in the circuit's dust colour; smoke trailing a badly hurt mech, darker clouds off a wreck |
| Barrier strike | 9B | Hitting a barrier (amber) and ring-outs (pink): flat side on the barrier, bursting back over the road |
| Energy crackle | 10 | Bolts round a snared mech (orange) or one breaking away (its team colour); a ring on the road round a mech in Overdrive (gold) |
| Pickup sparkle | 11 | Cell gates (gold), speed pads (magenta), recovery (team colour) |
| Knockout explosion | 12 | Knockouts: flash, fireball, smoke closing over it, smoke breaking up; the painted still holds the fireball |
| Kick | 13 | The stun kick: a rising smear, the contact star at its tip |
| Stun | 13B | A staggered mech shorting out round its head and shoulders, for as long as the stagger lasts |
| Hammer | 14B | The Breaker and the Breaker Slam coming down; a slam also cracks the road round the mech it hits |
| Muzzle blasts | 15 | Every shot, along its line: a spike from a rifle, a cone from the scatter cannon (once a volley) |
| Ram | 16 | The Ram: the charge starting, then the prow's bow shock ahead of the mech while it lasts (seen from behind, smaller and behind the mech) |

`tools/fx/ingest.py` keys out a sheet's magenta and cuts its panels (and
can take out smoke an image model painted into a glow);
`tools/fx/build_sprites.py` makes the game's atlases from them, lining up
what needs lining up (the barrier strike's flat side, a muzzle, a prow's
tip, a row painted off its panel). `src/client/render/sprites.ts` plays them: one-off effects run
through their drawings once, some held for two; loops (the crackle) are
asked for every frame they should show, and play their drawings in a
random order, flipped and turned, so three drawings never visibly repeat.
The procedural explosion the painted one replaced is still in
`sprites/explosion.png` (`tools/fx/explosion.py`).

## Shadow colours per paint

On the mechs each paint has a shadow colour of its own (`shades` in each
livery, `palette.ts`), mixed the way a cel painter mixed them rather than the
paint darkened: Solstice's white armour shades to lavender grey, its blue to
deep ultramarine-violet, its gold to burnt orange; Vanta's charcoal to deep
violet, its red to maroon, its pale grey trim to lavender. The armour carries
each part's shadow paint as a vertex attribute beside its colour, and the
circuit's light only leans the shadows a little (`uShadeLean`, at the same
brightness). The rest of the scene keeps one shadow tint per circuit.

## Panel lines and markings on the mechs

In the anime look the mechs wear painted panel lines and markings
(`art/mech-sheets`; `tools/bg/build_mech.py` builds them into
`src/client/render/mech/art` and `mechArt.ts`):

- **Panel lines** break the armour into plates the way a mecha cel did. Each
  part wears the drawing for its paint (big plates on the body's primary
  armour, limb segments on the arms and legs, smaller panels on the
  secondary colour and trim, the mechanical frame, grilles on the dark
  parts) and a little wear on the paint. The parts have no texture
  coordinates, so the drawing is projected flat along whichever axis each
  face looks down, in the part's own space so it moves with it, and repeated
  mirrored, which joins at every edge. The lines are drawn in a deeper mix of
  the paint's own shadow colour and fade out where they would be too fine.
- **Markings**: the caution stripes, warning triangle, stencils, small print,
  arrow, lifting point and racing stripes painted, the white ones coloured
  for the team (dark on Solstice, light on Vanta, the stripes in the trim),
  the team emblem from the HUD's sheet, and the race numbers in the trim
  colour with their dark outline. They swap in for the drawn sheet while the
  look is on (`setPaintedMarkings`).

## Painted backgrounds

In the anime look every circuit has its scenery painted, the way a
background department painted behind the cels. The sheets are in `art/bg-sheets`, painted by an image model
to one brief per circuit and checked one at a time.

- **The sky** all the way round, horizon to zenith, in two halves: the half
  facing the sun, with its glow, and the half facing away (Helios, lit from
  overhead, uses one half twice). Turned so the glow is round the sun, which
  is still drawn as a hard disc on top: where the light comes from at
  Meridian, on the horizon at Canyon (its sky is painted with the sun
  setting; the disc sinks behind the far mesas), high overhead at Helios.
- **The horizon**: three painted strips, each on a ring round the circuit at
  its own distance (Meridian: far mountains, the coast, a city across the
  water; Canyon: mesas, buttes and spires, hoodoos; Helios: far snowy peaks,
  nearer peaks, a wall of cumulus), standing on the ground and repeating
  round the circle. They move against each other a little as the circuit
  turns, as layered paintings would.
- **Clouds**: painted cumulus cards in place of the modelled ones, turning to
  face the camera but staying upright.
- **Surfaces**, as repeating painted textures:
  - Meridian: the sea, three kinds of tower facade (glass offices, hotels,
    dark glass), the platforms the towers stand on, and white panels on the
    landmarks.
  - Canyon: the desert floor (the sand at two sizes and angles blended by a
    slow noise, so its scrub never lines up into a grid, with pans of cracked
    clay and broad light and shade), the gorges' rock, strata cliffs and
    caprock on the cut, the mesas and the arch, the hoodoos' softer stone.
  - Helios: the cloud sea (drifting, at two sizes), layered rock under the
    islands and meadow on top, whitewashed buildings, and engraved gold on
    the Sun Gate and the spire's collar.
  The rock's texture coordinates come from the world position and each
  face's facing (`paintedRock` in `world.ts`): the strata stay level all the
  way round a mesa and dip gently across the desert, so no two mesas band
  alike, and whatever faces up gets the top texture.

`tools/bg/build_backgrounds.py` turns the sheets into the game's textures:
it matches the two sky halves' colours across their joins, cuts the strips
and clouds out of the green with a colour-difference key, and cuts each
surface square to the length that repeats best, blending its seams. The key
alone misjudges an edge whose colour has some green in it (a blue-white
cloud's rim reads as solid and comes out teal, an orange one too solid and
olive), so each edge pixel is then taken as a mix of the green and the colour
a few pixels further in, and its alpha read from where it lies between them. It
writes `src/client/render/backgrounds/<circuit>.ts`, which `painted.ts`
collects; `world.ts` swaps between the plain scenery and the painted one
with the look. The frame's ACES tone mapping would change a painting's
colours (lifted mids, grey whites), so the sky, horizon, clouds and sea undo
it first (`unTone` in `painted.ts`) and come out as painted.

## The painted track kit

Everything bolted to the circuit is painted too, from one kit shared by all
three circuits (`art/track-sheets`; `tools/bg/build_track.py` builds it into
`src/client/render/backgrounds/track.ts`, and `trackMesh.ts` switches it with
the look):

- **The road deck**, under all the markings. Each 24-unit run of road takes
  the texture from its own place in it, so its scuffs never line up panel
  after panel; the panel seams cover the joins.
- **Barriers**: armour on the faces toward the road (one repeat the face's
  whole height), dark ribbed steel over the top and down the back; the slab
  under the road and the pylons in concrete; the gantries in riveted navy
  steel; the grandstands' crowd, cut on whole rows of seats, and their bases
  in concrete.
- **Boards**: the sponsors' boards, the circuit's own and the race's, and the
  banner over the line, each in a frame of its own shape (the paintings came
  out a little deeper than the plain boards), drawn as painted.

What stays as the game draws it in both looks: the lane and edge lines,
kerbs, chevrons, the start line and grid, charge strips, speed pads, cell
gates, jump stripes, the barriers' light strips and energy field and the
start lights. They are signals, so they stay crisp and bright, over the
paintings.

## The painted HUD

In the anime look the race HUD carries painted art (`art/hud-sheets`;
`tools/bg/build_hud.py` builds it into `src/client/ui/art` and
`src/client/ui/hudArt.ts`):

- **Icons** for the abilities, team plays, status chips, wind-up warnings and
  roles, beside their words. They are white and drawn as CSS masks, so each
  takes the colour of the text round it: gold when an ability is ready, ink on
  a lit chip, the team's colour on a name plate.
- **The pilots**: a cut-in of the pilot's face beside each radio line, as on an
  anime comms screen, and on the target panel (turned to face the middle).
- **Team emblems** in the score and as the standings' flags.
- **The countdown** as painted: 3, 2, 1 and GO! in chrome lettering, and the
  place, speed and points set in the same chrome (a CSS gradient through the
  text, with a navy outline).

Every number and name is still live text, and the panels keep their shapes;
in the plain look none of the art shows.

## The title screen

In the anime look the title screen is the show's cover (`art/key-sheets`;
`tools/bg/build_key.py` builds it into `src/client/ui/art` and
`src/client/ui/keyArt.ts`): a painting composed like a mid-80s soundtrack
cover, the hero pilot close up with her Swift behind her against a sunset,
its left 40% open sky. The logo, tagline and menu sit over that sky, the
lettered logo swapped for the painted one (ZENITH GRAND PRIX in the same
chrome as GO!). The race between computer pilots still runs underneath, so
switching the look shows it again. The eyecatch before the results carries
the painted logo on its black card too.

## The menus: the hangar and the broadcast

In the anime look the menus are screens inside the show's world.

- **In the pits, the hangar computer.** The garage and the controls are your
  team's hangar screens: dark glass with scan lines, rounded like a tube,
  the type glowing in the team's colour (Solstice cyan, Vanta pink: change
  the team and the screens change with it). They switch on like a CRT as you
  arrive. The chosen row is lit, with a cursor. The specs are segmented
  bars, and the weapons and abilities are on a second screen. Your mech
  turns in its bay, marked with corner brackets: the garage camera shifts
  its lens (`CameraRig.shiftX`) so the mech stands clear of the menu, in
  both looks.
- **On air, the broadcast.** Pause cuts to the show's eyecatch card (the
  logo on the slanted black card, as before the results), with the choices
  as the broadcast's slabs. The results are the broadcast's standings, like
  the HUD's tower: team emblems, the pilots' faces, chrome points and score.

With reduced motion the screens appear without switching on and the cursor
does not blink. In the plain look the menus are unchanged, apart from the
garage's camera.

## The garage's hangar

The garage is set in your team's hangar (`src/client/render/hangar.ts`), in
both looks: your mech alone on a turntable in its bay, the team's emblem high
on the back wall on a band of its colour, the bay's number on the floor,
catwalks, a control room glowing in the team's colour, empty maintenance
cradles, a crane in the roof, and the bay door open onto the apron and the
circuit's own sky. It is built once and stood round your mech while the
garage is up; the circuit, its scenery and the other mechs are hidden
meanwhile (`RaceView.solo`), and the camera circles the mech in the hangar's
frame (`CameraRig.orbitFrame`) rather than along the road. The mech stands
at rest there (`POSES.standby`, with breathing and a slow look about, and
only its pilot lights lit) instead of crouching as on the grid. Nothing tall
stands inside the camera's circle, so nothing passes between the lens and
the mech. The hangar brings its own key and fill light in place of the
circuit's, the same kinds and number, so no material recompiles going in or
out.

Everything else that looks like light is painted on: shafts of daylight down
from the high windows and the patches where they land, floodlights on the
cradles and catwalks with faint beams toward the mech, the pool of their
light on the turntable, glows round the roof's lamps, and the daylight
spilling in across the floor from the door in the circuit's own light. They
are added over the frame but leave its alpha alone, so a shaft across a mech
does not disturb the anime look's ink. The dressing: a spare arm on trestles,
tool chests and shelving, cables sagging in the roof and a power feed across
the floor to the turntable, the team's name painted on a wall and over the
door, and the other two bays' boards on their cradles.

In the anime look the hangar is painted (`art/hangar-sheets`;
`tools/bg/build_hangar.py` builds it into `src/client/render/backgrounds/hangar`):
the concrete floor with the markings laid over it, the wall cladding, the
roof's underside, the catwalks' grating and the hazard stripes, each
material swapping for its painted twin with the look; the pipes and conduits
along the foot of the walls; the team's name as painted (for a team whose
lettering has been painted; drawn in code otherwise); and the safety signs.
The decals keep the frame's alpha, so their soft edges are not inked.

## Lines: coloured, and between mechs

- **Coloured lines.** A line with light on both sides of it (a fold in white
  armour, the edge of a pale barrier or of the Zenith Ring against the sky)
  is traced in a deeper shade of that colour, as the cels did, not in ink. A
  mech's outer contour stays ink.
- **Mech against mech.** Each mech carries its own mark in the alpha of the
  frame (on its parts' geometry, since the materials are shared within a
  team), and the ink pass draws a contour wherever one mech meets another,
  so two side by side in a pack, at the same depth, still part with a line.
- **Simpler further off.** A mech's lines where paints meet (the edges of
  its numbers and emblems among them) fade between 22 and 60 units, and its
  creases soften, as a cel drew a distant figure; its outline and overlaps
  stay. (They made a far mech busy.)

## 30 frames a second

"30 frames a second" on the Look tab draws the anime look at 30, as the
series was shown; the race, the controls and the sound still run at the
display's rate. A frame left undrawn hands its time on to the next one, and
the HUD (its marks over the mechs above all) updates only on the frames
drawn, so it moves with the picture. Off by default: racing feels better at
60.

## Feel of speed: the walls' light strips

The light strip along the top of each barrier runs in dashes, 8 units lit
and 8 dark, so it streams past at about ten a second at full speed; one
unbroken line gave the eye nothing to measure the speed by.

## Feel of speed: the boost lurch

As a boost lights (and harder as Overdrive does), the view jumps a few
degrees wider in a twentieth of a second and settles back over a third, on
top of the steady widening the boost brings, so the kick of it is felt
("Boost lurch" on the tuning panel's camera tab, 7 degrees by default).

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
- `src/client/ui/hud.ts`, `src/client/ui/eyecatch.ts`, `menus.ts`,
  `styles.css`: the title cards, the eyecatch and the menus.

## Cost

Two full-screen passes (ink, about 17 texture reads a pixel; film, about
20) and some extra branches in the materials. In a software renderer the
whole frame costs about 17% more than the plain look; on a GPU the passes
are a small part of the frame. The renderer's resolution scaling still
works as before, and on the low quality setting the ink pass is skipped.

## Checking it

`?look=plain` and `?look=anime` with the usual shortcuts
(`?auto=FW&demo=1&seed=7&track=canyon`) give the same race in each look,
which is how the comparison shots for this branch were made.
