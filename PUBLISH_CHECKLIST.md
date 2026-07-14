# IdeaSpeak — Publish Checklist

**Goal:** Make IdeaSpeak the best "build and test in one app" experience — speak an idea, see a live preview, refine by voice, ship.

**Live Demo:** https://ideaspeak-app.vercel.app  
**Last updated:** July 14, 2026

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
- [x] ModeBadge — Simulator vs Real Grok in header (`ModeBadge.tsx`)
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
- [ ] Settings modal: crystal-clear path for adding xAI API key + graceful fallback messaging (panel exists; copy/UX pass needed)
- [x] Error states and loading states feel premium (`BuildProgressOverlay` — cancel during build, retry on error)
- [x] Export (ZIP + GitHub) produces clean, runnable Next.js 15 projects **every time** (`buildProductionScaffold` + `smoke-e2e` ship unit test)
- [ ] One-click Vercel deploy button **verified** end-to-end in exported projects
- [x] TypeScript clean build — `tsc -b && vite build` (no `|| true` mask)
- [ ] Full-screen live preview / "Test mode"

## Phase 2 — Production Hardening

- [ ] Real E2B (or equivalent) sandbox wired for secure code execution (`sandbox.ts` is stub today)
- [x] Rate limiting + basic abuse protection on API routes (`api/security.js` — per-IP fixed window on build/discuss/refine)
- [ ] Better observability / logging for failed generations (structured request IDs)
- [ ] Environment variable validation on boot (`server/index.ts`)
- [ ] Railway Bun server deployed + monitored (`/health` in production)
- [ ] Auth (optional for demo, required for multi-user)
- [ ] Project persistence + gallery of past builds (local `projects.ts` only today)
- [ ] Usage metering enforced server-side (local `billing.ts` only today)
- [ ] Stripe Checkout + webhooks (Pricing UI exists; payments not wired)

## Phase 3 — Differentiation & Growth

- [ ] Multi-agent "Council" mode
- [ ] Self-improving prompt feedback loop
- [ ] Public gallery of voice-built apps
- [ ] Shareable build links
- [ ] Landing page with video demo of the full loop
- [ ] Analytics funnel (build → ship → upgrade)
- [ ] Error tracking (Sentry) + status page

---

## Current Score: **8.2 / 10** (Demo-ready, loop is the product)

**Next highest leverage items:**
1. Make the landing experience scream "Speak → Live Preview → Ship"
2. Surface ModeBadge on all breakpoints
3. Perfect the Settings → API key flow copy
4. Ensure exported projects always build cleanly (`bun install && bun dev`)
5. Keep CI green on every PR (`bun run build` + `bun run smoke:local`)

See also:
- `docs/DEMO_NOTES.md` — 30-second demo script
- `docs/BUILD_AND_TEST_LOOP.md` — The core product vision
- `docs/SHIP_SPRINT.md` — Sprint plan to world-class ship
- `docs/ENV_MATRIX.md` — Local / Vercel / Railway env vars

*Keep this file updated as the product matures.*