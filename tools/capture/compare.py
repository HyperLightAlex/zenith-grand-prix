# Before and after, frame for frame: the same shot captured from two builds
# (see README.md, "Before and after"), one above the other, labelled.
#   python3 tools/capture/compare.py <before dir> <after dir> <shot id> <out.png> [frames] [width]
#   python3 tools/capture/compare.py cap-old cap-new boost-front cmp.png 1,2,3,4
# frames: comma-separated frame numbers (default: five spread over the shot).
import sys, os, glob
from PIL import Image, ImageDraw

before, after, shot, out = sys.argv[1:5]
W = int(sys.argv[6]) if len(sys.argv) > 6 else 480
H = W * 9 // 16
files = [sorted(glob.glob(f'{d}/{shot}/*.jpg')) for d in (before, after)]
n = min(len(f) for f in files)
if n == 0:
    sys.exit(f'no frames for {shot} in both {before} and {after}')
if len(sys.argv) > 5 and sys.argv[5]:
    picks = [int(x) for x in sys.argv[5].split(',') if int(x) < n]
else:
    picks = sorted({round(i * (n - 1) / 4) for i in range(5)})
sheet = Image.new('RGB', (len(picks) * W, 2 * H))
draw = ImageDraw.Draw(sheet)
for row, (label, fs) in enumerate((('before', files[0]), ('after', files[1]))):
    for col, k in enumerate(picks):
        sheet.paste(Image.open(fs[k]).resize((W, H)), (col * W, row * H))
        draw.text((col * W + 4, row * H + 2), f'{label} {os.path.basename(fs[k])}', fill='yellow')
sheet.save(out)
print(out, len(picks), 'frames')
