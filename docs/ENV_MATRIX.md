# IdeaSpeak — Environment Variable Matrix

**Architecture:** Vercel (frontend + edge API) · Railway (Bun server, long-lived routes) · Local (Vite proxy → Bun)  
**Source of truth for ship work:** `docs/SHIP_SPRINT.md`  
**Last updated:** July 14, 2026

---

## Quick reference

| Variable | Local | Vercel | Railway | Required? | Notes |
|----------|-------|--------|---------|-----------|-------|
| `XAI_API_KEY` | `.env.local` | Production env | ✅ | **Yes** (Real Grok) | Platform demo key; never expose to browser |
| `XAI_CHAT_MODEL` | optional | optional | optional | No | Default `grok-3` |
| `XAI_BUILD_MODEL` | optional | optional | optional | No | Default `grok-build-0.1` |
| `VITE_API_BASE` | empty | empty | — | No | Empty = same-origin `/api/*` on Vercel; set to Railway URL when edge can't handle a route |
| `PORT` | `3001` (default) | — | Railway sets | No | Bun server listen port |
| `E2B_API_KEY` | `.env.local` | — | ✅ | No | Real sandbox (Sprint 3); stub today |
| `STRIPE_SECRET_KEY` | `.env.local` | — | ✅ | No | Payments (Sprint 5) |
| `STRIPE_WEBHOOK_SECRET` | Stripe CLI | — | ✅ | No | Webhook signature verification |
| `SUPABASE_URL` | `.env.local` | — | ✅ | No | Auth + persistence (Sprint 4) |
| `SUPABASE_SERVICE_KEY` | `.env.local` | — | ✅ | No | Server-side Supabase admin |
| `VERCEL_ENV` | — | auto | — | — | Set by Vercel (`production`, `preview`, `development`) |

---

## Local development

**Files:** copy `.env.example` → `.env` and/or `.env.local` (see `.env.local.example` for xAI key only).

```bash
bun run dev:full   # Vite :5173 proxies /api → Bun :3001
```

| Variable | Where to set | Purpose |
|----------|--------------|---------|
| `XAI_API_KEY` | `.env.local` | Server-hosted Grok; Settings panel can also use `localStorage` for personal keys |
| `XAI_CHAT_MODEL` | `.env.local` | Override chat model |
| `XAI_BUILD_MODEL` | `.env.local` | Override build model |
| `E2B_API_KEY` | `.env.local` or Settings | Future real sandbox |
| `PORT` | shell / `.env.local` | Bun server port (default `3001`) |
| `VITE_API_BASE` | leave empty | Vite dev proxy handles `/api` |

**Rule:** User xAI keys in Settings stay in `localStorage` and are sent via `X-AI-Key` header only to your own API. Server `XAI_API_KEY` is preferred when set.

---

## Vercel (frontend + edge API)

**Project:** `ideaspeak-app` → https://ideaspeak-app.vercel.app  
**Routes:** `api/*.js` serverless functions (`status`, `xai`, `build`, `discuss`, `refine`, `image`, `tts`, `voice-token`, …)

| Variable | Environment | Required | Purpose |
|----------|-------------|----------|---------|
| `XAI_API_KEY` | **Production** | Yes (hosted demo) | Secure Grok proxy; `/api/status` reports `source: "server"` |
| `XAI_CHAT_MODEL` | Production / Preview | No | Chat completions model |
| `XAI_BUILD_MODEL` | Production / Preview | No | Build agent model |
| `VITE_API_BASE` | Production | No | Leave **empty** — same-origin edge API |
| `VERCEL_ENV` | auto | — | `api/xai.js` restricts client keys in production |

**Not on Vercel (by design):** `E2B_API_KEY`, `STRIPE_*`, `SUPABASE_*` — these belong on Railway when those sprints ship.

**Deploy:** `bun run deploy` or Vercel Git integration.

---

## Railway (Bun server)

**Config:** `railway.json`, `nixpacks.toml`  
**Start:** `bun run server/index.ts`  
**Health:** `GET /health`

Use Railway when Vercel edge limits apply:

- Grok Realtime voice (long-lived WebSocket)
- E2B sandbox jobs (secrets + long runs)
- Stripe webhooks + Supabase service operations

| Variable | Required | Purpose |
|----------|----------|---------|
| `XAI_API_KEY` | Yes | Same Grok proxy as Vercel |
| `PORT` | auto | Railway injects; defaults to `3001` locally |
| `E2B_API_KEY` | Sprint 3+ | Sandbox create/run/logs |
| `STRIPE_SECRET_KEY` | Sprint 5+ | Checkout + Customer Portal |
| `STRIPE_WEBHOOK_SECRET` | Sprint 5+ | `POST /api/stripe/webhook` |
| `SUPABASE_URL` | Sprint 4+ | Project URL |
| `SUPABASE_SERVICE_KEY` | Sprint 4+ | Server writes (projects, usage, entitlements) |

**Frontend wiring:** set `VITE_API_BASE` to the Railway public URL at **build time** when a route must hit Railway instead of Vercel edge (voice tokens, sandbox). Production today uses Vercel edge for most `/api/*` calls.

---

## CI / scripts (not runtime app config)

| Variable | Used by | Purpose |
|----------|---------|---------|
| `BASE_URL` | `scripts/smoke-e2e.mjs`, `verify-grok.mjs` | Target URL (default production) |
| `REQUIRE_LIVE` | smoke script | Fail CI if Grok not live (`--require-live`) |
| `IDEASPEAK_API` | `src/lib/xai.ts` (tests) | Override API base in unit-style smoke |

**CI workflow (`.github/workflows/ci.yml`):** no secrets required — runs `bun run build` then `bun run smoke:local` against preview `:5173` + Bun `:3001` (simulator mode).

---

## Security model

1. **Production:** `XAI_API_KEY` only on server (Vercel env or Railway). Browser never receives the platform key.
2. **CORS:** `api/security.js` allows `ideaspeak-app.vercel.app`, localhost, and IdeaSpeak Vercel previews only.
3. **Personal keys:** localStorage + `X-AI-Key` header; ignored in Vercel production for xAI proxy.
4. **Never commit:** `.env`, `.env.local`, `.env.production.local` (gitignored).

---

## Setup checklist

### Minimum (demo works)
- [ ] `XAI_API_KEY` on Vercel Production
- [ ] Redeploy after env change
- [ ] `bun run verify:grok` or `GET /api/status` → `live: true`

### Full local loop
- [ ] `bun run setup:grok` or paste key in `.env.local`
- [ ] `bun run dev:full`
- [ ] Settings → Save & Verify → ModeBadge shows **Real Grok**

### Pre-ship (future sprints)
- [ ] Railway deployed with `/health` 200
- [ ] Supabase project + service key on Railway
- [ ] Stripe live keys + webhook on Railway
- [ ] E2B key on Railway for Pro sandbox tier

---

## Related docs

- `docs/API_SETUP.md` — user-facing API key flow
- `docs/SHIP_SPRINT.md` — sprint env tasks (2.1, 2.3, 2.7)
- `.env.example` / `.env.local.example` — copy templates