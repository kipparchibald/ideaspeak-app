# IdeaSpeak — Seamless Secure API Setup

**Goal:** Get every required API working from one place inside the app, with live verification, without leaving the site.

---

## Supported APIs

| API | Required? | Purpose | Where to get |
|-----|-----------|---------|--------------|
| **xAI Grok** | Yes (for Real Grok) | Chat, build, refine | [console.x.ai](https://console.x.ai) |
| **E2B** | Optional | Secure full sandbox execution | [e2b.dev](https://e2b.dev) |

---

## How It Works (One Site)

1. Open **Settings** → **API Connections**
2. Paste your xAI key
3. Click **Save & Verify**
4. The app calls `/api/status` which:
   - Prefers the **server-hosted** `XAI_API_KEY` (most secure)
   - Falls back to the client key only in local/dev
   - Pings xAI with a tiny test completion
5. You instantly see **Connected**, **Invalid**, or **Not set**

No external dashboards required after the initial key creation.

---

## Security Model

### Production (Recommended)
- Set `XAI_API_KEY` once in Vercel project env vars (Production)
- Key never leaves the server
- Client never sees the real key
- `/api/status` reports `source: "server"` + `live: true`

### Local / Personal Use
- User pastes key in Settings
- Stored only in `localStorage` (`ideaspeak_xai_key`)
- Sent via `x-ai-key` header only to your own API routes
- Never logged or forwarded elsewhere

### What We Never Do
- Store keys in a database
- Send keys to third-party analytics
- Commit keys to the repo
- Expose server keys to the browser

---

## Verification Endpoint

`GET /api/status`

Returns:
```json
{
  "live": true,
  "source": "server",
  "model": "grok-4.3",
  "message": "Grok API ready — key hosted securely on server"
}
```

Or clear error states when the key is missing/invalid.

---

## Quick Start for Users

1. Go to [console.x.ai](https://console.x.ai) → create API key
2. In IdeaSpeak → Settings → paste key → **Save & Verify**
3. Badge in header switches from **Simulator** to **Real Grok**
4. Start building

That's the entire flow.

---

*This is the permanent one-site API experience.*
