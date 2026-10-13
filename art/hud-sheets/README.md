# HUD sheets

Painted art for the race HUD in the anime look, made by an image model from
the prompt below and checked one sheet at a time, like `art/bg-sheets` and
`art/track-sheets`.

| Sheet | What | How the game uses it |
|---|---|---|
| U1 Icons | 24 white stencil symbols on green, one per cell of a 6x4 grid | The abilities, team plays, status chips, wind-up warnings and roles, which are words alone today. White, so the game colours each one by its state (ready, active, a team's colour, a warning's colour) |
| U2 Pilots | Six head-and-shoulders portraits, full bleed, 3x2 | A comms cut-in beside each radio message, as on an anime cockpit screen, and the target panel |
| U3 Emblems and countdown | The two team emblems, GO! and the numbers 3, 2, 1, on green, 3x2 | The score panel, the standings, the results; the countdown |

What stays live text and CSS in both looks: every number and name (place,
laps, points, clock, speed, gauges, damage, the standings, the notices), the
key caps and the panels' frames. They change every frame, have to read at a
glance and scale with the screen, so in the anime look the frames are
restyled in code to match the paintings rather than painted.

## Status

| Sheet | File | Notes |
|---|---|---|
| U1 Icons | hud-u1-icons.png | in the game. All 24, pure white with nothing else in them, inner detail cut through as asked; each cut by its own outline (grouped by the cell its middle falls in), since a few on the bottom row run a few pixels over their cell's edge |
| U2 Pilots | hud-u2-pilots.png | in the game. All six as briefed, one hand, framed alike and facing right; the joins sit a pixel or two off the 512 lines (514 and 1025 across, 513 down), so each is cut just inside its own edges |
| U3 Emblems and countdown | hud-u3-emblems.png | in the game. Both emblems, GO! with its star and the three numbers, cut cleanly; nothing green in the chrome |

## The prompt

```
ZENITH GP: RACE HUD ART (three sheets; make them one at a time, in order U1, U2, U3, each as its own image)

The game: a mech racing game, two teams of three giant robots racing and fighting on circuits in the sky. Team Solstice (white, bright blue #1F6FFF and gold #FFB21A) against Team Vanta (charcoal #4B4A5E, red #E0263C and pale grey #E6E8F0). These sheets are art for the on-screen display: symbols, the pilots' faces for their radio calls, the team emblems and the countdown. The game writes all the live text and numbers itself.

STYLE, ALL SHEETS
- Art from a 1980s Japanese TV mecha anime: the symbols like the graphics painted on the cockpit screens, the pilots like the cels of the series' cast, the emblems and lettering like the logos and title lettering of the period.
- Not a photo, not a 3D render, not a modern digital painting: no bloom, lens flare, blur, film grain or noise (the game adds its own grain).
- Original designs only: nothing that resembles an existing anime, character, logo or brand.
- Every sheet is 1536x1024, landscape.

SHEETS U1 AND U3 ARE CUT OUT BY THE GAME
- Paint them on perfectly flat pure green, #00FF00: no shading, texture, gradient, glow or shadow on the green.
- Nothing in the art itself may be green or close to it.
- Crisp edges against the green, with no soft halo.

SHEET U1: ICONS (24 symbols on green)
- 24 symbols, one in each cell of an invisible 6x4 grid (cells 256x256), each about 190 px across, centred in its cell, not touching the cell's edges or another symbol.
- Every symbol is solid pure white #FFFFFF, a bold simple silhouette that still reads when it is 32 px across. Inner detail is cut through the white as gaps where the green shows, never drawn in another colour: no outlines, shading, gradients or second colour (the game colours them).
- No letters, numbers or words anywhere.
- Row 1, the six abilities, left to right:
  1. Overdrive: a forward-pointing double chevron with three speed lines trailing behind it.
  2. Break Away: a square targeting bracket burst open at one corner, an arrow escaping through the gap.
  3. Snare: a hoop with a tether trailing from it, coiled once.
  4. Disruptor: a jagged lightning bolt striking through a circle, the circle broken where it passes.
  5. Ram: a heavy wedge-shaped prow pointing right, with three short impact lines at its tip.
  6. Aegis: a dome-shaped shield made of hexagons over a short base line.
- Row 2, the four team plays, then two racing states:
  7. Blitz: three forward chevrons in a row, each bigger than the last.
  8. Run: a long arrow sweeping ahead in a curve, a small star at its tail.
  9. Shield: a heater shield (flat top, pointed bottom) with a vertical band down its middle.
  10. Mark: a crosshair circle with a single solid diamond at its centre.
  11. Slipstream: a teardrop shape seen from the side, three wind lines flowing round and behind it.
  12. Slingshot: an arrow whipping round a half-circle and shooting off straight.
- Row 3, status:
  13. Weapons locked: a padlock in front of two crossed blades.
  14. Locked on: four corner brackets round a small solid dot.
  15. Escorting: two upward chevrons side by side, the left one larger, a short bar joining them.
  16. Momentum: a heavy solid ball with four curved motion lines behind it.
  17. Snared: a downward arrow caught in a loop of chain.
  18. Charging: a lightning bolt inside a slanted rounded bar.
- Row 4, the three wind-up warnings and the three roles:
  19. Parry: two blades crossed in an X with a four-point star flash where they cross.
  20. Dodge: a zigzag arrow stepping sharply aside.
  21. Guard: a raised armoured forearm seen from the front, a square plate on it.
  22. Forward: a single tall spearhead pointing up.
  23. Midfielder: a diamond with a small arrowhead on its left and right points.
  24. Defender: a solid tower block with a crenellated top.

SHEET U2: PILOTS (six portraits, full bleed)
- Six square portraits in a 3x2 grid, each exactly 512x512, filling the sheet edge to edge with no borders, gaps or labels.
- 1980s TV anime character cels: clean dark ink outlines of even weight, flat colour with one hard-edged shadow tone, a hard highlight band on the hair, large expressive eyes with two catch-lights, the faces drawn the way a 1980s mecha series drew its cast, all six clearly by the same hand.
- All six framed the same: head and shoulders, the head turned three-quarters toward the right edge, the eyes about 40% down from the top, the shoulders running off the bottom edge. Adults, each with a distinct face, build, hair and skin tone.
- Pilot suits in the team's colours with a headset and boom mic. Background: a flat airbrushed gradient in the team's colour, darker toward the bottom, with a few thin pale horizontal scan lines across it, like a comms screen. No scenery, text or logos.
- Top row, Team Solstice (white suits with bright blue panels and gold trim; background bright blue #1F6FFF fading to deep navy):
  1. Kite, the forward: a young woman about 20, warm light-brown skin, short choppy chestnut hair with a long fringe swept across one eye, bright amber eyes, a cocky grin.
  2. Lark, the midfielder: a man in his mid-20s, pale freckled skin, wavy sandy-blond hair to his collar, grey-blue eyes, a friendly half-smile.
  3. Atlas, the defender: a broad man in his late 30s, dark brown skin, close-cropped black hair greying at the temples, a square jaw, a small scar through one eyebrow, a calm steady look, a heavy armoured collar.
- Bottom row, Team Vanta (charcoal suits with red panels and pale grey trim; background red #E0263C fading to near-black #2A0A12):
  4. Shrike, the forward: a woman in her late 20s, pale skin, long straight black hair in a high ponytail, sharp narrow dark eyes with red eyeliner, a thin cool smirk, a red visor pushed up on her forehead.
  5. Moth, the midfielder: a slight young man, olive skin, a chin-length silver-white bob, sleepy half-lidded violet eyes, an unreadable expression, a high collar hiding his mouth.
  6. Golem, the defender: a towering broad-shouldered woman in her 40s, deep brown skin, a short black mohawk with shaved sides, heavy brows, a stern unsmiling mouth, small gold earrings, a heavy charcoal armoured collar with red plates.

SHEET U3: TEAM EMBLEMS AND THE COUNTDOWN (on green)
- Six pieces, one in each cell of an invisible 3x2 grid (cells 512x512), each centred in its cell and filling about 80% of it, not touching the cell's edges or another piece.
- Top row:
  1. Team Solstice emblem: a rising sun disc with long sharp rays over a horizon bar, inside a slanted shield shape, in white, bright blue #1F6FFF and gold #FFB21A. No letters.
  2. Team Vanta emblem: a black eclipse disc ringed with a thin red #E0263C corona, a sharp four-point star cutting through it, inside a slanted shield shape, in charcoal #4B4A5E, red and pale grey #E6E8F0. No letters.
  3. GO! in huge bold italic capitals with an exclamation mark, 1980s anime logo lettering: thick dark navy outline, the letters airbrushed like polished chrome from white at the top through sky blue to hot orange at the bottom (no green or teal anywhere in it), a sharp four-point star glint on the G.
- Bottom row: the countdown numbers 3, 2 and 1, left to right, one to a cell, each the same height (about 400 px), in the same lettering as GO!: bold italic, thick dark navy outline, airbrushed chrome from white through sky blue to hot orange.
- Nothing else: no other words, numbers, backgrounds or shadows.
```
