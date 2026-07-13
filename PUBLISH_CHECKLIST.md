# IdeaSpeak — Publish Checklist

**Goal:** Make IdeaSpeak the best "build and test in one app" experience — speak an idea, see a live preview, refine by voice, ship.

**Live Demo:** https://ideaspeak-app.vercel.app  
**Last updated:** July 13, 2026

---

## Phase 1 — Demo Polish (Highest Priority)

- [x] Strong README with clear value proposition
- [x] Live Vercel deployment
- [x] PWA + mobile install instructions
- [x] Smoke tests
- [x] Publish checklist + demo notes
- [x] Simulator vs Real Grok documented
- [x] Build & Test Loop vision documented (`docs/BUILD_AND_TEST_LOOP.md`)
- [ ] Landing page / hero clearly communicates "Speak → Live Preview → Ship"
- [ ] Settings modal: crystal-clear path for adding xAI API key + graceful fallback messaging
- [ ] Simulator vs Real Grok indicator visible in the main UI
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

- [ ] Multi-agent "Council" mode
- [ ] Self-improving prompt feedback loop
- [ ] Public gallery of voice-built apps
- [ ] Shareable build links
- [ ] Full-screen live preview / "Test mode"
- [ ] Landing page with video demo of the full loop

---

## Current Score: **8.0 / 10** (Demo-ready, loop is the product)

**Next highest leverage items:**
1. Make the landing experience scream "Speak → Live Preview"
2. Surface Simulator vs Real Grok status in the main UI
3. Perfect the Settings → API key flow
4. Ensure exported projects always build cleanly

See also:
- `docs/DEMO_NOTES.md` — 30-second demo script
- `docs/BUILD_AND_TEST_LOOP.md` — The core product vision

*Keep this file updated as the product matures.*
