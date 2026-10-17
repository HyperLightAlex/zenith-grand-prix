# Contact sheet of finished frames: every `step`th frame between a and b.
#   python3 tools/trailer/review.py <frames dir> <out.png> <a> <b> <step> [columns]
import sys, os
from PIL import Image, ImageDraw
src, out, a, b, step = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
cols = int(sys.argv[6]) if len(sys.argv) > 6 else 5
w, h = 384, 216
ns = [n for n in range(a, b, step) if os.path.exists(f'{src}/{n:04d}.jpg')]
rows = (len(ns) + cols - 1) // cols
s = Image.new('RGB', (cols * (w + 2), rows * (h + 2)))
d = ImageDraw.Draw(s)
for i, n in enumerate(ns):
    x, y = (i % cols) * (w + 2), (i // cols) * (h + 2)
    s.paste(Image.open(f'{src}/{n:04d}.jpg').resize((w, h)), (x, y))
    d.text((x + 4, y + 4), f'{n} {n/24:.2f}s', fill='yellow')
s.save(out)
print(out, len(ns))
