#!/usr/bin/env bash
# Stream macOS camera + microphone to Mux Live via RTMP (no OBS — FFmpeg only).
#
# Prerequisites:
#   brew install ffmpeg
#
# 1) Add your stream key to local.env (same folder as this repo):
#      MUX_STREAM_KEY=paste-from-livefeed-app-after-create
#
#    Or export for one session:
#      export MUX_STREAM_KEY="..."
#
# 2) Optional — pick device indexes (defaults often work):
#      ffmpeg -f avfoundation -list_devices true -i ""
#
#    Then set before running, e.g.:
#      export MUX_AVFOUNDATION_VIDEO=1
#      export MUX_AVFOUNDATION_AUDIO=0
#
# 3) Run from repo root:
#      npm run stream:camera
#    Or:
#      ./scripts/stream-camera-to-mux.sh
#
# Stop with Ctrl+C.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -f "$ROOT_DIR/local.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/local.env"
  set +a
fi

: "${MUX_STREAM_KEY:?Set MUX_STREAM_KEY in local.env (or export it). Get it from your live stream in the app / Mux dashboard.}"

RTMP_URL="${MUX_RTMP_URL:-rtmps://global-live.mux.com:443/app}"
VIDEO_INPUT="${MUX_AVFOUNDATION_VIDEO:-0}"
AUDIO_INPUT="${MUX_AVFOUNDATION_AUDIO:-0}"

TARGET="${RTMP_URL}/${MUX_STREAM_KEY}"

echo "Streaming to Mux (camera + mic). Stop with Ctrl+C."
echo "RTMP base: ${RTMP_URL}"

exec ffmpeg \
  -f avfoundation \
  -framerate 60 \
  -pixel_format uyvy422 \
  -i "${VIDEO_INPUT}:${AUDIO_INPUT}" \
  -c:v libx264 -preset veryfast -pix_fmt yuv420p \
  -c:a aac -b:a 128k \
  -f flv "$TARGET"
