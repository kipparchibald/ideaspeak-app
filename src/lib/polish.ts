/**
 * Multi-model polish — IdeaSpeak builds v1; specialists refine.
 * Cursor (IDE), Grok (taste + check-work), Claude (systems), GPT (speed).
 */

export type PolishModelId = 'cursor' | 'grok' | 'claude' | 'gpt'

export interface PolishModel {
  id: PolishModelId
  name: string
  role: string
  strength: string
  why: string
  color: string
}

export const POLISH_MODELS: PolishModel[] = [
  {
    id: 'cursor',
    name: 'Cursor',
    role: 'IDE implementer',
    strength: 'Multi-file edits, refactors, tight loops in your repo',
    why: 'Best place to polish after export — .cursorrules load automatically',
    color: '#00ff88',
  },
  {
    id: 'grok',
    name: 'Grok',
    role: 'Taste + verify',
    strength: 'Design bar, honesty, /check-work style verification',
    why: 'Keeps IdeaSpeak’s production + voice-native standards',
    color: '#38bdf8',
  },
  {
    id: 'claude',
    name: 'Claude',
    role: 'Systems architect',
    strength: 'Auth, RLS, edge cases, careful refactors',
    why: 'Great second pass on Supabase security and structure',
    color: '#d4a574',
  },
  {
    id: 'gpt',
    name: 'GPT',
    role: 'Fast iterator',
    strength: 'Quick UI variants, copy, component rewrites',
    why: 'Useful for high-volume polish when speed matters',
    color: '#a78bfa',
  },
]

export interface PolishContext {
  appName: string
  idea: string
  plan?: string
  fileList: string[]
}

export function buildPolishPrompt(model: PolishModelId, ctx: PolishContext): string {
  const base = `You are polishing an app built with IdeaSpeak (voice → production).

App: ${ctx.appName}
Original idea: ${ctx.idea || '(from session)'}
${ctx.plan ? `Build notes: ${ctx.plan}` : ''}
Key files: ${ctx.fileList.slice(0, 24).join(', ') || 'app/page.tsx, lib/supabase/*'}

Rules:
- Preserve the premium dark design system (#0a0a0f, accent #00ff88) unless asked to rebrand.
- Prefer vertical slices that work (auth, empty/loading/error states).
- Never invent fake "pushed to git" success — only change files that exist.
- Ship production quality, not demos.
`

  switch (model) {
    case 'cursor':
      return `${base}

You are in Cursor on this repo. Follow AGENTS.md and .cursorrules.

Tasks (do in order):
1. Run the app mentally — fix anything that would crash on first load.
2. Tighten the primary user loop (one screen that delights).
3. Wire or harden Supabase client usage if env is present; keep offline-safe fallbacks.
4. Mobile pass: spacing, tap targets, overflow.
5. Summarize diffs in 5 bullets.

Start by reading AGENTS.md + app/page.tsx, then implement.`

    case 'grok':
      return `${base}

You are Grok with IdeaSpeak taste (Linear / Stripe / Arc).

Do a ruthless polish pass:
1. What looks "AI slop"? Fix it.
2. What's missing for a real first user? Add only if high leverage.
3. Suggest / implement one wow micro-interaction.
4. If using Grok CLI: run /check-work after edits.

Respond with: (a) top 3 issues (b) patches or precise file edits (c) remaining risks.`

    case 'claude':
      return `${base}

You are Claude focused on systems quality.

Priorities:
1. Supabase RLS + auth edge cases
2. Type safety and clear module boundaries
3. Error handling and loading states
4. Env var safety (no secrets in client beyond anon key)

Produce a short architecture note + concrete file changes.`

    case 'gpt':
      return `${base}

You are a fast product engineer.

Deliver:
1. Cleaner hero / empty state copy
2. One component refactor for clarity
3. Optional: 2 alternate UI density options described, implement the best

Keep changes small and mergeable.`

    default:
      return base
  }
}

/** Files to embed in production ZIP for multi-model handoff */
export function polishExportFiles(ctx: PolishContext): Record<string, string> {
  const prompts = Object.fromEntries(
    POLISH_MODELS.map((m) => [
      `polish/prompts/${m.id}.md`,
      `# Polish with ${m.name}\n\n${buildPolishPrompt(m.id, ctx)}\n`,
    ]),
  )

  return {
    ...prompts,
    'polish/README.md': `# Multi-model polish

IdeaSpeak got you a live v1. Use specialists for polish — each model has a different superpower.

| Model | Use for |
|-------|---------|
| **Cursor** | Day-to-day implementation in the IDE |
| **Grok** | Taste, honesty, verification (/check-work) |
| **Claude** | Auth, RLS, careful systems work |
| **GPT** | Fast copy/UI iteration |

## Cursor

1. Open this folder in Cursor
2. \`.cursorrules\` and \`AGENTS.md\` load automatically
3. Paste \`polish/prompts/cursor.md\` into Agent chat
4. Or: "Follow AGENTS.md. Polish the primary loop and mobile layout."

## Grok CLI

\`\`\`bash
cd ${ctx.appName ? slugish(ctx.appName) : 'your-app'}
grok
# paste polish/prompts/grok.md
# then /check-work
\`\`\`

## Claude / GPT

Paste the matching file from \`polish/prompts/\` into your chat with the repo as context (or Claude Code / Codex).

## Why multi-model?

No single model wins every pass. IdeaSpeak + Grok for v1 magic; Cursor for surgery; Claude for hard backend; GPT for speed. That's the Pro convenience stack.
`,
    '.cursor/rules/ideaspeak.md': `---
description: IdeaSpeak export polish rules
globs: **/*.{ts,tsx,css,md}
---

# IdeaSpeak project

- Follow AGENTS.md and IDEA-SPEAK-CONTEXT.md
- Dark-first UI, accent #00ff88 unless rebranded
- Supabase via lib/supabase/* only
- Vertical slices; empty/loading/error states required
- After major edits, ensure \`bun run build\` (or npm run build) would pass
`,
  }
}

function slugish(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app'
}

export function cursorOpenHint(appSlug: string): string {
  return `cursor .  # from unzipped ${appSlug}/ folder — or File → Open Folder in Cursor`
}
