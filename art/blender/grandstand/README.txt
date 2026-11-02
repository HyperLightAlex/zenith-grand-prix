ZENITH GP: THE GRANDSTAND (Blender)

The grandstands either side of the start straight are this one stand, put
down at each place a stand goes (src/client/render/trackMesh.ts, from
src/client/render/grandstand/grandstand.ts). It is built from code in
Blender, so it can be built again exactly:

    sh tools/blender.sh run art/blender/grandstand/build_grandstand.py -- \
        --glb src/client/render/grandstand/assets/grandstand.glb \
        [--blend grandstand.blend] [--preview grandstand.png]

(--preview also writes -back.png, from behind and above one end, and
-front.png, from the road.)

WHAT IT IS
  A stand 120 m long and about 23 m deep. Sixteen rows of terraced seating,
  0.9 m up and 1.25 m back each, from 4.6 m above the road to 18.1 m, in
  five blocks between four aisles of stairs with rails up them; in front a
  parapet 5.6 m high (an orange strip along its face, a rail along its top);
  concrete walls closing its ends (stepped to the rows' slope) and its back,
  pilasters up the back between a band of windows at its foot, and a band of
  hospitality windows above the last row. Over it a roof 27 m up at its
  front, sloping back, on five columns up the back wall, each holding out a
  tapered beam over the roof with ties down to it; floodlights under the
  roof's front edge, its fascia orange. The walls go down to 14 m below the
  road, for circuits whose ground is lower.

AXES AND NAMES
  Metres. Blender's axes, Z up, the stand's front (the parapet's face) on
  y = 0 facing -Y (in the exported glTF, Y up, it faces +Z: toward the
  road), the road's level z = 0, centred along x.

  Each mesh has one material, named for its slot; the game paints the slots
  in each look: crowd, concrete, roof, steel, accent, glass, lamp (lit).

  The crowd mesh is the rows' treads and risers with UVs: u along the stand
  0 to 1, v up the rows, a row to every 1/16. Seen from the road it is the
  risers that show, so each row's people are on the riser behind it, from
  k/16 to (k + 1 - STEP)/16, and its step on the tread over it, to (k + 1)/16
  (STEP = 0.31). The painted crowd's picture is laid out the same way (its
  people over the step), so the game lines its rows up on the stand's. If
  the rows change here, change SEATING and CROWD_STEP in grandstand.ts.
