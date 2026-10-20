# Suno sound effects

Prompts for the recorded sound effects, written for Suno's **Sounds** mode
(Create, then the Sounds tab): the prompt in the box, Type **One Shot**,
no BPM, and a Key only where one is given. Each generation gives two takes.
Kept here so the next one is made from what the last ones taught.

What the game needs from every one: the sound itself and nothing else (no
music, no bed of room tone), starting on the hit with no run-up of silence,
and dry: the game adds its own reverb and pans each sound to where it
happens. A take that runs long is fine (the build trims it; Suno makes two
seconds at the least, whatever is asked). WAV if Suno offers it, MP3
otherwise.

The sound to aim for is an anime one: short, dry and bright, in the mids
and the top, with an instant attack. Not a film trailer's. **What the first
takes taught** (the hits and swings): asked plainly, Suno's Sounds lean
cinematic, with a sub-bass boom under everything (85 to 90% of the heavy
ones' energy below 150 Hz, and half or more of the light ones'), a long
reverberant tail (the light hit 0.9 s to fall 20 dB, the heavy 1.4 to 2 s)
and a slow swell (the swings peaking 0.3 to 0.6 s in, when the blow lands
0.1 s after the swing sound starts). That sits on the music's kick and
bass, smears a three-hit string into one wash, and lands late. So every
prompt now opens with the length and "anime ... sound effect", asks for an
instant attack, and ends "dry, no bass, no boom, no reverb" (the big ones:
"no long rumble"). The build can shape a take that still comes out heavy
(sounds.json: a high-pass, a start just before its peak, a shorter cut;
see README.md), but a take that is right to begin with keeps more of
itself.

**The anime prompts worked.** The hit_light prompt's takes came back
bright (centred at 3 to 5 kHz), short (gone in half a second) and dry,
and nine of them were enough for three sounds: the single clean cracks
for hit_light; the two with a thud or a double crunch under the crack for
block (they sound like energy: the force field taking it); and the
crackling, ringing ones for hit_heavy (they sound like contact: metal
striking metal). That last pair was sorted by ear: going by the measures,
crackle and ring had seemed the electric ones, the shield's, and the thud
the blow's. Listen before deciding what a take is for. Whooshes still build slowly (the light swings peak 0.35 to 0.45
s in), which the build's `lead` takes care of; and a take can hold two
sounds (the heavy swing's did), which split into two takes.

**The second round** (hits redone, blocks, guns, parry, shield break,
momentum hit, knockout, wall): asked for one shot, the carbine came back
as bursts, several shots each with a falling zap, over a noise bed. The
game plays one sound a shot (three shots 67 ms apart), so the build cuts
each burst at its shots (sounds.json `split`, the times read off the
spectrograms: the third burst's are 60 to 71 ms apart, close to the
game's own) into single shots, eleven in all. The scatter cannon sounded
slowed down; the build plays it 12% faster (`speed`). The blocks and
some hits still carry deep low end (the light block's energy centres
near 50 Hz: an electric buzz), which was kept, these having been chosen
by ear; only what lies below about 30 to 80 Hz is cut.

Name each file you keep after its sound, as in the table: `hit_heavy.wav`;
a second take of the same sound `hit_heavy-2.wav`, and so on. Sounds heard
over and over (marked "takes: 3") sound stamped out with one recording, so
keep several; the game picks among them each time, and varies the pitch a
little on top.

Not here, on purpose: the menu blips, the countdown, the lap and finish
stingers, the win and lose jingles, the gate and charge chimes, the lock-on
beeps and the warnings. They are tuned to the songs' keys or need to be
sharp signals, and they stay synthesised for now. The continuous sounds
(engine, wind, carve, slipstream) stay synthesised too; the wall scrape is
due for another look later.

| For | Sound | Status |
|---|---|---|
| Combat | swing_light, swing_heavy | in the game: anime takes (the heavy one take holding two swings, split) |
| Combat | hit_light, hit_heavy | in the game: the anime prompts' takes, the second round |
| Combat | block, block_heavy | in the game: one take each, a block for light blows and one for heavy (block_heavy was added for these) |
| Combat | parry, guard_break, momentum_hit, ko | in the game |
| Combat | shot_carbine, shot_scatter, bullet_hit | in the game (the carbine's takes, bursts, cut into eleven single shots; the scatter cannon's played 12% faster) |
| Combat | ringout | asked for |
| Movement and the circuit | wall | in the game |
| Movement and the circuit | the rest (boost … recover, 14 to 24) | asked for |
| Abilities | overdrive … aegis (25 to 31) | asked for |

## 1. Combat

What a fight sounds like: the blows and the guns. Heard most, so first.

1. **swing_light**: the Forward's quick blade strikes, and every light
   swing as it comes round. Takes: 3.

```
0.3 second anime sword swish sound effect, thin bright high-pitched whoosh, very fast, instant attack, dry, no bass, no boom, no reverb
```

2. **swing_heavy**: a heavy blow winding up and coming round: the Edge
   Finish, the Lance Dash, the Stun Kick, the Defender's hammer. Takes: 2.

```
0.5 second anime heavy weapon swing sound effect, fast swoosh with a metallic whistle, instant attack, punchy, dry, no sub bass, no rumble, no reverb
```

3. **hit_light**: a blade or a light blow landing on armour. Takes: 3.

```
0.3 second anime hit sound effect, snappy sharp metallic clank with a bright crack, instant attack, very short, dry, no bass, no reverb
```

4. **hit_heavy**: a heavy blow landing: crunching armour. Takes: 2.

```
0.6 second anime heavy impact sound effect, punchy crunchy metal crash with a quick thud, instant attack, bright, short decay, no long rumble, no cinematic boom, no reverb
```

5. **block**: a blow stopped dead by a raised guard shield. Takes: 2.

```
0.4 second anime shield block sound effect, hard bright energy clash with an electric zing, instant attack, dry, no bass, no reverb
```

5b. **block_heavy**: a heavy blow stopped by a raised guard (the block
    above is for the light ones). Made from a prompt of its own, not kept
    here.

6. **parry**: a guard raised at the last moment, turning the blow aside.
   The anime sword-clash ring. Takes: 2.

```
1 second anime sword clash sound effect, bright ringing metallic kiiin, instant attack, clean high ring that fades out, no bass, no boom, no reverb
```

7. **guard_break**: the Defender's slam smashing a guard shield apart.

```
0.8 second anime shield break sound effect, bright glassy shatter with an electric crackle, instant attack, dry, no bass, no boom, no reverb
```

8. **momentum_hit**: a blow thrown out of a boost, landing with everything
   behind it.

```
0.8 second anime heavy smash sound effect, explosive crunchy metal crash, instant attack, punchy and bright, short decay, no long rumble, no cinematic boom, no reverb
```

9. **ringout**: a mech slammed into the electric barrier at the edge of
   the track.

```
1 second anime crash into an electric fence sound effect, loud metal clang with a crackling electric zap, instant attack, short decay, no long rumble, no reverb
```

10. **ko**: a mech knocked out: it blows up. Takes: 2.

```
1.5 second anime robot explosion sound effect, sharp punchy blast with crackling debris, instant attack, bright, no long rumble, no cinematic boom
```

11. **shot_carbine**: the Midfielder's carbine, one shot (it fires in
    quick bursts, so short and punchy, and not shrill). Takes: 3.

```
0.2 second anime laser gun shot sound effect, crisp bright zap, instant attack, very short, dry, no bass, no reverb
```

12. **shot_scatter**: the Defender's scatter cannon. Takes: 2.

```
0.5 second anime shotgun blast sound effect, punchy bright bang with a metallic rattle, instant attack, dry, no long rumble, no reverb
```

13. **bullet_hit**: carbine rounds striking armour. Heard constantly in a
    gunfight, and quietly, so small and clean. Takes: 3.

```
0.1 second tiny anime bullet ricochet sound effect, quick bright metallic ping, instant attack, very short, dry, no bass, no reverb
```

## 2. Movement and the circuit

14. **boost**: a boost lighting up.

```
0.8 second anime rocket boost sound effect, bright jet thruster burst, instant attack, fast whoosh, dry, no long rumble, no reverb
```

15. **dash**: a quick sidestep on thrusters. Takes: 2.

```
0.3 second anime dash sound effect, quick thin jet whoosh, instant attack, very fast, dry, no bass, no reverb
```

16. **carve_burst**: letting go of a carve: the skates' edges snap off the
    road and the stored speed kicks in.

```
0.5 second anime speed burst sound effect, sharp skid release into a bright whoosh, instant attack, dry, no bass, no reverb
```

17. **launch**: the start: the whole grid going off the line.

```
1.2 second anime race start sound effect, thrusters igniting into a bright rising rush, quick attack, dry, no long rumble, no reverb
```

18. **takeoff**: leaving a ramp, into the air.

```
0.5 second anime jump sound effect, metallic clunk into a quick rising whoosh, instant attack, dry, no bass, no reverb
```

19. **land**: coming back down on the skates. Takes: 2.

```
0.5 second anime robot landing sound effect, heavy metal stomp with a clank and a short wheel skid, instant attack, punchy, dry, no long rumble, no reverb
```

20. **wall**: a mech glancing off the barrier. Takes: 2.

```
0.4 second anime metal clang sound effect, robot glancing off a steel barrier, bright clang with a quick scrape, instant attack, dry, no bass, no reverb
```

21. **bump**: two mechs bumping shoulders. Takes: 2.

```
0.2 second anime bump sound effect, dull metal thud between two robots, instant attack, very short, dry, no reverb
```

22. **pad**: running over a speed pad.

```
0.4 second anime speed pad sound effect, bright rising electric zip, instant attack, dry, no bass, no reverb
```

23. **fall**: going over the edge, dropping out of sight.

```
1.2 second anime falling sound effect, descending whistle and wind dropping in pitch, fading away, dry, no bass, no reverb
```

24. **recover**: the recovery drone setting a fallen mech back on the
    track.

```
1.2 second anime drone sound effect, quick hovering rotor whir, a mechanical clamp releasing with a clunk, two soft bright chimes, dry, no bass, no reverb
```

## 3. Abilities

Each wants its own clear identity: a player should know what was just
used from the sound alone.

25. **overdrive**: the Forward's Overdrive firing, on the speed lap: a
    few seconds far past top speed.

```
1.5 second anime power-up sound effect, turbine spooling up into a bright roaring jet blast, quick rising whine, dry, no long rumble, no reverb
```

26. **breakaway**: the Forward's Break Away: shaking off every lock,
    even mid-hit, and bursting clear.

```
0.6 second anime speed burst sound effect, sharp bright shing with a rushing whoosh, instant attack, dry, no bass, no reverb
```

27. **snare_shot**: the Midfielder firing the Snare bolt.

```
0.6 second anime harpoon shot sound effect, electric zap then a steel cable snapping taut with a twang, instant attack, dry, no bass, no reverb
```

28. **snared**: caught by a Snare: clamped, the speed dragged off.

```
0.8 second anime electric trap sound effect, metal clamp latching with a zap, then a power-down whine sinking lower, dry, no bass, no reverb
```

29. **pulse**: the Disruptor's pulse going off.

```
0.8 second anime electromagnetic pulse sound effect, bright electric shockwave burst with crackling sparks, instant attack, dry, no long rumble, no reverb
```

30. **ram**: the Defender's Ram.

```
1 second anime charge attack sound effect, revving engine snarl rising into a horn-like roar, quick attack, dry, no long rumble, no reverb
```

31. **aegis**: the Aegis bubble going up over the team. Key: G major (the
    one chord that sits with every song the game plays).

```
1 second anime shield power-up sound effect, bright rising shimmer into a warm sparkling chord, quick attack, dry, no bass, no reverb
```
