# IdeaSpeak

**Speak your idea. Ship a production-grade app. Powered by xAI.**

IdeaSpeak is the voice-first app builder that turns messy spoken ideas into beautiful, runnable Next.js projects — with taste, transparency, and export paths that actually work.

**Live demo:** [ideaspeak-app.vercel.app](https://ideaspeak-app.vercel.app)

## Why IdeaSpeak

- **Voice-native** — Talk through your idea; the Voice Refiner elevates it into a structured brief
- **xAI-powered** — Built on Grok with engineered prompts for taste, proactivity, and production quality
- **Live preview** — Sandpack preview updates as you refine by voice or text
- **Ship-ready exports** — ZIP or GitHub with Next.js 15, AGENTS.md, Supabase stubs, and Vercel deploy button
- **PWA** — Install on your phone for voice building from the home screen

## Quick Start (local)

```bash
git clone https://github.com/kipparchibald/ideaspeak-app.git
cd ideaspeak-app
bun install
bun run dev:full
```

Open http://localhost:5173 in Chrome (best voice support).

Add your xAI API key in Settings for real Grok generation. Without a key, the high-fidelity simulator still demonstrates the full flow.

## How it works

1. **Discuss & Plan** — Vet your idea with Grok (voice or text)
2. **Build** — Agent generates a multi-file React/TypeScript project with live preview
3. **Refine** — Voice or text refinements update the app in real time
4. **Export** — Download a full Next.js 15 project or push to GitHub

## The moat

Everything follows two engineered prompts in `/prompts/`:

- `IdeaSpeak-Voice-Refiner-Prompt.md`
- `IdeaSpeak-xAI-Agent-System-Prompt.md`

These drive higher-quality output than generic prompt-to-app tools — voice elevation, anti-slop design rules, proactive features, and production-from-v1 discipline.

## Continue exported projects with Grok

Exported projects include `AGENTS.md` and `IDEA-SPEAK-CONTEXT.md` for faithful continuation:

```bash
cd your-exported-app
grok
# Then: /check-work, or ask Grok to ship via GitHub/Vercel MCP tools
```

## Phone / PWA

1. Open the live demo on your phone
2. Browser menu → "Add to Home Screen"
3. Enable push alerts in Settings for build-completion notifications

## Docs

- [README-IDEASPEAK.md](./README-IDEASPEAK.md) — Full feature list and architecture
- [IDEA SPEAK_BETTER_THAN_PEERS_PLAN.md](./IDEA%20SPEAK_BETTER_THAN_PEERS_PLAN.md) — Product strategy and roadmap

## License

Private / all rights reserved (update when ready for open source).