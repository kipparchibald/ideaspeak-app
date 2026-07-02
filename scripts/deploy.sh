#!/usr/bin/env bash
# Production deploy — prebuilt avoids Vercel build-queue hangs
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ Building frontend..."
bun run build

echo "→ Vercel prebuild..."
bun x vercel build --prod

echo "→ Deploying to production..."
bun x vercel deploy --prebuilt --prod --yes

echo ""
echo "→ Post-deploy smoke test..."
bun run smoke:full

echo ""
echo "✓ IdeaSpeak v1.0 live at https://ideaspeak-app.vercel.app"