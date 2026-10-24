# Background sheets

Painted backgrounds for the anime look, one set per circuit, made by an image
model from the prompts below and checked one sheet at a time, like the effect
sheets in `art/fx-sheets`. Each circuit has four sheets (Neon Crucible's
differ a little: see its section):

| Sheet | What | How the game uses it |
|---|---|---|
| 1 Sky | Half the sky, the half facing the sun, unrolled: the horizon level about three quarters down, the zenith along the top, the sun's glow at the middle | Half the sky dome, horizon to zenith, in place of the gradient, the middle turned to face the sun |
| 1B Sky | The other half, facing away from the sun, painted to join sheet 1 at both edges (made with sheet 1 attached) | The other half of the dome. Helios has no sun side, so its sheet 1 is simply used twice |
| 2 Horizon | Three silhouette strips on green, each tiling end to end, farthest at the top | Rings round the circuit at three distances, for depth, in place of the cone mountains |
| 3 Clouds | Six clouds on green, one per cell of a 3x2 grid | Painted cards in place of the cumulus |
| 4 Surfaces | Six tiling squares, 512 px, in a 3x2 grid, evenly lit | Textures on the scenery (sea, rock, buildings), under the cel shading |

Why half a sky to a sheet: a sheet is 1536 px wide and its sky 745 px tall.
Stretched round all 360 degrees but only up to the zenith, it would be four
times as coarse across as it is up and down, the clouds pulled out sideways.
As half the sky it has the same detail both ways, about 8.5 px a degree.

The green (`#00FF00`) is keyed out by how far the green stands above the
other two channels (a colour-difference key), with the green taken back out
of the edge pixels; nothing painted on these sheets is green.

## Status

Every circuit's sheets are in the game (`tools/bg/build_backgrounds.py`).

| Sheet | File | Notes |
|---|---|---|
| M1 Sky | bg-m1-sky.png | horizon at 745 px; the edges wrap well; the sun-side half of the sky |
| M1B Sky | bg-m1b-sky.png | horizon at 744 px; the sky's colour meets M1's at both edges, but its pink horizon band against M1's peach shows as a step, so the joins are blended over a few hundred pixels |
| M2 Horizon | bg-m2-horizon.png | three strips, bottoms dead level, ends match to within a few pixels |
| M3 Clouds | bg-m3-clouds.png | six clouds; the second is a little wider than its cell, so the clouds are cut by their outlines, not by the grid |
| M4 Surfaces | bg-m4-surfaces.png | the squares do not quite repeat at their edges; each is cut to the length that wraps (whole window bays on the facades) and its seams blended |
| C1 Sky | bg-c1-sky.png | horizon at 697 px; the glow sits right on the horizon, as asked (the sun just touching it), so the game draws the sun's disc there, not at the light's height |
| C1B Sky | bg-c1b-sky.png | horizon at 697 px, level with C1's; C1's right edge runs into it cleanly, but C1's left edge carries more of the sunset's orange than C1B's right edge, so that join is blended over a wider band |
| C2 Horizon | bg-c2-horizon.png | three strips (mesas, buttes and spires, hoodoos), bottoms dead level, ends matching exactly |
| C3 Clouds | bg-c3-clouds.png | six clouds; the broken line of cloudlets has a sliver of painted sky between two of them, dropped when cut (nothing in these clouds is greener than it is red); orange edges need a stronger spill clamp than Meridian's |
| C4 Surfaces | bg-c4-surfaces.png | squares do not quite repeat; cut and blended like M4. The desert floor's scrub tufts would repeat in a visible grid on their own, so the game breaks it up with large-scale variation |
| H1 Sky | bg-h1-sky.png | horizon at 735 px; the light is even all the way round (high sun), so the one sheet serves as both halves; the edges wrap well |
| H2 Horizon | bg-h2-horizon.png | three strips (far peaks, nearer peaks, cloud tops), bottoms level, ends within a few pixels |
| H3 Clouds | bg-h3-clouds.png | six clouds; the last is a cluster of small ones, kept together as one card. The white edges against green leave a faint teal fringe, clamped when cut |
| H4 Surfaces | bg-h4-surfaces.png | cut and blended like M4; the gold panels and the white wall have a regular rhythm, so they are cut on whole panels and courses |
| N1 Sky | bg-n1-sky.png | horizon at 767 px; the moon's halo where asked, at the middle and 25 degrees up, but fainter than the city's glow along the horizon, so its column is given by hand (the cutter would take the glow for it) and the game draws the moon's disc there |
| N1B Sky | bg-n1b-sky.png | horizon at 767 px; its edges match N1's closely, the joins blended as usual |
| N2 Horizon | bg-n2-horizon.png | three strips (mountains, the far city, the foundry district), bottoms level, ends matching; the foundry's steam is crisp enough to cut cleanly |
| N3 Smoke and steam | bg-n3-smoke.png | six plumes, cut cleanly; a few greenish dabs painted inside the smoke, put back to its lavender when cut. Each plume's foot is found from its bottom rows (`base`). Not shown at present: as flat cards turning to face the camera, the plumes showed their turning in motion, and the stacks and the pour now rise in drawn puffs (fx sheet 8, recoloured) instead |
| N4 Surfaces | bg-n4-surfaces.png | cut and blended like M4. The facade also gives a map of its lit windows alone (`facadeLit`), for their glow; the game draws it half as large again as painted, so the windows stay windows at a distance |
| N5 Neon signs | bg-n5-signs.png | all six spelt right, each cut by its outline like the track kit's boards, 3.26:1 |
| F1 Sky | bg-f1-sky.png | horizon at 767 px; the moon's halo at the middle, 25 degrees up, but the aurora is brighter, so its column is given by hand, as N1's |
| F1B Sky | bg-f1b-sky.png | horizon at 767 px, level with F1's; the aurora carries on across both joins |
| F2 Horizon | bg-f2-horizon.png | three strips (mountains, a coast of glaciers, icebergs in the pack ice), bottoms level, ends matching; the mountains' strip is the shortest, 171 px |
| F3 Surfaces | bg-f3-surfaces.png | cut and blended like M4: snow, ice cliff, pack ice, blue ice, the nunatak's rock, the frozen fall |
| R1 Sky | bg-r1-sky.png | horizon at 767 px; the sun's glow in the middle (column 783), 15.5 degrees up, where the disc is drawn |
| R1B Sky | bg-r1b-sky.png | horizon at 767 px, level with R1's; both edges match R1's exactly |
| R2 Horizon | bg-r2-horizon.png | three strips (worn mountains, the graveyard of giants, dunes with wreckage), bottoms level, ends matching; the mountains' strip is the shortest, 173 px |
| R3 Clouds | bg-r3-clouds.png | all six, cut by their outlines |
| R4 Surfaces | bg-r4-surfaces.png | cut and blended like M4: sand, armour, red armour, frame, blade, engraved bronze |
| Z1 Sky | bg-z1-sky.png | eye level at 767 px; the sun's glare at the middle, 25 degrees up, but the Milky Way is brighter, so its column is given by hand, as N1's; a flat band of the black along the top edge, which is the zenith |
| Z1B Sky | bg-z1b-sky.png | eye level at 766 px; made from Z1, so its edges are Z1's exactly (and much of its star field: it is a star field, it does not show) and the Milky Way meets across both joins |
| Z2 The Earth | bg-z2-earth.png | cut and blended like M4: ocean, desert, cloud, green country, the night side's cities, mountains; the game lays them across the Earth below and lights them |
| Z3 Far off | bg-z3-far.png | all six, cut by their outlines; the radio telescope's mast runs off the bottom of the sheet, so its cut end is faded out |
| Z4 Surfaces | bg-z4-surfaces.png | cut and blended like M4: plating, gold foil, solar cells, radiator, machinery, the band's windowed face |

## Meridian Skyway

```
ZENITH GP: CIRCUIT BACKGROUNDS. MERIDIAN SKYWAY (four sheets; make them one at a time, in order, each as its own image)

The setting: a racing circuit on an elevated skyway looping over open sea at golden hour, a city of towers standing in the water inside the loop, a distant coastline and mountains across the sea. The game draws the road, the mechs and the nearby buildings; these sheets are the painted world around them.

STYLE, ALL SHEETS
- Background art from a 1980s Japanese TV mecha anime, painted by hand the way the background department did it: poster colour (gouache) on illustration board, skies airbrushed in smooth gradients, everything else painted in a few flat tones per form with visible but controlled brush strokes and a little dry-brush texture.
- No ink outlines anywhere; background paintings had none.
- Distance shown by atmospheric perspective: the further away, the paler, bluer and closer to the horizon haze.
- Not a photo, not a 3D render, not a modern digital painting: no bloom, lens flare, depth-of-field blur, film grain or noise (the game adds its own grain).
- Nothing but scenery: no people, mechs, vehicles, boats, birds, text, numbers, labels, logos, signs, borders, signatures or watermarks.
- Palette: deep blue #1848AD high in the sky, bright blue #4F9DF2, peach-gold #FFC690 at the horizon, warm haze #E6C9B4, sea from deep teal #0F4F7A to #2F9BB5, cloud shadows lavender-blue #7F86B8, distant land blue-grey #8FA3C4, sunlight cream #FFF1DC.
- Every sheet is 1536x1024, landscape.

SHEETS 2 AND 3 ARE CUT OUT BY THE GAME
- Paint them on perfectly flat pure green, #00FF00: no shading, texture, gradient, glow or shadow on the green.
- Nothing in the art itself may be green or close to it.
- Crisp edges against the green, with no soft halo.

SHEET M1: SKY (full bleed, no green)
- The whole sky around the viewer, unrolled into one painting: the left edge must continue seamlessly into the right edge.
- The horizon is a perfectly straight, level line exactly three quarters of the way down (768 px from the top). Below it, only flat warm haze (#E6C9B4); paint nothing there.
- The sun is low over the horizon at the middle of the image, about 100 px above the horizon line. Paint its warm glow but not the sun disc itself (the game draws it). The sky is warmest and brightest there and turns cooler and bluer towards the left and right edges, which face away from the sun.
- An airbrushed gradient from deep blue at the top through bright blue to peach-gold at the horizon.
- Clouds: high, thin cirrus streaks combed by the wind, and a broken band of flat-bottomed altocumulus lower down, gold where they face the sun, lavender-blue in shadow; densest near the middle, sparse towards the edges. No big towering cumulus (they come on sheet M3).
- The top edge is plain deep blue, even across the full width.

SHEET M2: HORIZON (three strips on green)
- Three separate horizontal strips stacked top to bottom with green between them. Each runs the full width of the image and is about 260 px tall.
- Each strip's bottom edge is a perfectly straight, level line (it stands on the horizon), with the strip filled solid down to it. Each strip repeats: its left end must continue seamlessly into its right end.
- Top strip, farthest: a long mountain range seen far across the sea, very pale blue-grey fading into the haze, low contrast, the highest peaks reaching about two thirds of the strip's height.
- Middle strip: a nearer coastline of headlands and rolling hills, medium blue-grey, a thin warm rim of light along the ridges, a few tiny lighthouse and radio-mast silhouettes.
- Bottom strip, nearest: a distant city skyline across the water, clusters of flat-topped and stepped towers of varied heights in dusky blue-violet, gold edges catching the low sun, tiny warm dots of lit windows.

SHEET M3: CLOUDS (six cards on green)
- Six separate golden-hour cumulus clouds, one in each cell of an invisible 3x2 grid (cells 512x512), each centred in its cell and filling about 80% of it without touching the cell's edges or another cloud.
- Lit from directly above: tops warm cream-gold, middles peach, undersides lavender-blue #7F86B8, with flat bottoms. The tones separated crisply, as a cel background painter would, with only a little soft blending inside each tone.
- Six different shapes: a small round puff; a wide flat-bottomed bank; a tall towering cumulus; a cloud of two lobes; a long low roll of stratocumulus; a ragged, broken cloud with sky showing through its gaps (paint those gaps green).

SHEET M4: SURFACES (six tiling squares, full bleed)
- Six square textures in a 3x2 grid, each exactly 512x512, filling the sheet edge to edge with no borders, gaps or labels.
- Each square repeats on its own: its left edge must continue into its right edge and its top edge into its bottom edge, with no visible seam. Paint each straight-on (flat, no perspective, no horizon) and evenly lit, with no cast shadows across it and no vignette: the game adds the light. Keep the detail even, with no single feature that would stand out when it repeats.
- 1, top left: open sea seen from above, deep teal with swells in brushstrokes of lighter teal and a scatter of small pale-gold glints.
- 2, top middle: a glass office tower's facade, a regular grid of tall windows in blue-grey glass reflecting sky, between pale concrete mullions and floor bands.
- 3, top right: a hotel or apartment tower's facade, warm cream concrete, rows of smaller windows, a few lit warm yellow, small balconies.
- 4, bottom left: a dark tower's facade, deep blue-violet glass with sparse lit windows and slim gold vertical fins.
- 5, bottom middle: the concrete of the platforms the towers stand on, pale warm slabs with joints and weathering streaks.
- 6, bottom right: white painted metal panels with fine seams and rivets, for the landmark towers and the great white ring over the track.
```

Sheet M1B, made with M1 attached:

```
SHEET M1B: THE OTHER HALF OF THE MERIDIAN SKY (attach sheet M1)

Same size (1536x1024), same style and palette as the attached sheet, the horizon at exactly the same height, the same flat warm haze below it and the same plain deep blue along the top edge.

The attached sheet is the half of the sky that faces the low sun. Paint the other half, the sky behind the viewer, facing away from the sun. Its left edge must continue seamlessly from the attached sheet's right edge, and its right edge must continue seamlessly into the attached sheet's left edge, so that the two sheets side by side make the whole sky round.

No sun and no golden glow here: the sky facing away from a low sun is cooler and a clearer blue, with a soft band of pink and lavender just above the horizon. The high cirrus streaks and the broken band of flat-bottomed altocumulus carry on across it, a little sparser than on the sun side, their faces lit warm pink-gold by the sun behind the viewer, lavender-blue in shadow. No big towering cumulus. No sun disc, no text, no outlines.
```

## Corkscrew Canyon

```
ZENITH GP: CIRCUIT BACKGROUNDS. CORKSCREW CANYON (five sheets; make them one at a time, in order C1, C2, C3, C4, then C1B with C1 attached, each as its own image)

The setting: a racing circuit through a red-rock desert at dusk, the copper light of the setting sun low across mesas, buttes, hoodoos and a deep cut through the rock, under a violet sky. The game draws the road, the mechs and the nearby rock; these sheets are the painted world around them.

STYLE, ALL SHEETS
- Background art from a 1980s Japanese TV mecha anime, painted by hand the way the background department did it: poster colour (gouache) on illustration board, skies airbrushed in smooth gradients, everything else painted in a few flat tones per form with visible but controlled brush strokes and a little dry-brush texture.
- No ink outlines anywhere; background paintings had none.
- Distance shown by atmospheric perspective: the further away, the paler, more violet and closer to the horizon haze.
- Not a photo, not a 3D render, not a modern digital painting: no bloom, lens flare, depth-of-field blur, film grain or noise (the game adds its own grain).
- Nothing but scenery: no people, mechs, vehicles, animals, birds, text, numbers, labels, logos, signs, borders, signatures or watermarks.
- Palette: deep indigo #231F5C high in the sky, violet #7B4F9A, orange #FF9A55 at the horizon, dusty coral haze #D88A6A, red rock from #9A4F2C to #D99A62, distant rock mauve #7A4A5E, cloud shadows plum #8A4A6A, sunlight copper #FFC58F.
- Every sheet is 1536x1024, landscape.

SHEETS 2 AND 3 ARE CUT OUT BY THE GAME
- Paint them on perfectly flat pure green, #00FF00: no shading, texture, gradient, glow or shadow on the green.
- Nothing in the art itself may be green or close to it.
- Crisp edges against the green, with no soft halo.

SHEET C1: SKY, THE HALF FACING THE SUN (full bleed, no green)
- Half the sky around the viewer, the half facing the sun, unrolled into one painting from the horizon at the bottom to straight overhead at the top edge. Its left edge should also continue seamlessly into its right edge.
- The horizon is a perfectly straight, level line exactly three quarters of the way down (768 px from the top). Below it, only flat coral haze (#D88A6A); paint nothing there.
- The sun is just touching the horizon at the middle of the image. Paint its orange glow spreading along the horizon but not the sun disc itself (the game draws it). Away from it, towards the left and right edges, the sky deepens to violet and indigo, with a few small stars near the top at the edges.
- An airbrushed gradient from deep indigo at the top through violet to orange at the horizon.
- Clouds: long thin bands and streaks of high cloud lit from below by the sunset, copper, coral and pink underneath, violet-grey on top, glowing most near the middle and dimming towards the edges. No big towering clouds (they come on sheet C3).
- The top edge is plain deep indigo, even across the full width.

SHEET C2: HORIZON (three strips on green)
- Three separate horizontal strips stacked top to bottom with green between them. Each runs the full width of the image and is about 260 px tall.
- Each strip's bottom edge is a perfectly straight, level line (it stands on the horizon), with the strip filled solid down to it. Each strip repeats: its left end must continue seamlessly into its right end.
- Top strip, farthest: distant mesas and flat-topped tablelands, pale mauve-violet fading into the haze, low contrast, long flat tops.
- Middle strip: nearer buttes, rock spires and a long escarpment, dusky red-violet, a thin copper rim of light along their tops.
- Bottom strip, nearest: desert foothills with clusters of hoodoos and rock fins, deep red-brown with violet shadows, copper light on the tips.

SHEET C3: CLOUDS (six cards on green)
- Six separate high desert clouds at dusk, one in each cell of an invisible 3x2 grid (cells 512x512), each centred in its cell and filling about 80% of it without touching the cell's edges or another cloud.
- Lit from below by the setting sun: undersides glowing copper-orange and coral, tops violet-grey shading to plum #8A4A6A. The tones separated crisply, as a cel background painter would, with only a little soft blending inside each tone.
- Six different shapes: a long smooth lens-shaped cloud; a wind-sheared streak with a ragged tail; a small flat cloudlet; a stack of two thin lens clouds one above the other; a wide flat-bottomed cloud; a broken line of small cloudlets (paint the sky between them green).

SHEET C4: SURFACES (six tiling squares, full bleed)
- Six square textures in a 3x2 grid, each exactly 512x512, filling the sheet edge to edge with no borders, gaps or labels.
- Each square repeats on its own: its left edge must continue into its right edge and its top edge into its bottom edge, with no visible seam. Paint each straight-on (flat, no perspective, no horizon) and evenly lit, with no cast shadows across it and no vignette: the game adds the light. Keep the detail even, with no single feature that would stand out when it repeats.
- 1, top left: a red sandstone cliff face in horizontal strata, bands of rust, salmon and cream of different thicknesses, with cracks and a few ledges.
- 2, top middle: the caprock on top of a mesa, dark crusted brown-red rock, broken into plates by cracks.
- 3, top right: the desert floor, orange-red sand with wind ripples, pebbles and a few small tufts of dry, sun-bleached grey-brown scrub.
- 4, bottom left: deep shadowed gorge rock, dark red-violet with vertical cracks and fallen scree, for the walls of a narrow gorge.
- 5, bottom middle: the softer stone of hoodoos and spires, pink-orange bands with rounded erosion pockets.
- 6, bottom right: a cracked dry lakebed, pale salmon clay broken into polygons.

SHEET C1B: SKY, THE HALF FACING AWAY (make it after C1, with C1 attached)
- Same size, style and palette as C1, the horizon at exactly the same height, the same flat haze below it and the same plain deep indigo along the top edge.
- The other half of the sky, behind the viewer, facing away from the setting sun. Its left edge must continue seamlessly from C1's right edge, and its right edge seamlessly into C1's left edge, so the two side by side make the whole sky round.
- No sun glow here: a deep violet-blue dusk sky, darkening to indigo higher up with more small stars, and a soft band of dusky pink just above the horizon. The bands of high cloud carry on across it, sparser, their undersides catching only a faint coral light, mostly violet-grey.
```

## Helios Drop

```
ZENITH GP: CIRCUIT BACKGROUNDS. HELIOS DROP (four sheets; make them one at a time, in order, each as its own image)

The setting: a racing circuit at high noon, high above a sea of cloud, in thin bright air under a deep blue sky; towers of cumulus rise out of the cloud sea, floating islands of rock with meadows and white buildings drift in the open sky, and snowy peaks stand above the clouds in the distance. The game draws the road, the mechs and the nearby islands; these sheets are the painted world around them.

STYLE, ALL SHEETS
- Background art from a 1980s Japanese TV mecha anime, painted by hand the way the background department did it: poster colour (gouache) on illustration board, skies airbrushed in smooth gradients, everything else painted in a few flat tones per form with visible but controlled brush strokes and a little dry-brush texture.
- No ink outlines anywhere; background paintings had none.
- Distance shown by atmospheric perspective: the further away, the paler and closer to the pale blue horizon.
- Not a photo, not a 3D render, not a modern digital painting: no bloom, lens flare, depth-of-field blur, film grain or noise (the game adds its own grain).
- Nothing but scenery: no people, mechs, vehicles, aircraft, birds, text, numbers, labels, logos, signs, borders, signatures or watermarks.
- Palette: deep ultramarine #0A2F8F high in the sky, bright blue #3D8FF0, pale blue #C4DCFA at the horizon, haze #BCD3F2, cloud white #E4EDF9 with blue-grey shadows #7F9AD0 to #8D9FD0, distant peaks pale blue #B4C6E6, island rock warm grey-brown #8C7A6B and #6A5B52, sunlight white #FFF8EC.
- Every sheet is 1536x1024, landscape.

SHEETS 2 AND 3 ARE CUT OUT BY THE GAME
- Paint them on perfectly flat pure green, #00FF00: no shading, texture, gradient, glow or shadow on the green.
- Nothing in the art itself may be green or close to it.
- Crisp edges against the green, with no soft halo.

SHEET H1: SKY (full bleed, no green)
- Half the sky around the viewer, unrolled into one painting from the horizon at the bottom to straight overhead at the top edge; the game uses it twice to go all the way round, so its left edge must continue seamlessly into its right edge.
- The horizon is a perfectly straight, level line exactly three quarters of the way down (768 px from the top). Below it, only flat pale haze (#BCD3F2); paint nothing there.
- The sun is high overhead, out of the picture: the light is even all the way round, with no warm glow and no brighter side.
- An airbrushed gradient from deep ultramarine at the top, almost the dark blue of the upper air, through bright blue to pale blue at the horizon.
- Clouds: a few high, thin, white cirrus wisps scattered evenly across the width, and a faint pale band of haze just above the horizon. No big cumulus (they come on sheet H3).
- The top edge is plain deep ultramarine, even across the full width.

SHEET H2: HORIZON (three strips on green)
- Three separate horizontal strips stacked top to bottom with green between them. Each runs the full width of the image and is about 260 px tall.
- Each strip's bottom edge is a perfectly straight, level line (it stands on the horizon), with the strip filled solid down to it. Each strip repeats: its left end must continue seamlessly into its right end.
- Top strip, farthest: a far range of snowy peaks just showing above the cloud sea, very pale blue with white snow, low contrast.
- Middle strip: a nearer range of sharp peaks, blue-grey rock with crisp white snowfields and ridges, their feet lost in a level layer of white cloud along the bottom of the strip.
- Bottom strip, nearest: a wall of towering cumulus rising out of the cloud sea along the horizon, brilliant white tops, blue-grey shadowed sides and bases.

SHEET H3: CLOUDS (six cards on green)
- Six separate noon cumulus clouds, one in each cell of an invisible 3x2 grid (cells 512x512), each centred in its cell and filling about 80% of it without touching the cell's edges or another cloud.
- Lit from directly above: tops brilliant white, sides pale blue-white, undersides and the shadows between the billows blue-grey #8D9FD0. The tones separated crisply, as a cel background painter would, with only a little soft blending inside each tone.
- Six different shapes: a tall cloud tower rising from a broad base; a wide flat-topped bank; a cluster of small round puffs; a cloud spreading into an anvil at the top; a cloud of two lobes; a ragged, breaking cloud with sky showing through its gaps (paint those gaps green).

SHEET H4: SURFACES (six tiling squares, full bleed)
- Six square textures in a 3x2 grid, each exactly 512x512, filling the sheet edge to edge with no borders, gaps or labels.
- Each square repeats on its own: its left edge must continue into its right edge and its top edge into its bottom edge, with no visible seam. Paint each straight-on (flat, no perspective, no horizon) and evenly lit, with no cast shadows across it and no vignette: the game adds the light. Keep the detail even, with no single feature that would stand out when it repeats.
- 1, top left: the sea of cloud seen from above, rounded white billows with blue-grey hollows between them and pale highlights on top.
- 2, top middle: the rock underside of a floating island, warm grey-brown in layered bands, with cracks and a few dangling roots.
- 3, top right: the meadow on top of a floating island, short bright alpine grass with small white and yellow flowers.
- 4, bottom left: whitewashed stone walls, with small arched windows and doorways in cool blue shadow.
- 5, bottom middle: a snowfield with exposed blue-grey rock, for the peaks.
- 6, bottom right: polished gold metal panels engraved with fine lines radiating like sun rays, highlights painted as flat bands, for the great golden ring and the white-and-gold spire.
```

## Neon Crucible

Night over an open-pit mine, so its set is not quite the others'. Sheet 3
is smoke and steam, not clouds: the circuit has no cumulus, and the game
stood the plumes on the smokestacks round the rim and over the pit's
molten floor (it now draws those in puffs from fx sheet 8 instead, which
look the same from any side). Its surfaces are the pit's wall (twice: high up, and scorched
low down by the melt), the molten floor, the yard round the rim, the
city's facades at night (the game takes the lit windows from the painting
for their glow) and the rusted steel of the stacks, the crane, the ladle
and the gantry. A fifth sheet paints the neon signs on the towers' roofs,
which the game draws as plain lettering today. The moon is drawn by the
game over the painted sky, as the other circuits' suns are, 25 degrees up.
Its board along the track and the sign over the way into the pit are on
track sheet T4 (`art/track-sheets`).

| Sheet | File |
|---|---|
| N1 Sky, facing the moon | bg-n1-sky.png |
| N1B Sky, facing away | bg-n1b-sky.png |
| N2 Horizon | bg-n2-horizon.png |
| N3 Smoke and steam | bg-n3-smoke.png |
| N4 Surfaces | bg-n4-surfaces.png |
| N5 Neon signs | bg-n5-signs.png |

```
ZENITH GP: CIRCUIT BACKGROUNDS. NEON CRUCIBLE (six sheets; make them one at a time, in order N1, N2, N3, N4, N5, then N1B with N1 attached, each as its own image)

The setting: a racing circuit at night in and over an enormous open-pit mine, the road spiralling down its terraced rock wall to a floor of molten metal and climbing back up, a city of lit towers and smoking foundries all round its rim, under a cold moon and a violet sky with the city's neon glowing along the horizon. The game draws the road, the mechs, the pit and the nearby buildings; these sheets are the painted world around them.

STYLE, ALL SHEETS
- Background art from a 1980s Japanese TV mecha anime, painted by hand the way the background department did it: poster colour (gouache) on illustration board, skies airbrushed in smooth gradients, everything else painted in a few flat tones per form with visible but controlled brush strokes and a little dry-brush texture. Night painted the way those backgrounds painted it: deep blues and violets rather than black, lights as flat dabs of bright colour.
- No ink outlines anywhere; background paintings had none.
- Distance shown by atmospheric perspective: the further away, the more it sinks into the violet haze and the city's magenta glow.
- Not a photo, not a 3D render, not a modern digital painting: no bloom, lens flare, depth-of-field blur, film grain or noise (the game adds its own grain and glow).
- Nothing but scenery: no people, mechs, vehicles, aircraft, birds, text, numbers, labels, logos, borders, signatures or watermarks. The signs on sheet N5 are the only lettering, and only the words it gives.
- Palette: near-black navy #04061A high in the sky, deep violet #1B1250, magenta haze #7A2A74 at the horizon, night haze #3A1C4C, distant mountains #1C1432, moonlight cold blue-white #C8D2FF, the city's glow magenta #FF3FBF and amber #FFA040, neon magenta #FF2FA8, cyan #26E6FF, amber #FFA020 and violet #A05CFF, molten metal from deep red #B8542A through orange #FF7A3C to yellow-white #FFD27A, rock violet-grey #6A5E86 and #4C4466 with rust #8A5040, yard concrete #2A2634.
- Every sheet is 1536x1024, landscape.

SHEETS 2, 3 AND 5 ARE CUT OUT BY THE GAME
- Paint them on perfectly flat pure green, #00FF00: no shading, texture, gradient, glow or shadow on the green.
- Nothing in the art itself may be green or close to it: no green lights and no green neon.
- Crisp edges against the green, with no soft halo: a light's glow is painted inside the shape it comes from, never out onto the green.

SHEET N1: SKY, THE HALF FACING THE MOON (full bleed, no green)
- Half the sky around the viewer, the half facing the moon, unrolled into one painting from the horizon at the bottom to straight overhead at the top edge. Its left edge should also continue seamlessly into its right edge.
- The horizon is a perfectly straight, level line exactly three quarters of the way down (768 px from the top). Below it, only flat night haze (#3A1C4C); paint nothing there.
- The moon is at the middle of the image, about 25 degrees up: its centre about 210 px above the horizon line. Paint its cold halo, a soft round glow of pale blue-white fading into the sky, but not the moon's disc itself (the game draws it).
- An airbrushed gradient from near-black navy at the top through deep violet to a band of magenta haze along the horizon: the glow of a neon city below it, even all the way across, with a touch of amber just above the horizon line.
- Stars: small, single dots and a few tiny four-point twinkles, thick near the top and thinning out into the glow near the horizon, few near the moon.
- Clouds: a few long, thin bands of cloud low over the horizon, lit from below by the city, their undersides magenta and amber, their tops dark violet; higher up near the moon, a few thin wisps with their edges silvered by moonlight. No big billowing clouds.
- The top edge is plain near-black navy, even across the full width.

SHEET N2: HORIZON (three strips on green)
- Three separate horizontal strips stacked top to bottom with green between them. Each runs the full width of the image and is about 260 px tall.
- Each strip's bottom edge is a perfectly straight, level line (it stands on the horizon), with the strip filled solid down to it. Each strip repeats: its left end must continue seamlessly into its right end.
- Top strip, farthest: a long range of mountains in dark blue-violet silhouette (#1C1432), low contrast, only the highest ridgelines catching a thin edge of cold moonlight, the highest peaks reaching about two thirds of the strip's height.
- Middle strip: the far side of the city: a long, dense skyline of towers and spires of varied heights in deep violet-blue, speckled with tiny lit windows (mostly warm amber, some cool white), a few tower crowns banded with neon in magenta, cyan or violet, and tiny red beacons on the tallest masts.
- Bottom strip, nearest: the foundry district: smelter stacks, a blast furnace, cooling towers, gantry cranes, conveyors and pipe racks in near-black blue-violet silhouette, the furnace mouths and stack tops glowing orange, and squat clouds of steam over the cooling towers lit orange from below, painted as solid shapes with crisp edges.

SHEET N3: SMOKE AND STEAM (six cards on green)
- Six separate plumes, one in each cell of an invisible 3x2 grid (cells 512x512), each centred in its cell and filling about 80% of it without touching the cell's edges or another plume. Each rises from a narrow, flat base at the bottom of its shape (the game stands it on a smokestack or over the pit).
- Lit from below by fire and molten metal and from one side by the moon: bases and undersides glowing orange #FF7A3C and amber, bodies dusky violet-grey, the moonlit edges cold blue-white #C8D2FF, tops fading to dark violet. Painted the way a cel background painter painted smoke: defined, billowing shapes in three or four flat tones, separated crisply, with only a little soft blending inside each tone; no wispy, see-through or blurred edges.
- Six different shapes: a tall column of smoke leaning with the wind; a thin ribbon of smoke bending over at the top; a squat, rounded billow of white steam; a wide, low pall of smoke drifting sideways; a burst of steam boiling up from a narrow base; a column breaking up into separate puffs at the top, with sky showing through the gaps (paint those gaps green).

SHEET N4: SURFACES (six tiling squares, full bleed)
- Six square textures in a 3x2 grid, each exactly 512x512, filling the sheet edge to edge with no borders, gaps or labels.
- Each square repeats on its own: its left edge must continue into its right edge and its top edge into its bottom edge, with no visible seam. Paint each straight-on (flat, no perspective, no horizon) and evenly lit, with no cast shadows across it, no glow and no vignette: the game adds the light, the moonlight and the molten glow. Keep the detail even, with no single feature that would stand out when it repeats.
- 1, top left: the pit wall: a sheer face of dark violet-grey rock cut by blasting, in horizontal strata of different thicknesses with a few rust-red bands of iron ore, and the vertical half-pipe grooves of drill holes running down it from top to bottom.
- 2, top middle: the pit wall low down, near the molten floor: the same rock scorched by the heat, black and glassy in places, with orange-brown oxidised streaks and spatters of cooled slag.
- 3, top right: the molten floor seen from straight above: a black-red crust broken into irregular plates, with bright seams of molten metal between them, deep red at the edges of the seams to orange and yellow-white in their middles, and a few small open pools.
- 4, bottom left: the yard round the pit's rim seen from straight above: dark grey-violet concrete slabs with straight joints, oil stains, grit and tyre scuffs. No painted lines, arrows, numbers or markings.
- 5, bottom middle: a city tower's facade at night: a regular grid of windows in dark blue-violet glass between dark concrete floor bands and mullions, about one window in six lit warm amber, a few lit cool white and fewer still magenta; every lit window a flat bright rectangle, every unlit one dark.
- 6, bottom right: rusted, sooty steel for the smokestacks, the crane, the ladle and the gantry over the pit: dark brown-black plates with riveted seams, rust streaks running down, scorch marks and a few chipped edges of old orange paint.

SHEET N5: NEON SIGNS (six signs on green)
- Six signs, one in each cell of an invisible 3x2 grid (cells 512x512), each exactly 480 px wide and 150 px tall, centred in its cell, not touching the cell's edges or another sign. They stand on the roofs of the towers round the pit.
- Every sign is seen straight-on, flat, a perfect rectangle with square corners: a dark backing board #14101E with its lettering and a small emblem in lit neon tube, painted the way a background artist painted lit neon at night: each tube a bright flat colour with a white-hot line down its middle, its glow one or two flat bands of the same colour hugging the tube on the dark board, never spilling past the board's edges. No frame, posts, stand, reflections or perspective.
- Lettering: spell every word exactly as given, in capitals, and nothing else: no slogans, small print, other numbers or web addresses.
- 1, top left: KESTREL, in cyan #26E6FF, with a small kestrel in flight.
- 2, top middle: AOKI HEAVY, in amber #FFA020, with a small gear.
- 3, top right: NOVA, in magenta #FF2FA8, with a four-point star in place of the O.
- 4, bottom left: HALCYON, in violet #A05CFF, with a swooping bird.
- 5, bottom middle: FOUNDRY 7, in orange-red #FF5A3A, with a small crucible tipping out a stream.
- 6, bottom right: ZGP, in white, with a cyan #26E6FF speed stripe beneath it.

SHEET N1B: SKY, THE HALF FACING AWAY (make it after N1, with N1 attached)
- Same size, style and palette as N1, the horizon at exactly the same height, the same flat night haze below it and the same plain near-black navy along the top edge.
- The other half of the sky, behind the viewer, facing away from the moon. Its left edge must continue seamlessly from N1's right edge, and its right edge seamlessly into N1's left edge, so the two side by side make the whole sky round.
- No moon halo here: a deeper, darker sky with more stars, and the city's magenta and amber glow along the horizon just as strong as on N1 (the city surrounds the circuit). The low bands of cloud carry on across it, lit from below by the city, magenta and amber underneath, dark violet on top.
```

## Frostline

An ice shelf at the blue hour, the sun just down, under the aurora. It has
no clouds sheet: the circuit has no cumulus, and plumes on flat cards show
their turning (see Neon Crucible). So its sheets are the sky (twice), the
horizon and the surfaces: the snow on the shelf and the glacier, the ice
cliffs round them, the sea among the pack ice, the blue ice of the seracs,
the bridge's pillars, the caves' vault and the icebergs, the nunatak's rock,
and the frozen waterfall the road winds down round. The aurora is painted
into the sky (the plain look draws its own, moving); the moon is drawn by
the game over the painted sky, 25 degrees up. Its board along the track and
the sign over the Ice Barrel's mouth are on track sheet T5
(`art/track-sheets`).

| Sheet | File |
|---|---|
| F1 Sky, facing the moon | bg-f1-sky.png |
| F1B Sky, facing away | bg-f1b-sky.png |
| F2 Horizon | bg-f2-horizon.png |
| F3 Surfaces | bg-f3-surfaces.png |

```
ZENITH GP: CIRCUIT BACKGROUNDS. FROSTLINE (four sheets; make them one at a time, in order F1, F2, F3, then F1B with F1 attached, each as its own image)

The setting: a racing circuit on a great ice shelf at the edge of a polar sea, at the blue hour just after sunset: the road runs along the shelf's edge, climbs inside a tube of clear ice up through a glacier, leaps off the glacier's face and winds down round a frozen waterfall, among towers of blue ice, with pack ice and icebergs out on the dark sea and the aurora hanging over everything. The game draws the road, the mechs, the ice and the nearby scenery; these sheets are the painted world around them.

STYLE, ALL SHEETS
- Background art from a 1980s Japanese TV mecha anime, painted by hand the way the background department did it: poster colour (gouache) on illustration board, skies airbrushed in smooth gradients, everything else painted in a few flat tones per form with visible but controlled brush strokes and a little dry-brush texture. Snow and ice painted the way those backgrounds painted them: clean whites and pale blues in the light, clear cobalt and violet-blue in the shadows, never grey.
- No ink outlines anywhere; background paintings had none.
- Distance shown by atmospheric perspective: the further away, the more it sinks into the pale blue-violet haze.
- Not a photo, not a 3D render, not a modern digital painting: no bloom, lens flare, depth-of-field blur, film grain or noise (the game adds its own grain and glow).
- Nothing but scenery: no people, mechs, vehicles, ships, aircraft, birds, animals, buildings, text, numbers, labels, logos, borders, signatures or watermarks.
- Palette: deep indigo #070F33 high in the sky, blue #22417E, the afterglow's soft pink #D99AB6 along the horizon, haze #6F7FB4, distant mountains #3A4A78, moonlight #C8D2FF, aurora green #5CFFB0 at its foot through cyan to magenta #E060FF and violet at its head, snow white #EEF4FF with shade #A8BDE6, glacier ice #9CC6EF to deep blue #3D6FB8, dark sea #0A1630 and #29507E, pack ice #C6D6F2, rock dark blue-grey #2C2F45.
- Every sheet is 1536x1024, landscape.

SHEET 2 IS CUT OUT BY THE GAME
- Paint it on perfectly flat pure green, #00FF00: no shading, texture, gradient, glow or shadow on the green.
- Nothing in the art itself may be green or close to it: no aurora on this sheet, and no green in the ice or the sea.
- Crisp edges against the green, with no soft halo.

SHEET F1: SKY, THE HALF FACING THE MOON (full bleed, no green screen)
- Half the sky around the viewer, the half facing the moon, unrolled into one painting from the horizon at the bottom to straight overhead at the top edge. Its left edge should also continue seamlessly into its right edge.
- The horizon is a perfectly straight, level line exactly three quarters of the way down (768 px from the top). Below it, only flat haze (#6F7FB4); paint nothing there.
- The moon is at the middle of the image, about 25 degrees up: its centre about 210 px above the horizon line. Paint its cold halo, a soft round glow of pale blue-white fading into the sky, but not the moon's disc itself (the game draws it).
- An airbrushed gradient from deep indigo at the top through blue to the blue hour's afterglow along the horizon: a broad band of soft pink with a thin line of pale lilac right at the horizon, even all the way across.
- The aurora: two or three great curtains hanging across the sky in long, slow folds, from about 15 degrees up to about 55 degrees up, crossing the whole width of the image. Each is bright green at its lower edge, which is crisp and wavy, rising into cyan and then magenta and violet at its top, where it fades into the sky; fine vertical rays streak through it. Painted as a cel background painter painted an aurora: glowing flat bands of colour with a crisp lower edge, softened only upward. Keep it clear of the moon's halo.
- Stars: small single dots and a few tiny four-point twinkles, thick near the top, thinning out into the pink near the horizon, fewer behind the aurora.
- Clouds: none, but for a few long, thin streaks low over the horizon catching the pink afterglow.
- The top edge is plain deep indigo, even across the full width.

SHEET F2: HORIZON (three strips on green)
- Three separate horizontal strips stacked top to bottom with green between them. Each runs the full width of the image and is about 260 px tall.
- Each strip's bottom edge is a perfectly straight, level line (it stands on the horizon), with the strip filled solid down to it. Each strip repeats: its left end must continue seamlessly into its right end.
- Top strip, farthest: a long range of high mountains under snow, in pale blue-violet (#3A4A78) sinking into the haze, low contrast, their snowfields catching a little pink afterglow on the sides facing the moon, the highest peaks reaching about two thirds of the strip's height.
- Middle strip: a coast of glaciers: wide tongues of ice flowing down between dark rock ridges to end in sheer ice cliffs at the sea, the ice white and pale blue with cobalt shadows in its crevasses, the rock dark blue-grey dusted with snow.
- Bottom strip, nearest: the edge of the pack ice: tabular icebergs of many sizes, flat-topped with sheer sides, white on their lit faces and clear blue in shadow, a few with arches or caves worn through them, standing on a band of dark sea along the bottom edge scattered with small floes.

SHEET F3: SURFACES (six tiling squares, full bleed)
- Six square textures in a 3x2 grid, each exactly 512x512, filling the sheet edge to edge with no borders, gaps or labels.
- Each square repeats on its own: its left edge must continue into its right edge and its top edge into its bottom edge, with no visible seam. Paint each straight-on (flat, no perspective, no horizon) and evenly lit, with no cast shadows across it, no glow and no vignette: the game adds the light. Keep the detail even, with no single feature that would stand out when it repeats.
- 1, top left: the snow on the shelf and the glacier, seen from straight above: smooth, wind-packed snow in white and pale blue, with low wind ripples (sastrugi) in two soft tones running one way. No footprints, tracks or marks.
- 2, top middle: the face of an ice cliff, the shelf's edge and the glacier's sides, seen straight-on: horizontal layers of white and pale blue ice of different thicknesses with a few thin dark bands of grit, cut by vertical fractures and a few deep blue crevices running down.
- 3, top right: the sea among the pack ice, seen from straight above: dark navy water with plates of floating ice of many sizes and irregular shapes, white with pale blue edges, open leads of water between them.
- 4, bottom left: blue glacier ice, as on the broken face of a serac or an iceberg: clear cobalt and turquoise-blue (not green) ice in crisp faceted planes, paler where the fractures catch the light, a few trapped bubbles.
- 5, bottom middle: the nunatak's rock: dark blue-grey basalt in blocky fractured planes, with frost in its cracks and small drifts of snow on its ledges.
- 6, bottom right: a frozen waterfall seen straight-on: long ropes of icicles and frozen flow running top to bottom, white to pale cyan, with blue hollows between them.

SHEET F1B: SKY, THE HALF FACING AWAY (make it after F1, with F1 attached)
- Same size, style and palette as F1, the horizon at exactly the same height, the same flat haze below it and the same plain deep indigo along the top edge.
- The other half of the sky, behind the viewer, facing away from the moon. Its left edge must continue seamlessly from F1's right edge, and its right edge seamlessly into F1's left edge, so the two side by side make the whole sky round.
- No moon halo here: a deeper sky with more stars, the pink afterglow along the horizon a little stronger (the sun has just set on this side), and the aurora's curtains carrying on across it from F1's edges, joining them, in the same colours.
```

## Titan's Rest

Morning in a white desert where a colossus fell in a war long over: a giant
mech kilometres long lying on its back, half buried in the dunes, one arm
flung out, its chest torn open to the ribs, the broken halo behind its head
standing up out of the sand, and its sword stuck upright beside it. The road
climbs its arm, splits through and over its chest, loops inside its ribs,
rolls through the halo, and corkscrews down the sword's blade. Its colours
keep it apart from Canyon's dusk: a low white-gold sun in a pale aqua sky,
bone-white sand with cool blue shadows, the titan's ivory armour with faded
red markings, its frame bronze and verdigris. The game draws the titan and
everything near the road; these sheets are the painted world round it. Its
board along the track and the sign over the road onto the titan's hand are
on track sheet T6 (`art/track-sheets`).

| Sheet | File |
|---|---|
| R1 Sky, facing the sun | bg-r1-sky.png |
| R1B Sky, facing away | bg-r1b-sky.png |
| R2 Horizon | bg-r2-horizon.png |
| R3 Clouds | bg-r3-clouds.png |
| R4 Surfaces | bg-r4-surfaces.png |

```
ZENITH GP: CIRCUIT BACKGROUNDS. TITAN'S REST (five sheets; make them one at a time, in order R1, R2, R3, R4, then R1B with R1 attached, each as its own image)

The setting: a racing circuit in a desert of white sand on a clear, hazy morning, built on and around the wreck of a colossal fallen mech, kilometres long, lying on its back half buried in the dunes: one arm flung out across the sand, its chest torn open to its ribs, a broken halo ring standing up out of the sand behind its head, and its great sword stuck upright in the ground beside it. Out across the desert lie the half-buried wrecks of other fallen giants from the same ancient war. The game draws the road, the mechs, the titan and the nearby scenery; these sheets are the painted world around them.

STYLE, ALL SHEETS
- Background art from a 1980s Japanese TV mecha anime, painted by hand the way the background department did it: poster colour (gouache) on illustration board, skies airbrushed in smooth gradients, everything else painted in a few flat tones per form with visible but controlled brush strokes and a little dry-brush texture. The morning painted clean and bright: warm light, cool blue-lilac shadows.
- No ink outlines anywhere; background paintings had none.
- Distance shown by atmospheric perspective: the further away, the paler and more it sinks into the warm, dusty haze.
- Not a photo, not a 3D render, not a modern digital painting: no bloom, lens flare, depth-of-field blur, film grain or noise (the game adds its own grain and glow).
- Nothing but scenery: no people, living mechs, vehicles, aircraft, birds, animals, buildings, text, numbers, labels, logos, borders, signatures or watermarks.
- Palette: clear aqua-blue #2F7FA8 high in the sky, pale aqua #9FD0DC, cream-gold haze #F2DCA8 along the horizon, the sun's white-gold #FFF4D6, dusty haze #D9C7A2, distant hills pale blue-lilac #A9AFCB, sand bone-white #EFE6D0 to pale ochre #D8BA8C with cool shadows #9AA2C8, the giants' armour weathered ivory #E6E0D2 and slate #6E7486 with faded red markings #B84A3A, their inner frames bronze #8A6A3A with verdigris #5FA08A, dark gunmetal #3A3F4A for blades.
- Every sheet is 1536x1024, landscape.

SHEETS 2 AND 3 ARE CUT OUT BY THE GAME
- Paint them on perfectly flat pure green, #00FF00: no shading, texture, gradient, glow or shadow on the green.
- Nothing in the art itself may be green or close to it: the verdigris stays a blue-teal (#5FA08A at its greenest), and there is no grass, cactus or other plant.
- Crisp edges against the green, with no soft halo.

SHEET R1: SKY, THE HALF FACING THE SUN (full bleed, no green screen)
- Half the sky around the viewer, the half facing the sun, unrolled into one painting from the horizon at the bottom to straight overhead at the top edge. Its left edge should also continue seamlessly into its right edge.
- The horizon is a perfectly straight, level line exactly three quarters of the way down (768 px from the top). Below it, only flat dusty haze (#D9C7A2); paint nothing there.
- The sun is at the middle of the image, low in the morning sky, about 12 degrees up: its centre about 100 px above the horizon line. Paint its glow, a wide soft haze of white-gold fading into the sky, brightest close round it, but not the sun's disc itself (the game draws it).
- An airbrushed gradient from clear aqua-blue at the top, through pale aqua, to a broad band of cream-gold haze along the horizon, warmest near the sun.
- Clouds: a few small, flat-bottomed fair-weather clouds low over the horizon, their sides toward the sun lit gold-white, their shadowed sides a cool blue-lilac; a few thin high streaks of cirrus catching the light. Most of the sky clear.
- The top edge is plain clear aqua-blue, even across the full width.

SHEET R2: HORIZON (three strips on green)
- Three separate horizontal strips stacked top to bottom with green between them. Each runs the full width of the image and is about 260 px tall.
- Each strip's bottom edge is a perfectly straight, level line (it stands on the horizon), with the strip filled solid down to it. Each strip repeats: its left end must continue seamlessly into its right end.
- Top strip, farthest: a long range of low, worn mountains in pale blue-lilac (#A9AFCB) sinking into the haze, low contrast, the sun-side slopes a touch warmer.
- Middle strip: a graveyard of giants far off across the dunes: the half-buried wrecks of other colossal mechs, a hand reaching up out of the sand, a broken helmet, a curved spine, a fallen shoulder, swords and spears stuck in the ground at angles, in pale, hazy ivory, slate and faded red, softened by distance, among long, low dunes.
- Bottom strip, nearest: dunes of bone-white and pale ochre sand with cool blue-lilac shadows in their hollows, a few dark slate outcrops of rock, and scattered smaller wreckage half buried: armour plates, a broken gun barrel, a fallen pylon.

SHEET R3: CLOUDS (six cards on green)
- Six separate clouds, one in each cell of an invisible 3x2 grid (cells 512x512), each centred in its cell and filling about 80% of it without touching the cell's edges or another cloud.
- Morning fair-weather clouds lit low from one side by the sun: flat, level bottoms, billowing tops, the sides toward the sun gold-white #FFF4D6, the shadowed sides cool blue-lilac #9AA2C8, the bottoms a warm grey-lilac. Painted the way a cel background painter painted cumulus: defined, billowing shapes in three or four flat tones, separated crisply; no wispy, see-through or blurred edges.
- Six different shapes: a tall towering cloud; a long, low, flat bank; a small round puff; a wide cloud with two rising heads; a line of small cloudlets kept together as one shape; a ragged cloud trailing a little at one end.

SHEET R4: SURFACES (six tiling squares, full bleed)
- Six square textures in a 3x2 grid, each exactly 512x512, filling the sheet edge to edge with no borders, gaps or labels.
- Each square repeats on its own: its left edge must continue into its right edge and its top edge into its bottom edge, with no visible seam. Paint each straight-on (flat, no perspective, no horizon) and evenly lit, with no cast shadows across it, no glow and no vignette: the game adds the light. Keep the detail even, with no single feature that would stand out when it repeats.
- 1, top left: the desert sand seen from straight above: bone-white to pale ochre, low wind ripples in two soft tones running one way, a scatter of darker grains. No footprints, tracks or plants.
- 2, top middle: the titan's outer armour: big weathered ivory plates with recessed panel seams and rows of rivets, scoured by sand, chipped to slate-grey metal along the edges, a few faint streaks of grime.
- 3, top right: the same armour where its markings were: the plates painted a faded, sun-bleached red, scratched and chipped through to ivory primer and slate metal in places.
- 4, bottom left: the titan's inner frame: heavy bronze-brown structural metal, girders and bolted plates, streaked with blue-teal verdigris, with bundles of conduit running across it.
- 5, bottom middle: the sword's blade: dark gunmetal steel, pitted and scratched along its length, a few long scars, faint sand drifted into the pits. The scratches run one way (top to bottom).
- 6, bottom right: engraved bronze for the halo ring and the sword's hilt: warm bronze-gold panels engraved with fine, angular circuit-like channels, worn smooth and bright on the high spots and darker in the grooves.

SHEET R1B: SKY, THE HALF FACING AWAY (make it after R1, with R1 attached)
- Same size, style and palette as R1, the horizon at exactly the same height, the same flat dusty haze below it and the same plain clear aqua-blue along the top edge.
- The other half of the sky, behind the viewer, facing away from the sun. Its left edge must continue seamlessly from R1's right edge, and its right edge seamlessly into R1's left edge, so the two side by side make the whole sky round.
- No sun glow here: a deeper, clearer aqua sky, the haze along the horizon cooler and paler (more cream than gold), and a few small fair-weather clouds low down, lit on the sides facing back toward the sun (toward the sheet's edges), shadowed blue-lilac on the sides facing the viewer.
```

## Zenith Ring

The finale, in orbit, on a great ring station high over the Earth: the road
runs up the inside of the Ring (a wheel standing on edge, its band the road's
floor), rolls through a hatch at its top onto the outside and comes down it
upside down with the Earth overhead; it loops round the station's core,
rolling over its top; it races down the Mass Driver, a run of glowing coils,
and leaps across open space through a docking ring onto a module beyond;
and it crosses fields of solar arrays with nothing past their edge. There is
no ground and no horizon: above, black space, stars, the Milky Way and a
hard white sun; below, the Earth, filling the sky under its limb. So its
sheets differ from the others': two halves of the starry sky, the Earth's
surface seen from orbit (the game lays it on the planet and lights it,
day and night side), things far off in orbit on cards in place of clouds,
and the station's surfaces. Its board along the track and the sign over the
road into the Ring are on track sheet T7 (`art/track-sheets`).

| Sheet | File |
|---|---|
| Z1 Sky, facing the sun | bg-z1-sky.png |
| Z1B Sky, facing away | bg-z1b-sky.png |
| Z2 The Earth | bg-z2-earth.png |
| Z3 Far off | bg-z3-far.png |
| Z4 Surfaces | bg-z4-surfaces.png |

```
ZENITH GP: CIRCUIT BACKGROUNDS. ZENITH RING (five sheets; make them one at a time, in order Z1, Z2, Z3, Z4, then Z1B with Z1 attached, each as its own image)

The setting: the last circuit of the season, a racing circuit in orbit high above the Earth, built round a great ring station: a wheel kilometres across standing on edge, its band a road on the inside and the outside, a long spine running from its hub to a reactor core, a mass driver of glowing coils, docking modules, and fields of solar arrays. The sun is hard and white in a black sky full of stars; the Earth fills everything below, oceans, cloud and land in daylight, the far side in night with its cities lit. The game draws the road, the mechs, the station and the Earth's shape and light; these sheets are the painted space, planet and surfaces around them.

STYLE, ALL SHEETS
- Background art from a 1980s Japanese TV mecha anime, the space episodes, painted by hand the way the background department did it: poster colour (gouache) on illustration board, space and the planet airbrushed in smooth gradients, everything else painted in a few flat tones per form with visible but controlled brush strokes and a little dry-brush texture. Space painted the way those backgrounds painted it: deep, clean blacks and navies, stars as crisp dots, lit metal hard-edged with dark shadows lit faintly blue by the Earth.
- No ink outlines anywhere; background paintings had none.
- Not a photo, not a 3D render, not a modern digital painting: no bloom, lens flare, depth-of-field blur, film grain or noise (the game adds its own grain and glow).
- Nothing but scenery: no people, mechs, text, numbers, labels, logos, flags, borders, signatures or watermarks.
- Palette: space black #05070F and deep navy #0A1030, the Milky Way pale violet-blue #8A90C0 and dusty rose #B08A9A, stars white with a few pale blue and pale gold, the sun white #FFFFFF with a pale warm glow #FFF6E0; the Earth's ocean deep blue #0B2A5C to #1A4E8A, cloud white #EEF2F8 with blue-grey shadows #9AA8C8, land ochre #A8804A, tan #C8A870 and olive #5A6A32, the night side navy-black #0A1430 with city lights amber #FFB15A; the station's white plating #DFE4EC, shadow lavender-blue #8E9AC0, gold foil #D9A441, solar cells navy #1B2C5C, warning orange #FF7A2A.
- Every sheet is 1536x1024, landscape.

SHEET 3 IS CUT OUT BY THE GAME
- Paint it on perfectly flat pure green, #00FF00: no shading, texture, gradient, glow or shadow on the green.
- Nothing in the art itself may be green or close to it.
- Crisp edges against the green, with no soft halo.

SHEET Z1: SKY, THE HALF FACING THE SUN (full bleed, no green screen)
- Half the sky around the viewer, the half facing the sun, unrolled into one painting from the level of the viewer's eyes at the bottom to straight overhead at the top edge. Its left edge should also continue seamlessly into its right edge.
- A perfectly straight, level line exactly three quarters of the way down (768 px from the top) is the viewer's eye level. Below it, only flat space black (#05070F); paint nothing there (the game draws the Earth below, its curved edge further down).
- The sun is at the middle of the image, about 25 degrees up: its centre about 210 px above the eye-level line. Paint its glare: a small, intense white glow fading quickly into the black, and four long, thin, straight rays crossing at it, the way a cel background painted a bright star; but not the sun's disc itself (the game draws it).
- Space: black at the top, deepening to a faintly blue navy toward the eye-level line, as if lit from below by the planet.
- The Milky Way: a broad band crossing the sky at a slant from one edge to the other, painted as soft drifts of pale violet-blue and dusty rose with dark lanes of dust through it and thick fields of tiny stars along it.
- Stars: many small single dots of different brightness all over the black, a few larger ones with small four-point twinkles, some faintly pale blue or pale gold. Fewer close round the sun's glare.
- No planets, moons, comets, nebulae in other colours, ships or stations: those are drawn by the game.

SHEET Z2: THE EARTH, FROM ORBIT (six tiling squares, full bleed)
- Six square textures in a 3x2 grid, each exactly 512x512, filling the sheet edge to edge with no borders, gaps or labels. Each is the Earth's surface seen from orbit, straight down, a square a few hundred kilometres across.
- Each square repeats on its own: its left edge must continue into its right edge and its top edge into its bottom edge, with no visible seam. Paint each straight-on (flat, no perspective, no horizon, no curve of the planet) and evenly lit, with no cast shadows across it and no vignette: the game adds the day and night and the haze toward the planet's edge. Keep the detail even, with no single feature that would stand out when it repeats.
- 1, top left: open ocean in daylight: deep blue with slow lighter swirls of current, and small fair-weather clouds in loose rows (cloud streets) scattered across a third of it.
- 2, top middle: dry country in daylight: ochre and tan desert and scrub with long, low ridges, dry river beds branching across it and a few small clouds. No coastline, no sea.
- 3, top right: the top of a weather system: dense white cloud in billowing cells with blue-grey shadows between them, a few gaps showing the deep blue sea beneath.
- 4, bottom left: green country in daylight: olive and dark green forest and patches of farmland in muted tan and green, a winding river, scattered small clouds. No coastline, no sea, no towns.
- 5, bottom middle: the night side over land: near-black navy, clusters of warm amber city lights of many sizes joined by thin threads of lit roads, a few faint wisps of cloud catching a little moonlight.
- 6, bottom right: mountains in daylight: a high range of snow-capped peaks and glaciers, valleys in grey-brown and olive with blue-violet shadows, a few clouds caught on the peaks.

SHEET Z3: FAR OFF (six cards on green)
- Six separate things floating in orbit, far off, one in each cell of an invisible 3x2 grid (cells 512x512), each centred in its cell and filling about 80% of it without touching the cell's edges or another one.
- Each lit hard from the left by the sun, its shadowed side dark and lit faintly blue from below by the Earth, in the station's colours: white plating, gold foil, navy solar cells, grey metal, a touch of warning orange.
- 1: a communications satellite: a box body wrapped in gold foil, two long wings of solar panels, a white dish antenna on an arm.
- 2: a distant space station of another design: a long lattice truss with cylindrical modules, white radiator panels and four solar wings.
- 3: a cargo freighter: a long boxy hull, cargo containers clamped along its spine, engine bells at the back, small dark windows at the front.
- 4: a spent rocket stage: a long white cylinder with an open engine end, drifting at a slant.
- 5: a radio telescope: a great dish on a lattice frame, its back to the viewer at an angle.
- 6: a cluster of orbital wreckage kept together as one shape: broken panels, bent struts and a torn solar wing.

SHEET Z4: SURFACES (six tiling squares, full bleed)
- Six square textures in a 3x2 grid, each exactly 512x512, filling the sheet edge to edge with no borders, gaps or labels.
- Each square repeats on its own: its left edge must continue into its right edge and its top edge into its bottom edge, with no visible seam. Paint each straight-on (flat, no perspective) and evenly lit, with no cast shadows across it, no glow and no vignette: the game adds the light. Keep the detail even, with no single feature that would stand out when it repeats.
- 1, top left: the station's white hull plating: square panels with recessed seams, rows of small rivets, faint streaks of grime, a few small stencilled marks without readable words.
- 2, top middle: gold foil insulation: crinkled, folded gold foil in big pillowed panels with taped seams, the folds catching the light in two or three tones.
- 3, top right: solar cells: a regular grid of navy-blue cells in thin silver lines, the cells' sheen varying a little from one to the next.
- 4, bottom left: radiator panels: white panels with fine parallel ribs running top to bottom, a seam every so often.
- 5, bottom middle: dark machinery: gunmetal panels with pipes, conduits and bundled cables running across them, small hatches and valves.
- 6, bottom right: the inner face of the Ring's band: white plating with rows of small square windows, the windows dark (the game lights them), a thin orange stripe every few rows.

SHEET Z1B: SKY, THE HALF FACING AWAY (make it after Z1, with Z1 attached)
- Same size, style and palette as Z1, the eye-level line at exactly the same height, the same flat space black below it and the same black along the top edge.
- The other half of the sky, behind the viewer, facing away from the sun. Its left edge must continue seamlessly from Z1's right edge, and its right edge seamlessly into Z1's left edge, so the two side by side make the whole sky round.
- No sun here: deeper black with more stars, and the Milky Way carrying on across it from Z1's edges, joining them, in the same colours.
```
