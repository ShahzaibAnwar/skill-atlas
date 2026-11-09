#!/usr/bin/env sh
# Start Skill Atlas on macOS / Linux and open it in your browser.
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js is not installed. Get it from https://nodejs.org"; exit 1; }
URL="http://localhost:${PORT:-4747}"
( sleep 2; if command -v open >/dev/null 2>&1; then open "$URL"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1; fi ) &
echo "Skill Atlas is running at $URL (press Ctrl+C to stop)"
exec node server.js
