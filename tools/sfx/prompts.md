# Suno sound effects

Prompts for the recorded sound effects, written for Suno's **Sounds** mode
(Create, then the Sounds tab): the prompt in the box, Type **One Shot**,
no BPM, and a Key only where one is given. Each generation gives two takes.
Kept here so the next one is made from what the last ones taught.

What the game needs from every one: the sound itself and nothing else (no
music, no bed of room tone), starting on the hit with no run-up of silence,
and dry: the game adds its own reverb and pans each sound to where it
happens. A take that runs long is fine (the build trims it). WAV if Suno
offers it, MP3 otherwise.

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
| Combat | swing_light … bullet_hit (1 to 13) | asked for |
| Movement and the circuit | boost … recover (14 to 24) | asked for |
| Abilities | overdrive … aegis (25 to 31) | asked for |

## 1. Combat

What a fight sounds like: the blows and the guns. Heard most, so first.

1. **swing_light**: the Forward's quick blade strikes, and every light
   swing as it comes round. Takes: 3.

```
0.3 second fast whoosh of a giant robot swinging a steel sword, sharp air cut with a thin metallic ring, anime mecha, close and dry, no music
```

2. **swing_heavy**: a heavy blow winding up and coming round: the Edge
   Finish, the Lance Dash, the Stun Kick, the Defender's hammer. Takes: 2.

```
0.6 second heavy whoosh of a giant robot swinging a huge steel hammer, deep air displacement with a servo whine, anime mecha, close and dry, no music
```

3. **hit_light**: a blade or a light blow landing on armour. Takes: 3.

```
0.4 second sword strike on thick metal armor, sharp metallic slash impact with a spray of sparks, anime mecha, close and dry, no music
```

4. **hit_heavy**: a heavy blow landing: crunching armour. Takes: 2.

```
0.8 second heavy metal impact, giant robot struck by a steel hammer, crunching armor plates and a deep thud, sparks, anime mecha, close and dry, no music
```

5. **block**: a blow stopped dead by a raised guard shield. Takes: 2.

```
0.5 second blow deflected by an energy shield, solid thump with a bright electric shimmer, sci-fi force field impact, close and dry, no music
```

6. **parry**: a guard raised at the last moment, turning the blow aside.
   The anime sword-clash ring. Takes: 2.

```
1 second anime sword clash, bright ringing metallic kiiin with a long shimmering ring out, katana parry, clean, no music
```

7. **guard_break**: the Defender's slam smashing a guard shield apart.

```
1 second energy shield shattering like glass, electric crackle and a falling digital zap, sci-fi, no music
```

8. **momentum_hit**: a blow thrown out of a boost, landing with everything
   behind it.

```
1.2 second massive collision of two giant robots, crunching steel like a car crash, deep boom, scattering debris, anime mecha, no music
```

9. **ringout**: a mech slammed into the electric barrier at the edge of
   the track.

```
1.2 second giant robot slammed into an electric barrier, deep metal clang, crackling force field, heavy thump, no music
```

10. **ko**: a mech knocked out: it blows up. Takes: 2.

```
3 second explosion of a giant robot, big fiery blast, metal debris clattering down, deep rumbling tail, anime mecha, no music
```

11. **shot_carbine**: the Midfielder's carbine, one shot (it fires in
    quick bursts, so short and punchy, and not shrill). Takes: 3.

```
0.25 second single shot of a mecha energy rifle, short punchy plasma blast, sharp attack and quick decay, close and dry, no music
```

12. **shot_scatter**: the Defender's scatter cannon. Takes: 2.

```
0.8 second heavy sci-fi shotgun blast, booming cannon shot with a metallic rattle, giant robot weapon, close and dry, no music
```

13. **bullet_hit**: carbine rounds striking armour. Heard constantly in a
    gunfight, and quietly, so small and clean. Takes: 3.

```
0.15 second small bullet hitting metal armor, quick metallic ping with a tiny spark, close and dry, no music
```

## 2. Movement and the circuit

14. **boost**: a boost lighting up.

```
1 second jet thruster ignition, roaring afterburner whoosh, mecha rocket boost, no music
```

15. **dash**: a quick sidestep on thrusters. Takes: 2.

```
0.4 second quick thruster burst, short sharp jet whoosh, fast sidestep, no music
```

16. **carve_burst**: letting go of a carve: the skates' edges snap off the
    road and the stored speed kicks in.

```
0.6 second skates snapping off asphalt, sharp scrape release into a rushing thruster whoosh, no music
```

17. **launch**: the start: the whole grid going off the line.

```
1.5 second racing robots launching off the start line, thrusters igniting, wheels biting into asphalt, a rising rush, no music
```

18. **takeoff**: leaving a ramp, into the air.

```
0.6 second heavy metal clunk then rushing wind, a robot leaving a ramp into the air, no music
```

19. **land**: coming back down on the skates. Takes: 2.

```
0.8 second giant robot landing on roller skates, heavy metal stomp, suspension clank, a short skid of wheels, no music
```

20. **wall**: a mech glancing off the barrier. Takes: 2.

```
0.6 second heavy metal clang against a steel barrier, brief scrape and sparks, no music
```

21. **bump**: two mechs bumping shoulders. Takes: 2.

```
0.3 second dull metal thud, two armored robots bumping shoulders, no music
```

22. **pad**: running over a speed pad.

```
0.5 second rising electric zap with a push of air, sci-fi speed booster pad, no music
```

23. **fall**: going over the edge, dropping out of sight.

```
1.5 second fall: rushing wind dropping in pitch and fading into the distance, no music
```

24. **recover**: the recovery drone setting a fallen mech back on the
    track.

```
1.5 second drone rotors hovering, a mechanical clamp releasing with a clunk, two soft confirmation chimes, no music
```

## 3. Abilities

Each wants its own clear identity: a player should know what was just
used from the sound alone.

25. **overdrive**: the Forward's Overdrive firing, on the speed lap: a
    few seconds far past top speed.

```
2 second turbine spooling up, rising jet engine whine into a roaring blast of air, mecha overdrive power-up, no music
```

26. **breakaway**: the Forward's Break Away: shaking off every lock,
    even mid-hit, and bursting clear.

```
1 second anime sword shing with rushing air, sharp bright ring, burst of speed, no music
```

27. **snare_shot**: the Midfielder firing the Snare bolt.

```
0.8 second harpoon gun shot, electric zap and thump, steel cable pulled taut and twanging, no music
```

28. **snared**: caught by a Snare: clamped, the speed dragged off.

```
1 second electric clamp latching onto metal, then a power-down whine sinking lower, no music
```

29. **pulse**: the Disruptor's pulse going off.

```
1 second electromagnetic pulse shockwave, deep thud, spreading electric ring sweeping downward, crackling sparks, no music
```

30. **ram**: the Defender's Ram.

```
1 second giant robot charging forward, revving engine growl rising into a horn-like roar, no music
```

31. **aegis**: the Aegis bubble going up over the team. Key: G major (the
    one chord that sits with every song the game plays).

```
1.2 second energy shield bubble powering up, rising air into a warm shimmering chord, sci-fi, no music
```
