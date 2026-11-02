ZENITH GP: THE PODIUM (Blender)

After a race the first three home stand on the podium in their victory poses
(src/client/render/podium/podium.ts, docs/DESIGN.md "The podium"). The set is
built from code in Blender, so it can be built again exactly:

    sh tools/blender.sh run art/blender/podium/build_podium.py -- \
        --glb src/client/render/podium/assets/podium.glb \
        [--blend podium.blend] [--preview podium.png]

WHAT IT IS
  A stage 48 m wide and 20 m deep, 0.8 m high, steps up its front.
  Three tiers on it, sized for the mechs (8.7 to 8.8 m tall, a Defender 8 m
  across): the winner's in the middle, 13 m wide and 4.6 m high; the
  second's on its right (the viewer's left), 3.4 m; the third's, 2.4 m. Each
  has a pale top, a trim of gold, silver or bronze under it, light strips up
  its front corners and a panel in its front for its numeral.
  Behind them a backdrop of three screens, the middle one 28 m wide and 21 m
  high, the side ones swung 24 degrees forward; over it all a truss 23.5 m up
  on two towers 58 m apart, six spotlights hung from it aimed at the tiers;
  pyro cannons at the stage's corners.

AXES AND NAMES
  Metres. Blender's axes, Z up, the front facing -Y (in the exported glTF, Y
  up, it faces +Z). The stage stands on z = 0; x = 0 is the middle of the
  winner's tier. Where the pilots stand (the game's PODIUM_SPOTS, in glTF
  axes): the winner's tier top 5.4 m up, the second's 4.2 m at x -13.25, the
  third's 3.2 m at x +13.25.

  Each mesh is named for what it is and has one material, named for its slot;
  the game paints the slots: stage, top, gold, silver, bronze, led (the
  winners' colour), frame, truss, metal, lamp (lit). The planes it draws on
  have their UVs 0 to 1 across their faces seen from the front: numeral_1,
  numeral_2 and numeral_3, and screen_center, screen_left and screen_right.

  If the tiers' heights or places change here, change PODIUM_SPOTS and the
  beams' positions in podium.ts to match.
