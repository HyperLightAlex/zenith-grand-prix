ZENITH GP — ACCEPTED ROSTER PRODUCTION SOURCES
31 October 2026 / Blender 5.2.2 LTS (d13f752e3b9c)

This is the authoritative export package for the fifteen accepted mech designs.
It supersedes the older procedural roster and updated-Sunhawk exporters for
release builds. It includes only the approved defaults, not the earlier generated,
segmented, reconstruction or alternative experiments. The preserved current-A
Sunhawk comparison is not replaced.

WHAT IS HERE
- sources/<design>.blend: one independent editable source per accepted design,
  containing all three approved levels of detail, rigid joint empties, armour,
  authored ink, exact normals/outline data and root contract metadata.
- manifests/<design>.json: production filenames, SHA-256 hashes, triangles by part,
  group ownership, joint data and approved-input provenance.
- export.py + asset_io.py: deterministic export; no old models, experiment paths,
  network connection or generated textures are required.
- import_approved.py: an explicit one-time intake tool for a newly reviewed roster
  bundle. Ordinary updates use the existing sources and export.py instead.
- export-equivalence.json: independent temporary re-export comparison for every
  design/LOD, including root metadata and expanded triangle/ink attributes.
- promotion-equivalence.json: all 45 exports compared with the approved preview,
  plus an independent projected-bounds audit of all 12 replacement badges.
- anchor-corrections.json + fit_insignia_anchors.py: five reviewed metadata-only
  center/width corrections, recomputed from actual LOD0 badge tangent bounds.
- provenance.json: original accepted file hashes and source/script provenance.
- prepared-markings-audit.json: the retained-receiver review for the decals used
  in the accepted game preview (maintained separately from geometry exports).

EXPORT FROM THE REPOSITORY ROOT
  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup -t 2 --python art/blender/roster/production/export.py -- --all

One design:
  ... --python art/blender/roster/production/export.py -- --design maul

Read-only verification of the checked-in production GLBs (write only temporary
outputs and the chosen report):
  ... --python art/blender/roster/production/export.py -- --all --output-root /tmp/zenith-roster-check --check --report /tmp/zenith-roster-check.json

Use Blender's --python-exit-code 1 before --python in automation so a Python
exception propagates to the process status. Always check the exported report;
Blender's default process exit status alone does not certify a Python script.

Runtime destinations remain unchanged: assets/roster/<design>.glb and -lod1/-lod2
for the fourteen ordinary roster designs; assets/sunhawk-updated.glb and its two
LODs for Sunhawk. The source's native roster contract is intentional for Sunhawk:
its own loader recognizes roster_schema=1, model=sunhawk and
source_texture_schema=1 while retaining its twenty-four joints. No painted
texture inputs, skinning, material/shader changes or experimental entrypoints
are needed by these assets.

EDITING THE SOURCES
LOD0 is visible by default; LOD1/LOD2 are separate hidden collections. Each armour
object is a joint/part/paint/insignia group with direct joint, part and slot custom
properties. An ink object has ink_lines=1 and mode=1. Source piece names remain
recorded in source_pieces_json. This normalized final-surface library intentionally
retains approved geometry instead of reconstructing it from the old experiment
pipeline. The older hand-authored control cages remain preserved outside this
production package; they are not release dependencies.

All meshes use expanded topology: each triangle has three independent vertices,
and each line segment has two independent endpoints. Blender position coordinates
are X-right, Y-back, Z-up; export converts them to game +X mech-left, +Y up, +Z
forward as the established authoring conversion does. Joint-local coordinates,
part tags and joint parenting must stay consistent with the game contract.
The scene's neutral rigid hierarchy is for inspection; runtime joint positions
are explicitly stored in GLB_HEADER_LOD0/1/2 Text blocks under fittings_json.
Changing the rig requires updating those records and the manifest, then testing
all part swaps. Pose the inspection empties freely without baking a pose into
release mesh coordinates.

Exact game-axis float data is stored in named point attributes:
  export_NORMAL          authored shading normal
  export__OUTLINE_NORMAL  authored outline normal
  export__INK_WIDTH       outline-width multiplier
  export__LINE_KIND       authored ink category
  export_POSITION        intake reference for exact signed-zero preservation
The exporter uses editable mesh vertex coordinates, preserving original zero-bit
signs only where the numeric coordinate is unchanged. It applies local object
transforms to positions, normals and outline normals; move an armour group and
its associated ink together. Display normals are supplied for Blender inspection,
but the explicit float attributes are the export authority. After reshaping or
retriangulating a surface, update its authored normals/outline/width data rather
than expecting Blender's display-normal edits to modify those export attributes.
The exporter fails instead of silently ignoring altered/non-expanded topology.
Use the intake tool for a newly reviewed complete GLB bundle if the group topology
or attribute layout is rebuilt by another authoring pipeline.

GLB_HEADER_LOD0/1/2 contain the approved dimensions, fitting rules, anchors,
insignias, main/calf thrusters and effect dimensions. PRODUCTION_MANIFEST contains
the corresponding authoring provenance. Preserve all four physical thrusters,
eleven part slots and every joint owned by each model. Custom cowl pieces may be
head-owned while chest-fixed (Maul); backpack fins/halos and main engines travel
with the backpack except the explicitly head-owned Longbow helmet ornaments.

DECALS
Runtime assets/roster/prepared-markings.json is an independently authored cache of
the approved retained-surface decals, including their joint/part ownership and
placement. It was prepared once against frozen main and the accepted candidate,
then serialized so old comparison GLBs are unnecessary at runtime. Geometry
exports do not regenerate or overwrite this cache. If an edited receiving surface
moves, review/update its decal record and the prepared-markings-audit evidence in
the same change. In particular, never reintroduce a stale floating legacy decal
merely because its old procedural placement exists.

VERIFICATION AND SCOPE
All forty-five GLBs preserve the exact accepted triangle/ink binary payload,
including the final broad/thin Rampart collar and lowered Maul lower teeth.
Thirty-nine files are byte-for-byte identical to the accepted preview. Six files
(Kamaitachi and Fujin at all three LODs) have reviewed metadata-only replacement
emblem anchor corrections: Kamaitachi chest and both shoulders; Fujin shoulders.
The earlier widths could not cover their modelled badges. The chest/Fujin shoulder
centers also needed centering. These anchors now cover the actual projected bounds
with 5% margin; surface normals, up vectors and all geometry are unchanged.
anchor-corrections.json records every old/new value. The same anchors are retained
at all LODs. verify_accepted.py proves this narrow exception against an explicitly
supplied approved intake bundle; that bundle is not needed for ordinary exports.
The independent all-15 source roundtrip reproduces all 45 production GLBs exactly.
It checks the actual exported expanded positions,
normals, outline normals, widths, line endpoints/kinds, group tags and root extras.
It does not infer fidelity from Blender screenshots or triangle counts alone.
Run the production asset/customization tests and npm run build after a change.
Finite motion/assembly checks are not a proof against every possible mixed-part
surface collision; use the actual game customization view for visual review.
