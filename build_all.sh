#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "=== [1/4] Generating Kokoro Dialogue, Cultural Score & Foley SFX ==="
.venv/bin/python audio/generate_audio.py

echo "=== [2/4] Running Sub-1s Node Pre-Flight Scene Gate ==="
node verify_scene.mjs

if [[ "${1:-}" == "--qa" ]]; then
  echo "=== [3/4] Running Chrome QA Keyframes ==="
  node render/render_frames.mjs --qa-only
  exit 0
fi

echo "=== [3/4] Rendering 900 Frames via Chrome WebCodecs H.264 ==="
node render/render_frames.mjs

echo "=== [4/4] Verifying Final MP4 & Audio Loudness ==="
ffprobe -v error -show_entries format=duration,size,bit_rate -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames -of default=noprint_wrappers=1 output/taj_mahal_making_short.mp4
ffmpeg -i output/taj_mahal_making_short.mp4 -af volumedetect -f null - 2>&1 | grep -E "mean_volume|max_volume"
