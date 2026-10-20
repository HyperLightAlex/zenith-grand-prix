#!/usr/bin/env python3
"""Turn Suno's sound-effect takes into the files the game plays.

    python3 tools/sfx/build.py <folder> [<folder> ...] [--out public/sfx]
    python3 tools/sfx/build.py --drop <sound>[,<sound>...]
    python3 tools/sfx/build.py --reference <audio-check dump folder>

<folder> holds the takes, each named after the sound it is for, as in
prompts.md: `hit_heavy.wav`, a second take `hit_heavy-2.wav`, and so on
(WAV, MP3 or M4A). Every sound found is built, and replaces whatever that
sound had before; the sounds not found keep theirs, so the batches can come
in one at a time. Writes, into public/sfx/:

  <sound>-<n>.mp3   one file a take
  manifest.json     each sound's takes, and its gain

Each take is first shaped as sounds.json asks (see shape(): a high-pass, a
brighter top, a start just before its peak), then cut to the sound itself:
from just before it starts (the game should hear the hit the moment it
happens, not a run-up of silence) to where it has died away, or to its
`max` length (twice the length asked for, unless sounds.json says) if it
goes on; the end fades out. It is folded to mono unless its stereo is wide
enough to matter (an explosion, say); the game pans every sound to where it
happens anyway. All the takes of one sound are brought to the same loudness,
so that whichever plays, it is as loud. Then the sound's gain sets that
loudness to the loudness of the synthesised sound it stands in for (or the
level sounds.json gives it), so a recording comes into the mix where the old
sound sat. The loudness here is the loudest tenth of a second, K-weighted as
LUFS are: right for a short, sharp sound, where an average over its length
would count its silence.

--drop takes sounds' recordings out (their files, and their place in the
manifest), so they go back to their recipes: for takes built as the wrong
sound, say.

--reference measures the synthesised sounds, from what
`node tools/audio-check.mjs --quick --only sfx --dump <dir>` renders (the
sfxpre-*.wav files: before the limiter, which then takes off a recording
what it takes off its recipe), into reference.json. Run it again whenever a
recipe or its level in SFX_META changes. `--only recorded` in the audio
check then compares each recording with its recipe as the game plays them.
"""
import argparse, glob, json, os, re, subprocess, sys, tempfile
import numpy as np
import soundfile as sf
from fractions import Fraction
from scipy.signal import butter, lfilter, resample_poly, sosfilt

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SFX_TS = os.path.join(ROOT, 'src/client/audio/sfx.ts')
REFERENCE = os.path.join(HERE, 'reference.json')
SOUNDS = os.path.join(HERE, 'sounds.json')

SR = 48000
CEILING = -1.0       # dBFS: the loudest take's peak, so the encoder has room
ONSET_DB = -50       # re the take's peak: the sound has started
TAIL_DB = -60        # re the take's peak: it has died away
PRE_ROLL = 0.002     # seconds kept before the start (faded in over it)
MONO_SIDE_DB = -18   # stereo kept only where the side is louder than this re the mid
WINDOW = 0.1         # seconds: the loudness window
# The audio check renders at the game's default volumes, and dumps what goes
# into the limiter: there, each sound at its SFX_META level times the
# effects volume, 0.9 (synth.ts). The master volume and the limiter come
# after, and treat a recording and the recipe it stands in for alike.
VOLUMES_DB = 20 * np.log10(0.9)
NAME = re.compile(r'^([a-z_]+?)(?:-(\d+))?$')


def sfx_levels():
    """Each sound's level in SFX_META (sfx.ts)."""
    src = open(SFX_TS).read()
    meta = src[src.index('export const SFX_META'):]
    meta = meta[:meta.index('\n};')]
    return {m.group(1): float(m.group(2)) for m in re.finditer(r'^\s+(\w+): m\(([\d.]+)', meta, re.M)}


def k_weight(x, sr):
    """The two filters of ITU-R BS.1770: a high shelf for the head, a high-pass."""
    f0, G, Q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    K = np.tan(np.pi * f0 / sr)
    Vh = 10 ** (G / 20)
    Vb = Vh ** 0.4996667741545416
    a0 = 1 + K / Q + K * K
    b1 = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0]
    a1 = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    f0, Q = 38.13547087602444, 0.5003270373238773
    K = np.tan(np.pi * f0 / sr)
    a0 = 1 + K / Q + K * K
    a2 = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    return lfilter([1, -2, 1], a2, lfilter(b1, a1, x, axis=0), axis=0)


def loudness(x, sr):
    """
    The loudest WINDOW of `x` (frames x channels), K-weighted, in LUFS. Mono
    is measured as the game plays it: on both channels at once.
    """
    if x.shape[1] == 1:
        x = np.repeat(x, 2, axis=1)
    y = k_weight(x, sr)
    p = (y ** 2).sum(axis=1)
    n = int(WINDOW * sr)
    if len(p) < n:
        p = np.pad(p, (0, n - len(p)))
    c = np.concatenate([[0], np.cumsum(p)])
    m = (c[n:] - c[:-n]) / n
    return -0.691 + 10 * np.log10(m.max() + 1e-20)


def read(path):
    """Any audio file, as float32 frames x 2 at SR, through ffmpeg."""
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, 'x.wav')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-ac', '2', '-ar', str(SR), '-c:a', 'pcm_f32le', wav], check=True)
        x, _ = sf.read(wav, dtype='float32', always_2d=True)
    return x


def high_shelf(x, sr, f0, gain_db):
    """RBJ high shelf (slope 1)."""
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / sr
    alpha = np.sin(w) / 2 * np.sqrt(2)
    cw, sa = np.cos(w), 2 * np.sqrt(A) * alpha
    b = [A * ((A + 1) + (A - 1) * cw + sa), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sa)]
    a = [(A + 1) - (A - 1) * cw + sa, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sa]
    return lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)


def shape(x, sr, cfg, split=False):
    """
    What sounds.json asks of a sound's takes, before they are cut:
      speed   play it this much faster, pitch and all, as a tape run fast
              (a take that sounds slowed down)
      hp      a high-pass (Hz), for low end the sound should not have: the
              game's music has the bass and the kick, and a boom under
              every blow would sit on them
      bright  [Hz, dB]: a high shelf, for a sound that wants more edge
      lead    start this many seconds before the take first comes within
              6 dB of its loudest, rising into it: a sound that builds
              slowly would otherwise peak after the moment the game plays
              it for (a swing's whoosh after the blow has landed). (Its
              first strong moment, not its loudest: a hit's crack can come
              before a louder thud, and must not be cut off.)
    """
    if cfg.get('speed'):
        r = Fraction(1 / cfg['speed']).limit_denominator(200)
        x = resample_poly(x, r.numerator, r.denominator, axis=0)
    if cfg.get('hp'):
        x = sosfilt(butter(4, cfg['hp'], 'highpass', fs=sr, output='sos'), x, axis=0)
    if cfg.get('bright'):
        x = high_shelf(x, sr, *cfg['bright'])
    # (A take to be split is cut at its listed times instead.)
    if cfg.get('lead') is not None and not split:
        a = np.abs(x).max(axis=1)
        n = int(0.005 * sr)
        env = np.sqrt(np.convolve(a ** 2, np.ones(n) / n, mode='same'))
        peak = int(np.argmax(env >= env.max() * 10 ** (-6 / 20)))
        s = max(0, peak - int(cfg['lead'] * sr))
        x = x[s:].copy()
        if peak > s:
            x[:peak - s] *= (np.linspace(0, 1, peak - s, endpoint=False) ** 2)[:, None]
    return x.astype(np.float32)


def split(x, sr, times, most):
    """
    One take into several, at `times` (seconds into the take as it came,
    before any change of speed): each from just before its time to the next
    (or `most` seconds on), the last part fading. For a take that holds a run
    of the same sound, a burst of shots say, where the game plays them one at
    a time.
    """
    pre = int(PRE_ROLL * sr)
    out = []
    for k, t in enumerate(times):
        s = max(0, int(t * sr) - pre)
        e = min(len(x), int(times[k + 1] * sr) - pre if k + 1 < len(times) else len(x), s + int(most * sr))
        y = x[s:e].copy()
        if pre:
            y[:pre] *= np.linspace(0, 1, pre, endpoint=False)[:, None]
        fade = max(int(0.015 * sr), int(len(y) * 0.35))
        y[-fade:] *= (np.cos(np.linspace(0, np.pi, fade)) * 0.5 + 0.5)[:, None]
        out.append(y)
    return out


def cut(x, sr, most):
    """From just before the sound starts to where it dies away (or `most` seconds), the end faded."""
    a = np.abs(x).max(axis=1)
    peak = a.max()
    if peak <= 0:
        raise ValueError('silent')
    start = int(np.argmax(a > peak * 10 ** (ONSET_DB / 20)))
    # Where a 10 ms envelope last stands above the tail threshold.
    n = int(0.01 * sr)
    env = np.sqrt(np.convolve(a ** 2, np.ones(n) / n, mode='same'))
    above = np.nonzero(env > peak * 10 ** (TAIL_DB / 20))[0]
    end = int(above[-1]) + n if len(above) else len(a)
    pre = int(PRE_ROLL * sr)
    s = max(0, start - pre)
    e = min(len(a), end, s + int(most * sr))
    y = x[s:e].copy()
    fade_in = start - s
    if fade_in > 0:
        y[:fade_in] *= np.linspace(0, 1, fade_in, endpoint=False)[:, None]
    # Cut short, it dies away over the last third; otherwise it had, and only the last moment is smoothed.
    fade = len(y) // 3 if e < end else min(int(0.05 * sr), len(y) // 5)
    if fade > 0:
        y[-fade:] *= (np.cos(np.linspace(0, np.pi, fade)) * 0.5 + 0.5)[:, None]
    return y, s / sr, e < end


def mono_or_stereo(y):
    mid = (y[:, 0] + y[:, 1]) / 2
    side = (y[:, 0] - y[:, 1]) / 2
    ratio = 10 * np.log10(((side ** 2).sum() + 1e-20) / ((mid ** 2).sum() + 1e-20))
    return (y, ratio) if ratio > MONO_SIDE_DB else (mid[:, None], ratio)


def reference(dump):
    levels = sfx_levels()
    out = {}
    for path in sorted(glob.glob(os.path.join(dump, 'sfxpre-*.wav'))):
        name = os.path.basename(path)[7:-4]
        if name not in levels:
            continue  # the variants the check also renders (pitch, volume)
        x, sr = sf.read(path, dtype='float32', always_2d=True)
        # As the sound is at a level of 1, before its trim and the volumes.
        out[name] = round(float(loudness(x, sr) - VOLUMES_DB - 20 * np.log10(levels[name])), 2)
    missing = sorted(set(levels) - set(out))
    if missing:
        sys.exit('no render of: ' + ', '.join(missing))
    json.dump(out, open(REFERENCE, 'w'), indent=1, sort_keys=True)
    open(REFERENCE, 'a').write('\n')
    print('wrote %s: %d sounds' % (os.path.relpath(REFERENCE, ROOT), len(out)))


def build(folders, out):
    levels = sfx_levels()
    ref = json.load(open(REFERENCE))
    sounds = json.load(open(SOUNDS)) if os.path.exists(SOUNDS) else {}
    takes = {}
    for folder in folders:
        for path in sorted(glob.glob(os.path.join(folder, '*'))):
            stem, ext = os.path.splitext(os.path.basename(path))
            if ext.lower() not in ('.wav', '.mp3', '.m4a', '.aac', '.flac', '.ogg'):
                continue
            m = NAME.match(stem)
            if not m or m.group(1) not in levels:
                print('  skipped %s: not named after a sound' % os.path.basename(path))
                continue
            takes.setdefault(m.group(1), []).append((int(m.group(2) or 1), path))
    if not takes:
        sys.exit('no takes found')

    os.makedirs(out, exist_ok=True)
    mpath = os.path.join(out, 'manifest.json')
    manifest = json.load(open(mpath)) if os.path.exists(mpath) else {'sounds': {}}
    print('%-14s %-22s %7s %7s %6s %7s %6s  %s' % ('sound', 'take', 'from s', 'length', 'stereo', 'LUFS', 'peak', ''))
    for name in sorted(takes):
        cfg = sounds.get(name, {})
        most = cfg.get('max', max(2 * cfg.get('asked', 1.5), cfg.get('asked', 1.5) + 0.5))
        built = []
        for i, path in sorted(takes[name]):
            times = cfg.get('split', {}).get(os.path.splitext(os.path.basename(path))[0])
            x = shape(read(path), SR, cfg, split=bool(times))
            if times:
                # (Times are into the take as it came; a change of speed moves them.)
                parts = split(x, SR, [t / cfg.get('speed', 1) for t in times], most)
                for y in parts:
                    y, side = mono_or_stereo(y)
                    built.append((i, path, y, 0.0, False, side, loudness(y, SR)))
                continue
            y, at, capped = cut(x, SR, most)
            y, side = mono_or_stereo(y)
            built.append((i, path, y, at, capped, side, loudness(y, SR)))
        # One loudness for every take of the sound: the most the quietest-peaking allows.
        target = min(L + (CEILING - 20 * np.log10(np.abs(y).max())) for _, _, y, _, _, _, L in built)
        for f in manifest['sounds'].get(name, {}).get('files', []):
            if os.path.exists(os.path.join(out, f)):
                os.remove(os.path.join(out, f))
        files = []
        heard = []
        for k, (i, path, y, at, capped, side, L) in enumerate(built, 1):
            y = y * 10 ** ((target - L) / 20)
            f = '%s-%d.mp3' % (name, k)
            with tempfile.TemporaryDirectory() as d:
                wav = os.path.join(d, 'y.wav')
                sf.write(wav, y, SR, subtype='FLOAT')
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-q:a', '2', os.path.join(out, f)], check=True)
            files.append(f)
            # The encoding moves the loudness a little: measure what the game will decode.
            e, esr = sf.read(os.path.join(out, f), dtype='float32', always_2d=True)
            heard.append(loudness(e, esr))
            print('%-14s %-22s %7.3f %7.3f %6s %7.1f %6.1f  %s' % (
                name, os.path.basename(path)[:22], at, len(y) / SR, 'wide' if y.shape[1] == 2 else 'mono', target, 20 * np.log10(np.abs(y).max()),
                ('cut at %.2f s' % most) if capped else ''))
        # Where the synthesised sound sat, and any trim on top (sounds.json).
        gain = ref[name] - 10 * np.log10(np.mean(10 ** (np.array(heard) / 10))) + cfg.get('db', 0)
        manifest['sounds'][name] = {'gain': round(float(gain), 2), 'files': files}
        if cfg.get('db'):
            manifest['sounds'][name]['trim'] = cfg['db']  # for the audio check: how far from the recipe it is meant to be
    manifest['sounds'] = dict(sorted(manifest['sounds'].items()))
    json.dump(manifest, open(mpath, 'w'), indent=1)
    open(mpath, 'a').write('\n')
    total = sum(os.path.getsize(os.path.join(out, f)) for s in manifest['sounds'].values() for f in s['files'])
    print('wrote %s: %d sounds recorded, %d takes, %.0f kB' % (
        os.path.relpath(mpath, ROOT), len(manifest['sounds']), sum(len(s['files']) for s in manifest['sounds'].values()), total / 1024))


def drop(names, out):
    mpath = os.path.join(out, 'manifest.json')
    manifest = json.load(open(mpath))
    for name in names:
        s = manifest['sounds'].pop(name, None)
        if s is None:
            print('  %s had no recordings' % name)
            continue
        for f in s['files']:
            if os.path.exists(os.path.join(out, f)):
                os.remove(os.path.join(out, f))
        print('  %s: %d takes taken out; its recipe plays again' % (name, len(s['files'])))
    json.dump(manifest, open(mpath, 'w'), indent=1)
    open(mpath, 'a').write('\n')


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('folders', nargs='*')
    ap.add_argument('--out', default=os.path.join(ROOT, 'public/sfx'))
    ap.add_argument('--reference', metavar='DUMP')
    ap.add_argument('--drop', metavar='SOUNDS')
    a = ap.parse_args()
    if a.reference:
        reference(a.reference)
    elif a.drop:
        drop(a.drop.split(','), a.out)
    elif a.folders:
        build(a.folders, a.out)
    else:
        ap.error('give the folders of takes, or --reference')


if __name__ == '__main__':
    main()
