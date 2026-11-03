# Zenith GP: design document

Version 0.4. This describes the game as built, why it is built that way, and
what comes next. Numbers quoted here come from `src/sim/rules.ts` and
`src/sim/config.ts`; if the document and the code disagree, the code is right.

## 1. The idea

A team motorsport where fighting is legal. Two teams of three mechs race three
laps. Points go by finishing position (15, 7, 5, 3, 2, 1), a mech that is
knocked out scores none of them, and a knockout is worth 3 to the team that
landed it. Because first place is worth as much as second, third and fourth
combined, every race turns on the two forwards: getting yours home first, and
stopping theirs.

Four decisions shape everything else:

- **Multiplayer first.** Any mix of people and computer pilots, always 3v3,
  with computer pilots in every empty seat. The race simulation is a
  self-contained, deterministic module so the same code can run in a browser
  for solo play and on a server for online play.
- **Hybrid steering.** Free steering while racing; lock on to a mech and the
  track carries you while the stick moves you around the target.
- **Combat must matter.** Damage is permanent, a knockout zeroes your placing
  points and pays the other team, and a limiter keeps the field together for
  the whole battle lap.
- **Every lap asks a different question.** Lap 1: what do you collect, Drive
  or Cells? Lap 2: who do you fight, and what do you spend? Lap 3: can you
  get to the front, or stay there, and is a Cell worth leaving the line for?

## 1b. Version 0.4: what changed, and why

Agreed after the first play sessions of 0.3. The races were too even and
too slow: on the formation lap all six mechs passed every landmark
within half a second of each other, boost was rare (about 3 s of it in the
whole first lap), forwards won 94% of races and took nearly every
knockout, and a support pilot had no way to score. Each lap now adds a
layer: lap 1 is a fast, pure racing lap (boost, carving, slipstream, a
scramble for gates), lap 2 adds the weapons, lap 3 takes the limiters off.
This is the summary; section 2 has the rules in full.

**Boost and Drive, more of both.** Charge strips pay 10 Drive a second on
the formation lap (6 before), and the trickle, the slipstream, clean
landings and close passes on a rival all pay from the start. Boost goes
from +20% to +25%. Computer pilots now boost on the formation lap too.

**Carving replaces braking.** Pull the brake trigger (LT, or S) with the
stick pushed over and the mech drops into a carve that way: a held drift,
with far more grip than free steering and a small, steady loss of speed.
Once it is on, the stick only shapes it and only letting go of the trigger
ends it. Charge builds with how tight it is held, how tight the bend is and
how fast the mech is going (a straight barely charges, so weaving down one
earns nothing), through three tiers shown by the colour of the sparks off
the skates: cyan, gold, magenta. Let go for a burst over the limiter, bigger
and longer for each tier. The trigger with the stick near the middle still
brakes. Free steering only.

**Contested gates.** A gate pays a full Cell to the first mech through, half
a Cell to each of its teammates, and goes dark for everyone for 4 seconds.
A mech that could not bank a whole Cell passes through without using the
gate up, so a leader with a full tank cannot shut gates on the chasers.

**Armour down about 10%**: Swift and Vector 1600, Bulwark 2000, with an
armour scale on the tuning panel.

**Fights you can read.** A short camera punch-in (no held zoom, and a slider
for it) on a heavy hit, a parry, a guard break and a knockout; an arrow at
the edge of the screen when someone off screen winds up a blow at you; a
colour for each weapon's swing and sparks; slow motion for any knockout you
took part in (landed, took, set up, or of your own target).

**Guard on the left trigger, and the guard swing.** Locked on, there is
nothing to brake or carve, so the left trigger raises the guard (RB still
does; RB alongside RT was awkward). Guard up, stick to one side and A: the
mech carves a fast arc round its target, up to half a circle, invulnerable
for the first part. A without the guard is still the dash.

**Support points**, counted in the team's round score. Each action scores at
most once every 6 seconds per rival, and a pilot's support points are
capped at 8 a race, so a strong support race is worth about a second place,
never a win.

| Frame | Action | Points |
|---|---|---|
| Vector | Snare lands on a rival (the rival forward: 2) | 1 |
| Vector | **Interrupt**: a Disruptor or Stun Kick that breaks a wind-up | 2 |
| Vector | **Pressure**: every 150 damage dealt to the rival forward | 1 |
| Vector | **Back-up**: every 80 damage dealt to a rival who is fighting a teammate | 1 |
| Bulwark | **Peel**: a hit on a rival who is attacking your forward | 1 |
| Bulwark | **Save**: the same hit, breaking their attack | 2 |
| Bulwark | **Bodyguard**: a block or parry near your forward | 1 |
| Bulwark | Aegis shields teammates from 100 damage or more | 2 |
| Bulwark | Ring-out a rival (the rival forward: 2) | 1 |
| Vector, Bulwark | **Lead-out**: on lap 3 your forward pulls out of your slipstream and passes someone | 2 |
| Anyone | **Assist**: you damaged a rival in the 5 s before a teammate knocked it out | 2 |

Each award shows the moment it lands, the results break the score down by
pilot and action, and a support pilot gets short prompts ("Your forward is
under attack"). Computer pilots earn them by playing their roles.

**Circuits rebuilt for carving.** Each circuit gains corners tight enough
that carving is the quick way round, with a straight after each to spend
the burst on, and keeps its landmarks (the Drop, the Loop, the Corkscrew,
the Crossover). See "Circuits" below.

**Later**: per-role records for each player (needs accounts, so it comes with
online play); the finish (whether lap 3's tow decides too much) waits for
coordinated team play online.

## 2. Rules

### The race

- Standing start after a four-second countdown, with a rev-up. Through the
  countdown the throttle builds revs on a gauge in the middle of the screen:
  they climb while it is held (empty to full in 1.6 s) and fall while it is
  let go (in 1 s). Where they stand as the lights go out sets the start: in
  the green (0.65 to 0.9) a perfect launch, a running start (44) and 10
  Drive; just short of it (from 0.45) a good one, 26 and 5 Drive; past the
  redline, over-revved, the engine bogs and the mech stumbles off the line,
  half a second with no throttle and no boost; below that, a plain start.
  Held from the start the revs reach the green in about a second: the time
  to press is around the "1", and the throttle can be feathered to stay in
  the green. The computer revs up too, aiming by skill.
- Three laps of one of four circuits, picked in the garage. On Meridian
  Skyway (8,640 units round) the leader's laps take about 80, 70 and 52
  seconds (the first counted from the start of the countdown) and the winner
  finishes in about 3:22; on Corkscrew Canyon (8,074) in about 3:07, on Helios
  Drop (9,430) in about 3:40, on Neon Crucible (9,283) in about 3:45. See
  "Circuits" below.
- The lap phase follows the race leader:

| Lap | Name | Weapons and abilities | Speed |
|---|---|---|---|
| 1 | Formation | Locked | Limiter: 110 u/s (330 mph) for everyone |
| 2 | Battle | Free | Limiter: 125 u/s (375 mph) |
| 3 | Speed | Free | Limiter off: each frame's own top speed |

- The race stays open for 25 seconds after the winner finishes. Anyone still
  running then is classified by distance and still scores.
- Past the line a mech, a person's included, is driven on by the computer
  round a cool-down lap at three-quarters of the limiter, as in a kart
  racer: it never stops dead on the road.

### The limiter and the pack

On laps 1 and 2 nobody free-steering can exceed the limiter except by:

- **Boost**: +25% while held, burning 15 Drive a second. It takes 6 Drive
  to light, and once lit burns for at least half a second, held or not, so
  a tap is a short boost paid for in full (tapping used to buy a sliver over
  the cap for no more than the trickle). Picked back up within a third of a
  second it is the same boost: no new ignition, flash or sound.
- **A carve's burst**: +15%, +25% or +35% for 0.5, 0.8 or 1.1 s, by tier
  (see "Carving" below).
- **Slipstream**: +4% tucked in behind another mech (see below).
- **The pack rule**: the limiter is tied to the race leader. Fall more than
  40 units behind and it opens, up to +14% at 300 units. This is what keeps
  six mechs in one fight for the battle lap.
- **Overdrive**, the forward's ability: +30%.

### The speed lap

Top speed is the frame's own: 160 u/s (480 mph) for a forward, 152.5 for a
midfielder, 145 for a defender. Missing armour costs at most 6% of it, so a
forward on half armour is still quicker than a healthy midfielder.

Version 0.1 took up to 14%, which put a damaged forward behind everybody with
no way back. Lap 3 is now meant to be a comeback lap as much as a speed lap,
and three things make that possible:

- **The tow.** The slipstream is worth +8% on this lap and reaches 160 units
  back (full strength over roughly the nearer three-quarters, a third of it
  at the far end). Sitting in it charges it in about half a second.
- **The slingshot.** Pull out and the tow drains over 2.4 seconds, with the
  bonus at full strength for the first half of that. That held burst is long
  enough to complete a pass. The mech you passed can then do the same to you,
  so who leads out of the last corner matters less than who times the last
  move.
- **Overdrive.** One Cell, four seconds at +30%, ignoring the armour penalty.
  Worth about 150 units: it is how a forward closes a gap too big for the tow.

Most corners are now too tight to take flat at a forward's top speed without
carving, so the carve, the line and the burst out of the corner are worth
time as well.

### Circuits

Meridian Skyway is the flat test course: a plan of straights and arcs with
barriers all the way round, and elevation and banking only for show. The
3D circuits are built from pieces (`src/sim/circuit.ts`): straights, turns,
climbs, pitches (crests and dips), loops, rolls and spirals (a turn that
climbs, widening as it goes: `spiralRun` cuts one into several pieces that
climb at one steady grade, so a stretch of it can have an open edge),
barrels (a roll round an axis off the road) and twists (a pitch whose road
rolls over as it goes, and can move out from the arc's centre: Zenith Ring's
Hatch, from the inside of its band to the outside, and the top of its
Möbius), each of which can set the road's width and banking, cut a gap,
leave an edge open, split the road (its two routes drawn apart, or twisted
round each other as a double helix: Abyss Line's Braid; or on a bend, so its
inside route is the shorter way round and the tighter: Monsoon Ruins' Temple
Halls) or hold mechs to it whatever their
speed (the outside of Zenith Ring's band). Where a twist's road is rolled
across its arc, the arc turns under a mech: the Möbius barrel rolls the
whole way round, but a full turn to each third of the loop, so each roll
turns the road about 25 degrees one way and back (one slow roll over the
whole loop turned it nearly 80).
On a barrel or a twist the bend a mech steers by is the road's own turn
within its surface, worked out from the built road (a barrel's plan has
none, but its road swings out round its column or tube and back: the Sword
63 degrees each way, the Twist 31; a twist's plan missed the kink where it
joins the road). With no bend there, the road used to carry a mech round
the swing as a lock-on does; now, hands off, it runs wide, as on any
corner. Round them, and at the kinks where they join the road, the
skates' hold grips as hard as the swing needs for any frame to follow it at
175 u/s (`HOLD_TURN_SPEED`, Track.hold, up to six times on the Sword; the
bots' corner pace counts it too); how fast a frame can swing round is still its own, so
the tightest of the Sword is a stretch in Overdrive.
`tests/steering.test.ts` drives them both ways.
A fork's routes are drawn moved apart from the road (across and up). Where
a fork has the room (Canyon's Crossover, Helios's Split Decision,
Frostline's Aurora Split, Monsoon's Temple Halls) its routes part gently,
no tighter than radius 300 where it fits (Canyon's crossing routes 229),
and a route's parting is a bend like any other: a mech moves along its
route and steers against the route's own bend over the road's
(Track.slopeL/R, bendL/R), so it steers into its route, and hands off it
runs off its line. In a bend a route's lines run at their slope over the
road's stretch there (round the outside, a route parts at a shallower angle
than on the inside: routeAngleAt, routeBendAt), so a mech that steers by
that bend alone keeps its line on either side. On Monsoon's last bend the
causeway's return to the road comes in the bend, so the outside route
tightens to about radius 130 there: a carve, or a lift (the bots see it
coming and take it so). Helios's left route jumps as it finishes parting:
in the air a mech flies straight on, so it lands a little wide, as off any
jump in a bend. The Hull (250 long, inside the titan), the Dock
(round the station's module) and the Braid (its strands round each other)
are too short or twisted too hard to part gently: their routes still carry
a mech apart (ForkSpec.carried), turned to face along its route.
The builder drives a frame (forward, right, up) through the pieces, lengthens
two straights and sets one climb so the lap closes, then resamples every 4
units. Every sample carries its own width, wall flags, a middle wall's half
width, the curvature in the vertical plane, how far up the road faces, grip
and whether it holds mechs on.

- **Air.** A mech has a height above the road. On the ground the road holds
  it while gravity's share and its skates' hold (100 u/s², over twice
  gravity) still outweigh the road's curve; over a crest taken faster than
  that, off a ramp, or past the end of the road, it flies under gravity
  (with under a third of its steering) and lands where the road is, the
  hold pulling it back while it is still rising off road under it. (Before
  the hold, a boosting mech left any crest under about 900 units' radius and
  flew on: on Titan's Rest, over the whole of the Sword.) A hard
  landing costs up to 12% speed. Jumps are built for one speed: the arc is
  the path a mech at exactly that speed would follow, with the middle of it
  missing. Faster flies further; slower falls in. The landing slope can be
  shallower than the ramp, which catches a fast mech sooner. The Drop is
  built for 106 u/s with a 120-unit gap and a 10-degree landing slope, so
  at the formation-lap limiter (110) a mech lands about 57 units past the
  gap, on the battle lap about 155, and below about 103 it falls in. The
  Split Decision jump (92 units) needs about 97 u/s; the pad just before it
  gives most mechs 130. The Hop on Canyon is a short gap built for 78. The
  Crucible's Leap is a 70-unit gap built for 100: cleared from about 80.
- **Straight down.** Where the road is pitched more than 60 degrees up or
  down, a gap is no fall: a mech crossing it is
  carried along the road's line and picked up by the road beyond. The
  Crucible's Plunge is the one there is: off the end of the Hook pointing
  straight down, through the Leap's gap, onto the Drill.
- **Falls.** Below the road with no road under it, a mech has fallen: 70
  armour, out of play for 96 ticks (nobody can lock it, hit it or draft it),
  then the drone sets it down on its own side 12 units past the next road, at
  60% of the pace, with a second of invulnerability. A fall within 2.5 s of
  being hit is credited like a ring-out, and can be a knockout.
- **Open edges** have no barrier: nothing clamps the lane on that side.
- **Forks** have a wall down the middle that grows in over 60 units at each
  end. Two mechs on opposite sides cannot lock on, hit, shoot, tow or touch;
  a lock breaks when the routes part. The routes are drawn apart (sideways
  and up or down) by the renderer only; in the simulation they are the two
  halves of one wide road. Routes that cross over and under each other (the
  Crossover) part vertically first and only swing across once there is room
  for a mech between the decks; a test holds them at least 20 units apart
  wherever one is drawn over the other.
- **Loops and corkscrews** hold mechs to the road (a 220 u/s² pull replaces
  gravity there).
- **Banking** adds grip: a turn banked toward its inside grips up to about
  twice as hard (the Bowl, at 58 degrees).
- **Speed pads** raise the cap 18% for a second and count as a boost for
  momentum strikes. Every circuit has one on a fork's route and one into its
  jump; the two longest laps have two more each: Abyss Line down into the
  trench before the Twist and out of the town (beside a strip, so the line
  chooses one), Zenith Ring half way up the Spine and on the run to the line
  (beside a strip).

Each route of a fork has something the other lacks (on Canyon, the lower
route has a pad and a strip and the upper route a gate; on Helios, the jump
route has a pad, the jump and a strip and the safe route a strip and a gate).
Computer pilots pick by what they need (Drive, a Cell), how fast they are
going (the jump only above 100 u/s), their role (forwards like the quick way)
and the side of the road they favour; in 100 races about 63% of passes take
the busier route.

Charge strips are spread so that no stretch of a lap goes long without one:
the longest gap is 16% of the lap on Meridian, 26% on Canyon and 19% on
Helios. Helios had 39% (from T1's exit, up the climb, over the Drop and
round to after the Loop) until playtesters said they ran out of Drive
there; it now has strips up the long climb, down off the Drop and on
closing A, nine in all (two of them on the two routes of Split Decision).
In 160 simulated races the change moved nothing measurable (the computer
pilots spend Drive as they get it); it is for people, who save it.

**Corners for carving.** In 0.4 each circuit was rebuilt round carving:
corners tight enough that a carve is the quick way round (at the speed-lap
pace most of them cannot be taken flat without one), each followed by a
straight to spend the burst on. A 90-degree corner of radius 140 to 170 is a
second-tier carve held normally and a third-tier one held tight; only a long
hairpin gets a carve held loosely to the third.

- **Meridian**: the Esses (radius 170, left then right), Drop Left (140), the
  Harbour Hairpin (105, 160 degrees: the best carve on any circuit) and the
  chicane (130, left then right). The lap is still 8,640.
- **Canyon**: T1 Mesa Right (140), the Narrows exit (120), T4 before the Sky
  Bridge (150), the esses (130, 80 degrees each way) and T7 Final (130), with
  the straights after T1, the start straight and the run to the line
  lengthened so the lap stays about 8,100 (8,074).
- **Helios**: the Switchback, a left-right flick (140, 70 degrees each way)
  on the way down from the Drop, and a tighter Overlook (170) and Homecoming
  (140). 9,430 round.
- **Crucible**: the Hearth hairpin (45, 90 degrees) on the pit's floor, the
  Coil (four and a quarter turns climbing 362 units at a steady 5.75%, its
  radius widening from 135 to 360: the longest carve on any circuit, and a
  third-tier burst out of it on most laps) and the Gantry turn (120, 165
  degrees) onto the line. 9,283 round.

| Circuit | Lap 1 | Winner's time | KOs a race | Falls a race | Take-offs a race | Carve bursts a race (tiers 1 / 2 / 3) |
|---|---|---|---|---|---|---|
| Meridian Skyway | 80.0 s | 3:22 | 0.5 | 0 | 0 | 49 / 14 / 6 |
| Corkscrew Canyon | 74.9 s | 3:07 | 0.1 to 0.55 | 0.2 to 0.5 | 25 | 41 / 28 / 0.5 |
| Helios Drop | 87.6 s | 3:40 | 0.4 to 0.8 | 0.05 to 0.1 | 40 | 23 / 9 / 0 |
| Neon Crucible | 84.8 s | 3:45 | 0.95 | 1.15 | 40 | 23 / 12 / 23 |

(Twenty races each, equal computer pilots of middling skill. Computer
pilots carve by the line they want, so they rarely hold a carve tight: a
person who does will reach the higher tiers far more often.)

Each circuit has its own setting (Monsoon Ruins: a jungle temple city in a
downpour under a low storm sky, lightning now and then; the rain drawn as
the anime drew it (`src/client/render/rain.ts`): streaks in three layers
round the camera, raking in toward it at speed, crowns splashing on the
road ahead over three drawings with rings spreading under them, the road
wet (darker, puddles mirroring the sky, rings in them), spray thrown off
the mechs' skates, and on the mechs a pale veil of spray over their tops
with splashes breaking along their top edges (the film pass, from where the
ink pass marks the mechs); the jungle floor and the plateau east of the gorge worked out from
the road (cut down round it, banked up under it), the great pyramid stepped
round the Stairway's ramps, the temple on its summit with the road through
its door, the Ring standing on two pillars in the gorge, the river pouring
off a lip of rock into the cenote, the Corkscrew on a shelf round its wall
behind the falls, the halls roofed over the inside route of the last bend
and the causeway's walls round the outside; the temples built in the round
(`src/client/render/monsoonTemples.ts`): stepped pyramids, each tier a
sloping face under a carved band, a stair between balustrades and a shrine
on top with a dark doorway and a roof comb; the halls' walls solid, with
moldings, a carved band under a cornice, columns along the courtyard and
gabled vaults: `src/client/render/monsoon.ts`,
painted from sheets J1 to J4 with the painted background; Abyss Line: on the sea floor a hundred
metres down, the road in glass tubes (one round each strand of the Braid, a
wide one round the Twist, and over the Trench Leap a tall vault: as high as
the furthest flight there needs (Overdrive off the pad, 44 up; worked out
by flying it, `sim/flight.ts`), the chase camera with it, and open
underneath over the gap, a diving bell whose air holds the sea out over
the chasm), the trench carved
into the floor under it, the town's great glass dome with the town lit on
its floor, the water for a sky, light coming down in shafts:
`src/client/render/abyss.ts`, which with the painted background takes its
painted water, surfaces and drifting sea life; Zenith Ring: in orbit, a ring station
built round the road, the Earth below filling the sky under its limb, its
night side lit with cities, and no ground at all, so no support pylons:
`src/client/render/zenith.ts`, a stand-in until it has a model; Meridian:
golden hour over the sea and a city on its islands (twin towers either side of the start, the sky bridge between them carried on a truss); Canyon: dusk over red desert, mesas, a rock cut and a gorge under the
Sky Bridge; Helios: noon above a sea of cloud, floating islands, the Sun Gate
over the Drop; the Crucible: night over an open-pit mine, the Coil cut into
its wall as benches with a line of neon along each, shading from magenta at
the bottom to cyan at the rim, molten metal on the floor and a ladle pouring
more into it, floodlights, a city round the rim and a gantry across the pit
carrying the start straight) and its own race music (Meridian: A minor, 138
BPM; Canyon: E Phrygian, 128 BPM, a broken beat; Helios: D major, 145 BPM,
trance; the Crucible has only its song, and plays Helios's synthesised music
without it). Each follows the same arrangement over the three laps, and the
lap and phase stingers are moved into the circuit's key. The Crucible's pit
is worked out from the circuit (`src/client/render/pit.ts`): the scenery
and the road's supports both ask it where the ground is, and no support
pylon comes down on or through another stretch of road. Frostline's ice is
worked out the same way (`frost.ts`): its shelf and glacier dip under every
banked turn whose low edge would go into them (`ground.ts`), and the
glacier's face is held back off the roads below its top. Nothing the
scenery builds may stand in the space the road needs (above the deck,
across it and a little past each edge: `titan/keepout.ts`), and pieces
placed at random that would are left out; `tests/scenery.test.ts` checks
every circuit's scenery and supports against it (the Crucible's benches,
rim and pit rock still stand at its road's edge, so it is not checked yet).
A jump flown as fast as it can be (Overdrive on the speed lap, off a pad)
goes higher and further than that space reaches: `tests/flights.test.ts`
flies every jump that way and checks nothing stands where the mech goes.

The race music is a recorded song (`?music=synth` plays the synthesised
music above instead)
(made in Suno) that builds the same way. Its stems are mixed into four
layers: lap 1 plays the melody (the stems that were carved out of one
another, which have to come in together: see tools/music) and the bass, a
little quieter; lap 2 brings in the drums; lap 3 the rest (Meridian's
brass, percussion and effects; the others' percussion and effects), the
full song at full volume, with the kick and bass lifted; the
finish goes to the song's ending, then the menu music (what the results
play) so there is no silence while the others finish. The build is in what
comes in, more than in how loud it gets. Each change waits for the next bar
line, and the middle of the song loops for as long as the race lasts.
Four songs go somewhere for lap 3. Helios's has a drop: on the lap change
it jumps to the build into the drop, at the same place in its 16-bar
chord cycle, so only the energy changes, and loops the drop to the
finish. Canyon's (疾走の回路) lifts a key for its last chorus: the lap
change waits for the next 4-bar phrase (a key change lands as meant only
on one) and goes into it. Titan's Rest's (White Desert Charge, C minor,
about 140 BPM) goes on the next bar line into its last section, where it
turns to C major. Zenith Ring's (天頂の環, B minor verses and C minor
choruses, about 160 BPM) waits for the next 4-bar phrase and goes into
its bridge, climbing into B major, then up into its last chorus, which it
loops to the finish. The Crucible's, Neon Fire (D minor, about 193
BPM), loops 50 bars (62 s) from after its first chorus through its second;
Frostline's, Aurora Dash (C# minor, 150 BPM), 45 bars (72 s). All
the circuits but Abyss Line and Monsoon Ruins have one; only the circuit
coming up has its song decoded.
While a song plays the stingers can take keys of its own (Helios's E minor,
Canyon's G minor rising to A minor, the Crucible's D minor ending in D
major, Frostline's C# minor ending in C# major, Titan's Rest's and Zenith
Ring's C minor turning to C major).
The results have a song for each outcome of the round (and the Grand Prix
award, first place or not): トロフィーセレモニー when the player's team
won, Minor Theme when it lost, each looping until the screen is left. The
hangar screens play a setlist, like a radio: songs one after another in a
shuffled order, what plays shown in the corner, M (or R3, or a tap) for
the next. See
[tools/music](../tools/music/README.md), and its prompts.md for what each
song was asked for. The menus' music is the title theme, Blue Night Sky,
in the same J-rock as the opening.

### Free steering

- The stick turns the mech. How hard it can turn falls with speed.
- The inside line really is shorter, and worth taking.
- With the stick centred the mech straightens up along the road on its own.
- Barriers scrub speed. Racing contact shoves a mech sideways more than it
  spins it.

### Carving

The brake trigger with the stick pushed over (LT, or S with A or D) starts a
carve that way, at racing speed (40 u/s or more) and with both skates on the
road. Less stick than 0.35 and the trigger is a brake.

- **A held drift.** The carve turns the way it started for as long as the
  trigger is held. The stick only shapes it: centred, it turns at 55% of
  full lock; pushed into the turn, up to full lock; pushed out of it, down to
  15%. It never straightens, so the way out of a carve is to let go.
- **Grip.** While carving the mech grips 1.65 times as hard and can turn 35%
  faster, for a speed loss of 4 to 10 u/s every second (more held tight).
  In Overdrive (the Forward's) a carve grips 1.2 times as hard again
  (`OVERDRIVE_CARVE_GRIP`): at that pace the grip, not the frame, limits the
  turn, and without it the carve opened out by as much as the pace rose. The
  mech leans further into it too.
- **Charge.** Per second: how tight the carve is held (0.15 to 1) x the
  bend (250 / its radius, between 0.15 and 1.6; a straight or a carve
  against the bend counts 0.15) x the speed (full from 100 u/s). Tiers at
  0.5, 1.1 and 1.8, each with its spark colour and a chime.
- **Burst.** Let go and the tier reached pays out: +15% over the cap for
  0.5 s, +25% for 0.8 s or +35% for 1.1 s. It counts as a boost for
  momentum strikes.
- **Losing it.** Scraping the barrier takes the charge (the carve goes on).
  A blow that lands (not one taken on the guard, and none at all under an
  Aegis or in a Ram), locking on, a fall or the finish end the carve with
  nothing. In the air it holds, but does not charge.

Grip, speed loss, charge rate and burst size are all on the tuning panel.

### Drive

One gauge, 0 to 100. It pays for boost, dashes and the forward's Lance Dash.

- It starts **empty**.
- From the start: the charge strips give 10 a second; a trickle of 0.8 a
  second, and 3 more in a slipstream; 6 for a clean landing after a real jump
  (a third of a second in the air, landed softly); 4 for passing a rival
  within 10 across the road, once per rival every 5 s (and not for passing
  in a fight, or a teammate); 10 for a perfect launch (5 for a good one). A typical pilot
  starts lap 2 full.
- From lap 2 it also comes from being linked to an escorted teammate and
  from dealing or taking damage.

### Cells and gates

A second resource, 0 to 3, starting at none, that pays for abilities.

- Six gold gates stand on the circuit. Thread one (your centre has to pass
  between the posts) for a full Cell, and **each teammate still racing gets
  half a Cell** (rules.gateShare). Each gate pays each team once a lap: a
  teammate through a gate the team has already scored this lap passes it by
  and leaves it lit. A teammate's gate paying you shows on the HUD with a
  softer chime. (Each mech used to score for itself alone, and the
  supports went into lap 2 short: forwards 1.5 Cells, midfielders 0.9,
  defenders 0.5. Now it is about two each, and the supports' abilities come
  out two or three times as often.)
- **Contested.** The first mech through takes the gate and it goes dark for
  everyone for 4 seconds, glowing back up as it comes round to relighting.
  Two through on the same tick, the one in front has it. A mech that could
  not bank a whole Cell (more than two in hand) passes through
  without taking it, whatever its teammates hold, so a full leader cannot
  shut gates on the chasers, and the lap 3 comeback stays open.
- Each sits where taking it costs something: across the road from a charge
  strip, on the outside of a corner, or on the long way round the hairpin.
  Computer pilots go for the gates their skill picks out, skip one that will
  still be dark when they get there, and enter lap 2 with about one.
- The gates stay lit for the whole race. In the first build of 0.2 they went
  out after lap 1, which meant one Cell spent in defence on lap 2 left a
  forward with no Overdrive and no way back on lap 3. Now a spent Cell can be
  earned back, and the cost is position: a gate off the racing line for one
  more use, if nobody beats you to it.
- What a gate is worth after lap 1 is its own rule (`gateValueLater`), so the
  later laps can be made stingier, or switched off, from the tuning panel.
  Computer pilots only go back for gates when they have no Cell left.

### Abilities

One button, two abilities per frame, by the rule the game already uses for A
(boost when free, dash when locked on). One Cell each. They arm with the
weapons at the start of lap 2.

| Frame | Free steering | Locked on |
|---|---|---|
| Swift | **Overdrive**, from the speed lap (`overdriveLap` 3; refused before it, at no cost): 4 s, top speed +30%, armour penalty ignored, burns off a Snare. Takes the place of boost while it runs | **Break Away**: also works while staggered. Ends the stagger, clears a Snare, 40 ticks of invulnerability, drops every enemy lock on you, no enemy can lock you for 1.5 s, and you are released at 10% over your cap |
| Vector | **Disruptor**: every enemy within 26 units takes a heavy hit that breaks through armoured wind-ups, and loses 30 Drive. Also the button while escorting a team-mate | **Snare**: a fast bolt at the target, out to 100 units. On a clean hit the target's speed cap is 74% for 3.5 s and it cannot boost |
| Bulwark | **Aegis**: the defender and every teammate within 34 units take 35% damage and cannot be staggered for 4 s. Also the button while escorting a team-mate | **Ram**: 3.5 s, +12% speed, cannot be staggered, slowed or snared, three times the mass. It drives straight at the target (60 u/s over the fight's own movement) until its front lands, and landing on the target ends the charge (its prow, a pyramid of amber light over the defender's front, goes with it); each enemy its front runs into on the way takes 80 damage once and is thrown sideways; a wall on the far side does the rest. Let go of the lock and the charge runs on down the road, through whatever it runs into, for its 3.5 s |

Counters: a guard reduces a Ram or a Disruptor to a block (neither can be
parried); an Aegis ignores a Snare and takes the sting out of a Ram; a dodge
slips a Ram without using it up; Snare and Disruptor are refused, at no cost,
if there is nobody they would reach (the Snare: if the target is out of
its reach or on the other route).

The midfielder's two were the other way round until the playtest after 0.5:
a Snare fired free steering went to whoever the aim assist found, and the
Disruptor, a pulse round the mech, made more sense with nobody picked out.

### Lock-on

- LB locks an enemy within 95 units. The lock breaks if the target gets
  more than 125 units away for two-thirds of a second, retires or finishes.
- **Escort.** Clicking the left stick (E, or Escort on touch) swaps the lock
  between the two sides: from a rival to the nearest teammate, and back to
  the rival you left (or, if it has gone, the best rival in reach; with
  nobody in reach you let go). LB while escorting goes back to the fight the
  same way, and on touch the lock button reads "Fight". The right stick
  switches target within whichever side you are locked on to. (The left
  stick used to step through teammates and LB was the only way back, so a
  stray click mid-fight left you hunting for the rival you had.)
- **Which enemy.** The lock takes whoever is nearest the middle of the
  picture (the way the mech faces, which is where the camera looks), then
  the nearer, with a pull toward the rival forward: among rivals roughly in
  front, the forward wins unless it is much further away. A rival behind you
  is taken only when there is nobody in front. (It used to take the nearest,
  wherever it was.) While you are free steering, the one the button would
  take is marked: pale corner brackets, and the lock key beside its name.
- A strike that takes the lock for you (pressing attack near an enemy) still
  goes to the nearest rival in reach, since that is who the blow can land on.
- **Looking round**: free steering, the right stick looks the way it is
  pushed, all the way round the mech: pulled back, behind it (the chasers
  coming), and the view swings back ahead when it is let go, the short way
  round. (It used to turn the camera only about 65 degrees either side,
  with no way to see behind but holding R3.) Locked on, the camera is the
  fight's and the stick switches target; it only tilts the view.
- **Switching target**: flick the right stick left or right while locked on
  and the lock moves to the next enemy that way, as you see it (measured from
  the way the mech faces, so "left" is left on screen), within 125 units.
  Hold the stick over and it keeps stepping, once every third of a second.
  Rivals you could switch to carry a small ◀ or ▶ beside their name tag; with
  nobody there the HUD says so instead of doing nothing.
- When a target is knocked out or finishes, a person locked on to it moves
  straight on to the nearest rival within 60 units rather than being dropped
  out of the fight mid-combo. Computer pilots choose for themselves.
- Locked on, the mech is in **battle mode**. It faces the target. Stick up
  closes, stick down backs off, left and right circle. The track carries you
  at the target's pace, leaning 30% of the way toward race pace.
- **The trigger sets the pace.** Held down, as above. Let go and the fight
  eases down to 75% of that pace (`BATTLE_EASE_FLOOR`), so a target behind
  comes to you; between the two, in proportion. On keyboard and touch, where
  the throttle is held for you, pushing toward a target behind eases off by
  itself.
- **A on the stick's forward or neutral** goes at the target: a tap is a
  quick dash at it (a neutral stick used to hop back), and holding it boosts
  at it after the dash, for Drive at the usual 15 a second. Toward a target
  ahead that is the way to catch it; toward one behind, a brake. Sideways
  is still the side dash (or, guarding, the guard swing) and back the hop
  back. The boost adds to the band below, but only toward the target.
- A fight is never carried slower than 90% of the limiter (70% before), and
  movement around the target is 60% quicker than in 0.1, so the battle lap
  runs at about 369 mph against the 375 limiter, locked on or not. In the
  first build of 0.2 a long fight averaged 338 mph, and a stagger at racing
  speed could bring a mech nearly to a stop.
- You can close on a target ahead at up to 4% over the limiter on the stick
  alone. To catch someone who is running, boost at it; to get away, you let
  go and spend Drive.
- Whatever drives at the target (a boost, a lunge like the Lance Dash or a
  light move's step in, a Ram) widens that band toward it, and only toward
  it, and gets there four times as quickly (`LUNGE_ACCEL`): a charge at a
  target behind brakes as hard as one at a target ahead pushes. Before, the
  band held a Ram at a rival 70 units behind down to the fight's floor and
  it never arrived, and a Lance at a rival 20 behind fell short.
- A dash down the road only carries 30% of its speed over that cap, and the
  excess is scrubbed off within a few ticks of the dash ending. (In 0.1
  dashes stacked: three in a row inside a lock reached twice the limiter.)
- Escorting a teammate within 26 units links you: both gain Drive.

### Fighting

Every attack has wind-up, active and recovery frames (60 ticks a second).

| Frame | X (primary) | Y (secondary) |
|---|---|---|
| Swift (forward) | Edge: three blade strikes, 20 / 22 / 40 damage | Lance Dash: armoured lunge across a 30 m gap, 56 damage, 12 Drive |
| Vector (midfielder) | Carbine: three-round burst to 62 m, 8 a round, a burst every 0.45 s; hold the trigger to keep firing (about 53 a second, against the blades' 75 to 80; it was 7 a round every 0.55 s, 38 a second) | Stun Kick: 34 damage, big knockback |
| Bulwark (defender) | Breaker: two hammer blows, 36 / 54, the second breaks guards | Scatter Cannon: six pellets inside 30 m, 6 each, ready again 1.5 s after the blast (it was 2.7 s) |

- **Guard** (LT, or RB; L on the keyboard): hits from the front do 15%
  damage and drain the guard gauge. At zero, or against a guard-breaking
  move, the guard shatters.
- **Parry**: raise the guard no more than 8 ticks before a melee blow lands
  and the attacker is staggered instead.
- **Dash** (A while locked on): a burst in the stick's direction with a few
  invulnerable frames.
- **Guard swing** (guard up, stick left or right, A): a fast arc round the
  target to that side, up to 180 degrees in 0.45 s at the distance it starts
  from. From further out it goes less far round, so it never carries a mech
  round faster than 150 u/s. Invulnerable for the first 60% of it; costs a
  dash's Drive and shares its cooldown; the guard comes down while it runs.
  A blow that staggers the mech ends it where it is. Guard up with the stick
  forward, back or centred, A is still the dash. Computer pilots sometimes
  swing round a blow aimed at them instead of hopping back.
- **A blow commits.** Locked on, an attack is aimed at its target as it
  starts; through its wind-up it turns after the target at only 3 rad/s
  (enough to follow a rival strafing at fighting range, nowhere near a
  guard swing), once live it does not turn at all, and its lunge goes the
  way it faces. So a swing that reads the tell takes the mech out of the
  blow's arc whether or not its invulnerability lasts that long. (Blows
  used to turn after their target at 12 rad/s throughout, and followed a
  swing round to land the moment its invulnerability ran out.)
- **Presses are buffered.** An attack, a heavy or (locked on) a dash pressed
  while the mech cannot do it yet, still in another move, staggered or
  cooling down, is kept for 8 ticks and done the moment it can be, so a
  press a beat early is not lost. A heavy pressed during a move of the
  mech's own (a blow of a combo, a dash) is kept until that move ends,
  however long it has left, and then thrown; it does not cut the move
  short. With a gun held down, a heavy pressed goes before the next round.
  (A heavy pressed early in a light blow used to be dropped, and one
  pressed with the carbine held was lost about half the time: the heavy
  "didn't come out".) A heavy refused while it recharges says so ("Lance
  Dash recharging: ready in 1.4 s"), and the hint for it dims, a line under
  it filling as it comes back (the touch button dims); the gun between
  rounds stays silent.
- **Guns work at racing speed** without a lock. Melee needs a lock; pressing
  attack near an enemy takes one for you.
- Four hits in a chain and the victim bursts free. A burst from a gun is one
  hit for this purpose (a carbine's three rounds, a scatter blast's pellets),
  so a carbine kept on a target sets it free on the fifth burst, not the
  second. A burst's rounds are counted from the first that landed, so the
  quicker carbine's bursts do not run together into one endless hit.
- **Heavies charge** (Y held): held through its wind-up, the Lance Dash,
  the Stun Kick or the Scatter Cannon holds at the end of it and charges for
  up to 0.6 s, then goes when let go: a full charge hits 60% harder (damage,
  guard damage and knockback), half a charge 30%. A tap throws it as before.
  The cooldown waits for the charge. Charging is a long tell: the mech is
  still in its wind-up, so a counter-hit catches it and a swing reads it.
  On the HUD a meter under the mech fills as it charges, with the bonus
  it has reached, and turns gold when full. Computer pilots charge too: a staggered rival is a free hit worth a full
  charge, a lance from a long run-up often, and otherwise now and then, the
  better pilot more often, but never with a blow coming their way (about 11
  charges a race across the six). Midfielders gunning at range close in now
  and then to kick, at once on a rival their carbine has staggered (about 9
  kicks a race, from one or two).
- **A hit costs control, not the race.** A clean hit takes about 1% of the
  victim's pace per 9 damage, never more than 12% (it was 1% per 4, up to
  35%). A mech staggered at racing speed keeps 90% of its throttle, and a
  shove from behind adds only a tenth of its knockback down the road.
- **Tempo.** Recovery frames are about 20% shorter than in the first build of
  0.2, the dash is ready again in 26 ticks (36), the Lance in 2 s (2.5), and
  the carbine, kick and scatter cannon all cycle faster. Computer pilots
  attack about 40% more often, fight longer before backing off, and hardly
  lift when waiting for a rival to come back to them.
- **Feedback.** Every swing draws an arc and every hit throws sparks in its
  weapon's colour (blade cyan, lance blue, kick green, hammer orange,
  carbine yellow, scatter red, Disruptor violet), heavy hits freeze the
  picture for a few hundredths of a second, and damage you deal or take
  rises off the target as a number. On a heavy blow, a parry or a guard
  break you are part of, and on any knockout you had a hand in, the camera
  darts in for a third of a second and back ("Punch-in on big hits" on the
  Camera tab sets how much, or turns it off). A knockout you had a hand in
  (landed, took, hurt the victim in the last 5 s, or were locked on to it)
  also plays in slow motion. A rival winding up a blow at you from off
  screen gets an arrow on the edge of the screen, in the colour of its
  tell.
  A button pressed during that freeze (or on a frame that ran no tick, as on
  a fast display) is kept for the next tick rather than lost.

#### Momentum strikes

Racing feeds fighting. A boost, an Overdrive, or a slipstream charged to half
or more (the point where its bonus is at full strength) primes your next blow
for 0.75 s after it ends; the HUD shows "Momentum" and your trails run hot.
The first melee blow you throw in that time is a momentum strike: 35% more
damage and guard damage, 50% more knockback, a quarter longer stagger, and a
flare and a boom so both pilots know. Only the first blow of a string takes
it, guns never do (a gunner sat in a slipstream would otherwise fire nothing
but charged rounds), and battle mode only spends it, never builds it. So the
way to open a fight is to arrive in it: boost up or tuck into the tow, then
strike as you get there. Computer pilots fly in hot like this too: a melee
pilot with its target ahead sometimes holds off the lock, runs up on the
infield side and swings on arrival.

#### Ring-outs

Heavy blows (the Edge finisher, the Lance, the Stun Kick, the Breaker Slam,
the scatter cannon, the Disruptor and a Ram) throw 30% harder across the road
than before, so a
rival standing between you and the barrier is in danger. A mech knocked into
the barrier while reeling is rung out: 14 damage plus 1.6 for every unit per
second it hit at (about 60 for a typical blow), a 36-tick tumble, and it is
thrown back off the wall into the fight rather than pinned to it. The ring-out
is credited to whoever last hit it: the damage counts as theirs, they get 8
Drive, and a ring-out that takes the last of the armour is their knockout.
The barrier answers every impact: a pulse of light where the mech struck and
a wave running away along the wall both ways, cyan for a glancing touch,
hot pink and bigger for a ring-out.

#### Reading a blow

Every heavy blow is telegraphed. As one winds up, a notched ring appears
round the attacker and closes on it, meeting the body as the blow lands; in
the last 8 ticks, the parry window, it turns white. The colour says what
answers it: gold, parry it (raise the guard as the ring turns white); red, a
guard breaker, so dash out of it; orange, a heavy gun, so guard. A rival
aiming one at you also gets a label over its name tag (Parry, Dodge or
Guard) and a sound, a soft rising ping for a parry and a low double thrum
for the rest. A combo finisher shows from the moment it is queued, not just
from its own wind-up. To leave time to read them, the heavy wind-ups are a
few ticks longer: Edge finisher 11 (was 8), Lance 15 (12), Stun Kick 12 (9),
Breaker Slam 20 (18).
- Armour at zero: retired. The pilot can still call team plays and ride a
  teammate's camera.

### Frames

| | Swift | Vector | Bulwark |
|---|---|---|---|
| Role | Forward | Midfielder | Defender |
| Armour | 1600 | 1600 | 2000 |
| Top speed (lap 3) | 160 u/s | 152.5 | 145 |
| Grip | 100 | 90 | 80 |
| Guard | 80 | 100 | 130 |
| Abilities | Overdrive, Break Away | Disruptor, Snare | Aegis, Ram |

The hangar's five bars: top speed, armour and handling from the table, and
two worked out from the attacks themselves (`src/client/ui/frameStats.ts`),
so a change to an attack shows in the readout. **Hitting power** is damage a
second, attack speed and all: the primary string thrown whole (each blow
cancelled into the next as early as it can be), half against an open rival
and half into a guard, plus half the secondary's, used whenever its
cooldown allows. **Combat range** is the furthest the frame hits from: a
gun's range, or a blow's reach plus the ground its lunge covers. Each is
shown against the best of the three (Swift 0.82 and 0.38, Vector 0.60 and
1.00, Bulwark 1.00 and 0.48). Hitting power was set by hand before (the
Vector 0.55), and there was no bar for the one thing the Vector does best.

### Team plays

Called on the D-pad by any human pilot; computer teammates obey. Calling the
current play again returns to Free. Online, a team of two people and one
computer pilot has a **shot caller**: only that person's calls count (see
[ONLINE.md](ONLINE.md)). A team of three people has nobody to order, and a
team whose people have all dropped out gets the computer captain.

| Play | Computer teammates will |
|---|---|
| Free | Play their role: forwards race, midfielders back up whoever is in a fight, defenders peel attackers off their own forward |
| Blitz | Attack whatever is near |
| Run | Avoid fights and race, defending only if cornered |
| Shield | Form up on their forward and hit anyone who comes close |
| Mark | All go for your locked target (or the rival forward if you have none) |

### Scoring and matches

- Placing points 15 / 7 / 5 / 3 / 2 / 1. A knocked-out mech gets none.
- 3 points to the team for each knockout it is credited with. They are kept
  even if the mech that scored them is knocked out later.
- So a team with the race winner (15) and two wrecks loses to a team placed
  second, third and fourth with both knockouts (15 + 6).
- **Support points** (see the table in section 1b) count for the team, up to
  8 per pilot a race. The same action on the same rival scores once every
  6 s; Back-up and Pressure pay by the damage instead. The results list
  each pilot's support points by action.

A match is one or more races between the same two teams (`src/sim/match.ts`):

- **Series**, best of 1, 3 or 5. Most points takes the round. Level on
  points, the round goes to the team whose mech was classified first.
- **Points race**. Round points add up; the first team to reach the target
  (50 or 80) at the end of a round wins. Both past it in the same round: the
  bigger total, then that round's winner.

The teams swap sides of the grid from one round to the next.

### Sprint

The other mode, picked where a match is set up (Free Play's setup, a room's
settings): **six Forwards, every pilot for themselves.** The race itself is
the same (laps, phases, gates, the limiter, weapons free on the battle lap);
what changes is who is on whose side.

- **No teams.** Each pilot is a team of their own (`RaceConfig.mode =
  'sprint'`: seat `n` is team `n`), so everything that tells rivals from
  allies works unchanged and everyone is everyone's rival. What is a team's
  is off: no team plays (`mayCall` is false, no computer captain), no
  escorts, no teammate radio, no support points (`award` gives none) and no
  knockout points.
- **Points by place**: 10 / 8 / 6 / 4 / 2 / 1 (`SPRINT_POINTS`). A
  knocked-out pilot scores none. A race is won by whoever wins it.
- **Cells.** With no teammates there is no share of a teammate's gate, and
  six pilots contest gates that go dark for 4 seconds once taken, so most
  of the field came up short: about 2.3 Cells banked a race, against 4 to 5
  for a team race's forward, with a third of the field into lap 2 with
  none. In a Sprint a gate taken and still dark pays whoever follows
  through it **half a Cell** (`rules.gateTrail`; the first through still
  takes it whole and darkens it, and following does not keep it dark any
  longer). Now about 3.3 to 4.3 banked, a tenth of the field into lap 2
  with none, and abilities used as often as a team race's forward uses
  them. Team races are unchanged.
- **People fly for no faction.** Each person races their own Forward, their
  custom one (made from their faction's stock Forward if they have none; a
  Sprint uses it whether or not they fly it in a team race), lit in their
  **pilot colour** (eyes, thrusters, trails), with the Zenith GP league's
  badge where a faction's emblem goes, and their name plate, running-order
  flag, standings line and room seat in the same colour. The colour is
  picked on the Pilot screen; until then it is their portrait's background's
  (the first five colours are the factions'). Computer pilots fill the
  places nobody has: each a faction's stock Forward in its livery (Kite in a
  Sunhawk, Shrike in a Razor, and so on).
- **The grid**: two by two, drawn by lot for the first race, then the
  standings reversed, so whoever leads starts at the back (`sprintGrid`).
- **Computer pilots** are out to win: whoever leads is the one to catch.
  They run the leader down from up to 450 m back (boosting to close the
  gap, still taking gates and strips on the way), and go after them again as
  the lead changes hands; on the speed lap they pounce on the leader as it
  comes past. The racer just ahead is the one in the way; the rest of the
  field they leave alone unless it starts something. Two may go after the
  leader together, a third only rarely, and nobody else draws a crowd.

A Sprint's formats (`src/sim/match.ts`, each pilot a side):

- **Single race.** Its winner wins.
- **3 or 5 races, most points.** Level on points: the more race wins, then
  the better finish in the last race.
- **First to 2 or 3 wins**, at most 5 or 7 races (six pilots could trade
  wins a long time). At the cap: the most wins, then the most points, then
  the better finish in the last race.

Online, the host sets a room to a Sprint (see [ONLINE.md](ONLINE.md)): its
places are fixed for the match when it starts, so the standings follow
each pilot. The Grand Prix stays a team event.

### The tutorial

The first playtest's main note was that nobody knew how to play. The
tutorial is a **guided first race**: one ordinary three-lap team race on
Meridian Skyway, in a Forward, in which the game stops at each new thing to
say what it is and what to press, then leaves a **try-it** up until it is
done. Nothing is failed: a try-it that has had its chance goes, with a word
if it deserves one. It is offered once, the first time Play is opened, and
lives under **How to play** on the Play menu (where Controls was) for
playing again; the pause menu skips it (the race goes on as an ordinary
one) or starts it over.

**Cards** (`src/client/game/tutorial.ts`) come from the race as it runs, not
from a script of times: on the grid, revving; a charge strip coming up; Drive
enough to boost on a straight; a gold gate coming up, lit; a tight corner
coming up (carving); sitting in a slipstream; the battle lap starting;
the partner in lock range; the lock taken; the partner's first heavy winding
up; then dashing and swinging, leaving the fight, and on the speed lap the
limiter coming off, Overdrive on a straight, the tow, and team plays. Each
shows at most once, one lesson at a time, at least 3.5 s of racing apart,
except those about what is happening right now (the grid, the battle and
speed laps, the lock taken, a heavy winding up, a knockout), which come at
once, or for a new lap or a knockout once the HUD's own banner for it has
played. A card holds the race and cannot be closed for its first 0.6 s, so a
press meant for the race cannot close it unread; the button that closes it
is swallowed so it does not also boost or dash. The words name each control
for the device in hand (`ui/keyNames.ts`). While the parry is being learnt,
the partner's heavies at you run at 0.4 speed.

**The race is a lesson** (`RaceConfig.lesson`, `src/sim`), so the duel can
be taught and the race cannot be lost to the lesson:

- **One sparring partner**, the rival forward. Nobody else fights you and
  nobody else fights it (no locks, no shots at racing speed, no Disruptor
  with either in reach, no Aegis over it, no escort on it). On the first two
  laps it keeps you company, 16 m ahead on the formation lap (somewhere to
  draft) and 10 m on the battle lap (somewhere to lock), lifting to let you
  come up. It duels you while, and only while, you are locked on to it:
  lets you land three clean blows first, without guarding (and gives you
  at least two seconds, and at most six, to land them), then throws only
  heavies, the Lance from its range or
  the blade string, whose last blow is one, about every 2.5 to 3 seconds,
  and never at a pupil below 40% armour. No Break Away, no flying in hot. On
  the speed lap it races.
- **The race goes at your pace.** The lap phase follows your lap, not the
  leader's, so the battle lap begins when you start it; and the flag falls
  10 seconds after you are home (not 25 after the winner), however far
  behind you are.
- **You cannot be knocked out**: you keep 15% of your armour whatever hits
  you.

The rival team's computer pilots fly at 0.3 skill, yours at 0.35.

**How to play** holds the tutorial, a **primer for each frame** and the
controls. A primer (`src/client/game/primers.ts`, `ui/screens/howto.ts`)
stands in the hangar with the frame in your colours in the bay: what the
frame is for, its job in a race in three lines, its weapons and abilities
(the hangar's own panel) and how it scores, the Midfielder's and the
Defender's support awards with their points (checked against the scoring
by the tests). One switches to the next with left and right, and one can
go straight to Free Play in it. The pause menu has the same guide for the
frame being flown. The first race in a Midfielder or a Defender (offline,
not the computer flying) puts one card on the grid, as the tutorial does:
the frame's weapons, its job and its abilities, pointing to the full guide.
Once per frame, per device.

### Replays and photo mode

Every race played offline can be **watched back** from its results
(**Watch the replay**): the last race only, for now, kept until the next one
starts. A replay is not a recording of the picture but of the race: its
setup (`RaceConfig`: seed, seats, rules, the lesson if it was the tutorial)
and the person's inputs, tick by tick (`src/client/game/replay.ts`). The
computer pilots are deterministic, so playing those inputs into a new race
from the same setup is the same race. Inputs are run-length encoded in the
wire format (`packInput`), and the race's own inputs are quantised the same
way as they are flown, so what is replayed is exactly what was raced; a
whole race is a few kilobytes to a few tens. Recording ends three seconds
after the flag.

Watching one first runs the whole race through in the background, a slice
a frame (`ReplaySession.prepare`), keeping a snapshot every 10 seconds
for **seeking**, and the race's **moments** for jumping to: the start, each
new lap, knockouts, ring-outs, your parries, changes of leader, the finish.
If the game has changed since the race (its rules, its pilots), the race no
longer plays out as it went: the end is checked against a fingerprint
taken when it was raced, and the bar says so.

A replay is watched with the bar at the foot of the picture: play and
pause, back and on 5 seconds, five speeds (¼ to 4), whose race to follow
(any of the six), the camera (the chase, the **trackside** cameras, the
orbit, or the **free** camera) and the next moment, each with its button for
the device in hand, and the timeline with the moments marked on it, to
click. The free camera (`game/freeCam.ts`) is turned round the pilot
followed by hand while the replay plays, in the road's frame so it holds
its angle through a fight: the right stick turns it and the triggers zoom;
on a desktop, drag the picture and turn the wheel; on a touch screen, drag
and pinch. Taking hold of it from any other camera switches to it, from
where the camera was. A knockout slows the
picture as in the race. The HUD is that of whoever is followed, without
the hints and plays. Its menu holds the moments as a list, photo mode,
the controls and the way back to the results.

The **trackside cameras** are a broadcast's: a camera by the road some way
ahead of the mech followed, on the outside of any bend, panning and zooming
to hold it the same size as it comes and goes past, then a cut to the next
once it is well past. Each is placed where it can see the mech's way up to
it (`render/sightlines.ts`: the solid scenery near the road, copied into a
grid over the ground plan, a line tested only against what lies in the
squares it crosses): beside the barrier at head height, else up over the
boards, else on a crane over the barrier, nearer or farther, or across the
road. A camera that loses the mech for more than half a second cuts away.

**Photo mode**, from the pause menu in a race offline and from a replay's
menu, holds the picture still and lets the camera be posed round the mech
followed: turned round it and raised (left stick, the keys or a drag),
nearer or farther (the triggers, Z and C, the wheel or a pinch), a longer or
wider lens and a tilt, with the HUD gone. The picture is saved as a PNG at
2560 pixels on its long side whatever the screen, named for the circuit and
the time; the hints can be hidden too.

### Before the race

Offline, a race opens with a **flight over the circuit**, the race held on
the grid: high over the start straight looking down it, then a cut to low
and fast up the road behind the grid, the field ahead (5.4 seconds, the
camera's `flyover`), under the circuit's **title card**: what is being raced
(the event and round), the circuit's name large, its laps and length, and
who races whom. Any press skips it; a restart goes straight to the grid, as
does the tutorial, and online (where the race does not wait for anyone) it
is left out. Then the countdown's sweep round the grid, as before.

### Trackside

What is round the road says what the race has done and what is coming:

- **Marks the race leaves** (`render/marks.ts`), kept for the race: a
  carve's lines from the skates and a boost's burns along the road, a
  scorch where a boost lit, a good start was launched, a hard landing or a
  knockout fell, soot on the barrier where a mech hit it (a scrape no more
  than every half second), and the pieces a knockout or a ring-out
  scatters, in the mech's colours. Each kind is one instanced mesh, its
  newest marks overwriting its oldest.
- **Brake boards** (`render/brakeBoards.ts`) before every tight corner
  (tighter than 250 m radius) that comes after 220 m of straight: three on
  its outside, 300, 200 and 100 m out (three bars, two, one, and the
  distance), behind the barrier with their faces above it, turned to the
  mechs coming up to them, wherever the road is plain. The kerbs and the
  chevrons on the corners' shoulders were there already (the road's
  shader).
- **The grandstands** (`render/grandstand/`, built in Blender by
  `art/blender/grandstand/build_grandstand.py`): up to four a side along
  the start straight, each a whole building, terraced rows of the crowd in
  five blocks between aisles, behind a parapet, walled at its ends and
  back, under a cantilevered roof on five columns with floodlights along
  its front. Their fronts stand 10 m back from the road's edge; none over a
  pit or reaching into another stretch of road's space. They stand upright
  whatever the road's banking. Under each, at its walls' foot, a ground
  floor: a slab on a grid of beams (along under its front wall, its middle
  and its back wall, across every 16 m). On the ground that is its
  foundation; where the road is raised higher than the walls go down (over
  the sea, a drop) it stands on columns down to the ground, as the road
  stands on its pylons: one under each crossing of the beams, on its
  footing, tied to its neighbours both ways every 10 m down. Under the sea (Abyss Line)
  they stand only in the air under the town's dome, never out in the
  water beside the road's tube. Without the model
  (the tests' tracks, built without loading it) the old raked crowd under
  a roof stands in.
- **Hover screens** (`render/screens/hoverScreens.ts`, built in Blender
  by `art/blender/hoverscreen/build_hoverscreen.py`): over the stands by
  the start (on each side the two nearest the line, within 200 m of it),
  a 32 m screen each, held up the way the world's machines fly, on
  lift nacelles ringed with light and a glow down from their emitters,
  drifting a little where it hangs, tipped toward the stands across the
  road. They show the crowd the race, picked the way a broadcast picks
  its pictures (`render/screens/director.ts`): the leader, cut between
  shots (chasing, beside it, ahead of it, from the air) every six and a
  half seconds, and between times a fight in the field (two rivals locked
  in battle, the one nearest the front); and cutting in for the moments
  as they happen, by how much each is worth: a knockout or a ring-out (at
  once, whatever is on), the winner crossing the line, a new leader, a
  heavy blow landed or a guard broken, a close pass, a lock-on. A moment
  holds a few seconds; anything but a knockout, a ring-out or the finish
  waits until the shot on has held two seconds, and is dropped if it is
  still not worth more than it after two and a half. Two pilots are framed
  together from beside them. Over it the broadcast's graphics: ZGP live,
  the lap, the story's banner (new leader, battle, overtake, knockout,
  ring-out, chequered flag) and its pilots' places and names; once the
  race is over, the winner. They hang 46 m up over the rows,
  never over the road, and only where nothing of them comes within the open
  sky over any stretch of road (40 m), so they never stand between a pilot
  and the racing: on the way down the straight they sit high at the top of
  the picture. The feed is the scene drawn again from its own camera into
  a 384 by 216 picture, 6, 10 or 15 times a second by the video quality,
  and only while a screen is in view; out on the lap it costs nothing.
- **The outposts** (`render/outposts/outposts.ts`, built in Blender by
  `art/blender/outposts/build_outposts.py`): what explains a circuit out in
  the wild, who built it and how everyone gets there. Corkscrew Canyon's
  paddock behind the stands (the teams' garages, their trucks, hospitality,
  a helipad, a mast, the crowd's car park in double rows round lit islands)
  and the highway in, crossing the gorges on bridges (abutments, girders,
  piers with their caps) past a fuel stop (a canopy over its pump islands,
  the shop behind); Titan's Rest's salvage camp (a fenced yard with a gate
  each end and the haul road between, tower cranes over the salvage and
  more of it under tarpaulins, containers stacked each on the one under it, the crews' cabins, two
  workshops with their trucks, a tank farm, a pad, a mast); Frostline's
  polar station (its modules on braced legs, linked, radomes, a hangar by
  the runway's head, a tank farm, a pad, a mast, flags along the runway).
  Every building is the kit's (a 40 ft container, a site cabin, a
  portal-frame workshop, a tower crane, and so on: each on its
  foundations, framed, closed, with a way in), placed in its site's frame
  and drawn instanced, one mesh to each kind's slot, its paint per building.
  What runs along the ground (fences on footed posts with braced corners
  and sliding gates, car park markings, runways, roads) is built in place.
  No building stands in another, or in the road's space. With the painted
  background each circuit lays its outposts sheet (C5, F4, R5) on them by a
  skin: which painted square goes on which kind's slot, how many metres one
  repeat covers and where it starts (a garage's door on the model's door, a
  container's side from its foot to its top rail), the buildings lit by the
  scene and the ground drawn as the painted ground round it is, unlit; the
  car park is laid out by its painted square, so the cars stand in its bays.
- **The crowd** (`render/crowd.ts`): cameras flashing all over the
  grandstands and flags in the two teams' colours waved along the front
  rows, going up (more flashes, flags waved harder) at the start, a lap
  begun, the flag, and a knockout or ring-out in front of them, then dying
  away over a few seconds.

### The podium

After a race offline, before the results, the first three home stand on
the **podium** (`render/podium/podium.ts`): those who finished, in the order
they did, never a pilot out of the race (`game/podium.ts`). It stands at
the side of the straight behind the start line, its back to the barrier
and the grandstand, facing across the road (on whichever side has the sun
on its front, and so on the three), and the race is out of sight while it
is up; the cameras keep to the road, short of the lamps along its edge. The set is built in Blender from code
(`art/blender/podium/build_podium.py`): three tiers sized for the mechs
(the winner's 4.6 m high), a backdrop of screens behind them, a lighting
truss on two towers. The game paints it: the tiers' numerals in gold,
silver and bronze; the middle screen shows the circuit, the winners and
the score in the winners' colours, the side ones the second and third;
the light strips take the winners' colour; six spotlights' beams sweep the
tiers.

They take their places in turn, the third, the second, then the winner,
each striking a **victory pose**, and the winner's sets off the confetti
from the stage's corners. The cameras cut from wide as they arrive, to in on
the winner, to the whole podium, drifting. A card for each comes up at the
foot of the screen as they pose. On to the results with confirm (or by
itself after 16 seconds); photo mode is a press away, posed round the
podium. The results' **The podium** brings it back.

Your **victory pose** is chosen in the hangar (the mech in the bay strikes
it as you choose): a fist in the air, both arms up, arms crossed, hands on
hips, pointing to the sky or a bow. Each is a held pose with a little
movement (the fist pumped, a bounce, a nod, a look round the crowd, a bow
every five seconds).
Computer pilots each have their own, by name. Three poses are open from
the start; the others are earned with Grand Prix medals, as some of the
livery is (CUSTOMIZATION.md, "Earned in the Grand Prix").

## 3. How it is built

```
          MechInput per seat, per tick
                    │
   ┌────────────────▼─────────────────┐
   │  src/sim   stepRace(race, track) │  pure TypeScript, no DOM,
   │  track · movement · combat · AI  │  deterministic, 60 ticks/s
   └────────────────┬─────────────────┘
                    │ RaceState + events
   ┌────────────────▼─────────────────┐
   │  Session (src/client/game)       │  LocalSession offline;
   │  owns the race, feeds it time    │  NetSession online
   └────────────────┬─────────────────┘
        ┌───────────┼───────────────┬──────────────┐
   RaceView      Hud / Menus     AudioEngine     Input
   (Three.js)    (DOM + CSS)     (Web Audio)   (pad, keys)
```

- **Track coordinates.** Everything in the simulation is `(s, d)`: distance
  along the centreline and lateral offset, plus a height above the road for
  mechs in the air. A circuit is either a flat plan of straights and arcs
  (Meridian) or a list of 3D pieces; either way the builder closes the loop
  and samples a full frame, width, walls and the rest every 4 units. The
  renderer turns `(s, d, h)` into world space from the same samples, adding
  the sideways and vertical offset of a fork's two routes.
- **Rules are data.** Everything a player might want to dial in is one flat
  object of numbers, `race.rules`, that lives in the race state. A race can
  be created with overrides, the tuning panel writes to it live, and one day
  a host's match settings will arrive the same way. Each rule has an allowed
  range and values from outside are clamped, never trusted.
- **Determinism.** One seeded random number generator lives in the race
  state. Same seed, same rules and same inputs give the same race, tick for
  tick. The tests check this, and that copying a race mid-run and continuing
  gives the same result.
- **Inputs are data.** A controller is six numbers per tick. Computer pilots
  produce the same six numbers a person does, so any seat can be either.
  Inputs are cleaned and copied before use. The session keeps any press
  made between ticks for the next one.
- **Events.** Each tick reports what happened. Effects, sound and the HUD
  are driven only by events and state.
- **Match layer.** Pure bookkeeping over finished races. It never touches a
  race in progress, so both formats use the identical race.
- **Feel is separate from rules.** Camera and effect settings are client
  values (`src/client/game/tuning.ts`); they never reach the simulation.
- **Rendering.** Three.js with a short post chain (bloom, then a speed pass:
  radial blur, streaks, vignette, flash). The mechs are built in Blender
  from their model sheets and exported as GLBs at three levels of detail,
  rigid on a joint skeleton (the first ones were assembled in code from a
  small kit); legs are solved by two-bone IK; the upper body blends a pose
  library. The 80s anime look sits on top behind one switch: cel tones on
  every material, an ink pass and a film pass, banded bloom, drawn speed
  lines and effects, poses on twos, and cuts of its own for big moments.
  See [ART.md](ART.md), and [VISUAL-WORKFLOW.md](VISUAL-WORKFLOW.md) for
  how its art is made and checked.
- **Sound.** Recorded songs (made in Suno: a race song on each circuit,
  built up lap by lap, and the menus', hangar's and results' music) and
  recorded sound effects, played through the same engine as the
  synthesised sound: engine, wind and the continuous layers, 55 effects (a
  recording plays in place of a recipe where there is one), and music that
  follows the lap phase, in a different style on each circuit, played with
  `?music=synth` and wherever a song cannot load. Every continuous layer (engine, wind, afterburner, strip hum,
  slipstream, scrape, carve, alarm) has its own level on the tuning panel
  (the carve's edge hiss follows the scrape slider, its tier hum the strip
  one), and the panel can play any one-shot by name.

## 4. Tuning

Two tools. In the game, the tuning panel (T): move a slider, feel it at
once, copy the values out when they are right. Outside it, the headless
runner: `npm run sim -- 200`, optionally with rule overrides.

With equal-skill computer pilots in all six seats, 200 races currently give:

| Measure | Value |
|---|---|
| Average race | 3:31 (laps of about 80, 69 and 62 s) |
| Knockouts per race | 0.56 (80 forwards, 19 midfielders, 14 defenders) |
| Winner's role | Forward 94.5%, midfielder 4.5%, defender 1% |
| Armour left at the flag | Forward 44%, midfielder 51%, defender 43% |
| Damage dealt per race | About 4,800 on the battle lap, 900 on the speed lap |
| Momentum strikes per race | 6.1, about 42 damage each |
| Ring-outs per race | 6.6, about 66 damage each (440 a race) |
| Parries per race | 10 |
| Entering lap 2 | 48 Drive per mech (they boost on lap 1 down to 45, a burn at a time); Cells: forwards 2.2, midfielders 1.9, defenders 1.7 |
| Abilities used per race | Overdrive 5.3, Disruptor 3.3, Break Away 2.8, Snare 2.6, Ram 2.5, Aegis 2.3 (60 races, 0.5) |
| Battle-lap pace | 370 mph against a 375 limiter (366 while locked on) |
| Leader at the start of lap 3 goes on to win | 55% |
| First finisher's team loses the round anyway | About 5% |
| Carve bursts per race (all six) | 49 at tier 1, 14 at tier 2, 6 at tier 3 (Meridian) |
| Support points per pilot | Vector about 6, Bulwark about 7 (of 8); they decide a round about one time in twenty |

And the case that prompted the lap 3 changes, two forwards alone on the
speed lap, the one behind on 50% armour and the leader on 90% (measured in
0.3):

| Start gap | Chaser has | What happens |
|---|---|---|
| 60 to 150 units | No Cells | Catches the leader every time; they reach the line within a few hundredths, and the chaser wins roughly a quarter to a half |
| 60 to 150 units | Two Cells (leader none) | Wins about nine in ten |
| 300 units | No Cells | Out of reach of the tow: loses by about 3 s |
| 300 units | One or two Cells | Catches up; wins a little under half |

Computer pilots do not defend a lead (no weaving out of a chaser's line, no
saved boost), so a person leading should do better than these figures and a
person chasing should not expect it to be this even.

## 5. What I could not judge

I can run races and read screenshots; I cannot feel the game. These need a
person with a gamepad, and all of them are on the tuning panel:

1. **Whether it now feels fast.** Speeds are up 15% on lap 1, 30% on lap 2
   and 25% on lap 3. The camera is lower and closer and opens up with speed,
   speed effects stay on in a lock, the walls have posts that strobe past,
   and the pad rumbles on boosts, hits and the wall (plain driving and
   steering are kept quiet so those stand out). Which of those does the work, and
   whether any of it is too much, is a matter of feel.
2. **Camera height.** A tall mech hides the road if the camera drops much
   further. The default is a compromise; Height, Distance and Look height
   are the three sliders to try first.
3. **How strong the tow should be on lap 3.** At +8% and 160 units a close
   finish between equal pilots is a coin toss. If leading feels pointless,
   lower "Tow, lap 3" or shorten the slingshot; if catching up is still too
   hard, raise them.
4. **Gates.** Whether a full Cell a gate, contested, is the right economy:
   whether 4 s dark is long enough to matter in a scramble and short enough
   that a chaser behind a leader still gets one ("Gate relights after" on the
   Drive and Cells tab), and whether they are too easy or too hard to thread.
5. **Ability strength.** Durations and sizes were set by reasoning and by
   computer pilots using them, not by play.
6. **Rival skill, the pack rule, how lethal lap 2 is against you**: as in 0.1.
7. **Sound.** The afterburner's rising whistle (the loud, high sound from
   lap 2 on, whenever a mech boosted or ran Overdrive) is gone; the
   afterburner is now a lower roar of filtered noise. The low-armour alarm
   beeps three times instead of sounding until the end of the race, the
   turbine whine no longer climbs past its lap 1 level, and the brightest
   hits are quieter. If another sound grates, the Sound tab plays each one by
   name and turns each layer down.
8. **Combat tempo and armour.** Armour is back down to 1600 (2000 for the
   Bulwark); "Armour" on the Combat tab scales every frame if a fight now
   ends too soon or still drags.
9. **Momentum, ring-outs and tells.** How long momentum lasts (0.75 s), what
   a momentum strike is worth (x1.35 damage, x1.5 knockback), how hard heavy
   blows throw toward the barrier (x1.3) and what a ring-out costs are all on
   the Combat tab. Whether the tells come early enough to parry on a read, and
   whether the ring is too much on screen ("Wind-up tells" on the Effects tab
   sizes it or turns it off), needs a person with a pad.
10. **Real devices.** Rendering has only been checked in a software-rendered
   headless browser. Frame rate on a real GPU, the gamepad code path, Safari
   and Firefox are untested.
11. **Carving.** Everything about how it feels: whether the carve should
   start at 55% of lock with the stick centred (too tight on a wide corner,
   or right), how much grip it adds, what it costs in speed, how quickly the
   tiers come and what the bursts are worth (all on the Carving tab). On the
   keyboard A and D only push a carve tight or wide, which should be playable
   but is untried. Whether the circuits now have the right number of tight
   corners, and whether a third-tier carve is too easy for a person holding
   it tight.
12. **The guard swing.** Whether half a circle in 0.45 s is too far or too
   fast (the camera swings round with it), whether it is too safe with 60% of
   it invulnerable, and whether LT is the right guard (RB still works).
13. **Support points.** Whether the actions pay the right amounts and whether
   8 a race is the right cap. Computer pilots end races with about 5 to 6
   (Vector) and 6 to 7 (Bulwark), and it decides a round about one time in
   twenty; people playing their roles on purpose should earn more. The
   Scoring tab has the cap, the cooldown and the Vector's damage figures.
14. **The new circuits.** Whether the Narrows is too narrow, whether the
   Bowl's banking reads, how the camera feels upside down in the loop and
   the corkscrew (it turns over with the road, a little less than fully),
   whether the jumps are pitched right (the Drop was made twice as wide
   after the first play, as it was cleared by a huge margin at any speed;
   it now needs 103 u/s against the formation-lap limiter of 110), and
   whether 70 armour and a couple of seconds is the right price for a
   fall.

## 6. Roadmap

**M1, done: solo race.** One circuit, three frames, computer pilots, team
plays, gamepad and keyboard, HUD, sound.

**M1.5, done: rules pass.** Speed ramp, lap 1 economy, Cells and abilities,
a lap 3 you can come back in, knockout points, match formats, feel pass,
tuning panel, then combat at race pace, momentum strikes, ring-outs,
wind-up tells and a lock that takes who you are looking at.

**M1.6, done: the track system.** A full 3D frame at every
point, air time, falls and the recovery drone, open edges, forks with a
middle wall, loops, corkscrews, banking grip and speed pads, and two
circuits that use them (Corkscrew Canyon and Helios Drop), each with its own
scenery and music. Meridian stays as the flat test course. 767 simulation
tests.

**M1.7, done (this version): racing and roles (0.4).** Carving, more boost
and Drive, contested gates, support points for the midfielder and defender,
guard on the left trigger and the guard swing, fights that are easier to
read, armour down, and the three circuits rebuilt round carving. 822
simulation tests.

**The 80s anime look (begun on the `art-80s` branch, now the default).**
Cel and ink, film, animation on twos, drawn effects, impact frames, painted
stills, title cards and an eyecatch, all behind one switch (G). The rules
are in [ART.md](ART.md), the way its art is made in
[VISUAL-WORKFLOW.md](VISUAL-WORKFLOW.md).

**M2 and M3, done: modes and online (0.5).** The garage split into a shared
hangar and a setup for each mode; Grand Prix (cups for medals, a season for
the Zenith Cup, the other factions' races run in the background); online
private rooms on a Colyseus server that runs `stepRace` as the authority,
with prediction on the clients, reconnecting, and squads of up to three
that move between rooms together. Matchmaking is still to come. How online
works, and how to host it, is in [ONLINE.md](ONLINE.md).

**A squad's Grand Prix online.** A squad of two or three races a cup, the
Grand Tour or a short season (one round robin: five matchdays, four
circuits drawn for it, then Zenith Ring) together against computer pilots,
in one sitting: the same events as offline (the full season, ten
matchdays, is offline only: a room cannot be put away and taken up later),
kept by the squad's room, with the other factions' fixtures raced on the
server. Nothing is recorded; an online Grand Prix
with results that count waits for matchmaking and accounts.

**M4, done (branch `mobile-ui`): phones, tablets and handhelds.** The
layout follows the picture's frame (the window, or the 4:3 box in it), not
the window: big frames keep the layouts as drawn; small ones (a phone held
sideways, a 640×480 handheld) get compact type and menus whose panes scroll
with the highlight (side by side, or one column on a 4:3 frame); a phone
held upright gets one column of menus, and a race there asks to be turned.
Touch controls: a floating stick, the throttle held for you, and a button
cluster that changes when you lock on; in a 4:3 picture on a wide phone they
sit in the bars either side. The race HUD's gauges became one cluster round
the speed in a corner (the Drive ring, armour and Cells, after Kingdom
Hearts' HP gauge), guard moved to a meter under your mech while it matters,
and the middle of the screen is clear. See `video.ts` (the frame and its
layout), `input/touch.ts` and `ui/dash.ts`.

**Later.** More circuits, parts and upgrades, a league, generated or modelled
mechs replacing the built-in ones (drop-in as glTF), spectating, replays.

## 7. Known gaps

- Computer pilots do not defend a lead on lap 3 and do not time a slingshot
  for the line.
- Almost every knockout is a forward. Support mechs are rarely in danger, so
  the "lose the round despite winning the race" result is possible but rare.
- Computer pilots carve by the line they want rather than holding a carve
  tight, so they seldom reach the third tier except in long hairpins. They
  never play for a Lead-out (it almost never happens in their races) and use
  the guard swing only to slip a blow, not to get round a guard.
- Support points are only shown in the results; there is nowhere to keep a
  pilot's record by role until there are accounts.
- Switching target is left and right only. There is no way to pick a target
  behind you, or one further than 125 units, without letting go first.
- Computer pilots do not set up ring-outs on purpose, beyond running up on the
  infield side when they fly in hot, and they read tells only by the same
  reaction-time rule as before (they do not see the ring).
- The tuning panel's sliders cannot be worked from the pad while a race is
  running, only from the pause menu.
- Online, a knockout's painted still is shortened and there is no slow
  motion: the race does not wait for anyone. A late hit can look a moment
  late on the other person's screen (the server decides every hit).
- Online rooms play the standard rules; there are no rule presets yet.
- No options screen yet (volume, quality, remapping).
- Mech-to-mech contact is a simple circle push; only a Ram does damage.
- The minimap marks a dark gate with an outline but does not show how long
  it has left.
- Computer pilots do not aim ring-outs at open edges, and never choose to
  jump a gap when slow; they also do not know a fall is credited.
- The minimap does not show gaps, open edges or a fork's two routes.
- A fork's routes are drawn apart, but the simulation treats them as two
  halves of one road; a projectile cannot fly from the upper route down to
  the lower one, which is right, but the reason is the wall, not the height.
