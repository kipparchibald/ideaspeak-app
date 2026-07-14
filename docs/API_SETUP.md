# IdeaSpeak — API Setup (Local, Vercel, Railway)

**Goal:** One secure API surface — Real Grok in production, verified from Settings, keys never in the browser.

---

## Supported APIs

| API | Required? | Purpose | Where to get |
|-----|-----------|---------|--------------|
| **xAI Grok** | Yes (Real Grok) | Chat, build, refine, voice | [console.x.ai](https://console.x.ai) |
| **E2B** | Optional (Sprint 3) | Secure full sandbox execution | [e2b.dev](https://e2b.dev) |
| **Stripe** | Optional | Payments / Ship tier | [stripe.com](https://stripe.com) |
| **Supabase** | Optional | Projects / auth persistence | [supabase.com](https://supabase.com) |

---

## Environment matrix

| Variable | Vercel Production | Railway | Local (`.env.local`) |
|----------|-------------------|---------|----------------------|
| `XAI_API_KEY` | ✅ Required | ✅ Required | ✅ or Settings UI |
| `E2B_API_KEY` | — | ✅ When sandbox live | Optional |
| `STRIPE_SECRET_KEY` | — | ✅ When billing live | Optional |
| `STRIPE_WEBHOOK_SECRET` | — | ✅ Stripe CLI / dashboard | `stripe listen` |
| `SUPABASE_URL` | — | ✅ When persistence live | Optional |
| `SUPABASE_SERVICE_KEY` | — | ✅ Service role key | Optional |
| `VITE_API_BASE` | Empty (same-origin) | — | Empty (Vite proxy) |
| `PORT` | — | `3001` (Railway default) | `3001` |

Copy `.env.example` → `.env.local` for local development.

---

## Production setup — Vercel (frontend + edge API)

### 1. Deploy frontend

1. Connect repo to [Vercel](https://vercel.com).
2. Framework preset: **Vite**.
3. Production domain: `https://ideaspeak-app.vercel.app` (or your project URL).

### 2. Set environment variables

**Vercel → Project → Settings → Environment Variables → Production**

| Variable | Value |
|----------|-------|
| `XAI_API_KEY` | Your xAI key from [console.x.ai](https://console.x.ai) |
| `VITE_API_BASE` | Leave **empty** (same-origin `/api/*` routes) |

Optional model overrides: `XAI_CHAT_MODEL`, `XAI_BUILD_MODEL`.

### 3. What runs on Vercel

| Route | Runtime | Notes |
|-------|---------|-------|
| `/api/status` | Edge | Key verification |
| `/api/discuss` | Edge | Plan chat |
| `/api/refine` | Edge | Voice → brief |
| `/api/build` | Node (120s) | Production build gen |
| `/api/voice-token` | Edge | Grok voice ephemeral token |
| Static SPA | CDN | `index.html` + assets |

### 4. Security on Vercel

- **CORS / origin lock** (`api/security.js`): only `ideaspeak-app.vercel.app`, IdeaSpeak `*.vercel.app` previews, and localhost.
- **Rate limiting**: 60 POST requests/min/IP on `/api/build`, `/api/discuss`, `/api/refine`.
- **Production keys**: `XAI_API_KEY` is server-only; browser `X-AI-Key` header is ignored in production.

### 5. Verify

1. Open **Settings → API Connections**.
2. Click **Save & Verify** (no key paste needed when server key is set).
3. Badge should show **Real Grok** with `source: "server"`.

Or: `GET https://ideaspeak-app.vercel.app/api/status`

```json
{
  "live": true,
  "source": "server",
  "model": "grok-3",
  "message": "Grok API ready — key hosted securely on server"
}
```

---

## Production setup — Railway (Bun backend)

Use Railway for long-lived connections (Grok Voice realtime) and future E2B/Stripe/Supabase jobs.

### 1. Create Railway service

1. New project → **Deploy from GitHub** (same repo).
2. Railway reads `railway.json`:
   - Start: `bun run server/index.ts`
   - Health: `GET /health`

### 2. Set environment variables

**Railway → Service → Variables**

| Variable | Required | Notes |
|----------|----------|-------|
| `XAI_API_KEY` | ✅ | Server fails fast on boot if missing in production |
| `PORT` | Auto | Railway injects `PORT`; default `3001` locally |
| `E2B_API_KEY` | Later | Sprint 3 sandbox |
| `STRIPE_SECRET_KEY` | Later | Billing webhooks |
| `STRIPE_WEBHOOK_SECRET` | Later | Stripe signature verify |
| `SUPABASE_URL` | Later | Persistence |
| `SUPABASE_SERVICE_KEY` | Later | Service role |

### 3. Boot validation

On start, the Bun server:

- **Exits with a clear error** if `XAI_API_KEY` is missing in production.
- **Logs feature flags**: xAI, E2B (placeholder), Stripe, Supabase.

Example boot log:

```
IdeaSpeak feature flags:
  xAI Grok:     ✅ enabled
  E2B sandbox:  ⏳ placeholder — set E2B_API_KEY (Sprint 3)
  Stripe:       — not configured (optional)
  Supabase:     — not configured (optional)
IdeaSpeak backend on http://localhost:3001
```

### 4. Point frontend at Railway (when needed)

For routes that need the Bun server (voice token, `/api/xai`, long jobs):

**Vercel → Environment Variables**

| Variable | Value |
|----------|-------|
| `VITE_API_BASE` | `https://your-service.up.railway.app` |

Rebuild and redeploy Vercel after changing `VITE_API_BASE`.

### 5. Security on Railway

Same `api/security.js` middleware:

- Origin lock (Vercel app + previews + localhost)
- Rate limit 60 req/min/IP on `/api/build`, `/api/discuss`, `/api/refine`, `/api/xai`

### 6. Verify Railway

```bash
curl https://your-service.up.railway.app/health
# {"status":"ok","time":"..."}
```

---

## Local development

```bash
cp .env.example .env.local
# Add XAI_API_KEY=...

bun run dev:full   # Vite :5173 + Bun :3001
```

- Vite proxies `/api/*` → `http://localhost:3001`.
- Settings UI key (`localStorage`) works as fallback when server key is unset.
- CORS allows `localhost:5173` and `localhost:3001`.

Smoke test:

```bash
bun run smoke:local:live
```

---

## Security model

### Production (recommended)

- `XAI_API_KEY` only on server (Vercel + Railway env vars).
- Client never receives the real key.
- `/api/status` reports `source: "server"` when live.

### Local / personal use

- Paste key in **Settings** → stored in `localStorage` (`ideaspeak_xai_key`).
- Sent via `X-AI-Key` header only to your own API routes.
- Never logged or forwarded elsewhere.

### What we never do

- Store keys in a database
- Send keys to third-party analytics
- Commit keys to the repo
- Expose server keys to the browser

---

## Rate limiting

Expensive xAI endpoints are capped at **60 requests per minute per IP**:

- `/api/build`
- `/api/discuss`
- `/api/refine`
- `/api/xai` (Railway only today)

Response when exceeded: `429` with `Retry-After` header.

---

## Verification endpoint

`GET /api/status`

Returns live/error states for the Grok connection. See examples above.

---

## Quick start for users

1. Go to [console.x.ai](https://console.x.ai) → create API key.
2. In IdeaSpeak → **Settings** → paste key → **Save & Verify** (or rely on hosted key in production).
3. Badge switches from **Simulator** to **Real Grok**.
4. Start building.

---

*One-site API experience — Vercel for the app, Railway for long-running backend when needed.*