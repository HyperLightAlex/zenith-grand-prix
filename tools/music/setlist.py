#!/usr/bin/env python3
"""Turn a folder of finished songs into a setlist the game plays one after another.

    python3 tools/music/setlist.py tools/music/songs/<id>.json <folder> [out folder]

The recipe lists the tracks (`id`, `title`, `source`: a file in <folder>, any
format ffmpeg reads, such as Suno's .m4a) and the loudness they should all
play at (LUFS at the game's default volumes). Writes, into public/music/<id>/
(or [out folder]):

  <track id>.mp3   each track, trimmed of silence at either end and faded out
                   (a long fade where the file stops dead, a short one
                   otherwise, so no track ends on a click)
  setlist.json     the tracks in order: id, title, file, length, and the gain
                   (dB) that brings it to the loudness asked for

Unlike a race song a setlist needs no stems, no bars and no loop: each track
plays through once and the next follows (the hangar's radio: see setlist.ts).
The files keep their own level (only pulled down if a peak is over -1 dBFS);
the game applies each one's gain as it plays.
"""
import json, os, subprocess, sys
import numpy as np
import pyloudnorm as pyln  # pip install pyloudnorm

SR = 48000
# From a track's output to the speakers at the game's default volumes (as in build.py).
OUTPUT_DB = 20 * np.log10(0.8 * 0.45 * 0.8)
SILENCE_DB = -60    # trimmed from either end, down to this
TRIM_KEEP = 0.25    # seconds of quiet kept at the end, for the tail
CEILING = -1.0      # dBFS


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    cfg = json.load(open(sys.argv[1]))
    folder = sys.argv[2]
    here = os.path.dirname(os.path.abspath(__file__))
    out = sys.argv[3] if len(sys.argv) > 3 else os.path.join(here, '..', '..', 'public', 'music', cfg['id'])
    os.makedirs(out, exist_ok=True)
    for old in os.listdir(out):
        if old.endswith('.mp3'):
            os.remove(os.path.join(out, old))
    meter = pyln.Meter(SR)
    tracks = []
    for t in cfg['tracks']:
        x = load(os.path.join(folder, t['source']))
        # Trim silence at either end (a little kept at the end for the tail).
        loud = np.nonzero(20 * np.log10(np.abs(x).max(axis=1) + 1e-12) > SILENCE_DB)[0]
        a, b = (loud[0], min(len(x), loud[-1] + int(TRIM_KEEP * SR))) if len(loud) else (0, len(x))
        x = x[a:b].copy()
        # Fade out: long where the file stops dead (its last second still loud), short otherwise.
        last = 20 * np.log10(np.sqrt(np.mean(x[-SR:] ** 2)) + 1e-12)
        fade = 3.0 if last > -30 else 0.4
        n = int(fade * SR)
        x[-n:] *= np.linspace(1, 0, n)[:, None] ** 2
        n_in = int(0.005 * SR)
        x[:n_in] *= np.linspace(0, 1, n_in)[:, None]
        lufs = meter.integrated_loudness(x)
        peak = 20 * np.log10(np.abs(x).max() + 1e-12)
        pull = min(0.0, CEILING - peak)
        x *= 10 ** (pull / 20)
        gain = cfg['loudness'] - (lufs + pull) - OUTPUT_DB
        dst = os.path.join(out, t['id'] + '.mp3')
        p = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'libmp3lame', '-q:a', str(cfg.get('quality', 0)), '-ar', str(SR), dst], input=x.astype(np.float32).tobytes(), check=True)
        tracks.append({'id': t['id'], 'title': t['title'], 'file': t['id'] + '.mp3', 'length': round(len(x) / SR, 3), 'gain': round(float(gain), 2)})
        print('  %-20s %6.1f s  %5.1f LUFS, fade %.1f s, plays %+5.1f dB  %5.0f kB  %s' % (t['id'], len(x) / SR, lufs, fade, gain, os.path.getsize(dst) / 1024, t['title']))
    manifest = {'id': cfg['id'], 'tracks': tracks}
    text = '{\n "id": %s,\n "tracks": [\n%s\n ]\n}\n' % (json.dumps(cfg['id']), ',\n'.join('  ' + json.dumps(t, ensure_ascii=False) for t in tracks))
    open(os.path.join(out, 'setlist.json'), 'w').write(text)
    total = sum(os.path.getsize(os.path.join(out, t['file'])) for t in tracks)
    print('wrote %s: %d tracks, %.1f MB, %.0f min' % (os.path.relpath(out), len(tracks), total / 1e6, sum(t['length'] for t in tracks) / 60))


if __name__ == '__main__':
    main()
