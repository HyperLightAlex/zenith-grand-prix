# The opening's game shots: each is cut to the song (video in/out times on the
# beat), placed at a moment of the seed-11 race, with its own camera.
# Writes shots.json for tools/capture/capture.mjs. Footage is drawn at the cut's 24
# frames a second: the camera moves as smoothly as it does in play, and the
# game itself still poses the mechs on twos.
import json, os, sys

FPS = 24
EXTRA = 2  # spare frames at the tail of every shot, for trimming in the edit
shots = []


def shot(id, v0, v1, race, cam, rate=1.0, extra=EXTRA, **kw):
    """Video v0..v1 (seconds), starting at race time `race` (seconds, tick/60),
    playing at `rate` race seconds per video second."""
    frames = round((v1 - v0) * FPS) + extra
    # Native 1080p: the mech ink is drawn in pixels (its inner lines are about
    # one pixel at 1080 lines), so a smaller picture scaled up loses them.
    shots.append({'id': id, 'v0': v0, 'v1': v1, 'tick': round(race * 60), 'frames': frames, 'w': 1920, 'h': 1080,
                  'step': round(rate / FPS, 5), 'cam': cam, **kw})


# ---- intro: blue sparks tear through the night --------------------------------
# Kite carving out of T2, the skates throwing cyan sparks; skate level, rising to the body.
shot('s02', 3.27, 6.43, 24.40, {'type': 'mech', 'x': 6.5, 'y': [1.1, 2.4], 'z': 2.5, 'ly': [1.1, 3.2], 'fov': 42}, rate=0.6)
# Trackside low in the run to T2 as the pack streaks past, Kite boosting.
shot('s03', 6.43, 9.61, 22.60, {'type': 'fixed', 's': [2088, 2100], 'd': -15.5, 'h': 1.4, 'ly': 4, 'fov': 50}, rate=0.6)
# The Sunhawk's face at speed, pushing in (eye glints go on in the edit).
shot('s04', 9.61, 13.27, 19.60, {'type': 'mech', 'at': 'head', 'x': 1.0, 'y': 0.2, 'z': [3.8, 3.0], 'ly': 0, 'fov': 32})

# ---- title: the circuit, three cuts on the kicks ------------------------------
shot('s05a', 13.27, 13.56, 5.6, {'type': 'fixed', 's': [150, 140], 'd': 20, 'h': [30, 34], 'ly': 0, 'fov': 50})
shot('s05b', 13.56, 14.35, 20.4, {'type': 'fixed', 's': [1760, 1750], 'd': 10, 'h': [70, 74], 'ly': 0, 'fov': 50})
shot('s05c', 14.35, 15.14, 167.0, {'type': 'fixed', 's': [5640, 5700], 'd': 70, 'h': 30, 'ly': 0, 'fov': 40})

# ---- verse 1 -----------------------------------------------------------------
# Wind against a chest of steel: on the grid, a slow push in on the chest.
shot('s07', 19.23, 22.24, 14 / 60, {'type': 'orbit', 'a': [25, 8], 'R': [8, 5.6], 'y': [5.6, 6.5], 'ly': [6.0, 6.8], 'fov': 36}, rate=0.18)
# The red lamps strike the signal: two beats a count.
shot('s08a', 22.24, 23.03, 58 / 60, {'type': 'fixed', 's': [30, 26], 'd': 0, 'h': 7, 'lx': 9, 'ly': 4, 'fov': 44}, rate=0.3)
shot('s08b', 23.03, 23.82, 118 / 60, {'type': 'mech', 'mech': 1, 'x': -1.2, 'y': 6.6, 'z': [5.8, 5.2], 'ly': 6.8, 'fov': 34}, rate=0.3)
shot('s08c', 23.82, 24.61, 178 / 60, {'type': 'mech', 'x': 5, 'y': 2.5, 'z': [5.5, 4.8], 'ly': 4, 'fov': 40}, rate=0.3)
shot('s08d', 24.61, 25.40, 236 / 60, {'type': 'fixed', 's': [8076, 8079], 'd': -6, 'h': 1.0, 'ly': 4, 'fov': 52})
# Off we run, past the limit: the pack past a low trackside camera, then behind Kite boosting on the Mesa.
shot('s10a', 28.56, 30.14, 4.9, {'type': 'fixed', 's': 90, 'd': -20.5, 'h': 1.2, 'ly': 4, 'fov': 50})
shot('s10b', 30.14, 32.51, 14.9, {'type': 'mech', 'x': 2, 'y': 4.2, 'z': [-9, -6.5], 'ly': 4, 'lz': 20, 'fov': 50})

# ---- pre-chorus --------------------------------------------------------------
# Trembling fingers grip the future: Kite carving T7 on lap 2, low and slow.
shot('s11', 32.51, 35.64, 134.0, {'type': 'orbit', 'a': [70, 115], 'R': 8, 'y': 2.5, 'ly': 4, 'fov': 45}, rate=0.5)
# Betting everything on this one lap: long lens from ahead, Shrike leading Kite to the line.
shot('s12', 35.64, 38.82, 135.6, {'type': 'mech', 'mech': 1, 'x': 10, 'y': 4, 'z': [30, 26], 'lx': -3, 'ly': 4, 'lz': -40, 'fov': 16}, rate=0.41)
# Faster and faster: faces and hands.
shot('s13a', 38.82, 39.61, 136.0, {'type': 'mech', 'mech': 1, 'at': 'head', 'x': 0.8, 'y': 0.2, 'z': 3.6, 'ly': 0, 'fov': 32})
shot('s13b', 39.61, 40.40, 136.2, {'type': 'mech', 'at': 'head', 'x': -0.8, 'y': 0.2, 'z': 3.4, 'ly': 0, 'fov': 32})
shot('s13c', 40.40, 40.80, 136.55, {'type': 'orbit', 'mech': 1, 'a': 80, 'R': 4.5, 'y': 4.5, 'ly': 4.5, 'fov': 40})
shot('s13d', 40.80, 41.17, 136.75, {'type': 'orbit', 'a': -80, 'R': 4.5, 'y': 4.5, 'ly': 4.5, 'fov': 40})

# ---- chorus ------------------------------------------------------------------
# THE PUNCH: Overdrive. Hero front, then it tears past the camera.
shot('s14a', 41.98, 41.98 + 28 / 24, 8217 / 60, {'type': 'mech', 'x': [1.5, 2.5], 'y': [2.0, 2.8], 'z': [7.5, 9], 'ly': 4.2, 'fov': [62, 50]}, impact=[0], warm=40, extra=0)
shot('s14b', 41.98 + 28 / 24, 44.72, (8217 + 28 * 2.5) / 60, {'type': 'mech', 'x': 4.5, 'y': 3, 'z': [10, -14], 'ly': 3.5, 'fov': 55}, warm=0)
# At a speed that overtakes the stars: off the crest into the canyon, over the camera.
shot('s15a', 44.72, 46.32, 143.6, {'type': 'mech', 'x': [-10, -7], 'y': 0.5, 'z': [6, -2], 'ly': 3, 'fov': 50})
shot('s15b', 46.32, 47.51, 145.9, {'type': 'mech', 'mech': 1, 'x': -4, 'y': 3.5, 'z': 12, 'ly': 4, 'fov': 45})
# Burning hearts made one: Solstice together (pilot panels go over it in the edit).
shot('s16', 47.51, 51.83, 49.4, {'type': 'mech', 'mech': 2, 'x': -4, 'y': [9, 6], 'z': [28, 22], 'lx': -5, 'ly': 3, 'fov': 34}, rate=0.5)
# Seize tomorrow, race on through: the Crossover duel, the Sky Bridge, the mid-air pass.
shot('s17a', 51.83, 53.38, 160.6, {'type': 'mech', 'x': -4, 'y': 3.5, 'z': 16, 'lx': -3, 'ly': 4, 'fov': 42})
shot('s17b', 53.38, 54.57, 167.3, {'type': 'mech', 'x': 16, 'y': 6, 'z': 6, 'ly': 2, 'fov': 55})
shot('s17c', 54.57, 56.15, 168.7, {'type': 'mech', 'x': 12, 'y': -2, 'z': 3, 'ly': 4, 'fov': 50}, rate=0.5)

# ---- outro -------------------------------------------------------------------
# Take the final corner: T7 on the last lap, low at the apex, slow.
shot('s18a', 56.15, 58.10, 178.3, {'type': 'fixed', 's': [7690, 7705], 'd': 21, 'h': 1.0, 'ly': 3, 'fov': 42}, rate=0.5)
# The run to the line, Shrike in Overdrive behind.
shot('s18b', 58.10, 60.84, 179.3, {'type': 'mech', 'x': -2, 'y': 4, 'z': 24, 'ly': 4, 'lz': -60, 'fov': 22}, rate=0.67)
# Across the line: the frame laid down as a painted still.
shot('s18c', 60.84, 61.63, 10840 / 60, {'type': 'fixed', 's': 25, 'd': 4, 'h': 2.5, 'ly': 4, 'fov': 40})
# A new sky we win together: the fist in the air, then up into the sunset.
shot('s19', 61.63, 66.32, 181.6, {'type': 'orbit', 'a': [30, 60], 'R': [9, 11], 'y': [1.5, 4], 'ly': [6.5, 7, 9, 40], 'fov': 40})

json.dump({'seed': 11, 'shots': shots}, open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots.json'), 'w'), indent=1)
print(len(shots), 'shots', sum(s['frames'] for s in shots), 'frames')
