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

    python3 tools/fx/ingest.py art/fx-sheets/fx-02-heavy-impact.png <outdir> all 256 centre

The game's atlases (src/client/render/sprites/fx-*.png) are built from these
by `python3 tools/fx/build_sprites.py`.
