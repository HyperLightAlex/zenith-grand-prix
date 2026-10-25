# How two sets of pictures differ (tools/visual-check.mjs, before and after a
# change): per picture, the mean difference, the share of pixels that changed
# visibly and the largest change; and for each picture that changed, a sheet
# of before, after and the difference (amplified) side by side.
#
#   python3 tools/capture/diff.py <before dir> <after dir> <report dir> [visible=12] [fail=0.002]
#
# visible: a pixel counts as changed when a channel differs by more than this
# (out of 255). fail: the share of changed pixels above which a picture is
# reported as CHANGED (and the exit status is 1). Pictures under it are
# listed as "noise" when anything differs at all.
import os, sys
from PIL import Image, ImageChops, ImageDraw

before, after, report = sys.argv[1:4]
VISIBLE = int(sys.argv[4]) if len(sys.argv) > 4 else 12
FAIL = float(sys.argv[5]) if len(sys.argv) > 5 else 0.002
os.makedirs(report, exist_ok=True)

names = sorted(f for f in os.listdir(before) if f.endswith('.png'))
missing = sorted(set(f for f in os.listdir(after) if f.endswith('.png')) ^ set(names))
rows, changed = [], 0
for name in names:
    pa, pb = os.path.join(before, name), os.path.join(after, name)
    if not os.path.exists(pb):
        continue
    a, b = Image.open(pa).convert('RGB'), Image.open(pb).convert('RGB')
    if a.size != b.size:
        rows.append((name, 1.0, 255.0, 255, 'SIZE'))
        changed += 1
        continue
    d = ImageChops.difference(a, b)
    # The largest channel difference per pixel.
    r, g, bl = d.split()
    m = ImageChops.lighter(ImageChops.lighter(r, g), bl)
    hist = m.histogram()
    total = a.size[0] * a.size[1]
    vis = sum(hist[VISIBLE + 1:]) / total
    mean = sum(i * c for i, c in enumerate(hist)) / total
    peak = max(i for i, c in enumerate(hist) if c) if any(hist) else 0
    status = 'CHANGED' if vis > FAIL else ('noise' if peak > 0 else 'same')
    if status == 'CHANGED':
        changed += 1
    rows.append((name, vis, mean, peak, status))
    if peak > 0:
        W = min(640, a.size[0])
        H = round(a.size[1] * W / a.size[0])
        amp = m.point(lambda v: min(255, v * 8)).convert('RGB')
        sheet = Image.new('RGB', (W * 3, H + 18), (20, 20, 28))
        for i, (img, label) in enumerate(((a, 'before'), (b, 'after'), (amp, f'difference x8 ({vis * 100:.2f}% visible, peak {peak})'))):
            sheet.paste(img.resize((W, H)), (i * W, 18))
            ImageDraw.Draw(sheet).text((i * W + 4, 3), label, fill=(255, 230, 120))
        sheet.save(os.path.join(report, name.replace('.png', '.jpg')), quality=88)

with open(os.path.join(report, 'report.txt'), 'w') as f:
    f.write(f'{before} -> {after}: {len(rows)} pictures, {changed} changed (visible > {VISIBLE}/255 on more than {FAIL * 100:.2f}% of pixels)\n')
    for name, vis, mean, peak, status in sorted(rows, key=lambda r: -r[1]):
        f.write(f'{status:8} {vis * 100:7.3f}% visible  mean {mean:6.3f}  peak {peak:3}  {name}\n')
    if missing:
        f.write('only on one side: ' + ', '.join(missing) + '\n')
print(open(os.path.join(report, 'report.txt')).read(), end='')
sys.exit(1 if changed or missing else 0)
