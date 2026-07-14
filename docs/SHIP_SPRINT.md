# IdeaSpeak — Ship Sprint Plan

**Goal:** World-class, end-to-end product — speak → live preview → polish → ship → collect payments.  
**Current baseline:** 8.2/10 demo (`docs/STATUS.md`). Strong loop; production gaps in auth, billing, sandbox, and cloud persistence.  
**Live:** https://ideaspeak-app.vercel.app  
**Last updated:** June 15, 2026

---

## North Star

> **Speak it. See it live. Ship without the pain. Pay for convenience.**

Customers pay for the *path* (voice → preview → production ZIP → Supabase/Vercel/domain), not raw tokens. Multi-model polish (Grok + Cursor + Claude + GPT) is the upsell layer after export.

### World-class bar (every sprint)

| Dimension | Bar |
|-----------|-----|
| **First 60 seconds** | User speaks once → understands the loop → sees something beautiful |
| **Time to wow** | First build feels hand-crafted, not AI slop |
| **Preview fidelity** | Sandpack instant; optional real sandbox for auth/backend flows |
| **Ship** | Exported ZIP runs with `bun install && bun dev` — no fixes |
| **Polish** | One-click handoff to Cursor/Claude/GPT with loaded context |
| **Payments** | Upgrade in 2 clicks; entitlements enforced server-side |
| **Trust** | Clear Simulator vs Real Grok; no surprise failures |

---

## Architecture target (ship state)

```
┌─────────────────────────────────────────────────────────────────┐
│  Vercel (frontend + edge API)                                   │
│  ideaspeak-app.vercel.app                                       │
│  • React PWA  • api/*.js (xAI proxy, status, build, discuss)    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ Railway       │   │ Supabase      │   │ Stripe        │
│ Bun server    │   │ Auth + DB     │   │ Checkout +    │
│ E2B sandbox   │   │ projects      │   │ webhooks      │
│ voice tokens  │   │ entitlements  │   │               │
└───────────────┘   └───────────────┘   └───────────────┘
        │
        ▼
┌───────────────┐
│ E2B           │
│ Real preview  │
│ npm install   │
│ terminal/logs │
└───────────────┘
```

**Rule:** User xAI keys stay optional (power users). Platform keys on server for hosted demo + Pro tier. Entitlements always server-authoritative.

---

## Sprint 0 — Foundation & hygiene (3 days)

*Unblock everything else. No new features.*

### Goals
- Clean CI green path; no silent `tsc || true` masking errors
- Private GitHub repo synced; deploy pipeline documented
- Env matrix documented (local / Vercel / Railway)

### Tasks

| # | Task | Files / area | DoD |
|---|------|--------------|-----|
| 0.1 | Fix TypeScript errors (zero warnings in `src/`) | `src/App.tsx`, components | `bun run build` passes without `\|\| true` hack |
| 0.2 | Split `App.tsx` into feature modules | `src/features/*`, `src/store/*` | Main file < 800 lines; behavior unchanged |
| 0.3 | Code-split Sandpack (1MB+ chunk) | `vite.config.ts`, lazy imports | LCP bundle < 400KB initial |
| 0.4 | Sync `PUBLISH_CHECKLIST.md` with reality | docs | Checkboxes match code |
| 0.5 | GitHub private repo + branch protection | remote `origin` | `main` protected; PRs for releases |
| 0.6 | Smoke tests in CI | `.github/workflows`, `scripts/smoke-e2e.mjs` | PR + deploy gate |

### Exit criteria
- [ ] `bun run smoke:full` green on every deploy
- [ ] `docs/STATUS.md` score ≥ 8.5 from polish alone

---

## Sprint 1 — Polish & optimize (1 week)

*Make the demo feel like a $29/mo product before charging.*

### Goals
- Landing screams **Speak → Live Preview → Ship**
- Every loading/error state feels premium
- Export always produces clean Next.js 15 projects

### Tasks

| # | Task | Priority | Files | DoD |
|---|------|----------|-------|-----|
| 1.1 | Hero + value prop rewrite | P0 | `src/App.tsx`, `preview-scaffold.ts` | 5-second comprehension test passes |
| 1.2 | ModeBadge always visible | P0 | `ModeBadge.tsx`, header | Simulator / Real Grok / key missing states |
| 1.3 | Settings → API key flow | P0 | `ApiSetupPanel.tsx`, `api-verify.ts` | Verify key → toast → badge updates live |
| 1.4 | Build progress overlay polish | P1 | `BuildProgressOverlay.tsx` | No jank; cancel/retry on error |
| 1.5 | Preview-first layout | P0 | workspace tabs | Preview default; full-screen test mode |
| 1.6 | Export hardening | P0 | `ship.ts`, `build-tools.ts` | 5 sample ideas → ZIP → `bun dev` green |
| 1.7 | Ship panel UX pass | P1 | `ShipPanel.tsx` | Checklist completion % visible |
| 1.8 | Polish panel discoverability | P1 | `PolishPanel.tsx` | Post-build CTA: "Polish in Cursor" |
| 1.9 | Mobile PWA pass | P1 | `manifest.json`, voice UX | Install banner; mic works on iOS/Android |
| 1.10 | Performance budget | P2 | Lighthouse | Performance ≥ 85 on mobile |

### UX copy (ship-ready)

- **Headline:** "Speak your app into existence."
- **Sub:** "Grok plans it with you. You see it live. Ship to Vercel when it's real."
- **CTA:** "Tap to speak" (not "Try demo")

### Exit criteria
- [ ] `PUBLISH_CHECKLIST.md` Phase 1 ≥ 90% checked
- [ ] Qualitative: 3 testers say "holy shit" on first build

---

## Sprint 2 — Hosting & production API (1 week)

*Close the gap: Vercel frontend works without `localhost:3001`.*

### Current state
- ✅ Vercel edge `api/*.js` (status, xai, build, discuss, refine, image, voice-token)
- ✅ `railway.json` for Bun server
- ⚠️ Grok Realtime voice may need Railway (long-lived connections)
- ⚠️ E2B sandbox needs Railway (secrets + long jobs)

### Tasks

| # | Task | Priority | Service | DoD |
|---|------|----------|---------|-----|
| 2.1 | Vercel env audit | P0 | Vercel dashboard | `XAI_API_KEY` in Production; documented in `API_SETUP.md` |
| 2.2 | Railway deploy Bun server | P0 | Railway | `/health` 200; linked in README |
| 2.3 | `VITE_API_BASE` for Railway fallback | P0 | `vite.config.ts`, `.env.example` | Voice + sandbox routes hit Railway when needed |
| 2.4 | CORS + origin lock | P0 | `api/security.js` | Only `ideaspeak-app.vercel.app` + localhost |
| 2.5 | Rate limiting | P0 | `api/security.js`, Railway middleware | 60 req/min/IP on build endpoints |
| 2.6 | Structured logging | P1 | server + api | Request ID; failed gen logged with transcript hash |
| 2.7 | Env validation on boot | P1 | `server/index.ts` | Fail fast with clear message if misconfigured |
| 2.8 | Deploy runbook | P1 | `scripts/deploy.sh`, docs | One command: frontend + smoke |
| 2.9 | Staging environment | P2 | Vercel preview | Preview deploys use separate xAI key/budget |

### Env matrix

| Variable | Vercel | Railway | Local |
|----------|--------|---------|-------|
| `XAI_API_KEY` | ✅ (platform demo) | ✅ | `.env.local` |
| `E2B_API_KEY` | — | ✅ | `.env.local` |
| `STRIPE_SECRET_KEY` | — | ✅ | `.env.local` |
| `STRIPE_WEBHOOK_SECRET` | — | ✅ | Stripe CLI |
| `SUPABASE_URL` | — | ✅ | `.env.local` |
| `SUPABASE_SERVICE_KEY` | — | ✅ | `.env.local` |
| `VITE_API_BASE` | empty (same-origin) | Railway URL | empty (proxy) |

### Exit criteria
- [ ] Production site: Real Grok works with zero local server
- [ ] Railway health monitored; auto-restart on failure

---

## Sprint 3 — Real sandbox (E2B) (1 week)

*Close preview vs reality gap — the moat vs Lovable/Bolt.*

### Goals
- Toggle: **Instant (Sandpack)** | **Real (E2B)**
- Agent can `npm install`, run dev server, show iframe preview + terminal logs

### Tasks

| # | Task | Files | DoD |
|---|------|-------|-----|
| 3.1 | `server/sandbox-manager.ts` | new | create / write / run / preview / destroy |
| 3.2 | API routes | `server/index.ts` | `POST /api/sandbox/create`, `/sync`, `/run`, `/logs` |
| 3.3 | Client wiring | `src/lib/sandbox.ts` | Replace stubs; call Railway |
| 3.4 | UI toggle | `App.tsx` | Tab: Sandpack \| Sandbox; loading states |
| 3.5 | Auto-sync on build/refine | store hooks | Files pushed to sandbox after each gen |
| 3.6 | Graceful fallback | UI | No E2B key → hide toggle, Sandpack only |
| 3.7 | Cost guard | server | Max 1 sandbox/user; 30min TTL; kill on idle |

### E2B flow

1. User builds → server creates sandbox, writes Vite scaffold + generated files
2. `npm install` (background) → `vite --host 0.0.0.0 --port 5174`
3. `sandbox.getHost(5174)` → iframe in preview pane
4. Refine → sync changed files → HMR or restart

### Exit criteria
- [ ] Auth-heavy generated app runs in sandbox (not just Sandpack)
- [ ] Terminal shows install/build errors when agent messes up

---

## Sprint 4 — Auth, persistence & gallery (1 week)

*Users return. Founders don't lose work.*

### Goals
- Sign in → projects saved to cloud
- Resume workspace from gallery
- Free tier limits enforced server-side (not just localStorage)

### Stack recommendation
**Supabase** (already in Ship exports — dogfood it)

### Tasks

| # | Task | DoD |
|---|------|-----|
| 4.1 | Supabase project for IdeaSpeak builder | Auth + `projects` + `usage` tables |
| 4.2 | Magic link / Google auth in UI | Settings → Account |
| 4.3 | Migrate `projects.ts` local → cloud sync | Offline-first; sync on login |
| 4.4 | Project gallery UI | Thumbnail, name, last refined, resume |
| 4.5 | Shareable read-only build links | P2; public URL per project |
| 4.6 | Server usage table | Replace `billing.ts` local counters for paid users |

### Schema (minimal)

```sql
profiles (id, email, plan, stripe_customer_id)
projects (id, user_id, name, files_json, conversation_json, updated_at)
usage_daily (user_id, date, builds, ships, polish)
```

### Exit criteria
- [ ] Log in on phone → see same project on desktop
- [ ] Free tier: 3 builds/day enforced server-side

---

## Sprint 5 — Payments (Stripe) (1 week)

*Monetize convenience. See `docs/MONETIZATION.md`.*

### Pricing (confirmed)

| Plan | Price | Sell |
|------|-------|------|
| Free | $0 | Feel the magic (limits) |
| Pro | $29/mo | Unlimited build + ship + polish packs |
| Team | $79/mo | 5 seats + shared workspace |

### Tasks

| # | Task | DoD |
|---|------|-----|
| 5.1 | Stripe products + Payment Links | Pro + Team links created |
| 5.2 | Set `checkoutUrl` in `billing.ts` | Pricing panel opens real checkout |
| 5.3 | Webhook handler | `POST /api/stripe/webhook` on Railway |
| 5.4 | `checkout.session.completed` → Supabase plan | User plan = pro/team |
| 5.5 | `customer.subscription.deleted` → downgrade | Graceful limit restore |
| 5.6 | Customer portal link | Settings → Manage subscription |
| 5.7 | Remove `enableDemoPro()` in production | Dev flag only |
| 5.8 | Billing UI: usage meters | "2/3 builds today" with upgrade CTA |
| 5.9 | Receipt + branding | Stripe emails match IdeaSpeak |
| 5.10 | Legal | Terms, Privacy, refund policy pages |

### Webhook events to handle

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed` → email + grace period

### Exit criteria
- [ ] Real $29 test charge → Pro unlocked → unlimited builds
- [ ] Cancel → reverts to Free within 1 billing period

---

## Sprint 6 — Launch & growth (1 week)

*Ship the business, not just the code.*

### Tasks

| # | Task | DoD |
|---|------|-----|
| 6.1 | Landing page (or hero section) | Video: 45s full loop demo |
| 6.2 | `docs/DEMO_NOTES.md` → Loom script | Recorded and embedded |
| 6.3 | Public changelog | `/changelog` or GitHub Releases |
| 6.4 | Analytics | Plausible or PostHog: build, ship, upgrade funnel |
| 6.5 | Error tracking | Sentry on frontend + API |
| 6.6 | Status page | Better Stack or simple `/api/status` aggregate |
| 6.7 | Support | Crisp chat or email hello@ |
| 6.8 | Launch posts | X, HN Show, Product Hunt draft |
| 6.9 | Founder onboarding email | Day 0 / 3 / 7 drip (Resend) |
| 6.10 | Referral hook (optional) | "Give a friend 7 days Pro" |

### Launch checklist

- [ ] Stripe live mode (not test)
- [ ] xAI spend cap + alerts
- [ ] E2B spend cap + alerts
- [ ] Backup: export all Supabase weekly
- [ ] Incident runbook: "API down" → status page + simulator fallback

### Exit criteria
- [ ] 10 paying Pro users OR 1000 MAU with 5% upgrade intent
- [ ] NPS ≥ 40 from first 20 paid users

---

## Cross-cutting: Polish packs (ongoing)

Already built (`PolishPanel`, `polish.ts`). Harden in Sprint 1 + 5.

| Model | Role | In-app | Export |
|-------|------|--------|--------|
| Grok | Taste, voice, v1 | ✅ | `polish/prompts/grok.md` |
| Cursor | IDE implementer | Copy rules | `.cursor/rules` |
| Claude | Auth, RLS, systems | Copy prompt | `polish/prompts/claude.md` |
| GPT | Fast UI/copy variants | Copy prompt | `polish/prompts/gpt.md` |

**Sprint 5+:** Optional server-side polish (user brings keys OR platform quota for Pro).

---

## Metrics dashboard (track from Sprint 2)

| Metric | Target | Why |
|--------|--------|-----|
| Time to first preview | < 45s | Core magic |
| Build → export rate | > 25% | Monetization funnel |
| Free → Pro conversion | > 4% | Business viability |
| Export → `bun dev` success | > 95% | Ship promise |
| Refinements per project | > 2 | Stickiness |
| D7 retention (signed in) | > 30% | Product, not toy |

---

## Risk register

| Risk | Mitigation |
|------|------------|
| xAI cost blowup on Pro "unlimited" | Soft cap + fair use; queue priority not hard unlimited |
| E2B sandbox cost | TTL, 1 active sandbox/user, Pro-only |
| Stripe churn | Annual plan (-20%), polish packs lock-in |
| Generated code IP concerns | ToS: user owns output; we don't train on it |
| Simulator feels like bait-and-switch | ModeBadge always visible; honest copy |

---

## Execution order (recommended)

```
Sprint 0 (3d) → Sprint 1 (1w) → Sprint 2 (1w) → Sprint 5 (1w) → Sprint 4 (1w) → Sprint 3 (1w) → Sprint 6 (1w)
                     ↑ polish              ↑ hosting      ↑ payments    ↑ persist      ↑ sandbox      ↑ launch
```

**Why payments before sandbox?** Revenue validates before E2B spend. Sandbox is Pro differentiator once people pay for Ship.

**Parallel track:** Sprint 2 hosting + Sprint 1 polish can overlap if two builders.

---

## Definition of "world-class shipped"

- [ ] Stranger completes full loop in < 3 minutes without docs
- [ ] Pays $29 without talking to a human
- [ ] Exported app deploys to Vercel from Ship panel path
- [ ] Real Grok + optional sandbox work in production without local dev
- [ ] Cursor opens exported ZIP and agent already knows the project
- [ ] You would dogfood IdeaSpeak to build the next IdeaSpeak feature

---

## Quick commands

```bash
bun run dev:full          # local loop
bun run smoke:full        # pre-deploy gate
bun run deploy            # Vercel production
bun run verify:grok       # xAI key check
```

---

*This plan supersedes ad-hoc items in `PUBLISH_CHECKLIST.md` for ship work. Update sprint checkboxes weekly in `docs/STATUS.md`.*