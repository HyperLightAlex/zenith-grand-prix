# Zenith GP inside a host (Akeru)

The game runs on its own page, and inside a host that shows it in a frame of
its own: Backbone's Akeru is the one it was written for. Nothing in the game
is patched for that. It has one seam, `src/client/platform.ts`, and a host
that sets `globalThis.zenithPlatform` before the game's program loads takes
over what is behind it.

## The seam

| | On its own page | Inside a host |
|---|---|---|
| `storage` | `localStorage` | the host's save (Akeru: one `progress` slot, each value at most 131,072 characters, only the keys in `SAVE_KEYS`) |
| `session` | `sessionStorage` | memory: a reload starts again |
| `getGamepads` / `beginInputFrame` | the browser's pads | the host's controls as one standard pad, stepped once a frame |
| `rumble` | the pad's own | the host's |
| `server` | `?server=`, else beside the page | the address the host gives, or `null`: Online says it is not switched on here |
| `hostMenu` | no | yes: Start is the host's, so the game's pause is on View (and the tuning panel has no button) |
| `fullscreen`, `links`, `downloads` | yes | no: no full-screen switch, no invitation links (codes only), no photo downloads |

`SAVE_KEYS` in that file is everything the game keeps between visits. A test
(`tests/platform.test.ts`) fails if any part of the game reads `localStorage`
or `navigator.getGamepads` directly, or keeps a key that is not in the list.
Ghost laps are one key a circuit (`zgp.ghosts.<circuit>`), so no single value
is large.

A host also drives the game through three calls on `game`:

- `setHostPaused(on)`: the host's menu is open, or its page is hidden. Nothing
  moves, sounds or is drawn, and no control stays held. A race offline is left
  at the pause menu. A race online is the room's and goes on.
- `hostRestart()`: start the race again, if there is one of the player's own.
- `setSound(on)`: sound as a whole, without touching the volumes in Settings.

## The hosted build

`vite build --mode hosted` is the build a host packages: no compressed copies
beside the files (the host's store does that). `ZGP_BUILD` names the build
(`0.5.0+abc1234`) so the room server run for it can be given the same name in
`GAME_BUILD`.

In `index.html`, the studio's opening card and the script that plays it sit
between `studio-card` markers. A host that allows no script in the page itself
cuts from one marker to the other; `ui/boot.ts` carries on without the card.
Hosted, the fonts are registered from their files by script (`fonts.ts`).

## Akeru's package

The adapter, build recipe, release packager and tests are written for Akeru's
repository (`packages/zenith-grand-prix` there, following its Lumen Run and
Ironwing Cup packages); they are a branch handed to Akeru's maintainers, not
yet part of it. The package pins a commit of this repository, builds it with the
hosted build above, and packages the result with the title's content policy.
The same package builds this repository's server (`ROOMS_ONLY`, `GAME_BUILD`,
`ALLOWED_ORIGINS`, `MAX_SOCKETS`, `FORWARDED_HOPS`: see [ONLINE.md](ONLINE.md))
as the title's own service. Online play there is off until that service is
deployed and its address is put in the package.

## Start and the stick clicks

What reaches the game depends on where Akeru is running, so the game takes
both and depends on neither:

- **Start** opens Akeru's own menu in a browser and is not passed on, so the
  game's pause is on View there (`hostMenu`). In Akeru's phone app, whose
  menu is the app's, Start is passed on, and pauses the game too.
- **Stick clicks** (Escort a teammate on L3, Look back on R3) are passed on
  to a title that asks for them with a reviewed input mapping, which Akeru's
  package for this game does (`host/input.js` there). The phone app's
  on-screen pad sends them to every title.

## Still open

- Quick Play places players with strangers: it is this game's online mode,
  and the package says so plainly for Akeru's review.
- Akeru publishes a game whose rights are not formally reviewed by a recorded
  decision for one commit, on the strength of a record of where everything in
  it came from (the route its Dead End Dash took: a `docs/ASSETS.md` in the
  game, a `RELEASE.md` in the package). This repository has no such record
  yet for its models, artwork, portraits, music and sounds.
