# IdeaSpeak — Publish Checklist

**Goal:** Make IdeaSpeak a polished, public-ready demo/prototype that clearly shows the voice-first xAI advantage.

**Live Demo:** https://ideaspeak-app.vercel.app  
**Last updated:** July 13, 2026

---

## Phase 1 — Demo Polish (Highest Priority)

- [x] Strong README with clear value proposition
- [x] Live Vercel deployment
- [x] PWA + mobile install instructions
- [x] Smoke tests (`bun run smoke` / `smoke:full`)
- [x] Publish checklist + demo notes
- [x] Simulator vs Real Grok distinction documented
- [ ] Landing page / hero clearly communicates "Speak → Ship" (needs visual polish)
- [ ] Settings modal: crystal-clear path for adding xAI API key + graceful fallback messaging
- [ ] Simulator vs Real Grok indicator visible in the main UI (not just docs)
- [ ] Error states and loading states feel premium
- [ ] Export (ZIP + GitHub) produces clean, runnable Next.js 15 projects every time
- [ ] One-click Vercel deploy button works in exported projects

## Phase 2 — Production Hardening

- [ ] Real E2B (or equivalent) sandbox wired for secure code execution
- [ ] Rate limiting + basic abuse protection on API routes
- [ ] Better observability / logging for failed generations
- [ ] Environment variable validation on boot
- [ ] Auth (optional for demo, required for multi-user)
- [ ] Project persistence + gallery of past builds
- [ ] Usage metering (for future paid tiers)

## Phase 3 — Differentiation & Growth

- [ ] Multi-agent "Council" mode (parallel models + synthesis)
- [ ] Self-improving prompt feedback loop
- [ ] Public gallery of impressive voice-built apps
- [ ] Shareable build links
- [ ] Browser extension fully documented
- [ ] Landing page with video demo of voice flow

---

## Quick Publish Commands

```bash
# Local full stack
bun install
bun run dev:full

# Smoke test production
bun run smoke

# Deploy
bun run deploy
```

## Environment

```env
XAI_API_KEY=your_key_here
# Optional for full sandbox
E2B_API_KEY=
```

---

## Current Score: **7.8 / 10** (Demo-ready with light polish remaining)

**Next highest leverage items (do these next):**
1. Make the landing experience instantly clear ("Speak your idea → ship a production app")
2. Surface Simulator vs Real Grok status in the main UI
3. Perfect the Settings → API key flow
4. Ensure exported projects always build cleanly on Vercel

See also: `docs/DEMO_NOTES.md` for the 30-second demo script.

*Keep this file updated as the product matures.*
