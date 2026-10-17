# The second cut's new footage: the fights (lap 2, the battle lap), the other
# factions and the other two circuits. The sim is the same whichever factions
# fill the seats, so a fight found in one scan can be shot with any two teams.
# Writes shots2.json for tools/capture/capture.mjs (each shot names its own race).
import json, os, sys

FPS = 24
EXTRA = 2
shots = []


def race(seed, track, team=0, rival=1):
    return {'seed': seed, 'track': track, 'team': team, 'rival': rival}


def shot(id, v0, v1, tick, cam, rate=1.0, extra=EXTRA, **kw):
    frames = round((v1 - v0) * FPS) + extra
    shots.append({'id': id, 'v0': v0, 'v1': v1, 'tick': tick, 'frames': frames, 'w': 1920, 'h': 1080,
                  'step': round(rate / FPS, 5), 'cam': cam, **kw})


# Fights: an orbit round the two mechs (cam 'with'), standing back for both ('fit').
def duel(a, b, ang, R=8, fit=1.6, y=3.5, ly=4.5, fov=46, **kw):
    return {'type': 'orbit', 'mech': a, 'with': b, 'a': ang, 'R': R, 'fit': fit, 'y': y, 'ly': ly, 'fov': fov, **kw}


# ---- intro: blue sparks tear through the night: Kite and Shrike cross blades (two parries), slow.
shot('c03', 6.43, 9.61, 4664, duel(0, 1, [-62, -32]), rate=0.5, race=race(3, 'canyon'))

# ---- title: the three circuits.
# Helios Drop: the whole pack through the Loop (Mirage and Aurora).
shot('v_hel', 13.96, 14.55, 2868, {'type': 'fixed', 's': 4899, 'd': [112, 104], 'h': 63, 'look': {'s': 4899, 'h': 58}, 'fov': 60}, race=race(3, 'helios', 2, 3))
# Meridian Skyway: high over the water (Aurora and Tempest).
shot('v_mer', 14.55, 15.14, 890, {'type': 'fixed', 's': [1180, 1175], 'd': -70, 'h': 45, 'ly': 0, 'lx': -8, 'fov': 46}, rate=0.6, race=race(1, 'meridian', 3, 4))

# ---- verse 2: the other teams at it.
# Mirage's Sirocco takes Aurora's Orion with the Edge Finish (Helios).
shot('f1', 30.14, 30.93, 5432, duel(0, 1, -58, R=7, fit=1.5), rate=0.6, race=race(3, 'helios', 2, 3))
# Aurora's Bastion rams Tempest's Squall into the wall (Helios).
shot('f2', 30.93, 31.72, 5440, duel(5, 0, 62, R=8, fit=1.5), rate=0.6, race=race(2, 'helios', 4, 3))
# Tempest's Anvil brings the Breaker Slam down on Mirage's Dune (Canyon).
shot('f3', 31.72, 32.51, 8176, duel(4, 5, -60, R=8, fit=1.5), rate=0.6, race=race(2, 'canyon', 4, 2))

# ---- pre-chorus: trembling fingers grip the future: Kite and Shrike in the Corkscrew, parry for parry, slow.
shot('p1', 32.51, 35.64, 5916, duel(0, 1, [40, -40], R=9, fit=1.5), rate=0.6, race=race(3, 'canyon'))

# ---- the build to the punch: two impacts.
# Golem's Breaker Slam lands on Kite.
shot('i1', 40.40, 40.80, 4661, duel(5, 0, -72, R=6, fit=1.2, y=3, fov=50), rate=0.6, extra=1, race=race(12, 'canyon'))
# Kite's Lance Dash goes through Golem.
shot('i2', 40.80, 41.17, 7849, duel(0, 5, 60, R=6, fit=1.2, y=3, fov=50), rate=0.6, extra=1, race=race(5, 'canyon'))

# ---- chorus: burning hearts made one: Atlas holds off Moth (Disruptor pulse, then Atlas's Ram into the wall).
shot('t1', 47.51, 51.83, 7740, duel(4, 3, [55, 30], R=9, fit=1.6), race=race(9, 'canyon'))

# ---- seize tomorrow: Kite's Lance Dash and Edge take Golem out (the game's own knockout: impact frame, painted still, slow motion).
shot('k1', 51.83, 54.57, 7840, duel(0, 5, [-40, -70], R=9, fit=1.6), race=race(5, 'canyon'))

json.dump({'seed': 11, 'shots': shots}, open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots2.json'), 'w'), indent=1)
print(len(shots), 'shots', sum(s['frames'] for s in shots), 'frames')
