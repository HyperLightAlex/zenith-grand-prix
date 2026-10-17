# Find the fights in scanned races: exchanges of blows between two mechs,
# parries, knockouts, wall slams and the big abilities, scored for how they
# would read on screen.
#   python3 tools/capture/fights.py scans/*.json [--top N] [--pair a,b]
# Scans come from scan.mjs, named <anything>-<team>v<rival>.json (s5-0v1.json).
import json, sys, os, bisect
from collections import defaultdict

ATK = ['Edge', 'Edge', 'Edge Finish', 'Lance Dash', 'Carbine', 'Stun Kick', 'Breaker', 'Breaker Slam', 'Scatter', 'Snare', 'Pulse', 'Ram']
ABIL = ['Overdrive', 'Break Away', 'Snare', 'Pulse', 'Ram', 'Aegis']
FACTION = ['Solstice', 'Vanta', 'Mirage', 'Aurora', 'Tempest']
W_HIT = {0: 3, 1: 3, 2: 6, 3: 7, 4: 0.3, 5: 5, 6: 4, 7: 7, 8: 0.4, 9: 1, 10: 2, 11: 8}

args = sys.argv[1:]
top = 8
if '--top' in args:
    i = args.index('--top'); top = int(args[i + 1]); del args[i:i + 2]
for path in args:
    d = json.load(open(path))
    name = os.path.basename(path)[:-5]
    team, rival = (int(x) for x in name.split('-')[1].split('v'))
    K = d['keys']; ix = {k: i for i, k in enumerate(K)}
    ticks = [s['tick'] for s in d['states']]
    who = {m['id']: f"{m['name']}({FACTION[team if m['team'] == 0 else rival][:3]})" for m in d['mechs']}

    def state(t):
        i = max(0, min(len(ticks) - 1, bisect.bisect_left(ticks, t)))
        return d['states'][i]['m']

    def apart(t, a, b):
        m = state(t)
        return abs(m[a][ix['s']] - m[b][ix['s']]), abs(m[a][ix['d']] - m[b][ix['d']])

    # Every scoring moment, keyed by the pair of mechs it is between.
    moments = defaultdict(list)
    for e in d['events']:
        t, ty = e['tick'], e['type']
        if ty == 'hit' and e['attack'] != 4:
            w = W_HIT.get(e['attack'], 1) * (1.4 if e['heavy'] else 1) * (0.5 if e['blocked'] else 1)
            moments[tuple(sorted((e['attacker'], e['victim'])))].append((t, w, f"{ATK[e['attack']]}{'!' if e['heavy'] else ''}{' blocked' if e['blocked'] else ''} {who[e['attacker']]}>{who[e['victim']]}"))
        elif ty == 'parry':
            moments[tuple(sorted((e['mech'], e['attacker'])))].append((t, 9, f"PARRY {who[e['mech']]} vs {who[e['attacker']]}"))
        elif ty == 'ko':
            moments[tuple(sorted((e['mech'], e['by'])))].append((t, 25, f"KO {who[e['by']]} > {who[e['mech']]}"))
        elif ty == 'splat':
            moments[tuple(sorted((e['mech'], e['by'])))].append((t, 6, f"SPLAT {who[e['by']]} slams {who[e['mech']]} into the wall"))
        elif ty == 'ability' and e['ability'] in (1, 3, 4, 5):
            moments[(e['mech'], e['mech'])].append((t, 4, f"{ABIL[e['ability']]} by {who[e['mech']]}"))
    # Windows of two seconds: the busiest exchanges between each pair.
    found = []
    for pair, ms in moments.items():
        ms.sort()
        for i, (t0, _, _) in enumerate(ms):
            win = [m for m in ms[i:] if m[0] - t0 <= 120]
            score = sum(m[1] for m in win)
            found.append((score, t0, pair, win))
    found.sort(key=lambda x: -x[0])
    used = []
    print(f'== {name}  ({FACTION[team]} v {FACTION[rival]})  ticks {d["tick"]}')
    n = 0
    for score, t0, pair, win in found:
        if any(abs(t0 - u) < 150 and p == pair for u, p in used):
            continue
        used.append((t0, pair))
        a, b = pair
        ds, dd = apart(t0, a, b)
        lap = state(t0)[a][ix['lap']]
        print(f'  {score:5.1f}  t{t0:6d} ({t0/60:6.1f}s lap{lap})  {who[a]} / {who[b]}  apart s{ds:4.0f} d{dd:4.0f}  :: ' + ' | '.join(f'{m[0]-t0:+d} {m[2]}' for m in win[:7]))
        n += 1
        if n >= top:
            break
