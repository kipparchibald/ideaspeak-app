# Build & Test in One App — The IdeaSpeak Loop

**Core product promise:**

> Speak or type an idea → Grok builds a real multi-file app → Live preview appears instantly → Refine by voice or text → Export when ready.

This is the loop we are optimizing for. No separate terminal, no Cursor required for the core experience.

---

## The Ideal Loop (What We're Building Toward)

1. **Capture** — Voice or text idea
2. **Refine** — Voice Refiner turns messy speech into a clean product brief
3. **Build** — Agent generates multi-file React/TypeScript project
4. **Preview** — Sandpack live preview runs the app immediately (left/right split or overlay)
5. **Iterate** — Speak or type refinements; files update; preview hot-reloads
6. **Ship** — One-click ZIP / GitHub / Vercel export

Everything happens inside the same browser tab (or PWA).

---

## Current Implementation Status

| Step | Status | Notes |
|------|--------|-------|
| Voice / text capture | Strong | Web Speech API + good UI |
| Voice Refiner | Strong | Engineered prompt |
| Multi-file generation | Strong | Sandpack files + rich templates |
| Live preview (Sandpack) | Strong | Instant updates on refine |
| Build progress overlay | Good | Shows agent thinking |
| Refine → hot update | Good | Works via agent |
| Export (ZIP / GitHub) | Good | Production-oriented |
| Real secure sandbox | Partial | E2B in deps, not fully wired |
| Simulator vs Real Grok | Documented | Needs stronger in-UI indicator |

---

## Why This Matters

Most AI app builders force you to:
- Copy code into Cursor / VS Code
- Run terminal commands
- Switch contexts constantly

IdeaSpeak's goal is the opposite:

**Stay in the conversation. See the running app. Keep talking.**

This is the product you described: "build and then test in one app."

---

## Next Improvements (Priority Order)

1. **Stronger live preview presence** — Make the running app feel like the primary output, not a secondary panel.
2. **Clear mode indicator** — Always show whether Real Grok or Simulator is active.
3. **Faster refine feedback** — Reduce time between voice refinement and preview update.
4. **Real sandbox option** — When E2B is connected, offer "Run in secure sandbox" for fuller fidelity.
5. **One-click "Open in new tab"** for the live preview (full-screen test mode).

---

## How Grok Helps This Loop

- I push improvements directly to the repo.
- You open the live demo or local `bun run dev:full`.
- You test the full speak → preview → refine flow.
- You tell me what still feels slow or broken.
- I fix and push again.

No terminal coding required for most product work.

---

*This document is the north star for the "build and test in one app" vision.*
