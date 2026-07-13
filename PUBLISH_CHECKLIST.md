# IdeaSpeak — Publish Checklist

**Goal:** Make IdeaSpeak a polished, public-ready demo/prototype that clearly shows the voice-first xAI advantage.

**Live Demo:** https://ideaspeak-app.vercel.app

---

## Phase 1 — Demo Polish (Do First)

- [x] Strong README with clear value proposition
- [x] Live Vercel deployment
- [x] PWA + mobile install instructions
- [x] Smoke tests (`bun run smoke` / `smoke:full`)
- [ ] Landing page / hero clearly communicates "Speak → Ship"
- [ ] Settings modal: clear path for adding xAI API key + graceful fallback messaging
- [ ] Simulator vs Real Grok distinction is obvious to users
- [ ] Error states and loading states feel premium
- [ ] Export (ZIP + GitHub) produces clean, runnable Next.js 15 projects
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

## Current Score: 7.5 / 10 (Demo-ready with light polish)

**Next highest leverage items:**
1. Make the landing experience instantly clear
2. Perfect the "no key → simulator / with key → real Grok" messaging
3. Ensure exported projects always build cleanly
4. Wire real sandbox for true production feel

*Last updated: July 13, 2026*
