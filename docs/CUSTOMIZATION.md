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
within a frame, designs share a mechanical joint contract. Their authored
armour and accessory sockets can differ, so rigid modules are seated against
the selected receiving surfaces. The Sunhawk also has different body lengths: it was built on a skeleton of its own (shorter thighs, longer
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
| Head | `head` | `head`, plus head-owned fixed enclosure pieces on `chest` (Maul cowl/teeth and Sobek nape) |
| Shoulders (a pair) | `shoulders` | the shoulder armour on `shL` and `shR` (outboard of and above the shoulder joint), and the Sunhawk's `towerL`/`towerR` |
| Chest | `chest` | `chest`, except what is on its back |
| Back thrusters | `backpack` | `wingL`, `wingR`, and the pieces on the back of `chest` (the tag keeps its first name; the game calls it Back thrusters) |
| Waist | `waist` | `spine` (it varies little within a frame: the game may fold it into Hips) |
| Hips | `hips` | `hips`, `skirtL`, `skirtR`, `skirtBack`, `skirtFront` where authored |
| Left arm | `armL` | the upper arm on `shL` (the shoulder bearing and the shell down to the elbow), `elL`, `wrL` |
| Right arm | `armR` | the same on the right: `shR`, `elR`, `wrR`; it carries the weapon (modelled into the right hand), always the same kind of weapon within a frame |
| Thighs (both legs) | `thighs` | `hipL`, `hipR` |
| Shins (both legs) | `shins` | `kneeL`, `kneeR`, with the knee armour and the calf thrusters |
| Feet (both legs) | `feet` | `ankleL`, `ankleR`: the skates |

Each arm is set on its own; the hangar links them by default (one choice
sets both, and they can be unlinked). The shoulders, thighs, shins and feet
are each one choice for both sides.

### Accepted roster production sources (31 October 2026)

The accepted roster is the fifteen production designs, each at three levels of
detail. Its standalone Blender sources, exporter, manifests and verification
are in `art/blender/roster/production/`. Historical experiment pages, supplied
textured models and reconstructed-base alternatives are not shipped. See that
package's README before editing or exporting; the earlier procedural exporters
below describe the first parts/insignia pass and must not overwrite these assets.

All accepted armour uses solid paint slots. The legacy `source_texture_schema=1`
extra now signals authored rigid fittings; it does not mean the model is textured.
`fittings_json` contains accessory joints, weapon/number/hand/heel anchors and
reviewed mounting interfaces. `main_thrusters_json` and `calf_thrusters_json`
include physical outlets/rotations and separate `effectWidth`/`effectLength`,
so nozzle geometry does not accidentally shrink an approved exhaust effect.

`nativeMounts.ts` samples the head's narrow bearing and the torso's matching
surface, and a backpack's central saddle against the receiving chest. It moves
the complete rigid module, including ink, decals, accessories and emitters.
The same LOD0-derived seat is used for all detail levels; stock assembly keeps
its authored position. Reviewed hidden-neck insertion/capacity and waist-axis
metadata handle differing sockets. The sole reviewed donor-specific exception
is Fujin on Daystar (`headSeatOffsets.fujin=-0.08` metres).

Maul's cowl and both tooth rows travel with the head customization slot but stay
rigidly attached to the chest during head rotation. Back fins, wings and rings
travel with the backpack; Longbow's helmet halo/plume are head-owned.

Retained procedural warning/emblem decals are captured in the small
`assets/roster/prepared-markings.json` cache. Their joint/part ownership and
transforms are authored data, cloned for each assembled mech and recoloured
with its team's atlas. Production does not load the old reference models to
reconstruct them. Modelled faction insignias still use the separate replacement
contract below. The production tests cover both paths, all fifteen designs,
all three LODs, four engines per design, and same-frame mounting combinations.

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

### Faction insignias

A part never carries a faction's insignia of its own: the insignia a mech
wears is the faction it flies for. Most designs already wear theirs as a
marking (the team emblem decal on a shoulder, an arm or a thigh, drawn from
the team's markings sheet), which follows the team wherever the part goes.
A few have it modelled into the armour:

| Design | Insignia | Part |
|---|---|---|
| Seraph, Longbow, Paladin | Aurora's sigil: `sword sigil`, `sword guard`, the six `sigil feather`s | chest |
| Kamaitachi, Fujin, Raijin | Tempest's bolt: `centred chest bolt` | chest |
| Kamaitachi, Raijin | `centred shoulder bolt`, each side | shoulders |
| Fujin | `shoulder lightning`, each side | shoulders |
| Sunhawk | the lettering "SOLSTICE" and "SOL / S1" in its painted details | (the game redraws it for the team) |

These are design, not insignia, and stay: the dark storm shield behind
Tempest's bolt (the plate the badge sits on), Tempest's lightning veins on
the greaves and Fujin's along its sash, Mirage's sun discs, collars and
medallions, Vanta's chevrons, Solstice's diamond and gold crests.

**The export**: each modelled insignia is its own mesh (and its own ink),
tagged `insignia` (an id for the badge: `chest`, `shoulderL`, `shoulderR`),
and the model's root lists, for each, where a team's emblem goes in its
place (`insignia_json`: the joint, the part, the centre, the outward normal,
the upright direction and the width, joint-local, in the game's axes). The
stock models do not change.

**The game** (built): a part flown by its own faction keeps its modelled
insignia (a stock mech always does); on any other faction's mech it is left
off, armour and ink, and the team's emblem is put where it was
(`render/mech/insignia.ts`). The emblem comes from the team's markings sheet
(the drawn one, or the anime look's painted one), laid over the armour the
badge sat on so it follows its shape (only armour facing out as the badge
does, and nothing in front of the badge's face, takes it), in the team's trim,
or its main colour or accent where the trim would not show on that armour.
`node tools/custom-check.mjs` checks every build keeps or replaces each
insignia as it should, with an emblem for each one replaced.

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
- A head sits on another design's chest as the chest's top takes it
  (below, "Heads on other chests").
- The pose fitting follows the chest (the Sunhawk's, or the roster's with
  the backpack's fin spread).
- Markings flip light or dark with each part's main paint, so they read on
  any colour; they stay in the team's colours, as the number does.
- Built for the hangar in about a tenth of a second (more for a mech of
  many designs); a change rebuilds it once changes settle.

**Heads on other chests**: the designs of a frame share its skeleton, so
every head hangs from the same point on the chest; but their chests' tops
and their heads' necks differ (Razor's low head sinks deep into a chest cut
away at the front for it; Seraph's chest is one tall plate that takes a head
only a little way), so a head on another chest could vanish into it or stand
clear of it. Each head is set down on the chest from above until its neck
(what is under its pivot, 0.3 m across and along; not its sides, which may
hang lower, like Anubis's headdress) touches the chest's top, then sunk into
it as far as the shallower of the two allows:
as far as the head sinks into its own chest, and as far as the chest's own
head sinks into it. (A chest's top is its highest surface under the head
below 0.6 m over the neck, so a cowl arching over the head is not its top.)
On its own chest a head sits where it always has. `npx tsx
tools/head-seats.ts` works this out from the models for every pair and
writes `render/mech/headSeats.ts` (run it again when the models change;
`--check` says whether the table is up to date); the mech viewer's
`?debug=mechs&role=0&heads=3` shows a chest with each head of its frame.

**The hangar**: the Mech row (your custom mech of the frame, or the stock
one of the faction you fly for), Customize (made from the stock mech in
view the first time) and the editor: Parts (each slot, both arms at once or
each), Paint (the whole mech or any part; a part's colours it does not have
are locked; a swatch grid to pick by sight), the name, start again from
stock, delete. In the editor the mech stands still in the bay and the right
stick (across) or a drag over the bay turns it. A swatch grid, like the
Pilot screen's portraits, is picked from by a click or a tap, or with A on
its row: the arrows then move through the grid in both directions, each
cell going on as they land on it, A keeps it and B puts back what was on
(`Menus.grid`). A change shows in place: only the values it touches are
redrawn, and a screen drawn again where it stands does not switch its panels
on again. Your custom mech races in every mode, offline and online:
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
  always the player's callsign. A Sprint (DESIGN.md, "Sprint") is always
  raced in the custom Forward, flown or not, made from the faction's stock
  Forward the first time it is needed; its setup has Edit for it.
- **A colour**, worn where the pilot flies for no faction (a Sprint): the
  mech's lights, the name plate, the running order and standings, the
  room's seat. One of ten (`PILOT_COLOURS` in protocol.ts), picked on the
  Pilot screen; until then the portrait's background's (`portraitColour`).

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
