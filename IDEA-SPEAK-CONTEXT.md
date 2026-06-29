# IDEA-SPEAK-CONTEXT (for the IdeaSpeak builder itself)

This is the source of the IdeaSpeak voice-to-production xAI app builder.

## Key files
- prompts/IdeaSpeak-Voice-Refiner-Prompt.md
- prompts/IdeaSpeak-xAI-Agent-System-Prompt.md
- src/App.tsx (core UI, generation, export logic in exportProject + buildNextJsScaffold)
- src/lib/xai.ts + server/index.ts (real LLM paths)
- extension/ (Lovable bridge)

## When working on this codebase (Grok, Cursor, etc.)
- Always keep the two export paths (ZIP in exportProject + scaffold in buildNextJsScaffold) producing the integration files (AGENTS.md, IDEA-SPEAK-CONTEXT.md, .cursorrules, .github CI + Grok shipping notes).
- Any change to generated apps must carry forward the Grok /check-work recommendation and Cursor rules.
- Use imagine skill guidance for any new image/asset features.
- Maintain the high bar from the agent prompt: voice magic, taste, production.

Generated projects should be better than what Lovable/Cursor alone produce on voice input.

See IDEA SPEAK_BETTER_THAN_PEERS_PLAN.md for history.