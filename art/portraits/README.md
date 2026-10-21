# Pilot portraits: the parts for a face creator

Players will build their own pilot's face from parts: a face shape, eyes,
brows, a nose, a mouth, a hairstyle, facial hair and extras, each in colours
they choose, shown everywhere the fifteen painted pilots are shown now (the
radio cut-ins, the target panel, the results, the hangar's pilot card).
This brief is for painting those parts.

The game puts each portrait together from layers, so every part must be
painted on one shared template head, in the same pose, place and light, by
the same hand as the pilots. The game recolours skin, hair, eyes, the suit
and the headset itself, so those are painted in fixed reference colours.

Work in two stages. **Stage A** is a trial: the fifteen pilots keyed to the
colour key (A0), the template (A1) and a few parts of each kind (A3), to
prove the parts fit together. Stop where it says and report. **Stage
B**, the full set, starts only once the trial has been checked in the game.

## Style

Match the fifteen pilots in `src/client/ui/art/pilot-*.webp` exactly; they
are the reference for everything below. From their brief
(`art/hud-sheets/README.md`, sheet U2):

- 1980s TV mecha anime character cels: clean dark ink outlines of even
  weight, flat colour with one hard-edged shadow tone, a hard highlight band
  on the hair, large expressive eyes with two catch-lights, faces drawn the
  way a 1980s mecha series drew its cast, all by the same hand.
- Head and shoulders, the head turned three-quarters toward the right edge,
  the eyes about 40% down from the top, the shoulders running off the bottom
  edge. Adults.

Every part is for every pilot: faces of every build, age (young adult to
middle-aged) and heritage. Draw noses, mouths, eyes and hair from many
heritages; the skin colour is the game's to choose.

## Every image

- PNG, exactly **1024 x 1024**, sRGB, no transparency, no text, logos,
  signatures or watermarks.
- **Background: flat #00FF00**, edge to edge: no gradient, no scan lines, no
  scenery. The game draws the comms-screen background in the team's colours.
- Framing exactly as `guide/framing.png` (drawn over the fifteen pilots
  averaged): eye line at y 410, top of the bald skull at y 70, chin at
  y 655, ear and headset at about (350, 435), nose tip at about x 745, the
  collar's top at about y 700. Hair may run off the top and left edges.
- Colours as `guide/colours.png`: flat, one hard shadow tone each (hair also
  a highlight band). Paint as close to them as the style allows; the game
  recolours by them.
  - Skin: #C98B66, shadow #9C6247.
  - Hair, brows and facial hair: a mid grey, #8C8C8C, shadow #575757,
    highlight #CFCFCF (it reads as silver hair; the game makes it any colour).
  - Iris: #3A8FE8, shadow #22579A, pupil #14101C, white catch-lights.
  - Ink: #1C1622, every outline.
  - Suit and headset: main panels #E03030 (shadow #A01E1E), accent panels
    #3050E0 (#1F35A0), trim #F0C020 (#B08A10), under-suit and mic boom
    #2A2A33 (#1A1A20). This is a colour key, not a look: the game paints
    them in the team's colours.
- Gaze: toward the right edge, as the pilots look.

## How each part is made: painted inside a mask, on the template

Every part is painted **in place on a template image, inside a mask**, with
everything outside the mask left exactly as it was (inpainting, or an image
edit restricted to the mask). That is what makes the parts line up: each eye
shape is painted on the same face, each hairstyle on the same skull. Deliver
each part as the **whole 1024 x 1024 image** (template plus the part); the
game's tools cut the part out by comparing it with the template.

If your tool cannot paint inside a mask while keeping the rest of the image,
**stop and say so** before painting anything: this plan depends on it.

The masks are made from the approved template, so they come after it
(`masks/`, Stage A step 2).

Inside a mask, keep any skin you repaint in the flat skin colour, so a part
lies on any face without a patch showing. Keep edges hard and clean (no soft
glow or fringe), as a cel's are.

## How the game stacks the layers

Back to front: the background (the game's), the head (a face shape), the
eyes, the brows, the nose, the facial hair, the mouth (lips and teeth go over
a beard), the extras worn on the skin (scars, face paint, freckles, a
bandage), the suit (its collar over the neck), the hair (over the suit where
it falls in front of it), the extras worn over the hair (a circlet, a visor,
an eyepatch's strap), and the headset on top. Paint each part so it looks
right in that order: hair over the brows and forehead, the headset over the
hair. Hair falling behind the collar is simply not painted where the collar
hides it.

## Stage A: the trial

### A0. The fifteen pilots, keyed

So a pilot chosen by a player on another team can wear that team's colours,
deliver each of the fifteen pilots with its background, suit and headset in
the colour key, and everything else as it is.

For each `src/client/ui/art/pilot-<name>.webp` (256 x 256): enlarge it to
1024 x 1024 (smoothly), then repaint **only** the background, the suit and
the headset:

- The background: flat #00FF00, edge to edge, scan lines and all.
- The suit and the headset: each panel in the key colour for its role, its
  shadow tone in that key's shadow, keeping the suit's design, its panel
  lines, folds and ink exactly. The roles, by faction:

| Faction (pilots) | main #E03030 | accent #3050E0 | trim #F0C020 | under-suit #2A2A33 |
|---|---|---|---|---|
| Solstice (kite, lark, atlas) | white panels | blue panels | gold piping | the dark inner suit |
| Vanta (shrike, moth, golem) | charcoal panels | red panels | pale grey piping | the black inner suit |
| Mirage (sirocco, ibis, dune) | sand panels | rust-orange panels | gold piping, the gold collar and brooch | the dark inner suit |
| Aurora (orion, vesper, bastion) | purple panels | white panels | lavender and silver piping | the dark inner suit |
| Tempest (squall, gale, anvil) | green panels | black panels | gold piping, the gold brooch | the inner suit at the collar |

  The headset takes the key of the colour each of its parts is painted in,
  by the same table (a Solstice headset's white shell is main, its blue
  panel accent).
- Everything else exactly as it is: the face, skin, eyes, hair (also where it
  falls over the suit), the mouth, goggles, visors, circlets, headbands,
  scars, and every ink line.

Deliver `keyed/pilot-<name>.png` (1024 x 1024), fifteen of them, with a
contact sheet `keyed/contact.png` of all fifteen beside their originals.

### A1. The template (deliver these four, then stop and report)

Paint the template as four images, each made from the one before by painting
inside a region and leaving the rest unchanged:

| File | What it is |
|---|---|
| `trial/T1a-head.png` | The template head: **bald** (a smooth scalp, no hair or stubble), an oval face, neutral expression, eyes open looking toward the right edge, the visible ear, the neck going down to where the collar will be. No suit, no headset: below the neck, the background. |
| `trial/T1b-blank.png` | T1a with the **eyes, brows, nose and mouth painted out**: bare skin in their place, keeping the face's outline, the cheek and jaw line and the ear. (This is the face every part is painted on.) |
| `trial/T1c-suit.png` | T1a with the **pilot suit** painted below the neck: a high collar and the shoulders running off the bottom edge, the neck going into the collar. One suit for everyone, in the suit's colour key (main, accent, trim panels; under-suit at the collar's inside). A plain, strong design with large panels, like the pilots' suits. |
| `trial/T1d-headset.png` | T1c with the **headset**: the ear cup over the ear and the boom mic coming forward toward the mouth, as the pilots wear it, in the colour key (shell main, a trim ring, the boom under-suit dark). **No band over the top of the head** (hair goes over the skull; a band would have to sit on every hairstyle): the cup clips on behind the ear. |

The template's own eyes, brows, nose and mouth (in T1a) are the trial's
defaults, and its face is face shape 01, oval.

Report with a contact sheet of the four, and wait: the masks are made from
the approved template.

### A2. Masks (made for you once the template is approved)

`masks/` will hold a black-and-white PNG per kind of part (white: paint
here), 1024 x 1024, matched to the template: `eyes.png`, `brows.png`,
`nose.png`, `mouth.png`, `jaw.png` (the face shape: cheeks, jaw and chin,
below the eye line), `hair.png` (round the skull and down to the shoulders),
`facial-hair.png`, and one per extra as needed.

### A3. The trial parts

Each painted inside its mask on the template named, one image per part:

| Kind | Paint on | Mask | Files |
|---|---|---|---|
| Face shape | T1b | jaw | `trial/face-02-square.png`: a broad, angular jaw and a squarer chin. (Face 01 is the template.) |
| Eyes | T1b | eyes | `trial/eyes-01-sharp.png`, `trial/eyes-02-round.png`, `trial/eyes-03-heavy.png` (see the list in Stage B) |
| Nose | T1b | nose | `trial/nose-01-small.png`, `trial/nose-02-straight.png`, `trial/nose-03-broad.png` |
| Mouth | T1b | mouth | `trial/mouth-01-neutral.png`, `trial/mouth-03-grin.png`, `trial/mouth-06-shout.png` |
| Hair | T1c (the bald head in its suit, no headset) | hair | `trial/hair-01-spiky.png`, `trial/hair-02-long.png`, `trial/hair-07-ponytail.png` |

Three things the trial checks, so get them right:

- **Hair** covers the whole scalp (no bald patches at the edges), may cross
  the forehead down to the brows but not over the eyes, and falls where it
  would round the ear (the game draws the headset over it). Long hair may
  fall over the suit's shoulders.
- **A face shape** changes only the cheeks, jaw and chin, below the eye
  line. The skull, the ear and the top of the neck stay exactly as they are,
  so every hairstyle fits every face.
- **Eyes, noses and mouths** sit where the template's do, at its size, so
  any of them goes with any other.

Report with a contact sheet of the parts, and stop. The game puts them
together and checks them before Stage B.

## Stage B: the full set

The same way, on the same template and masks (trial parts that pass are
kept, under the same names in `parts/`). Each is one image unless said.

### Face shapes (5): paint on T1b, mask jaw

1. `face-01-oval`: the template (no new image).
2. `face-02-square`: broad, angular jaw, square chin.
3. `face-03-round`: soft, full cheeks, a short rounded chin.
4. `face-04-long`: long and narrow, a long chin, lean cheeks.
5. `face-05-heart`: wide cheekbones, a small pointed chin.

### Eyes (10): paint on T1b, mask eyes (both eyes, no brows)

1. `eyes-01-sharp`: narrow, the outer corners angled up: the series' hero.
2. `eyes-02-round`: large and open, friendly.
3. `eyes-03-heavy`: heavy-lidded, half closed, cool.
4. `eyes-04-squint`: narrowed, determined.
5. `eyes-05-cat`: upturned, catlike.
6. `eyes-06-gentle`: downturned at the outer corners, soft.
7. `eyes-07-intense`: wide, small irises, intense.
8. `eyes-08-tired`: shadows under them, lids low.
9. `eyes-09-almond`: balanced almond shape, defined lashes.
10. `eyes-10-deep`: deep-set under a shadowed brow ridge.

### Brows (6): paint on T1b, mask brows (in the hair colour key)

1. `brows-01-straight`: medium, straight.
2. `brows-02-arched`: thin, arched.
3. `brows-03-thick`: thick, straight.
4. `brows-04-angled`: angled down toward the nose: determined.
5. `brows-05-raised`: high and curved: curious.
6. `brows-06-short`: short, blunt, thick.

### Noses (5): paint on T1b, mask nose

1. `nose-01-small`: the series' small nose: a line and a shadow.
2. `nose-02-straight`: a straight, defined bridge.
3. `nose-03-broad`: broad, with wide nostrils.
4. `nose-04-aquiline`: a high, hooked bridge.
5. `nose-05-button`: small and upturned.

### Mouths (8): paint on T1b, mask mouth

1. `mouth-01-neutral`: closed, relaxed.
2. `mouth-02-smile`: a slight smile.
3. `mouth-03-grin`: a confident grin, teeth showing.
4. `mouth-04-smirk`: one corner up.
5. `mouth-05-gritted`: gritted teeth.
6. `mouth-06-shout`: open, calling out on the radio.
7. `mouth-07-frown`: turned down.
8. `mouth-08-full`: full lips, relaxed.

### Hairstyles (15): paint on T1c, mask hair (in the hair colour key)

1. `hair-01-spiky`: short and spiky, the series' young hero.
2. `hair-02-long`: long and straight, past the shoulders.
3. `hair-03-slicked`: slicked straight back.
4. `hair-04-buzz`: a buzz cut, close to the scalp.
5. `hair-05-swept`: medium, a side-swept fringe.
6. `hair-06-bob`: a bob with blunt bangs.
7. `hair-07-ponytail`: tied in a high ponytail, the tail behind the head.
8. `hair-08-wavy`: long and wavy.
9. `hair-09-undercut`: shaved sides, the long top swept over.
10. `hair-10-mohawk`: a mohawk.
11. `hair-11-locs`: locs, tied back.
12. `hair-12-curls`: a full, rounded mass of tight curls.
13. `hair-13-braid`: a long braid over the shoulder.
14. `hair-14-shag`: a messy medium shag.
15. `hair-15-bun`: a bun, a few loose strands.

### Facial hair (5): paint on T1a, mask facial-hair (in the hair colour key)

On the template's own face, so the beard leaves the mouth and nose clear
(the game draws the mouth over it).


1. `beard-01-stubble`: stubble on the jaw and upper lip.
2. `beard-02-moustache`: a moustache.
3. `beard-03-goatee`: a goatee.
4. `beard-04-full`: a full beard. **Paint this once on each face shape**
   (`beard-04-full-01` to `-05`), as it follows the jaw: on the bases
   `bases/face-0N-features.png` (each face shape with the template's
   features), which come with the Stage B masks.
5. `beard-05-chinstrap`: sideburns running into a line along the jaw.

### Extras (8): paint on T1a (the masks come with Stage B)

"The near eye" and "the near cheek" are the ones nearer the viewer: on the
left of the face as we see it, on the ear's side.

1. `extra-01-visor` (over the hair): visor glasses, a thin gold rim, **clear
   lenses** (the rims only: the eyes behind are the game's to draw).
2. `extra-02-circlet` (over the hair): a metal circlet across the forehead.
3. `extra-03-eye-scar` (on the skin): a scar across the near eye's brow and
   cheek, the eye itself left as it is.
4. `extra-04-cheek-scar` (on the skin): an X-shaped scar on the near cheek.
5. `extra-05-face-paint` (on the skin): two stripes of face paint under the
   near eye.
6. `extra-06-bandage` (on the skin): a bandage across the bridge of the nose.
7. `extra-07-freckles` (on the skin): freckles across the nose and cheeks.
8. `extra-08-eyepatch` (over the hair): an eyepatch over the near eye, its
   strap running back over the hair.

## Delivering

- Into this folder on the branch `art/portraits`: the keyed pilots in
  `keyed/`, Stage A in `trial/`, Stage B in `parts/`. Commit and push there; do not merge it.
- With each stage, a contact sheet (`trial/contact.png`, `parts/contact.png`)
  of everything delivered, small, labelled with the file names.
- Leave the game's code alone, and any changes on the branch you did not
  make.
- Report: what was made, anything that would not come out as asked, and for
  Stage A, whether your tool kept everything outside each mask unchanged.
