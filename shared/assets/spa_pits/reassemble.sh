#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "Reassembling garage_player.glb (base64 parts → binary) ..."
: > "garage_player.glb"
for p in garage_player.glb.part*; do
  base64 -d "$p" >> "garage_player.glb"
done
echo "426dca21e567b2de58c692c3ec0d2282321b56b942f3834406f77871f1df0914  garage_player.glb" | sha256sum -c -

echo "OK — all split files reassembled, base64-decoded, and verified."
