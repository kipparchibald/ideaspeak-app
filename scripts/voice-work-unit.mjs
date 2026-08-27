#!/usr/bin/env bun
/**
 * Voice Work v2 unit tests (no live xAI key required)
 * Run: bun run test:voice-work
 */

import {
  guardRefineResult,
  classifyWorkKind,
  computeMissingBriefFields,
  validatePlanStructure,
  validateActRequest,
  detectNamedProductionRepo,
  resolveActKind,
  buildReceipt,
  executeActLocal,
} from '../api/voice-work.js'
import { buildDiscussSystem } from '../api/prompts.js'

let passed = 0
let failed = 0

function assert(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`✓ ${name}`)
  } else {
    failed++
    console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// ── Refine guard: missing Who/Job → ready false ─────────────────────────────

const sparse = guardRefineResult({
  kind: 'BUILD',
  ready: true,
  missing: [],
  spoken: 'test',
  brief: { who: '', job: '', surfaces: [], v1: [], notV1: [] },
  optimizedPrompt: 'should not be ready',
})

assert('guard forces ready=false when Who/Job empty', sparse.ready === false)
assert('guard lists missing Who', sparse.missing.includes('Who'))
assert('guard lists missing Job', sparse.missing.includes('Job'))
assert('guard clears optimizedPrompt when not ready', sparse.optimizedPrompt === '')

const complete = guardRefineResult({
  kind: 'BUILD',
  ready: true,
  brief: {
    who: 'Solo founders',
    job: 'Daily ship check',
    surfaces: ['preview'],
    data: { real: ['user input'], neverInvent: ['listings'] },
    v1: ['ship score'],
    notV1: ['billing'],
    tools: { stackOrConnectors: ['React'], wired: [], notWired: ['Stripe'] },
    done: 'Clickable preview',
    hardThing: 'Streak logic',
    consequence: 'preview only',
  },
  optimizedPrompt: 'Build a ship-score app…',
})

assert('guard allows ready when all fields filled', complete.ready === true)
assert('guard keeps optimizedPrompt when ready', complete.optimizedPrompt.length > 0)

// Model lies ready:true with empty fields
const liar = guardRefineResult({ ready: true, brief: { who: 'x', job: '' } })
assert('guard overrides model ready=true lie', liar.ready === false)

// ── Classify helper ─────────────────────────────────────────────────────────

assert('classify DESK for unread mail', classifyWorkKind('draft replies to my unread mail') === 'DESK')
assert('classify ROUTE for Olson offer', classifyWorkKind('prep the Olson offer') === 'ROUTE')
assert('classify BUILD for lot board', classifyWorkKind('voice lot board for buyers') === 'BUILD')
assert('classify RESEARCH', classifyWorkKind('research competitor pricing') === 'RESEARCH')
assert('classify DRAFT for email', classifyWorkKind('write an email to the seller') === 'DRAFT')

// ── Discuss system prompt content ───────────────────────────────────────────

const discussVoice = buildDiscussSystem('grok', true)
const discussText = buildDiscussSystem('grok', false)

assert('discuss voice contains Do this gate', /Do this/i.test(discussVoice))
assert('discuss voice contains complete brief', /complete brief/i.test(discussVoice))
assert('discuss voice forbids inventing listings', /never invent listings/i.test(discussVoice))
assert('discuss voice does not build on mushy insist', !/then build if they insist/i.test(discussVoice))
assert('discuss voice says mushy stays gated', /mushy.*gated/i.test(discussVoice))
assert('discuss text contains five kinds', /BUILD.*DESK.*RESEARCH/i.test(discussText))

// ── Plan validator ──────────────────────────────────────────────────────────

const buildPlan = {
  kind: 'BUILD',
  agents: [{ id: 'architect' }],
  fileScaffold: [{ path: 'src/App.tsx', purpose: 'main' }],
}
const workPlan = {
  kind: 'DESK',
  agents: [{ id: 'scope' }],
  fileScaffold: [],
  workProducts: [{ type: 'checklist', title: 'Inbox triage', content: '1. Sort…' }],
}

assert('validate BUILD plan with fileScaffold', validatePlanStructure(buildPlan).valid === true)
assert('validate WORK plan with empty fileScaffold', validatePlanStructure(workPlan).valid === true)
assert('reject WORK without workProducts', validatePlanStructure({
  kind: 'DESK',
  agents: [{}],
  fileScaffold: [],
}).valid === false)
assert('reject BUILD without fileScaffold', validatePlanStructure({
  kind: 'BUILD',
  agents: [{}],
  fileScaffold: [],
}).valid === false)

// ── computeMissingBriefFields ───────────────────────────────────────────────

const missing = computeMissingBriefFields({ who: 'a', job: 'b' })
assert('computeMissing finds multiple gaps', missing.length > 2)

// ── Act + Receipts ───────────────────────────────────────────────────────────

const readyDraftRefine = {
  kind: 'DRAFT',
  ready: true,
  brief: {
    who: 'Seller',
    job: 'Inspection timeline email',
    surfaces: ['pane'],
    data: { real: [], neverInvent: ['listings'] },
    v1: ['one email'],
    notV1: ['send'],
    tools: { stackOrConnectors: [], wired: [], notWired: ['Gmail'] },
    done: 'Unsent draft in pane',
    hardThing: 'Tone',
    consequence: 'preview only',
  },
  optimizedPrompt: 'Draft a friendly email about inspection timeline.',
}

const notReady = validateActRequest({ kind: 'DRAFT', ready: false, brief: { who: 'x' } })
assert('act rejects !ready', notReady.ok === false)

const readyAct = validateActRequest(readyDraftRefine)
assert('act accepts ready brief', readyAct.ok === true)

const namedRepoRefine = {
  ...readyDraftRefine,
  kind: 'BUILD',
  optimizedPrompt: 'Update kipparchibald.com homepage hero',
  brief: { ...readyDraftRefine.brief, v1: ['kipparchibald.com hero'] },
}
const named = detectNamedProductionRepo(namedRepoRefine)
assert('detects kipparchibald.com', named?.name === 'kipparchibald.com')
const resolved = resolveActKind(namedRepoRefine)
assert('named-repo BUILD flips to ROUTE', resolved.effectiveKind === 'ROUTE')
assert('named-repo routes to Sites', resolved.desk === 'Sites')

const draftAct = executeActLocal(readyDraftRefine, { userIntent: 'do this' })
assert('DRAFT act returns work product', draftAct.ok === true && draftAct.workProduct?.type === 'draft')
assert('DRAFT has unsent:true', draftAct.workProduct?.draft?.unsent === true)

const sendReceipt = buildReceipt({
  effectiveKind: 'DRAFT',
  userAskedSend: true,
  seconds: 20,
})
assert('send ask sets sendBlocked', sendReceipt.sendBlocked === true)
assert('receipt willNot includes send', sendReceipt.willNot.includes('send'))

const toyBuild = {
  ...readyDraftRefine,
  kind: 'BUILD',
  optimizedPrompt: 'Build a habit tracker for founders',
  brief: { ...readyDraftRefine.brief, v1: ['streak UI'] },
}
const toyAct = executeActLocal(toyBuild, {})
assert('toy BUILD action is BUILD', toyAct.action === 'BUILD')
assert('toy BUILD has buildPrompt', typeof toyAct.buildPrompt === 'string' && toyAct.buildPrompt.length > 0)

// ── Act module exports (Vercel edge bundle) ─────────────────────────────────

const { ACT_SECONDS: actSeconds } = await import('../api/voice-work.js')
assert('ACT_SECONDS is exported', actSeconds?.BUILD === 60 && actSeconds?.DRAFT === 20)

const actMod = await import('../api/act.js')
assert('api/act.js imports without missing exports', typeof actMod.default === 'function')

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
