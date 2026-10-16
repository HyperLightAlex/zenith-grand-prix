SUNHAWK EXPORT NOTES — GEOMETRY INK

The production scene remains SUNHAWK • Art comparison. Variant B is the
approved updated design; A is the preserved current comparison. The game
uses the original rigid joint hierarchy, tower coupling and effect anchors.

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
joint/slot consolidation. Custom normal components are converted to glTF's
Y-up axes explicitly. Width is zero on shallow details and reduced on thin
fins/blades/horns. Edit scripted rules rather than the generated line meshes.

JOINT/LINES loose-edge meshes export through use_mesh_edges=True, with
_LINE_KIND (crease/paint/rim) and joint metadata. LOD1 keeps longer and stronger
lines; LOD2 omits inner lines. export_attributes=True is required. Runtime
validates and batches these into a single line draw and shell draw per mech,
using the same animated joints as the armour. UV detail meshes and transparent
runtime decals are intentionally excluded. Plain and low quality keep their
old hull shader; the alpha mask, film exemption and MSAA4 chain are retained.

Review with ?sunhawk=updated&mechLines=geometry or &mechLines=traced.
The current design remains ?sunhawk=current. See docs/mech-lines-report.md
for comparison crops, measured cost, file sizes and reproducible QA commands.
