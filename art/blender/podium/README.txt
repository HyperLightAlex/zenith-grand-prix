ZENITH GP: THE PODIUM (Blender)

At a match's or an event's end the first three stand on the podium in their
victory poses (src/client/render/podium/podium.ts, docs/DESIGN.md "The
ceremony"). There are two sets, both built from code in Blender, so they can
be built again exactly: the pilots' podium, a mech to a tier (a Free Play
match, a Sprint), and the teams' podium, a whole team of three to a tier (a
Grand Prix):

    sh tools/blender.sh run art/blender/podium/build_podium.py -- \
        --glb src/client/render/podium/assets/podium.glb \
        [--blend podium.blend] [--preview podium.png]
    sh tools/blender.sh run art/blender/podium/build_podium.py -- \
        --layout teams --glb src/client/render/podium/assets/podium-teams.glb \
        [--preview podium-teams.png]

The trophy presented on the teams' podium is its own model
(art/blender/trophy/README.txt).

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

THE TEAMS' PODIUM (--layout teams)
  The same set made wider for three mechs a tier: a stage 82 m wide, steps
  20 m wide up its front; the winner's tier 24 m wide (x -12 to 12), the
  second's 24.5 m (x -37.5 to -13), the third's the same (x 13 to 37.5), each
  as high as the pilots' set's, the winner's 11.5 m deep (the others 11 m),
  room for a team's two wings behind its leader. The backdrop's middle
  screen is 36 m wide, the side ones swung 16 degrees; the towers stand 92 m
  apart, the spotlights over the three tiers' middles and edges, the
  cannons at x +-39.5. The game shows it 1.7 times as far off (its cameras'
  offsets scaled by SET.scale in podium.ts).

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

  On the teams' podium (TEAM_SPOTS): each team's leader at the front of its
  tier's middle (z 1.6), its two others 7.6 m either side and 3.8 m back;
  the tiers' middles at x 0, -25.25 and +25.25. The trophy stands on the
  winners' tier in front of their leader (TROPHY_AT).

  If the tiers' heights or places change here, change PODIUM_SPOTS (or
  TEAM_SPOTS), SET and the beams' positions in podium.ts to match.
