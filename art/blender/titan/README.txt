ZENITH GP: THE FALLEN TITAN OF TITAN'S REST (Blender brief)

The sixth circuit, Titan's Rest (src/sim/tracks/titan.ts), is built on and
through the wreck of a colossal war machine lying on its back, half buried in a
white desert. The race climbs its outstretched hand and arm to the shoulder,
runs along its collar and over its face, rolls through its halo, drops off its
crown, comes back along its far side under its raised elbow, goes in through a
wound in its flank, loops inside its ribs, forks through its body, and
corkscrews down the blade of its sword. The game builds it from primitive
shapes today (buildTitansRest in src/client/render/world.ts). This brief is
for building the real model in Blender from its model sheets.

The work is split. Blender (this brief) owns the titan's shapes: modelling
it, posing it, burying and breaking it, its levels of detail and the export.
The game side owns the road and everything in the game: the track layout, the
exported road and clearance zones the titan must fit, loading the model,
its materials and lighting, and checking it from the race cameras. The road is
never moved in Blender; if a part cannot fit, report it and the track is
changed on the game side.

THE SHEETS (art/model-sheets/, notes in its README)
  model-g1-titan.png        G1, the design: front, three-quarter, side, back.
  model-g2-titan-head.png   G2, head and collar (front, side, above), the halo.
  model-g3-titan-arm.png    G3, the right arm from above palm up; the sword
                            flat and edge-on.
  model-g4-titan-chest.png  G4, inside the chest: a cross-section, the wound,
                            a corridor, a rib's joint.
Where the sheets disagree:
  - Hands: G1 draws them slate with gold knuckles. Use G3's: an armoured palm
    plate, four ivory fingers in three segments with gold joints, a thumb.
  - Horns: larger on G2 than G1. Follow G2's shape at a size between the two.
  - Halo: G1 mounts it on struts off the upper back; G2 draws it standing on
    those three struts. Model it as G1 mounts it (it is torn off later, in
    the wreck, and stands on its struts as G2 draws it).
  - Gold: the trim came out brighter than asked; keep the sheets' gold.

PHASES
  1  Model it whole and standing, at full scale, rigged for posing. No road
     needed. (This brief, below.)
  2  Pose it as the wreck and fit it to the road: on its back, buried, the
     right arm flung out under the climb, the left elbow raised over the road,
     the halo torn off and standing past its crown, the sword driven in.
  3  Break it: the wound, the hollow chest with the chamber the loop runs
     through, the corridors through its body (G4).
  4  Detail, levels of detail and the final export.
Phases 2 to 4 use files from the game side (the road, the clearance zones,
the target pose, a clearance checker) in art/blender/titan/fit/; see
PHASES 2 TO 4 below. Start Phase 2 only once the Phase 1 blockout has been
agreed.

======================================================================
PHASE 1: THE TITAN STANDING
======================================================================

SCALE AND UNITS
  - Blender 5.2.2 LTS, as the roster. Metres, 1 Blender unit = 1 m, scale
    applied on every object.
  - It stands on the ground plane (Z = 0) at the origin, centred on X = 0,
    facing Blender's front (-Y), in the sheet's neutral pose.
  - 1300 m from the top of the helmet (not the horns) to the soles. On G1's
    front view that is about 717 px (crown at y 201, soles at y 918), so
    about 1.81 m a pixel. Take every proportion from the sheets; these
    figures at that scale are only to check against (within about 10%):
      shoulder span, outside the shoulder armour     about 690 m
      chest depth, breastplate to back (no vents)    about 330 m
      head (helmet): width / chin to crown           about 110 / 115 m
      arm, shoulder joint to fingertips              about 690 m
      hand, wrist to fingertips / palm width         about 180 / 100 m
        (revised by the game-side proportions review on 2026-10-23)
      legs, crotch to soles                          about 670 m
      halo, outer diameter                           about 295 m
  - Set the viewport clip end to 20 km.

THE SWORD
  - From G3: pommel with its ring, red-bound grip, crescent crossguard swept
    toward the point, long slender blade with a centre groove and bright edges.
  - About 600 m long overall. The blade is about 19 times as long as it is
    wide, as drawn, and must be no more than 40 m wide and 12 m thick: the
    road wraps round it.
  - A separate object at the origin, lying along +Y with the point at +Y,
    the blade's flat facing Z.

PARTS AND THE RIG
  - One armature, titan_rig, with these bones (L and R are the titan's own
    left and right): root, pelvis, spine, chest, neck, head, shoulder.L/R
    (the shoulder armour), upper_arm.L/R, forearm.L/R, hand.L/R,
    thumb.01-03.L/R, index.01-03.L/R, middle.01-03.L/R, ring.01-03.L/R,
    pinky.01-03.L/R, thigh.L/R, shin.L/R, foot.L/R, halo (a child of chest,
    so it can be detached). The sword is not on the rig.
  - Every mesh is rigidly parented to exactly one bone: no weights, no
    deformation. Each joint is a slate or bronze-frame piece between the
    plates, as the sheets draw them, made so the parts can turn without
    opening a gap: shoulders to 90 degrees, elbows to 120, knees to 60,
    wrists to 45, fingers to 90 at each knuckle.
  - Name each object titan/<bone>/<what it is>, e.g. titan/forearm.R/plate.

MATERIALS
  Ten material slots, by these exact names, each a flat colour (the game
  replaces them with its own cel materials and surface tiles):
    armour     ivory armour             #E6E0D2
    red        faded red markings, grip #B84A3A
    slate      joints, visor surround   #6E7486
    gold       trim, horns, halo, crossguard, pommel   #C9A04A
    frame      the bronze inner frame   #8A6A3A
    verdigris  the frame's verdigris    #5FA08A
    visor      the dark visor           #2A2E38
    jewel      forehead jewel, the teal discs at the sides of the head  #3E9C9A
    blade      the blade's gunmetal     #3A3F4A
    edge       the blade's bright edges #B8BCC8
  No textures and no UV maps: the game lays its painted surface tiles on by
  world position, as it does for all the scenery.

GEOMETRY
  - Hard surface, as the sheets draw it: flat-faced plates and facets with
    sharp edges between them (mark them sharp; export the normals). The
    game's cel shading takes its light and shadow tones from these normals.
  - The plate breaks the sheets draw are real grooves, 2 to 4 m wide and
    deep, and the red bands and gold trims are separate faces in their own
    slots. No rivets, scratches or fine engraving: at this scale the game's
    surface tiles carry those.
  - Do not bake or model ink lines. The game traces the scenery's lines
    itself from its depth and colours, so real folds, grooves and colour
    edges are what draw them.
  - Closed, manifold parts where practical; no stray or zero-area faces.
  - The chest can be a closed shell for now; it is hollowed in Phase 3.

FILES
  art/blender/titan/titan-production.blend      the production scene
  art/blender/titan/*.py                        any build/export scripts;
                                                keep the export reproducible
                                                from the .blend, as the roster
  art/blender/titan/previews/                   review renders
  art/blender/titan/joints.json                 every bone's head and tail at
                                                rest, metres, Blender axes
  src/client/render/titan/assets/titan-blockout.glb   the Phase 1 export:
                                                glTF binary, +Y up (the
                                                exporter's default), the rig
                                                included, materials by name

STEPS
  1  Blockout: every part in its big forms at the right size and proportion,
     the rig, the materials assigned. Under 100k triangles. Export
     titan-blockout.glb and joints.json, render the previews, then STOP and
     report: the proportions have to be agreed before the road is re-laid to
     fit them.
  2  When the blockout is agreed: refine every part to G1, G2 and G3, still
     standing. Keep it under 600k triangles. Export over titan-blockout.glb
     again and render the previews.

PREVIEWS
  - Front, three-quarter, side and back, orthographic, framed like G1 (the
    same height on the page), each beside the sheet's view.
  - Close-ups beside G2 (head front, side, above; the halo face-on) and G3
    (the right arm from above, palm up; the sword flat and edge-on).
  - The flat material colours, lit from the upper left, on #E4E6EC.
  - An index.html that shows them all.

REPORT BACK
  - What was built, and where it departs from the sheets and why.
  - Triangle counts per part.
  - The measured figures from SCALE AND UNITS.
  - Anything in the sheets you had to interpret.

======================================================================
PHASES 2 TO 4: THE WRECK, FITTED TO THE ROAD
======================================================================

THE FILES (art/blender/titan/fit/; the game side regenerates them whenever
the road changes: npx tsx tools/titan/export.ts, then
python3 tools/titan/pose_model.py -- <titan-blockout.glb> art/blender/titan/fit,
then npx tsx tools/titan/export.ts art/blender/titan/fit --model
art/blender/titan/fit/posed.glb)
  plan.png        the road over the titan from above and from the south,
                  each piece of the road named: the overview
  road.obj        the road's deck, the slab under it and its barriers
  keepout.obj     the space round the road the titan must leave EMPTY:
                  3.8 m past each edge, from 6.5 m under the deck (the slab
                  is 6.2 m deep) to 18 m over it (a mech, the chase camera
                  behind it), each route of the Hull's fork its own box
  sky.obj         the sky over the road, to 40 m, that should stay open
                  too, bar the parts meant to pass over the road (below)
  guide.obj       the refined model (Phase 1 step 2) posed as the wreck,
                  where each part goes; unbroken (the openings and the
                  damage are still to make)
  posed.glb       the same, as glTF in the game's axes
  rig-pose.json   that pose as numbers: titan_rig's world matrix and each
                  bone's posed matrix (armature space and world), the
                  halo's and the sword's world matrices (Blender axes).
                  Made by tools/titan/pose_model.py from the model's own
                  export, so it fits the rig exactly
  pose.json       the targets: every joint, the halo's centre and axis, the
                  sword's guard and blade direction, the burial depth, and
                  the limits (the halo's smallest inner radius, the sword
                  blade's largest radius from its axis)
  stretches.json  where the road runs ON the titan, where it goes THROUGH
                  it and where it passes UNDER it, by piece of the road
  road.json       the road itself, every 4 m (for the checker)
  load_fit.py     loads all of it into the open file as the collection FIT
  check_clearance.py  checks the TITAN collection against the road
All in the game's axes (x east, y up, z south), imported with Y up and -Z
forward, so a game point (x, y, z) is Blender (x, -z, y): east is +X,
north +Y, up +Z. Export glTF with +Y up and it comes back in the game's
axes. Units are metres. (Checked with Blender 5.2.2: the placeholder,
imported this way and exported as below, comes back to the game where it
started, to the millimetre.)

THE ROAD IS NEVER MOVED IN BLENDER. If a part cannot fit, report it: the
game side moves the road and regenerates the files.

PHASE 2: POSE IT AND FIT IT
  1  Run load_fit.py in the production file (it remakes FIT each time; FIT
     is never exported). Keep the titan in a collection named TITAN.
  2  Pose the rig as rig-pose.json has it (set titan_rig's matrix_world to
     its "rig", each pose bone's matrix to its "armature"; guide.obj shows
     the result), then refine by eye. It is the pose in pose.json (the
     empties in FIT/targets):
     - on its back, face up, head to the west (-X), feet to the east, its
       right side to the south (-Y); its back plate burialDepth (120 m)
       under the sand (Z = 0). The sand covers everything below Z = 0;
       faces more than 20 m under it can be deleted.
     - the right arm flung straight out south across the sand, palm up,
       the hand open (the road climbs over the fingertips onto the palm);
     - its neck broken: the head tipped forward on it 45 degrees (chin
       toward the chest; pose.json head.pitch) and propped up 25 m
       (head.lift) on its fallen collar plates and drifted sand, so the
       road runs on from the top of the chest across its face. Model what
       holds it up: plates, wreckage, sand;
     - the left arm raised: the upper arm up from the shoulder, the elbow
       high over the Long Flank, the forearm down to the hand lying on the
       sand to the north;
     - the legs straight out east, the boots toes up (or fallen outward, if
       that reads better and stays clear of the road);
     - the halo torn off and standing on its struts past the crown, facing
       along the road (pose.json halo.axis), centred on halo.centre, its
       inner edge at least halo.minInnerRadius from that centre: the road
       rolls a full turn through it;
     - the sword driven into the sand at a slant south of the chest, its
       guard at sword.guard, the blade toward sword.towardPoint and into
       the sand, everything of the blade within sword.maxBladeRadius of its
       axis (the road corkscrews round it, the blade under the deck all the
       way). Its grip snapped off a short way above the guard: leave no
       more than 26 m of it; the rest of the grip and the pommel lie in the
       sand nearby, clear of the road (plan.png has them east of the blade).
  3  Fit it. Nothing of the titan may be inside FIT/keepout. Nothing should
     be inside FIT/sky either, except: the left arm over the Long Flank, the
     halo round the Halo roll, the roofs over the Hull's corridors.
  4  Seat the road where stretches.json has it ON the titan (the palm, the
     arm, the shoulder, the collar, the chin, the face):
     the surface under the road 1 to 6 m below the slab, across its whole
     width, so the road lies on the titan. Where the design will not allow
     it, report the stretch and the gap: the road's height is changed to
     suit. With rig-pose.json as it is, the gap from the slab down to the
     model is: the Palm 12 to 55 m (the road rises over the palm to the
     wrist: lift the palm or the wrist where it can), the Arm 6 to 12, the
     Shoulder 5 to 94 (it climbs clear of the upper arm before the
     shoulder armour; the game stands pylons on the arm there, so leave
     that), the Collar 11 to 27, T1 the Chin 6 to 24, the Brow 7 to 41
     (the face: the most seen, the most worth seating).
  5  Open it where stretches.json has the road THROUGH it, as G4 draws the
     damage: the wound in the left (north) flank of the chest where the
     road goes in (the Breach); the chamber in the chest round the loop
     (the Ribcage), ribs and frame round it; the Hull's two routes through
     the chest, the left through corridors walled and roofed in bronze
     plate (the roof at least 20 m over the deck), the right (the gallery)
     high along the ribs and open on its outside; the opening in the right
     (south) flank where the road comes out.
  6  Check: blender --background titan-production.blend --python
     art/blender/titan/fit/check_clearance.py -- --strict
     It must end "Clear of the road." It lists what is in the sky over the
     road; only the three exceptions in step 3 may be.
  7  Export the posed titan (meshes only, the pose applied, no armature) as
     src/client/render/titan/assets/titan.glb: glTF binary, +Y up, the
     TITAN collection only, modifiers applied, normals on, no UVs or
     images, custom properties on. Name every object titan/<bone>/<what>
     and give it a custom property part = <bone>; keep the ten material
     slots by name. The game shows it in place of its placeholder, and its
     tests check it against the road (tests/titan.test.ts). After each
     export the game side runs npx tsx tools/titan/top.ts (the model's top
     from above, for the road's supports to stand on). STOP and report:
     the check's output, the stretches that could not be seated, anything
     that departs from the targets.

THE ROAD SINCE PHASE 2 (2026-10-24, the game side)
  Phase 2 was reviewed and taken into the game (d263798). The road was then
  re-laid in two places, so mechs at boost speed stay on it instead of
  flying off the crests (the game's skates now hold the road; see
  docs/DESIGN.md, Air):
  - Past the crown: one long arc over the top and a short one at the foot
    (the pieces "past the crown" and "down to the Halo"), in place of an S.
    The road leaves the Brow and arrives at the Halo where it did.
  - Up to the hilt and over the crossguard: a steep climb ("up to the
    hilt", "the hilt") and one long arc over the top and down onto the
    blade ("over the crossguard"), in place of an S and a tight pitch. It
    starts 50 m sooner: the straight after the Hull is 50 m shorter, so the
    road turns out of the Hull 50 m earlier.
  The Halo, the Sword and everything from the Halo to the Hull stay put
  (within 0.2 m; pose.json is unchanged). The fit files are regenerated for
  the new road; Phase 2's model already passes the game's checks against
  it. The crossguard is no longer ON in stretches.json: the guard lies
  inside the corkscrew's radius from the blade, 15 to 20 m under the slab,
  so the road passes over it and is not meant to rest on it.
  The Palm's road is unchanged. Between the fingers and the palm, at about
  s 550 to 565, the knuckle line drops some 20 m below the road: the
  fingers sit low, and the palm stands high behind them. No road profile
  can rest on both without throwing mechs off a new crest, so close the
  step on the model (Phase 3).

PHASE 3: BREAK IT AND WEATHER IT
  First, re-run the Phase 2 build (fit_wreck.py) and its checks on the
  regenerated fit files, so the seating, the openings and the supports are
  made for the road as it now is.
  Then, under the Palm's road: armour the knuckle line (knuckle guards, a
  bent plate, wreckage) so the road rests on the hand from the fingertips
  to the wrist: 1 to 6 m under the slab, as on the other ON stretches.
  Keep the hand open and the fingers spread round it.
  The damage beyond the openings, from G4 and the sheets: plates peeled and
  bent out round the wound, ribs snapped, cut cables and conduit hanging,
  sand drifted into the hollows and against its sides, armour chipped and
  dented along its edges. Keep the check clear. Export over titan.glb.

PHASE 4: LEVELS OF DETAIL AND THE FINAL EXPORT
  - titan.glb (the finest) no more than 600k triangles, titan-lod1.glb no
    more than 150k, titan-lod2.glb no more than 40k, all three with the
    same parts. The game switches each part separately by its distance, so
    every level keeps every part.
  - Each level passes the check; the coarser levels may lose detail but not
    grow into the road's space.
  - Previews of the wreck from the places in stretches.json, and from far
    off, beside the placeholder's (the game side can supply race-camera
    pictures of the placeholder).

PRODUCTION NOTES
(Blender: record your notes, decisions and QA here, below this line.)

2026-10-23 — PHASE 1 / STEP 1 BLOCKOUT (HISTORICAL; REVIEW FOLLOWED BELOW)

Based on latest origin/main e7c11d303c9c201bfedc976e204c3789cf911797.
Isolated branch: alexander/titan-blockout. Existing portrait/model-sheet edits
in the original checkout were left untouched. No game logic or road changes.
Blender 5.2.2 LTS, d13f752e3b9c (2026-09-15 build), on macOS arm64.

Built the intact standing titan, closed oval thorax and shield breastplate,
three overlapping rib plates per flank, bronze/slate abdomen and hip frame,
large pauldrons, flared segmented collar, helmet/visor/jewel/temple discs,
paired swept horns, upper-back halo and three mounting struts, full arms,
G3-style armoured palms and articulated fingers, thighs/knees/shins, closed
broad feet, twin rear vent housings, and the separate 600 m sword.

This is the approval BLOCKOUT, not Phase 1 step 2. Faceted envelopes and
simple joint gimbals stand in for the sheet's carefully sculpted transitions.
No rivets, engraving, scratches, ink, UVs, textures, LODs, road fitting,
burial, damage, hollow chest, corridors or wreck pose have been produced.

INTERPRETATION / DEPARTURES
- G1 determines overall proportions. G3 supplies palm/finger construction,
  but enlarges the hand relative to its arm; using that whole drawing at one
  scale would violate the brief's 145 m hand check. The neutral hands here
  are open, with four ivory three-segment fingers and one three-segment thumb.
- G2 supplies the hooked backward horn sweep at an intermediate size. The
  smooth centre helmet envelope has no added crest. Left/right forms are
  mirrored; the exact side view overlaps the two identical horns.
- The halo is a flat 295 m annulus, 35 m radial band / 24 m body depth, with
  thicker edge rims, three inward tabs and three upper-back mounts. It stays
  attached to chest through its separate halo bone; it has not been torn off.
- G1's feet stop at the page's ground line. Closed soles/heels were inferred
  at Z=0; the wide long footprint and raised pauldron caps follow G1 rather
  than a conventional humanoid's smaller feet. Knee bearings remain centred.
- G4 informs the oval thorax volume only. The chest is deliberately closed.
- Chest face panel gaps have a recessed backing 3 m behind their faces;
  typical seams are 3 m wide. Sword centre groove is 3 m wide / 3 m deep.
  Structural gaps at articulations are occupied by the frame/gimbals.
- Ten specified material names and exact palette values are retained.
  Roughness and the review studio light provide no painted texture/detail.

RIG / EXPORT
One titan_rig armature, 51 bones. Every armour mesh is rigidly bone-parented,
with no weights, vertex groups or Armature modifiers. Shoulder cap and upper
arm are independent chest children, so the cap can be adjusted separately.
All finger phalanges have their own bones. Halo is a detachable chest child.
Sword is one independent object titan/sword/assembly at world origin, point
along +Y and flat faces toward Z. The blade itself is 8 m thick; the grip and
pommel are thicker. All object scales are applied. Export uses glTF +Y up,
explicit normals, material names and the complete rigid joint hierarchy.
Blender's reimport reconstructs the 51-bone rig and its rigid attachments.
joints.json records rest heads/tails and parents in Blender metre axes.

MEASURED METRES (rounding only for this text; full precision in JSON)
  Helmet crown to soles                         1300.0
  Shoulder span including outer bearings         700.0   (armour caps 690)
  Chest depth, excluding vents                   328.0
  Helmet width / chin to crown               110 / 115
  Shoulder pivot to middle fingertip              677.7
  Wrist to middle fingertip / palm width       145.8 / 80
  Crotch (hip pivot) to sole                      650.0
  Halo outer diameter                            295.0
  Sword overall                                  600.0
  Blade length / width / thickness            437 / 23 / 8  (19:1)
All listed proportion checks are within the brief's approximately 10% band.

TRIANGLES BY RIGID PART
  chest                      1,984
  foot.L                       736
  foot.R                       736
  forearm.L                    414
  forearm.R                    414
  halo                       2,328
  hand.L                       330
  hand.R                       330
  head                         770
  index.01.L                   280
  index.01.R                   280
  index.02.L                   280
  index.02.R                   280
  index.03.L                   280
  index.03.R                   280
  middle.01.L                  280
  middle.01.R                  280
  middle.02.L                  280
  middle.02.R                  280
  middle.03.L                  280
  middle.03.R                  280
  neck                          60
  pelvis                       206
  pinky.01.L                   280
  pinky.01.R                   280
  pinky.02.L                   280
  pinky.02.R                   280
  pinky.03.L                   280
  pinky.03.R                   280
  ring.01.L                    280
  ring.01.R                    280
  ring.02.L                    280
  ring.02.R                    280
  ring.03.L                    280
  ring.03.R                    280
  shin.L                       822
  shin.R                       822
  shoulder.L                   288
  shoulder.R                   288
  spine                        448
  sword                      1,124
  thigh.L                      360
  thigh.R                      360
  thumb.01.L                   280
  thumb.01.R                   280
  thumb.02.L                   280
  thumb.02.R                   280
  thumb.03.L                   280
  thumb.03.R                   280
  upper_arm.L                  392
  upper_arm.R                  392
  TOTAL                     22,004
  root is a control bone without geometry; total includes the sword.
  300 mesh objects, under the 100,000-triangle blockout budget.

QA
Independent validation: 7,516 checks, zero failures/warnings.
Closed/manifold source meshes, no degenerate triangles or stray vertices,
no UVs/textures, correct materials, symmetric body/rest joints, applied
scales and full rigid hierarchy. GLB reimport retains all 300 meshes and
22,004 triangles; maximum world-bounds deviation is
0.003326 m (3.33 mm at 1,300 m scale).
The importer-only Icosphere custom bone display helper is explicitly proven
absent from the GLB and excluded from mesh counts; no exported mesh is skipped.

Pose checks: 1,448 assertions across 42 cases: neutral, 40 isolated bone
rotations, and combined maximum review pose. Both shoulder caps and upper
arms at 90 degrees; elbows 120; knees 60; wrists 45; all 30 knuckles 90.
Actual parent-frame triangles still intersect each closed faceted gimbal.
Maximum attachment error 0.14 mm. This checks connected frames, NOT armour
collision clearance or road clearance. Review poses never overwrite the
standing production file. Reports: validation-report.json and pose-report.json.

PREVIEWS / REVIEW
Open previews/index.html (or serve the repository root with a static server).
11 required sheet comparisons: G1 front/three-quarter/side/back, G2 head
front/side/above and isolated halo, G3 right arm palm-up / sword flat / edge.
The body cameras are level orthographic views at G1's original page scale:
512x1024, ortho 1856.346 m, target Z736.8, crown about y201, sole y918.
Detail crops preserve the whole source image at its aspect ratio. The two
sword views use the same camera width and horizontal scale. Raw alpha renders
are composited on #E4E6EC, with studio lighting from upper left. Source crop
coordinates and hashes are in previews/comparison-manifest.json. The small
neighboring fragments in G3 crops are present in the source, not model parts.
Extra front/side maximum-range pictures show the posing check only.

REBUILD / EXPORT / REVIEW COMMANDS (from the repository root)
Use Blender 5.2.2 LTS; substitute its absolute executable path as needed.
On this Mac: /Applications/Blender.app/Contents/MacOS/Blender

  blender --background --python art/blender/titan/build_titan.py
    Rebuilds the standing source, saves titan-production.blend, then exports.
    It is intended for a fresh background process, never an artist's scene.

  blender --background art/blender/titan/titan-production.blend --python art/blender/titan/export_titan.py
    Re-exports the saved rest scene to GLB, joints.json and blockout-report.json.
    Refuses a posed scene. No generated mesh/file is hand edited.

  blender --background art/blender/titan/titan-production.blend --python art/blender/titan/render_titan.py
    Renders the 11 required unposed/isolated views without saving changes.

  blender --background --python art/blender/titan/validate_titan.py -- art/blender/titan/titan-production.blend src/client/render/titan/assets/titan-blockout.glb art/blender/titan/validation-report.json

  blender --background --python art/blender/titan/pose_titan.py -- art/blender/titan/titan-production.blend art/blender/titan/previews/raw art/blender/titan/pose-report.json

  python3 art/blender/titan/assemble_titan_previews.py --root .
    Requires Pillow. Writes the comparison PNGs, manifest and review index.

STOP POINT
Phase 1 step 1 complete. Proportions await approval. Do not start step 2 or
Phase 2 until separately requested; the standing source is the handoff.


2026-10-23 — PHASE 1 / STEP 2 STANDING REFINEMENT (AWAITING REVIEW)

Pulled main 2225cd28879ad6b198fede62e87960f1681e8464 before editing.
The Phase 2 fit files are present but were neither loaded, changed nor used
for posing. Still standing at 1300 m, with the original body and wrist pivots.
Blender 5.2.2 LTS d13f752e3b9c. Work remains on alexander/titan-blockout.

REVIEW CHANGES / INTERPRETATION
- Thigh armour is now 235 x 235 m at its broadest horizontal section, with
  fuller intermediate rings and tapered hip/knee openings. Only its middle
  armour is shifted outward, preserving a crotch gap without moving hips.
- Calf armour is 255 m wide, with a bell profile following the original
  knee-to-ankle centreline. Main shell depth is 255 m; its raised front ridge
  brings the complete armour depth to 263 m. Gold lower rim and red band stay.
- Upper arms have 130 x 130 m sections. Forearm cuff sections are 165 x 142 m,
  with a wide flat inner face, two real 3 m grooves and gold rails on both
  sides. Elbow bearings, knee bearings/shields and visible support pieces
  grow with the surrounding armour while preserving their pivots.
- Pauldrons are now closed curved shells with a concave underside, gold
  borders, three inset ivory panels, an internal hub and three support ribs.
  Shell and trim share tessellation, preventing surface intersections. The
  approved shoulder span remains 700 m including outer bearings.
- Palm width is 100 m and measured wrist-to-fingertip length 179.83 m.
  The user explicitly allowed finger knuckles to move to retain even finger
  proportions: all 30 finger bones and their geometry scale together about
  the fixed wrists. The 21 non-finger bones, including hand head/tail, remain
  exactly unchanged. joints-step1.json is the immutable approved reference.
- The complete head assembly moves 76 m forward in -Y, putting the visor's
  forward surface 125 m ahead of the shoulder pivots. Helmet width/height,
  horn shapes and crown height remain. An angled neck core and side yokes
  connect to the original neck/head pivots. The chest-mounted collar stays.
- Physical edge chamfers refine palm, fingers, tassets, knee shields and foot
  trims. No fine engraving, rivets, textures, UVs or modelled ink are added.
  Approved chest/bands/halo/sword design and the ten colours are retained.
- Every exported mesh now has both part=<bone> and titan_part=<bone>. Sword
  remains independent with both tags 'sword'. GLB hierarchy remains rigid.

The hand dimensions above supersede the initial brief's 145/80 estimate.
Dimensions are measured from actual geometry, not the original bone tails.
Cross-section measurements deliberately exclude limb centreline slope; whole
world-space bounds are also reported in blockout-report.json.

MEASURED METRES
  crown_to_soles: 1300.000
  shoulder_span: 700.000
  chest_depth_excluding_vents: 328.000
  helmet_width: 110.000
  helmet_chin_to_crown: 115.000
  shoulder_to_middle_fingertip: 711.568
  wrist_to_middle_fingertip: 179.832
  hand_length_projected_Z: 178.736
  palm_width: 100.000
  face_forward_of_shoulder_pivots: 125.000
  crotch_to_soles: 650.000
  halo_outer_diameter: 295.000
  sword_overall: 600.000
  blade_length: 437.000
  blade_width: 23.000
  blade_thickness: 8.000
  blade_aspect: 19.000
  thigh_armour_ring_section_width_depth: 235.000 / 235.000
  shin_armour_ring_section_width_depth: 255.000 / 263.000
  upper_arm_armour_ring_section_width_depth: 130.000 / 130.000
  forearm_armour_ring_section_width_depth: 165.000 / 142.000

TRIANGLES BY RIGID PART
  chest                         1,984
  foot.L                        1,648
  foot.R                        1,648
  forearm.L                     1,296
  forearm.R                     1,296
  halo                          3,240
  hand.L                        1,234
  hand.R                        1,234
  head                            862
  index.01.L                      776
  index.01.R                      776
  index.02.L                      776
  index.02.R                      776
  index.03.L                      776
  index.03.R                      776
  middle.01.L                     776
  middle.01.R                     776
  middle.02.L                     776
  middle.02.R                     776
  middle.03.L                     776
  middle.03.R                     776
  neck                            472
  pelvis                        1,118
  pinky.01.L                      776
  pinky.01.R                      776
  pinky.02.L                      776
  pinky.02.R                      776
  pinky.03.L                      776
  pinky.03.R                      776
  ring.01.L                       776
  ring.01.R                       776
  ring.02.L                       776
  ring.02.R                       776
  ring.03.L                       776
  ring.03.R                       776
  shin.L                        1,358
  shin.R                        1,358
  shoulder.L                    4,516
  shoulder.R                    4,516
  spine                           448
  sword                         1,124
  thigh.L                         728
  thigh.R                         728
  thumb.01.L                      776
  thumb.01.R                      776
  thumb.02.L                      776
  thumb.02.R                      776
  thumb.03.L                      776
  thumb.03.R                      776
  upper_arm.L                     816
  upper_arm.R                     816
  TOTAL                        55,720
  332 mesh objects / 51 bones; under the 600,000 triangle refinement limit.

FINAL QA
- 9,373 independent asset/export checks: zero failures or warnings.
- 1,512 pose/contact checks over 42 cases: zero failures.
- Source and reimport retain all 332 meshes / 55,720 triangles.
- Both part tags verified on source objects, GLB nodes and reimported meshes.
- Maximum fixed-body rest joint delta: 0.000000 m.
- Maximum GLB round-trip world-bounds delta: 0.003395081 m.
- Maximum articulated attachment gap 0.147 mm; maximum gimbal-centre delta
  0.979 mm. Parent frame geometry still penetrates every tested joint gimbal.
- Audits do not edit or save the standing production scene. They certify
  attachment continuity, not armour collision clearance or road clearance.

REPRODUCIBILITY / REVIEW
Use the same rebuild/export/QA commands above. build_titan.py invokes the new
refine_titan.py before parenting; every edit is scripted. export_titan.py
checks fixed body joints against joints-step1.json before writing the GLB.
All eleven side-by-side previews and the two articulation views are refreshed.
Body cameras and source crops are unchanged. Detail cameras widen only when
needed to retain a 3% border; actual framing is in previews/raw/framing.json
and comparison-manifest.json. Open previews/index.html for the review.

STOP POINT
Phase 1 step 2 complete, standing refinement awaiting review. No Phase 2
wreck pose, fitting, burial, road editing, damage, corridors or LODs performed.


PHASE 2 — POSE AND ROAD FIT (2026-10-23)
----------------------------------------------------------------------
Phase 2 steps 1–7 complete. STOPPED for review; Phase 3 has NOT started.
Branch: alexander/titan-blockout. Before work, origin/main was merged by
fast-forward to 622cc89fe9885a67b52b9471e0bf6a51122d83a7 (including the
regenerated independent Hull-route keepout and the updated checker).

Source and reproducibility
  Blender 5.2.2 LTS, build d13f752e3b9c; native Blender application/CLI.
  titan-standing.blend is the unchanged approved Phase 1 production source
  merged as 5a698ffd4cee71ce34ea30adc361bc11a9c2c107. SHA-256:
  c459af81162f68f5c860592429c0562445788085a8047c265215657cb3a17b5f
  fit_wreck.py always starts there, applies rig-pose.json, bakes the meshes,
  builds the openings/supports and exports. The rough preview titan.glb
  was never used as a modelling source. titan-production.blend now holds
  the fitted wreck, TITAN meshes, hidden inspection rig and immutable FIT.
  The standing source remains available for a repeatable rebuild.

  Rebuild from repository root (substitute the Blender 5.2 executable):
    blender --background --python-exit-code 1 --python art/blender/titan/fit_wreck.py
    blender --background art/blender/titan/titan-production.blend --python-exit-code 1 --python art/blender/titan/fit/check_clearance.py -- --strict
    blender --background art/blender/titan/titan-production.blend --python-exit-code 1 --python art/blender/titan/measure_wreck.py
    blender --background art/blender/titan/titan-production.blend --python-exit-code 1 --python art/blender/titan/validate_wreck.py
    blender --background art/blender/titan/titan-production.blend --python-exit-code 1 --python art/blender/titan/render_wreck.py
    npx vitest run tests/titan.test.ts tests/scenery.test.ts

  wreck_clearance.py splits triangle surfaces against the full union of
  road boxes, including each shifted/rising Hull route independently;
  it does not rely on vertex-only rejection or drop crossing whole faces.
  A 1 m construction margin protects the authored openings. Sky is cut
  too, with only the named Long Flank arm, Halo and Hull-roof exceptions.
  Faces below Blender Z = -20 m are removed; the visible sand is Z = 0.
  Mesh validation occurs before counting/export, so source/report/GLB
  counts agree. Armour seating uses a shared continuous displacement
  field to retain plate thickness and recessed layers without z-fighting.
  All modelling choices live in the scripts; no generated files were
  hand-edited. All FIT input files are unchanged, verified by SHA-256 and
  their imported world geometry. No game code was changed. The sole src/
  change is client/render/titan/assets/titan.glb.

Pose and authored fitting departures
  All 51 rig matrices and rig world transform match rig-pose.json.
  Burial is 119.99971 m (120 m target), measured before allowed trimming.
  Head rig pitch is 45.000008 degrees, lift 24.999962 m. Body joints were
  not re-solved. However, fitted surfaces are deliberately no longer a
  purely rigid copy of the posed guide: the right hand/fingers use a
  continuous lift up to 55 m, forearm up to 13 m; upper collar facets up
  to 38 m; brow/head crown facets up to 42 m, blended into the original
  form and limited by the road. The final forehead bearing plate, broad
  palm/wrist bearing armour and fallen collar bearing plate close the
  principal surface gaps. Their lower surfaces retain thickness.
  Broad fallen collar plates and two yokes support the lifted head.
  No decorative debris, chips, weathering or Phase 3 damage was added.

  Halo centre in Blender metres: (-518.83350, 1421.99988, 189.99963),
  axis (-1, 0, 0), matching the target. Exact inner ring/tab surface
  radius is 93.99988 m, above the minimum 37.247 m. Mounting struts are
  checked separately by road clearance.
  Sword guard: (401.24701, 452.62390, 160.29901) Blender metres;
  blade axis (0, -0.88315469, -0.46908182). Maximum blade radius is 11.5 m,
  below the 21.997 m limit. The remaining grip is 26.000015 m (floating
  point tolerance on the 26 m cut). Broken grip/pommel lies east of the
  blade, bounding-box centre (499.49329, 341.83594, 4), bottom Z=-7 m and
  top Z=15 m, visibly resting partly in the sand and clear of the road.
  All of these pose.json limits pass the independent validation.

Openings and visual review
  North Breach wound/jambs, a broad Ribcage chamber and six bronze oval
  ribs with longitudinal frame members surround the loop. The common
  vestibule and south exit are open. The left Hull route has bronze
  floor, outer/inner walls and a roof designed at 23 m above its deck
  (crossmembers at 24.5 m with 2 m radius). The right route is a raised
  gallery with its outside open. Every rib/frame/plate clears the loop's
  full space, including triangle interiors. Roof is the only Hull sky
  exception; the median space between separated routes contains structure.

  13 reviewed views at previews/phase2/index.html: far overview, Palm,
  Arm/Shoulder, Collar/Chin, Brow, Halo, Breach, Ribcage overview and
  interior, Hull left corridor and right gallery, south exit, Sword.
  Images are 1400x900, EEVEE 16 samples; framing.json records cameras.
  The gallery links G4 and plan.png for comparison. The white sand plane
  and blue FIT road are render context only, excluded from the export.
  The final visual audit resolved coincident armour layers and a narrow
  collar spike; the retained surfaces have broad hard-surface facets.

Final seating and remaining road-side work
  Gaps below are measured from the REAL slab bottom (deck - 6.2 m) down
  along the road's banked up vector to evaluated triangle surfaces.
  Samples are every ~4 m longitudinally and <=2 m across the FULL width,
  including both edges and centre. "Seated" means a 1–6 m gap; percentages
  include missing support rays, rather than silently ignoring those rays.

  Stretch          Gap where hit (m)   Seated     Surface coverage
  Palm             1.36–27.84          42.1%       53.0%
  Arm              3.84–7.57           92.1%      100.0%
  Shoulder         3.86–129.79          8.9%      100.0%
  Collar           3.06–7.63           92.3%      100.0%
  T1 Chin          1.99–6.74           96.5%      100.0%
  Brow             3.94–5.15          100.0%      100.0%
  Crossguard       9.28–25.49           0.0%       32.1%

  Palm's main bearing at s600–700 is fully seated across the width:
  1.94–4.49 m. The approach s300–472.1 has no titan footprint; spreading
  fingers leave unsupported gaps around s480–550. The s550–600 transition
  still reaches 22.23 m below the slab, while s700–722.8 reaches 7.38 m.
  Making these fully continuous would fill the open hand/finger silhouette
  or extend armour beyond the hand. Road fitting is needed there.

  Arm, Collar and Chin retain narrow groove/transition shortfalls: maxima
  7.57, 7.63 and 6.74 m respectively. Arm centre is entirely seated; Chin
  centre is 97.2% seated (maximum 6.67 m); Brow centre is entirely seated.
  These surfaces retain visible thickness and layered plate breaks.
  No gaps below 1 m were measured on any ON stretch.

  Shoulder deliberately preserves the requested pylon-supported rise.
  Its upper-arm pylon region around s972.8–1122.8 remains 34.25–92.01 m
  below the slab; the full Shoulder interval, including the outer edges
  and later transition, reaches 129.79 m. This broader full-width audit
  is not the same measure as the earlier approximate 5–94 m estimate.

  Crossguard cannot seat across the full road width with the sword's
  guard/axis/radius targets preserved: hit gaps are 9.28–25.49 m; 67.9%
  of width/length rays miss it, including the approach s6964.9–7012.9.
  Game-side road adjustment is needed if this whole interval must be ON.
  The road was not moved to conceal any of these remaining gaps.
  phase2-seating.json contains every ray and source object; its TXT file
  breaks the intervals into 50 m bins for game-side adjustment.

Validation and counts
  Required strict check: PASS, exit 0, "Clear of the road."
  344 objects, 3,505,184 sampled surface points, zero hard keepout hits.
  331 objects are entirely clear. The only 13 objects in sky are:
    hull-left-roof and hull-roof-crossmember-0..10: 38,998 points, Hull;
    forearm.L/forearm-armour: 197 points, Long Flank.
  No halo sky hits and no unapproved sky exceptions. Full output follows.

  Independent saved-production/export validation: 2,496 checks passed,
  zero failures/warnings. FIT immutability, source identity, targets,
  tags/names, mesh-only export, normals, no UV/images/skins, ten material
  names and triangle budget all pass. Detailed checks and SHA-256 hashes
  are in phase2-validation.json/.txt.

  Final export: 170,022 triangles, 344 meshes, 48 nonempty mesh parts.
  Both part and titan_part remain on every titan/<bone>/<what> mesh.
  Production and GLB counts agree, below the 600,000-triangle ceiling.
  The three zero-count left finger parts below were wholly beneath -20 m;
  root is a rig-only bone. Their approved standing source remains intact.

  TRIANGLES BY PART (including zero exported parts)
    chest                 64,360
    foot.L                 1,412
    foot.R                 1,412
    forearm.L              1,572
    forearm.R             30,768
    halo                   3,240
    hand.L                 1,224
    hand.R                10,864
    head                  13,709
    index.01.L               776
    index.01.R             1,032
    index.02.L               776
    index.02.R             1,032
    index.03.L               776
    index.03.R             1,032
    middle.01.L              776
    middle.01.R            1,064
    middle.02.L              776
    middle.02.R            1,064
    middle.03.L              448
    middle.03.R            1,260
    neck                     724
    pelvis                   958
    pinky.01.L               612
    pinky.01.R             1,032
    pinky.02.L                 0
    pinky.02.R             1,032
    pinky.03.L                 0
    pinky.03.R             1,032
    ring.01.L                776
    ring.01.R              1,032
    ring.02.L                478
    ring.02.R              1,032
    ring.03.L                  0
    ring.03.R              1,227
    root                       0
    shin.L                 1,194
    shin.R                 1,194
    shoulder.L             4,014
    shoulder.R             4,014
    spine                    228
    sword                  1,272
    thigh.L                  736
    thigh.R                  736
    thumb.01.L               776
    thumb.01.R             1,104
    thumb.02.L               776
    thumb.02.R             1,088
    thumb.03.L               776
    thumb.03.R             1,084
    upper_arm.L              906
    upper_arm.R              816
    TOTAL                170,022

  REQUIRED GAME TEST RESULTS (exit 0)
  One existing Crucible scenery test remains skipped by the test suite.
  RUN  v5.0.3 /Users/alexanderkelley/.codex/worktrees/titan-blockout/igpx


   Test Files  2 passed (2)
        Tests  10 passed | 1 skipped (11)
     Start at  19:55:54
     Duration  3.98s (tests 87%, transform 8%, import 4%)

  FULL STRICT CLEARANCE OUTPUT (exit 0; also phase2-clearance.txt)
  00:00.403  blend            | Read blend: "/Users/alexanderkelley/.codex/worktrees/titan-blockout/igpx/art/blender/titan/titan-production.blend"
  Checking TITAN against the road: the space round it 3.8 m past each edge, 6.5 m under the deck to 18 m over it; the sky to 40 m.
    titan/chest/breach-east-jamb: 8390 points, clear
    titan/chest/breach-header: 2978 points, clear
    titan/chest/breach-west-jamb: 8410 points, clear
    titan/chest/breastplate-L-1: 12200 points, clear
    titan/chest/breastplate-L-2: 11352 points, clear
    titan/chest/breastplate-L-3: 11539 points, clear
    titan/chest/breastplate-L-4: 17610 points, clear
    titan/chest/breastplate-R-1: 11955 points, clear
    titan/chest/breastplate-R-2: 11107 points, clear
    titan/chest/breastplate-R-3: 11306 points, clear
    titan/chest/breastplate-R-4: 18458 points, clear
    titan/chest/breastplate-groove-bed: 74173 points, clear
    titan/chest/chamber-edge-trim-1: 9804 points, clear
    titan/chest/chamber-edge-trim-6: 9629 points, clear
    titan/chest/chamber-longitudinal-frame-1: 21278 points, clear
    titan/chest/chamber-longitudinal-frame-2: 21278 points, clear
    titan/chest/chamber-longitudinal-frame-3: 21278 points, clear
    titan/chest/chamber-longitudinal-frame-4: 21278 points, clear
    titan/chest/chamber-longitudinal-frame-5: 21278 points, clear
    titan/chest/chamber-longitudinal-frame-6: 13715 points, clear
    titan/chest/chamber-longitudinal-frame-7: 22301 points, clear
    titan/chest/chamber-rib-1: 13544 points, clear
    titan/chest/chamber-rib-2: 12876 points, clear
    titan/chest/chamber-rib-3: 12719 points, clear
    titan/chest/chamber-rib-4: 12819 points, clear
    titan/chest/chamber-rib-5: 12710 points, clear
    titan/chest/chamber-rib-6: 12909 points, clear
    titan/chest/chamber-west-backing: 35485 points, clear
    titan/chest/closed-thorax: 57056 points, clear
    titan/chest/collar-sector-00-ivory: 1744 points, clear
    titan/chest/collar-sector-00-rim: 3586 points, clear
    titan/chest/collar-sector-01-ivory: 1744 points, clear
    titan/chest/collar-sector-01-rim: 3538 points, clear
    titan/chest/collar-sector-02-ivory: 2116 points, clear
    titan/chest/collar-sector-02-rim: 4804 points, clear
    titan/chest/collar-sector-03-ivory: 2116 points, clear
    titan/chest/collar-sector-03-rim: 4899 points, clear
    titan/chest/collar-sector-04-ivory: 1744 points, clear
    titan/chest/collar-sector-04-rim: 4334 points, clear
    titan/chest/collar-sector-05-ivory: 2651 points, clear
    titan/chest/collar-sector-05-rim: 4734 points, clear
    titan/chest/collar-sector-06-ivory: 2966 points, clear
    titan/chest/collar-sector-06-rim: 4830 points, clear
    titan/chest/collar-sector-07-ivory: 3615 points, clear
    titan/chest/collar-sector-07-rim: 5555 points, clear
    titan/chest/collar-sector-08-ivory: 3609 points, clear
    titan/chest/collar-sector-08-rim: 6117 points, clear
    titan/chest/collar-sector-09-ivory: 2854 points, clear
    titan/chest/collar-sector-09-rim: 5133 points, clear
    titan/chest/collar-sector-10-ivory: 2384 points, clear
    titan/chest/collar-sector-10-rim: 4149 points, clear
    titan/chest/collar-sector-11-ivory: 1744 points, clear
    titan/chest/collar-sector-11-rim: 3586 points, clear
    titan/chest/hull-corridor-inner-upright-0: 314 points, clear
    titan/chest/hull-corridor-inner-upright-1: 346 points, clear
    titan/chest/hull-corridor-inner-upright-10: 286 points, clear
    titan/chest/hull-corridor-inner-upright-2: 999 points, clear
    titan/chest/hull-corridor-inner-upright-3: 1434 points, clear
    titan/chest/hull-corridor-inner-upright-4: 1158 points, clear
    titan/chest/hull-corridor-inner-upright-5: 1460 points, clear
    titan/chest/hull-corridor-inner-upright-6: 1157 points, clear
    titan/chest/hull-corridor-inner-upright-7: 1379 points, clear
    titan/chest/hull-corridor-inner-upright-8: 1098 points, clear
    titan/chest/hull-corridor-inner-upright-9: 244 points, clear
    titan/chest/hull-corridor-outer-upright-0: 492 points, clear
    titan/chest/hull-corridor-outer-upright-1: 1018 points, clear
    titan/chest/hull-corridor-outer-upright-10: 1428 points, clear
    titan/chest/hull-corridor-outer-upright-2: 1252 points, clear
    titan/chest/hull-corridor-outer-upright-3: 1158 points, clear
    titan/chest/hull-corridor-outer-upright-4: 1251 points, clear
    titan/chest/hull-corridor-outer-upright-5: 1252 points, clear
    titan/chest/hull-corridor-outer-upright-6: 1286 points, clear
    titan/chest/hull-corridor-outer-upright-7: 1166 points, clear
    titan/chest/hull-corridor-outer-upright-8: 1252 points, clear
    titan/chest/hull-corridor-outer-upright-9: 1427 points, clear
    titan/chest/hull-gallery-inner-frame: 7148 points, clear
    titan/chest/hull-gallery-sill: 29176 points, clear
    titan/chest/hull-left-floor: 25012 points, clear
    titan/chest/hull-left-inner-wall: 14890 points, clear
    titan/chest/hull-left-outer-wall: 20542 points, clear
    titan/chest/hull-left-roof: 30121 points; in the sky over the road: 24297 points (the Hull 24297)
    titan/chest/hull-roof-crossmember-0: 1440 points; in the sky over the road: 1440 points (the Hull 1440)
    titan/chest/hull-roof-crossmember-1: 1189 points; in the sky over the road: 1189 points (the Hull 1189)
    titan/chest/hull-roof-crossmember-10: 1648 points; in the sky over the road: 1486 points (the Hull 1486)
    titan/chest/hull-roof-crossmember-2: 1648 points; in the sky over the road: 1304 points (the Hull 1304)
    titan/chest/hull-roof-crossmember-3: 1648 points; in the sky over the road: 1324 points (the Hull 1324)
    titan/chest/hull-roof-crossmember-4: 1648 points; in the sky over the road: 1320 points (the Hull 1320)
    titan/chest/hull-roof-crossmember-5: 1648 points; in the sky over the road: 1200 points (the Hull 1200)
    titan/chest/hull-roof-crossmember-6: 1648 points; in the sky over the road: 1324 points (the Hull 1324)
    titan/chest/hull-roof-crossmember-7: 1648 points; in the sky over the road: 1324 points (the Hull 1324)
    titan/chest/hull-roof-crossmember-8: 1648 points; in the sky over the road: 1304 points (the Hull 1304)
    titan/chest/hull-roof-crossmember-9: 1648 points; in the sky over the road: 1486 points (the Hull 1486)
    titan/chest/rib-base-L-1: 10955 points, clear
    titan/chest/rib-base-L-2: 3359 points, clear
    titan/chest/rib-base-R-1: 11440 points, clear
    titan/chest/rib-base-R-2: 710 points, clear
    titan/chest/rib-plate-L-1: 3004 points, clear
    titan/chest/rib-plate-L-2: 361 points, clear
    titan/chest/rib-plate-R-1: 3031 points, clear
    titan/chest/rib-plate-R-2: 353 points, clear
    titan/foot.L/ankle-disc: 3582 points, clear
    titan/foot.L/ankle-disc-inset: 1572 points, clear
    titan/foot.L/ankle-gimbal: 5882 points, clear
    titan/foot.L/foot-shell: 48261 points, clear
    titan/foot.L/sole: 42716 points, clear
    titan/foot.L/toe-gold-cap: 14500 points, clear
    titan/foot.L/toe-side--73: 10468 points, clear
    titan/foot.L/toe-side-73: 10468 points, clear
    titan/foot.R/ankle-disc: 3619 points, clear
    titan/foot.R/ankle-disc-inset: 1515 points, clear
    titan/foot.R/ankle-gimbal: 5882 points, clear
    titan/foot.R/foot-shell: 48261 points, clear
    titan/foot.R/sole: 42716 points, clear
    titan/foot.R/toe-gold-cap: 14500 points, clear
    titan/foot.R/toe-side--73: 10468 points, clear
    titan/foot.R/toe-side-73: 10468 points, clear
    titan/forearm.L/elbow-gimbal: 8906 points, clear
    titan/forearm.L/elbow-outer-bezel: 4799 points, clear
    titan/forearm.L/elbow-outer-cap: 2830 points, clear
    titan/forearm.L/forearm-armour: 38060 points; in the sky over the road: 197 points (the Long Flank 197)
    titan/forearm.L/forearm-core: 85111 points, clear
    titan/forearm.L/inner-flat-panel-1: 4346 points, clear
    titan/forearm.L/inner-flat-panel-2: 4254 points, clear
    titan/forearm.L/inner-flat-panel-3: 4414 points, clear
    titan/forearm.L/inner-gold-rail: 4684 points, clear
    titan/forearm.L/inner-panel-groove-bed: 19784 points, clear
    titan/forearm.L/outer-gold-rail: 4870 points, clear
    titan/forearm.R/elbow-gimbal: 12146 points, clear
    titan/forearm.R/elbow-outer-bezel: 5230 points, clear
    titan/forearm.R/elbow-outer-cap: 3949 points, clear
    titan/forearm.R/forearm-armour: 49211 points, clear
    titan/forearm.R/forearm-core: 80914 points, clear
    titan/forearm.R/inner-flat-panel-1: 6432 points, clear
    titan/forearm.R/inner-flat-panel-2: 6222 points, clear
    titan/forearm.R/inner-flat-panel-3: 6334 points, clear
    titan/forearm.R/inner-gold-rail: 7255 points, clear
    titan/forearm.R/inner-panel-groove-bed: 25836 points, clear
    titan/forearm.R/outer-gold-rail: 6947 points, clear
    titan/halo/inner-rim: 14080 points, clear
    titan/halo/inward-spoke-left: 1136 points, clear
    titan/halo/inward-spoke-right: 1136 points, clear
    titan/halo/inward-spoke-top: 1072 points, clear
    titan/halo/main-ring: 25984 points, clear
    titan/halo/mount-bearing-1: 1850 points, clear
    titan/halo/mount-bearing-2: 1850 points, clear
    titan/halo/mount-bearing-3: 1850 points, clear
    titan/halo/mount-strut-1: 2146 points, clear
    titan/halo/mount-strut-2: 2153 points, clear
    titan/halo/mount-strut-3: 4274 points, clear
    titan/halo/outer-rim: 16640 points, clear
    titan/hand.L/backhand-plate: 5466 points, clear
    titan/hand.L/palm-bezel: 8614 points, clear
    titan/hand.L/palm-frame: 11103 points, clear
    titan/hand.L/palm-plate: 6640 points, clear
    titan/hand.L/wrist-gimbal: 3962 points, clear
    titan/hand.R/backhand-plate: 8468 points, clear
    titan/hand.R/palm-bearing-edge--1: 3688 points, clear
    titan/hand.R/palm-bearing-edge-1: 3688 points, clear
    titan/hand.R/palm-bezel: 10150 points, clear
    titan/hand.R/palm-frame: 15720 points, clear
    titan/hand.R/palm-plate: 7668 points, clear
    titan/hand.R/palm-wrist-bearing-armour: 13894 points, clear
    titan/hand.R/wrist-gimbal: 4130 points, clear
    titan/head/cheek-L: 754 points, clear
    titan/head/cheek-R: 754 points, clear
    titan/head/chin-mask: 1742 points, clear
    titan/head/forehead-bearing-plate: 10723 points, clear
    titan/head/forehead-jewel: 376 points, clear
    titan/head/helmet: 16146 points, clear
    titan/head/horn-L: 9736 points, clear
    titan/head/horn-R: 9923 points, clear
    titan/head/jewel-bezel: 888 points, clear
    titan/head/skull-pivot-yoke: 11603 points, clear
    titan/head/temple-L: 1467 points, clear
    titan/head/temple-R: 1508 points, clear
    titan/head/temple-disc-L: 632 points, clear
    titan/head/temple-disc-R: 602 points, clear
    titan/head/visor-band: 1890 points, clear
    titan/head/visor-surround: 3378 points, clear
    titan/index.01.L/ivory-segment: 1704 points, clear
    titan/index.01.L/knuckle: 266 points, clear
    titan/index.01.L/phalange-core: 812 points, clear
    titan/index.01.R/ivory-segment: 1602 points, clear
    titan/index.01.R/knuckle: 344 points, clear
    titan/index.01.R/phalange-core: 1042 points, clear
    titan/index.02.L/ivory-segment: 1704 points, clear
    titan/index.02.L/knuckle: 266 points, clear
    titan/index.02.L/phalange-core: 812 points, clear
    titan/index.02.R/ivory-segment: 1602 points, clear
    titan/index.02.R/knuckle: 314 points, clear
    titan/index.02.R/phalange-core: 1070 points, clear
    titan/index.03.L/ivory-segment: 1704 points, clear
    titan/index.03.L/knuckle: 266 points, clear
    titan/index.03.L/phalange-core: 812 points, clear
    titan/index.03.R/ivory-segment: 1602 points, clear
    titan/index.03.R/knuckle: 314 points, clear
    titan/index.03.R/phalange-core: 1054 points, clear
    titan/middle.01.L/ivory-segment: 1768 points, clear
    titan/middle.01.L/knuckle: 266 points, clear
    titan/middle.01.L/phalange-core: 972 points, clear
    titan/middle.01.R/ivory-segment: 2390 points, clear
    titan/middle.01.R/knuckle: 374 points, clear
    titan/middle.01.R/phalange-core: 1198 points, clear
    titan/middle.02.L/ivory-segment: 1554 points, clear
    titan/middle.02.L/knuckle: 266 points, clear
    titan/middle.02.L/phalange-core: 880 points, clear
    titan/middle.02.R/ivory-segment: 2386 points, clear
    titan/middle.02.R/knuckle: 314 points, clear
    titan/middle.02.R/phalange-core: 1198 points, clear
    titan/middle.03.L/ivory-segment: 406 points, clear
    titan/middle.03.L/knuckle: 479 points, clear
    titan/middle.03.L/phalange-core: 162 points, clear
    titan/middle.03.R/ivory-segment: 2232 points, clear
    titan/middle.03.R/knuckle: 314 points, clear
    titan/middle.03.R/phalange-core: 1202 points, clear
    titan/neck/fallen-collar-upper-bearing: 16106 points, clear
    titan/neck/forward-neck-core: 15505 points, clear
    titan/neck/head-support-east-yoke: 3814 points, clear
    titan/neck/head-support-lower-collar: 12468 points, clear
    titan/neck/head-support-upper-collar: 9188 points, clear
    titan/neck/head-support-west-yoke: 3814 points, clear
    titan/neck/neck-bearing: 10080 points, clear
    titan/neck/neck-yoke-L: 5010 points, clear
    titan/neck/neck-yoke-R: 5019 points, clear
    titan/neck/neck-yoke-pad-L: 916 points, clear
    titan/neck/neck-yoke-pad-R: 916 points, clear
    titan/pelvis/front-central-tasset: 14198 points, clear
    titan/pelvis/hip-frame: 35142 points, clear
    titan/pelvis/hip-skirt-L: 15647 points, clear
    titan/pelvis/hip-skirt-R: 15647 points, clear
    titan/pelvis/hip-skirt-trim-L: 36295 points, clear
    titan/pelvis/hip-skirt-trim-R: 36295 points, clear
    titan/pelvis/waist-chevron-L: 10430 points, clear
    titan/pelvis/waist-chevron-R: 10430 points, clear
    titan/pinky.01.L/ivory-segment: 532 points, clear
    titan/pinky.01.L/knuckle: 445 points, clear
    titan/pinky.01.L/phalange-core: 241 points, clear
    titan/pinky.01.R/ivory-segment: 1605 points, clear
    titan/pinky.01.R/knuckle: 446 points, clear
    titan/pinky.01.R/phalange-core: 662 points, clear
    titan/pinky.02.R/ivory-segment: 1562 points, clear
    titan/pinky.02.R/knuckle: 308 points, clear
    titan/pinky.02.R/phalange-core: 654 points, clear
    titan/pinky.03.R/ivory-segment: 1562 points, clear
    titan/pinky.03.R/knuckle: 308 points, clear
    titan/pinky.03.R/phalange-core: 654 points, clear
    titan/ring.01.L/ivory-segment: 1547 points, clear
    titan/ring.01.L/knuckle: 266 points, clear
    titan/ring.01.L/phalange-core: 852 points, clear
    titan/ring.01.R/ivory-segment: 1692 points, clear
    titan/ring.01.R/knuckle: 434 points, clear
    titan/ring.01.R/phalange-core: 1194 points, clear
    titan/ring.02.L/ivory-segment: 410 points, clear
    titan/ring.02.L/knuckle: 482 points, clear
    titan/ring.02.L/phalange-core: 162 points, clear
    titan/ring.02.R/ivory-segment: 1662 points, clear
    titan/ring.02.R/knuckle: 314 points, clear
    titan/ring.02.R/phalange-core: 1198 points, clear
    titan/ring.03.R/ivory-segment: 1678 points, clear
    titan/ring.03.R/knuckle: 314 points, clear
    titan/ring.03.R/phalange-core: 1225 points, clear
    titan/shin.L/greave-armour: 14106 points, clear
    titan/shin.L/greave-lower-rim: 21125 points, clear
    titan/shin.L/greave-side-shell: 68815 points, clear
    titan/shin.L/knee-disc: 9256 points, clear
    titan/shin.L/knee-disc-inset: 4200 points, clear
    titan/shin.L/knee-gimbal: 15434 points, clear
    titan/shin.L/knee-shield: 13346 points, clear
    titan/shin.L/rear-actuator: 26445 points, clear
    titan/shin.L/shin-frame: 73288 points, clear
    titan/shin.R/greave-armour: 14106 points, clear
    titan/shin.R/greave-lower-rim: 21125 points, clear
    titan/shin.R/greave-side-shell: 68815 points, clear
    titan/shin.R/knee-disc: 9256 points, clear
    titan/shin.R/knee-disc-inset: 4200 points, clear
    titan/shin.R/knee-gimbal: 15434 points, clear
    titan/shin.R/knee-shield: 13346 points, clear
    titan/shin.R/rear-actuator: 26445 points, clear
    titan/shin.R/shin-frame: 73288 points, clear
    titan/shoulder.L/pauldron-hub: 21006 points, clear
    titan/shoulder.L/pauldron-inner-rib-1: 2407 points, clear
    titan/shoulder.L/pauldron-inner-rib-2: 1294 points, clear
    titan/shoulder.L/pauldron-inner-rib-3: 2398 points, clear
    titan/shoulder.L/pauldron-ivory-1: 17142 points, clear
    titan/shoulder.L/pauldron-ivory-2: 18480 points, clear
    titan/shoulder.L/pauldron-ivory-3: 4063 points, clear
    titan/shoulder.L/pauldron-outer-bearing: 7269 points, clear
    titan/shoulder.L/pauldron-outer-inset: 4017 points, clear
    titan/shoulder.L/pauldron-shell: 70911 points, clear
    titan/shoulder.R/pauldron-hub: 21006 points, clear
    titan/shoulder.R/pauldron-inner-rib-1: 2403 points, clear
    titan/shoulder.R/pauldron-inner-rib-2: 1289 points, clear
    titan/shoulder.R/pauldron-inner-rib-3: 2403 points, clear
    titan/shoulder.R/pauldron-ivory-1: 17142 points, clear
    titan/shoulder.R/pauldron-ivory-2: 18480 points, clear
    titan/shoulder.R/pauldron-ivory-3: 4063 points, clear
    titan/shoulder.R/pauldron-outer-bearing: 7339 points, clear
    titan/shoulder.R/pauldron-outer-inset: 4017 points, clear
    titan/shoulder.R/pauldron-shell: 70911 points, clear
    titan/spine/abdomen-core: 14306 points, clear
    titan/spine/bronze-rib-750: 16394 points, clear
    titan/spine/bronze-rib-797: 9604 points, clear
    titan/spine/cage-L-0: 6650 points, clear
    titan/spine/cage-L-1: 1974 points, clear
    titan/spine/cage-R-0: 6293 points, clear
    titan/spine/cage-R-1: 2202 points, clear
    titan/spine/oxidized-inset-L-0: 316 points, clear
    titan/spine/oxidized-inset-R-0: 316 points, clear
    titan/sword/assembly: 109439 points, clear
    titan/sword/broken-grip-and-pommel: 15558 points, clear
    titan/thigh.L/hip-gimbal: 8906 points, clear
    titan/thigh.L/thigh-armour: 45274 points, clear
    titan/thigh.L/thigh-frame: 64416 points, clear
    titan/thigh.R/hip-gimbal: 8906 points, clear
    titan/thigh.R/thigh-armour: 45274 points, clear
    titan/thigh.R/thigh-frame: 64416 points, clear
    titan/thumb.01.L/ivory-segment: 1948 points, clear
    titan/thumb.01.L/knuckle: 650 points, clear
    titan/thumb.01.L/phalange-core: 812 points, clear
    titan/thumb.01.R/ivory-segment: 1901 points, clear
    titan/thumb.01.R/knuckle: 626 points, clear
    titan/thumb.01.R/phalange-core: 918 points, clear
    titan/thumb.02.L/ivory-segment: 1904 points, clear
    titan/thumb.02.L/knuckle: 650 points, clear
    titan/thumb.02.L/phalange-core: 812 points, clear
    titan/thumb.02.R/ivory-segment: 1798 points, clear
    titan/thumb.02.R/knuckle: 638 points, clear
    titan/thumb.02.R/phalange-core: 750 points, clear
    titan/thumb.03.L/ivory-segment: 1602 points, clear
    titan/thumb.03.L/knuckle: 650 points, clear
    titan/thumb.03.L/phalange-core: 668 points, clear
    titan/thumb.03.R/ivory-segment: 1757 points, clear
    titan/thumb.03.R/knuckle: 638 points, clear
    titan/thumb.03.R/phalange-core: 702 points, clear
    titan/upper_arm.L/elbow-actuator--1: 4430 points, clear
    titan/upper_arm.L/elbow-actuator-1: 4413 points, clear
    titan/upper_arm.L/shoulder-gimbal: 11786 points, clear
    titan/upper_arm.L/upper-arm-armour: 19098 points, clear
    titan/upper_arm.L/upper-arm-core: 75874 points, clear
    titan/upper_arm.R/elbow-actuator--1: 4435 points, clear
    titan/upper_arm.R/elbow-actuator-1: 4451 points, clear
    titan/upper_arm.R/shoulder-gimbal: 11786 points, clear
    titan/upper_arm.R/upper-arm-armour: 19098 points, clear
    titan/upper_arm.R/upper-arm-core: 71792 points, clear
  Clear of the road.
  Blender 5.2.2 LTS (hash d13f752e3b9c built 2026-09-15 01:49:19)

  Blender quit

Phase 2 is committed for review only. Phase 3 damage/weathering and Phase 4
LOD work remain unstarted. Do not continue either without review.
