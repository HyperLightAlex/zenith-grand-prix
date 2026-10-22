#!/usr/bin/env python3
"""A song's bar map, for playing it lap by lap in a race.

    python3 tools/music/bars.py <song folder> [--downbeat N]

The folder is a Suno export: song.wav (the full mix) and stems/ (the stems as
WAV files, named as Suno names them: "0 Drums.wav", "1 Bass.wav"...).
Writes <song folder>/bars.json and prints what it found: the tempo, the
downbeat, where each stem plays, and the best places to loop and to end.

How the beat is found. Suno's tempo drifts (Meridian's goes from 140.8 to
143.8 BPM over the song), so a fixed grid wanders off the beat. The beat is
taken from the drums stem: the tempo is measured in 20-second windows,
smoothed, and integrated into beat times from the phase that best fits the
first minute. The grid is then moved onto the drum hits themselves (onset
detection lands a little after a hit starts: 23 ms for Meridian), so a layer
that comes in on a bar line comes in with the hit, not just after it.

The downbeat is the beat (of four) with the strongest kick and the most
chord changes; --downbeat 0..3 overrides it.
"""
import argparse, glob, json, os, sys
import numpy as np
import librosa
import soundfile as sf

SR = 22050
HOP = 128
FR = SR / HOP


def stem_files(folder):
    files = sorted(glob.glob(os.path.join(folder, 'stems', '*.wav')))
    named = {}
    for f in files:
        base = os.path.splitext(os.path.basename(f))[0]
        name = base.split(' ', 1)[1] if ' ' in base and base.split(' ', 1)[0].isdigit() else base
        named[name] = f
    return named


def grid_score(env, times):
    idx = (np.asarray(times) * FR).astype(int)
    idx = idx[(idx >= 0) & (idx < len(env))]
    return env[idx].mean() if len(idx) else 0.0


def local_tempo(env, bpm, length):
    """The tempo in 20 s windows every 10 s: the period that best fits each window's onsets."""
    period = 60 / bpm
    periods = np.arange(period * 0.97, period * 1.03, 0.0001)
    out = []
    for c in np.arange(10, length - 5, 10):
        t0, t1 = max(0, c - 10), min(length, c + 10)
        best = (0, period)
        for p in periods:
            phases = np.arange(0, p, 0.004)
            k = np.arange(0, int((t1 - t0) / p))
            times = t0 + phases[:, None] + k[None, :] * p
            idx = np.clip((times * FR).astype(int), 0, len(env) - 1)
            s = env[idx].mean(axis=1).max()
            if s > best[0]:
                best = (s, p)
        out.append((c, 60 / best[1], best[0]))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('folder')
    ap.add_argument('--downbeat', type=int, default=None, help='which beat of four starts the bar (0-3)')
    args = ap.parse_args()
    stems = stem_files(args.folder)
    drums = next((f for n, f in stems.items() if 'drum' in n.lower()), None)
    song = os.path.join(args.folder, 'song.wav')
    src = drums or song
    if not os.path.exists(src):
        sys.exit('no song.wav or drums stem in ' + args.folder)
    print('beat from', os.path.relpath(src, args.folder))
    y, _ = librosa.load(src, sr=SR, mono=True)
    length = len(y) / SR
    env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)

    # 1. The tempo, and how it drifts.
    bpm = float(np.atleast_1d(librosa.feature.tempo(onset_envelope=env, sr=SR, hop_length=HOP, start_bpm=140))[0])
    while bpm < 100: bpm *= 2
    while bpm > 200: bpm /= 2
    windows = local_tempo(env, bpm, length)
    cs = np.array([w[0] for w in windows]); bs = np.array([w[1] for w in windows]); ws = np.array([w[2] for w in windows])
    # Smooth: a quadratic through the windows, weighted by how well each fits.
    fit = np.polyfit(cs, bs, 2 if len(cs) > 4 else 0, w=ws)
    bpm_at = lambda t: float(np.polyval(fit, np.clip(t, cs[0], cs[-1])))
    print('tempo %.2f BPM; by window: %s' % (bpm, ' '.join('%.1f' % b for b in bs)))
    print('smoothed: %.2f at the start, %.2f at the end' % (bpm_at(0), bpm_at(length)))

    # 2. Beat times from the phase that fits the first minute best.
    def beats_from(phase, until):
        t, out = phase, []
        while t < until:
            out.append(t); t += 60 / bpm_at(t)
        return out
    best = max(np.arange(0, 60 / bpm, 0.002), key=lambda ph: grid_score(env, beats_from(ph, min(60, length))))
    beats = np.array(beats_from(best, length - 0.05))
    nudged = []
    for b in beats:
        i0 = max(0, int((b - 0.025) * FR)); seg = env[i0:int((b + 0.025) * FR) + 1]
        nudged.append((i0 + int(np.argmax(seg))) / FR if len(seg) else b)
    dev = (np.array(nudged) - beats) * 1000
    print('%d beats; onsets within %.1f ms of the grid (median), %.1f ms (90%%)' % (len(beats), np.median(np.abs(dev)), np.percentile(np.abs(dev), 90)))

    # 3. Onto the hits: where each drum hit actually starts, against the grid.
    x, sr = sf.read(src, dtype='float32')
    m = np.abs(x).max(axis=1) if x.ndim > 1 else np.abs(x)
    w = max(1, int(0.001 * sr)); n = len(m) // w
    lvl = 20 * np.log10(m[:n * w].reshape(n, w).max(axis=1) + 1e-9)
    offs = []
    for b in beats:
        c = int(b * 1000)
        if c - 60 < 0 or c + 40 >= n: continue
        seg = lvl[c - 60:c + 40]; rise = seg[3:] - seg[:-3]; j = int(np.argmax(rise))
        if rise[j] > 12 and seg[j + 3] > -24: offs.append(j + 1 - 60)
    shift = float(np.median(offs)) / 1000 if len(offs) >= 16 else 0.0
    print('drum hits start %.0f ms from the grid (%d hits measured): grid moved by that' % (shift * 1000, len(offs)))
    beats = beats + shift
    beats = beats[beats >= 0]

    # 4. The downbeat: strongest kick, then most chord changes, by beat of four.
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=HOP)); f = librosa.fft_frequencies(sr=SR, n_fft=2048)
    bi = np.clip((beats * FR).astype(int), 0, S.shape[1] - 1)
    kick = S[f < 150].sum(axis=0)[bi]
    if os.path.exists(song):
        mix, _ = librosa.load(song, sr=SR, mono=True)
    else:
        # Stems only: the harmony from the stems that carry it (the drums'
        # "chroma" would find loops and downbeats in the noise of the kit).
        pitched = [f for n, f in stems.items() if not any(k in n.lower() for k in ('drum', 'percussion', 'other'))]
        print('no song.wav: the harmony from', ', '.join(os.path.basename(f) for f in pitched))
        parts = [librosa.load(f, sr=SR, mono=True)[0] for f in pitched] or [y]
        mix = np.sum([p[:min(len(q) for q in parts)] for p in parts], axis=0)
    C = librosa.feature.chroma_cqt(y=librosa.effects.harmonic(mix), sr=SR, hop_length=512)
    cb = librosa.util.sync(C, librosa.time_to_frames(beats, sr=SR, hop_length=512), aggregate=np.mean)[:, 1:]
    change = np.r_[0, np.linalg.norm(np.diff(cb, axis=1), axis=0)][:len(beats)]
    k4 = np.array([kick[p::4].mean() for p in range(4)]); c4 = np.array([change[p::4].mean() for p in range(4)])
    score = k4 / k4.max() + c4 / max(c4.max(), 1e-9)
    down = args.downbeat if args.downbeat is not None else int(np.argmax(score))
    print('kick by beat %s, chord change by beat %s: bars start on beat %d' % (np.round(k4 / k4.max(), 2).tolist(), np.round(c4 / max(c4.max(), 1e-9), 2).tolist(), down))
    bars = beats[down::4]
    nb = len(bars)
    print('%d bars, bar 0 at %.3f s, %.3f s long, %.3f s at the end' % (nb, bars[0], bars[1] - bars[0], bars[-1] - bars[-2]))

    # 5. Where each stem plays, bar by bar (for choosing the layers).
    print('\nwhere each stem plays (one character per 2 bars: # loud, + present, . quiet, blank silent):')
    for name, fpath in stems.items():
        s, ssr = sf.read(fpath, dtype='float32')
        s = s.mean(axis=1) if s.ndim > 1 else s
        row = ''
        for i in range(0, nb, 2):
            a, b = int(bars[i] * ssr), int((bars[i + 2] if i + 2 < nb else bars[i] + 3.4) * ssr)
            v = 20 * np.log10(np.sqrt(np.mean(s[a:b] ** 2)) + 1e-9) if b > a else -120
            row += '#' if v > -24 else '+' if v > -34 else '.' if v > -50 else ' '
        print('  %-11s|%s|' % (name[:11], row))

    # 6. Loop points: bars whose next 8 bars (and previous 4) sound most alike, in melody and harmony.
    cbar = np.stack([cb[:, 4 * i + down:4 * i + down + 4].reshape(-1) if 4 * i + down + 4 <= cb.shape[1] else np.zeros(48) for i in range(nb)], axis=1)
    cbar = cbar / (np.linalg.norm(cbar, axis=0, keepdims=True) + 1e-9)
    sim = cbar.T @ cbar
    cands = []
    for A in range(4, nb - 24):
        for B in range(A + 16, nb - 8):
            fwd = np.mean([sim[A + k, B + k] for k in range(8)]); back = np.mean([sim[A - k, B - k] for k in range(1, 5)])
            cands.append((fwd + back, fwd, back, A, B))
    cands.sort(reverse=True)
    seen = []
    for c in cands:
        if any(abs(c[3] - s[3]) < 3 and abs(c[4] - s[4]) < 3 for s in seen): continue
        seen.append(c)
        if len(seen) >= 8: break
    print('\nloop candidates (play bar A to bar B, then back to A):')
    for s, fw, bk, A, B in seen:
        print('  bars %3d -> %3d  (%5.1f s -> %5.1f s, %3d bars, %5.1f s)  alike after %.3f, before %.3f' % (A, B, bars[A], bars[B], B - A, bars[B] - bars[A], fw, bk))
    nov = []
    for i in range(4, nb - 4):
        blk = sim[i - 4:i + 4, i - 4:i + 4]; ker = np.kron([[1, -1], [-1, 1]], np.ones((4, 4)))
        nov.append((float((blk * ker).sum()), i))
    nov.sort(reverse=True)
    print('section changes (strongest first):', ', '.join('bar %d (%.1f s)' % (i, bars[i]) for _, i in nov[:10]))

    out = os.path.join(args.folder, 'bars.json')
    json.dump({'bars': [round(float(b), 5) for b in bars], 'beats': [round(float(b), 5) for b in beats], 'downbeat': down,
               'bpm': [round(bpm_at(0), 2), round(bpm_at(length), 2)], 'shift_ms': round(shift * 1000, 1)}, open(out, 'w'))
    print('\nwrote', out)


if __name__ == '__main__':
    main()
