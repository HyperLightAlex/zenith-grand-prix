# Mech sheets

Painted panel lines and markings for the mechs in the anime look, made by an
image model from the prompt below and checked one sheet at a time, like the
other sheets in `art/`.

| Sheet | What | How the game uses it |
|---|---|---|
| P1 Panel lines | Six tiling squares, 512 px, in a 3x2 grid: dark line drawings on white | Laid over the armour by the part's paint (big plates, smaller panels, the bare frame, the dark parts), multiplied in, so each plate is broken up by seams the way a mecha cel's plates were. Projected from the parts' own shape, so the models need no texture coordinates |
| P2 Markings | Twelve markings on green, one per cell of a 4x3 grid | In place of the markings drawn in code: caution stripes, the warning triangle, the stencils, the small print, the arrow, the lifting point, the racing stripes, and the race numbers 1, 2 and 3; and two new ones, hazard chevrons for the thrusters and a racing roundel to set a number on where the armour is busy. The white ones are coloured by the game for each team (dark on Solstice's white, light on Vanta's charcoal, the numbers in the trim colour) |

The team emblems on the mechs come from the HUD's U3 sheet. The shading
(each paint's own shadow colour) is done in code.

## Status

| Sheet | File | Notes |
|---|---|---|
| P1 Panel lines | mech-p1-panels.png | in the game. Clean, even lines, all six as asked. The squares do not repeat at their edges (line drawings seldom do), so the game repeats them mirrored, which always joins: a seam reaching an edge carries on as its own reflection, and the plates come out symmetrical, as a mech's are. Each is cut just inside the grid lines drawn between them; the lines are thickened a pixel so they still draw at the size a mech is usually seen |
| P2 Markings | mech-p2-markings.png | in the game. All twelve, spelt right, cut cleanly by their outlines (the cutter keeps even the thinnest letters, the T and I). The chevrons and the roundel are cut and ready but not yet placed on the frames |

## The prompt

```
ZENITH GP: MECH PANEL LINES AND MARKINGS (two sheets; make them one at a time, in order P1, P2, each as its own image)

The game: a mech racing game, giant robots in team liveries racing and fighting on circuits in the sky. These sheets go on the robots' armour: the panel lines that break the armour into plates, and the markings painted on it. The game adds the colours and the shading.

STYLE, BOTH SHEETS
- The look of the robots in a 1980s Japanese TV mecha anime: the panel lines and markings as the series' model sheets and cels showed them, clean and deliberate, drawn with a ruler and template, never sketchy.
- Not a photo, not a 3D render, not a modern digital painting: no blur, glow, film grain, noise, perspective or shading.
- Original designs only: no existing logos, brands or text from any real vehicle, aircraft or series.
- Every sheet is 1536x1024, landscape.

SHEET P1: PANEL LINES (six tiling squares, full bleed)
- Six square line drawings in a 3x2 grid, each exactly 512x512, filling the sheet edge to edge with no borders, gaps or labels.
- Each is dark violet-ink lines (#2A2440) on pure white (#FFFFFF), nothing else: no grey fills, tones, shading or second colour. The lines are thin and even, the way panel lines were inked on a mecha cel, about 3 px wide, a few heavier where a plate overlaps the next.
- Each square repeats on its own: its left edge must continue into its right edge and its top edge into its bottom edge, with no visible seam; lines that leave one edge come back in at the opposite edge in line with themselves.
- Seen straight on, flat, with no perspective. Keep the detail evenly spread, with no single feature that would stand out when it repeats.
- 1, top left: big armour plates. Long straight seams dividing the square into four or five large plates of different sizes, joined at right angles and the occasional 45 degree chamfer; one small rectangular access hatch; a few pairs of small round bolt heads. Mostly open white.
- 2, top middle: smaller armour panels. Seams dividing it into eight to ten panels, some with rounded corners; two small hatches with a hinge line; a short row of three narrow vent slots; small bolt heads at a few corners.
- 3, top right: limb armour. Pairs of parallel seams running across the square (the joints of a segmented limb), short seams between them, a narrow raised strip down the middle with small bolts along it.
- 4, bottom left: the bare mechanical frame between the armour. Pistons and their rods, cylinders seen side on, cable runs in parallel pairs, hex bolt heads, a few small gear outlines. Denser than the armour.
- 5, bottom middle: the dark parts. Rows of grille slats and the ribs of rubber joint covers, evenly spaced, with a few bolt heads.
- 6, bottom right: light wear. On pure white, small chips and short scuff scratches in the same ink, sparse and evenly scattered, mostly near imagined plate edges: nothing else.

SHEET P2 IS CUT OUT BY THE GAME
- Paint it on perfectly flat pure green, #00FF00: no shading, texture, gradient, glow or shadow on the green.
- Nothing in the art itself may be green or close to it.
- Crisp edges against the green, with no soft halo.

SHEET P2: MARKINGS (twelve on green)
- Twelve markings, one in each cell of an invisible 4x3 grid (cells 384 wide and 341 tall), each centred in its cell and filling most of it, not touching the cell's edges or another marking.
- Flat colour with crisp edges, as painted on a robot's armour through a stencil or as a sticker. Markings described as white are solid pure white #FFFFFF with any detail cut through as gaps (the game colours them for each team). The rest use only the colours given.
- Lettering: spell every word exactly as given, in capitals, in a plain condensed stencil-style sans serif, and nothing else.
- Top row, left to right:
  1. Caution stripes: a horizontal band about 340 px long and 120 px tall of diagonal stripes in warning yellow #F2B51C and near-black #151A26.
  2. Warning triangle: an equilateral triangle in warning yellow #F2B51C with a near-black #151A26 border and a near-black exclamation mark.
  3. ZGP in large white stencil capitals, and under it a thin white rule and FRAME CLASS A in small white stencil capitals.
  4. Small print in white stencil capitals, five short lines, left-aligned: CAUTION / THRUSTER EXHAUST / KEEP CLEAR 30M / ZENITH GP REG. / NO STEP
- Middle row:
  5. A direction arrow pointing right, solid white, a long shaft and a broad head.
  6. A lifting point: a solid white ring with a solid white dot in its middle.
  7. Twin racing stripes: two parallel solid white horizontal bands the full width of the marking, the gap between them as wide as one band.
  8. Hazard chevrons: a horizontal row of four solid white chevrons pointing right, touching tip to tail.
- Bottom row: the race numbers 1, 2 and 3, left to right, one to a cell, each about 280 px tall, in bold italic 1980s racing numerals: solid white with a thick near-black #151A26 outline. Then in the last cell, a racing roundel: a solid white disc with a thin near-black outline, empty.
```
