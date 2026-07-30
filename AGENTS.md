# AGENTS.md — IdeaSpeak (the builder itself)

This is the IdeaSpeak xAI voice-first builder project.

**Separate products (never merge into this repo):**
| Product | Repo |
|---------|------|
| IdeaSpeak (this) | `ideaspeak-app` |
| SummitForge RE OS | `SummitForge-RE-OS` |
| Split Rock Construction | `split-rock-construction` |

See **`PROJECTS.md`** for the full portfolio map and agent rules.

**Do not** merge features, status docs, demos, brands, or code from SummitForge or Split Rock into IdeaSpeak. IdeaSpeak is a general voice-to-app builder — not a real-estate OS and not a construction company site.

Follow the principles in:
- prompts/IdeaSpeak-xAI-Agent-System-Prompt.md
- prompts/IdeaSpeak-Voice-Refiner-Prompt.md

## For any AI working here (Grok, Cursor, etc.)
- Work only on IdeaSpeak in this workspace.
- Preserve the voice-native magic + production bar.
- Exports must always ship AGENTS.md, IDEA-SPEAK-CONTEXT.md, .cursorrules + strong Grok/Cursor guidance.
- Use the exact design manifesto.
- Prefer Grok check-work for verification of generated output.
- When editing export logic (src/App.tsx + buildNextJsScaffold), keep both ZIP and GitHub paths in sync and enrich with context files.

See README-IDEASPEAK.md and the plan doc for architecture.

If `AGENTS.project.md` exists in this workspace, it contains the user's project instructions; follow it with the same priority as this file.
