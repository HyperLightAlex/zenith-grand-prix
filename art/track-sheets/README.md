# Track sheets

The painted track kit for the anime look: everything bolted to the circuit
that the game draws as plain colour today. It is one kit, shared by all the
circuits (the light and fog of each circuit tint it). It is made by an image
model from the prompt below and checked one sheet at a time, like the
background sheets in `art/bg-sheets`.

| Sheet | What | How the game uses it |
|---|---|---|
| T1 Surfaces | Six tiling squares, 512 px, in a 3x2 grid, evenly lit | Under the road's markings, on the barriers, the slab and pylons, the gantries and the grandstand seating |
| T2 Sponsor boards | Six trackside boards on green, one per cell of a 3x2 grid | In place of the plain lettered boards along the track |
| T3 Circuit boards and banner | Three boards of the circuits' names on green, and the start banner | The circuit's own board along its track, and the banner over the line |
| T4 Neon Crucible | Its board on green, in T3's design, and the neon sign over the way into the pit | Its board along its track (it keeps the plain one until then), and the sign hung from the gantry |
| T5 Frostline | Its board on green, in T3's design, and the sign over the Ice Barrel's mouth | Its board along its track, and the sign over the road where it climbs into the glacier |
| T6 Titan's Rest | Its board on green, in T3's design, and the sign over the road onto the titan's hand | Its board along its track, and the sign where the road climbs onto the titan |
| T7 Zenith Ring | Its board on green, in T3's design, and the sign over the road into the Ring | Its board along its track, and the sign where the road goes into the Ring |
| T8 Abyss Line | Its board on green, in T3's design, and the sign over the road into the town | Its board along its track, and the sign where the road comes in under the town's dome |
| T9 Monsoon Ruins | Its board on green, in T3's design, and the sign over the road at the foot of the Stairway | Its board along its track, and the sign on the gateway where the road starts up the pyramid |

What stays as the game draws it: the lane lines, edge lines, kerbs, chevrons,
the start line and grid boxes, the charge strips, speed pads, cell gates,
jump stripes, the barriers' light strips and energy field, the start lights
and every other glowing thing. They are gameplay signals, and they need to
stay crisp and bright, so the paintings go underneath them, never over them.

## Status

| Sheet | File | Notes |
|---|---|---|
| T1 Surfaces | track-t1-surfaces.png | in the game. The grid sits a pixel or two off the 512 lines (the joins are at 511 and 1022 across, 510 down), so each square is cut inside its own edges. Road, steel, gantry steel and concrete repeat once cut to their best length. The armour has a panel seam at both side edges and two panels stacked; it repeats along the barrier only, the face taking its full height. The crowd's rows repeat every 85 px or so, so it is cut on whole rows. The road's scuffs would show a grid repeated panel after panel, so each 24-unit panel of road takes the texture from its own place in it |
| T2 Sponsor boards | track-t2-boards.png | in the game. All six spelt right; each cut cleanly by its outline, a clean rectangle about 2.9:1, a little taller than the plain look's 3.2:1 boards, so the painted boards stand in frames of their own shape |
| T3 Circuit boards and banner | track-t3-circuits.png | in the game. All spelt right, each emblem as asked; cut cleanly. The boards came out 2.25:1 and the banner 9.9:1 (not 3.2:1 and 14.7:1), so they too stand in frames of their own shape: the banner over the line a little deeper than the plain one |
| T4 Neon Crucible | track-t4-crucible.png | in the game. Made with T3 attached; both spelt right, the emblem as asked, cut cleanly. The board came out 3.26:1 (the others 2.25:1) and the sign 3.23:1 |
| T5 Frostline | track-t5-frostline.png | in the game. Made with T3 attached; both spelt right, the emblem as asked (the aurora's arcs in cyan and violet), cut cleanly. The board came out 3.12:1 and the sign 4.14:1 |
| T7 Zenith Ring | track-t7-zenith.png | in the game. Made with T3 attached; both spelt right, the emblem as asked (the ring station over the Earth's edge), cut cleanly. The board came out 2.39:1 and the sign 5.04:1. In the kit they are `zenithRing` and `zenithRingSign` (`zenith` is the Zenith Grand Prix's board on T2) |
| T8 Abyss Line | track-t8-abyss.png | to be made |
| T9 Monsoon Ruins | track-t9-monsoon.png | to be made |
| T6 Titan's Rest | track-t6-titan.png | in the game. Made with T3 attached; both spelt right, the emblem as asked (the titan's helmet half buried, its sword beside it), cut cleanly. The board came out 2.60:1 and the sign 4.64:1; the sign is drawn on a panel of its own shape in the plain sign's frame (Frostline's too, 4.14:1) |

## The prompt

```
ZENITH GP: TRACK KIT (three sheets; make them one at a time, in order T1, T2, T3, each as its own image)

The setting: a mech racing circuit, a wide road deck on a raised concrete slab with crash barriers along both edges, steel gantries over the road, pylons holding it up, sponsor boards and grandstands beside it. The same kit is used at three circuits: over the sea at golden hour, in a red desert at dusk, and above the clouds at noon. The game adds each circuit's light and draws all the lines, kerbs and glowing markings itself; these sheets are the painted surfaces and signs under them.

STYLE, ALL SHEETS
- Art from a 1980s Japanese TV mecha anime: the surfaces painted by hand the way the background department did it, in poster colour (gouache) on illustration board, a few flat tones per form with visible but controlled brush strokes and a little dry-brush texture for wear; the signs painted as clean, flat graphic design, the way background artists painted signage and logos into a scene.
- No ink outlines on the surfaces.
- Not a photo, not a 3D render, not a modern digital painting: no bloom, lens flare, blur, film grain or noise (the game adds its own grain).
- Palette: road deck pale blue-grey #8E95A6, barrier armour off-white #C9D1DC, dark steel #39414F, concrete #A9ADB5, warning orange #FF7A1A. Nothing may be green.
- Every sheet is 1536x1024, landscape.

SHEET T1: SURFACES (six tiling squares, full bleed)
- Six square textures in a 3x2 grid, each exactly 512x512, filling the sheet edge to edge with no borders, gaps or labels.
- Each square repeats on its own: its left edge must continue into its right edge and its top edge into its bottom edge, with no visible seam. Paint each straight-on (flat, no perspective) and evenly lit, with no cast shadows across it and no vignette: the game adds the light. Keep the detail even, with no single feature that would stand out when it repeats.
- 1, top left: the road deck seen from straight above, a square about 24 m across: pale blue-grey composite paving with a fine even grain, faint darker tyre-scuff streaks running from top to bottom (the direction of travel) and a few hairline cracks. No lines, arrows, numbers or markings of any kind (the game paints them).
- 2, top middle: the inner face of a crash barrier, a square about 3 m across: off-white armour plating, one panel to the square with its vertical seams at the left and right edges, a row of round bolt heads near the top edge and another near the bottom edge, one shallow horizontal groove through the middle, a little grime and a few dark scrapes from impacts running sideways.
- 3, top right: dark steel for the barrier tops and the backs of the barriers: dark blue-grey ribbed metal with the ribs running left to right, small rivets, chipped paint showing lighter metal at a few edges.
- 4, bottom left: structural concrete, for the underside of the road slab and the pylons that hold it up: weathered pale grey concrete with the faint horizontal lines and tie holes of its formwork, rain streaks running down, a few patches of repair.
- 5, bottom middle: painted steel for the gantries over the road, a square about 3 m across: dark navy plates with welded seams, rows of rivets, scuffed paint at a few edges and a few small stencilled marks without readable words.
- 6, bottom right: the crowd in a grandstand, seen from the track: rows of raked seating, each row a horizontal band, packed with tiny spectators painted as an anime background crowd, simplified figures in a few dabs of colour (heads, shirts in team colours of orange, blue, red, white and yellow), some waving small plain flags or holding up blank banners. About eight rows to the square; no faces in detail.

SHEETS T2 AND T3 ARE CUT OUT BY THE GAME
- Paint them on perfectly flat pure green, #00FF00: no shading, texture, gradient, glow or shadow on the green.
- Nothing in the art itself may be green or close to it.
- Crisp edges against the green, with no soft halo.
- Every board is seen straight-on, flat, a perfect rectangle with square corners, evenly lit, with no frame, posts, stand, reflections or perspective (the game builds the board's frame and posts).
- Lettering: spell every word exactly as given, in capitals, and nothing else: no slogans, small print, numbers or web addresses.

SHEET T2: SPONSOR BOARDS (six boards on green)
- Six boards, one in each cell of an invisible 3x2 grid (cells 512x512), each exactly 480 px wide and 150 px tall, centred in its cell, not touching the cell's edges or another board.
- 1980s motorsport sponsor style: bold italic sans-serif logotypes, speed stripes, simple emblems, two or three flat colours each, like the signs painted into the backgrounds of a 1980s racing anime.
- 1, top left: KESTREL ENERGY. Deep navy board #0D2A57, white lettering, an electric-cyan #35F0FF lightning-stripe and a small kestrel in flight beside the name.
- 2, top middle: NOVA TIRE. Off-white board #F4F6FB, black lettering, a red #FF3D5A four-point star in place of the O in NOVA, a red stripe beneath.
- 3, top right: AOKI HEAVY INDUSTRIES. Near-black board #1B1B22, amber #FFB21A lettering with AOKI large and HEAVY INDUSTRIES smaller under it, a small amber gear emblem.
- 4, bottom left: HALCYON AIR. Orange board #FF7A1A, black lettering, a black swooping bird silhouette.
- 5, bottom middle: ZGP LIVE. Red board #E0263C, white lettering, a small black broadcast-wave emblem.
- 6, bottom right: ZENITH GRAND PRIX. Dark board #10141F, off-white #F4F6FB lettering, a warning-orange #FF7A1A stripe and a small rising-sun emblem over a horizon line.

SHEET T3: CIRCUIT BOARDS AND THE START BANNER (on green)
- Top half: three boards, one in each 512x512 cell of the top row, each exactly 480 px wide and 150 px tall, centred in its cell. All three in one design: deep teal board #103B3F, pale cyan #E9FBFF lettering, an electric-cyan #35F0FF stripe, and a small flat emblem of the circuit at the left.
  - top left: MERIDIAN SKYWAY, the emblem a great white hoop over waves.
  - top middle: CORKSCREW CANYON, the emblem a twisting road over a flat-topped mesa.
  - top right: HELIOS DROP, the emblem a golden ring over a sea of cloud.
- Bottom half: the banner over the start line, one long board exactly 1440 px wide and 98 px tall, centred left to right and with its middle 768 px from the top: dark #10141F, ZENITH GRAND PRIX in large off-white #F4F6FB bold italic capitals at the middle, chequered flag blocks of black and white at both ends, a warning-orange #FF7A1A stripe along its top and bottom edges.
```

T4, made later than the others for the fourth circuit, with sheet T3
attached:

```
ZENITH GP: TRACK KIT. SHEET T4: NEON CRUCIBLE (attach sheet T3; one sheet, on green)

The same kit and style as the attached sheet, for a fourth circuit: Neon Crucible, raced at night in and over an open-pit mine lit with neon, molten metal on its floor.

- Art from a 1980s Japanese TV mecha anime: signs painted as clean, flat graphic design, the way background artists painted signage and lit neon into a scene.
- Not a photo, not a 3D render, not a modern digital painting: no bloom, lens flare, blur, film grain or noise (the game adds its own grain and glow).
- 1536x1024, landscape. Paint it on perfectly flat pure green, #00FF00: no shading, texture, gradient, glow or shadow on the green. Nothing in the art itself may be green or close to it. Crisp edges against the green, with no soft halo.
- Every board is seen straight-on, flat, a perfect rectangle with square corners, evenly lit, with no frame, posts, stand, reflections or perspective (the game builds the frames).
- Lettering: spell every word exactly as given, in capitals, and nothing else.

- Top half: one board in the middle 512x512 cell of the top row, exactly 480 px wide and 150 px tall, centred in its cell, in exactly the design of the three circuit boards on the attached sheet: deep teal board #103B3F, pale cyan #E9FBFF lettering, an electric-cyan #35F0FF stripe, and a small flat emblem of the circuit at the left. NEON CRUCIBLE, the emblem a road spiralling down into a glowing orange pit. Nothing in the other two cells of the top row.
- Bottom half: the sign hung over the road where the start straight goes out over the pit, one board exactly 960 px wide and 300 px tall, centred left to right with its middle 768 px from the top: a dark backing board #14101E with NEON CRUCIBLE across it in one line of bold capitals in lit magenta #FF2FA8 neon tube, and a cyan #26E6FF neon tube running round the board just inside its edge. Painted the way a background artist painted lit neon at night: each tube a bright flat colour with a white-hot line down its middle, its glow one or two flat bands of the same colour hugging the tube on the dark board, never spilling past the board's edges.
```

T5, made later than the others for the fifth circuit, with sheet T3
attached so the board matches the other circuits' boards:

```
ZENITH GP: TRACK KIT. SHEET T5: FROSTLINE (attach sheet T3; one sheet, on green)

The same kit and style as the attached sheet, for a fifth circuit: Frostline, raced on an ice shelf at the blue hour under the aurora, up through a glacier inside a tube of clear ice.

- Art from a 1980s Japanese TV mecha anime: signs painted as clean, flat graphic design, the way background artists painted signage into a scene.
- Not a photo, not a 3D render, not a modern digital painting: no bloom, lens flare, blur, film grain or noise (the game adds its own grain and glow).
- 1536x1024, landscape. Paint it on perfectly flat pure green, #00FF00: no shading, texture, gradient, glow or shadow on the green. Nothing in the art itself may be green or close to it. Crisp edges against the green, with no soft halo.
- Every board is seen straight-on, flat, a perfect rectangle with square corners, evenly lit, with no frame, posts, stand, reflections or perspective (the game builds the frames).
- Lettering: spell every word exactly as given, in capitals, and nothing else.

- Top half: one board in the middle 512x512 cell of the top row, exactly 480 px wide and 150 px tall, centred in its cell, in exactly the design of the three circuit boards on the attached sheet: deep teal board #103B3F, pale cyan #E9FBFF lettering, an electric-cyan #35F0FF stripe, and a small flat emblem of the circuit at the left. FROSTLINE, the emblem a glacier's peak under an arc of aurora in cyan and violet (no green). Nothing in the other two cells of the top row.
- Bottom half: the sign over the road at the mouth of the Ice Barrel, where it climbs into the glacier, one board exactly 960 px wide and 300 px tall, centred left to right with its middle 768 px from the top: a deep indigo board #0C1430 with FROSTLINE across it in one line of bold white capitals, a band beneath the lettering shading from cyan #35F0FF through blue to violet #A05CFF like the aurora's light, and a thin pale ice-blue #C8E4FF line running round the board just inside its edge.
```

T6, made later than the others for the sixth circuit, with sheet T3
attached so the board matches the other circuits' boards:

```
ZENITH GP: TRACK KIT. SHEET T6: TITAN'S REST (attach sheet T3; one sheet, on green)

The same kit and style as the attached sheet, for a sixth circuit: Titan's Rest, raced on a clear morning in a white desert on and around the wreck of a colossal fallen mech, half buried in the dunes.

- Art from a 1980s Japanese TV mecha anime: signs painted as clean, flat graphic design, the way background artists painted signage into a scene.
- Not a photo, not a 3D render, not a modern digital painting: no bloom, lens flare, blur, film grain or noise (the game adds its own grain and glow).
- 1536x1024, landscape. Paint it on perfectly flat pure green, #00FF00: no shading, texture, gradient, glow or shadow on the green. Nothing in the art itself may be green or close to it. Crisp edges against the green, with no soft halo.
- Every board is seen straight-on, flat, a perfect rectangle with square corners, evenly lit, with no frame, posts, stand, reflections or perspective (the game builds the frames).
- Lettering: spell every word exactly as given, in capitals, and nothing else.

- Top half: one board in the middle 512x512 cell of the top row, exactly 480 px wide and 150 px tall, centred in its cell, in exactly the design of the three circuit boards on the attached sheet: deep teal board #103B3F, pale cyan #E9FBFF lettering, an electric-cyan #35F0FF stripe, and a small flat emblem of the circuit at the left. TITAN'S REST, the emblem a giant mech's helmet half buried in a dune with a sword standing beside it. Nothing in the other two cells of the top row.
- Bottom half: the sign over the road where it climbs onto the fallen titan's hand, one board exactly 960 px wide and 300 px tall, centred left to right with its middle 768 px from the top: a sun-faded red board #B84A3A with TITAN'S REST across it in one line of bold ivory #F3EEDF capitals, a slate #3A3F4A stripe beneath the lettering, and a thin ivory line running round the board just inside its edge, its paint a little worn and chipped at the corners like the titan's own armour.
```

T7, made later than the others for the ninth circuit, with sheet T3
attached so the board matches the other circuits' boards:

```
ZENITH GP: TRACK KIT. SHEET T7: ZENITH RING (attach sheet T3; one sheet, on green)

The same kit and style as the attached sheet, for the ninth circuit, the season's finale: Zenith Ring, raced in orbit high over the Earth round a great ring station, in through its band and down its outside upside down.

- Art from a 1980s Japanese TV mecha anime: signs painted as clean, flat graphic design, the way background artists painted signage into a scene.
- Not a photo, not a 3D render, not a modern digital painting: no bloom, lens flare, blur, film grain or noise (the game adds its own grain and glow).
- 1536x1024, landscape. Paint it on perfectly flat pure green, #00FF00: no shading, texture, gradient, glow or shadow on the green. Nothing in the art itself may be green or close to it. Crisp edges against the green, with no soft halo.
- Every board is seen straight-on, flat, a perfect rectangle with square corners, evenly lit, with no frame, posts, stand, reflections or perspective (the game builds the frames).
- Lettering: spell every word exactly as given, in capitals, and nothing else.

- Top half: one board in the middle 512x512 cell of the top row, exactly 480 px wide and 150 px tall, centred in its cell, in exactly the design of the three circuit boards on the attached sheet: deep teal board #103B3F, pale cyan #E9FBFF lettering, an electric-cyan #35F0FF stripe, and a small flat emblem of the circuit at the left. ZENITH RING, the emblem a ring station standing on edge over the curved blue edge of the Earth. Nothing in the other two cells of the top row.
- Bottom half: the sign over the road where it goes into the Ring, one board exactly 960 px wide and 300 px tall, centred left to right with its middle 768 px from the top: a deep navy board #0A1030 with ZENITH RING across it in one line of bold white capitals, a band beneath the lettering shading from the Earth's blue #4A90FF to pale cyan #9AD8FF like the glow along the planet's edge, a small white ring-station emblem at each end of the band, and a thin white line running round the board just inside its edge.
```

T8, made later than the others for the seventh circuit, with sheet T3
attached so the board matches the other circuits' boards:

```
ZENITH GP: TRACK KIT. SHEET T8: ABYSS LINE (attach sheet T3; one sheet, on green)

The same kit and style as the attached sheet, for the seventh circuit: Abyss Line, raced through glass tubes on the sea floor beside an undersea town, a hundred metres down, and up under the roof of the town's great glass dome.

- Art from a 1980s Japanese TV mecha anime: signs painted as clean, flat graphic design, the way background artists painted signage into a scene.
- Not a photo, not a 3D render, not a modern digital painting: no bloom, lens flare, blur, film grain or noise (the game adds its own grain and glow).
- 1536x1024, landscape. Paint it on perfectly flat pure green, #00FF00: no shading, texture, gradient, glow or shadow on the green. Nothing in the art itself may be green or close to it. Crisp edges against the green, with no soft halo.
- Every board is seen straight-on, flat, a perfect rectangle with square corners, evenly lit, with no frame, posts, stand, reflections or perspective (the game builds the frames).
- Lettering: spell every word exactly as given, in capitals, and nothing else.

- Top half: one board in the middle 512x512 cell of the top row, exactly 480 px wide and 150 px tall, centred in its cell, in exactly the design of the three circuit boards on the attached sheet: deep teal board #103B3F, pale cyan #E9FBFF lettering, an electric-cyan #35F0FF stripe, and a small flat emblem of the circuit at the left. ABYSS LINE, the emblem two glass tubes twisting round each other over a glass dome. Nothing in the other two cells of the top row.
- Bottom half: the sign over the road where it comes in under the town's dome, one board exactly 960 px wide and 300 px tall, centred left to right with its middle 768 px from the top: a deep sea-blue board #062A3A with ABYSS LINE across it in one line of bold pale cyan-white #E8FBFF capitals, a band beneath the lettering shading from aqua-blue #2AC0E8 to deep blue #3A7CFF, a small white bubble emblem (three rising circles) at each end of the band, and a thin pale cyan #9FF0FF line running round the board just inside its edge.
```

T9, made later than the others for the eighth circuit, with sheet T3
attached so the board matches the other circuits' boards:

```
ZENITH GP: TRACK KIT. SHEET T9: MONSOON RUINS (attach sheet T3; one sheet, on green)

The same kit and style as the attached sheet, for the eighth circuit: Monsoon Ruins, raced through a jungle temple city in a monsoon downpour, up the switchbacks of a great stepped pyramid and off its summit through a ring of carved stone.

- Art from a 1980s Japanese TV mecha anime: signs painted as clean, flat graphic design, the way background artists painted signage into a scene.
- Not a photo, not a 3D render, not a modern digital painting: no bloom, lens flare, blur, film grain or noise (the game adds its own grain and glow).
- 1536x1024, landscape. Paint it on perfectly flat pure green, #00FF00: no shading, texture, gradient, glow or shadow on the green. Nothing in the art itself may be green or close to it. Crisp edges against the green, with no soft halo.
- Every board is seen straight-on, flat, a perfect rectangle with square corners, evenly lit, with no frame, posts, stand, reflections or perspective (the game builds the frames).
- Lettering: spell every word exactly as given, in capitals, and nothing else.

- Top half: one board in the middle 512x512 cell of the top row, exactly 480 px wide and 150 px tall, centred in its cell, in exactly the design of the three circuit boards on the attached sheet: deep teal board #103B3F, pale cyan #E9FBFF lettering, an electric-cyan #35F0FF stripe, and a small flat emblem of the circuit at the left. MONSOON RUINS, the emblem a stepped pyramid with a stone ring before it and slanting lines of rain. Nothing in the other two cells of the top row.
- Bottom half: the sign on the gateway over the road at the foot of the pyramid's stairway, one board exactly 960 px wide and 300 px tall, centred left to right with its middle 768 px from the top: a dark slate board #2A2F38 with MONSOON RUINS across it in one line of bold bone-white #EEE8D8 capitals, a band beneath the lettering shading from temple gold #D8A83A to terracotta #C8643A, a small bone-white stepped-pyramid emblem at each end of the band, and a thin gold #D8A83A line running round the board just inside its edge.
```
