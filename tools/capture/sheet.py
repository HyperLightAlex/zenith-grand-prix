# Contact sheet: one row per shot (its frames, evenly picked), labelled.
#   python3 tools/capture/sheet.py <frames dir> <out.png> [per-row] [width] [ids...]
import sys, os, glob
from PIL import Image, ImageDraw

src, out = sys.argv[1], sys.argv[2]
per = int(sys.argv[3]) if len(sys.argv) > 3 else 3
W = int(sys.argv[4]) if len(sys.argv) > 4 else 400
only = sys.argv[5:]
rows = []
for d in sorted(os.listdir(src)):
    if only and not any(d == o or d.startswith(o) for o in only):
        continue
    fs = sorted(glob.glob(f'{src}/{d}/*.jpg'))
    if not fs:
        continue
    pick = [fs[round(i * (len(fs) - 1) / max(1, per - 1))] for i in range(per)] if len(fs) > per else fs
    rows.append((d, pick))
H = W * 9 // 16
sheet = Image.new('RGB', (per * (W + 4) + 70, len(rows) * (H + 4)), 'black')
dr = ImageDraw.Draw(sheet)
for r, (name, pick) in enumerate(rows):
    dr.text((4, r * (H + 4) + 4), name, fill='white')
    for i, f in enumerate(pick):
        im = Image.open(f).convert('RGB').resize((W, H))
        sheet.paste(im, (70 + i * (W + 4), r * (H + 4)))
sheet.save(out)
print(out, sheet.size, len(rows), 'rows')
