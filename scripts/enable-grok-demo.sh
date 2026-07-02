#!/usr/bin/env bash
# One-time setup: Lovable-style hosted API (server holds the key, visitors get real Grok)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "IdeaSpeak → Lovable-style API setup"
echo "Lovable works because THEY host the API key. We do the same with one Vercel env var."
echo ""
echo "Get your key: https://console.x.ai/"
echo -n "Paste XAI_API_KEY (hidden): "
read -rs KEY
echo ""

if [[ -z "$KEY" ]]; then
  echo "No key provided. Aborting."
  exit 1
fi

echo "$KEY" | bun x vercel env add XAI_API_KEY production
echo ""
echo "Redeploying..."
bun x vercel build --prod
bun x vercel deploy --prebuilt --prod --yes

echo ""
echo "Done. Check https://ideaspeak-app.vercel.app/api/status — should show live:true"
echo "Badge on site will show LIVE GROK · server"