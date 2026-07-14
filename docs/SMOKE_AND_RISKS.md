# Smoke tests, failure points & vulnerabilities

**Scripts:** `scripts/smoke-e2e.mjs`, `scripts/smoke-helpers.mjs`  
**Artifacts on failure:** `.smoke-artifacts/` (screenshot + button list + `#root` text)

---

## Running smoke

| Command | Target | Notes |
|---------|--------|-------|
| `bun run smoke` | Production Vercel | API + UI; Grok live optional |
| `bun run smoke:local` | localhost:5173 + :3001 | CI default |
| `bun run smoke:full` | + `/api/build` | Slow; burns tokens |
| `REQUIRE_LIVE=1 bun run smoke` | Fail if Grok down | Post-deploy gate |
| `--no-security` | Skip CORS / leak probes | Faster local |
| `--retries=3` | UI retry attempts | Flaky network |

---

## What smoke covers

### API
- `/api/status` JSON shape + `live` flag
- Live Grok discuss (voice + text) when key present
- Live refine → parsed brief
- Optional build ( `--build` )

### Security probes
- **Blocked origin** → `403` on `/api/discuss` with `Origin: https://evil-attacker.example`
- **No secret leak** in status body (xAI / Stripe patterns)
- **Rate-limit headers** on discuss (`X-RateLimit-*`)

### Unit (deterministic)
- Native scaffold generation (no external UI libs in Sandpack output)
- Discuss **simulator fallback** with **mocked fetch** (not affected by local server key)
- Production ship ZIP scaffold completeness

### UI (single browser session)
1. App ready (`#root`, Plan mode, chips **or** textarea)
2. Plan message via **chip or textarea fallback** (never hangs on one selector)
3. Assistant reply detected (poll, not fixed sleep)
4. Build via **Build live preview** or `build it` textarea
5. Preview via Sandpack iframe **or** chrome signals (60–90s timeout)
6. Ship / Polish chrome present

**Retries:** UI flow retries twice by default; saves PNG + DOM dump on final failure.

---

## Known failure points (flaky → fixed)

| Failure | Cause | Mitigation |
|---------|-------|------------|
| Plan chip timeout | Chips only when `userTurns===0` && `voiceStatus==='idle'` | `waitForAppReady` + textarea fallback |
| Chip label drift | Copy changes on `DISCUSS_CHIPS` | Multiple regex patterns in `PLAN_CHIP_PATTERNS` |
| Build before reply | Grok slow on production | `waitForAssistantSignal` polling |
| Sandpack iframe slow | Lazy chunk + compile | 60–90s poll; chrome fallback |
| Deploy mid-test | Old bundle on CDN | Retries + longer ready wait |
| Unit test false live | Local server key while testing simulator | Mock `fetch` for simulator test |
| CI no Grok key | discuss 401 | Live API steps marked optional unless `REQUIRE_LIVE` |

---

## Vulnerability & risk register

### High — address before scale

| Risk | Impact | Current state | Mitigation |
|------|--------|---------------|------------|
| **Platform xAI key on Vercel** | Token cost / abuse if origin bypass | Server key in prod; CORS lock | Rate limits 60/min/IP; monitor spend; add auth for API |
| **No user auth on API** | Anyone can burn Grok quota via allowed origins | CORS only | Sprint 4 Supabase + server entitlements |
| **In-memory rate limits** | Per-instance; resets on cold start | Vercel serverless | Redis / Upstash for distributed limits |
| **Stripe webhooks in-memory** | Entitlements lost on restart | `server/stripe.ts` stub | Persist to Supabase `profiles.plan` |
| **Client-side billing gates** | `billing.ts` localStorage bypass | Demo metering | Server-side usage table (Sprint 4) |

### Medium

| Risk | Impact | Mitigation |
|------|--------|------------|
| **E2B sandbox cost** | Unbounded VMs | TTL 30min; Pro-only; `E2B_API_KEY` server-only |
| **Discuss prompt injection** | User content in system context | Prompt discipline; output validation |
| **Exported apps run user code** | Sandpack / E2B XSS surface | Sandpack sandbox attrs; E2B isolation |
| **GitHub token in localStorage** | XSS exfiltration | Settings warning; short-lived tokens |
| **Preview deploy CORS `*ideaspeak*.vercel.app`** | Broad preview allowance | Acceptable for previews; tighten if needed |

### Low / accepted for demo

| Risk | Notes |
|------|-------|
| Simulator vs Real confusion | ModeBadge + copy |
| PWA push without VAPID | Demo logs only |
| `tsc` not in CI if build passes vite only | CI runs full `bun run build` |

---

## Security model (API)

```
Browser → Vercel edge api/*
          ├─ rejectBlockedOrigin (403)
          ├─ rejectRateLimited (429)
          └─ getApiKey()
               production: XAI_API_KEY only (ignores browser key)
               local: X-AI-Key header || .env
```

**Smoke validates:** evil origin blocked, status doesn't echo secrets.

---

## CI integration

`.github/workflows/ci.yml`:
1. `bun run build`
2. Start `server` + `preview` on 5173
3. `bun run smoke:local`

**Recommended production deploy gate:**
```bash
bun run deploy && REQUIRE_LIVE=1 bun run smoke
```

---

## When smoke fails — triage

1. Check `.smoke-artifacts/` for screenshot + button list
2. If **API only** fails → Vercel env `XAI_API_KEY`, xAI status page
3. If **UI only** fails → redeploy? chip copy change? run `bun run smoke:local` to isolate
4. If **Security** fails → `api/security.js` origin list drift
5. If **429** → rate limit during parallel CI; stagger or raise limit for CI IP

---

*Update this doc when adding routes, changing DISCUSS_CHIPS, or moving rate limits to Redis.*