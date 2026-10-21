# Mech customization

Players make their mech their own without changing how it plays: paint,
parts swapped between designs of the same frame, and a pilot portrait.
Nothing here reaches the simulation (factions already do not: every
faction's frames have the same stats), so none of it needs balancing.

| Feature | Status |
|---|---|
| Swappable parts | the models' part tags are being added (below: "The export contract"); the game side follows |
| Paint catalogue (each part paintable) | planned; two open questions (below) |
| Pilot portraits | planned: a gallery, recolourable |
| Gameplay customization (tuning, loadouts) | not planned for now |

## Parts

Parts swap only between designs of the same frame: Swift with Swift,
Vector with Vector, Bulwark with Bulwark. That is where swapping works:
within a frame, every design has exactly the same skeleton (every bone
length and joint position is equal across the five designs), so a part from
one design lands on another's joints exactly, with no fitting or scaling.
Across frames the skeletons differ (a Bulwark's shoulders are half again as
wide as a Swift's), and nothing would fit.

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

### The game's side (after the tags)

- Build a mech from a choice per slot (a design id per slot, within the
  frame). A stock build is today's model exactly.
- The per-design touches move from the design to the part:
  - limb thickness (`ROSTER_GAINS`: elbows with the arms, hips with the
    thighs, knees with the shins), which places the muzzle and markings;
  - the fin spread (`fitRosterPose`) with the backpack;
  - the moved markings (Kamaitachi, Fujin and Raijin) with their parts;
  - the calf thrusters with the shins.
- The Sunhawk joins the Swifts (its towers, skirts and detail meshes).
- Tests: every slot of every design on every other design of its frame, at
  every level of detail, with valid ink and weapon anchors.
- A review of mixed builds in both looks, from in front and behind: where
  two designs meet (the joint housings cover most seams).
- The hangar: a parts screen (the slot list, the preview turning to the
  slot being edited, reset to stock); the build saved per frame in the
  profile; sent with the seat online and checked by the server.

## Paint

A catalogue of paints, each with its own shadow colour (the anime look
shades each paint with a colour mixed for it, not the paint darkened:
`Livery.shades` in `palette.ts`), about 24 to 36 of them, picked from a
swatch page in both looks. A mech takes four paints (primary, secondary,
trim, frame), and each part can take its own. Team colours stay on what
tells the teams apart: the glow, the trails, the lock-on markers and the
HUD.

Open: free paint for everyone, or within the faction's family of colours;
and whether the computer pilots on the player's team wear the player's paint.

## Pilot portraits

A gallery of pilots (the fifteen there are, and more painted the same way,
through `art/faction-sheets`), each painted for recolouring (hair, flight
suit) as the effects are, with the player's callsign. Shown where the
pilots are now: the comms cut-ins, the target panel, the results and the
hangar.

## The profile

One record per player: the paint, the parts per frame, the portrait and
the callsign. Kept on the device until there are accounts. Online, sent
with the seat (as the faction and frame are now); the server accepts only
catalogue entries. The computer pilots keep their factions' stock mechs.
