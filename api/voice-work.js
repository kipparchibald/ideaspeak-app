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
