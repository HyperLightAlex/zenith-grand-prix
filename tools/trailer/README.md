# The opening

The anime opening (74.8 s, 1080p at 24 frames a second, a clean cut and a
CRT cut), made from the game itself: game footage cut to the song, with the
titles, the lyrics (Japanese, with English under them, a karaoke wipe
through each line) and the graphics drawn over it. Everything but the song
is here; the song is not in the repo (put it at `tools/trailer/song.m4a`,
or point `SONG=` at it).

| File | What it is |
|---|---|
| `shots-v1.py`, `shots-v2.py` | The shot lists: each shot's place in the song (video in and out, on the beat), its moment in a seeded race, its camera. v1 is the racing; v2 adds the fights, the other factions and circuits. They write `shots.json` and `shots2.json` |
| `beats.py` | The song's beats and onsets (`beats.json`): the cuts and graphics are placed on them |
| `lyrics.srt` | The song's lines, timed; the English is in `comp/comp.js` |
| `comp/index.html`, `comp/comp.js` | The compositor: draws frame `n` of the opening on a canvas (footage, grades, zooms, titles, lyrics, the boot sequence, portraits, the knockout stamp, the end card) |
| `render.mjs` | Saves the compositor's frames as JPEGs (serves the repo to it while it runs) |
| `crt.py` | The game's CRT screen (its shader and the CSS layer over it) applied to finished frames |
| `assemble.sh` | Renders every frame, then encodes both cuts with the song |
| `review.py` | A contact sheet of finished frames |

## Making it

```sh
npm run build && npm start                       # the game, for the footage
python3 tools/trailer/shots-v1.py && python3 tools/trailer/shots-v2.py
node tools/capture/capture.mjs tools/trailer/shots.json tools/trailer/out/frames
node tools/capture/capture.mjs tools/trailer/shots2.json tools/trailer/out/frames
SONG=path/to/song.m4a tools/trailer/assemble.sh  # the frames, then both cuts
```

- **Footage** comes from `tools/capture/capture.mjs` at native 1080p (the
  mech ink is drawn in pixels: a smaller picture scaled up loses the inner
  lines) and 24 frames a second, so it shows the game as it really looks.
  Several hours of software rendering for all of it (about 1,800 frames);
  a shot that is already captured is skipped (delete its `done.json` to
  redo it), so it can be done in parts. `PREVIEW=4` gives four small frames a shot for framing.
- **Without the game's sounds**: the races run with `?mute=1`; the song is
  the only audio.
- **One frame** while working on the graphics:
  `node tools/trailer/render.mjs /tmp/f 0 0 --frames 1200,1250` and look.
- **The fights** were found with `tools/capture/scan.mjs` and
  `fights.py` (the races and seeds are named in the shot lists).
- **Encoding**: 12 Mb/s H.264 (High), AAC 256 kb/s; `-crf 15` for a master.
  Needs ffmpeg, and numpy, scipy and pillow for the CRT pass.

Fonts: Barlow Condensed (the game's) and Dela Gothic One for the Japanese
titles, both from `@fontsource` in `node_modules`.
