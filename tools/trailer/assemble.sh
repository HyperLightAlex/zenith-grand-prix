#!/bin/bash
# The opening, finished: every frame drawn by the compositor (in two halves
# side by side), then encoded twice with the song: the clean cut, and the
# CRT cut (the game's CRT screen over every frame).
#   SONG=path/to/song.m4a tools/trailer/assemble.sh
# Needs the footage first (see tools/trailer/README.md) and ffmpeg. Writes
# tools/trailer/out/zenith-opening.mp4 and zenith-opening-crt.mp4.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
SONG=${SONG:-$HERE/song.m4a}
[ -f "$SONG" ] || { echo "No song at $SONG: set SONG=" >&2; exit 1; }
OUT=$HERE/out
N=1795   # 74.77 s at 24 fps
HALF=$((N / 2))
mkdir -p "$OUT/clean"
node "$HERE/render.mjs" "$OUT/clean" 0 $HALF > "$OUT/compA.log" 2>&1 &
node "$HERE/render.mjs" "$OUT/clean" $HALF $N > "$OUT/compB.log" 2>&1 &
wait
echo "$(ls "$OUT/clean" | wc -l) frames"
# 12 Mb/s, as delivered; -crf 15 for a master.
ENC=(-c:v libx264 -preset medium -b:v 12M -maxrate 16M -bufsize 24M -pix_fmt yuv420p -profile:v high -tune animation -c:a aac -b:a 256k -movflags +faststart -shortest)
ffmpeg -y -loglevel error -framerate 24 -i "$OUT/clean/%04d.jpg" -i "$SONG" -map 0:v -map 1:a "${ENC[@]}" "$OUT/zenith-opening.mp4"
python3 "$HERE/crt.py" "$OUT/clean" - | ffmpeg -y -loglevel error -f rawvideo -pix_fmt rgb24 -s 1920x1080 -r 24 -i - -i "$SONG" -map 0:v -map 1:a "${ENC[@]}" "$OUT/zenith-opening-crt.mp4"
ls -la "$OUT"/*.mp4
