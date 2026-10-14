# Key art

The title screen for the anime look: the show's cover image and its logo.
Made by an image model from the prompt below and checked one image at a
time, like the other sheets in `art/`.

| Image | What | How the game uses it |
|---|---|---|
| K1 Cover image | A full-bleed painting composed like a mid-80s anime soundtrack or laserdisc cover: the hero pilot close up, the head and shoulders of her robot behind her, and otherwise only sky; the left 40% empty | Behind the title screen in the anime look, the logo, tagline and menu over its empty left side |
| K2 Logo | ZENITH GRAND PRIX in chrome lettering, on green | In place of the lettered logo on the title screen and on the eyecatch before the results |

The covers of that time (Votoms, Patlabor, Dougram, Orange Road's image
albums) had one idea each: a character close up, the robot behind or beside
them, often cropped by the frame, and a plain or airbrushed background with
a great deal of empty space. That is what K1 asks for, and it also keeps the
picture within what the image model draws well: one person and part of one
robot, both from references.

There are no painted title cards for the circuits: a round opens on the race
itself, which in the anime look is already painted, and always matches the
real robots.

What to attach:

| Image | Attach |
|---|---|
| K1 | `hud-sheets/hud-u2-pilots.png`, `key-sheets/refs/ref-swift-solstice.png` (Swift from the front, three-quarter, side and back, rendered from the game's model in the plain look) |
| K2 | `hud-sheets/hud-u3-emblems.png` (the chrome GO!) |

## Status

| Image | File | Notes |
|---|---|---|
| K1 Cover image | key-k1-cover.png | in the game. Kite and her Swift against a sunset (the second version: in the first the sun's disc did not carry on behind the robot), the left 40% open sky as asked; Swift's head, crest, shoulder pods and chest diamond as the renders show them. Kept whole; on screens narrower than 16:9 the crop keeps the sky side. A first prompt asked for a racing poster with six robots, two pilots and a whole circuit; the model could not hold that many designs (it drew one robot twice, left another out and blurred the rest) and drew everything at the same high detail, so it was redrafted as a cover: one pilot, part of one robot, an empty sky |
| K2 Logo | key-k2-logo.png | in the game. Spelt right, the chrome as GO!'s, a star glint on the I; cut cleanly by its outline (the green flat, the edges crisp). On the title screen and the eyecatch |

## The prompt

```
ZENITH GP: TITLE SCREEN (two images; make them one at a time, K1 then K2, each as its own image)

The game: a mech racing game in the style of a 1980s Japanese TV mecha anime, giant robots racing on roads high in the sky.

K1: COVER IMAGE (1536x1024, landscape, full bleed)
The cover of the show's soundtrack album, painted the way such covers were in the mid 1980s: one simple idea, two figures and a lot of empty sky.

- Kite, the hero pilot (top left on the attached pilot sheet), from the waist up, right of centre and close to us. Turned three-quarters to the left, looking calmly off into the distance, her hair lifting in the wind. Short messy brown hair, brown skin, a white flight suit with royal blue panels and gold trim, a white-and-blue headset. Draw her as the sheet does.
- Behind her and far bigger, her robot Swift (the attached renders): only its head, chest and shoulders, cropped by the top and right edges of the picture, looking the same way she does. The bird-like head with the swept gold crest, the tall shoulder pods, the glowing diamond on its chest; white, royal blue and gold, as the renders show it.
- Behind them, only sky: a smooth airbrushed gradient from deep blue at the top to warm peach and gold low down, and a big pale sun low behind them, so both are rimmed with warm light. No clouds, ground, sea, city, road or anything else.
- The left 40% holds nothing but that sky: the game puts its logo and menu there.

How it is drawn:
- Mid-1980s anime cel art: clean ink outlines, flat colour with one hard-edged shadow tone, airbrushed highlights in her hair, a soft glow along the robot's edges, a single star glint.
- Simple and calm: big shapes, very little detail, lots of empty space. A quiet moment before the race, not action.
- A small palette: the sky's blue, peach and gold; her and the robot's white, blue and gold.
- Soft, slightly warm colour, as printed on an old record or laserdisc cover; not glossy, not high contrast.
- No speed lines, sparks, smoke, particles, lens flares, other robots or other people. No text, logos or signatures.
- Not a 3D render, not a photo, not a modern anime key visual or game splash screen.

K2: LOGO (cut out by the game)
- Painted on perfectly flat pure green, #00FF00: no shading, texture, gradient, glow or shadow on the green. Nothing in the logo may be green or close to it. Crisp edges against the green, with no soft halo.
- ZENITH in huge, heavy, forward-slanting italic capitals, about 1300 px wide, in the chrome of the attached GO!: white at the top through sky blue to a dark blue horizon line, hot orange below it. A thick navy outline, and a sharp white star glint on one letter.
- Under it, GRAND PRIX in smaller italic capitals, widely spaced to about the width of ZENITH, solid white with the same navy outline.
- Under that, a speed streak: a row of forward-slanting stripes in hot orange, tapering away to the right.
- Spell both words exactly as given. Nothing else on the image.
```
