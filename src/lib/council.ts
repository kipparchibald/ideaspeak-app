/**
 * Council Ship — multi-model launch review before you go live.
 * Grok (taste), Claude (systems), Cursor (implementation), GPT (copy/UI).
 * Heuristic report today; prompt templates ship in polish/ for real model runs.
 */

import type { ShipPreferences } from './ship'
import { shipReadinessScore } from './ship'

export type CouncilReviewerId = 'grok' | 'claude' | 'cursor' | 'gpt'

export interface CouncilReviewer {
  id: CouncilReviewerId
  name: string
  role: string
  focus: string
  color: string
}

export const COUNCIL_REVIEWERS: CouncilReviewer[] = [
  {
    id: 'grok',
    name: 'Grok',
    role: 'Taste + verify',
    focus: 'Design bar, honesty, first-user delight',
    color: '#38bdf8',
  },
  {
    id: 'claude',
    name: 'Claude',
    role: 'Systems architect',
    focus: 'Auth, RLS, edge cases, env safety',
    color: '#d4a574',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    role: 'IDE implementer',
    focus: 'File structure, buildability, mobile pass',
    color: '#00ff88',
  },
  {
    id: 'gpt',
    name: 'GPT',
    role: 'Fast iterator',
    focus: 'Copy, empty states, UI clarity',
    color: '#a78bfa',
  },
]

export interface CouncilContext {
  appName: string
  /** Sandpack paths → source, or a flat file list */
  files: Record<string, string> | string[]
  transcript: string
  shipPrefs: ShipPreferences
}

export interface CouncilReviewerResult {
  id: CouncilReviewerId
  findings: string[]
  pass: boolean
}

export interface CouncilReport {
  score: number
  reviewers: CouncilReviewerResult[]
  topActions: string[]
}

type FileMap = Record<string, string>

function normalizeFiles(files: CouncilContext['files']): FileMap {
  if (Array.isArray(files)) {
    return Object.fromEntries(files.map((p) => [p, '']))
  }
  return files
}

function allContent(map: FileMap): string {
  return Object.entries(map)
    .map(([p, c]) => `${p}\n${c}`)
    .join('\n')
}

function hasPath(map: FileMap, ...needles: string[]): boolean {
  const paths = Object.keys(map).map((p) => p.toLowerCase())
  return needles.some((n) => paths.some((p) => p.includes(n.toLowerCase())))
}

function contentMatches(map: FileMap, re: RegExp): boolean {
  return re.test(allContent(map))
}

function lineCount(map: FileMap, pathPart: string): number {
  const entry = Object.entries(map).find(([p]) => p.toLowerCase().includes(pathPart.toLowerCase()))
  if (!entry) return 0
  return entry[1].split('\n').length
}

function reviewGrok(ctx: CouncilContext, map: FileMap): CouncilReviewerResult {
  const findings: string[] = []
  const content = allContent(map)

  if (/lorem ipsum|placeholder|todo fixme|your app here|coming soon/i.test(content)) {
    findings.push('Placeholder or TODO copy still visible — swap for real product language.')
  }
  if (!/framer-motion|animate-|transition-|motion\./i.test(content) && Object.keys(map).length > 2) {
    findings.push('UI feels static — add one purposeful motion on the primary action or hero.')
  }
  if (
    !ctx.transcript?.trim() ||
    ctx.transcript.length < 24
  ) {
    findings.push('Thin product brief — re-state the wow moment and primary user in one sentence.')
  }
  if (/#[0-9a-f]{3,8}/i.test(content) && !/#0a0a0f|#00ff88|canvas|accent/i.test(content)) {
    findings.push('Color palette may drift from IdeaSpeak premium dark — align tokens or document rebrand.')
  }
  if (!/button|onClick|href/i.test(content)) {
    findings.push('No obvious primary action — users need one clear next step on first screen.')
  }

  if (findings.length === 0) {
    findings.push('Taste pass — hero and primary loop look intentional for a v1.')
  }

  return { id: 'grok', findings, pass: findings.length <= 1 && !/placeholder|todo|static/i.test(findings[0] || '') }
}

function reviewClaude(ctx: CouncilContext, map: FileMap): CouncilReviewerResult {
  const findings: string[] = []
  const { shipPrefs } = ctx

  if (!hasPath(map, 'supabase', 'createClient', 'lib/supabase')) {
    findings.push('No Supabase client stub detected — add lib/supabase before real auth/data.')
  }
  if (!contentMatches(map, /loading|isLoading|skeleton|spinner/i)) {
    findings.push('Missing loading states — async paths will feel broken on slow networks.')
  }
  if (!contentMatches(map, /error|catch|try\s*\{|onError/i)) {
    findings.push('Sparse error handling — wrap fetches and show a recoverable error UI.')
  }
  if (!shipPrefs.supabase?.url || !shipPrefs.supabase?.anonKey) {
    findings.push('Ship prefs lack Supabase URL + anon key — paste keys before launch.')
  }
  const shipScore = shipReadinessScore(shipPrefs)
  if (shipScore < 40) {
    findings.push(`Launch checklist only ${shipScore}% — finish Supabase schema + Vercel env before prod.`)
  }
  if (hasPath(map, 'supabase') && !contentMatches(map, /row level security|enable row level|policy/i)) {
    findings.push('Schema may be missing RLS policies — run supabase/schema.sql and verify policies.')
  }
  if (/service_role|SUPABASE_SERVICE_ROLE/i.test(allContent(map)) && /NEXT_PUBLIC/i.test(allContent(map))) {
    findings.push('Service role key must never ship in client code — server-only env.')
  }

  if (findings.length === 0) {
    findings.push('Systems pass — auth/data path and env hygiene look shippable.')
  }

  const critical = findings.filter((f) =>
    /missing|lack|never|only \d+%|sparse/i.test(f),
  )
  return { id: 'claude', findings, pass: critical.length === 0 }
}

function reviewCursor(_ctx: CouncilContext, map: FileMap): CouncilReviewerResult {
  const findings: string[] = []
  const paths = Object.keys(map)
  const appLines = lineCount(map, 'App.tsx') || lineCount(map, 'page.tsx')

  if (paths.length < 3) {
    findings.push('Very few source files — split UI into components/ for maintainable polish.')
  }
  if (appLines > 280) {
    findings.push(`Main view is ~${appLines} lines — extract hooks and presentational components.`)
  }
  if (!hasPath(map, 'components/') && paths.length > 4) {
    findings.push('No components/ folder — Cursor refactors are easier with small typed modules.')
  }
  if (!contentMatches(map, /sm:|md:|lg:|max-w-|min-h-screen|@media/i)) {
    findings.push('Weak responsive signals — run a mobile spacing and tap-target pass.')
  }
  if (!hasPath(map, 'package.json') && !hasPath(map, 'tsconfig')) {
    findings.push('Preview-only tree — download production ZIP before IDE surgery.')
  }
  if (!contentMatches(map, /export default|export function/)) {
    findings.push('No clear entry export — ensure app/page or App.tsx default export exists.')
  }

  if (findings.length === 0) {
    findings.push('Implementation pass — repo shape is Cursor-friendly for launch fixes.')
  }

  const blockers = findings.filter((f) => /few source|no clear entry|preview-only/i.test(f))
  return { id: 'cursor', findings, pass: blockers.length === 0 }
}

function reviewGpt(ctx: CouncilContext, map: FileMap): CouncilReviewerResult {
  const findings: string[] = []
  const content = allContent(map)

  if (/click here|submit|button|untitled|my app/i.test(content) && !ctx.appName) {
    findings.push('Generic labels — rename CTAs to the outcome users get (e.g. "Start tracking").')
  }
  if (!contentMatches(map, /empty|no items|nothing here|get started|welcome/i)) {
    findings.push('Add an empty state with one line of guidance and a single CTA.')
  }
  if (ctx.appName && ctx.appName.length > 0) {
    const nameInUi = content.toLowerCase().includes(ctx.appName.toLowerCase())
    if (!nameInUi && Object.keys(map).length > 1) {
      findings.push(`Product name "${ctx.appName}" not surfaced in UI — reinforce brand on hero.`)
    }
  }
  if (!contentMatches(map, /<h1|<h2|className=.*text-.*xl/i)) {
    findings.push('Weak typographic hierarchy — add a clear H1 and supporting subcopy.')
  }
  if (ctx.transcript && ctx.transcript.length > 80 && !contentMatches(map, new RegExp(ctx.transcript.split(/\s+/).slice(0, 3).join('|'), 'i'))) {
    findings.push('Core idea from session may be missing in UI — mirror the user\'s words in hero copy.')
  }

  if (findings.length === 0) {
    findings.push('Copy pass — messaging and empty states are launch-adequate.')
  }

  return { id: 'gpt', findings, pass: findings.length <= 1 }
}

function computeScore(reviewers: CouncilReviewerResult[], shipPrefs: ShipPreferences): number {
  const passCount = reviewers.filter((r) => r.pass).length
  const reviewerPct = (passCount / reviewers.length) * 55
  const shipPct = shipReadinessScore(shipPrefs) * 0.45
  return Math.round(Math.min(100, Math.max(0, reviewerPct + shipPct)))
}

function buildTopActions(reviewers: CouncilReviewerResult[], ctx: CouncilContext): string[] {
  const actionMap: Record<string, string> = {
    placeholder: 'Replace placeholder copy with outcome-focused hero text',
    motion: 'Add one micro-interaction on the primary CTA',
    brief: 'Voice-refine: restate primary user + wow moment in one sentence',
    supabase: 'Wire Supabase client + run schema.sql from Ship',
    loading: 'Add loading skeleton on the main data fetch',
    error: 'Add try/catch + inline error recovery on the core loop',
    keys: 'Paste Supabase URL + anon key in Ship → re-download ZIP',
    checklist: 'Complete Ship checklist items (Vercel env + smoke test)',
    rls: 'Verify RLS policies in Supabase SQL editor',
    components: 'Extract largest view into components/ + hooks/',
    mobile: 'Mobile pass: 44px tap targets, padding, overflow-x-hidden',
    zip: 'Download production ZIP from Ship before Cursor polish',
    empty: 'Add empty state: one sentence + primary CTA',
    brand: `Show "${ctx.appName}" prominently in the hero`,
    hierarchy: 'Add H1 + one line of supporting subcopy',
    idea: 'Mirror the session idea in hero copy',
    cta: 'Define one primary action on first screen',
  }

  const seen = new Set<string>()
  const actions: string[] = []

  for (const r of reviewers) {
    for (const f of r.findings) {
      const lower = f.toLowerCase()
      let key: string | null = null
      if (/placeholder|todo/i.test(lower)) key = 'placeholder'
      else if (/static|motion/i.test(lower)) key = 'motion'
      else if (/brief/i.test(lower)) key = 'brief'
      else if (/supabase client/i.test(lower)) key = 'supabase'
      else if (/loading/i.test(lower)) key = 'loading'
      else if (/error/i.test(lower)) key = 'error'
      else if (/url \+ anon|keys/i.test(lower)) key = 'keys'
      else if (/checklist/i.test(lower)) key = 'checklist'
      else if (/rls/i.test(lower)) key = 'rls'
      else if (/components|split/i.test(lower)) key = 'components'
      else if (/mobile|responsive/i.test(lower)) key = 'mobile'
      else if (/zip/i.test(lower)) key = 'zip'
      else if (/empty/i.test(lower)) key = 'empty'
      else if (/name|brand/i.test(lower)) key = 'brand'
      else if (/h1|hierarchy/i.test(lower)) key = 'hierarchy'
      else if (/idea|session/i.test(lower)) key = 'idea'
      else if (/primary action|cta/i.test(lower)) key = 'cta'
      else key = null

      const action = key ? actionMap[key] : f.split('—')[0]?.trim() || f
      if (action && !seen.has(action)) {
        seen.add(action)
        actions.push(action)
      }
    }
  }

  return actions.slice(0, 6)
}

/** Heuristic multi-model launch review — no live API calls yet */
export function generateCouncilReport(context: CouncilContext): CouncilReport {
  const map = normalizeFiles(context.files)
  const reviewers = [
    reviewGrok(context, map),
    reviewClaude(context, map),
    reviewCursor(context, map),
    reviewGpt(context, map),
  ]
  const score = computeScore(reviewers, context.shipPrefs)
  const topActions = buildTopActions(reviewers, context)

  return { score, reviewers, topActions }
}

function councilPromptBase(ctx: CouncilContext): string {
  const fileList = Array.isArray(ctx.files) ? ctx.files : Object.keys(ctx.files)
  return `You are on the IdeaSpeak Council — a launch review before Ship.

App: ${ctx.appName}
Session transcript (excerpt):
${(ctx.transcript || '(none)').slice(0, 1200)}

Files in scope: ${fileList.slice(0, 28).join(', ') || 'app/page.tsx, components/*'}

Ship checklist score: ${shipReadinessScore(ctx.shipPrefs)}%
Supabase configured: ${ctx.shipPrefs.supabase?.url ? 'yes' : 'no'}

Council rules:
- Be honest. No fake "shipped" claims.
- Prioritize blockers over nitpicks.
- Output: PASS or FAIL, then 3–5 findings, then 1 recommended fix.
- Preserve premium dark UI (#0a0a0f, accent #00ff88) unless rebranded.
`
}

export function buildCouncilPrompt(reviewer: CouncilReviewerId, ctx: CouncilContext): string {
  const base = councilPromptBase(ctx)

  switch (reviewer) {
    case 'grok':
      return `${base}

You are Grok — taste + /check-work verification.

Review for launch:
1. AI slop or generic filler?
2. Does the first screen deliver the wow from the transcript?
3. One high-leverage motion or delight moment missing?
4. Primary CTA obvious on mobile?

Format:
VERDICT: PASS|FAIL
FINDINGS: (bullets)
TOP FIX: (one sentence)`

    case 'claude':
      return `${base}

You are Claude — systems and security.

Review for launch:
1. Supabase auth + RLS posture
2. Env var safety (no service role in client)
3. Loading / error / empty states on the core loop
4. Ship checklist gaps (schema, Vercel env)

Format:
VERDICT: PASS|FAIL
FINDINGS: (bullets)
TOP FIX: (one sentence)`

    case 'cursor':
      return `${base}

You are Cursor Agent in the exported repo.

Review for launch:
1. Would \`bun run build\` pass after export?
2. File boundaries — anything too monolithic?
3. Mobile layout risks
4. Missing modules referenced by imports

Format:
VERDICT: PASS|FAIL
FINDINGS: (bullets)
TOP FIX: (one sentence + file paths)`

    case 'gpt':
      return `${base}

You are GPT — fast product copy + UI clarity.

Review for launch:
1. Hero copy reflects the idea
2. Empty and error messaging
3. CTA labels (outcome-based, not "Submit")
4. Typographic hierarchy

Format:
VERDICT: PASS|FAIL
FINDINGS: (bullets)
TOP FIX: (one sentence)`

    default:
      return base
  }
}

/** Prompt markdown files for production ZIP under polish/council/ */
export function councilExportFiles(ctx: CouncilContext): Record<string, string> {
  const prompts = Object.fromEntries(
    COUNCIL_REVIEWERS.map((r) => [
      `polish/council/prompts/${r.id}.md`,
      `# Council review — ${r.name}\n\n${buildCouncilPrompt(r.id, ctx)}\n`,
    ]),
  )

  const report = generateCouncilReport(ctx)
  const summary = `# Council launch report (heuristic)

Score: **${report.score}/100**

| Reviewer | Verdict |
|----------|---------|
${report.reviewers.map((r) => `| ${r.id} | ${r.pass ? 'PASS' : 'FAIL'} |`).join('\n')}

## Top actions
${report.topActions.map((a) => `- ${a}`).join('\n')}

Re-run with live models: paste each prompt in \`polish/council/prompts/\` with full repo context.
`

  return {
    ...prompts,
    'polish/council/README.md': `# Council Ship — multi-model launch review

Before you flip production, four specialists review the same build:

| Model | Lens |
|-------|------|
| **Grok** | Taste, honesty, first-user delight |
| **Claude** | Auth, RLS, env safety, edge cases |
| **Cursor** | Repo shape, buildability, mobile |
| **GPT** | Copy, empty states, UI clarity |

## Quick run (IdeaSpeak UI)

Open **Council** next to Ship in IdeaSpeak for an instant heuristic score + top fixes.

## Deep run (your models)

1. Export production ZIP from Ship
2. Open repo in Cursor
3. Paste \`polish/council/prompts/grok.md\` → then Claude → Cursor → GPT
4. Merge findings into one launch checklist

See \`REPORT.md\` for the last heuristic snapshot from export time.
`,
    'polish/council/REPORT.md': summary,
  }
}

/** Alias for ZIP bundlers — same as councilExportFiles */
export const councilPrompts = councilExportFiles