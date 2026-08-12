# IdeaSpeak — Build Status

**Product:** Voice-first xAI app builder (speak idea → live preview → export)  
**Repo:** `ideaspeak-app` only  
**Live:** https://ideaspeak-app.vercel.app  

**Not this product:** SummitForge RE OS is a separate real-estate app in its own repo (`SummitForge-RE-OS`). Do not mix code, status, or scope.

**Last updated:** August 12, 2026

---

## Current Score: **9.7 / 10**

### Done recently (August 12 production hardening)
- **Observability** — structured `generation_failed` JSON logs with `X-Request-Id` on `/api/build`, `/api/discuss`, `/api/refine` (Vercel edge + Railway Bun server)
- **Bug fix** — Bun server `/api/discuss` route was unreachable (string typo in pathname check)
- **Smoke** — local API URL detection fixed (`localhost:8080` → Bun `:3001`); CI preview port aligned to 8080

### Done recently (July 30 full ship pass)
- **Grok Build** — `/api/build` uses `grok-build-0.1` via Responses API (+ `grok-4.5` fallback); UI + progress surface Grok Build
- **Grok 4.5** — default chat/plan/discuss model (flagship); pairs with Grok Build for previews
- **Confidential Box** — encrypted one-time vault; Autopilot deploys via Vercel/GitHub APIs without dashboards
- **Export quality** — secret-free ZIP, merged preview deps, smarter imports, EXPORT_QUALITY.md, client directive only when needed
- **Gallery** — Publish from Projects, Share on gallery cards, remix analytics
- **Autopilot** — accurate progress bar; Server Autopilot toggle; token guidance
- **Stripe edge** — `/api/stripe/status` + `/api/stripe/checkout` on Vercel
- **Analytics funnel** — local ring + optional Plausible/PostHog (`src/lib/analytics.ts`)
- **Demo panel** — 30s Speak → Preview → Ship walkthrough (+ VITE_DEMO_VIDEO_URL)
- **Env matrix** — GITHUB/VERCEL/SHIP_WORKER + analytics vars in `.env.example`

### Done recently (July 30 polish pass · continued)
- **Shareable build links** — Projects → Share copies `?share=` payload; open restores plan/preview
- **One-click Vercel always on** — Ship Host CTA + every export README Deploy button (repo-aware)
- **Copy env for Vercel** — one paste from Ship Host step
- **Header loop on mobile** — Speak → Preview → Ship always visible
- **BuildProgressOverlay wired** — cancel during build + retry on error
- **Settings API path** — 30-second Grok connect guide + live banner
- **Full-screen Test mode** — banner + Esc exit
- Portfolio boundaries locked (`PROJECTS.md`) — IdeaSpeak only in this repo

### Done previously
- Voice-first UI: large Tap-to-speak mic, Chat → Build → Preview flow
- Preview | Code workspace tabs (preview-first)
- ModeBadge (Simulator vs Real Grok)
- API setup + Grok TTS settings
- Ship panel (Supabase · Vercel · domain checklist)
- Polish panel (Grok / Cursor / Claude / GPT handoff)
- Pricing panel + local usage metering (`billing.ts`)
- Vercel edge API (`api/*.js`) + Railway config for Bun server
- BUILD_AND_TEST_LOOP.md, PUBLISH_CHECKLIST, DEMO_NOTES, **SHIP_SPRINT.md**
- **Sprint 0.4:** `PUBLISH_CHECKLIST.md` synced with codebase reality
- **Sprint 0.6:** GitHub Actions CI — `bun install` → `build` → `smoke:local` on push/PR to `main`
- **`docs/ENV_MATRIX.md`** — Local / Vercel / Railway env documentation

### Sprint execution (parallel agents, June 15 2026)
| Sprint | Status |
|--------|--------|
| 0 Hygiene | ✅ TS clean build, CI workflow, ENV_MATRIX |
| 1 Polish | ✅ Hero copy, ModeBadge, Sandpack split, export harden, Ship/Polish panels |
| 2 Hosting | ✅ CORS, rate limits, env validation, API_SETUP |
| 3 Sandbox | ✅ E2B manager + UI toggle (needs `E2B_API_KEY` on Railway) |
| 4 Auth | ✅ Supabase schema + AccountPanel + cloud sync stubs |
| 5 Payments | ✅ Stripe checkout + webhooks (needs test/live keys) |
| 6 Launch | ⏳ Analytics, legal, demo video |

### Next (Sprint 6 + hardening)
1. Deploy Railway with `XAI_API_KEY` + `E2B_API_KEY` + `STRIPE_*` (owner: Kipp)
2. Supabase project + run `supabase/schema.sql` (owner: Kipp)
3. Stripe test-mode E2E → production keys (owner: Kipp)
4. Launch video + analytics (Plausible/PostHog)
5. Optional: cloud-backed share links (today are portable URL payloads)
6. Sprint 0.5: branch protection on `main` (repo settings)
7. Error tracking (Sentry) + status page

---

## Boundaries (three big products — never jumble)

| | IdeaSpeak | SummitForge | Split Rock Construction |
|--|-----------|-------------|-------------------------|
| Purpose | Build *any* app by voice with Grok | RE operating system (land, deals, brokerage) | New-home builds website + client portal |
| Repo | `ideaspeak-app` | `SummitForge-RE-OS` | `split-rock-construction` |
| Stack | Vite + React + Sandpack + xAI proxy | Next.js RE dashboard | Construction marketing / portal |
| Work in this checkout? | **Yes only** | No — own repo | No — own repo |

Full map: root **`PROJECTS.md`**. When an agent or human is in this workspace, only change IdeaSpeak.
