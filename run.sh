#!/usr/bin/env bash
# Start the open-slide dev server for the rSMTv2 deck and open it in the browser.
# Usage: ./run.sh [port]
set -euo pipefail

cd "$(dirname "$0")"

PORT="${1:-5173}"

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

URL="http://localhost:${PORT}/s/rsmtv2"
echo "Serving the deck at ${URL}  (press F for fullscreen, Ctrl+C to stop)"

# Open the browser once the server has had a moment to start.
(sleep 3 && { command -v open >/dev/null && open "$URL" || command -v xdg-open >/dev/null && xdg-open "$URL" || true; }) >/dev/null 2>&1 &

exec npx open-slide dev --port "$PORT"
