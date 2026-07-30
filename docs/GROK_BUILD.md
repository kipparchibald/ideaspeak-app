# Grok Build on IdeaSpeak

IdeaSpeak uses **xAI Grok Build** for production preview generation.

## Dual-model stack

| Role | Model | Used for |
|------|--------|----------|
| **Chat / plan** | **Grok 4.5** | Voice co-founder, discuss, refine, vision notes |
| **Build** | **grok-build-0.1** | Live Sandpack preview file generation |
| **Build fallback** | **Grok 4.5** | If `grok-build-0.1` is unavailable |

xAI positions Grok 4.5 as the flagship for code *and* everything else; Grok Build 0.1 is the specialized agentic coding model that powers the Grok Build CLI. IdeaSpeak uses both: 4.5 for thinking with you, Build for generating the app.

## Model
| Env | Default | Role |
|-----|---------|------|
| `XAI_BUILD_MODEL` | `grok-build-0.1` | Primary coding model (Grok Build CLI class) |
| `XAI_BUILD_FALLBACK` | `grok-4.5` | Fallback if build model unavailable |
| `XAI_CHAT_MODEL` | `grok-4.5` | Plan / discuss / refine |

## API path
1. `POST /api/build` (Vercel Node 120s or Railway Bun)
2. Prefer `POST https://api.x.ai/v1/responses` with `instructions` + `input`
3. Fallback: `POST /v1/chat/completions` with same model
4. Parse JSON file map → Sandpack / local preview

## Client
- `generateWithLLM()` returns `{ files, name, plan, model, engine, api }`
- Build progress overlay shows **Grok Build · model · api**
- Mode badge: **Real Grok · Build** when live

## Docs
- https://docs.x.ai/build/overview
- https://x.ai/news/grok-build-0-1
