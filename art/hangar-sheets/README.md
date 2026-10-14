# Hangar sheets

The painted kit for the garage's hangar in the anime look, made to match the
track kit (`art/track-sheets`): the same paint department, the same hand. It
is made by an image model from the prompt below and checked one sheet at a
time, like the other sheets in `art/`.

| Sheet | What | How the game uses it |
|---|---|---|
| H1 Surfaces | Six tiling squares, 512 px, in a 3x2 grid, evenly lit | The floor, the wall cladding, the roof's underside, the catwalks' grating, the hazard stripes, and the pipes and conduits along the foot of the walls |
| H2 Signs | Six signs on green, one per cell of a 3x2 grid | The team's name under its emblem, and safety signs on the walls and cradles |

What stays as the game draws it: the bay's hazard square, the turntable's
ring and ticks, the lines out to the door, the bay numbers, the team's colour
bands and emblem, and every lamp, screen and glow. The markings are drawn
over the painted floor, crisp, as on the circuits.

The structures (trusses, cradles, crane, catwalk rails) take the track kit's
painted steel, and the crates are painted in code, so they need nothing new.

What to attach:

| Sheet | Attach |
|---|---|
| H1 | `track-sheets/track-t1-surfaces.png` (the style and the hand to match) |
| H2 | `track-sheets/track-t2-boards.png` (how signs are painted in this kit) |

## Status

| Sheet | File | Notes |
|---|---|---|
| H1 Surfaces | hangar-h1-surfaces.png | in the game. All six as asked. The floor is cut from one of its joints and the rest to the length that wraps best each way, seams blended; the hazard stripes are not quite at 45 degrees, so they are cut to a whole number of stripes each way and the small offset at the seams blended. The pipes repeat along the walls every 3.8 m, keeping their whole height, between the hazard skirt and the team's stripe |
| H2 Signs | hangar-h2-signs.png | in the game. All six spelt right. Each cut from the pieces whose middles fall in its cell (SOLSTICE runs a little over its cell's edge); the team names stand in for the lettering drawn in code, the safety signs go by the door, the tanks, the power feed and the tool chests |

## The prompt

```
ZENITH GP: HANGAR KIT (two sheets; make them one at a time, H1 then H2, each as its own image)

The setting: the garage of a mech racing team, a tall steel hangar where one giant racing robot stands on a turntable in its bay. A concrete floor, walls clad in ribbed steel panels with pipes and conduits along their foot, a corrugated steel roof on trusses, catwalks along the walls, maintenance cradles, freight crates. Each of the two teams has a hangar of its own; the game paints the team's colour bands, its emblem, the floor markings and every light itself. These sheets are the painted surfaces and signs under them. They must look painted by the same hand as the attached sheet, which is the circuits' kit from the same show.

STYLE, BOTH SHEETS
- Art from a 1980s Japanese TV mecha anime: the surfaces painted by hand the way the background department did it, in poster colour (gouache) on illustration board, a few flat tones per form with visible but controlled brush strokes and a little dry-brush texture for wear; the signs painted as clean, flat graphic design, the way background artists painted signage into a scene. Match the attached sheet.
- No ink outlines on the surfaces.
- Not a photo, not a 3D render, not a modern digital painting: no bloom, lens flare, blur, film grain or noise (the game adds its own grain).
- Palette: floor concrete warm grey #8A8F99, wall cladding blue-grey #8D98AA, dark steel #39414F, hazard yellow #F0BF2C and black #23262E, warning orange #FF7A1A, fire red #D8232C, navy #0D1630. Nothing may be green.
- Every sheet is 1536x1024, landscape.

SHEET H1: SURFACES (six tiling squares, full bleed)
- Six square textures in a 3x2 grid, each exactly 512x512, filling the sheet edge to edge with no borders, gaps or labels.
- Each square repeats on its own: its left edge must continue into its right edge, and (except square 6) its top edge into its bottom edge, with no visible seam. Paint each straight-on (flat, no perspective) and evenly lit, with no cast shadows across it and no vignette: the game adds the light. Keep the detail even, with no single feature that would stand out when it repeats.
- 1, top left: the hangar floor seen from straight above, one square slab about 4 m across: sealed concrete in warm grey, a faint expansion joint along all four edges, a few dark oil stains and drips, faint scuffs from the robots' skate wheels, a little grit. No painted lines, numbers or markings of any kind (the game paints them).
- 2, top middle: the wall cladding, a square about 4 m across: blue-grey steel panels with shallow vertical ribs every 25 cm, one panel to the square with its seams at the left and right edges, a row of fixings along the top and the bottom, grime streaks running down from the fixings, a few dents and scuffs low down.
- 3, top right: the underside of the roof, seen from below: dark blue-grey corrugated steel decking, the corrugations running left to right, faint water stains, a little rust at the laps.
- 4, bottom left: the catwalks' floor seen from straight above, a square about 1.5 m across: dark steel bar grating, the bars running top to bottom with cross rods every 10 cm, the gaps between them nearly black, worn bright where boots have scuffed it.
- 5, bottom middle: worn hazard paint, a square about 1 m across: bold diagonal stripes of yellow and black at exactly 45 degrees, rising to the right, four yellow and four black of equal width, chipped and scuffed, the yellow dirtied at the chips. The stripes must meet themselves across every edge.
- 6, bottom right: the services along the foot of the walls, a strip about 4 m long and 4 m high that repeats left to right only (its top and bottom need not match): on the same blue-grey cladding, three or four pipes and conduits running left to right at different heights, in red, yellow, white and dark blue, with valves, flanges, pipe clamps, a junction box, a pressure gauge and a fire-hose reel. Nothing in it may stand out so much that it shows when the strip repeats every 4 m.

SHEET H2: SIGNS (six signs on green, cut out by the game)
- Paint them on perfectly flat pure green, #00FF00: no shading, texture, gradient, glow or shadow on the green.
- Nothing in the art itself may be green or close to it.
- Crisp edges against the green, with no soft halo.
- Every sign is seen straight-on, flat, evenly lit, with no frame, posts, screws, reflections or perspective.
- Lettering: spell every word exactly as given, in capitals, and nothing else: no slogans, small print, numbers or web addresses.
- Six signs, one in each cell of an invisible 3x2 grid (cells 512x512), each centred in its cell and not touching the cell's edges or another sign.
- 1, top left: SOLSTICE, the team's name as painted high on its hangar wall: huge, heavy, forward-slanting italic capitals in white with a thick navy #0D1630 outline and a navy drop shadow down and to the right, about 470 px wide. Nothing else.
- 2, top middle: VANTA, in exactly the same lettering, colours and outline, about 470 px wide. Nothing else.
- 3, top right: a caution sign, 300 px wide and 300 px tall: a black square with a yellow #F0BF2C border, a yellow pictogram of a giant robot on skates striding to the right, CAUTION above it and MECH CROSSING below it in bold yellow capitals.
- 4, bottom left: a no-smoking sign, 240 px wide and 300 px tall: a white board with a red #D8232C circle and diagonal bar over a black cigarette pictogram, and NO SMOKING in black capitals under it.
- 5, bottom middle: a fire point sign, 240 px wide and 300 px tall: a red #D8232C board with a white fire extinguisher pictogram and FIRE POINT in white capitals under it.
- 6, bottom right: a high-voltage sign, 300 px wide and 280 px tall: a yellow #F0BF2C triangle with a thick black border and a black lightning bolt in it, above a white panel with DANGER HIGH VOLTAGE in black capitals.
```
