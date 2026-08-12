# IdeaSpeak — Publish Checklist

**Goal:** Make IdeaSpeak the best "build and test in one app" experience — speak an idea, see a live preview, refine by voice, ship.

**Live Demo:** https://ideaspeak-app.vercel.app  
**Last updated:** August 12, 2026

---

## Phase 1 — Demo Polish (Highest Priority)

### Core demo (done)
- [x] Strong README with clear value proposition
- [x] Live Vercel deployment
- [x] PWA + mobile install instructions (`manifest.json`, README Phone/PWA section)
- [x] Smoke tests (`scripts/smoke-e2e.mjs`, `bun run smoke` / `smoke:full` / `smoke:local`)
- [x] CI pipeline on push/PR to `main` (`.github/workflows/ci.yml`)
- [x] Publish checklist + demo notes
- [x] Simulator vs Real Grok documented (`docs/API_SETUP.md`, `GROK-CURSOR-WORKFLOW.md`)
- [x] Build & Test Loop vision documented (`docs/BUILD_AND_TEST_LOOP.md`)
- [x] Environment matrix documented (`docs/ENV_MATRIX.md`)

### Product surfaces (built — polish remaining)
- [x] ModeBadge — Simulator vs Real Grok in header (`ModeBadge.tsx` — `no API` / `live API` / `Key invalid` labels)
- [x] API setup panel — Save & Verify xAI key (`ApiSetupPanel.tsx`, `api-verify.ts`)
- [x] Preview-first workspace — Preview | Code tabs + Sandpack live preview
- [x] Ship panel — Supabase · Vercel · domain checklist (`ShipPanel.tsx`, `ship.ts`)
- [x] Polish panel — Grok / Cursor / Claude / GPT handoff (`PolishPanel.tsx`)
- [x] Pricing panel + local usage metering (`PricingPanel.tsx`, `billing.ts`)
- [x] Grok Voice integration (`GrokVoiceButton`, `grokVoice.ts`, `/api/voice-token`)
- [x] Vercel edge API routes (`api/*.js` — status, xai, build, discuss, refine, image, tts)
- [x] Railway config for Bun server (`railway.json`, `nixpacks.toml`)
- [x] CORS + origin lock (`api/security.js`)

### Still missing / needs polish
- [x] Landing page / hero clearly communicates **"Speak → Live Preview → Ship"** (`App.tsx` hero + step cues; header tagline still legacy on `sm+`)
- [x] ModeBadge visible on mobile (`ModeBadge` always in header; only subtitle tagline hides on small screens)
- [x] Settings modal: crystal-clear path for adding xAI API key + graceful fallback messaging (30s guide + live banner)
- [x] Error states and loading states feel premium (`BuildProgressOverlay` — cancel, retry, error detail + request ref in toasts)
- [x] Export (ZIP + GitHub) produces clean, runnable Next.js 15 projects **every time** (`buildProductionScaffold` + `validateExportScaffold` gate + `smoke-e2e` ship unit test)
- [x] One-click Vercel deploy button always present (Ship Host + README badge; repo-aware clone URL) — live deploy still needs your Vercel account
- [x] TypeScript clean build — `tsc -b && vite build` (no `|| true` mask)
- [x] Full-screen live preview / "Test mode" (banner + Esc exit)

## Phase 2 — Production Hardening

- [x] E2B client + server manager wired (`E2B_API_KEY` enables real; graceful stub without)
- [x] Rate limiting + basic abuse protection on API routes (`api/security.js` — per-IP fixed window on build/discuss/refine)
- [x] Better observability / logging for failed generations (structured request IDs)
- [x] Environment variable validation on boot (`server/index.ts` validateEnv)
- [ ] Railway Bun server deployed + monitored (`/health` in production)
- [ ] Auth (optional for demo, required for multi-user)
- [x] Project library + gallery publish/share (local; cloud sync when Supabase configured)
- [ ] Usage metering enforced server-side (local `billing.ts` only today)
- [x] Stripe Checkout + webhooks (Railway server + Vercel edge status/checkout; needs live keys)

## Phase 3 — Differentiation & Growth

- [ ] Multi-agent "Council" mode
- [ ] Self-improving prompt feedback loop
- [ ] Public gallery of voice-built apps
- [x] Shareable build links (`?share=` encode/decode + Projects Share button)
- [x] Demo panel with 30s loop script (+ optional video embed via env)
- [x] Analytics funnel helper (local ring + Plausible/PostHog optional)
- [x] Confidential Box vault + autonomous client ship (GitHub + Vercel API)
- [ ] Error tracking (Sentry) + status page

---

## Current Score: **9.7 / 10** (Demo-ready, loop is the product)

**Next highest leverage items:**
1. Deploy Railway + Supabase + Stripe test keys for production path
2. Cloud share links (optional — URL payloads work offline today)
3. Keep CI green on every PR (`bun run build` + smoke)
4. Launch video + analytics funnel
5. E2B real sandbox when `E2B_API_KEY` is set

See also:
- `docs/DEMO_NOTES.md` — 30-second demo script
- `docs/BUILD_AND_TEST_LOOP.md` — The core product vision
- `docs/SHIP_SPRINT.md` — Sprint plan to world-class ship
- `docs/ENV_MATRIX.md` — Local / Vercel / Railway env vars

*Keep this file updated as the product matures.*