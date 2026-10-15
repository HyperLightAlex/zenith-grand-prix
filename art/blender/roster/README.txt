ZENITH GP — ROSTER PRODUCTION PASS

14 units: Daystar, Rampart, Razor, Stinger, Maul, Anubis, Horus, Sobek,
Seraph, Longbow, Paladin, Kamaitachi, Fujin and Raijin.
The attached Swift sheet describes Sunhawk, which already has its own assets.

Open review.html for the comparison gallery. Every card also links to the
live comparison at localhost:4173. The dev server can serve the gallery at
http://127.0.0.1:5173/art/blender/roster/review.html .

IN GAME
N / Other mech designs: updated Blender assets versus original code-built models.
B / Sunhawk design: existing independent Sunhawk comparison.
Armor finish: clean surfaces or procedural panel lines on all imported models.
G: anime/plain rendering. Existing decals, glow, damage flash, weapons,
thrusters and animation anchors are retained.
URL overrides: ?roster=updated or ?roster=current. Selection persists locally.

ART DIRECTION
Reference equipment, faction palettes and motifs are retained. Stinger's
head has a compact angular mask, recessed paired eyes and joined cheeks
beneath its original crest. Long
armor shells have shaped chamfered sections, broader readable surfaces,
small edge radii and weighted normals. Light frames remain slender;
defenders retain their broader stance. Added bearing covers, rear armor,
layered midfielder knees and defender wrist guards improve the transitions.
Sobek has broad planar bracers; Paladin retains curved tower shields.
Hands have inward thumbs, mirrored finger lengths, rearward curls and
forward dorsal armor. Held weapons follow the corrected palms. Maul retains
fang knuckles, Paladin silver gadlings, and other defenders faction guards.
Daystar, Rampart, Razor, Stinger, Maul and Anubis fins spread outward
through boost/victory.

UPDATED ART-SHEET POLISH
Daystar, Rampart, Razor, Stinger, Maul, Anubis, Horus and Sobek now use the
eight supplied updated sheets, saved as art/model-sheets/refs/ref-ID-updated.png.
Sunhawk remains the approved finish reference. Original code-built models
remain available with N. Aurora and Tempest also incorporate their updated sheets.
sheet_polish.py contains the additional geometry and is loaded by build_roster.py.

The eight units have more deliberate knee/shin shapes and seated small details.
Daystar has one mirrored swept fin pair and a retained central stabilizer.
Daystar and Stinger use consistent right-hand carbines with palm grips and
barrels aligned to the existing firing anchors. Stinger's mask and Anubis's
jackal face have paired symmetric eyes. Anubis gains curved gold-edged blades,
copper calf fins and twin toe claws. Rampart gains broader greaves and fitted
blue shin panels; Razor sharper knee shields; Maul more substantial gauntlet
hardware. Horus retains his staff and feather silhouette; Sobek's new bracers
follow the updated sheet. Conflicting generated-art views resolve to one
physical, symmetric assembly rather than changing between views.

The gallery includes the supplied sheets, four-angle views and previous-pass
captures for these eight. previews/sheet-polish stores these additional views.

AURORA ART-SHEET PASS
Seraph, Longbow and Paladin also use supplied updated sheets. Their additional
authoring is in aurora_polish.py: sculpted pearl breastplates, articulated
abdominal lames and split tabards, pointed knee armor, contoured greaves,
vambraces and raised pearl sabatons. The original halos and faction identity
remain, with the same joint lengths and wheel contacts.

Seraph has a pointed pearl face, tall central crest and five swept feather
plates on each wing, with mirrored inlays on both faces. Its paired rapier
bracers remain the forward loadout. Longbow has one right-hand ranged rifle
with an open muzzle and retains the left snare launcher. The extra arm blades
in the generated concept are intentionally omitted. Paladin retains its
great helm, tower shields and defender equipment with heavier gauntlet faces.
The three source blends include their new reference sheets. The gallery
provides the same art/previous-pass/turnaround/motion views for Aurora.

TEMPEST ART-SHEET PASS
Kamaitachi, Fujin and Raijin use the three supplied sheets, saved alongside
the other updated references. tempest_polish.py authors sculpted emerald
armor, dark gold-edged chest shields, centred lightning, wrapped abdominal
lames, articulated jagged skirts, pointed skates and gold knee armor.
Kamaitachi gains paired swept crescents, gold-edged forearm blades and calf
turbines. Fujin gains a sculpted wind arch, rear streamers, round shoulder
turbines, a centred rear number and one storm rifle aligned to the original
firing anchor; his left snare remains. Raijin retains the thunder-drum halo,
lightning rods and scatter cannon with a horned menpo and coiled gauntlets.

AI-sheet offsets are resolved into mirrored armor and centre-aligned lights.
Thin lightning meshes are projected onto their actual armor planes. All three
retain the existing main nozzle geometry, rebuilt mounted calf bells and
shared physical/effect outlet metadata. Original models remain unchanged.
The same comparison, previous-pass, art-sheet, turnaround and pose views are
available in the review gallery. Export retries also restore the Blender
scene safely when rebuilding the currently active generated model.

ATTACHMENT CORRECTIONS
All fourteen units have continuous internal shafts and overlapping joint
seats at the waist, neck and limb seams. These close the daylight gaps while
preserving the existing narrow silhouettes and articulated armor.
Calf jets are rebuilt against the actual shin surface with embedded mounts.
Their bells angle slightly down from the rear of the leg; exported outlet
positions and rotations drive the runtime flame anchors at every LOD.
Side chest vents on Daystar, Rampart, Maul and Sobek are seated within the
chest plate. Maul's hip spikes now meet the supported side armor.
previews/attachments contains close-ups and four-angle inspection captures.

SOURCE AND EXPORTS
Each MODEL-production.blend is independently editable with separate rigid
parts, named joint empties, non-destructive bevel/normal modifiers, a review
camera, lights and the embedded supplied reference image.
Game coordinates: +Y up, +Z forward, +X mech's left.
Blender coordinates: +Z up, -Y forward. No negative-scale mirrors at runtime.
The game uses rigid joint attachment, not a deforming skin.

source/*.json captures the original component geometry, dimensions and joint
positions before refinement. To deliberately recapture an original:
  node tools/roster/capture.mjs daystar
The script explicitly selects the preserved original designs.

To regenerate a model in the connected Blender Python environment:
  from pathlib import Path
  MODEL = 'daystar'
  exec(compile(Path('/Users/alexanderkelley/Projects/igpx/art/blender/roster/build_roster.py').read_text(), 'build_roster.py', 'exec'))
Adjust ROOT in build_roster.py if the repository moves. The script only
replaces its own generated scene for MODEL; it does not edit Sunhawk.
Regeneration replaces manual edits to that model's generated file: save a
separate artist copy before hand editing, or transfer the edits to the script.

Outputs: src/client/render/mech/assets/roster/MODEL.glb, -lod1.glb, -lod2.glb.
Each GLB has joint/paint-slot metadata and authored normals. Per-model
manifests record actual triangles and byte counts. LOD1 is about half the
triangles, LOD2 about one quarter; the game selects them by screen size.
Sunhawk's outline/glow treatment and clean-panel option are reused.

VALIDATION
tests/roster-assets.test.ts loads all 42 real GLBs and checks complete joint
contracts, finite geometry, normalized normals, LOD reduction, mirrored
fingers, hand orientation, skate targets and continuous pose fitting.
It also checks tall rear fins stay on their own side of the helmet, mirrored
face lights and Daystar fins, and the new carbine bores at the firing anchors.
previews contains final standing comparisons and boost/guard/victory checks.
These are a first integrated roster polish pass, not new concept sheets.
The original builders are unchanged; physics and race balance are unchanged.

Commands: npm test; npm run build; npm run build:single.
Gallery regeneration: node tools/roster/review.mjs .
