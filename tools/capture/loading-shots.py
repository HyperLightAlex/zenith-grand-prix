"""The loading card's pictures of each circuit, from a capture of
loading-shots.json: each shot's frame as src/client/ui/art/circuits/<id>.webp.

    node tools/capture/capture.mjs tools/capture/loading-shots.json captures/loading
    python3 tools/capture/loading-shots.py captures/loading

The shots are moments of a seeded race through a camera over the shoulder
of the lead mech (or high off the road): see the file. To change one, find
a better moment with PREVIEW=4, put its tick or camera in the file, capture
it and run this again.
"""
import os
import sys

from PIL import Image

QUALITY = 78
WIDTH = 1600

frames = sys.argv[1] if len(sys.argv) > 1 else 'captures/loading'
out = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'client', 'ui', 'art', 'circuits')
os.makedirs(out, exist_ok=True)
total = 0
for shot in sorted(os.listdir(frames)):
    src = os.path.join(frames, shot, '0000.jpg')
    if not os.path.exists(src):
        continue
    im = Image.open(src).convert('RGB')
    if im.width != WIDTH:
        im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
    dst = os.path.join(out, f'{shot}.webp')
    im.save(dst, 'WEBP', quality=QUALITY, method=6)
    total += os.path.getsize(dst)
    print(f'{shot}: {os.path.getsize(dst) // 1024} KB')
print(f'{total // 1024} KB in all')
