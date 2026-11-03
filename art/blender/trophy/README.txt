ZENITH GP: THE TROPHY (Blender)

The cup presented at a Grand Prix's end (a cup's, the Grand Tour's, a
season's Zenith Cup): it stands on the winners' tier of the teams' podium in
front of their leader, rising and growing into place as they strike their
poses, then turning slowly (src/client/render/podium/podium.ts, docs/DESIGN.md
"The ceremony"). Built from code in Blender, so it can be built again
exactly:

    sh tools/blender.sh run art/blender/trophy/build_trophy.py -- \
        --glb src/client/render/podium/assets/trophy.glb [--preview trophy.png]

WHAT IT IS
  Sized for the mechs (8.7 m tall): 3.4 m to the top of its ring. An
  octagonal plinth 1.9 m across, banded in gold round its top; a cup turned
  on a lathe (a foot, a stem with a knop, a bowl flaring to a lip 1.7 m
  across); two handles, each an arc out from the bowl's side with both its
  ends in it; and over the bowl, held up on two arms, a ring standing on
  edge facing the front, the Zenith Ring's, lit inside.

AXES AND NAMES
  Metres. Blender's axes, Z up, the front facing -Y (in the exported glTF, Y
  up, it faces +Z). It stands on z = 0 at the origin. Three meshes, each one
  material named for its slot, which the game paints: trophy_gold (gold),
  trophy_base (base, the plinth), trophy_glow (glow: the light in its ring,
  in the winners' colour).
