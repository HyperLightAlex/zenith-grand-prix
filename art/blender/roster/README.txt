ACCEPTED ROSTER RELEASE EXPORT — 31 OCTOBER 2026
The current approved roster and updated Sunhawk are now authored/exported by
art/blender/roster/production/README.txt. Use that standalone package for release
changes. The procedural exporter documented below is historical; running it on
production paths would replace the approved hybrids with the earlier designs.
The preserved current-A Sunhawk comparison remains unchanged.

ZENITH GP — ROSTER PRODUCTION PASS

14 units: Daystar, Rampart, Razor, Stinger, Maul, Anubis, Horus, Sobek,
Seraph, Longbow, Paladin, Kamaitachi, Fujin and Raijin.
The attached Swift sheet describes Sunhawk, which already has its own assets.

INSIGNIA
Exported with Blender 5.2.2 LTS (d13f752e3b9c, built 2026-09-15).
docs/CUSTOMIZATION.md, "Faction insignias", is the specification.
insignia_tags.py runs after every polish script and the part classifier. It
matches exact stable part_source names, never Blender's global .001 suffixes:
  Seraph / Longbow / Paladin: Aurora / sword sigil, Aurora / sword guard,
    and Aurora / sigil feather [1..6] -> one chest insignia (8 pieces each;
    the first feather has no numeric suffix in its actual part_source).
  Kamaitachi / Fujin / Raijin: Tempest / centred chest bolt -> chest.
  Kamaitachi / Raijin: Tempest / centred shoulder bolt on shL/shR ->
    shoulderL/shoulderR. Fujin uses Fujin / shoulder lightning instead.
There are 33 named source pieces forming 12 badges on six designs. Missing,
duplicate or incompatible source matches fail a rebuild. The other eight
roster designs export an empty anchor list. Sunhawk is not rebuilt or edited:
its painted lettering remains the game's responsibility.

Ordinary armour and ink retain joint/part/slot and joint/part/LINES names.
An insignia is partitioned again by paint slot, with these names and extras:
  joint/part/slot/insignia-ID: joint, part, slot, insignia.
  joint/part/LINES/insignia-ID: joint, part, slot=D, insignia, ink_lines=1.
The existing line_kinds and _LINE_KIND attributes are retained. A badge with
no authored ink has no line mesh; LOD2 has no ink anywhere. Insignia grouping
never adds or removes strokes. In particular, Tempest's glow bolts retain
their existing ink exclusion. Original joint/paint weld representatives and
joint-wide first-occurrence ink deduplication/effective categories are kept
BEFORE the new partition, so regrouping cannot alter the rendered streams.

Every roster root carries insignia_json, a JSON list of entries with id,
joint, part, center, normal, up and width. Coordinates and vectors are in
joint-local game axes (+Y up, +Z forward, +X the mech's left); width is the
side of a square covering the badge. Anchors are computed once from the
full-detail seated geometry, then copied unchanged to all three LODs and the
manifest. The production Blender scene keeps the same JSON for review.
The helper fits the supporting armour's front surface using a symmetric 5x5
sample, avoiding a chiral lightning bolt biasing its own mounting normal.
It projects game +Y into that tangent plane for up, centres the evaluated
LOD0 badge bounds in the plane, and intersects the visible badge relief for
the final surface centre. Width is the larger projected span plus 2% margin.
All twelve centres hit their visible badge surfaces; no negative-space
fallback was needed. Source insignia_anchor_method records this decision.

The dark Tempest shield, greave/sash lightning, Mirage discs/collars/medallions,
Vanta chevrons and Solstice diamonds/crests stay in ordinary armour groups.
No gameplay source or Sunhawk file is part of this pass.

Review/rebuild (from the repository root):
  1. Rebuild the fourteen roster models with build_roster.py as documented
     below. Do not run Sunhawk's exporter for this pass.
  2. Run Blender --background --python art/blender/roster/review_insignia.py -- --all
     using the absolute installed Blender/script paths as needed.
  3. Open previews/insignia/index.html. Front and three-quarter pictures
     highlight source badges and show the square footprint, centre cross,
     outward normal and upright arrow. Inspect their attachment, orientation,
     coverage and the untagged design motifs. Review colours/guides are never
     saved into production files. Per-model JSON records all source names and
     exact anchors; audit.md records the visual decisions.
  4. Run:
     node tools/parts-compare.mjs --baseline aee1fbd558c49ee644814d9e12ff232724e4fc45 --allow-root-extra insignia_json --report art/blender/roster/previews/insignia/triangle-equivalence.json
     This is the same expanded triangle/ink comparison as the parts pass.
     It permits only the newly added insignia_json root extra; every existing
     root contract and every triangle/ink attribute must remain EXACT.
  5. Run npm test and npm run build. Change scripts to correct a decision;
     never hand-edit generated GLBs, manifests or production libraries.

Insignia-pass validation: all 42 roster GLBs and the three unchanged updated
Sunhawk GLBs pass 885 joint/LOD comparisons with zero attribute delta. Every
tracked Sunhawk source/export file is byte-identical. All 12 badges retain
armour at every LOD; Aurora's 12 authored badge ink segments per design occur
at LOD0, while LOD1/2 and Tempest badges have no authored badge ink. The tests
also check independent exported-badge coverage/centering, paint-slot groups,
required badge ink and exact anchor equality across LODs. npm test passes
1,148 tests in 42 files; npm run build passes typechecks and both builds.
The review gallery has 28 whole-model views and 12 anchor closeups, plus
per-design source/anchor inventories. No specified badge is missing and no
design motif needed an insignia override. See previews/insignia/audit.md.

PART TAGS
Exported with Blender 5.2.2 LTS (d13f752e3b9c, built 2026-09-15).
The Parts section of docs/CUSTOMIZATION.md is the slot/export specification.
The shared implementation is art/blender/part_tags.py; source pieces are tagged
after all sheet_polish.py, aurora_polish.py and tempest_polish.py additions.
Each source object's control-cage bounding-box centre is measured in its
joint-local game axes (+Y up, +Z forward, +X left), before bevels or LODs:
  chest: z < -0.75 -> backpack, otherwise chest;
  shL/shR: abs(x) > 0.3 OR y > 0.1 -> shoulders, otherwise armL/armR.
All other joints map directly to the eleven slots: head, shoulders, chest,
backpack, waist, hips, armL, armR, thighs, shins, feet. Sunhawk's towers map to
shoulders and its three skirt hinges to hips. Its separate UV detail format
and the original/current Sunhawk comparison asset are preserved.

The stable roster part_source identifier is "joint / requested source name",
with [2], [3], ... only for repeated names within that joint. It is independent
of Blender's global .001 suffixes or other loaded scenes. Sunhawk uses its
existing, fixed "B / ..." source-library names. Source objects also retain
part_rule, part_center_game and (when overridden) part_reason for inspection.
part-overrides.json records all 34 reviewed exceptions with an explicit reason:
  Anubis: two shoulder-cap stripes, pack housing and pack cap (4).
  Horus: two shoulder-cap stripes (2).
  Razor: rear power-pack housing (1).
  Seraph: pack housing, cap and both wing-root bearings (4).
  Kamaitachi: pack housing, cap, both crescent-root bearings; both shoulder
    shields, their inset fields and their lightning emblems (10).
  Fujin: both shoulder-turbine housings and their lightning marks (4).
  Raijin: both shoulder shields, their inset fields and lightning emblems (6).
  Sunhawk: rear power-pack shell and both porcelain borders (3).
Every override follows the assembly a piece visibly attaches to. Neck guards,
collars and actual upper-arm bands remain chest/arm even near a split plane.
A rebuild fails on unknown joints, incompatible overrides or stale piece names.
All fifteen designs have all eleven parts, including a backpack. No piece needs
a slot outside the table. Full per-piece decisions are in part-overrides.json
and previews/parts/*-pieces.json; boundary-review notes are in that gallery.

Roster armour exports as joint/part/slot; ink as joint/part/LINES. Sunhawk uses
underscores. Every such node has a part extra. Paint slots, root metadata,
calf-thruster anchors, LOD ratios and geometry are unchanged. The original
joint/paint vertex-weld representatives are retained before splitting groups.
Ink deduplication also stays joint-wide, in original source order. Blender
5.2.2's loose-edge exporter sorts FLOAT _LINE_KIND records separately from
positions; the helper preserves the OLD effective category stream before
partitioning it, rather than changing the existing on-screen strokes.

Review/rebuild:
  1. Run build_roster.py for each MODEL as documented below, and the Sunhawk
     export_game.py in its production scene as documented in its own README.
  2. Run Blender --background --python art/blender/roster/review_parts.py -- --all
     (substitute the absolute Blender executable and script paths as needed).
     This opens the source libraries read-only and does not save review colours.
  3. Open previews/parts/index.html. Each of the fifteen designs has front,
     back and three-quarter-rear PNGs with one flat colour per part, plus a
     source-piece inventory. Inspect caps/bands, collars/pack plates, wing-root
     bearings and the Tempest polish additions. Change only the source rules
     or named JSON overrides, then rebuild and review again.
  4. Run node tools/parts-compare.mjs --baseline e3acda26ca8c9c77f3d1fff6a3b8d2a773cbfa0a
     to regenerate previews/parts/triangle-equivalence.json. The comparator
     expands indexed triangles and ink segments by joint, ignores group order,
     preserves multiplicity/winding/paint slots, and requires EXACT positions,
     shaded normals, outline normals, widths, ink categories and other authored
     attributes. It also checks root contracts and the unchanged current Sunhawk.
  5. Run npm test and npm run build. Do not hand-edit generated GLBs or manifests.

The comparison report is pinned to the pre-tag branch commit above, so future
reviewers can repeat the no-geometry-change proof independently of Git HEAD.
Final validation: all 45 updated GLBs and 885 joint/LOD comparisons pass with
zero attribute delta; current Sunhawk is byte-identical. npm test passes all
1,111 tests in 40 files; npm run build passes client/server builds and typechecks.

Open review.html for the comparison gallery. Every card also links to the
live comparison at localhost:4173. The dev server can serve the gallery at
http://127.0.0.1:5173/art/blender/roster/review.html .

IN GAME
Normal garage/pause menus use the approved updated models with clean armor.
The temporary design and finish selectors are removed. Comparisons remain in
this gallery and explicit URL tools, independent of old saved preferences:
?roster=current|updated, &sunhawk=current|updated|game, &sunhawkPanels=0|1.
With ?artReview=1 only, N toggles the roster and B cycles Sunhawk in place.
G: anime/plain rendering. Existing decals, glow, damage flash, weapons,
thrusters and animation anchors are retained. Art choices no longer persist.

PERFORMANCE / RELEASE CHECK (2026-10-15)
At 1280x720, high quality, scale 1, uncapped, a controlled Helios demo
(seed 9, skip 95, Tempest vs Aurora) measured 74.8 fps updated versus
74.9 fps original over approximately 100 seconds each. The updated models
still draw more triangles (234k vs 193k across all render passes in this run).
This does not rule out a slowdown at higher resolutions or in other races.

Garage scene construction previously took 1425 ms for the initial Sunhawk
preview. Building only the selected pilot and retaining cached mesh indices
reduced that to 112 ms; subsequent Daystar and Raijin previews measured
100 and 118 ms. These are CPU setup times, excluding first-frame GPU work.
No model geometry or authored normal seams were simplified by this fix.

The host was under heavy background CPU and memory pressure during review
(about 5.5% CPU idle and active swapping), which can also cause intermittent
stutters. Rendering regression checks cover indexed mesh equivalence,
preview disposal, all six race pilots, and camera proportions through
garage framing, resizing and returning to play. Browser checks verified
frame/team changes, race startup, clean pause/garage menus and viewer resize.

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
  script = Path('/absolute/path/to/igpx/art/blender/roster/build_roster.py')
  ns = {'__file__': str(script), 'PROJECT_ROOT': str(script.parents[3]), 'MODEL': 'daystar'}
  exec(compile(script.read_text(), str(script), 'exec'), ns)
The root is resolved from the script unless PROJECT_ROOT is supplied. The
script replaces only its generated MODEL scene; it does not edit Sunhawk.
Regeneration replaces manual edits to that model's generated file: save a
separate artist copy before hand editing, or transfer the edits to the script.

Outputs: src/client/render/mech/assets/roster/MODEL.glb, -lod1.glb, -lod2.glb.
Each GLB has joint/part/paint-slot metadata and authored normals. Per-model
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

GEOMETRY INK (STEP 2)
Updated models default to model-authored anime ink. ?mechLines=traced keeps
Step 1 tracing for review; ?mechLines=geometry selects the authored version.
Plain and low-quality hulls, current models and existing effects are retained.

../ink_geometry.py computes edges on each source part BEFORE bevel/decimate,
then seats the endpoints on the evaluated bevel surface for that LOD. The
42-degree threshold and minimum 0.14-unit length are in ../ink-overrides.json.
Rules match complete source-name words (including plurals); model rules
override general rules. `fin` must not match `fine` or `finger`. `width` controls shell weight, `skip` suppresses inner strokes. Source
`ink_width` and `ink_exclude` properties cover generic named vents/nozzles.
Per-part `add` entries are [endpointA,endpointB,kind]; `remove` entries are
[endpointA,endpointB], with endpoints rounded to five decimals. Coordinates
are joint-local Blender coordinates. Kinds: 0 crease, 1 paint, 2 plate rim.
Keep intentional exceptions here so the next scripted rebuild retains them.

Production blend meshes carry outline normals and width attributes. The
export regenerates them after evaluated geometry/LOD conversion, includes
those values in its vertex merge key, and converts the custom normal from
Blender XYZ to glTF XZ-Y explicitly. Triangle positions and shaded normals
are unchanged. The 45 updated GLBs were checked against clean-ink: zero
position/normal changes in their expanded triangle streams.

Loose edge meshes named JOINT/PART/LINES have joint, part and ink_lines extras plus
_LINE_KIND (POINT float; matching endpoints). Blender's exporter needs
use_mesh_edges=True and export_attributes=True. Root ink_schema=1 identifies
the contract. LOD0 includes all selected edges; LOD1 drops short/weak edges;
LOD2 contains no LINES. Manifests include line_segments and actual file bytes.
Loaders validate finite positions, known joints, categories, unit outline
normals and width ranges; runtime batches the rigid joints into two draws.

Review: docs/mech-lines-report.md; tools/ink-compare.mjs; tools/ink-perf.mjs.
These checks supplement the existing rig/attachment/asset contract tests.

ACCENT AUDIT (2026-10-16)
The fourteen roster designs were inspected against no-ink views after the
Sunhawk chest correction. No additional glaring accent loss justified a
change. Their production blends, GLBs and manifests remain byte-identical.
There is no global small/secondary/trim-part suppression rule. Fingers
explicitly retain their prior effective 0.35 shell width, thumbs/gadlings
0.25. See the focused accent section in docs/mech-lines-report.md.
