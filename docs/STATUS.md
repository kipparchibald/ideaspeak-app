# IdeaSpeak — Build Status

**Product:** Voice-first xAI app builder (speak idea → live preview → export)  
**Repo:** `ideaspeak-app` only  
**Live:** https://ideaspeak-app.vercel.app  

**Not this product:** SummitForge RE OS is a separate real-estate app in its own repo (`SummitForge-RE-OS`). Do not mix code, status, or scope.

**Last updated:** July 14, 2026

---

## Current Score: **9.0 / 10**

### Done recently
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
1. Wire `BuildProgressOverlay` cancel/retry in App.tsx
2. Deploy Railway with `XAI_API_KEY` + `E2B_API_KEY` + `STRIPE_*`
3. Supabase project + run `supabase/schema.sql`
4. Stripe test-mode E2E → production keys
5. Launch video + analytics (Plausible/PostHog)
5. Sprint 0.5: branch protection on `main` (repo settings)

---

## Boundaries

| | IdeaSpeak | SummitForge |
|--|-----------|-------------|
| Purpose | Build *any* app by voice with Grok | RE operating system (land, deals, brokerage) |
| Repo | `ideaspeak-app` | `SummitForge-RE-OS` |
| Stack | Vite + React + Sandpack + xAI proxy | Next.js 15 RE dashboard |
| Work here? | Yes | No — open that repo |

When an agent or human is in this workspace, only change IdeaSpeak.
