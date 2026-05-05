#!/bin/sh
set -e

# nginx serves the slideshow to both the local Chromium and any remote viewers
nginx -g "daemon off;" &
sleep 1

# Chromium actually runs the slideshow — this is the kiosk application.
chromium-browser \
  --headless=new \
  --no-sandbox \
  --disable-dev-shm-usage \
  --disable-gpu \
  --no-first-run \
  --disable-extensions \
  --disable-default-apps \
  --autoplay-policy=no-user-gesture-required \
  --mute-audio \
  --window-size=1920,1080 \
  http://localhost:8080/ &

# Fleet agent — registers with homebase, logs visitor activity to stdout
exec node /agent/dist/agent.js
