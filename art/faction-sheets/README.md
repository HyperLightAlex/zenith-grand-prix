# Faction sheets

The painted art for the newer factions, Mirage, Aurora and Tempest
(`docs/FACTIONS.md`), made to match the HUD sheets' pilots and emblems and
the hangar's painted lettering. Made by an image model from the prompt below
and checked one sheet at a time, like the other sheets in `art/`.

| Sheet | What | How the game uses it |
|---|---|---|
| F1 Pilots | Six head-and-shoulders portraits, full bleed, 3x2: Mirage's three, then Aurora's | The comms cut-ins, the target panel and the results, as for Solstice's and Vanta's pilots |
| F2 Emblems and lettering | The two emblems and the two teams' names as painted on their hangar walls, on green, 2x2 | The score panel, the standings, the results, the garage, the mechs' markings and the hangar's back wall; the name on the hangar walls |

All of it is in the game. F2's two emblems were redone (F2b): Mirage's so
its symbols sit on the slanted shield's middle, Aurora's so it is nothing
like Vanta's. The build takes each redo, on its own sheet,
in place of F2's when the file is there; the prompt below asks for both on
one sheet, but either can come on its own.

What to attach:

| Sheet | Attach |
|---|---|
| F1 | `hud-sheets/hud-u2-pilots.png` (the hand, the framing and the backgrounds to match) |
| F2 | `hud-sheets/hud-u3-emblems.png` (the emblems' style) and `hangar-sheets/hangar-h2-signs.png` (the hangar lettering to match exactly) |
| F2b | `hud-sheets/hud-u3-emblems.png` and `faction-f2-emblems.png` (the shield and colours) |

## Status

| Sheet | File | Notes |
|---|---|---|
| F1 Pilots | faction-f1-pilots.png | in the game (cut by `tools/bg/build_hud.py`). Aurora's genders changed from the prompt: the forward (renamed Orion from Iris) and Bastion are men, Vesper a woman |
| F2 Emblems and lettering | faction-f2-emblems.png | in the game (emblems cut by `tools/bg/build_hud.py`, names by `tools/bg/build_hangar.py`). Its emblems are to be redone (F2b): Mirage's sits off-centre in its slanted shield, and Aurora's star in a ring is too close to Vanta's |
| F2b Mirage emblem, redone | faction-f2b-mirage-emblem.png | in the game, in place of F2's |
| F2b Aurora emblem, redone | faction-f2b-aurora-emblem.png | in the game, in place of F2's |
| T1 Tempest | faction-t1-tempest.png | to make. Tempest's art is green, so this sheet is keyed on magenta |

## The prompt

```
ZENITH GP: TWO NEW TEAMS, MIRAGE AND AURORA (two sheets; make them one at a time, F1 then F2, each as its own image)

The game: a mech racing game in the style of a 1980s Japanese TV mecha anime, teams of giant robots racing and fighting on circuits in the sky. Two teams are already drawn (the attached sheets); these are the next two, drawn by the same hand.
- Team Mirage, the desert dynasty: ancient Egypt by way of the space age. Sand, rust orange and dark brown, with gold trim and amber light; pharaoh-headdress stripes, broad jewelled collars, sun discs and scarabs.
- Team Aurora, the knights: elegant and chivalric. Deep violet, pearl white and silver, with lavender light; helms, halo crests, heraldic shields, wings.

STYLE, BOTH SHEETS
- Art from a 1980s Japanese TV mecha anime: the pilots like the cels of the series' cast, the emblems and lettering like the logos and title lettering of the period. Match the attached sheets exactly.
- Not a photo, not a 3D render, not a modern digital painting: no bloom, lens flare, blur, film grain or noise (the game adds its own grain).
- Original designs only: nothing that resembles an existing anime, character, logo or brand.
- Every sheet is 1536x1024, landscape.

SHEET F1: PILOTS (six portraits, full bleed)
- Six square portraits in a 3x2 grid, each exactly 512x512, filling the sheet edge to edge with no borders, gaps or labels.
- 1980s TV anime character cels: clean dark ink outlines of even weight, flat colour with one hard-edged shadow tone, a hard highlight band on the hair, large expressive eyes with two catch-lights, drawn by the same hand as the attached pilots sheet.
- All six framed exactly like the attached pilots: head and shoulders, the head turned three-quarters toward the right edge, the eyes about 40% down from the top, the shoulders running off the bottom edge. Adults, each with a distinct face, build, hair and skin tone.
- Pilot suits in the team's colours with a headset and boom mic. Background: a flat airbrushed gradient in the team's colour, darker toward the bottom, with a few thin pale horizontal scan lines across it, like a comms screen. No scenery, text or logos.
- Top row, Team Mirage (sand suits with rust-orange panels and gold trim; background rust orange #C75F2A fading to deep brown #2A160C):
  1. Sirocco, the forward: a young man about 22, deep brown skin, short black twists, bold dark eyeliner in the ancient Egyptian way, a gold cuff on one ear, a confident grin.
  2. Ibis, the midfielder: a woman in her late 20s, light olive-brown skin, a sleek black bob with a blunt fringe, amber eyes lined in gold, a calm composed look, a gold collar piece at her throat.
  3. Dune, the defender: a big broad man in his 40s, tan skin, a shaved head, a full black beard, heavy brows, a steady stoic look, a heavy armoured collar with a gold scarab clasp.
- Bottom row, Team Aurora (deep violet suits with pearl-white panels and silver trim; background violet #5A3EA6 fading to deep indigo #140C2E):
  4. Iris, the forward: a young woman about 19, pale skin, long wavy lilac-silver hair with one braid, bright violet eyes, a fierce determined look, a thin silver circlet.
  5. Vesper, the midfielder: a man in his early 30s, medium-brown skin, long dark hair tied back, a neat goatee, half-lidded amber eyes, a wry smile, a high pearl collar.
  6. Bastion, the defender: a tall broad woman in her mid-30s, East Asian, short dark hair, a scar across one cheek, a serene stern look, a heavy pearl-white armoured gorget.

SHEET F2: EMBLEMS AND HANGAR LETTERING (four pieces on green, cut out by the game)
- Paint them on perfectly flat pure green, #00FF00: no shading, texture, gradient, glow or shadow on the green.
- Nothing in the art itself may be green or close to it.
- Crisp edges against the green, with no soft halo.
- Four pieces, one in each cell of an invisible 2x2 grid (cells 768x512), each centred in its cell and not touching the cell's edges or another piece.
- Top left: Team Mirage emblem, about 400 px tall: a winged sun disc in gold #E9B43C over the slanted gateway of an ancient temple, inside a slanted shield shape like the attached emblems, in sand #DCC59A, rust orange #C75F2A and gold. No letters.
- Top right: Team Aurora emblem, about 400 px tall: a pearl-white four-point star inside a silver halo ring, a pair of small swept wings behind it, inside a slanted shield shape like the attached emblems, in deep violet #5A3EA6, pearl #ECE8F4 and silver #C8CCDA. No letters.
- Bottom left: MIRAGE, the team's name as painted high on its hangar wall, about 640 px wide: exactly the same lettering as SOLSTICE and VANTA on the attached signs sheet, huge, heavy, forward-slanting italic capitals in white with a thick navy #0D1630 outline and a navy drop shadow down and to the right. Nothing else.
- Bottom right: AURORA, in exactly the same lettering, colours and outline, about 640 px wide. Nothing else.
- Spell both names exactly as given.
```

## The prompt for F2b (both emblems, redone)

```
ZENITH GP: TEAM MIRAGE AND TEAM AURORA EMBLEMS (redo; two pieces on green, one image)

Two team emblems for a mech racing game in the style of a 1980s Japanese TV mecha anime, drawn by the same hand as the attached emblems. Match them exactly: the same slanted shield outline as the attached Mirage and Aurora emblems (a thick white border inside a thin navy #0D1630 outline), flat colour, hard edges, a clean logo of the period. Not a photo or 3D render; no gradients, glow, texture, blur or grain. Original designs: nothing that resembles an existing logo or brand. No letters.

THE COMPOSITION, BOTH EMBLEMS (this is the point of the redo)
- The shield leans like italic lettering, so its middle shifts right toward the top. Centre every symbol on that slanted middle line: halfway between the shield's left and right edges at the height where the symbol sits. Do not centre on the image, or on an upright shield.
- Like the attached Solstice and Vanta emblems, the boldest parts may break out past the shield: drawn over the white border and beyond it onto the green, with the same navy outline, so the emblem's outline isn't just the shield's.
- Nothing floats near one edge while leaving empty space at the other.

LEFT: TEAM MIRAGE (rust orange #C75F2A field; gold #E9B43C, sand #DCC59A, dark brown #3B2A22 inner lines)
- Upper half: a big gold sun disc on the slanted middle line, with outspread falcon wings either side in gold with brown feather lines. The wings sweep out and up, and their tips break out past the shield's sides.
- Lower third: a sand pyramid with its apex on the slanted middle line, nearly touching the underside of the sun disc, and a thin gold line down one face. It stands on three level bands of sand and gold dunes that run edge to edge across the bottom of the shield, cut off by the border.

RIGHT: TEAM AURORA (deep violet #5A3EA6 field; pearl #ECE8F4 and silver #C8CCDA; dark indigo #241F3A inner lines)
- An upright knight's sword on the slanted middle line, point up: a long straight pearl blade with a silver fuller line, a broad silver crossguard, a round pommel. The point breaks out past the top edge of the shield; the pommel sits just inside the bottom point.
- A silver halo ring around the sword where the blade meets the crossguard, a little wider than the crossguard.
- A pair of swept pearl wings rising from behind the halo, one either side of the blade, feathers outlined in indigo. Their tips break out past the shield's sides.
- No star anywhere.

FORMAT
- One image, 1536x1024, perfectly flat pure green #00FF00: no shading, texture or glow on the green, and nothing green in the art.
- Mirage centred in the left half, Aurora centred in the right half, each about 600 px tall including what breaks out of the shield; at least 80 px of green between each emblem and the image's edges, and between the two.
- Crisp edges against the green, no soft halo.
```

## The prompt for T1 (Tempest: pilots, emblem and name)

Attach `hud-sheets/hud-u2-pilots.png` and `faction-f1-pilots.png` (the
pilots' hand), `hud-sheets/hud-u3-emblems.png` and
`faction-f2b-mirage-emblem.png` (the emblems' style, breaking out of the
shield), and `faction-f2-emblems.png` (the lettering). If one image is too
much for the model, it can come as two: the portraits across the top of a
1536x1024 image with the rest plain black (`faction-t1a-tempest-pilots.png`),
and the emblem and name on magenta (`faction-t1b-tempest-emblem.png`).

```
ZENITH GP: TEAM TEMPEST (one sheet: three pilots, the emblem and the team's name)

The game: a mech racing game in the style of a 1980s Japanese TV mecha anime, teams of giant robots racing and fighting on circuits in the sky. Four teams are already drawn (the attached sheets); this is the fifth, drawn by the same hand.
- Team Tempest, the storm team: storm machines with a samurai's touch. Jade green, black and gold, with lightning for light; thunder, lightning and wind first, with a samurai crest or a curved blade here and there for flavour.

STYLE
- Art from a 1980s Japanese TV mecha anime: the pilots like the cels of the series' cast, the emblem and lettering like the logos and title lettering of the period. Match the attached sheets exactly.
- Not a photo, not a 3D render, not a modern digital painting: no bloom, lens flare, blur, film grain or noise (the game adds its own grain).
- Original designs only: nothing that resembles an existing anime, character, logo or brand.

LAYOUT: one image, 1536x1024, landscape.
- Top half: three square portraits, each exactly 512x512, side by side edge to edge across the top, with no borders, gaps or labels.
- Bottom half: perfectly flat pure magenta #FF00FF, with no shading, texture, gradient, glow or shadow on the magenta. On it, the emblem centred in the bottom-left square (about 400 px tall), and the name TEMPEST centred across the bottom-middle and bottom-right squares (about 900 px wide). Nothing in the emblem or the name may be magenta, pink or purple. Crisp edges against the magenta, with no soft halo, and neither may touch the portraits or the image's edges.

THE PILOTS (top half, left to right)
- 1980s TV anime character cels: clean dark ink outlines of even weight, flat colour with one hard-edged shadow tone, a hard highlight band on the hair, large expressive eyes with two catch-lights, drawn by the same hand as the attached pilots.
- Framed exactly like the attached pilots: head and shoulders, the head turned three-quarters toward the right edge, the eyes about 40% down from the top, the shoulders running off the bottom edge. Adults, each with a distinct face, build, hair and skin tone.
- Black pilot suits with jade green panels and gold trim, a headset and boom mic. Background: a flat airbrushed gradient from jade green #2E9E6B down to deep green-black #0C1A14, with a few thin pale horizontal scan lines across it, like a comms screen. No scenery, text or logos.
  1. Squall, the forward: a young man about 20, light tan skin, a high black ponytail whipping to one side, a white headband with a small gold lightning mark, a fierce grin.
  2. Gale, the midfielder: a woman in her late 20s, medium-brown skin, short spiky silver-white hair, narrow dark green eyes, a small gold earring, a calm, focused look.
  3. Anvil, the defender: a tall, broad woman in her 40s, dark skin, close-cropped grey hair, a heavy jaw, a stern look with smile lines at the eyes, a heavy armoured collar with a gold storm-cloud clasp.

THE EMBLEM (bottom left)
- The same slanted shield outline as the attached emblems (a thick white border inside a thin navy #0D1630 outline), flat colour, hard edges, no letters.
- A jade green #2E9E6B field. On it, a storm: three white curling streaks of wind swirling round the centre of the shield. Down through the middle of the swirl strikes a gold #D9B13B lightning bolt, outlined in black, breaking out past the top and the bottom of the shield the way the attached emblems' boldest parts do.
- Centre everything on the shield's slanted middle line (halfway between its left and right edges at each height), not on the image.

THE NAME (bottom middle and right)
- TEMPEST, exactly the same lettering as SOLSTICE, VANTA, MIRAGE and AURORA on the attached sheets: huge, heavy, forward-slanting italic capitals in white with a thick navy #0D1630 outline and a navy drop shadow down and to the right. Nothing else. Spell it exactly as given.
```
