#!/usr/bin/env bash
# pergel: vite :5251 with watch, opens the app. Ctrl+C stops it. pm's ▶ Start runs this.
set -euo pipefail
cd "$(dirname "$0")"

[[ -f node_modules/.package-lock.json && ! package-lock.json -nt node_modules/.package-lock.json ]] || npm install --no-audit --no-fund

pid="$(lsof -nP -t -iTCP:5251 -sTCP:LISTEN 2>/dev/null | head -1 || true)"
[[ -z "$pid" ]] || { echo "Port 5251 is in use by pid $pid ($(ps -o comm= -p "$pid")). Stop it and re-run."; exit 1; }

URL=http://127.0.0.1:5251/
(
  for _ in $(seq 1 150); do curl -sf -o /dev/null "$URL" && break; sleep 0.2; done
  open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL"
) &
exec npm run dev
