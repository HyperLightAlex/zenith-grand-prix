# Recorded race music

A circuit's race music can be a recorded song (made in Suno) instead of the
synthesised one, and still build lap by lap as the synthesised music does.
For now this is an experiment, heard only with `?music=suno` in the address.
Meridian has a song so far: 海空の速さ.

| Lap | What plays |
|---|---|
| 1 | the melody (keys, synth, strings, guitar) and the bass, a little quieter |
| 2 | the drums come in: the beat, for the fighting |
| 3 | the brass, percussion, effects and woodwinds: the full song, at full volume |
| finish | on to the song's ending, every layer in; once it has played out, the menu music |

Lap 1 is 2 LU under the last lap and lap 2 1 LU under it (-18.5, -17.5 and
-16.5 LUFS at the game's default volumes), which is almost exactly what the
layers come to by themselves: the build lifts lap 1 by under 1 dB. The
build is in what comes in, not in how loud it gets.

**Which stems can be heard apart.** Suno's stems are separated out of the
finished mix, not recorded apart, and some come apart cleanly while others
were carved out of one another: heard without its partners, a stem has
holes where they were, which sounds hollow and phasey, like music down a
telephone. All of them together sum back to the song. So a layer must hold
every stem that is tangled with another, and only clean stems can come in
on their own. To tell which is which, compare the stems' phase where they
overlap: carved from one mix, they agree; apart, they do not. Meridian's
(1 is fully carved, 0 apart):

| | Drums | Bass | Keyboard | Synth | Strings | Guitar | Brass |
|---|---|---|---|---|---|---|---|
| Keyboard | 0.07 | 0.14 | | 0.53 | 0.38 | 0.21 | 0.27 |
| Synth | 0.10 | 0.21 | 0.53 | | 0.57 | 0.39 | 0.27 |
| Strings | 0.11 | 0.16 | 0.38 | 0.57 | | 0.78 | 0.18 |

So the keys, synth, strings and guitar are one layer, and come in
together; the drums, bass, percussion and effects (0.02 to 0.16 against
everything) can each come in alone; the brass, in between, comes in last.

How it got here, from playtests: the first version kept the kick, muffled,
on lap 1, and its laps were too alike; the second took the kick out of
lap 1 with a high-pass and let each lap get about 3 LU louder, and its
start was too quiet; the third evened the laps out, which brought lap 1's
keys (without the synth they are tangled with) and its tinny high-passed
hats up 8 dB, and the music sounded muffled, like a telephone; the fourth
kept tangled stems together but opened on the drums and bass, when the
melody is what should be heard first.

Every change waits for the next bar line, so a layer comes in with the
downbeat. The song plays from its start, loops a stretch from its middle
for as long as the race needs, and jumps to its ending when the race is
over for the player (finished, or the race has ended). When the ending has
played out (and 0.6 s more) the menu music comes in, so the wait for the
results is not silent: it is what the results play, so it carries on into
them. The lap and phase stingers still play: Meridian's are already in A
minor, the song's key.

How it plays (`src/client/audio/song.ts`): each layer is one decoded
buffer, and every stretch of the song (the start, each pass of the loop,
the ending) starts all of them together, on a whole sample, so they can
never drift apart. A loop pass or the ending is queued ahead against the
audio clock, with a 12 ms cross-fade that ends on the bar line. A lap change
moves each layer's level at the bar line, and the filtered drums go over
to an unfiltered path there (a 'cut'; a low-pass can instead be swept open
up to the bar line), so without the filter they are heard exactly as
recorded. If the files cannot be
loaded or decoded, the circuit's synthesised music plays instead.

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
     in one layer (see above: `bars.py` does not measure it yet; the phase
     comparison is a few lines of numpy).
   - `laps`: each layer's level on laps 1 to 3, in dB, or `null` for
     silent: the balance of the layers within each lap (Meridian: all
     level).
   - `filter` (or null): a layer heard through a filter on some laps, its
     type (`highpass` or `lowpass`), cutoff, laps, and how it comes off:
     `cut` at the bar line, or `sweep` open up to it. Meridian has none
     now: a filtered layer turned up to the others' level sounds thin.
   - `loop` and `ending`: bar numbers from step 2. Meridian loops bars 49
     to 81 (32 bars, 54 s), the best match in the song, and ends from bar
     98.
   - `master`: the gain and two shelves that make the summed stems sound
     like `song.wav` (Suno's stems are the mix before mastering: summed,
     they are louder and duller). Find them by comparing the two.
   - `loudness`: how loud each lap should be, in LUFS at the game's
     default volumes (Meridian: -18.5, -17.5, -16.5). The build sets each
     lap's level to meet it and prints what it got, and the layers' levels
     on each lap.
4. **Build it**: `python3 tools/music/build.py tools/music/songs/<circuit>.json <folder>`.
   It writes `public/music/<circuit>/`: one MP3 per layer and `song.json`.
   Only what can be heard is kept: from the start to the loop's end, then
   the ending (Meridian: 147 s of its 175, 18.1 MB at LAME's best VBR,
   `quality` 0; its default, 4, cuts above 16 kHz and is audibly rougher
   once four layers are summed).
5. **Add it** to `SONGS` in `src/client/audio/song.ts`.
6. **Check it**:
   - `npm test` checks every song's files and map.
   - `node tools/audio-check.mjs --only song` renders a race offline
     through the engine and checks each change lands on its bar line, the
     render matching the layers summed by hand to the sample on both sides,
     with no click at the joins, each lap's level, and the menu music
     coming in after the ending.
   - `URL=http://127.0.0.1:8090/ node tools/song-check.mjs` races in a real
     browser (after `npm run build` and `npm start`) and checks what each
     layer plays on each lap, and (holding the results back, as when the
     others are still racing) that the menu music follows the ending.
   - Then listen: `?auto=FW&demo=1&track=meridian&music=suno`, with
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
about 225 MB at 48 kHz. Only on a device that says it has 2 GB of memory
or less are they decoded at 32 kHz instead (150 MB): the browser then
resamples them as they play, which dulls the top end. The files download when the game starts with the switch
on, whichever circuit is raced, and are kept for the visit.
