#!/usr/bin/env python3
"""Which of a song's stems were carved out of one another.

    python3 tools/music/tangle.py <song folder> [from s] [to s]

Suno separates its stems out of the finished mix. Some come apart cleanly;
others were carved out of one another, and heard apart each has holes where
its partners were (hollow and phasey, like music down a telephone). Where
two stems overlap (the same moment and pitch, within 10 dB of each other),
carved ones agree in phase and separate ones do not. This prints, for each
pair, how far they agree there: 1 is fully carved, 0 apart, and '.' too
little overlap to tell. Stems that agree by much more than about 0.3 have
to be in one layer (see README.md). It looks at the stretch given (default
70 to 140 s; choose one where most stems play, such as the loop).
"""
import glob, os, sys
import numpy as np
import soundfile as sf
from scipy.signal import stft


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    folder = sys.argv[1]
    t0 = float(sys.argv[2]) if len(sys.argv) > 2 else 70
    t1 = float(sys.argv[3]) if len(sys.argv) > 3 else 140
    # In Suno's order ("0 Lead Vocals.wav", "1 Backing Vocals.wav"...).
    def order(p):
        head = os.path.basename(p).split(' ', 1)[0]
        return (int(head), p) if head.isdigit() else (1 << 30, p)
    files = sorted(glob.glob(os.path.join(folder, 'stems', '*.wav')), key=order)
    names, spectra = [], {}
    for f in files:
        base = os.path.splitext(os.path.basename(f))[0]
        name = base.split(' ', 1)[1] if base.split(' ', 1)[0].isdigit() else base
        info = sf.info(f)
        x, sr = sf.read(f, dtype='float64', start=int(t0 * info.samplerate), stop=int(t1 * info.samplerate), always_2d=True)
        names.append(name)
        spectra[name] = stft(x.mean(axis=1), fs=sr, nperseg=2048)[2]
    width = max(len(n) for n in names) + 1
    print(' ' * width + ''.join('%9s' % n[:8] for n in names))
    for a in names:
        row = []
        for b in names:
            if a == b:
                row.append('%9s' % '-')
                continue
            A, B = spectra[a], spectra[b]
            ma, mb = np.abs(A), np.abs(B)
            floor = np.percentile(np.maximum(ma, mb), 90) * 0.05
            both = (ma > floor) & (mb > floor) & (np.abs(20 * np.log10((ma + 1e-12) / (mb + 1e-12))) < 10)
            if both.sum() <= 2000:
                row.append('%9s' % '.')
                continue
            agree = np.abs(np.mean(np.exp(1j * np.angle(A[both] * np.conj(B[both])))))
            row.append('%9.2f' % agree)
        print(a.ljust(width) + ''.join(row))


if __name__ == '__main__':
    main()
