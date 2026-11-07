# The portrait template's framing guide and reference colours (art/portraits/guide).
# Run from the repository root: python3 art/portraits/guide/make_guides.py
import glob
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT = 'art/portraits/guide'
F = '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf'
FB = '/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf'
font = ImageFont.truetype(F, 22)
bold = ImageFont.truetype(FB, 24)
S = 1024

# ---- framing: the fifteen pilots averaged, faint, with the template's lines over them
fs = sorted(glob.glob('src/client/ui/art/pilot-*.webp'))
mean = np.mean([np.asarray(Image.open(f).convert('RGB').resize((S, S), Image.LANCZOS), dtype=np.float32) for f in fs], axis=0)
base = Image.fromarray((mean * 0.45 + 255 * 0.55).astype('uint8'))
d = ImageDraw.Draw(base)
INK = (20, 20, 30)
MAG = (210, 0, 160)
CY = (0, 140, 200)
GR = (0, 150, 60)

def hline(y, label, col, x0=0, x1=S, right=False):
    d.line([(x0, y), (x1, y)], fill=col, width=3)
    w = d.textlength(label, font=font)
    d.text((x1 - w - 10 if right else x0 + 10, y - 28), label, fill=col, font=font)

def vline(x, label, col, y0=0, y1=S):
    d.line([(x, y0), (x, y1)], fill=col, width=3)
    d.text((x + 8, y0 + 8), label, fill=col, font=font)

hline(70, 'top of the skull (bald): y 70', CY)
hline(410, 'EYE LINE: y 410 (40%)', MAG, right=True)
hline(655, 'chin: y 655', CY, x0=420)
hline(700, 'collar top (centre): y 700', GR, x0=0, x1=560)
vline(250, 'back of the skull: x 250', CY, y0=120, y1=520)
vline(745, 'nose tip: x 745', CY, y0=440, y1=560)
# the ear, under the headset
d.ellipse([(305, 375), (395, 495)], outline=MAG, width=3)
d.text((210, 500), 'ear / headset centre (350, 435)', fill=MAG, font=font)
# the head's outline, roughly (oval face, three-quarters to the right)
d.ellipse([(250, 70), (790, 660)], outline=INK, width=2)
d.text((560, 120), 'head (oval template)', fill=INK, font=font)
# the neck and the shoulders
d.rectangle([(420, 600), (640, 720)], outline=GR, width=2)
d.text((450, 725), 'neck into the collar', fill=GR, font=font)
d.text((40, 960), 'shoulders and suit run off the bottom edge, full width', fill=GR, font=font)
d.text((40, 20), 'hair may reach the top and left edges', fill=INK, font=bold)
d.text((620, 900), 'faces look toward the right edge', fill=INK, font=bold)
d.rectangle([(0, 0), (S - 1, S - 1)], outline=INK, width=2)
base.save(f'{OUT}/framing.png', optimize=True)

# ---- reference colours: what each recolourable thing is painted in
rows = [
    ('Background (every image)', [('flat', '#00FF00')]),
    ('Skin', [('base', '#C98B66'), ('shadow', '#9C6247')]),
    ('Hair, brows, facial hair', [('base', '#8C8C8C'), ('shadow', '#575757'), ('highlight', '#CFCFCF')]),
    ('Iris', [('base', '#3A8FE8'), ('shadow', '#22579A'), ('pupil', '#14101C')]),
    ('Ink (every outline)', [('ink', '#1C1622')]),
    ('Suit and headset: main', [('base', '#E03030'), ('shadow', '#A01E1E')]),
    ('Suit and headset: accent', [('base', '#3050E0'), ('shadow', '#1F35A0')]),
    ('Suit and headset: trim', [('base', '#F0C020'), ('shadow', '#B08A10')]),
    ('Under-suit, mic boom', [('base', '#2A2A33'), ('shadow', '#1A1A20')]),
]
W, RH = 1024, 96
img = Image.new('RGB', (W, RH * len(rows) + 70), 'white')
d = ImageDraw.Draw(img)
d.text((24, 10), 'Reference colours: flat, with one hard shadow tone (hair also a highlight band).', fill=INK, font=font)
d.text((24, 38), 'The game recolours them; paint as close to these as the style allows.', fill=INK, font=font)
for r, (name, sw) in enumerate(rows):
    y = 70 + r * RH
    d.text((24, y + 34), name, fill=INK, font=bold)
    for k, (label, hexc) in enumerate(sw):
        x = 420 + k * 200
        d.rectangle([(x, y + 10), (x + 80, y + 82)], fill=hexc, outline=INK)
        d.text((x + 92, y + 22), label, fill=INK, font=font)
        d.text((x + 92, y + 50), hexc, fill=INK, font=font)
img.save(f'{OUT}/colours.png', optimize=True)
print('ok')
