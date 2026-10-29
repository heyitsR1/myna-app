#!/usr/bin/env bash
# Hot-switch Maya's brain on the deployed Worker. No rebuild, no deploy.
#
#   bash scripts/llm-switch.sh cloudflare   # Workers AI — no tunnel, no laptop
#   bash scripts/llm-switch.sh ollama       # local qwen3 via ngrok (run demo-up.sh too)
#   bash scripts/llm-switch.sh auto         # unset: Workers AI on Cloudflare, Ollama locally
#
# Re-embeds the brand docs afterwards (the two embedding models are different
# spaces) and prints the health report.
set -euo pipefail
cd "$(dirname "$0")/.."
W=https://myna-app.aarohan567.workers.dev
AUTH="myna:${BASIC_AUTH_PASSWORD:-TqLr2f92kVwCS6EC}"
case "${1:-}" in
  cloudflare|ollama) echo "$1" | npx wrangler secret put LLM_PROVIDER >/dev/null; echo "✓ LLM_PROVIDER=$1" ;;
  auto) npx wrangler secret delete LLM_PROVIDER --force >/dev/null 2>&1 || true; echo "✓ LLM_PROVIDER unset (auto)" ;;
  *) echo "usage: $0 cloudflare|ollama|auto"; exit 1 ;;
esac
echo "re-embedding brand docs…"
curl -s -m 120 -X POST -u "$AUTH" "$W/api/maintenance/reindex"; echo
echo
curl -s -m 30 -u "$AUTH" "$W/api/health?text=1"
