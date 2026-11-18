# Where everything in Zenith GP came from

A record for anyone who has to decide whether the game can be published
somewhere (Akeru's review asks for it). It says what each kind of thing in
the game is, how it was made, and where in this repository that is written
down. It is a record, not a licence: this repository grants none, and no
lawyer or outside artist has reviewed any of it.

## What the owner has confirmed

On November 18, 2026, the game's owner stated:

- Everything in the game was made either in code or in Blender.
- The artwork was generated with AI.
- The music and the sound effects were generated with AI.
- All of it was made with the help of AI tools, at the owner's direction.

## What is in the game, and how each part was made

| | What ships | How it was made | Written down in |
|---|---|---|---|
| Code | The game, its simulation and its server (TypeScript) | Written with an AI coding assistant at the owner's direction | this repository's history |
| Circuits, scenery, effects | Roads, gates, strips, weather, most scenery: drawn by code at run time; no model files | In code | `src/sim/tracks`, `src/client/render` |
| Mechs and other models | 56 `.glb` files: the 42 roster frames, the Sunhawk, the Titan, the grandstand, podium, trophy, outposts and hover screen | Built in Blender, by scripts and by hand, to the model sheets below; exported by the scripts beside each source | `art/blender` (33 `.blend` sources and their export scripts), [ART.md](ART.md), [CUSTOMIZATION.md](CUSTOMIZATION.md) |
| Painted artwork | Skies, horizons, clouds, surfaces, HUD art, effect frames, hangar and faction art, the cover image (`.webp` in `src/client/render/backgrounds` and beside it) | Painted by an AI image model from prompts kept in this repository, checked one sheet at a time, then cut, keyed and packed by this repository's tools | the README in each of `art/bg-sheets`, `fx-sheets`, `hud-sheets`, `hangar-sheets`, `faction-sheets`, `key-sheets`, `mech-sheets`, `track-sheets`; `tools/bg` |
| Model sheets | Not shipped: the drawings the Blender models were built to | Painted by an AI image model from prompts kept beside them | `art/model-sheets/README.md` |
| Pilot portraits | The fifteen pilots and the face parts | Painted in ChatGPT from the prompts in `art/portraits/PROMPTS.md` | `art/portraits/README.md` |
| Music | 13 pieces: a race song for each circuit and the title, hangar and results music (`public/music`), plus synthesised music the game generates itself | Made in Suno from the briefs in `tools/music/prompts.md`; the stems mixed and cut by this repository's tools. The synthesised music is code | `tools/music/README.md` |
| Sound effects | Recorded one-shots (`public/sfx`) and synthesised sounds the game generates itself | The recordings made in Suno's Sounds mode from the briefs in `tools/sfx/prompts.md`; the rest is code | `tools/sfx/README.md` |
| Studio card | The Infinite Maybe Games logo and its opening card | The logo is `art/brand/infinite-maybe-games.png`; the card is built into `index.html` by `tools/brand` | `art/brand`, `tools/brand` |
| Typeface | Barlow Condensed, four weights | Third party: SIL Open Font License 1.1, unmodified from `@fontsource/barlow-condensed` | its licence ships with any packaged build |
| Libraries | three.js, the Colyseus client and server | Third party: MIT | `package.json` |

Nothing else third-party ships in the game. (Dela Gothic One, a development
dependency, is used only by the trailer tool.)

## Not recorded yet

Things a reviewer may ask that this repository does not answer. They are the
owner's to fill in.

- **Which image model painted the sheets.** The portraits' is recorded
  (ChatGPT); the other sheets say only "an image model".
  `art/model-sheets/README.md` asks for the model and version to be written
  in.
- **The terms the generators were used under.** What may be done with
  Suno's and an image model's output depends on the account's plan and the
  service's terms at the time it was made.
- **How the studio logo was made.**
- **That nothing was traced, sampled or converted** from another game, a
  film, a stock library or a recording. Nothing in this repository suggests
  otherwise, but the owner has not been asked to state it.

Whether AI-generated work can be protected, and who owns it, varies by
country and by the terms of the tools used. That question is recorded here,
not settled.
