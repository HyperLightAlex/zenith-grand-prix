#!/usr/bin/env python3
"""Turn a song's stems into the layers the game plays lap by lap.

    python3 tools/music/build.py tools/music/songs/<id>.json <song folder> [out folder]

<song folder> is the Suno export (song.wav, stems/*.wav) with the bars.json
that tools/music/bars.py wrote into it. Writes, into public/music/<id>/ (or
[out folder]):

  <layer>.mp3   one file per layer: its stems summed, with the mix's mastering
  song.json     what the game needs: the bar lines, the loop, the ending, the
                layers' level on each lap, and the overall level

The files hold only what the game can play: the song from its start to the
loop's end, then the finale if it has one (from its first bar to the end of
its loop), then the ending (each with a moment before it, for the
cross-fade). What lies between is never heard, so it is left out (it would
only cost download and memory). Times in song.json are positions in these
files.

The finale (optional): a stretch the song jumps to when the last lap starts,
on the next bar line (Helios: the build into the drop, then the drop, looped).
Where it lands in it depends on where the song was: songs built on a chord
cycle (Helios's is 16 bars) go to the same place in the cycle, so the chord
carries on and only the energy changes. Or, with `phrase`, it waits for the
next phrase to start (a bar numbered `first` + n x `bars`) and goes in at
the finale's start (Canyon: a key change, which only sounds meant on one).

The mastering. Suno's stems are the mix before mastering: summed, they come
out louder and a little duller than song.wav. The song file says how to
match it (a gain and two shelves); applied to every layer it is the same as
applied to the sum, so it is baked in here. The game's own limiter takes the
peaks.
"""
import base64, glob, json, os, subprocess, sys, tempfile
import numpy as np
import soundfile as sf
from scipy.signal import lfilter, butter, sosfilt, correlate
import pyloudnorm as pyln  # pip install pyloudnorm

PAD = 0.05          # seconds kept before the ending, for the cross-fade into it
CEILING = -1.5      # dBFS: the loudest layer's peak, so the encoder has room
SYNC_SECONDS = 2    # how much of the start the decoder check compares
# From the song's output to the speakers at the game's default volumes: the
# music trim (0.8, synth.ts), the music volume (0.45) and the master (0.8).
OUTPUT_DB = 20 * np.log10(0.8 * 0.45 * 0.8)
# MP3 by default: every browser decodes it (AAC is missing from open-source
# Chromium builds, Opus from older Safari). Its encoder delay differs from
# decoder to decoder; the game measures and allows for that (song.json's sync).
# `quality` in the recipe is LAME's VBR setting: 0 is its best (about 220
# kbps here, and nothing cut below 19 kHz); 4 (its default) cuts above 16 kHz
# and is audibly rougher once four layers are summed.
ENCODERS = {
    'mp3': ['-c:a', 'libmp3lame', '-q:a', '4'],
    'aac': ['-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'],
}


def shelf(x, sr, f0, gain_db, kind):
    """RBJ shelving filter (slope 1)."""
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f0 / sr; cs, sn = np.cos(w), np.sin(w); al = sn / 2 * np.sqrt(2)
    if kind == 'low':
        b = [A * ((A + 1) - (A - 1) * cs + 2 * np.sqrt(A) * al), 2 * A * ((A - 1) - (A + 1) * cs), A * ((A + 1) - (A - 1) * cs - 2 * np.sqrt(A) * al)]
        a = [(A + 1) + (A - 1) * cs + 2 * np.sqrt(A) * al, -2 * ((A - 1) + (A + 1) * cs), (A + 1) + (A - 1) * cs - 2 * np.sqrt(A) * al]
    else:
        b = [A * ((A + 1) + (A - 1) * cs + 2 * np.sqrt(A) * al), -2 * A * ((A - 1) + (A + 1) * cs), A * ((A + 1) + (A - 1) * cs - 2 * np.sqrt(A) * al)]
        a = [(A + 1) - (A - 1) * cs + 2 * np.sqrt(A) * al, 2 * ((A - 1) - (A + 1) * cs), (A + 1) - (A - 1) * cs - 2 * np.sqrt(A) * al]
    return lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)


def ride(audio, names, top, sr, a, b, n):
    """Turn the stems in `names` down together wherever their sum is louder
    than `top` (LUFS over 400 ms, as momentary loudness is measured) between
    samples a and b, by as much as it is over, and no more. Returns the gain
    (dB) at every sample, for the report."""
    meter = pyln.Meter(sr, block_size=0.4)
    x = sum(audio[s][:n].astype(np.float64) for s in names)
    hop, win = int(0.025 * sr), int(0.4 * sr)
    starts = np.arange(a, max(a + 1, min(b, n) - win), hop)
    over = np.zeros(len(starts))
    for i, s0 in enumerate(starts):
        v = meter.integrated_loudness(x[s0:s0 + win])
        if np.isfinite(v) and v > top:
            over[i] = top - v
    # Each window over the line is turned down all through: a moment takes
    # the deepest cut of every window it is in. Then eased in and out over
    # about a tenth of a second, so it rides rather than switches.
    k = win // hop
    cut = np.array([over[max(0, j - k + 1):j + 1].min() for j in range(len(over))])
    ease = np.hanning(7)[1:-1]
    cut = np.convolve(cut, ease / ease.sum(), mode='same')
    g = np.zeros(n)
    g[starts[0]:starts[-1] + 1] = np.interp(np.arange(starts[0], starts[-1] + 1), starts, cut)
    lin = 10 ** (g / 20)
    for s in names:
        audio[s] = audio[s].copy()
        audio[s][:n] *= lin[:, None]
    return g


def db(x):
    return 20 * np.log10(np.sqrt(np.mean(np.square(x))) + 1e-12)


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    cfg = json.load(open(sys.argv[1]))
    folder = sys.argv[2]
    here = os.path.dirname(os.path.abspath(__file__))
    out = sys.argv[3] if len(sys.argv) > 3 else os.path.join(here, '..', '..', 'public', 'music', cfg['id'])
    os.makedirs(out, exist_ok=True)
    bars = np.array(json.load(open(os.path.join(folder, 'bars.json')))['bars'])

    # The stems, by name ("0 Drums.wav" is Drums).
    stems = {}
    for f in sorted(glob.glob(os.path.join(folder, 'stems', '*.wav'))):
        base = os.path.splitext(os.path.basename(f))[0]
        stems[base.split(' ', 1)[1] if base.split(' ', 1)[0].isdigit() else base] = f
    sr = None
    audio = {}
    for name in {s for group in cfg['layers'].values() for s in group}:
        if name not in stems:
            sys.exit(f'no stem called {name} in {folder}/stems (there are: {", ".join(stems)})')
        x, r = sf.read(stems[name], dtype='float32', always_2d=True)
        if sr and r != sr:
            sys.exit('the stems are not all at one sample rate')
        sr = r
        audio[name] = x[:, :2] if x.shape[1] >= 2 else np.repeat(x, 2, axis=1)
    n = min(len(x) for x in audio.values())
    used = sorted({s for g in cfg['layers'].values() for s in g})
    unused = [s for s in stems if s not in used]
    if unused:
        print('stems in no layer (left out):', ', '.join(unused))

    # Sections: the start to the loop's end, the finale (if any), the ending.
    A, B = cfg['loop']
    E = cfg['ending']
    fin = cfg.get('finale')
    loop_end = bars[B]
    cut = [(0, int(round(loop_end * sr)))]
    if fin:
        F0, (FA, FB), cyc = fin['from'], fin['loop'], fin['cycle']
        if not (B < F0 <= FA < FB <= E):
            sys.exit('the finale has to come after the loop and before the ending, and start before its own loop')
        if (FB - FA) % cyc or (B - A) % cyc:
            print('warning: a loop that is not a whole number of chord cycles (%d bars)' % cyc)
        cut.append((int(round((bars[F0] - PAD) * sr)), int(round(bars[FB] * sr))))
    cut.append((int(round((bars[E] - PAD) * sr)), n))
    offs = np.cumsum([0] + [b - a for a, b in cut])
    def file_pos(t, piece):
        """Song time t (s), in cut piece `piece`, as a position in the files (s)."""
        return (offs[piece] + t * sr - cut[piece][0]) / sr
    # A sound far louder than the rest where it comes in (`ride`): turned
    # down there, all of its stems together, to `max`.
    rd = cfg.get('ride')
    if rd:
        g = ride(audio, rd['stems'], rd['max'], sr, int(bars[rd['bars'][0]] * sr), int(bars[rd['bars'][1]] * sr), n)
        worst = ['bar %d %.1f' % (i, g[int(bars[i] * sr):int(bars[i + 1] * sr)].min()) for i in range(len(bars) - 1)
                 if bars[i + 1] * sr <= n and g[int(bars[i] * sr):int(bars[i + 1] * sr)].min() < -0.5]
        print('ride: %s turned down (dB, the most in each bar): %s' % (', '.join(rd['stems']), ', '.join(worst) or 'nowhere'))

    m = cfg['master']
    layers = {}
    for lid, names in cfg['layers'].items():
        x = sum(audio[s][:n].astype(np.float64) for s in names) * 10 ** (m['gain'] / 20)
        x = shelf(x, sr, *m['lowShelf'], 'low')
        x = shelf(x, sr, *m['highShelf'], 'high')
        layers[lid] = np.concatenate([x[a:b] for a, b in cut])
    frames = len(next(iter(layers.values())))
    peak = max(np.abs(x).max() for x in layers.values())
    scale = min(1.0, 10 ** (CEILING / 20) / peak)
    for lid in layers:
        layers[lid] *= scale

    # Loudness on each lap (LUFS, as ears hear it), in the stretch each lap
    # mostly plays: lap 1 the song's start up to the loop, laps 2 and 3 the
    # loop. `loudness` is each lap's target at the game's default volumes
    # (or one number, for lap 3 alone): the build sets each lap's level to
    # meet it, on top of the balance `laps` gives the layers within a lap.
    # Meridian has all three the same, so a lap is told from the last by
    # what plays, not by how loud it is.
    flt = cfg.get('filter')
    sos = None if not flt else butter(4, flt['hz'], {'lowpass': 'low', 'highpass': 'high'}[flt['type']], fs=sr, output='sos')
    meter = pyln.Meter(sr)
    low = cfg.get('lowShelf')
    def lap_mix(laps, lap, a, b):
        a, b = int(a * sr), int(b * sr)
        y = np.zeros((b - a, 2))
        for lid, gains in laps.items():
            g = gains[lap - 1]
            if g is None:
                continue
            seg = layers[lid][a:b]
            if sos is not None and lid == flt['layer'] and lap in flt['laps']:
                seg = sosfilt(sos, seg, axis=0)
            if low and lid in low['layers'] and low['db'][lap - 1]:
                # The same shelf as the game's (Web Audio's lowshelf is the RBJ one, slope 1).
                seg = shelf(seg, sr, low['hz'], low['db'][lap - 1], 'low')
            y += seg * 10 ** (g / 20)
        return y
    stretch = [(0, bars[A]), (bars[A], bars[B]), (file_pos(bars[FA], 1), file_pos(bars[FB], 1)) if fin else (bars[A], bars[B])]
    measure = lambda laps: [meter.integrated_loudness(lap_mix(laps, i + 1, *stretch[i])) for i in range(3)]
    lufs = measure(cfg['laps'])
    want = cfg['loudness'] if isinstance(cfg['loudness'], list) else [None, None, cfg['loudness']]
    lift = [0.0 if w is None else w - v - OUTPUT_DB for w, v in zip(want, lufs)]
    level = lift[2]
    laps_out = {lid: [None if g is None else round(float(g + (lift[i] - level if want[i] is not None else 0)), 2) for i, g in enumerate(gains)] for lid, gains in cfg['laps'].items()}
    got = [v + level + OUTPUT_DB for v in measure(laps_out)]
    print('loudness at the game\'s default volumes: lap 1 %.1f, lap 2 %.1f, lap 3 %.1f LUFS; the game plays the files %+.1f dB up' % (*got, level))
    print('each layer by lap (dB, with the laps\' levels):', ', '.join('%s %s' % (lid, g) for lid, g in laps_out.items()))

    # Encode. The files start where the song starts, at the same sample.
    codec = cfg.get('codec', 'mp3')
    ext = {'mp3': 'mp3', 'aac': 'm4a'}[codec]
    for old in glob.glob(os.path.join(out, '*.m4a')) + glob.glob(os.path.join(out, '*.mp3')):
        os.remove(old)
    decoded = {}
    with tempfile.TemporaryDirectory() as tmp:
        for lid, x in layers.items():
            wav = os.path.join(tmp, lid + '.wav')
            sf.write(wav, x.astype(np.float32), sr, subtype='FLOAT')
            dst = os.path.join(out, lid + '.' + ext)
            enc = ENCODERS[codec] if codec != 'mp3' else ['-c:a', 'libmp3lame', '-q:a', str(cfg.get('quality', 4))]
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav, *enc, '-ar', str(sr), dst], check=True)
            # Check what a decoder gives back: the same length, starting on the same sample.
            back = os.path.join(tmp, lid + '-back.wav')
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', dst, '-f', 'wav', back], check=True)
            y, _ = sf.read(back, dtype='float32', always_2d=True)
            k = min(len(y), len(x), sr * 4)
            lag = int(np.argmax(correlate(y[:k, 0], x[:k, 0], mode='full', method='fft'))) - (k - 1)
            decoded[lid] = y[:sr * SYNC_SECONDS]
            print('  %-7s %6.0f kB  peak %5.1f dBFS  decoded %+d samples long, %+d samples late' %
                  (lid, os.path.getsize(dst) / 1024, 20 * np.log10(np.abs(x).max() + 1e-12), len(y) - len(x), lag))

    # A fingerprint of the start, so the game can tell whether its browser's
    # decoder starts the audio on the same sample as ffmpeg's (some leave the
    # encoder's priming in): the loudest layer's level, millisecond by
    # millisecond, from ffmpeg's decoding of the file.
    lid = max(decoded, key=lambda l: db(decoded[l]))
    y = np.abs(decoded[lid]).max(axis=1)
    step = sr // 1000
    env = 20 * np.log10(y[:len(y) // step * step].reshape(-1, step).max(axis=1) + 1e-9) + 90
    env = np.clip(np.round(env), 0, 90).astype(np.uint8)
    manifest = {
        'id': cfg['id'],
        'title': cfg.get('title', cfg['id']),
        'rate': sr,
        'frames': frames,
        'layers': [{'id': l, 'file': l + '.' + ext} for l in cfg['layers']],
        'bars': [round(float(t), 5) for t in bars[:B + 1]] + ([round(float(file_pos(bars[t], 1)), 5) for t in range(F0, FB + 1)] if fin else []),
        'loop': [round(float(bars[A]), 5), round(float(bars[B]), 5)],
        'ending': round(float(file_pos(bars[E], len(cut) - 1)), 5),
        'end': round(frames / sr, 5),
        'laps': laps_out,
        'filter': cfg.get('filter'),
        'lowShelf': cfg.get('lowShelf'),
        'finale': {
            'lap': fin.get('lap', 3),
            'cycle': cyc,
            # Where to land for each place in the cycle: the bar line it
            # leaves from, numbered as in the song, modulo the cycle.
            'entry': [round(float(file_pos(bars[F0 + (k - F0) % cyc], 1)), 5) for k in range(cyc)],
            'loop': [round(float(file_pos(bars[FA], 1)), 5), round(float(file_pos(bars[FB], 1)), 5)],
            'phrase': fin.get('phrase'),
        } if fin else None,
        'stingers': cfg.get('stingers'),
        'level': round(level, 2),
        'sync': {'layer': lid, 'env': base64.b64encode(env.tobytes()).decode()},
    }
    # One field to a line: readable, and the long lists stay on one line each.
    text = '{\n' + ',\n'.join(' %s: %s' % (json.dumps(k), json.dumps(v, ensure_ascii=False, separators=(',', ':'))) for k, v in manifest.items()) + '\n}\n'
    open(os.path.join(out, 'song.json'), 'w').write(text)
    total = sum(os.path.getsize(os.path.join(out, l + '.' + ext)) for l in layers)
    print('wrote %s: %.1f MB, %.1f s (loop %.1f s,%s ending %.1f s); %.0f MB once decoded at %d Hz' %
          (os.path.relpath(out), total / 1e6, frames / sr, bars[B] - bars[A],
           ' finale %.1f s with a %.1f s loop,' % (bars[FB] - bars[F0], bars[FB] - bars[FA]) if fin else '',
           frames / sr - manifest['ending'], frames * 2 * 4 * len(layers) / 1e6, sr))


if __name__ == '__main__':
    main()
