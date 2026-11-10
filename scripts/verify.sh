#!/bin/bash
# Tests + build + serves the build on a free port + draws/inks/exports in headless Chrome. PERGEL_SHOTS=<dir> keeps screenshots.
set -euo pipefail
cd "$(dirname "$0")/.."

npm test --silent
npm run build --silent

port=$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')
npx vite preview --host 127.0.0.1 --port "$port" --strictPort > /dev/null 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; wait $PID 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do curl -sf -o /dev/null "http://127.0.0.1:$port/" && break; sleep 0.2; done

PERGEL_URL="http://127.0.0.1:$port/" node scripts/check.mjs
