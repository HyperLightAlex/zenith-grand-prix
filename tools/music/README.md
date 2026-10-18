# Recorded race music

A circuit's race music can be a recorded song (made in Suno) instead of the
synthesised one, and still build lap by lap as the synthesised music does.
For now this is an experiment, heard only with `?music=suno` in the address.
Meridian has a song so far: 海空の速さ.

| Lap | What plays |
|---|---|
| 1 | the base (bass and keys) over the drums' hats alone: a 3 kHz high-pass takes out the kick and the snare's body |
| 2 | the whole kit drops in on the bar line, with the battle layer: brass, percussion, guitar, effects |
| 3 | the lead comes in: synth, strings, woodwinds. The full song |
| finish | on to the song's ending, every layer in |

This copies the synthesised music's arrangement, which has hats but no kick
or snare on the formation lap, so the battle lap lands as a drop. (The first
version kept the kick, muffled, on lap 1 and lifted laps 1 and 2 to make up
for what they lacked: in play the laps were too alike.) Each lap is about 3
LU louder than the one before: -23, -20 and -16.5 LUFS at the game's
default volumes, against the synthesised Meridian's -23, -21 and -20.

Every change waits for the next bar line, so a layer comes in with the
downbeat. The song plays from its start, loops a stretch from its middle
for as long as the race needs, and jumps to its ending when the race is
over for the player (finished, or the race has ended). The lap and phase
stingers still play: Meridian's are already in A minor, the song's key.

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
   - `layers`: which stems make each layer. Four layers, up to: one per
     lap plus the drums alone, which are filtered on lap 1.
   - `laps`: each layer's level on laps 1 to 3, in dB, or `null` for
     silent. Meridian lifts lap 1 a little (the hats +3 dB, the base
     +1.5 dB) so its steps up are even, about 3 LU each.
   - `filter`: the layer heard through a filter on some laps, its type
     (`highpass` or `lowpass`), cutoff, laps, and how it comes off: `cut`
     at the bar line, or `sweep` open up to it.
   - `loop` and `ending`: bar numbers from step 2. Meridian loops bars 49
     to 81 (32 bars, 54 s), the best match in the song, and ends from bar
     98.
   - `master`: the gain and two shelves that make the summed stems sound
     like `song.wav` (Suno's stems are the mix before mastering: summed,
     they are louder and duller). Find them by comparing the two.
   - `loudness`: how loud lap 3 should be, in LUFS at the game's default
     volumes (Meridian: -16.5, 3 dB above the synthesised music's speed
     lap). The build prints all three laps' loudness.
4. **Build it**: `python3 tools/music/build.py tools/music/songs/<circuit>.json <folder>`.
   It writes `public/music/<circuit>/`: one MP3 per layer and `song.json`.
   Only what can be heard is kept: from the start to the loop's end, then
   the ending (Meridian: 147 s of its 175, 11.4 MB).
5. **Add it** to `SONGS` in `src/client/audio/song.ts`.
6. **Check it**:
   - `npm test` checks every song's files and map.
   - `node tools/audio-check.mjs --only song` renders a race offline
     through the engine and checks each change lands on its bar line, the
     render matching the layers summed by hand to the sample on both sides,
     with no click at the joins, and the level.
   - `URL=http://127.0.0.1:8090/ node tools/song-check.mjs` races in a real
     browser (after `npm run build` and `npm start`) and checks what each
     layer plays on each lap.
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
about 225 MB at 48 kHz. On a device that says it has less than 6 GB of
memory they are decoded at 32 kHz instead (150 MB; the stems have little
above 16 kHz). The files download when the game starts with the switch
on, whichever circuit is raced, and are kept for the visit.
