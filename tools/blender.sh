#!/bin/sh
# Blender without the Blender app: the bpy module, Blender 5.2.2 (the version
# the production mechs are exported with), for scripts run in the background,
# on a machine with no screen (a cloud workspace, CI) as on one with.
#
#   sh tools/blender.sh run <script.py> [-- script args]
#       Run a Blender script, as `blender --background --python` would.
#   sh tools/blender.sh check
#       Re-export every production mech (art/blender/roster/production) to a
#       temporary folder and compare each file byte for byte with the game's.
#
# Rendering works too: Cycles and Workbench on the CPU, EEVEE through software
# EGL (slow). The first run installs the module if it is missing.
set -e
BPY=5.2.2
cd "$(dirname "$0")/.."

have() { python3 -c "import bpy, sys; sys.exit(0 if bpy.app.version_string.startswith('$BPY') else 1)" 2>/dev/null; }
if ! have; then
  if ! python3 -c "import sys; sys.exit(0 if sys.version_info[:2] == (3, 13) else 1)"; then
    echo "bpy $BPY needs Python 3.13 (this is $(python3 --version))." >&2
    exit 1
  fi
  echo "Installing bpy $BPY..." >&2
  python3 -m pip install --quiet --break-system-packages "bpy==$BPY"
fi

case "$1" in
  run)
    shift
    exec python3 "$@"
    ;;
  check)
    out=$(mktemp -d)
    python3 art/blender/roster/production/export.py -- --all --output-root "$out" --check --report "$out/report.json" >"$out/export.log" 2>&1
    python3 - "$out/report.json" <<'EOF'
import json, sys
report = json.load(open(sys.argv[1]))
files = [(d, l) for d, levels in report.items() for l in levels]
bad = [f"{d} LOD{l['level']}" for d, l in files if not l.get('bytes_exact')]
print(f"{len(report)} designs, {len(files) - len(bad)} of {len(files)} files byte for byte")
if bad:
    print("Differ: " + ", ".join(bad))
    sys.exit(1)
EOF
    ;;
  *)
    sed -n '2,15p' "$0"
    exit 2
    ;;
esac
