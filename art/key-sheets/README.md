# Key art

The game's big pictures for the anime look: the title illustration, the
logo, and a title card for each circuit. Made by an image model from the
prompt below and checked one image at a time, like the other sheets in
`art/`.

| Image | What | How the game uses it |
|---|---|---|
| K1 Title illustration | A full-bleed painting: both teams racing on the Meridian Skyway, two pilots' faces in the sky, the left 40% open sky | Behind the title screen in the anime look, the logo, tagline and menu over its open left side |
| K2 Logo | ZENITH GRAND PRIX in chrome lettering, on green | In place of the lettered logo on the title screen and on the eyecatch before the results |
| K3 Meridian Skyway | A full-bleed title card: a Swift through the Zenith Ring at golden hour | The round's opening title card in the anime look, the circuit's name over its quiet lower left; and in the garage when the circuit is picked |
| K4 Corkscrew Canyon | A full-bleed title card: two Vectors fighting through the Narrows at dusk | As K3 |
| K5 Helios Drop | A full-bleed title card: a Bulwark leaping the Drop through the Sun Gate at noon | As K3 |

The robots must match the game's models, so the prompt comes with renders of
them from the game, in `refs/` (from `?debug=mechs`, the plain look): all
three frames together, then Swift, Vector and Bulwark each from the front,
three-quarter, side and back. The pilots come from the HUD's U2 sheet, the
chrome from U3's GO!, and each circuit's setting from its sky and horizon
sheets in `art/bg-sheets`.

What to attach with each image (in one chat, the robot renders only need
attaching once):

| Image | Attach |
|---|---|
| K1 | the four renders in `refs/`, `hud-sheets/hud-u2-pilots.png`, `bg-sheets/bg-m1-sky.png` |
| K2 | `hud-sheets/hud-u3-emblems.png` |
| K3 | the four renders, `bg-sheets/bg-m1-sky.png`, `bg-sheets/bg-m2-horizon.png` |
| K4 | the four renders, `bg-sheets/bg-c1-sky.png`, `bg-sheets/bg-c2-horizon.png` |
| K5 | the four renders, `bg-sheets/bg-h1-sky.png`, `bg-sheets/bg-h2-horizon.png` |

## Status

| Image | File | Notes |
|---|---|---|
| K1 Title illustration | key-k1-title.png | waiting |
| K2 Logo | key-k2-logo.png | waiting |
| K3 Meridian Skyway | key-k3-meridian.png | waiting |
| K4 Corkscrew Canyon | key-k4-canyon.png | waiting |
| K5 Helios Drop | key-k5-helios.png | waiting |

## The prompt

```
ZENITH GP: KEY ART (five images; make them one at a time, in order K1 to K5, each as its own image)

The game: a mech racing game. Giant robots in two teams' liveries race on circuits of elevated road high in the sky, three robots a side, skating on the wheels under their feet, boosting on the thrusters on their backs and fighting for position. These are the game's big pictures: the title illustration, the logo, and a title card for each of the three circuits.

ATTACHED
- Renders of the robots from the game: all three frames together, then Swift, Vector and Bulwark, each from the front, three-quarter, side and back. Draw the robots exactly as these show them: the same build, proportions, heads, shoulders, chest markings and wheeled feet. Only the drawing style changes. Each frame races in either team's colours.
- The pilots' portrait sheet (for K1).
- Each circuit's sky and horizon, painted earlier for the game (for K1, K3, K4 and K5): match their colours, light and painting.
- The HUD sheet with the chrome GO! lettering (for K2).

THE TWO TEAMS
- Solstice: white armour, royal blue panels, gold trim, cyan lights. Its pilots in white, blue and gold.
- Vanta: charcoal armour, crimson panels, pale grey trim, hot pink-red lights. Its pilots in charcoal and red.

THE THREE FRAMES (as in the renders)
- Swift: tall, thin and long-legged; a bird-like head with a swept gold crest; tall upright shoulder pods; a glowing diamond on its chest between chevrons; long gold blades down its forearms; light lines along its dark limbs.
- Vector: the all-rounder; a visored head, round shoulder pods, a square hatch on its chest, a rifle in one hand, twin stripes down its thighs.
- Bulwark: huge and broad; a crest of spikes on its head and spikes on its shoulders; a toothed grille across its chest that glows; massive fists.

STYLE, ALL FIVE
- A 1980s Japanese TV mecha anime at its best: the painted posters, laserdisc covers and title cards of a series like that. Robots and people are hand-inked cels: clean, confident ink outlines, flat colour with one or two hard-edged shadow tones, sharp white highlights along the armour's edges and a star glint or two on the metal. Behind them, hand-painted gouache backgrounds with airbrushed skies, like the attached sky and horizon sheets.
- Speed the way the series drew it: speed lines, a streaked background, a strong diagonal, the robots crouched like speed skaters and leaning hard into their speed. Thruster flames are clean, hard-edged cel flares in the team's light colour.
- No smoke, dust clouds, exhaust trails, steam or haze anywhere. Sparks and speed lines are fine.
- Not a photo, not a 3D render, not a modern digital painting: no blur, depth of field, bloom, lens flare or film grain.
- Original designs only: no robots, characters, logos or lettering from any real series, game or brand.
- No text, numbers, logos or signatures in any picture except K2. Leave the race numbers off the robots.
- Every image is 1536x1024, landscape. K1, K3, K4 and K5 fill the frame edge to edge. The game may trim up to 80 px off the top and the bottom, so keep everything that matters inside the middle 1536x864.

K1: TITLE ILLUSTRATION
- The setting: the Meridian Skyway at golden hour. An elevated racing road high above the open sea, with pale armoured barriers and tall pylons; a city of white towers on islands far below; in the distance a great white hoop that the road runs through. The sky as in the attached Meridian sky: a warm low sun, peach and blue, small lit clouds.
- The left 40% of the picture is calm open sky over the sea, with nothing in it but sky and soft clouds: the game sets its logo and menu there.
- In the right 60%: Solstice's three robots, Swift in the lead, then Vector, then Bulwark, racing towards us round a banked bend at a three-quarter angle, thrusters blazing. Behind them, Vanta's three closing in, their Bulwark rising dark against the low sun, its chest grille glowing.
- High on the right, painted large and fading into the sky the way 80s anime posters set the heroes' faces over the action: two pilots from the attached portraits, rivals, both looking off to the left. Kite (top left on the sheet: short brown hair, a grin, a white-and-blue headset) and Shrike (bottom left: a long black ponytail, red goggles pushed up, a smirk).

K2: LOGO (cut out by the game)
- Painted on perfectly flat pure green, #00FF00: no shading, texture, gradient, glow or shadow on the green. Nothing in the logo may be green or close to it. Crisp edges against the green, with no soft halo.
- ZENITH in huge, heavy, forward-slanting italic capitals, about 1300 px wide, in the chrome of the attached GO!: white at the top through sky blue to a dark blue horizon line, hot orange below it. A thick navy outline, and a sharp white star glint on one letter.
- Under it, GRAND PRIX in smaller italic capitals, widely spaced to about the width of ZENITH, solid white with the same navy outline.
- Under that, a speed streak: a row of forward-slanting stripes in hot orange, tapering away to the right.
- Spell both words exactly as given. Nothing else on the image.

K3, K4, K5: CIRCUIT TITLE CARDS
- One picture per circuit: a moment of a race, as a series' title card would show it. The action fills the right two-thirds. Keep the lower left third quiet (sky, sea, cloud or distant land), because the game sets the circuit's name there.
- K3, Meridian Skyway, golden hour (the attached Meridian sky and horizon): Solstice's Swift shooting through the great white hoop that the road runs through, high over the sea, a Vanta Swift right on its tail. The city's towers on their islands far below, the sun low and warm behind.
- K4, Corkscrew Canyon, dusk (the attached Canyon sky and horizon): a Solstice Vector and a Vanta Vector shoulder to shoulder in the Narrows, a narrow road cut through red rock, trading blows as they race, sparks flying. Beyond, red mesas and the road twisting through a corkscrew, the sun just touching the horizon under a violet sky.
- K5, Helios Drop, high noon (the attached Helios sky and horizon): Vanta's Bulwark leaping off the end of the road across a gap of open sky, through a huge golden ring that hangs over the gap, its shadow on the sea of white cloud far below. Floating islands and a tall white-and-gold spire beyond; a Solstice Swift leaping after it.
```
