# The game's CRT screen over finished frames: its CrtPass shader (the colour
# guns a pixel apart, the line smearing brights into darks, a little more
# colour) and the .crt-layer CSS over it (the tube's vignette, scanlines, the
# phosphor mask, rounded corners, the inner shadow).
#   python3 tools/trailer/crt.py <frames dir> <out dir> [first] [last]   (jpg in, jpg out)
#   python3 tools/trailer/crt.py <frames dir> -                          (raw rgb24 to stdout, for ffmpeg)
# (pip install numpy scipy pillow)
import sys, os, glob
import numpy as np
from PIL import Image
from scipy.special import erfc

W, H = 1920, 1080


def shift(a, dx):
    """a sampled at x + dx (pixels, may be fractional), clamped at the edges."""
    i = int(np.floor(dx))
    f = dx - i
    def s(n):
        if n == 0:
            return a
        if n > 0:
            return np.concatenate([a[:, n:], np.repeat(a[:, -1:], n, axis=1)], axis=1)
        return np.concatenate([np.repeat(a[:, :1], -n, axis=1), a[:, :n]], axis=1)
    return s(i) if f == 0 else s(i) * (1 - f) + s(i + 1) * f


def shader(img):
    # CrtShader: offsets in pixels of a 1080-line picture.
    o = 1.0
    c = np.empty_like(img)
    c[..., 0] = shift(img[..., 0], o * 0.9)
    c[..., 1] = img[..., 1]
    c[..., 2] = shift(img[..., 2], -o * 0.9)
    l = shift(img, -o * 2.5)
    r = shift(img, o * 2.5)
    c = c + (np.maximum(c, (l + r) * 0.5) - c) * 0.4
    c = c + ((l + c + r) / 3.0 - c) * 0.25
    y = (c @ np.array([0.299, 0.587, 0.114], np.float32))[..., None]
    c = (y + (c - y) * 1.12) * 1.08
    return np.clip(c, 0, 1)


def overlay():
    """What the CSS layer does to the picture: a multiplier, plus the mask's tint."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.45) 100%), farthest-corner.
    rx, ry = W / 2 * np.sqrt(2), H / 2 * np.sqrt(2)
    d = np.sqrt(((xx + 0.5 - W / 2) / rx) ** 2 + ((yy + 0.5 - H / 2) / ry) ** 2)
    vig = np.clip((d - 0.55) / 0.45, 0, 1) * 0.45
    # Scanlines: the game darkens one row in three (rgba(0,0,0,.26)). A video is
    # scaled and compressed on the way to a screen, which turns one-pixel rows
    # into moire, so here they are a soft four-row line.
    rows = np.array([0.26, 0.11, 0.0, 0.11], np.float32)
    scan = rows[(yy.astype(int)) % 4]
    # inset 0 0 5vmin rgba(0,0,0,.5): a blurred shadow in from every edge.
    sigma = 0.05 * H / 2
    edge = np.minimum(np.minimum(xx + 0.5, W - xx - 0.5), np.minimum(yy + 0.5, H - yy - 0.5))
    inset = 0.5 * 0.5 * erfc(edge / (sigma * np.sqrt(2)))
    # Rounded corners (2.2vmin), black beyond them.
    R = 0.022 * H
    cx = np.clip(xx + 0.5, R, W - R)
    cy = np.clip(yy + 0.5, R, H - R)
    outside = np.clip(np.sqrt((xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2) - R + 0.5, 0, 1)
    keep = (1 - vig) * (1 - scan) * (1 - inset) * (1 - outside)
    # The phosphor mask: red, green, blue columns at 4%.
    tint = np.array([[1, 60 / 255, 60 / 255], [60 / 255, 1, 60 / 255], [70 / 255, 70 / 255, 1]], np.float32)[(xx.astype(int)) % 3]
    return keep[..., None].astype(np.float32), tint.astype(np.float32), (1 - outside)[..., None].astype(np.float32)


KEEP, TINT, INSIDE = overlay()


def crt(path):
    img = np.asarray(Image.open(path).convert('RGB'), np.float32) / 255.0
    c = shader(img)
    c = c * 0.96 + TINT * 0.04 * INSIDE  # the mask, laid over at 4%
    c = c * KEEP
    return (np.clip(c, 0, 1) * 255 + 0.5).astype(np.uint8)


if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    files = sorted(glob.glob(f'{src}/*.jpg'))
    if len(sys.argv) > 4:
        files = files[int(sys.argv[3]):int(sys.argv[4])]
    if out == '-':
        w = sys.stdout.buffer
        for f in files:
            w.write(crt(f).tobytes())
    else:
        os.makedirs(out, exist_ok=True)
        for f in files:
            Image.fromarray(crt(f)).save(f'{out}/{os.path.basename(f)}', quality=95)
