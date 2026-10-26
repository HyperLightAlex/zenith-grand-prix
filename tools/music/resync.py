#!/usr/bin/env python3
"""Make a built song's decoder check (song.json's sync) on another layer.

    python3 tools/music/resync.py public/music/<id>/ [layer]

The check is made on a layer the first lap plays, so that a race's song can
start as soon as those layers are decoded (build.py picks it so now: the
one of them that finds the lag reliably, as here when no layer is named). For songs built before
that, this redoes it from the layer's file as it is, the way build.py does:
ffmpeg's decoding of it, on the layer that finds every lag a decoder could
add (see sync_layer). Nothing else in song.json changes.
"""
import base64, json, os, subprocess, sys, tempfile
import numpy as np
import soundfile as sf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build import fingerprint, sync_layer  # noqa: E402


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    folder = sys.argv[1]
    path = os.path.join(folder, 'song.json')
    m = json.load(open(path))
    sr = m['rate']
    decoded = {}
    with tempfile.TemporaryDirectory() as tmp:
        for layer in m['layers']:
            back = os.path.join(tmp, layer['id'] + '.wav')
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', os.path.join(folder, layer['file']), '-f', 'wav', '-ar', str(sr), back], check=True)
            y, _ = sf.read(back, dtype='float32', always_2d=True)
            decoded[layer['id']] = y
    lid = sys.argv[2] if len(sys.argv) > 2 else sync_layer(decoded, m['laps'], sr)
    was = m['sync']['layer']
    m['sync'] = {'layer': lid, 'env': base64.b64encode(fingerprint(decoded[lid], sr).tobytes()).decode()}
    # As build.py writes it: one field to a line.
    text = '{\n' + ',\n'.join(' %s: %s' % (json.dumps(k), json.dumps(v, ensure_ascii=False, separators=(',', ':'))) for k, v in m.items()) + '\n}\n'
    open(path, 'w').write(text)
    print('%s: the decoder check on %s (was %s)' % (m['id'], lid, was))


if __name__ == '__main__':
    main()
