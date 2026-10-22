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
