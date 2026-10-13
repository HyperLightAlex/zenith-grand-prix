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
| 9 Barrier strike | fx-09-barrier-strike.png | not used: redone as 9B without the smoke puffs in drawings 4 and 5 (`all 256 nosmoke` would also take them out) | |
| 9B Barrier strike | fx-09b-barrier-strike.png | one animation of six; the game adds sheet 8 smoke | `all 256` |
| 10 Energy crackle | fx-10-energy-crackle.png | two loops: four bolts bracketing the mech, and a ring; the drawings play in random order, flipped or turned, so a loop of three never visibly repeats | `rows centre` |
| 11 Pickup sparkle | fx-11-pickup-sparkle.png | one animation of six: pop, star, scatter, rising glints, fade; the bottom row sits 12 px high, so its window moves up to match | build_sprites.py |
| 12 Knockout explosion | fx-12-knockout-explosion.png | one animation of six in its own colours (not recoloured): flash, fireball, smoke closing over it, smoke breaking up; the painted alternative to the procedural explosion | `all 384` |
| 13 Stun kick | fx-13-stun-kick.png | top row only (the kick's smear: the swing, the contact, breaking up); the stun row's dizzy spirals are redone as 13B | `rows` |
| 13B Stun | fx-13b-stun.png | two loops over a staggered mech's head and shoulders: sparks shorting out, and a broken halo of discharges; both sit in the top half of the cell | `rows` (not centred, so the empty lower half stays over the body) |
| 14 Breaker hammer | fx-14-breaker-hammer.png | not used: redone as 14B without the ring of dust and rocks | |
| 14B Breaker hammer | fx-14b-breaker-hammer.png | top row: the hammer's smear coming down (the same as 14); bottom row: the cracked contact flash, glowing cracks racing outward, the cracks breaking up | `rows` |
| 15 Muzzle blasts | fx-15-muzzle-blasts.png | top row the rifle (a star, a long spike, fragments), bottom row the scatter cannon (a cone, a bigger cone throwing pellets, fragments); the smoke puffs in drawing 6 are taken out, and the first drawing of each row is moved left onto the muzzle, where the second starts | build_sprites.py (`nosmoke`) |

    python3 tools/fx/ingest.py art/fx-sheets/fx-02-heavy-impact.png <outdir> all 256 centre

The game's atlases (src/client/render/sprites/fx-*.png) are built from these
by `python3 tools/fx/build_sprites.py`.
