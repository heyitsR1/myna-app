#!/usr/bin/env bash
# One-shot demo prep: make sure Ollama + ngrok are up, point the deployed
# Worker at the current tunnel URL, and warm the chat model so the first
# real DM does not pay the ~10s model-load cost.
#
#   bash scripts/demo-up.sh
#
# Needs: `npx wrangler login` done once, ngrok installed, Ollama installed.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! curl -s -m 3 localhost:11434/api/tags >/dev/null; then
  echo "Ollama not responding on :11434 — start it (open the Ollama app or run 'ollama serve')"; exit 1
fi
echo "✓ Ollama up"

if ! curl -s -m 2 localhost:4040/api/tunnels >/dev/null; then
  echo "starting ngrok…"
  nohup ngrok http 11434 --host-header=localhost:11434 --log=stdout >/tmp/ngrok-myna.log 2>&1 &
  sleep 4
fi
URL=$(curl -s localhost:4040/api/tunnels | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const t=JSON.parse(s).tunnels.find(t=>t.public_url.startsWith("https"));console.log(t.public_url)})')
echo "✓ ngrok $URL"
curl -s -m 8 -H "ngrok-skip-browser-warning: 1" "$URL/api/tags" | grep -q qwen3 || { echo "tunnel does not reach Ollama"; exit 1; }
echo "✓ tunnel reaches Ollama"

echo "$URL" | npx wrangler secret put OLLAMA_BASE_URL >/dev/null
echo "✓ Worker OLLAMA_BASE_URL updated"

echo "warming qwen3:8b…"
curl -s localhost:11434/api/chat -d '{"model":"qwen3:8b","stream":false,"think":false,"keep_alive":"60m","messages":[{"role":"user","content":"hi"}]}' >/dev/null
echo "✓ model warm (kept loaded 60 min)"

W=https://myna-app.aarohan567.workers.dev
AUTH="myna:${BASIC_AUTH_PASSWORD:?export BASIC_AUTH_PASSWORD first (see the private secrets bundle)}"

# Instagram tokens die silently after 60 days; this mints a fresh one when
# the stored one is getting old (no-op otherwise) and stores it in the DB.
echo "instagram token: $(curl -s -m 20 -X POST -u "$AUTH" $W/api/maintenance/refresh-ig-token)"

# Live probe of every dependency — the numbers that actually matter.
echo
curl -s -m 30 -u "$AUTH" "$W/api/health?text=1"
echo
echo "Keep this Mac awake (caffeinate -d) for the demo."
