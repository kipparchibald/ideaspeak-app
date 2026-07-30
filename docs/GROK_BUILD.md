# Grok Build on IdeaSpeak — model strategy

## Decision: best for building **and** economics

| Role | Model | $/1M in · out | Why |
|------|--------|---------------|-----|
| **Build (primary)** | **`grok-build-0.1`** | ~$1 · $2 | Purpose-built for app scaffolding; high-output JSON files cost ~**3× less** than 4.5 |
| **Build (fallback)** | `grok-4.5` | ~$2 · $6 | Only if build model errors |
| **Plan / chat / refine** | **`grok-4.5`** | ~$2 · $6 | Flagship reasoning; turns are short so absolute $ stays low |

### Why not 4.5 for every build?
xAI’s Grok Build **CLI** may default to 4.5 for interactive agent sessions. IdeaSpeak’s `/api/build` is different: one-shot **large code JSON** (8–12k output tokens). On that shape, **grok-build-0.1 wins on cost** while staying the specialist coding model.

Rough cost per full preview codegen (12k out, small in):
- `grok-build-0.1` ≈ **$0.02–0.03**
- `grok-4.5` ≈ **$0.05–0.07**

### Env overrides
```bash
XAI_CHAT_MODEL=grok-4.5
XAI_BUILD_MODEL=grok-build-0.1
XAI_BUILD_FALLBACK=grok-4.5
```

Source of truth: `api/model-strategy.js`

## API path
1. `POST /api/build`
2. Prefer `POST https://api.x.ai/v1/responses` with `grok-build-0.1`
3. Fallback: same model on chat completions, then `grok-4.5`
4. Parse JSON → Sandpack / local preview

## Client
- `generateWithLLM()` → `{ files, name, plan, model, engine, api }`
- Progress: **Grok Build · model**
- Live badge: **Real Grok · Build**

## Refs
- https://docs.x.ai/build/overview
- https://x.ai/news/grok-build-0-1
- https://x.ai/news/grok-4-5
