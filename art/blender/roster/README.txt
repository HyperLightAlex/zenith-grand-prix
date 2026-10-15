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
Original heads, equipment, faction palettes and motifs are retained. Long
armor shells have shaped chamfered sections, broader readable surfaces,
small edge radii and weighted normals. Light frames remain slender;
defenders retain their broader stance. Added bearing covers, rear armor,
layered midfielder knees and defender wrist guards improve the transitions.
Sobek retains its fluted column bracers; Paladin retains curved tower shields.
Hands have inward thumbs, mirrored finger lengths, rearward curls and
forward dorsal armor. Held weapons follow the corrected palms. Maul retains
fang knuckles, Paladin silver gadlings, and other defenders faction guards.
Razor, Anubis and Rampart fins spread outward through boost/victory.

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
It also checks tall rear fins stay on their own side of the helmet.
previews contains final standing comparisons and boost/guard/victory checks.
These are a first integrated roster polish pass, not new concept sheets.
The original builders are unchanged; physics and race balance are unchanged.

Commands: npm test; npm run build; npm run build:single.
Gallery regeneration: node tools/roster/review.mjs .
