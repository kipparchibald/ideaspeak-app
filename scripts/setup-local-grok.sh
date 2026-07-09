#!/usr/bin/env bash
# Add XAI_API_KEY for local dev (bun run dev:full)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "IdeaSpeak — local Grok setup"
echo ""
echo "Production is already live at https://ideaspeak-app.vercel.app"
echo "This script sets up YOUR machine for local dev with real Grok."
echo ""
if [[ -n "${XAI_API_KEY:-}" ]]; then
  KEY="$XAI_API_KEY"
  echo "Using XAI_API_KEY from environment."
elif [[ -t 0 ]]; then
  echo "1. Get a key at https://console.x.ai/ (API Keys → Create)"
  echo "2. Paste it below (hidden input)"
  echo ""
  echo -n "XAI_API_KEY: "
  read -rs KEY
  echo ""
else
  echo "No TTY — run in your terminal:"
  echo "  bun run setup:grok"
  echo "Or:"
  echo "  XAI_API_KEY=xai-your-key bun run setup:grok"
  exit 1
fi

if [[ -z "$KEY" ]]; then
  echo "No key entered. Aborting."
  exit 1
fi

# Preserve other vars if .env.local exists, update only XAI_API_KEY
if [[ -f .env.local ]] && grep -q '^XAI_API_KEY=' .env.local; then
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "s|^XAI_API_KEY=.*|XAI_API_KEY=\"$KEY\"|" .env.local
  else
    sed -i "s|^XAI_API_KEY=.*|XAI_API_KEY=\"$KEY\"|" .env.local
  fi
else
  echo "XAI_API_KEY=\"$KEY\"" >> .env.local
fi

echo ""
echo "✓ Saved to .env.local"
echo ""
echo "Restart dev servers:"
echo "  pkill -f 'vite|server/index.ts' 2>/dev/null; bun run dev:full"
echo ""
echo "Then open http://localhost:5173 — badge should show LIVE GROK · server"
echo "Verify: curl http://localhost:5173/api/status"