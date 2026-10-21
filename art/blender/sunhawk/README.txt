SUNHAWK EXPORT NOTES — GEOMETRY INK

The production scene remains SUNHAWK • Art comparison. Variant B is the
approved updated design; A is the preserved current comparison. The game
uses the original rigid joint hierarchy, tower coupling and effect anchors.

PART TAGS (Blender 5.2.2 LTS)
Updated B source pieces use ../part_tags.py and ../roster/part-overrides.json.
The roster README's PART TAGS section documents the eleven slots, split planes,
review and exact geometry comparison. Towers are shoulders; skirts are hips.
The main backpack shell and both porcelain rails have reviewed backpack
overrides. All updated armour/ink nodes carry part extras and use
joint_part_slot / joint_part_LINES names. UV detail=True overlays retain their
separate UV format and Blender suffix where their paint slot matches armour;
they also carry part tags. Current A keeps its original format byte-for-byte.
Part-colour pictures and per-piece audit: ../roster/previews/parts/index.html.
Only regrouping changed: all updated LODs pass the exact expanded triangle and
ink-category comparison against e3acda26ca8c9c77f3d1fff6a3b8d2a773cbfa0a.

Open sunhawk-production.blend in Blender, or append its named scene from a
clean Blender session. Keep that scene active while running:
  from pathlib import Path
  script = Path('/absolute/path/to/igpx/art/blender/sunhawk/export_game.py')
  ns = {'__file__': str(script), 'PROJECT_ROOT': str(script.parents[3])}
  exec(compile(script.read_text(), str(script), 'exec'), ns)

The script disables preview Solidify ink shells during export and restores
modifiers/scene afterward. It writes current LOD0 and updated LOD0/1/2,
updates game-export-manifest.json, and saves the production scene library.
The comparison blend is preserved. Current's GLB was byte-identical in the
Step 2 pass; its runtime keeps traced ink.

Updated B uses ../ink_geometry.py and ../ink-overrides.json. Those rules
compute pre-bevel design edges, seat them on each evaluated LOD, and exclude
Drawn/UV overlays, glows, hazards, race numbers and jet geometry. The baked
_OUTLINE_NORMAL and _INK_WIDTH attributes are preserved through the export's
joint/part/slot consolidation. Custom normal components are converted to glTF's
Y-up axes explicitly. Width is zero on shallow details and reduced on thin
fins/blades/horns. Edit scripted rules rather than the generated line meshes.

JOINT_PART_LINES loose-edge meshes export through use_mesh_edges=True, with
_LINE_KIND (crease/paint/rim) and joint metadata. LOD1 keeps longer and stronger
lines; LOD2 omits inner lines. export_attributes=True is required. Runtime
validates and batches these into a single line draw and shell draw per mech,
using the same animated joints as the armour. UV detail meshes and transparent
runtime decals are intentionally excluded. Plain and low quality keep their
old hull shader; the alpha mask, film exemption and MSAA4 chain are retained.

Review with ?sunhawk=updated&mechLines=geometry or &mechLines=traced.
The current design remains ?sunhawk=current. See docs/mech-lines-report.md
for comparison crops, measured cost, file sizes and reproducible QA commands.

CHEST ACCENTS (2026-10-16)
The six Cobalt gill parts, six Recessed gill lip parts and fourteen Cuirass
fine gold/collar/pointed trim pieces are explicitly unlined in the shared
JSON's sunhawk rules (width 0 and skip true). Their geometry/materials are
unchanged. No global size thresholds or runtime depth-bias changes apply.
LOD0 strokes: 1388 -> 1180; LOD1: 468 -> 452; LOD2: 0. Hands and non-chest
strokes are unchanged. Whole-word rule matching avoids fin/fine/finger
collisions while preserving the reviewed finger width 0.35.

Check sunhawk-current.glb against git after export. If Blender changes only
serialization bytes, restore the unchanged baseline asset; this correction
must not replace the original comparison. Review original/traced/geometry
at desktop and Nova game sizes; isolate hull and authored lines to diagnose
colour loss. See art/blender/ink-review/accents for evidence.
