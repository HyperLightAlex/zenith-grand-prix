# Effect sheets

The original sheets for the anime look's drawn effects, as the image model
painted them (3 x 2 panels on flat magenta, from the prompt kept in this
folder's history and in docs/ART.md). They are the source; the game uses the
strips that `tools/fx/ingest.py` cuts from them.

| Sheet | File | Rows | Cut with |
|---|---|---|---|
| 1 Hit spark | fx-01-hit-spark.png | two variations | `rows centre` |
| 2 Heavy impact | fx-02-heavy-impact.png | one animation of six | `all centre` |
| 3 Parry glint | fx-03-parry-glint.png | two variations | `rows centre` |
| 4 Blade arcs | fx-04-blade-arcs.png | bottom row (heavy cut) only | `rows` |
| 4B Light cut | fx-04b-light-cut.png | two variations | `rows` |
| 5 Lance thrust | fx-05-lance-thrust.png | two variations | `rows` |
| 6 Shock rings | fx-06-shock-rings.png | bottom row (facing ring) only; the ground ring is redone as 6B | `rows centre` |
| 6B Ground ring | fx-06b-ground-ring.png | two variations, laid flat on the road | `rows centre` |
| 7 Thruster flame | fx-07-thruster-flame.png | boost loop and overdrive loop; rows cut to the nozzles | build_sprites.py |
| 8 Smoke puffs | fx-08-smoke-puffs.png | small puff and large cloud | `rows centre` |
| 9 Barrier strike | fx-09-barrier-strike.png | one animation of six; the smoke puffs painted into drawings 4 and 5 are taken out (the game adds sheet 8 smoke instead) | `all 256 nosmoke` |

    python3 tools/fx/ingest.py art/fx-sheets/fx-02-heavy-impact.png <outdir> all 256 centre

The game's atlases (src/client/render/sprites/fx-*.png) are built from these
by `python3 tools/fx/build_sprites.py`.
