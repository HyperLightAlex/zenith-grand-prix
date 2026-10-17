#!/bin/bash
# The game as it was at a git ref (a commit, a branch, main), built into its
# own folder and served on a second port, for before-and-after captures:
#   tools/capture/build-ref.sh <ref> [port=8091]
# Then BASE=http://127.0.0.1:8091/ node tools/capture/capture.mjs ... for
# "before", and the usual server (8090) for "after". Ctrl-C stops it.
# Uses this checkout's node_modules and server; only the game is the ref's.
set -euo pipefail
REF=${1:?usage: build-ref.sh <ref> [port]}
PORT=${2:-8091}
REPO=$(cd "$(dirname "$0")/../.." && pwd)
WORK=$(mktemp -d)
OUT="$WORK/dist"
git -C "$REPO" worktree add --quiet --detach "$WORK/src" "$REF"
trap 'git -C "$REPO" worktree remove --force "$WORK/src" >/dev/null 2>&1 || true' EXIT
ln -s "$REPO/node_modules" "$WORK/src/node_modules"
(cd "$WORK/src" && npx vite build --outDir "$OUT" --emptyOutDir >/dev/null)
git -C "$REPO" worktree remove --force "$WORK/src" >/dev/null
trap - EXIT
[ -f "$REPO/dist-server/index.mjs" ] || (cd "$REPO" && npm run build >/dev/null)
echo "$REF built into $OUT; serving it on http://127.0.0.1:$PORT/"
STATIC_DIR="$OUT" HOST=127.0.0.1 PORT="$PORT" exec node "$REPO/dist-server/index.mjs"
