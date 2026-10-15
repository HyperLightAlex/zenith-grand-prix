# Model sheets

Model sheets for the mechs, drawn the way a 1980s mecha series' designer
drew them for the animators: one robot from four sides, at one scale, flat,
so it can be built and drawn the same way every time. The 3D models are to
be built from them, as an anime's CG team builds to the designer's sheets.
Made by an image model from the prompts below and checked one sheet at a
time, like the other sheets in `art/`.

The first is the Solstice Swift (Sunhawk), to settle which design it should
be: the one built in code today, or the heavier one the cover painting (K1)
drew from it.

| Sheet | What | How it is used |
|---|---|---|
| Current Swift | `refs/ref-swift-current.png`: the Swift as the game builds it today, rendered from its model in the plain look from the front, three-quarter, side and back, and its head and chest close up | What the frame is today. Attached to S1 as a list of its parts |
| S1 Swift, as on the cover | The cover's Swift as a model sheet: front, three-quarter, side and back | Set beside the render to choose the design. If chosen, the model is rebuilt to it |

What to attach:

| Sheet | Attach |
|---|---|
| S1 | `key-sheets/key-k1-cover.png` (the design: its shapes, proportions and colours) and `model-sheets/refs/ref-swift-current.png` (its parts: what it carries and where) |

## Status

| Sheet | File | Notes |
|---|---|---|
| S1 Swift, as on the cover | model-s1-swift.png | in the game, as Solstice's Sunhawk (`src/client/render/mech/solstice/sunhawk.ts`); `&oldswift=1` on the URL flies the first design instead. The four views agree: the same height to within 1% (882 to 888 px on the sheet) and the same parts in the same places. At 96 px a metre the sheet fits the forward's skeleton within a few per cent (hips, knees, shoulders, head), so the build keeps that skeleton and every pose. Kept as the code had it: the race number in the white roundel, the back's nozzles where they were. Taken from the sheet: the sun emblem on the front of the right tower, the warning triangle on the left. Not followed: the wide stance the sheet stands in (the poses decide that) and the head turned to its right in the front view |

## Checking a build against its sheet

The model viewer draws a frame from the sheet's four sides at the sheet's
scale: an orthographic camera 10.67 m tall (1024 px at 96 px a metre), the
ground 81 px from the bottom, the sheet's flat grey behind, lit from the
upper left in front. One view at a time, the frame at `cx`:

    ?debug=mechs&turn=1&role=0&team=0&ortho=10.6667&dist=60&h=4.4896&ly=4.4896&bg=e4e6ec&sun=-0.55,0.62,0.55&cx=-11.25

`cx` is -11.25 for the front, -3.75 for the three-quarter, 3.75 for the
side and 11.25 for the back. Rendered 420 px wide and pasted over the
sheet's view (its middle at x 201, 560, 915 and 1319), it lines up.

The viewer has no cel shading, so white armour comes out as one flat tone
there; how the faces divide into light and shadow shows in the game, in the
anime look (the garage is the closest view).

## The prompt

```
ZENITH GP: MODEL SHEET, THE SOLSTICE SWIFT (one image)

The game: a mech racing game in the style of a 1980s Japanese TV mecha anime, teams of giant robots that skate on wheeled feet, racing and fighting on roads high in the sky. This sheet is one robot's model sheet: the reference a mecha designer of the period drew for the animators, showing the robot from four sides so it is built and drawn the same way every time. Its 3D model will be built from this sheet.

THE ROBOT
Draw the robot standing behind the pilot on the attached cover painting, with the same shapes, proportions and colours, now seen whole. The cover shows only its head, chest and shoulders. The attached renders show an earlier, thinner build of the same robot from four sides; use them only as a list of its parts and where they go. Take every shape and proportion from the cover, never from the renders.

- Build: tall, strong and heroic, a racer and a duellist. The chest and the two shoulder towers are the widest, heaviest part of it, the waist narrower. The arms and legs are thick armour plates over a dark undersuit, never thin rods: big armoured forearms and shins, big feet. The legs are a little over half its height.
- Head: as on the cover, a long, flat, bird-like head with a pointed snout, a black visor band with one glowing pale cyan eye slit, and two gold blades sweeping back from its crown. It sits forward on a dark, ribbed neck.
- Shoulders: two tall, tapering white towers standing up off the shoulders past the head, each with a broad royal blue band low down and a gold cap on top, exactly as on the cover. A small gold sun emblem on the outside of the left tower, a small yellow warning triangle on the outside of the right.
- Chest: the cover's broad, faceted white breastplate edged with thin gold trim, a glowing pale cyan diamond core in a blue setting at its centre, three short blue slashes either side of the core. Below it a dark, ribbed waist, then white hip armour dropping to a point in front.
- Arms: white plated upper arms and forearms over dark joints. A long gold blade along the outside of each forearm, from the elbow to well past the hand, with a thin glowing cyan edge. Hands with long fingers.
- Legs: white plated thighs and shins over dark joints, a gold spur standing back from behind each knee, a small thruster nozzle on the back of each calf.
- Feet: long, narrow armoured feet ending in three short gold claws, a gold spur at the heel, and under each foot a row of three in-line skate wheels with glowing cyan hubs.
- Back: a slim power unit between the shoulder blades with two round thruster nozzles low down, and the race number 1 in a white roundel above them. From the top of the back two long fins sweep back and down, one each side, in three tapering segments (dark, then blue, then gold), with a thin glowing cyan seam along them.
- Thin glowing cyan seams run down the dark parts of the arms and legs.
- Colours: white armour #F4F6FB, royal blue #1F6FFF, gold trim #FFB21A, dark navy frame and undersuit #2A3142, glowing parts pale cyan #45E8FF. The shadows as a cel painter mixed them: the white shades to lavender grey #A6A3C8, the blue to deep ultramarine #1E2A9C, the gold to burnt orange #C0601E, the navy to #171A2E.

THE SHEET
- Four full-length views of the same robot side by side, left to right: front; three-quarter front (turned 45 degrees to its left); side (facing the left edge of the sheet); back.
- All four at exactly the same scale, standing on one ground line with the tops of their heads level, filling most of the sheet's height, with clear space between them.
- Standing straight in a neutral pose: the arms hanging a little away from the body so nothing hides behind them, the feet flat, the fins at rest.
- Seen straight on with no perspective at all, as an orthographic drawing: nothing foreshortened, no low angle, no camera lens.
- Every view shows the same robot: each part the same size and in the same place in every view.

STYLE
- A 1980s Japanese TV mecha anime model sheet: clean ink line art of even weight, a little heavier on the outer contour; flat colour with one hard-edged shadow tone per colour, lit from the upper left; a few hard white highlight lines along the edges of the armour, as on the cover.
- A plain, flat pale grey background #E4E6EC with a thin grey ground line. No scenery, no shadows on the ground, no people or other robots.
- No text, labels, arrows, numbers or logos anywhere, apart from the race number 1 on its back, the sun emblem and the warning triangle on its shoulder towers.
- Not a photo, not a 3D render, not a modern digital painting: no bloom, lens flare, blur, film grain or noise.
- Original design only: nothing that resembles an existing anime robot, character, logo or brand.
- 1536x1024, landscape.
```
