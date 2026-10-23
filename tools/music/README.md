# Recorded race music

A circuit's race music can be a recorded song (made in Suno) instead of the
synthesised one, and still build lap by lap as the synthesised music does.
The game plays these by default; `?music=synth` in the address plays the
synthesised music instead.
Every circuit has a song: Meridian (海空の速さ), Corkscrew Canyon
(疾走の回路), Helios Drop (午間の雲上レース), Neon Crucible (Neon
Fire), Frostline (Aurora Dash) and Titan's Rest (White Desert Charge).
The menus have a title
theme (Blue Night Sky), and the results one for when the player's team
wins (トロフィーセレモニー) and one for when it loses (Minor Theme; see
"Screens' music" below). The hangar screens play a setlist of songs, one
after another ("The hangar's music").
What each song was asked for, and what is still to make, is in
[prompts.md](prompts.md).

| Lap | What plays |
|---|---|
| 1 | the melody and the bass, a little quieter |
| 2 | the drums come in: the beat, for the fighting |
| 3 | the rest: the full song, at full volume, with the kick and bass lifted (+5 dB below 140 Hz) |
| finish | on to the song's ending, every layer in; once it has played out, the menu music |

| Layer | Meridian | Canyon | Helios | Crucible, Frostline, Titan's Rest |
|---|---|---|---|---|
| melody | keys, synth, strings, guitar | synth, keys, guitar, strings, brass, voices | keys, synth | synth, keys, guitar, strings, brass, woodwinds, voices |
| bass | bass | bass | bass | bass |
| drums | drums | drums | drums | drums |
| lap 3's | brass, percussion, effects, woodwinds | percussion, effects | percussion, effects | percussion, effects |

On Canyon, Helios and Titan's Rest lap 3 is also a change of place:
Helios's song jumps to its drop, Canyon's to its last chorus, a key up,
Titan's Rest's to its last section, where its C minor turns to C major
(see "The finale" below).

Lap 1 is -23.5 LUFS at the game's default volumes: under the racing,
about where the synthesised race music's first lap sits (-23.3; a finished
song fills more of the spectrum, so it covers the effects more at the same
loudness). Lap 2 is -17: the drums come in for the fighting, nearly as
loud as the last lap. Lap 3 is the peak: everything in, the drums' and
bass's low end up 5 dB (a low shelf at 140 Hz, on the bar line, so the
kick lands harder), and -15.5 LUFS. (From playtests: -18.5, -17.5 and
-15.5 drowned the effects on lap 1; turned down 5 dB on laps 1 and 2, the
battle lap's drums felt muted; before the shelf, lap 3 was too like lap 2.)

**Which stems can be heard apart.** Suno's stems are separated out of the
finished mix, not recorded apart, and some come apart cleanly while others
were carved out of one another: heard without its partners, a stem has
holes where they were, which sounds hollow and phasey, like music down a
telephone. All of them together sum back to the song. So a layer must hold
every stem that is tangled with another, and only clean stems can come in
on their own. To tell which is which, compare the stems' phase where they
overlap: carved from one mix, they agree; apart, they do not
(`tangle.py`). Meridian's (1 is fully carved, 0 apart):

| | Drums | Bass | Keyboard | Synth | Strings | Guitar | Brass |
|---|---|---|---|---|---|---|---|
| Keyboard | 0.07 | 0.14 | | 0.53 | 0.38 | 0.21 | 0.27 |
| Synth | 0.10 | 0.21 | 0.53 | | 0.57 | 0.39 | 0.27 |
| Strings | 0.11 | 0.16 | 0.38 | 0.57 | | 0.78 | 0.18 |

So the keys, synth, strings and guitar are one layer, and come in
together; the drums, bass, percussion and effects (0.02 to 0.16 against
everything) can each come in alone; the brass, in between, comes in last.

Canyon's (疾走の回路, G minor, 140 BPM, led by its synth), over its loop:

| | Guitar | Strings | Brass | Lead vocals | Synth | Keyboard |
|---|---|---|---|---|---|---|
| Guitar | | 0.73 | 0.52 | 0.68 | 0.40 | 0.18 |
| Strings | 0.73 | | 0.67 | 0.65 | 0.23 | 0.11 |
| Synth | 0.40 | 0.23 | 0.18 | 0.26 | | 0.36 |

The guitar, strings, brass and the vocal chops were carved out of one
another, and the guitar out of the synth too, so they are all one melody
layer with the synth and keys; the drums, bass, percussion and effects
are clean (0.01 to 0.28), and lap 3 brings the percussion and effects.
A tangled stem can still be turned down a few dB on a lap (not out: that
leaves the holes): Canyon's first song, 紅砂のレース, had its guitar, its
loudest stem, as a layer of its own, 2 dB down on lap 1 where without
the drums it stood out (4 dB was too much: the synth covered it).

Helios's stems are fewer (drums, bass, keys, synth, percussion, effects)
and come apart as Meridian's do: the keys and synth are tangled (0.42),
the bass a little with the synth (0.36: it plays from lap 1 with them
anyway), and the drums, percussion and effects are clean (0.01 to 0.10).

Neon Fire's (the Crucible's: D minor, about 193 BPM, stems only) are the
most tangled yet: the vocal chops, strings, woodwinds and brass were carved
out of one another (0.37 to 0.61), and the synth out of the strings, guitar
and keys (0.34 to 0.40), so all of them are one melody layer. The bass,
percussion and effects are clean (0.01 to 0.15). The drums very nearly are
(0.30 against the vocal chops and 0.23 against the woodwinds, both sparse
and quiet), so they come in alone on lap 2. It has no finale: its best
loop (bars 66 to 116, 50 bars, 62 s: from after its first chorus through
its second, where the second half repeats the first two bars late) is far
better than any that leaves room for one after it, and the build allows a
finale only after the loop.

Frostline's Aurora Dash (150 BPM, stems only) and Titan's Rest's White
Desert Charge (about 140 BPM, stems only) come apart as Neon Fire does,
so their layers are the same. In Aurora Dash every melody stem is carved
out of another (0.38 to 0.83); the drums very nearly are not (0.33 at
most, against the sparse vocal chops), and the bass, percussion and
effects are clean. In White Desert Charge the vocal chops, guitar,
strings, brass and woodwinds were carved out of one another (0.54 to
0.77) and the synth and keys out of them (0.33 to 0.50); the drums are
0.31 against the vocal chops and 0.26 at most against the rest, and the
bass, percussion and effects are clean (0.17 at most).

Aurora Dash has no finale: it was asked for with a last chorus a
semitone up and came back without one (it moves between E major or C#
minor and B major or G# minor, and ends on C# major). It loops
bars 50 to 95 (45 bars, 72 s: about a lap) and ends from bar 112, its
cadence onto the last C# major chord.

**The finale.** Helios's song is trance: intro, a long groove, a
breakdown, a build and a drop, then an outro, all on one 16-bar chord
cycle (E minor: Em, Am, D, G, C, Am, then four bars of B). Laps 1 and 2
loop the groove (bars 16 to 64, 80 s). On lap 3 the song jumps, on the
same bar line as the lap change, into the build (bars 80 to 87) or the
drop (from bar 88), at the same place in the chord cycle as the bar it
leaves, so the chord carries on and only the energy changes: a lap 3 that
starts early in the cycle gets a few bars of build first, one that starts
late goes straight into the drop. The drop then loops (bars 88 to 104,
26 s) to the finish. The breakdown is never heard: played through, it
would take the drums away half way through lap 2.

Canyon's song lifts a whole step for its last chorus (G minor to A minor,
from bar 94: the loudest part of it, the guitar back in from bar 98).
That is its lap 3. A key change sounds meant only at the start of a
phrase, so the lap change waits for the next one (its phrases are 4 bars,
from bar 2: where the crashes fall), up to 4 bars (about 7 s) after the
lap line, and goes in at bar 94, all layers at once. It loops bars 94 to
106 (12 bars, 20 s: the seam falls where the song itself drops the
guitar, on the same F chord) and ends from bar 106, the cadence onto its
last A minor hit. Laps 1 and 2 loop bars 26 to 66 (69 s, phrase to
phrase).

White Desert Charge is in C minor throughout (its middle sections lean
on G minor), with no key change, but its last section (from bar 96, the
loudest part of it, the vocal chops back in) turns to C major, round
Ab, Bb and C. That is its lap 3. Every stretch of the song leads home to
C (most of its bars are Ab, Bb, Fm or Gm, a step or two from it), so the
lap change goes in on the next bar line, always at bar 96 (`"cycle": 1`:
one place to land), and lands as a homecoming whatever bar it leaves. It
loops bars 96 to 108 (12 bars, 20 s: the seam goes from Bb to C as the
song's own bar 95 does into 96) and ends from bar 108: C, Ab, Bb and onto
its last C major hit. Laps 1 and 2 loop bars 31 to 90 (59 bars, 101 s:
both come after the same climb, Bb, Eb, Fm, Gm, Ab, Bb, onto C minor), so
two laps at a normal pace hear the song through with nothing repeated.

**Stingers.** The race stingers are written for Meridian's synthesised
music, and each circuit moves them into its own key, including the key
change its synthesised music makes on the last lap. A song can give its
own (`stingers` in the recipe, semitones from the written key):

- Helios's is centred on E and ends on E major: the battle-lap stab
  resolves to E minor and the finish flag is in E major.
- Canyon's is in G minor and lifts to A minor for its last chorus: the
  lap chime is on G and D, the battle stab resolves to G minor, the
  final-lap fanfare's open chord is on A (the key it is about to lift to)
  and the flag is in C major, the relative major of where it ends.
- Meridian's is in A minor, the stingers' own key.
- Neon Fire is in D minor and ends on D major (a Bb, C, D cadence): the
  lap chime is on D and A, the battle stab resolves to D minor, the
  final-lap fanfare's open chord is on D and the flag is in D major.
- Aurora Dash is centred on C# minor and ends on C# major: the lap chime
  is on C# and G#, the battle stab resolves to C# minor, the final-lap
  fanfare's open chord is on C# and the flag is in C# major.
- White Desert Charge is in C minor and its last section in C major: the
  lap chime is on C and G, the battle stab resolves to C minor, the
  final-lap fanfare's open chord is on C (the finale it goes into) and
  the flag is in C major.

How Meridian's recipe got here, from playtests (the others follow it): the first version kept the kick, muffled,
on lap 1, and its laps were too alike; the second took the kick out of
lap 1 with a high-pass and let each lap get about 3 LU louder, and its
start was too quiet; the third evened the laps out, which brought lap 1's
keys (without the synth they are tangled with) and its tinny high-passed
hats up 8 dB, and the music sounded muffled, like a telephone; the fourth
kept tangled stems together but opened on the drums and bass, when the
melody is what should be heard first; the fifth
opened on the melody, but laps 2 and 3 were too alike.

Every change waits for the next bar line, so a layer comes in with the
downbeat. The song plays from its start, loops a stretch from its middle
for as long as the race needs, and jumps to its ending when the race is
over for the player (finished, or the race has ended). When the ending has
played out (and 0.6 s more) the menu music comes in, so the wait for the
results is not silent: it is what the results play, so it carries on into
them.

How it plays (`src/client/audio/song.ts`): each layer is one decoded
buffer, and every stretch of the song (the start, each pass of the loop,
the jump to the finale, the ending) starts all of them together, on a
whole sample, so they can never drift apart. A loop pass, the finale or
the ending is queued ahead against the audio clock, with a 12 ms
cross-fade that ends on the bar line. A lap change
moves each layer's level at the bar line, and the filtered drums go over
to an unfiltered path there (a 'cut'; a low-pass can instead be swept open
up to the bar line), so without the filter they are heard exactly as
recorded. If the files cannot be
loaded or decoded, the circuit's synthesised music plays instead.

## Screens' music

A screen can have a song too (`SCREEN_SONGS` in `song.ts`). It plays whole,
every layer in (it is built as one layer), from its top, then round its
loop until the screen moves on, when the menu music comes back. Small, so
it is decoded as soon as there is an audio context and kept.

The menus play the title theme, Blue Night Sky (E major, 152 BPM, like the
opening): on the title screen and every menu after it, and in the wait
after a race song's ending. It starts from its top whenever the menus'
music starts (after a race, say), carries on from screen to screen, and
loops bars 12 to 64 (82 s; it skips the song's stop at bar 64 and its last
section), at -20.5 LUFS.

The results play the win theme, トロフィーセレモニー, when the player's team
won the round (and the Grand Prix award, for first place). It goes
straight in from its top and loops bars 22 to 48 (51 s; the first 95 s
play through before it), at -19.5 LUFS: between the menu music (-24) and a
race's last lap (-15.5). When it lost, the loss theme, Minor Theme (E
minor, the win theme's relative minor, 100 BPM; synth-led, 80s anime):
from its top (solo keys, then the band), then round bars 9 to 42 (79 s:
from its second full-band part back to the keys alone, as the song itself
goes after its first). It is at -22.5 LUFS: half of it is keys alone, so
that puts its full-band parts about 1 dB under the win theme's. An outcome
with no song would leave the menus' music playing.

## The hangar's music

The hangar screens (the hangar, the setups, the Grand Prix and its
briefings and standings, the online hub and rooms) play a setlist rather
than one song on repeat, like the pit crew's radio: eight songs so far
(`songs/hangar.json`), sung and not, about 20 minutes. Each plays through
once, then 1.5 s of quiet, then the next; the order is shuffled and goes
round them all before any comes again (never one twice running). The
title and the other menus keep the title theme; leaving the hangar and
coming back carries on with the next track.

What plays shows in the bottom corner, level with the prompts bar; M, the
right stick pressed, or a tap or click on it goes on to the next (the
skipped one fades out in 0.4 s). Each track plays at -22 LUFS, a little
under the title theme: it is background.

Built by `python3 tools/music/setlist.py tools/music/songs/hangar.json
<folder>` from the finished songs (Suno's .m4a will do: no stems, bars or
loop): each is trimmed of silence, faded out (3 s where it stops dead, a
short fade otherwise), and written as an MP3 (LAME `quality` 2: the sources
are already compressed, so the best setting buys nothing), with
`setlist.json` (titles, lengths, each one's gain). 27 MB in all, but each
file is fetched only when it is next up (as the one before it starts), and
only the track playing is held decoded (the next one too, for its last 20
s), so it costs memory like one screen song.

Checked by `node tools/audio-check.mjs --only hangar` (a track against its
file to the sample, a skip, a track to its end and the next one GAP after
it, and back to the menu music) and by `tools/screen-music-check.mjs` in a
browser (the setup plays it, the corner shows it, M and a tap go on).

## Making one

1. **Make the song in Suno and export its stems** (the WAV of the full
   song, and the stems as WAVs). Instrumental, one steady tempo, and a
   clear ending; it helps if the middle has a long stretch of one energy
   that can loop. Put them in a folder as `song.wav` and `stems/`, named
   as Suno names them (`0 Drums.wav`, `1 Bass.wav`...). They stay out of
   the repository.
2. **Map its bars**: `python3 tools/music/bars.py <folder>` (needs librosa;
   the build needs pyloudnorm: `pip install librosa pyloudnorm`).
   It follows the tempo as it drifts, moves the grid onto the drum hits,
   finds the downbeat, and prints where each stem plays, bar by bar, the
   best loops (bar A to bar B: what follows B sounds most like what
   follows A, and what comes before it most like what comes before A) and
   where the sections change. It writes `<folder>/bars.json`. The loops and
   the downbeat come from the harmony: song.wav's, or with stems only the
   pitched stems summed (before Neon Fire it read the drums stem then, and
   its loops were wrong).
3. **Write its recipe** in `songs/<circuit>.json` (see `meridian.json`):
   - `layers`: which stems make each layer, up to four. Keep tangled stems
     in one layer: `python3 tools/music/tangle.py <folder>` prints how far
     each pair agrees (the tables above; '.' is too little overlap to tell).
   - `laps`: each layer's level on laps 1 to 3, in dB, or `null` for
     silent: the balance of the layers within each lap (Meridian: all
     level).
   - `lowShelf` (optional): layers given a low shelf (Web Audio's
     `lowshelf`) and its boost in dB on each lap. Meridian: the drums and
     bass, 140 Hz, +5 dB on lap 3.
   - `filter` (or null): a layer heard through a filter on some laps, its
     type (`highpass` or `lowpass`), cutoff, laps, and how it comes off:
     `cut` at the bar line, or `sweep` open up to it. Meridian has none
     now: a filtered layer turned up to the others' level sounds thin.
   - `ride` (optional): a sound that comes in now and then far louder than
     the rest, turned down where it is loud, and only there: `stems` (all
     the stems it is carved across, together), `max` (the loudest it may
     be, LUFS over 400 ms, measured on the stems before the master) and
     `bars` (from, to: where). The build prints how far it turned each bar
     down. Blue Night Sky's synth (in Keyboard, Synth and Lead Vocals: the
     three agree 0.88 to 0.94 where it plays, so they are one sound) sits
     at -17 to -20 under the band, but on its own in the break at bars 53
     and 54 came in at -9, 5 dB over the whole song, and at -11.5 in bar 8;
     ridden at -16, the break sits with the rest (7 to 8 dB down there,
     4.4 in bar 8, 2.4 at most anywhere else), and the ending's last chord
     is left alone (bars 0 to 90).
   - `loop` and `ending`: bar numbers from step 2. Meridian loops bars 49
     to 81 (32 bars, 54 s), the best match in the song, and ends from bar
     98; Canyon loops bars 26 to 66 (40 bars, 69 s, phrase to phrase)
     and ends from bar 106; Helios loops its groove, bars 16
     to 64 (three turns of its chord cycle), and ends from bar 116, a
     wind-down onto a last E major hit; Neon Fire loops bars 66 to 116 and
     ends from bar 120, a Bb, C, D cadence onto its last D major hit;
     Aurora Dash loops bars 50 to 95 and ends from bar 112; White Desert
     Charge loops bars 31 to 90 and ends from bar 108.
   - `finale` (optional): `{"lap": 3, "from": 80, "loop": [88, 104],
     "cycle": 16}` (Helios): on lap 3, jump to the bar from `from` on at
     the same place in the `cycle`-bar chord cycle, then loop `loop`. Both
     loops should be whole cycles. With `"phrase": {"bars": 4, "first":
     2}` (Canyon) it waits instead for the next phrase's first bar line
     and goes in at `from`. With `"cycle": 1` (Titan's Rest) it goes in
     at `from` on the next bar line, whichever it is.
   - `stingers` (optional): semitones to move each race stinger by while
     the song plays, in place of the circuit's (see above).
   - `master`: the gain and two shelves that make the summed stems sound
     like `song.wav` (Suno's stems are the mix before mastering: summed,
     they are louder and duller). Find them by comparing the two (fit
     the difference between their spectra, a third of an octave at a time:
     Meridian's is -4.4 dB with +3 dB below 150 Hz and +1.5 above 5 kHz,
     Canyon's first song's -4.8 dB, +3.3 below 260 Hz and +2.5 above
     2.9 kHz). The songs that came as stems only (Helios's, Canyon's
     疾走の回路, Neon Fire, the screens') have the two averaged (+3 dB below 200 Hz,
     +2 above 4 kHz); with a full mix, a song can be matched.
   - `loudness`: how loud each lap should be, in LUFS at the game's
     default volumes (all three: -23.5, -17, -15.5). The build sets each
     lap's level to meet it and prints what it got, and the layers' levels
     on each lap.
4. **Build it**: `python3 tools/music/build.py tools/music/songs/<circuit>.json <folder>`.
   It writes `public/music/<circuit>/`: one MP3 per layer and `song.json`.
   Only what can be heard is kept: from the start to the loop's end, then
   the ending (Meridian: 147 s of its 175, 18.1 MB at LAME's best VBR,
   `quality` 0; its default, 4, cuts above 16 kHz and is audibly rougher
   once four layers are summed. Canyon: 145 s of its 192, 17.9 MB;
   Helios: 157 s of its 203, 19.2 MB; Neon Fire: 156 s of its 160, 18.5
   MB; Aurora Dash: 161 s of its 188, 20.5 MB; White Desert Charge, the
   longest loop: 187 s of its 197, 23.8 MB).
5. **Add it** to `SONGS` in `src/client/audio/song.ts` (a screen's: to
   `SCREEN_SONGS`, as one layer with every stem in it, `laps` all 0, and
   one `loudness`; see `songs/results-win.json`).
6. **Check it**:
   - `npm test` checks every song's files and map.
   - `node tools/audio-check.mjs --only song` renders a race offline
     through the engine, for every song, and checks each change lands on its bar line, the
     render matching the layers summed by hand to the sample on both sides,
     with no click at the joins, each lap's level, and the menu music
     coming in after the ending.
   - `node tools/audio-check.mjs --only title,results` checks the screens'
     songs the same way: from the top, round the loop to the sample, and
     back; `URL=http://127.0.0.1:8090/ node tools/screen-music-check.mjs`
     checks them in a real browser: the title theme on the title screen and
     on into the menus, and races to the results to check the music fits
     the outcome.
   - `URL=http://127.0.0.1:8090/ node tools/song-check.mjs` races in a real
     browser (after `npm run build` and `npm start`; `TRACK=canyon` for
     Canyon's) and checks what each
     layer plays on each lap, and (holding the results back, as when the
     others are still racing) that the menu music follows the ending.
   - Then listen: `?auto=FW&demo=1&track=meridian&music=suno` (or
     `track=canyon`), with
     `&skip=70` to reach lap 2 sooner (the song still starts from its
     top).

## Formats and memory

The layers are MP3s, which every browser decodes (AAC is missing from
open-source Chromium, Opus from older Safari). Decoders differ in how much
of the encoder's delay they trim, so `song.json` carries a fingerprint of
the start (one layer's level, millisecond by millisecond, as ffmpeg
decodes it) and the game measures its own decoder against it and allows
for the difference (Chromium's matches to the sample).

Decoded, each layer takes 8 bytes a sample frame: Meridian's four take
about 225 MB at 48 kHz, Canyon's 222 MB, Helios's 241 MB, Neon Fire's 239 MB,
Aurora Dash's 247 MB, White Desert Charge's 287 MB. So only one song is held decoded:
the one for the circuit coming up. The game names it as soon as it knows
(the circuit it has built, and the circuit shown on the race setup, the
online room and the Grand Prix briefing, once it has stayed there a
second), and the engine decodes that song and lets go of any other. A
race on a circuit nobody named decodes its song as it starts, and the song
comes in when that is done, a second or two into the countdown (about 1.5 s
in desktop Chromium, two layers at a time). Only on a device that says it
has 2 GB of memory or less are the layers decoded at 32 kHz instead (a
third less): the browser then resamples them as they play, which dulls the
top end. The files (about 20 MB a song) download when the game starts with
the switch on, whichever circuit is raced, and are kept for the visit, so a
song can be decoded again without downloading it again.
