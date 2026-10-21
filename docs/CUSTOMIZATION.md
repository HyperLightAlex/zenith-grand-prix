# Mech customization

Players make their mech their own without changing how it plays: paint,
parts swapped between designs of the same frame, and a pilot portrait.
Nothing here reaches the simulation (factions already do not: every
faction's frames have the same stats), so none of it needs balancing.

| Feature | Status |
|---|---|
| The pilot profile | begun: your callsign and portrait, worn by your seat everywhere, and the Pilot screen (below: "The pilot profile") |
| Swappable parts | built: the hangar's editor, your custom mech raced in every mode, offline and online (below: "The game's side") |
| Paint catalogue (each part paintable) | built: 33 paints and 9 metals, the whole mech and any part; one open question (below) |
| Pilot portraits | the gallery is the fifteen faction pilots; more, and recolouring, to come |
| Gameplay customization (tuning, loadouts) | not planned for now |

## Parts

Parts swap only between designs of the same frame: Swift with Swift,
Vector with Vector, Bulwark with Bulwark. That is where swapping works:
within a frame, the roster's designs share one skeleton (every bone length
and joint position is equal across them), so a part from one lands on
another's joints exactly, with no fitting or scaling. The Sunhawk is the
exception: it was built on a skeleton of its own (shorter thighs, longer
ankles, narrower shoulders, shorter upper arms, taller overall). So a custom
mech stands on a skeleton made from its parts: each length comes from the
part whose armour spans it (the thighs' length from the thighs, the
shoulders' and neck's sockets from the chest, each arm's from that arm), and
the Sunhawk's parts mix with the other Swifts' as they do with each other.
Across frames the skeletons differ far more (a Bulwark's shoulders are half
again as wide as a Swift's), and nothing would fit.

| A length | Comes from |
|---|---|
| thigh, shin, ankle (and so the hips' height) | thighs, shins, feet |
| the hips' width and drop | hips |
| the waist (spine and chest heights) | waist |
| the shoulders' and the neck's sockets | chest |
| upper arm and forearm | each arm |

| Frame | Designs |
|---|---|
| Swift | Sunhawk, Razor, Anubis, Seraph, Kamaitachi |
| Vector | Daystar, Stinger, Horus, Longbow, Fujin |
| Bulwark | Rampart, Maul, Sobek, Paladin, Raijin |

### The slots

| Slot | Tag | What it is (joints) |
|---|---|---|
| Head | `head` | `head` |
| Shoulders (a pair) | `shoulders` | the shoulder armour on `shL` and `shR` (outboard of and above the shoulder joint), and the Sunhawk's `towerL`/`towerR` |
| Chest | `chest` | `chest`, except what is on its back |
| Backpack | `backpack` | `wingL`, `wingR`, and the pieces on the back of `chest` |
| Waist | `waist` | `spine` (it varies little within a frame: the game may fold it into Hips) |
| Hips | `hips` | `hips`, and the Sunhawk's `skirtL`, `skirtR`, `skirtBack` |
| Left arm | `armL` | the upper arm on `shL` (the shoulder bearing and the shell down to the elbow), `elL`, `wrL` |
| Right arm | `armR` | the same on the right: `shR`, `elR`, `wrR`; it carries the weapon (modelled into the right hand), always the same kind of weapon within a frame |
| Thighs (both legs) | `thighs` | `hipL`, `hipR` |
| Shins (both legs) | `shins` | `kneeL`, `kneeR`, with the knee armour and the calf thrusters |
| Feet (both legs) | `feet` | `ankleL`, `ankleR`: the skates |

Each arm is set on its own; the hangar links them by default (one choice
sets both, and they can be unlinked). The shoulders, thighs, shins and feet
are each one choice for both sides.

### The export contract

Every exported armour mesh and every ink-line mesh carries a `part` extra:
one of the tags above. Export groups by joint, part and paint slot (it
grouped by joint and slot), so a joint that carries two parts (`shL`,
`shR`, `chest`) exports one mesh per part per slot, and one line mesh per
part:

- armour: object `joint/part/slot`, extras `joint`, `part`, `slot` (the
  Sunhawk's export: `joint_part_slot`)
- ink lines: object `joint/part/LINES`, extras `joint`, `part`,
  `ink_lines` (the Sunhawk's: `joint_part_LINES`)

Everything else stays as it is: the root's `roster_schema`, `dims`,
`calf_thrusters_json` and `ink_schema`, the slots, the LODs, the outline
attributes and the ink rules. The game already takes several meshes and
line sets per joint, and ignores `part` until the parts code reads it.

**Nothing moves.** The stock models must come out the same: for each design,
each level of detail and each joint, the triangles (positions, normals,
outline normals, widths) and the ink segments are the same as before, only
grouped differently. Check it as the clean-ink pass did (the expanded
triangle streams, compared joint by joint).

**Which pieces are which.** Only two joints carry two parts. The rule is
applied to each source piece (each Blender object, including those the
polish scripts add), by the centre of its bounding box in joint-local
coordinates. In the game's axes (+Y up, +Z forward, +X the mech's left);
Blender's are (x, -z, y) of these:

- on `chest`: behind z = -0.75 is `backpack`, the rest `chest`
- on `shL`/`shR`: outboard of |x| = 0.3, or above y = 0.1, is `shoulders`;
  the rest (the bearing at the joint and the shell down to the elbow) is
  `armL`/`armR`

These are a start, not the answer. Tried on the captured source pieces
(`source/*.json`, before the polish passes), they split most pieces cleanly,
but some sit near the lines and need a look. On `chest`: upper-back plates and
collars at z -0.4 to -0.72 on Anubis, Kamaitachi, Razor, Seraph, Sobek,
Stinger and Maul. On the shoulders: pieces at |x| 0.2 to 0.4 or y 0 to 0.2 on
Anubis, Horus, Longbow, Seraph, Razor, Stinger, Maul, Rampart, Fujin,
Kamaitachi and Raijin. The Tempest designs' shoulder shields and turbines
come from the polish passes. Decide each by eye: a piece belongs where it
looks fixed to. A collar that frames the head is chest, a plate on the
pack is backpack, a trim band round the upper arm is arm. Record every
piece the rule gets wrong in
`art/blender/roster/part-overrides.json`, by design and by a name that
survives a rebuild, with the reason, so the next rebuild keeps it. Keep
these out of the generated files, as with `ink-overrides.json`.

**Review pictures.** For each design (and the Sunhawk), render front, back
and three-quarter-rear views with each part in its own flat colour, into
`art/blender/roster/previews/parts/`. Every piece must be in the slot it
looks part of, with nothing floating.

**Tests.** In `tests/roster-assets.test.ts`:
- every mesh and line set has a valid `part`;
- every joint's parts are the ones the table allows it;
- every design has every slot, except that a design may have no backpack
  (say which).

### The game's side

**A build** (`src/custom/mechBuild.ts`, shared with the server): a design
for each slot (its place in the frame's list, which is its faction), the
mech's paint scheme, any part's own paint, and a name. It travels and is
kept as a short line of text (`c1/<parts>/<paint>/<own>/<name>`), which
reads back only if it is exactly as written. A seat carries one as
`look` ('' for the stock mech), as it does a portrait.

**Building one** (`render/mech/customFrame.ts`): the stock mechs are built
as they always were; a custom one is assembled.

- Each part's armour and ink come from its design's model (the part tags),
  each in its own paint.
- Each part's fittings (markings, thrusters, the race number, the calf jets
  on their nozzles, the hands, the muzzle) come from its design, built as
  usual without its armour, and are moved across: the design's code
  builder and the roster's own touches (`rosterAnchors`: the limbs'
  thickness, the moved markings) put them where that design has them. A
  fitting on a joint that carries two parts goes with the part it sits on
  (the nearest).
- The rig's own pieces follow their parts: the elbows' and wrists' places
  and the hands from each arm, the muzzle from the right arm, the fins'
  roots from the backpack, the heels from the feet, the skirts' hinges
  from the hips, the Sunhawk's towers with its shoulders.
- The pose fitting follows the chest (the Sunhawk's, or the roster's with
  the backpack's fin spread).
- Markings flip light or dark with each part's main paint, so they read on
  any colour; they stay in the team's colours, as the number does.
- Built for the hangar in about a tenth of a second (more for a mech of
  many designs); a change rebuilds it once changes settle.

**The hangar**: the Mech row (your custom mech of the frame, or the stock
one of the faction you fly for), Customize (made from the stock mech in
view the first time) and the editor: Parts (each slot, both arms at once or
each), Paint (the whole mech or any part; a part offers only the channels
its design has; a swatch grid to pick by sight), the name, start again from
stock, delete. Your custom mech races in every mode, offline and online:
a room is told the mech you fly in each frame, checks each, and seats you
in it (docs/ONLINE.md).

**Checks**: `tests/custom-mech.test.ts` (the catalogue, the text, the
profile); `node tools/custom-check.mjs` builds every part of every design on
every other design of its frame in a browser and checks each for armour on
every joint at every level of detail, its ink, markings, thrusters and
muzzle.

**Next**: the parts screen turning the camera to the part being edited.

## Paint

A catalogue of 33 paints and 9 metals (`PAINTS`, `METALS` in
`custom/mechBuild.ts`), each with its own shadow colour (the anime look
shades each paint with a colour mixed for it, not the paint darkened:
`Livery.shades` in `palette.ts`). The factions' own come first, exactly as
their liveries have them; the rest were mixed by the same rule (about two
thirds the lightness, the hue turned up to 22 degrees toward violet, the
light ones greyed more) and set by eye. A mech takes three paints (main,
accent, trim) and a metal for its frame (bare metal is shaded as metal; a
paint there reads as plastic), which the inner frame and the dark parts
follow; each part can take its own. Team colours stay on what
tells the teams apart: the glow, the trails, the lock-on markers and the
HUD.

A custom mech keeps its paint on any team (the pilot profile follows the
player from faction to faction, so a paint tied to one faction would mean
repainting at every change of team); what tells the teams apart is the team
colour on the glow, the trails, the markers, the HUD and the team's emblem
decal.

Open: whether the computer pilots on the player's team wear the player's
paint.

## Pilot portraits

A gallery of pilots: the fifteen faction pilots now, and more painted the
same way (through `art/faction-sheets`), each painted for recolouring (hair,
flight suit) as the effects are. Until there are more, a player may wear
the face of one of the computer pilots racing beside them.

## The pilot profile

Each player has one pilot, kept on the device until there are accounts:

- **A callsign and a portrait**, worn by the player's seat everywhere it
  shows, offline and online: the hangar's card, the radio, the target
  panel, the results, the room's seats and the squad's bays. The computer
  pilots keep their factions' names and faces (and a demo race keeps the
  faction pilot on the player's seat, so captures repeat). The game makes
  up a callsign and picks a portrait on the first run, so nobody is held
  up before their first race; Online asks for a callsign the first time,
  offering the made-up one.
- **Up to three custom mechs, one per frame** (parts and paint). In the
  hangar, each frame offers the stock mech of the faction being flown, or
  the player's custom mech of that frame. Custom mechs race in
  every mode. A custom mech may be named; the pilot shown with it is
  always the player's callsign.

Online, the pilot goes with the seat (as the faction and frame do); the
server accepts only a valid callsign and catalogue entries, and a room or
squad hears a change at once (the `pilot` message), a race already begun
keeping the old. Custom mechs will need an export/import code, so a pilot
survives cleared browser data, until there are accounts.

**Built so far**: the callsign and portrait (`net/identity.ts`, kept as
`zgp.pilot` beside `zgp.callsign`, with the custom mechs: each frame's as
text, and whether it is flown); the Pilot screen off the hangar
(`ui/screens/pilot.ts`) and the editor (`ui/screens/custom.ts`); seats and
mechs carry a `portrait` (an index into the gallery, `PORTRAITS` in
protocol.ts, or -1 for the faction pilot) and a `look`; rooms and squads
carry each person's portrait. See docs/ONLINE.md for the wire.
