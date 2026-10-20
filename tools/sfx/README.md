# Recorded sound effects

The one-shot sound effects can be recordings (made in Suno's Sounds mode)
instead of the synthesised recipes in `src/client/audio/sfx.ts`. They come
in a few at a time: a sound with recordings plays one of them, and every
other sound keeps its recipe. Heard with `?music=suno` in the address, with
the recorded music; `&sfx=synth` keeps the recipes, to compare.

What each sound was asked for, and what is still to make, is in
[prompts.md](prompts.md).

## How a recording plays

Exactly as its recipe did. Its level, reverb, pan, priority, ducking and
gap between plays all come from `SFX_META` in sfx.ts, and so does its pitch
spread: each play is a little higher or lower, so repeats do not sound
stamped out. A sound with several takes also never plays the same take
twice running. A take starts on its first sound: the build cuts away
anything in front of it, and the game skips the silence some browsers'
MP3 decoders add (`onset` in `sfxBank.ts`), so a hit is heard the moment it
lands.

All of them are fetched when the page opens and decoded once there is an
audio context. They are small: a few seconds at most, tens of kilobytes a take.

## Adding sounds

1. **Make them in Suno** from prompts.md (Create, then Sounds, One Shot).
   Keep the takes that work, named after their sound: `hit_heavy.wav`,
   `hit_heavy-2.wav`.
2. **Build them**: `python3 tools/sfx/build.py <folder>`. Each sound found
   replaces what that sound had before; the rest keep theirs. It prints each
   take: where the sound started in the file, its length, whether it stayed
   stereo, its loudness and peak, and whether it was cut short. Takes built
   as the wrong sound come out again with `--drop <sound>`, which puts its
   recipe back.
3. **Check them**: `node tools/audio-check.mjs --quick --only recorded`
   plays each one as the game does, next to its recipe, and fails on one
   that clips, starts late, or sits more than 1.5 dB from where the recipe
   was (more for a sound with a wide spread of pitch, which varies from
   play to play). Add `--dump <dir>` to get WAVs to listen to.

What the build does to a take: shapes it, where sounds.json asks (below);
cuts it from just before the sound starts to where it has died away (or to
its `max` length, twice the length asked for unless given, if it rings on),
and fades the end; folds it to mono unless its stereo is wide enough to
matter (an explosion, say); brings every take of a sound to the same
loudness; and encodes it as MP3 (every browser decodes it).

## Shaping a take

The game wants anime sound effects: short, dry and bright, with an instant
attack. A take that comes out heavier than that (Suno leans cinematic: a
sub-bass boom, a long tail, a slow swell; see prompts.md) can be brought
round in the build, per sound, in sounds.json:

| Key | What it does | The first takes |
|---|---|---|
| `hp` | a high-pass, Hz: low end the sound should not have (the music has the bass and the kick) | swings 150 to 400, hits 90 to 250 |
| `bright` | `[Hz, dB]`: a high shelf, for more edge | the heavy hit, +3 dB from 3 kHz |
| `lead` | start this many seconds before the take first comes within 6 dB of its loudest, rising into it, so a slow swell peaks when the game plays it (the blow lands about 0.1 s after the swing sound starts) | swings 0.03 to 0.05, hits 0.005 |
| `max` | the longest it may run, seconds, the last third fading | 0.35 to 0.8 |
| `speed` | play it this much faster, pitch and all, as a tape run fast: for a take that sounds slowed down | the scatter cannon, 1.12 |
| `split` | `{take: [seconds, ...]}`: cut that take into one take per time listed, each running to the next: for a take that holds a run of the same sound, where the game plays them one at a time | the carbine's bursts, into single shots |
| `db` | lift or lower the sound in the mix, from where its recipe sat | |

A take that is right to begin with keeps more of itself, so re-prompting
comes first; the shaping is for a take that is nearly there.

## Levels

A recording comes into the mix where its recipe sat. The build measures
each take's loudness, as the loudest tenth of a second (K-weighted, as
LUFS are: right for a short, sharp sound, where an average over its length
would count the silence), and sets the sound's gain so that it matches the
recipe's (`reference.json`). From there, `db` in sounds.json lifts or
lowers a sound on purpose: the mix, by ear.

`reference.json` is measured from the recipes as the audio check renders
them, before the limiter (which then treats a recording and its recipe
alike). Measure it again whenever a recipe, or its level in `SFX_META`,
changes:

```
node tools/audio-check.mjs --quick --only sfx --dump <dir>
python3 tools/sfx/build.py --reference <dir>
```

Then build the recorded sounds again, since their gains come from it.
