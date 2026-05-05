#!/bin/sh
set -e

# nginx serves the game files to both the local Chromium and any remote viewers
nginx -g "daemon off;" &
sleep 1

# Chromium actually runs the game — this is the kiosk application.
# Without this the game does not run; nginx is just a file server.
# --headless=new   : full rendering pipeline, no physical display required
# --disable-gpu    : forces SwiftShader software renderer (generates real CPU load)
# --use-gl=swiftshader : explicit software WebGL for HexGL
chromium-browser \
  --headless=new \
  --no-sandbox \
  --disable-dev-shm-usage \
  --disable-gpu \
  --use-gl=swiftshader \
  --no-first-run \
  --disable-extensions \
  --disable-default-apps \
  --autoplay-policy=no-user-gesture-required \
  --mute-audio \
  --window-size=1920,1080 \
  http://localhost:8080/ &

# Fleet agent — registers with homebase, logs kiosk activity to stdout
# Runs completely independently; kiosk keeps going even if upstream is unreachable
exec node /agent/dist/agent.js
