# Background sheets

Painted backgrounds for the anime look, one set per circuit, made by an image
model from the prompts below and checked one sheet at a time, like the effect
sheets in `art/fx-sheets`. Each circuit has four sheets:

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

| Sheet | File | Notes |
|---|---|---|
| M1 Sky | bg-m1-sky.png | horizon at 745 px; the edges wrap well; the sun-side half of the sky |
| M1B Sky | | to do: the half facing away (prompt below) |
| M2 Horizon | bg-m2-horizon.png | three strips, bottoms dead level, ends match to within a few pixels |
| M3 Clouds | bg-m3-clouds.png | six clouds; the second is a little wider than its cell, so the clouds are cut by their outlines, not by the grid |
| M4 Surfaces | bg-m4-surfaces.png | the squares do not quite repeat at their edges; each is cut to the length that wraps (whole window bays on the facades) and its seams blended |

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
