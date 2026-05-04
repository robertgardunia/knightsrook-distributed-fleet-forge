#!/bin/sh
set -e
nginx -g "daemon off;" &
exec node /agent/dist/agent.js
