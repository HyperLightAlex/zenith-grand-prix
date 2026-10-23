# Model sheets

Model sheets for the mechs (and the fallen titan of Titan's Rest, below), drawn the way a 1980s mecha series' designer
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


## Titan's Rest: the fallen titan

The colossus Titan's Rest is built on and through (`src/sim/tracks/titan.ts`).
The game builds it from simple shapes today (`buildTitansRest` in
`src/client/render/world.ts`); these sheets settle its design so it can be
modelled properly in Blender. They draw it whole and standing, as a designer
would. How it lies, how deep it is buried, where it is broken and how it fits
round the road are decided in the build, from the track. Its colours are the
backgrounds' (the R sheets in `bg-sheets/`). No racer stands beside it for
scale: at a model sheet's scale one would be a few pixels tall.

| Sheet | What | How it is used |
|---|---|---|
| G1 The titan | Whole and standing: front, three-quarter, side and back | The design: its shapes, proportions and colours |
| G2 Head and halo | The head and collar from the front, the side and above; the halo face-on | The parts the road crosses: over its brow and through the halo |
| G3 Arm and sword | The right arm from above, palm up; the sword flat and edge-on | The arm the road climbs and the blade it corkscrews round |
| G4 Inside its chest | A cross-section, the wound, a corridor, a rib's joint | The Breach, the Ribcage loop and the Hull's corridors; how it is broken |

What to attach:

| Sheet | Attach |
|---|---|
| G1 | `model-sheets/model-s1-swift.png` (the style and layout of a model sheet only) |
| G2, G3, G4 | the finished G1 |

Make G1 first and check it before the others.

### Status

| Sheet | File | Notes |
|---|---|---|
| G1 The titan | | to be made |
| G2 Head and halo | | to be made |
| G3 Arm and sword | | to be made |
| G4 Inside its chest | | to be made |

Image model: record the model, its version and the image size here when the
sheets are made.

### The prompts

```
ZENITH GP: MODEL SHEET G1, THE FALLEN TITAN (one image)

The game: a mech racing game in the style of a 1980s Japanese TV mecha anime, teams of giant robots that skate on wheeled feet, racing and fighting on roads high in the sky. One circuit, Titan's Rest, is built on and through the wreck of a colossal war machine, kilometres tall, that fell in a war long over and now lies on its back in a white desert. This sheet is that colossus's model sheet: the reference a mecha designer of the period drew so it is built and drawn the same way every time, showing it whole, as it was before it fell. Its 3D model will be built from this sheet. The attached model sheet shows the style and layout to follow; take nothing of its robot's design.

THE COLOSSUS
- An ancient war machine from an older age than the racers: grander, heavier and more ornamental, built like a temple guardian in armour. Massive and slow-looking: a deep, broad chest and wide shoulders, a narrower armoured waist, long heavy arms, thick legs a little under half its height, big blocky feet.
- Head: a broad helmet, small for the body. Down the middle of its face and forehead, from chin to crown, one smooth, gently rounded plate, with nothing standing up on the centre line. A dark visor band across the face with two long eyes in it, unlit. Heavy cheek guards. From either side of the forehead two long horns sweep back and up past the crown. A small round jewel set flush into the forehead. The head sits low in a tall, flared collar.
- The halo: a great ring of engraved bronze-gold standing upright behind its head, facing forward, about twice the width of the head, held off its upper back by three heavy struts. The ring is thick and flat, engraved with fine, angular channels, with short spokes pointing in from its inner edge toward the head.
- Chest: the breastplate is one great curved shield of ivory armour with a raised ridge down its centre like a breastbone, and a faded red stripe either side of the ridge. The sides of the chest are wrapped in overlapping curved plates, like a cage of ribs.
- Arms: heavy armour plates over slate joints. Big shoulder armour with engraved bronze-gold trim along its edge. Long upper arms and forearms, the forearms broad and flat-faced on their inner side. A faded red band round each upper arm and forearm. Big hands with four long fingers and a thumb, open, each palm armoured with one broad plate.
- Legs: thick armoured thighs and shins over slate knees, a faded red band round each shin, big blocky feet with heavy toe caps.
- Back: two great armoured vents between the shoulder blades, and the halo's struts rising from above them.
- Engraved bronze-gold trims the edges of its armour in places. In the joints and the gaps between plates its inner frame shows: bronze with blue-teal verdigris.
- It carries no weapon on this sheet; its sword is drawn on a sheet of its own.
- Colours: weathered ivory armour #E6E0D2, slate joints and visor surround #6E7486, faded red markings #B84A3A, inner frame bronze #8A6A3A with blue-teal verdigris #5FA08A, engraved bronze-gold trim and halo #C9A04A, the visor dark #2A2E38. The shadows as a cel painter mixed them: the ivory shades to cool lilac grey #A8A6BE, the red to #7A3240, the slate to #474B5E, the bronze to #5A4230, the bronze-gold to #8E6A2E.

THE SHEET
- Four full-length views of the same colossus side by side, left to right: front; three-quarter front (turned 45 degrees to its left); side (facing the left edge of the sheet); back.
- All four at exactly the same scale, standing on one ground line with the tops of their heads level, filling most of the sheet's height, with clear space between them.
- Standing straight in a neutral pose: the arms hanging a little away from the body so nothing hides behind them, the hands open, the feet flat.
- Seen straight on with no perspective at all, as an orthographic drawing: nothing foreshortened, no low angle, no camera lens. However enormous it is, draw it as a model sheet draws any robot, not looking up at it.
- Every view shows the same colossus: each part the same size and in the same place in every view.
- Whole and undamaged, in the faded colours it has now: no breaks, holes or wreckage.

STYLE
- A 1980s Japanese TV mecha anime model sheet: clean ink line art of even weight, a little heavier on the outer contour; flat colour with one hard-edged shadow tone per colour, lit from the upper left; a few hard white highlight lines along the edges of the armour.
- A plain, flat pale grey background #E4E6EC with a thin grey ground line. No scenery, no shadows on the ground, no people or other robots.
- No text, labels, arrows, numbers or logos anywhere.
- Not a photo, not a 3D render, not a modern digital painting: no bloom, lens flare, blur, film grain or noise.
- Original design only: nothing that resembles an existing anime robot, character, logo or brand.
- 1536x1024, landscape.
```

```
ZENITH GP: MODEL SHEET G2, THE FALLEN TITAN: HEAD AND HALO (one image; attach sheet G1)

The game: a mech racing game in the style of a 1980s Japanese TV mecha anime. One circuit, Titan's Rest, is built on and through the wreck of a colossal war machine lying on its back in a white desert; the road runs over its face and brow and rolls through its halo, so racers see them close up. The attached sheet G1 is the colossus's model sheet. This sheet draws its head, collar and halo larger and in more detail, for its 3D model.

THE HEAD AND HALO
- Exactly the design on the attached sheet G1: the same shapes, proportions and colours. Now with more detail: the panel seams and rows of rivets in the armour, the engraving on the bronze-gold trim, the visor's frame, the facets of the horns, how the collar's plates overlap.
- Head: a broad helmet. Down the middle of its face and forehead, from chin to crown, one smooth, gently rounded plate, with nothing standing up on the centre line. A dark visor band across the face with two long eyes in it, unlit. Heavy cheek guards. Two long horns sweeping back and up past the crown from either side of the forehead. A small round jewel set flush into the forehead. A tall, flared collar of overlapping plates.
- The halo: a thick, flat ring of bronze-gold, its face engraved with fine, angular, circuit-like channels in concentric bands, worn smooth and bright on the high spots and darker in the grooves; a heavier rim at its outer and inner edges; short spokes pointing in from its inner edge. Three heavy struts on its back, where it was held off the colossus's shoulders.
- Colours: weathered ivory armour #E6E0D2, slate #6E7486, faded red #B84A3A, inner frame bronze #8A6A3A with blue-teal verdigris #5FA08A, engraved bronze-gold #C9A04A, the visor dark #2A2E38. Shadows: ivory to cool lilac grey #A8A6BE, red to #7A3240, slate to #474B5E, bronze to #5A4230, bronze-gold to #8E6A2E.
- Whole and undamaged.

THE SHEET
- Four panels in a 2x2 grid of equal cells (each 768x512), each drawing centred in its cell with clear space round it, on the same plain background, with no lines or borders between the cells.
- Top left: the head and collar from the front.
- Top right: the head and collar from the side, facing the left edge of the sheet.
- Bottom left: the head and collar from directly above, looking down on the top of the head, the face toward the bottom edge of the sheet.
- Bottom right: the halo alone, seen face-on, a complete ring, with its three struts.
- The three views of the head at exactly the same scale, and without the halo, so the head is seen whole.
- Every panel seen straight on with no perspective at all, as an orthographic drawing.

STYLE
- A 1980s Japanese TV mecha anime model sheet: clean ink line art of even weight, a little heavier on the outer contour; flat colour with one hard-edged shadow tone per colour, lit from the upper left; a few hard white highlight lines along the edges of the armour.
- A plain, flat pale grey background #E4E6EC. No scenery, no shadows on the ground, no people or other robots.
- No text, labels, arrows, numbers or logos anywhere.
- Not a photo, not a 3D render, not a modern digital painting: no bloom, lens flare, blur, film grain or noise.
- Original design only: nothing that resembles an existing anime robot, character, logo or brand.
- 1536x1024, landscape.
```

```
ZENITH GP: MODEL SHEET G3, THE FALLEN TITAN: ARM AND SWORD (one image; attach sheet G1)

The game: a mech racing game in the style of a 1980s Japanese TV mecha anime. One circuit, Titan's Rest, is built on and through the wreck of a colossal war machine lying on its back in a white desert. The road climbs onto its open right hand and up its outstretched arm to the shoulder, and later corkscrews round the blade of its great sword, which stands driven into the sand beside it. The attached sheet G1 is the colossus's model sheet. This sheet draws its right arm and its sword in more detail, for their 3D models.

THE ARM
- Exactly the design on the attached sheet G1: the same shapes, proportions and colours. Now with more detail: the panel seams and rows of rivets in the armour, the engraved bronze-gold trim, the slate joints at the elbow and wrist with the bronze frame showing between the plates, the faded red bands round the upper arm and forearm.
- The forearm broad and flat-faced on its inner side. A big hand with four long fingers and a thumb, open, the palm armoured with one broad plate, each finger in three armoured segments.

THE SWORD
- A great straight sword, nearly as long as the colossus's legs.
- A long, slender, double-edged blade of dark gunmetal #3A3F4A, about twenty times as long as it is wide, keeping its width almost to the point and then tapering to it, with a shallow groove down its centre and bright steel edges #B8BCC8.
- A broad, heavy crossguard of engraved bronze-gold, flat across its top, its arms swept a little toward the point, several times wider than the blade.
- A long grip bound in faded red, and a heavy round pommel of engraved bronze-gold with a ring set in it.
- Colours: weathered ivory armour #E6E0D2, slate #6E7486, faded red #B84A3A, inner frame bronze #8A6A3A with blue-teal verdigris #5FA08A, engraved bronze-gold #C9A04A, gunmetal #3A3F4A. Shadows: ivory to cool lilac grey #A8A6BE, red to #7A3240, slate to #474B5E, bronze to #5A4230, bronze-gold to #8E6A2E, gunmetal to #23262E.
- Both whole and undamaged.

THE SHEET
- Three drawings stacked top to bottom, each running across nearly the full width of the sheet, with clear space between them:
- Top: the right arm whole, from the shoulder armour to the fingertips, held straight out with the shoulder on the left and the hand on the right, palm up, seen from directly above, so the palm and the inner side of the arm show along its length.
- Middle: the sword laid flat, the pommel on the left and the point on the right, showing the face of the blade.
- Bottom: the same sword at the same scale, seen edge-on, lined up with the one above it, pommel over pommel and point over point.
- Every drawing seen straight on with no perspective at all, as an orthographic drawing.

STYLE
- A 1980s Japanese TV mecha anime model sheet: clean ink line art of even weight, a little heavier on the outer contour; flat colour with one hard-edged shadow tone per colour, lit from the upper left; a few hard white highlight lines along the edges of the armour and the blade.
- A plain, flat pale grey background #E4E6EC. No scenery, no shadows, no people or other robots.
- No text, labels, arrows, numbers or logos anywhere.
- Not a photo, not a 3D render, not a modern digital painting: no bloom, lens flare, blur, film grain or noise.
- Original design only: nothing that resembles an existing anime robot, character, weapon, logo or brand.
- 1536x1024, landscape.
```

```
ZENITH GP: MODEL SHEET G4, THE FALLEN TITAN: INSIDE ITS CHEST (one image; attach sheet G1)

The game: a mech racing game in the style of a 1980s Japanese TV mecha anime. One circuit, Titan's Rest, is built on and through the wreck of a colossal war machine lying on its back in a white desert, its chest torn open by an old wound. The road goes in through the wound and runs through its body: a loop inside its ribs, then long corridors through its frame. The attached sheet G1 is the colossus's model sheet, showing it whole. This sheet shows what is inside its chest and how it is broken, drawn as the setting art a 1980s mecha series' art department made for the animators, for its 3D model.

INSIDE THE CHEST
- The same colossus and colours as the attached sheet G1. Under the ivory armour shell: great curved ribs of bronze frame running round from a massive spine at its back toward the breastbone, with blue-teal verdigris streaked down them; between and behind the ribs a lattice of girders, bulkheads, bolted plates and bundles of conduit and pipe; low down either side of the spine, two long corridors running the length of its body, each a tall square passage walled and roofed in bronze plate, wide enough for a road.
- Colours: weathered ivory armour #E6E0D2, slate #6E7486, faded red #B84A3A, inner frame bronze #8A6A3A with blue-teal verdigris #5FA08A, engraved bronze-gold #C9A04A, conduits slate and faded red. Shadows: ivory to cool lilac grey #A8A6BE, red to #7A3240, slate to #474B5E, bronze to #5A4230, the deepest spaces inside dark bronze-brown #3A2A20.

THE SHEET
- Four panels in a 2x2 grid of equal cells (each 768x512), each drawing centred in its cell with clear space round it, on the same plain background, with no lines or borders between the cells.
- Top left: a cross-section through the middle of its chest, drawn as a period mecha design book drew a cutaway: the chest cut straight across and seen face-on, the breastplate at the top and the back at the bottom. The thick armour shell and the breastplate's centre ridge; the ribs curving round inside it from the spine; the girders, bulkheads and conduit between them; the two corridors, low down either side of the spine. The cut faces of the armour and frame filled with a flat, darker tone so the section reads clearly. Orthographic, no perspective.
- Top right: the wound, as it is now. The chest seen from above at a three-quarter angle, the colossus lying on its back: a great ragged hole torn in the breastplate and down one side, the armour plates round its edge bent and peeled outward, the ribs and frame inside laid bare, two or three ribs snapped, cut cables and conduit hanging, a little white sand drifted into the bottom of the hole.
- Bottom left: inside one of the corridors, looking straight along it down its middle, in one-point perspective (this panel only): a long, straight, tall square passage of bronze plate, ribs of frame arching overhead at regular intervals, conduits along its walls, daylight falling in shafts through rents in its roof, the far end a bright opening.
- Bottom right: a close-up of one rib where it meets the spine: its great hinged joint, rows of rivets and bolted plates, verdigris in the seams, bundles of conduit running along the spine past it.

STYLE
- Setting art from a 1980s Japanese TV mecha anime: clean ink line art of even weight, a little heavier on the outer contour; flat colour with one hard-edged shadow tone per colour, lit from the upper left; the spaces inside shaded but every shape still readable.
- A plain, flat pale grey background #E4E6EC around the drawings. No scenery beyond the colossus itself and the sand in its wound; no people, vehicles or other robots.
- No text, labels, arrows, numbers or logos anywhere.
- Not a photo, not a 3D render, not a modern digital painting: no bloom, lens flare, blur, film grain or noise.
- Original design only: nothing that resembles an existing anime robot, character, logo or brand.
- 1536x1024, landscape.
```
