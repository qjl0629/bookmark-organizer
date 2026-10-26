#!/usr/bin/env bash
# Renders the screenshots and demo GIF in docs/ from the real app, in demo mode with fictional
# data. Needs Google Chrome (headless) and Python with Pillow. Run from the repository root:
#   bash tools/assets/build_shots.sh
set -euo pipefail

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT="${PORT:-8771}"
OUT="docs"
FRAMES="$(mktemp -d)"
mkdir -p "$OUT"

python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; rm -rf "$FRAMES"' EXIT
sleep 1

shot() { # name, query, [width], [height]
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=60000 \
    --window-size="${3:-1280},${4:-800}" --screenshot="$1" \
    "http://127.0.0.1:$PORT/tools/assets/stage.html?$2" >/dev/null 2>&1
}

shot "$OUT/shot-1-overview.png" "hero=1"
shot "$OUT/shot-2-misfiled.png" "show=sec-review&hero=0&bar=0"
shot "$OUT/shot-3-most-used.png" "show=sec-order&hero=0&bar=0"
shot "$OUT/shot-4-folders.png" "show=sec-folders&hero=0&bar=0"
shot "$OUT/shot-5-archive.png" "show=sec-archive&hero=0&bar=0"
shot "$OUT/shot-6-done.png" "step=done&show=sec-archive&hero=0&bar=0"

# Demo GIF: overview, everything ticked, the confirm panel, the finished run.
shot "$FRAMES/1.png" "hero=1"
shot "$FRAMES/2.png" "hero=1&step=ticked"
shot "$FRAMES/3.png" "hero=1&step=confirm"
shot "$FRAMES/4.png" "step=done&show=sec-archive&hero=0&bar=0"

python3 - "$FRAMES" "$OUT/demo.gif" <<'PY'
import sys
from PIL import Image
frames_dir, target = sys.argv[1], sys.argv[2]
frames = []
for n in (1, 2, 3, 4):
    im = Image.open(f"{frames_dir}/{n}.png").convert("RGB")
    frames.append(im.resize((960, 600), Image.LANCZOS).quantize(colors=128, method=Image.MEDIANCUT, dither=Image.NONE))
frames[0].save(target, save_all=True, append_images=frames[1:], duration=[2200, 1800, 2200, 3200], loop=0, optimize=True)
PY
# Social preview (1280x640) and the 小红书 slides (1242x1660, 3:4, written to dist/xhs). The slides reuse docs/shot-2.
render() { # file, url path, width, height
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=60000 \
    --window-size="$3,$4" --screenshot="$1" "http://127.0.0.1:$PORT/$2" >/dev/null 2>&1
}
render "$OUT/social-preview.png" "tools/assets/social.html" 1280 640
render "$OUT/promo-tile-440x280.png" "tools/assets/promo-tile.html" 440 280
XHS="${XHS_OUT:-dist/xhs}"   # promo slides are not part of the repository
mkdir -p "$XHS"
i=1
for name in cover pain misfiled features privacy get numbers; do
  render "$XHS/0$i-$name.png" "tools/assets/xhs/$name.html" 1242 1660
  i=$((i + 1))
done
ls -la "$OUT" "$XHS"
