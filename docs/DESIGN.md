# Zenith GP: design document

Version 0.2. This describes the game as built, why it is built that way, and
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

## 2. Rules

### The race

- Standing start after a four-second countdown. Squeeze the throttle in the
  last 22 ticks (about a third of a second) before GO for a launch bonus: a
  running start and 10 Drive. Holding it early, or blipping it, earns nothing.
- Three laps of Meridian Skyway, 8,640 units round. Laps take about 83, 70
  and 60 seconds; a race runs about 3:33.
- The lap phase follows the race leader:

| Lap | Name | Weapons and abilities | Speed |
|---|---|---|---|
| 1 | Formation | Locked | Limiter: 110 u/s (330 mph) for everyone |
| 2 | Battle | Free | Limiter: 125 u/s (375 mph) |
| 3 | Speed | Free | Limiter off: each frame's own top speed |

- The race stays open for 25 seconds after the winner finishes. Anyone still
  running then is classified by distance and still scores.

### The limiter and the pack

On laps 1 and 2 nobody free-steering can exceed the limiter except by:

- **Boost**: +20% while held, burning 15 Drive a second.
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

Two corners (the Harbour Hairpin and Drop Left) are now too tight to take
flat at a forward's top speed, so braking and line are worth time as well.

### Free steering

- The stick turns the mech. How hard it can turn falls with speed.
- The inside line really is shorter, and worth taking.
- With the stick centred the mech straightens up along the road on its own.
- Barriers scrub speed. Racing contact shoves a mech sideways more than it
  spins it.

### Drive

One gauge, 0 to 100. It pays for boost, dashes and the forward's Lance Dash.

- It starts **empty**.
- On the formation lap it comes from the charge strips and nowhere else, at
  6 a second. A typical pilot starts lap 2 with about 50.
- From lap 2 the strips give 10 a second, and it also trickles in slowly,
  in a slipstream, when linked to an escorted teammate, and from dealing or
  taking damage.

### Cells and gates

A second resource, 0 to 3, starting at none, that pays for abilities.

- Six gold gates stand on the circuit. Thread one (your centre has to pass
  between the posts) for half a Cell. Each gate scores once a lap.
- Each sits where taking it costs something: across the road from a charge
  strip, on the outside of a corner, or on the long way round the hairpin.
  A clean formation lap fills you; computer pilots average about one and a
  half.
- The gates stay lit for the whole race. In the first build of 0.2 they went
  out after lap 1, which meant one Cell spent in defence on lap 2 left a
  forward with no Overdrive and no way back on lap 3. Now a spent Cell can be
  earned back, and the cost is position: two gates off the racing line for
  one more use.
- What a gate is worth after lap 1 is its own rule (`gateValueLater`), so the
  later laps can be made stingier, or switched off, from the tuning panel.
  Computer pilots only go back for gates when they have no Cell left.

### Abilities

One button, two abilities per frame, by the rule the game already uses for A
(boost when free, dash when locked on). One Cell each. They arm with the
weapons at the start of lap 2.

| Frame | Free steering | Locked on |
|---|---|---|
| Swift | **Overdrive**: 4 s, top speed +30%, armour penalty ignored, burns off a Snare. Takes the place of boost while it runs | **Break Away**: also works while staggered. Ends the stagger, clears a Snare, 40 ticks of invulnerability, drops every enemy lock on you, no enemy can lock you for 1.5 s, and you are released at 10% over your cap |
| Vector | **Snare**: a fast bolt with aim assist out to 100 units. On a clean hit the target's speed cap is 74% for 3.5 s and it cannot boost | **Disruptor**: every enemy within 26 units takes a heavy hit that breaks through armoured wind-ups, and loses 30 Drive |
| Bulwark | **Ram**: 3.5 s, +12% speed, cannot be staggered, slowed or snared, three times the mass. Each enemy its front runs into takes 80 damage once and is thrown sideways; a wall on the far side does the rest | **Aegis**: the defender and every teammate within 34 units take 35% damage and cannot be staggered for 4 s |

Counters: a guard reduces a Ram or a Disruptor to a block (neither can be
parried); an Aegis ignores a Snare and takes the sting out of a Ram; a dodge
slips a Ram without using it up; Snare and Disruptor are refused, at no cost,
if there is nobody they would reach.

### Lock-on

- LB locks the best enemy within 95 units. Clicking the left stick locks a
  teammate instead (escort). The lock breaks if the target gets more than 125
  units away for two-thirds of a second, retires or finishes.
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
- A fight is never carried slower than 90% of the limiter (70% before), and
  movement around the target is 60% quicker than in 0.1, so the battle lap
  runs at about 369 mph against the 375 limiter, locked on or not. In the
  first build of 0.2 a long fight averaged 338 mph, and a stagger at racing
  speed could bring a mech nearly to a stop.
- You can close on a target ahead at up to 4% over the limiter, no more. To
  catch someone who is running, or to get away, you let go and spend Drive.
- A dash down the road only carries 30% of its speed over that cap, and the
  excess is scrubbed off within a few ticks of the dash ending. (In 0.1
  dashes stacked: three in a row inside a lock reached twice the limiter.)
- Escorting a teammate within 26 units links you: both gain Drive.

### Fighting

Every attack has wind-up, active and recovery frames (60 ticks a second).

| Frame | X (primary) | Y (secondary) |
|---|---|---|
| Swift (forward) | Edge: three blade strikes, 20 / 22 / 40 damage | Lance Dash: armoured lunge across a 30 m gap, 56 damage, 12 Drive |
| Vector (midfielder) | Carbine: three-round burst to 62 m, 6 a round | Stun Kick: 34 damage, big knockback |
| Bulwark (defender) | Breaker: two hammer blows, 36 / 54, the second breaks guards | Scatter Cannon: six pellets inside 30 m, 6 each |

- **Guard** (RB): hits from the front do 15% damage and drain the guard
  gauge. At zero, or against a guard-breaking move, the guard shatters.
- **Parry**: raise the guard no more than 8 ticks before a melee blow lands
  and the attacker is staggered instead.
- **Dash** (A while locked on): a burst in the stick's direction with a few
  invulnerable frames.
- **Guns work at racing speed** without a lock. Melee needs a lock; pressing
  attack near an enemy takes one for you.
- Four hits in a chain and the victim bursts free.
- Knocked into a barrier while staggered: extra damage.
- **A hit costs control, not the race.** A clean hit takes about 1% of the
  victim's pace per 9 damage, never more than 12% (it was 1% per 4, up to
  35%). A mech staggered at racing speed keeps 90% of its throttle, and a
  shove from behind adds only a tenth of its knockback down the road.
- **Tempo.** Recovery frames are about 20% shorter than in the first build of
  0.2, the dash is ready again in 26 ticks (36), the Lance in 2 s (2.5), and
  the carbine, kick and scatter cannon all cycle faster. Computer pilots
  attack about a third more often and fight longer before backing off.
- **Feedback.** Blade strikes draw an arc in the attacker's colour (gold for
  a finisher), heavy hits freeze the picture for a few hundredths of a
  second, and damage you deal or take rises off the target as a number.
- Armour at zero: retired. The pilot can still call team plays and ride a
  teammate's camera.

### Frames

| | Swift | Vector | Bulwark |
|---|---|---|---|
| Role | Forward | Midfielder | Defender |
| Armour | 1800 | 1800 | 2200 |
| Top speed (lap 3) | 160 u/s | 152.5 | 145 |
| Grip | 100 | 90 | 80 |
| Guard | 80 | 100 | 130 |
| Abilities | Overdrive, Break Away | Snare, Disruptor | Ram, Aegis |

### Team plays

Called on the D-pad by any human pilot; computer teammates obey. Calling the
current play again returns to Free.

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

A match is one or more races between the same two teams (`src/sim/match.ts`):

- **Series**, best of 1, 3 or 5. Most points takes the round. Level on
  points, the round goes to the team whose mech was classified first.
- **Points race**. Round points add up; the first team to reach the target
  (50 or 80) at the end of a round wins. Both past it in the same round: the
  bigger total, then that round's winner.

The teams swap sides of the grid from one round to the next.

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
   │  Session (src/client/game)       │  LocalSession today;
   │  owns the race, feeds it time    │  a NetSession later
   └────────────────┬─────────────────┘
        ┌───────────┼───────────────┬──────────────┐
   RaceView      Hud / Menus     AudioEngine     Input
   (Three.js)    (DOM + CSS)     (Web Audio)   (pad, keys)
```

- **Track coordinates.** Everything in the simulation is `(s, d)`: distance
  along the centreline and lateral offset. The circuit is a list of straights
  and arcs with exact radii; the builder closes the loop, rounds the joins,
  and samples curvature. The renderer turns `(s, d)` into world space from
  the same samples. Elevation and banking are purely visual (this is the
  part the track system milestone replaces).
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
  Inputs are cleaned and copied before use.
- **Events.** Each tick reports what happened. Effects, sound and the HUD
  are driven only by events and state.
- **Match layer.** Pure bookkeeping over finished races. It never touches a
  race in progress, so both formats use the identical race.
- **Feel is separate from rules.** Camera and effect settings are client
  values (`src/client/game/tuning.ts`); they never reach the simulation.
- **Rendering.** Three.js with a short post chain (bloom, then a speed pass:
  radial blur, streaks, vignette, flash). Mechs are assembled in code from a
  small kit, cel-shaded with an inverted-hull outline; legs are solved by
  two-bone IK; the upper body blends a pose library.
- **Sound.** Synthesised at run time: engine, wind, 42 effects, and music
  that follows the lap phase. No audio files. Every continuous layer (engine,
  wind, afterburner, strip hum, slipstream, scrape, alarm) has its own level
  on the tuning panel, and the panel can play any one-shot by name.

## 4. Tuning

Two tools. In the game, the tuning panel (T): move a slider, feel it at
once, copy the values out when they are right. Outside it, the headless
runner: `npm run sim -- 200`, optionally with rule overrides.

With equal-skill computer pilots in all six seats, 200 races currently give:

| Measure | Value |
|---|---|
| Average race | 3:33 (laps of about 83, 70 and 60 s) |
| Knockouts per race | 0.43 (77 forwards, 4 midfielders, 5 defenders) |
| Winner's role | Forward 94%, midfielder 6%, defender under 1% |
| Armour left at the flag | Forward 38%, midfielder 57%, defender 49% |
| Damage dealt per race | About 5,100 on the battle lap, 1,000 on the speed lap |
| Entering lap 2 | 1.5 Cells and 50 Drive per mech |
| Abilities used per race | One to three of each (Ram, Overdrive and Snare most) |
| Battle-lap pace | 369 mph against a 375 limiter (366 while locked on) |
| Leader at the start of lap 3 goes on to win | 43% |
| First finisher's team loses the round anyway | About 1% |

And the case that prompted the lap 3 changes, two forwards alone on the
speed lap, the one behind on 50% armour and the leader on 90%:

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
   and the pad rumbles with the road. Which of those does the work, and
   whether any of it is too much, is a matter of feel.
2. **Camera height.** A tall mech hides the road if the camera drops much
   further. The default is a compromise; Height, Distance and Look height
   are the three sliders to try first.
3. **How strong the tow should be on lap 3.** At +8% and 160 units a close
   finish between equal pilots is a coin toss. If leading feels pointless,
   lower "Tow, lap 3" or shorten the slingshot; if catching up is still too
   hard, raise them.
4. **Gates.** Whether six half-Cells a lap is the right economy now that the
   gates stay lit (abilities are used about twice as often as when they went
   out after lap 1), whether they are too easy or too hard to thread, and
   whether lap 1 has enough to do.
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
8. **Combat tempo.** Fights now stay at race pace and every move recovers
   sooner. Knockouts went up from 0.28 to 0.43 a race even with the forward's
   armour raised from 1600 to 1800; if lap 2 is now too lethal for a forward,
   that armour figure (in `config.ts`) is the first thing to raise.
9. **Real devices.** Rendering has only been checked in a software-rendered
   headless browser. Frame rate on a real GPU, the gamepad code path, Safari
   and Firefox are untested.

## 6. Roadmap

**M1, done: solo race.** One circuit, three frames, computer pilots, team
plays, gamepad and keyboard, HUD, sound.

**M1.5, done (this version): rules pass.** Speed ramp, lap 1 economy, Cells
and abilities, a lap 3 you can come back in, knockout points, match formats,
feel pass, tuning panel. 718 simulation tests.

**Next: the track system.** Loops, corkscrews, jumps, open edges, narrow
sections and splits. This means giving the track a full 3D frame at every
point (the road's "up" is currently assumed to be near the world's), air
time in the simulation, and a second circuit that uses it. Meridian stays as
the flat test course.

**M2: two browsers in one race.**
- A Node server (Colyseus room) runs `stepRace` as the authority. Clients
  send inputs stamped with a tick.
- Clients predict their own mech and interpolate the others. Floating-point
  maths is not bit-identical between a browser and Node, so this is
  snapshots and correction, not lockstep.
- A filtered view of the race state for clients, sequence numbers on events.
- Invite link: create a room, share the URL, pick seats.

**M3: parties and matchmaking.** Queue as a squad of up to three.

**M4: touch controls.**

**Later.** More circuits, parts and upgrades, a league, generated or modelled
mechs replacing the built-in ones (drop-in as glTF), spectating, replays.

## 7. Known gaps

- Computer pilots do not defend a lead on lap 3 and do not time a slingshot
  for the line.
- Almost every knockout is a forward. Support mechs are rarely in danger, so
  the "lose the round despite winning the race" result is possible but rare.
- Switching target is left and right only. There is no way to pick a target
  behind you, or one further than 125 units, without letting go first.
- The tuning panel's sliders cannot be worked from the pad while a race is
  running, only from the pause menu.
- A team with a human seat never gets a computer captain, even if that
  person has dropped out.
- No options screen yet (volume, quality, remapping).
- Mech-to-mech contact is a simple circle push; only a Ram does damage.
