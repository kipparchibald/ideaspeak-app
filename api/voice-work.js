/** Shared Voice Work v2 contract — refine guard, classify, plan validation */

export const VOICE_WORK_KINDS = ['BUILD', 'DESK', 'RESEARCH', 'DRAFT', 'ROUTE']

export const BRIEF_REQUIRED_FIELDS = [
  'who',
  'job',
  'surfaces',
  'data',
  'v1',
  'notV1',
  'tools',
  'done',
  'hardThing',
  'consequence',
]

/** Compact refine JSON contract appended to system prompts */
export const REFINE_JSON_CONTRACT = `Output ONLY valid JSON (no markdown fences):
{
  "kind": "BUILD|DESK|RESEARCH|DRAFT|ROUTE",
  "secondaryKind": null,
  "ready": false,
  "missing": ["Data", "Done"],
  "spoken": "...",
  "suggestion": null,
  "brief": {
    "who": "",
    "job": "",
    "surfaces": [],
    "data": { "real": [], "neverInvent": ["listings", "lots", "solds", "emails", "events"] },
    "v1": [],
    "notV1": [],
    "tools": { "stackOrConnectors": [], "wired": [], "notWired": [] },
    "done": "",
    "hardThing": "",
    "consequence": "preview only"
  },
  "handoff": null,
  "optimizedPrompt": ""
}
ready is true only when every brief field is non-empty. optimizedPrompt empty until ready.`

/** Refine system prompt for /api/refine */
export const REFINE_SYSTEM = `You are the IdeaSpeak Voice Work Refiner (v2).

Run CLASSIFY → CLEAN → FILL on raw voice transcripts + recent history.
Kinds: BUILD (site/app → preview), DESK (inbox/files/ops → draft/checklist), RESEARCH (sourced brief), DRAFT (unsent copy), ROUTE (handoff to Sites|Chief|RE|SplitRockOps — do not impersonate).

Complete brief fields (all required): Who, Job, Surfaces, Data, v1, Not v1, Tools, Done, Hard thing, Consequence.
Never invent listings, lots, solds, rates, showing times, emails, or calendar events.
Vague ideas stay gated — ready=false until every field is filled.

${REFINE_JSON_CONTRACT}`

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0
}

function isNonEmptyArray(v) {
  return Array.isArray(v) && v.length > 0
}

/** Map internal field keys to human missing labels */
const FIELD_LABELS = {
  who: 'Who',
  job: 'Job',
  surfaces: 'Surfaces',
  data: 'Data',
  v1: 'v1',
  notV1: 'Not v1',
  tools: 'Tools',
  done: 'Done',
  hardThing: 'Hard thing',
  consequence: 'Consequence',
}

/**
 * Compute which brief fields are missing.
 * @param {Record<string, unknown>} brief
 * @returns {string[]}
 */
export function computeMissingBriefFields(brief) {
  if (!brief || typeof brief !== 'object') {
    return BRIEF_REQUIRED_FIELDS.map((f) => FIELD_LABELS[f])
  }

  const missing = []

  if (!isNonEmptyString(brief.who)) missing.push(FIELD_LABELS.who)
  if (!isNonEmptyString(brief.job)) missing.push(FIELD_LABELS.job)
  if (!isNonEmptyArray(brief.surfaces)) missing.push(FIELD_LABELS.surfaces)
  if (!brief.data || typeof brief.data !== 'object') {
    missing.push(FIELD_LABELS.data)
  }
  if (!isNonEmptyArray(brief.v1)) missing.push(FIELD_LABELS.v1)
  if (!isNonEmptyArray(brief.notV1)) missing.push(FIELD_LABELS.notV1)
  if (!brief.tools || typeof brief.tools !== 'object') {
    missing.push(FIELD_LABELS.tools)
  } else {
    const t = brief.tools
    if (!isNonEmptyArray(t.stackOrConnectors) && !isNonEmptyArray(t.wired) && !isNonEmptyArray(t.notWired)) {
      missing.push(FIELD_LABELS.tools)
    }
  }
  if (!isNonEmptyString(brief.done)) missing.push(FIELD_LABELS.done)
  if (!isNonEmptyString(brief.hardThing)) missing.push(FIELD_LABELS.hardThing)
  if (!isNonEmptyString(brief.consequence)) missing.push(FIELD_LABELS.consequence)

  return missing
}

/**
 * Server-side guard: force ready=false if required fields are empty.
 * @param {Record<string, unknown> | null | undefined} parsed
 * @returns {Record<string, unknown>}
 */
export function guardRefineResult(parsed) {
  const base = parsed && typeof parsed === 'object' ? { ...parsed } : {}
  const brief =
    base.brief && typeof base.brief === 'object' ? { ...base.brief } : {}

  const missing = computeMissingBriefFields(brief)
  const ready = missing.length === 0

  return {
    kind: VOICE_WORK_KINDS.includes(base.kind) ? base.kind : 'BUILD',
    secondaryKind: base.secondaryKind ?? null,
    ready,
    missing,
    spoken: typeof base.spoken === 'string' ? base.spoken : '',
    suggestion: base.suggestion ?? null,
    brief: {
      who: brief.who ?? '',
      job: brief.job ?? '',
      surfaces: Array.isArray(brief.surfaces) ? brief.surfaces : [],
      data: {
        real: Array.isArray(brief.data?.real) ? brief.data.real : [],
        neverInvent: Array.isArray(brief.data?.neverInvent)
          ? brief.data.neverInvent
          : ['listings', 'lots', 'solds', 'emails', 'events'],
      },
      v1: Array.isArray(brief.v1) ? brief.v1 : [],
      notV1: Array.isArray(brief.notV1) ? brief.notV1 : [],
      tools: {
        stackOrConnectors: Array.isArray(brief.tools?.stackOrConnectors)
          ? brief.tools.stackOrConnectors
          : [],
        wired: Array.isArray(brief.tools?.wired) ? brief.tools.wired : [],
        notWired: Array.isArray(brief.tools?.notWired) ? brief.tools.notWired : [],
      },
      done: brief.done ?? '',
      hardThing: brief.hardThing ?? '',
      consequence: brief.consequence ?? 'preview only',
    },
    handoff: base.handoff ?? null,
    optimizedPrompt: ready && typeof base.optimizedPrompt === 'string' ? base.optimizedPrompt : '',
  }
}

/**
 * Lightweight classify helper for routing (no LLM).
 * @param {string} text
 * @returns {'BUILD'|'DESK'|'RESEARCH'|'DRAFT'|'ROUTE'}
 */
export function classifyWorkKind(text) {
  const t = String(text || '').toLowerCase()

  if (/\b(prep|prepare)\b.{0,30}\b(offer|listing|olson)\b/.test(t)) return 'ROUTE'
  if (/\b(route|hand\s*off|summitforge|split\s*rock|chief\s*desk)\b/.test(t)) return 'ROUTE'
  if (/\b(draft|write|compose)\b.{0,40}\b(reply|replies|email|sms|message|copy)\b/.test(t)) {
    if (/\b(unread|inbox|mail)\b/.test(t)) return 'DESK'
    return 'DRAFT'
  }
  if (/\b(unread|inbox|triage|handle my email|desk)\b/.test(t)) return 'DESK'
  if (/\b(research|competitor|market|pricing|what's the play)\b/.test(t)) return 'RESEARCH'
  if (/\b(app|site|page|dashboard|board|ui|preview|landing|voice)\b/.test(t)) return 'BUILD'

  return 'BUILD'
}

/**
 * Validate plan structure — BUILD needs fileScaffold; WORK needs workProducts.
 * @param {Record<string, unknown> | null | undefined} parsed
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePlanStructure(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return { valid: false, error: 'Plan missing' }
  }
  if (!Array.isArray(parsed.agents) || parsed.agents.length === 0) {
    return { valid: false, error: 'Plan missing agents' }
  }

  const kind = parsed.kind || 'BUILD'
  const isBuild = kind === 'BUILD' || !parsed.workProducts

  if (isBuild) {
    if (!Array.isArray(parsed.fileScaffold) || parsed.fileScaffold.length === 0) {
      return { valid: false, error: 'BUILD plan missing fileScaffold' }
    }
  } else {
    if (!Array.isArray(parsed.workProducts) || parsed.workProducts.length === 0) {
      return { valid: false, error: 'WORK plan missing workProducts' }
    }
  }

  return { valid: true }
}

// ── Act + Receipts (GATE → RECEIPT → ACT → SHOW) ───────────────────────────

/** Named production repos — BUILD mentioning these flips to ROUTE */
export const NAMED_PRODUCTION_REPOS = [
  { pattern: /kipparchibald\.com/i, desk: 'Sites', name: 'kipparchibald.com' },
  { pattern: /\bkipparchibald\b/i, desk: 'Sites', name: 'kipparchibald' },
  { pattern: /\bideaspeak(-app)?\b/i, desk: 'Sites', name: 'ideaspeak' },
  { pattern: /split[\s-]*rock/i, desk: 'SplitRockOps', name: 'Split Rock' },
  { pattern: /archibald-bagley/i, desk: 'Sites', name: 'archibald-bagley' },
]

const ACT_SECONDS = {
  BUILD: 60,
  DRAFT: 20,
  RESEARCH: 30,
  DESK: 25,
  ROUTE: 15,
}

/**
 * @param {Record<string, unknown>} refine
 * @returns {{ desk: string, name: string } | null}
 */
export function detectNamedProductionRepo(refine) {
  const brief = refine?.brief && typeof refine.brief === 'object' ? refine.brief : {}
  const text = [
    refine?.optimizedPrompt,
    brief.who,
    brief.job,
    ...(Array.isArray(brief.surfaces) ? brief.surfaces : []),
    ...(Array.isArray(brief.v1) ? brief.v1 : []),
    ...(Array.isArray(brief.data?.real) ? brief.data.real : []),
  ]
    .filter(Boolean)
    .join(' ')

  for (const repo of NAMED_PRODUCTION_REPOS) {
    if (repo.pattern.test(text)) return { desk: repo.desk, name: repo.name }
  }
  return null
}

/**
 * @param {Record<string, unknown>} refine
 * @returns {{ effectiveKind: string, desk?: string, repoName?: string, flippedFromBuild?: boolean }}
 */
export function resolveActKind(refine) {
  const kind = refine?.kind || 'BUILD'
  if (kind === 'BUILD') {
    const named = detectNamedProductionRepo(refine)
    if (named) {
      return {
        effectiveKind: 'ROUTE',
        desk: named.desk,
        repoName: named.name,
        flippedFromBuild: true,
      }
    }
  }
  return { effectiveKind: kind }
}

/** @param {string} text */
export function userAskedToSend(text) {
  return /\b(send|ship|publish|delete)\b/i.test(String(text || ''))
}

/**
 * @param {object} opts
 * @returns {Record<string, unknown>}
 */
export function buildReceipt({
  effectiveKind,
  userAskedSend = false,
  seconds,
  desk,
  repoName,
}) {
  const willNot = [
    'send',
    'git',
    'invent homes',
    'invent listings',
    'fake Gmail',
    'fake Calendar',
    'fake Navica',
  ]
  let spoken
  let will

  if (userAskedSend) {
    spoken = "You asked to send — outbound is off. I'll draft only."
    will = 'Preview draft only; outbound disabled'
    willNot.push('outbound send')
  } else if (effectiveKind === 'BUILD') {
    spoken = `Live preview on the right, no git, about ${seconds} seconds.`
    will = 'Compile live Sandpack preview from ready brief'
    willNot.push('deploy')
  } else if (effectiveKind === 'DRAFT') {
    spoken = `Draft, unsent, about ${seconds} seconds. I won't email anyone.`
    will = 'Write unsent copy from brief — no send'
  } else if (effectiveKind === 'RESEARCH') {
    spoken = `Sourced brief, about ${seconds} seconds. No fake comps.`
    will = 'Research brief — cite source or mark null'
    willNot.push('invent comps')
  } else if (effectiveKind === 'DESK') {
    spoken = "Desk mode — Gmail isn't wired. Paste threads or I'll route you."
    will = 'Desk drafts from pasted content only'
    willNot.push('pretend inbox')
  } else if (effectiveKind === 'ROUTE') {
    const target = desk || 'target desk'
    spoken = repoName
      ? `That's ${target} — ${repoName} is a production repo. Handoff, no Sandpack.`
      : `That's ${target}. I'll write the handoff. I'm not impersonating that desk.`
    will = `Handoff card for ${target} — stop after card`
    willNot.push('impersonate desk', 'Sandpack')
  } else {
    spoken = `Working on it — about ${seconds} seconds. Preview only.`
    will = 'Produce one work product from ready brief'
  }

  return {
    kind: effectiveKind,
    spoken,
    will,
    willNot,
    seconds,
    sendBlocked: userAskedSend,
  }
}

/**
 * @param {Record<string, unknown> | null | undefined} refine
 * @returns {{ ok: true, refine: Record<string, unknown> } | { ok: false, error: string, missing?: string[] }}
 */
export function validateActRequest(refine) {
  const guarded = guardRefineResult(refine)
  if (!guarded.ready) {
    return { ok: false, error: 'Brief not complete', missing: guarded.missing }
  }
  if (!guarded.optimizedPrompt?.trim()) {
    return { ok: false, error: 'Missing optimizedPrompt — brief must be fully refined' }
  }
  return { ok: true, refine: guarded }
}

/** @param {Array<{ role: string, content: string }>} history */
export function extractPastedThreads(history) {
  if (!Array.isArray(history)) return []
  return history
    .filter((m) => m.role === 'user' && String(m.content || '').length > 180)
    .map((m) => String(m.content).trim())
}

/**
 * Format work product for display pane.
 * @param {Record<string, unknown>} wp
 */
export function formatWorkProductContent(wp) {
  if (!wp || typeof wp !== 'object') return ''
  if (typeof wp.content === 'string' && wp.content.trim()) return wp.content

  if (wp.type === 'draft' && wp.draft) {
    const d = wp.draft
    return [`Subject: ${d.title || wp.title || 'Draft'}`, '', d.body || '', '', '— unsent draft only'].join(
      '\n',
    )
  }
  if (wp.type === 'research' && Array.isArray(wp.claims)) {
    return wp.claims
      .map((c, i) => `${i + 1}. ${c.text}${c.source ? ` (${c.source})` : ' [no source]'}`)
      .join('\n')
  }
  if (wp.type === 'desk') {
    const lines = [`Need: ${wp.need || 'paste'}`, '']
    if (Array.isArray(wp.drafts) && wp.drafts.length) {
      for (const d of wp.drafts) {
        lines.push(`### ${d.subject || 'Reply draft'}`, d.body || '', '')
      }
    } else {
      lines.push('Paste email threads in chat — Gmail is not wired.')
    }
    return lines.join('\n')
  }
  if (wp.type === 'handoff' && wp.handoff) {
    const h = wp.handoff
    return [
      `Desk: ${h.desk}`,
      `Why: ${h.why}`,
      '',
      'Decided:',
      ...(Array.isArray(h.decided) ? h.decided.map((d) => `- ${d}`) : []),
      '',
      'Missing:',
      ...(Array.isArray(h.missing) ? h.missing.map((d) => `- ${d}`) : []),
      '',
      '— Copy this card. IdeaSpeak does not impersonate this desk.',
    ].join('\n')
  }
  return ''
}

/**
 * Local act synthesis (no LLM) — tests + fallback.
 * @param {Record<string, unknown>} refine
 * @param {{ userIntent?: string, pastedThreads?: string[], desk?: string, repoName?: string, flippedFromBuild?: boolean }} ctx
 */
export function synthesizeActWorkProduct(refine, ctx = {}) {
  const { effectiveKind, desk, repoName, flippedFromBuild } = resolveActKind(refine)
  const brief = refine.brief || {}
  const prompt = refine.optimizedPrompt || ''
  const pasted = ctx.pastedThreads || []

  if (effectiveKind === 'ROUTE') {
    const targetDesk =
      desk || refine.handoff?.target || (flippedFromBuild ? 'Sites' : 'RE')
    const handoff = {
      desk: targetDesk,
      why: repoName
        ? `Production repo ${repoName} — Sandpack not appropriate`
        : refine.handoff?.reason || String(brief.job || 'Handoff required'),
      decided: Array.isArray(brief.v1) ? brief.v1 : [],
      missing: Array.isArray(brief.notV1) ? brief.notV1 : [],
    }
    const wp = {
      type: 'handoff',
      title: `Handoff → ${targetDesk}`,
      handoff,
      content: '',
    }
    wp.content = formatWorkProductContent(wp)
    return wp
  }

  if (effectiveKind === 'DRAFT') {
    const title = String(brief.job || 'Draft').slice(0, 80)
    const body = [
      prompt,
      '',
      '— Generated from ready brief. unsent: true',
    ].join('\n')
    const wp = {
      type: 'draft',
      title,
      draft: { title, body, unsent: true },
      content: '',
    }
    wp.content = formatWorkProductContent(wp)
    return wp
  }

  if (effectiveKind === 'RESEARCH') {
    const wp = {
      type: 'research',
      title: String(brief.job || 'Research brief').slice(0, 80),
      claims: [
        {
          text: `Research question: ${brief.job}. Verify against primary sources.`,
          source: null,
        },
        {
          text: `Hard thing to validate: ${brief.hardThing || 'scope unknown'}`,
          source: null,
        },
      ],
      content: '',
    }
    wp.content = formatWorkProductContent(wp)
    return wp
  }

  if (effectiveKind === 'DESK') {
    const drafts = pasted.length
      ? pasted.map((thread, i) => ({
          subject: `Reply draft ${i + 1}`,
          body: `Draft reply based on pasted thread:\n\n${thread.slice(0, 500)}…\n\n[Edit before any send — Gmail not wired]`,
          unsent: true,
        }))
      : []
    const wp = {
      type: 'desk',
      title: 'Desk — Gmail not wired',
      need: pasted.length ? 'paste' : 'route',
      drafts,
      content: '',
    }
    wp.content = formatWorkProductContent(wp)
    return wp
  }

  return null
}

/**
 * Full act result without LLM (BUILD + local work products).
 * @param {Record<string, unknown>} refine
 * @param {{ userIntent?: string, pastedThreads?: string[] }} opts
 */
export function executeActLocal(refine, opts = {}) {
  const validation = validateActRequest(refine)
  if (!validation.ok) return { ok: false, ...validation }

  const guarded = validation.refine
  const { effectiveKind, desk, repoName, flippedFromBuild } = resolveActKind(guarded)
  const userAskedSend = userAskedToSend(opts.userIntent)
  const seconds = ACT_SECONDS[effectiveKind] || 30
  const receipt = buildReceipt({ effectiveKind, userAskedSend, seconds, desk, repoName })

  if (effectiveKind === 'BUILD') {
    return {
      ok: true,
      receipt,
      action: 'BUILD',
      effectiveKind,
      buildPrompt: guarded.optimizedPrompt,
      spokenFinish: 'Preview compiling on the right — click around when it lands.',
    }
  }

  const workProduct = synthesizeActWorkProduct(guarded, {
    userIntent: opts.userIntent,
    pastedThreads: opts.pastedThreads,
    desk,
    repoName,
    flippedFromBuild,
  })

  return {
    ok: true,
    receipt,
    action: 'WORK',
    effectiveKind,
    workProduct,
    spokenFinish:
      effectiveKind === 'DRAFT'
        ? 'Draft is in the pane — unsent, preview only.'
        : effectiveKind === 'ROUTE'
          ? 'Handoff card ready — open the target desk to continue.'
          : 'Work product is in the pane — review before any send.',
  }
}

export const ACT_SYSTEM = `You are the IdeaSpeak Act agent. Generate ONE work product from a READY brief + optimizedPrompt.

Never use raw transcript. Never invent listings, lots, solds, emails, events, MLS data, or fake inbox access.
Gmail, Calendar, and Navica are NOT wired unless brief.tools.wired says so.

Output ONLY valid JSON:
{
  "workProduct": {
    "type": "draft|research|desk|handoff",
    "title": "...",
    "draft": { "title": "...", "body": "...", "unsent": true },
    "claims": [{ "text": "...", "source": "url or null" }],
    "need": "paste|route",
    "drafts": [{ "subject": "...", "body": "...", "unsent": true }],
    "handoff": { "desk": "...", "why": "...", "decided": [], "missing": [] }
  },
  "spokenFinish": "short Grok line ~45 words"
}

DRAFT: unsent:true always. Use [[need live home]] if listings needed but not in data.real.
RESEARCH: source null if no source. No fake comps.
DESK: need paste if no threads pasted. drafts[] only from pasted content.
ROUTE: handoff only — do not impersonate the desk.`

/**
 * @param {Record<string, unknown> | null | undefined} parsed
 * @param {string} effectiveKind
 */
export function guardActWorkProduct(parsed, effectiveKind) {
  const wp = parsed?.workProduct
  if (!wp || typeof wp !== 'object') return null

  if (effectiveKind === 'DRAFT') {
    const draft = wp.draft && typeof wp.draft === 'object' ? wp.draft : {}
    return {
      type: 'draft',
      title: wp.title || draft.title || 'Draft',
      draft: {
        title: draft.title || wp.title || 'Draft',
        body: draft.body || '',
        unsent: true,
      },
      content: '',
    }
  }

  if (effectiveKind === 'RESEARCH') {
    const claims = Array.isArray(wp.claims)
      ? wp.claims.map((c) => ({
          text: String(c?.text || ''),
          source: c?.source ? String(c.source) : null,
        }))
      : []
    return { type: 'research', title: wp.title || 'Research', claims, content: '' }
  }

  if (effectiveKind === 'DESK') {
    const drafts = Array.isArray(wp.drafts)
      ? wp.drafts.map((d) => ({
          subject: String(d?.subject || 'Reply'),
          body: String(d?.body || ''),
          unsent: true,
        }))
      : []
    return {
      type: 'desk',
      title: wp.title || 'Desk',
      need: wp.need === 'route' ? 'route' : 'paste',
      drafts,
      content: '',
    }
  }

  if (effectiveKind === 'ROUTE') {
    const h = wp.handoff && typeof wp.handoff === 'object' ? wp.handoff : {}
    return {
      type: 'handoff',
      title: wp.title || `Handoff → ${h.desk || 'Desk'}`,
      handoff: {
        desk: String(h.desk || 'RE'),
        why: String(h.why || ''),
        decided: Array.isArray(h.decided) ? h.decided.map(String) : [],
        missing: Array.isArray(h.missing) ? h.missing.map(String) : [],
      },
      content: '',
    }
  }

  return null
}
