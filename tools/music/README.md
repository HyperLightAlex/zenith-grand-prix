# Recorded race music

A circuit's race music can be a recorded song (made in Suno) instead of the
synthesised one, and still build lap by lap as the synthesised music does.
For now this is an experiment, heard only with `?music=suno` in the address.
Every circuit has a song: Meridian (海空の速さ), Corkscrew Canyon
(紅砂のレース) and Helios Drop (午間の雲上レース). The menus have a title
theme (Blue Night Sky) and the results one for when the player's team wins
(トロフィーセレモニー; see "Screens' music" below).
What each song was asked for, and what is still to make, is in
[prompts.md](prompts.md).

| Lap | What plays |
|---|---|
| 1 | the melody and the bass, a little quieter |
| 2 | the drums come in: the beat, for the fighting |
| 3 | the rest: the full song, at full volume, with the kick and bass lifted (+5 dB below 140 Hz) |
| finish | on to the song's ending, every layer in; once it has played out, the menu music |

| Layer | Meridian | Canyon | Helios |
|---|---|---|---|
| melody | keys, synth, strings, guitar | keys, synth, strings, brass, woodwinds, voices | keys, synth |
| guitar | | guitar: 2 dB down on lap 1 | |
| bass | bass | bass | bass |
| drums | drums | drums | drums |
| lap 3's | brass, percussion, effects, woodwinds | percussion, effects | percussion, effects |

Helios's lap 3 is also a change of place: its song has a drop, and lap 3
jumps to it (see "The finale" below).

Laps 1 and 2 are -18.5 and -17.5 LUFS at the game's default volumes,
almost exactly what their layers come to by themselves (the build moves
lap 1 by under 1 dB). Lap 3 is the jump: everything in, the drums' and
bass's low end up 5 dB (a low shelf at 140 Hz, on the bar line, so the kick
lands harder), and -15.5 LUFS. On Meridian, against lap 2, that is 5.6 dB more below
140 Hz and 2.6 LU louder (it was 1.4 dB and 1.8 LU without the shelf:
not enough of a step).

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

Canyon's, over its loop:

| | Guitar | Strings | Brass | Woodwinds | Lead vocals | Synth | Keyboard |
|---|---|---|---|---|---|---|---|
| Guitar | | 0.74 | 0.79 | 0.62 | 0.67 | 0.30 | 0.16 |
| Strings | 0.74 | | 0.63 | 0.61 | 0.60 | 0.32 | 0.16 |
| Synth | 0.30 | 0.32 | . | 0.38 | 0.33 | | 0.36 |

Here the brass, woodwinds and voices were carved out of the guitar and
strings, and they are no small part of it: the brass is up front for six
bars before the loop (on lap 1), the woodwinds and voices for stretches of
the loop. So they are all in the melody, and lap 3 brings only the percussion
and effects (0.01 to 0.12 against everything, like the drums and bass), with
the low end lifted and 2 LU more, as on Meridian. Its new layer is quieter
than Meridian's (15 dB under the full song, against 12), so the lift does
more of the work. The guitar is the loudest single stem (-20 LUFS, the
synth -21, the keys -22), as loud as the drums, so on lap 1, without
them, it stood out: it is a layer of its own, 2 dB under the rest there
and level with them on laps 2 and 3 (4 dB was too much: the synth
covered it). Turned down a few dB rather than out, a tangled stem leaves
no holes.

Helios's stems are fewer (drums, bass, keys, synth, percussion, effects)
and come apart as Meridian's do: the keys and synth are tangled (0.42),
the bass a little with the synth (0.36: it plays from lap 1 with them
anyway), and the drums, percussion and effects are clean (0.01 to 0.10).

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

**Stingers.** The race stingers are written for Meridian's synthesised
music, and each circuit moves them into its own key, including the key
change its synthesised music makes on the last lap. The songs make no key
change, so a song can give its own: Canyon's and Helios's are both centred
on E and end on E major, so while they play, the battle-lap stab resolves
to E minor and the finish flag is in E major (`stingers` in the recipe).
Meridian's song is in A minor, the stingers' own key.

How Meridian's recipe got here, from playtests (Canyon's follows it): the first version kept the kick, muffled,
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
race's first lap (-18.5). A loss has no song yet, so the menu music plays
on, as before; a song at `results-loss` will be played for it.

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
   where the sections change. It writes `<folder>/bars.json`.
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
   - `loop` and `ending`: bar numbers from step 2. Meridian loops bars 49
     to 81 (32 bars, 54 s), the best match in the song, and ends from bar
     98; Canyon loops bars 37 to 80 (43 bars, 78 s: the chords and the
     sound either side match best there) and ends from bar 107, a
     C, D, E cadence onto its last chord; Helios loops its groove, bars 16
     to 64 (three turns of its chord cycle), and ends from bar 116, a
     wind-down onto a last E major hit.
   - `finale` (optional): `{"lap": 3, "from": 80, "loop": [88, 104],
     "cycle": 16}` (Helios): on lap 3, jump to the bar from `from` on at
     the same place in the `cycle`-bar chord cycle, then loop `loop`. Both
     loops should be whole cycles.
   - `stingers` (optional): semitones to move each race stinger by while
     the song plays, in place of the circuit's (see above).
   - `master`: the gain and two shelves that make the summed stems sound
     like `song.wav` (Suno's stems are the mix before mastering: summed,
     they are louder and duller). Find them by comparing the two (fit
     the difference between their spectra, a third of an octave at a time:
     Meridian's is -4.4 dB with +3 dB below 150 Hz and +1.5 above 5 kHz,
     Canyon's -4.8 dB, +3.3 below 260 Hz and +2.5 above 2.9 kHz). Helios
     came as stems only, so it has the two averaged (+3 dB below 200 Hz,
     +2 above 4 kHz); with its full mix, it can be matched.
   - `loudness`: how loud each lap should be, in LUFS at the game's
     default volumes (Meridian: -18.5, -17.5, -15.5). The build sets each
     lap's level to meet it and prints what it got, and the layers' levels
     on each lap.
4. **Build it**: `python3 tools/music/build.py tools/music/songs/<circuit>.json <folder>`.
   It writes `public/music/<circuit>/`: one MP3 per layer and `song.json`.
   Only what can be heard is kept: from the start to the loop's end, then
   the ending (Meridian: 147 s of its 175, 18.1 MB at LAME's best VBR,
   `quality` 0; its default, 4, cuts above 16 kHz and is audibly rougher
   once four layers are summed. Canyon: 155 s of its 204, 24.2 MB in five
   layers; Helios: 157 s of its 203, 19.2 MB).
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
about 225 MB at 48 kHz, Canyon's five 297 MB, Helios's four 241 MB. So only one song is held decoded:
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
