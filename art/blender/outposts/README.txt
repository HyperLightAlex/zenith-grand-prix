ZENITH GP: THE OUTPOSTS (Blender)

What stands round a circuit out in the wild, and explains it: the salvage
camp by the fallen titan (Titan's Rest), the paddock, car park and fuel stop
in the desert (Corkscrew Canyon), the polar station on the ice shelf
(Frostline). One kit of buildings, each built the way its real counterpart
is, put together into those sites by src/client/render/world.ts (through
src/client/render/outposts/outposts.ts). Built from code in Blender, so it
can be built again exactly:

    sh tools/blender.sh run art/blender/outposts/build_outposts.py -- \
        --glb src/client/render/outposts/assets/outposts.glb \
        [--blend outposts.blend] [--preview outposts.png [--only crane,cabin]]

(--preview renders each kind on its own from its front three-quarter, to
outposts.<kind>.png, and tiles them into outposts.png.)

HOW THEY STAND UP
  Every building is on something (a slab, footings, blocks, a ring
  foundation, skids), has a frame that carries it (columns and rafters,
  corner posts and rails, a lattice, legs and braces), is closed (walls,
  gables, a roof that drains: gutters and downpipes) and can be got into
  (a door, a roller door, steps or a stair up to it, rails beside it).
  Nothing floats and nothing is a bare box.

THE KINDS (front toward -Y)
  container    A 40 ft container: corner posts and rails, corner castings,
               ribbed sides, its doors at the back with locking bars.
  cabin        A site cabin on concrete blocks: its steel frame, windows, a
               door up steps with a rail, an air conditioner on its end.
  workshop     A portal-frame shed 20 by 30: a slab, columns and rafters,
               ribbed walls and gables, two roof slopes with a ridge vent,
               gutters and downpipes, a roller door in its front gable and a
               door beside it, high windows along its sides.
  crane        A tower crane 42 m to its jib: a foundation and ballast, a
               lattice mast with its ladder, the slewing ring and the cab,
               the tower head, a lattice jib out front with its trolley and
               hook, a counter-jib with counterweights and the winch,
               pendant ties, lamps at its head and tip.
  tankfarm     Three fuel tanks in a bund: ring foundations, coursed shells,
               cone roofs with rails, caged ladders, pipes to a manifold.
  mast         A guyed lattice mast 36 m: guys from two levels to anchor
               blocks, antennas and a dish, lamps.
  helipad      A raised pad with its ring and H, lights, a windsock.
  lamp         A street lamp on its footing, the head lit underneath.
  module       A polar station module on braced legs with skid feet, a
               frame under it; lit windows; its door up a stair to a landing.
  link         The corridor between two modules, on legs.
  radome       A radome on its equipment building, a rail round its roof.
  hangar       An arched hangar: ribs over its cladding, end walls, the big
               door in its front and a door at its back.
  garages      Ten teams' garages in a row: a concrete frame, roller doors
               under lintels, a canopy on brackets, plant on the roof; at
               the back a roller door and a door to each bay.
  hospitality  A two-storey unit: columns, a glazed ground floor, a band of
               windows above with a stripe in the team's colour, a roof
               terrace with its rail and awnings, a stair at its end.
  truck        A team's truck: tractor and box trailer, on its wheels.
  canopy       A fuel stop's canopy on columns, its fascia, lights under it;
               four pump islands along the way through, two pumps on each.
  shop         The fuel stop's shop: ribbed walls, a glazed front with
               mullions and a door, a flat roof behind a parapet.
  car          A car, for car parks.
  flag         A runway marker flag in its weighted foot.

AXES AND NAMES
  Metres. Blender's axes, Z up. Each kind is an empty at the origin named
  for it, its meshes its children (named kind.slot), its origin on the
  ground at its middle and its front toward -Y (in the exported glTF, Y up,
  toward +Z). Each mesh has one material, named for its slot, which the
  game paints: paint (tinted per building: a container's colour, a team's),
  steel, concrete, cladding (ribbed metal), panel (smooth wall panels),
  roof, glass, dark (doors, tyres, cables), marking (white paint on the
  ground), accent (safety orange), lamp (lit).

  The slots a texture may go on one day (paint, concrete, cladding, panel,
  roof) have UVs, box-projected, a unit to a metre.
