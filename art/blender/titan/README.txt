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
Phases 2 to 4 need files from the game side (the road, the clearance zones,
the target pose, a clearance checker). They will be added to art/blender/
titan/fit/ with their own section in this README. Do not start Phase 2 until
that section exists.

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
      hand, wrist to fingertips / palm width         about 145 / 80 m
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

PRODUCTION NOTES
(Blender: record your notes, decisions and QA here, below this line.)
