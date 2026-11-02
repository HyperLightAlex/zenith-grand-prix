ZENITH GP: THE HOVER SCREEN (Blender)

The big screens that hang over the grandstands by the start, showing the
crowd the race while the mechs are away round the lap
(src/client/render/screens/hoverScreens.ts, docs/DESIGN.md "Trackside").
Built from code in Blender, so it can be built again exactly:

    sh tools/blender.sh run art/blender/hoverscreen/build_hoverscreen.py -- \
        --glb src/client/render/screens/assets/hoverscreen.glb \
        [--blend hoverscreen.blend] [--preview hoverscreen.png]

(--preview also writes -back.png, from behind and above.)

WHAT IT IS
  A 16:9 screen 32 m across and 18 m high, set in a bezel 0.9 m deep, a
  ribbed housing behind it. It is held up the way the world's machines fly:
  a lift nacelle each side on two struts, each ringed by two glowing lift
  rings with an emitter under it, and a keel along the screen's foot with
  three more emitters, a cone of the lift's glow down from each. A spine
  along its top carries two aerials with red lamps; a band of the circuit's
  orange runs under the picture, along the spine and round each nacelle.
  About 44 m across the nacelles and 34 m from its lamps to the foot of its
  glow.

AXES AND NAMES
  Metres. Blender's axes, Z up, the picture's middle at the origin, its face
  toward -Y (in the exported glTF, Y up, it faces +Z).

  Each mesh has one material, named for its slot; the game paints the slots:
  screen (the picture: UVs 0 to 1 across its face as seen from the front),
  frame, trim (orange), glow (the lift rings and emitters, lit in the lift's
  colour), lamp (the aerials' lamps, blinking), beam (the lift's glow: open
  cones, v 0 at the emitter to 1 at the foot, which the game fades out).

  Where it hangs is the game's (HOVER in hoverScreens.ts): 46 m up over a
  stand's rows, 12 m along it between the roof's columns. If the screen's
  size changes here, change EXTENT there to match.
