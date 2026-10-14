# Faction sheets

The painted art for the two new factions, Mirage and Aurora
(`docs/FACTIONS.md`), made to match the HUD sheets' pilots and emblems and
the hangar's painted lettering. Made by an image model from the prompt below
and checked one sheet at a time, like the other sheets in `art/`.

| Sheet | What | How the game uses it |
|---|---|---|
| F1 Pilots | Six head-and-shoulders portraits, full bleed, 3x2: Mirage's three, then Aurora's | The comms cut-ins, the target panel and the results, as for Solstice's and Vanta's pilots |
| F2 Emblems and lettering | The two emblems and the two teams' names as painted on their hangar walls, on green, 2x2 | The score panel, the standings, the results, the garage, the mechs' markings and the hangar's back wall; the name on the hangar walls |

Until F2 comes, the game draws stand-ins in each faction's colours (a badge
for the emblem, the name on the hangar wall in code).

What to attach:

| Sheet | Attach |
|---|---|
| F1 | `hud-sheets/hud-u2-pilots.png` (the hand, the framing and the backgrounds to match) |
| F2 | `hud-sheets/hud-u3-emblems.png` (the emblems' style) and `hangar-sheets/hangar-h2-signs.png` (the hangar lettering to match exactly) |

## Status

| Sheet | File | Notes |
|---|---|---|
| F1 Pilots | faction-f1-pilots.png | in the game (cut by `tools/bg/build_hud.py`). Aurora's genders changed from the prompt: Iris and Bastion are men, Vesper a woman |
| F2 Emblems and lettering | faction-f2-emblems.png | to make |

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
