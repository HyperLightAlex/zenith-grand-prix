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
loop's end, then the ending (with a moment before it, for the cross-fade).
What lies between is never heard, so it is left out (it would only cost
download and memory). Times in song.json are positions in these files.

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

    # Sections: the start to the loop's end, then the ending.
    A, B = cfg['loop']
    E = cfg['ending']
    loop_end = bars[B]
    ending_from = bars[E] - PAD
    cut = [(0, int(round(loop_end * sr))), (int(round(ending_from * sr)), n)]
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
    # loop. The game's gain is set so lap 3 comes out at `loudness` with the
    # game's default volumes.
    flt = cfg.get('filter')
    sos = butter(4, flt['hz'], {'lowpass': 'low', 'highpass': 'high'}[flt['type']], fs=sr, output='sos') if flt else None
    meter = pyln.Meter(sr)
    def lap_mix(lap, a, b):
        a, b = int(a * sr), int(b * sr)
        y = np.zeros((b - a, 2))
        for lid, gains in cfg['laps'].items():
            g = gains[lap - 1]
            if g is None:
                continue
            seg = layers[lid][a:b]
            if sos is not None and lid == flt['layer'] and lap in flt['laps']:
                seg = sosfilt(sos, seg, axis=0)
            y += seg * 10 ** (g / 20)
        return y
    lufs = [meter.integrated_loudness(lap_mix(1, 0, bars[A])), meter.integrated_loudness(lap_mix(2, bars[A], bars[B])), meter.integrated_loudness(lap_mix(3, bars[A], bars[B]))]
    level = cfg['loudness'] - lufs[2] - OUTPUT_DB
    print('loudness at the game\'s default volumes: lap 1 %.1f, lap 2 %.1f, lap 3 %.1f LUFS (steps of %.1f and %.1f); the game plays the files %+.1f dB up' %
          (*(v + level + OUTPUT_DB for v in lufs), lufs[1] - lufs[0], lufs[2] - lufs[1], level))

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
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav, *ENCODERS[codec], '-ar', str(sr), dst], check=True)
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
        'bars': [round(float(t), 5) for t in bars[:B + 1]],
        'loop': [round(float(bars[A]), 5), round(float(bars[B]), 5)],
        'ending': round(float(loop_end + PAD), 5),
        'end': round(frames / sr, 5),
        'laps': cfg['laps'],
        'filter': cfg.get('filter'),
        'level': round(level, 2),
        'sync': {'layer': lid, 'env': base64.b64encode(env.tobytes()).decode()},
    }
    # One field to a line: readable, and the long lists stay on one line each.
    text = '{\n' + ',\n'.join(' %s: %s' % (json.dumps(k), json.dumps(v, ensure_ascii=False, separators=(',', ':'))) for k, v in manifest.items()) + '\n}\n'
    open(os.path.join(out, 'song.json'), 'w').write(text)
    total = sum(os.path.getsize(os.path.join(out, l + '.' + ext)) for l in layers)
    print('wrote %s: %.1f MB, %.1f s (loop %.1f s, ending %.1f s); %.0f MB once decoded at %d Hz' %
          (os.path.relpath(out), total / 1e6, frames / sr, bars[B] - bars[A], frames / sr - loop_end - PAD, frames * 2 * 4 * len(layers) / 1e6, sr))


if __name__ == '__main__':
    main()
