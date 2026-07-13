# IdeaSpeak Demo Notes

**Live:** https://ideaspeak-app.vercel.app

## How to Demo (30-second pitch)

1. Open the site (or install as PWA on phone).
2. Click the big mic and speak a real idea (e.g. "Build me a simple client portal for real estate agents that lets sellers upload documents by voice").
3. Watch the Voice Refiner turn the messy speech into a clean brief.
4. Hit Build → see multi-file React project + live Sandpack preview appear.
5. Speak a refinement ("Make the colors more premium and add a timeline view").
6. Export ZIP or push to GitHub — full Next.js 15 project ready to ship.

## Simulator vs Real Grok

| Mode | When | Behavior |
|------|------|----------|
| **Simulator** | No xAI key in Settings | High-fidelity local simulation of the full flow. Great for demos. |
| **Real Grok** | xAI API key added in Settings | Uses the full engineered prompts + Grok via backend proxy. Higher quality, real reasoning. |

The UI should always make it obvious which mode is active.

## Recommended Demo Ideas

- Voice-first real estate client portal
- Founder roadmap + task extractor
- Simple marketplace for local services
- Personal CRM with voice notes

## Known Demo Strengths

- Voice capture is excellent in Chrome
- Sandpack live preview is magical
- Export quality is production-grade
- Personality selector makes it fun

## Still Stubbed (be transparent)

- Full multi-user persistence / gallery
- Real secure sandbox execution (E2B is in deps but not fully wired)
- Billing / usage limits

---

*Keep this file updated as the product matures.*
