# AGENTS.md — IdeaSpeak (the builder itself)

This is the IdeaSpeak xAI voice-first builder project.

Follow the principles in:
- prompts/IdeaSpeak-xAI-Agent-System-Prompt.md
- prompts/IdeaSpeak-Voice-Refiner-Prompt.md

## For any AI working here (Grok, Cursor, etc.)
- Preserve the voice-native magic + production bar.
- Exports must always ship AGENTS.md, IDEA-SPEAK-CONTEXT.md, .cursorrules + strong Grok/Cursor guidance.
- Use the exact design manifesto.
- Prefer Grok check-work for verification of generated output.
- When editing export logic (src/App.tsx + buildNextJsScaffold), keep both ZIP and GitHub paths in sync and enrich with context files.

See README-IDEASPEAK.md and the plan doc for architecture.