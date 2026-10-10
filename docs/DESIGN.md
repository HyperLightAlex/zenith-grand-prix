# Zenith GP: design document

Version 0.1. This describes the game as built, why it is built that way, and
what comes next. Numbers quoted here come from `src/sim/config.ts`; if the two
disagree, the code is right.

## 1. The idea

A team motorsport where fighting is legal. Two teams of three mechs race three
laps. Points go by finishing position (15, 7, 5, 3, 2, 1) and a mech that is
knocked out scores nothing. Because first place is worth as much as second,
third and fourth combined, every race turns on the two forwards: getting yours
home first, and stopping theirs.

Three decisions shape everything else:

- **Multiplayer first.** Any mix of people and computer pilots, always 3v3,
  with computer pilots in every empty seat. The race simulation is a
  self-contained, deterministic module so the same code can run in a browser
  for solo play and on a server for online play.
- **Hybrid steering.** Free steering while racing; lock on to a mech and the
  track carries you while the stick moves you around the target.
- **Combat must matter.** An earlier licensed game with these rules let you
  win by ignoring the fighting. Here damage is permanent, missing armour cuts
  your top speed on the last lap, a knockout zeroes your points, and a limiter
  keeps the field together for the whole battle lap.

## 2. Rules

### The race

- Standing start after a four-second countdown. Squeeze the throttle in the
  last 22 ticks (about a third of a second) before GO for a launch bonus.
  Holding it early, or blipping it, earns nothing.
- Three laps of Meridian Skyway, 8,640 units round. A lap is about 90 seconds
  on the limiter and about 73 on the speed lap; a race runs about 4.5 minutes.
- The lap phase follows the race leader:

| Lap | Name | Weapons | Speed |
|---|---|---|---|
| 1 | Formation | Locked | Limiter: 96 u/s (288 mph) for everyone |
| 2 | Battle | Free | Limiter still on |
| 3 | Speed | Free | Limiter off: each frame's own top speed |

- The race stays open for 25 seconds after the winner finishes. Anyone still
  running then is classified by distance and still scores. Only a knockout
  scores zero.

### The limiter and the pack

On laps 1 and 2 nobody free-steering can exceed the limiter except by:

- **Boost**: +16% while held, burning 15 Drive a second.
- **Slipstream**: +4% directly behind another mech (4 to 46 units back).
- **The pack rule**: the limiter is tied to the race leader. Fall more than
  40 units behind and it opens, up to +14% at 300 units. This is what keeps
  six mechs in one fight for the battle lap, and what lets a mech that has
  been beaten up rejoin.

On lap 3 top speed is the frame's own, scaled from 86% to 100% by remaining
armour. A forward at full health does 128 u/s (384 mph); a forward down to a
quarter of its armour is slower than a healthy defender.

### Free steering

- The stick turns the mech. How hard it can turn falls with speed, so every
  corner is flat at the limiter but the hairpin needs a lift on the speed lap.
- The inside line really is shorter, and worth taking.
- With the stick centred the mech straightens up along the road on its own.
  It will still run wide in a bend unless you steer.
- Barriers scrub speed. Racing contact shoves a mech sideways more than it
  spins it.

### Drive

One gauge, 0 to 100, starting at 35. It pays for boost, dashes and the
forward's Lance Dash. It fills slowly on its own, quickly on charge strips
(10 a second), in a slipstream, when linked to an escorted teammate, and from
dealing or taking damage. Several strips sit on the slower outside line, so
filling up costs track position.

### Lock-on

- LB locks the best enemy within 95 units (near, and roughly where you are
  facing). B locks a teammate instead (escort). The lock breaks if the target
  gets more than 125 units away for two-thirds of a second, retires or
  finishes.
- Locked on, the mech is in **battle mode**. It faces the target. Stick up
  closes, stick down backs off, left and right circle. The track carries you
  at the target's pace, eased toward the limiter so a long fight does not
  grind to a halt.
- In battle mode you can close on a target ahead at up to 4% over the
  limiter, no more. To catch someone who is running, or to get away, you
  let go and spend Drive on boost. That is deliberate: forcing a fight and
  escaping one both cost something.
- Escorting a teammate within 26 units links you: both gain Drive.

### Fighting

Every attack has wind-up, active and recovery frames (60 ticks a second).

| Frame | X (primary) | Y (secondary) |
|---|---|---|
| Swift (forward) | Edge: three blade strikes, 20 / 22 / 40 damage | Lance Dash: armoured lunge across a 30 m gap, 56 damage, 12 Drive |
| Vector (midfielder) | Carbine: three-round burst to 62 m, 6 a round | Stun Kick: 34 damage, big knockback |
| Bulwark (defender) | Breaker: two hammer blows, 36 / 54, the second breaks guards | Scatter Cannon: six pellets inside 30 m, 6 each |

- **Guard** (RB): hits from the front do 15% damage and drain the guard
  gauge. At zero, or against a guard-breaking move, the guard shatters and
  you are stunned for over a second.
- **Parry**: raise the guard no more than 8 ticks before a melee blow lands
  and the attacker is staggered instead. It needs a deliberate press after
  the button has been up for half a second; fluttering the button only blocks.
- **Dash** (A while locked on): a burst in the stick's direction with a few
  invulnerable frames. Forwards dash furthest and cheapest.
- **Guns work at racing speed** without a lock, with a little aim assist.
  Melee needs a lock; pressing attack near an enemy takes one for you.
- A hit staggers and slows. Four hits in a chain and the victim bursts free
  with brief invulnerability, so nobody is juggled forever.
- Knocked into a barrier while staggered: extra damage.
- Armour at zero: retired. The pilot can still call team plays and ride a
  teammate's camera.

### Frames

| | Swift | Vector | Bulwark |
|---|---|---|---|
| Role | Forward | Midfielder | Defender |
| Armour | 1600 | 1800 | 2200 |
| Top speed (lap 3) | 128 u/s | 122 | 116 |
| Grip | 100 | 90 | 80 |
| Guard | 80 | 100 | 130 |
| Character | Quick strings, best dash | Controls space at range | Slow, armoured, breaks guards |

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

A team with no human on it gets a computer captain who picks plays by lap and
reacts when its forward is in trouble.

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
   │  owns the race, feeds it time    │  a NetSession next
   └────────────────┬─────────────────┘
        ┌───────────┼───────────────┬──────────────┐
   RaceView      Hud / Menus     AudioEngine     Input
   (Three.js)    (DOM + CSS)     (Web Audio)   (pad, keys)
```

- **Track coordinates.** Everything in the simulation is `(s, d)`: distance
  along the centreline and lateral offset. The circuit is a list of straights
  and arcs with exact radii; the builder closes the loop, rounds the joins,
  and samples curvature. Both steering modes store the mech the same way, so
  locking on changes the controls and not the physics. The renderer turns
  `(s, d)` into world space from the same samples, so the two cannot disagree
  about where the road is. Elevation and banking are purely visual.
- **Determinism.** One seeded random number generator lives in the race
  state. Same seed and same inputs give the same race, tick for tick. The
  tests check this, and that copying a race mid-run and continuing gives the
  same result.
- **Inputs are data.** A controller is six numbers per tick. Computer pilots
  produce the same six numbers a person does, so any seat can be either, and
  a dropped player is replaced by leaving their input out. Inputs are cleaned
  and copied before use.
- **Events.** Each tick reports what happened (hits, knockouts, laps, plays
  called). Effects, sound and the HUD are driven only by events and state, so
  they will work unchanged from a server's stream.
- **Rendering.** Three.js with a short post chain (bloom, then a speed pass:
  radial blur, streaks, vignette, flash). Mechs are assembled in code from a
  small kit of tapered boxes and extruded profiles, tagged by livery slot,
  merged per limb, cel-shaded with an inverted-hull outline. Legs are solved
  by two-bone IK from foot targets; the upper body blends a pose library.
  Resolution drops automatically if frames run long.
- **Sound.** Synthesised at run time: engine, wind, 33 effects, and music
  that follows the lap phase. No audio files.

## 4. Tuning

The headless runner is the balance tool: `npm run sim -- 200`.

With equal-skill computer pilots in all six seats, 200 races currently give:

| Measure | Value |
|---|---|
| Team wins | 110 / 90 |
| Average race | 4:35 |
| Knockouts per race | 0.56 (106 forwards, 5 midfielders, 0 defenders) |
| Winner's role | Forward 75%, midfielder 23%, defender 2% |
| Armour left at the flag | Forward 40%, midfielder 63%, defender 62% |

Forwards take the most punishment because they are worth the most. The
intended counter is the Shield play and a defender doing its job.

## 5. What I could not judge

I can run races and read screenshots; I cannot feel the game. These need a
person with a gamepad, and they are the first things to tune:

1. **Steering weight and camera.** Turn rate, how far the camera sits back,
   how quickly it swings when you lock on.
2. **How lethal the battle lap is against you.** The numbers above are
   computer against computer. A knockout is permanent, which is true to the
   idea and harsh in practice. If it is too harsh, the alternative is a
   crash-and-recover (lose time and armour, score reduced) instead of
   retirement.
3. **Whether the formation lap earns its 90 seconds.** It has charge strips,
   slipstreaming and positioning. If it drags, shorten it or give it more to
   do.
4. **The pack rule.** It guarantees a fight. It also means you cannot build
   a lead before lap 3. That is the design, but it should feel fair.
5. **Rival skill.** Rookie, Pro and Ace change reaction time, guard and
   dodge rates and attack rhythm.
6. **Sound.** Levels were set by measurement. Whether the engine is pleasant
   for five minutes and the parry sounds rewarding is a listening call.
7. **Real devices.** Rendering was only checked in a software-rendered
   headless browser. Frame rate on a real GPU, on phones, and Safari and
   Firefox behaviour are untested.

## 6. Roadmap

**M1, done: solo race.** One circuit, three frames, two liveries, computer
pilots, team plays, gamepad and keyboard, HUD, sound, 277 simulation tests.

**M2, next: two browsers in one race.**
- A Node server (Colyseus room) runs `stepRace` as the authority. Clients
  send inputs stamped with a tick; the server holds the last input when one
  is late.
- Clients predict their own mech and interpolate the others. Floating-point
  maths is not bit-identical between a browser and Node, so this is
  snapshots and correction, not lockstep.
- A filtered view of the race state for clients (no AI internals, no RNG).
- Events get sequence numbers so none are lost or replayed.
- Invite link: create a room, share the URL, pick seats, computer pilots fill
  the rest.
- Needs a small hosted server.

**M3: parties and matchmaking.** Queue as a squad of up to three.

**M4: touch controls.** The game already runs on phones with a paired
gamepad; this adds an on-screen layout and probably auto-throttle.

**Later.** More circuits (a track is one data file), parts and upgrades (the
mech kit is already modular), a league with promotion, generated or modelled
mechs replacing the built-in ones (drop-in as glTF), spectating, replays
(inputs plus seed is a complete replay).

## 7. Known gaps

- A team with a human seat never gets a computer captain, even if that
  person has dropped out.
- No options screen yet (volume, quality, remapping).
- Lapped traffic is handled (collisions use track position, not race
  distance) but has had little testing, because the pack rule makes lapping
  rare.
- Mech-to-mech contact is a simple circle push; there is no ramming damage.
