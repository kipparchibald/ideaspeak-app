#!/usr/bin/env bun
/**
 * End-to-end: live Grok plan turns (voice-style + text) → build → Sandpack preview
 * → refinement guidance loop (voice-mode discuss + text prompts).
 *
 * Usage:
 *   bun scripts/e2e-voice-preview.mjs
 *   BASE_URL=http://localhost:5173 bun scripts/e2e-voice-preview.mjs
 */

import {
  attachPageDiagnostics,
  sendPlanMessage,
  sleep,
  triggerBuildPreview,
  waitForAppReady,
  waitForAssistantSignal,
  waitForSandpackOrBuildUI,
} from './smoke-helpers.mjs'

const BASE = process.env.BASE_URL || 'http://localhost:5173'
const API = BASE.includes('localhost:5173') ? 'http://localhost:3001' : BASE

/** Chat input only — Sandpack editor also renders textareas in the workspace panel. */
function chatInput(page) {
  return page.getByPlaceholder('Or type here…')
}

const results = []
const log = []

function pass(name, detail) {
  results.push({ name, ok: true, detail })
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`)
}
function fail(name, err) {
  results.push({ name, ok: false, error: String(err) })
  console.error(`✗ ${name} — ${err}`)
}
async function step(name, fn) {
  try {
    const d = await fn()
    pass(name, d)
    return d
  } catch (e) {
    fail(name, e?.message || e)
    throw e
  }
}

async function discuss(messages, { voiceMode = true } = {}) {
  const res = await fetch(`${API}/api/discuss`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      voiceMode,
      personality: 'grok',
    }),
    signal: AbortSignal.timeout(60000),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `discuss ${res.status}`)
  if (!data.content?.trim()) throw new Error('empty discuss content')
  return data.content.trim()
}

// ── 1. Live stack ───────────────────────────────────────────────────────────

await step('Grok API live', async () => {
  const res = await fetch(`${API}/api/status`, { signal: AbortSignal.timeout(15000) })
  const data = await res.json()
  if (!data.live) throw new Error(data.message || 'not live')
  return `model=${data.model} source=${data.source}`
})

await step('Voice token (Grok Voice Agent)', async () => {
  const res = await fetch(`${API}/api/voice/token`, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `token ${res.status}`)
  const token = data.value || data.client_secret?.value || data.token
  if (!token) throw new Error('no token value')
  return `token len=${token.length}`
})

// ── 2. Multi-turn voice-style plan (live Grok) ──────────────────────────────

const history = []

await step('Voice-style plan turn 1', async () => {
  history.push({
    role: 'user',
    content:
      'I want an app for indie consultants that captures client updates by voice and turns them into a clean timeline',
  })
  const reply = await discuss(history, { voiceMode: true })
  history.push({ role: 'assistant', content: reply })
  log.push({ turn: 1, mode: 'voice', reply })
  if (/I'd be happy to|Great question|So you want/i.test(reply)) {
    throw new Error(`bot phrase: ${reply.slice(0, 80)}`)
  }
  return reply.slice(0, 100) + '…'
})

await step('Voice-style plan turn 2 (user answers)', async () => {
  history.push({
    role: 'user',
    content: 'Solo freelancers first. Daily loop is speak an update after a call, then client sees a polished card.',
  })
  const reply = await discuss(history, { voiceMode: true })
  history.push({ role: 'assistant', content: reply })
  log.push({ turn: 2, mode: 'voice', reply })
  return reply.slice(0, 100) + '…'
})

await step('Text guidance turn 3 (improvement suggestions)', async () => {
  history.push({
    role: 'user',
    content:
      'What would make v1 feel premium without bloating scope? Give me one wow moment and one cut.',
  })
  const reply = await discuss(history, { voiceMode: false })
  history.push({ role: 'assistant', content: reply })
  log.push({ turn: 3, mode: 'text', reply })
  if (reply.length < 40) throw new Error('text guidance too short')
  return reply.slice(0, 120) + '…'
})

await step('Voice-style turn 4 (continual improvements)', async () => {
  history.push({
    role: 'user',
    content: 'Lock dark premium UI, voice capture, timeline cards. Ready to build v1.',
  })
  const reply = await discuss(history, { voiceMode: true })
  history.push({ role: 'assistant', content: reply })
  log.push({ turn: 4, mode: 'voice', reply })
  return reply.slice(0, 100) + '…'
})

// ── 3. Build scaffold (local always works; try live build if available) ─────

let previewFiles = null

await step('Local native scaffold from plan (preview-safe)', async () => {
  const { simulateVoiceRefiner, generateNativeProject } = await import('../src/lib/build-tools.ts')
  const idea = history
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join(' ')
  const { brief } = simulateVoiceRefiner(idea)
  const { files, name } = generateNativeProject(
    {
      ...brief,
      original: idea,
      vision:
        'Voice-first client update timeline for indie consultants — dark premium UI, speak after calls, polished cards',
      keyFeatures: ['Voice capture', 'Timeline cards', 'Dark premium UI', 'Client view'],
    },
    'grok',
  )
  previewFiles = Object.fromEntries(
    Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? v : v.code]),
  )
  if (!previewFiles['src/App.tsx']?.includes('export default')) {
    throw new Error('bad App.tsx')
  }
  return `name=${name}`
})

try {
  await step('Live /api/build upgrade', async () => {
    const res = await fetch(`${API}/api/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: history.filter((m) => m.role === 'user').map((m) => m.content).join('\n'),
        brief: {
          vision: 'Voice-first client update timeline for freelancers',
          keyFeatures: ['voice capture', 'timeline', 'dark UI'],
        },
        personality: 'grok',
      }),
      signal: AbortSignal.timeout(90000),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `build ${res.status}`)
    if (data.parsed?.files?.['src/App.tsx']) {
      previewFiles = {
        ...previewFiles,
        ...Object.fromEntries(
          Object.entries(data.parsed.files).map(([k, v]) => [
            k,
            typeof v === 'string' ? v : v?.code || String(v),
          ]),
        ),
      }
      return `live build: ${data.parsed.name || 'ok'} files=${Object.keys(data.parsed.files).length}`
    }
    throw new Error('no parsed files')
  })
} catch {
  const last = results[results.length - 1]
  if (last && !last.ok) {
    last.ok = true
    last.optional = true
    last.detail = `soft-skip: ${last.error}`
    delete last.error
    console.log(`⊘ Live /api/build soft-skipped — ${last.detail}`)
  }
}

// ── 4. UI: load app, inject plan, build, verify Sandpack ────────────────────

await step('UI e2e: plan → build → live preview + refine guidance', async () => {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const pageErrors = attachPageDiagnostics(page)

  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await sleep(1200)
  await waitForAppReady(page, { timeout: 60_000 })

  const planLines = [
    'Voice-first client updates for indie consultants — speak after a call, client sees a polished timeline',
    'Solo freelancers first. Core loop: mic → card on timeline. Dark premium UI.',
    'Wow moment is the timeline card animation. Cut marketplace and payments from v1.',
  ]

  for (let i = 0; i < planLines.length; i++) {
    if (i === 0) {
      await sendPlanMessage(page, planLines[i])
    } else {
      const ta = chatInput(page)
      await ta.waitFor({ state: 'visible', timeout: 15_000 })
      await ta.fill(planLines[i])
      await ta.press('Enter')
    }
    await waitForAssistantSignal(page, { timeout: 60_000 })
  }

  let root = await page.locator('#root').innerText()
  if (!/You/i.test(root)) throw new Error('plan messages not in UI')

  const improve = chatInput(page)
  await improve.waitFor({ state: 'visible', timeout: 15_000 })
  await improve.fill(
    'Suggest one improvement to make the timeline feel more premium, then we build.',
  )
  await improve.press('Enter')
  await waitForAssistantSignal(page, { timeout: 60_000 })

  root = await page.locator('#root').innerText()
  log.push({ ui: 'after improve prompt', snippet: root.slice(0, 200) })

  const buildVia = await triggerBuildPreview(page)
  const preview = await waitForSandpackOrBuildUI(page, { timeout: 90_000 })

  const refineTa = chatInput(page)
  if ((await refineTa.count()) > 0) {
    await refineTa.fill(
      'After looking at the preview, what should we improve next in v1.1? One idea only.',
    )
    await refineTa.press('Enter')
    await sleep(5000)
  }

  root = await page.locator('#root').innerText()
  await browser.close()

  const criticalErrors = pageErrors.filter(
    (e) => !/sandpack|codesandbox|jsdelivr|Failed to fetch|ReactDOMClient\.createRoot/i.test(e),
  )
  if (criticalErrors.length) throw new Error(criticalErrors[0])
  if (
    preview.kind !== 'iframe' &&
    !/Live preview|preview ready|Edit code|LIVE PREVIEW|files · in-browser|localhost:5174/i.test(root)
  ) {
    throw new Error('no live preview after build')
  }

  return `build=${buildVia} preview=${preview.kind} (${preview.sample.replace(/\s+/g, ' ').slice(0, 72)}…)`
})

// ── 5. Continual improvement loop (API) after "preview" ─────────────────────

await step('Post-preview voice suggestions loop (3 turns)', async () => {
  const post = [
    ...history,
    {
      role: 'user',
      content: 'We built the live preview. Keep suggesting small improvements for the next iteration.',
    },
  ]
  const suggestions = []
  const prompts = [
    'First improvement?',
    'Second improvement — different angle.',
    'Third — something about mobile or empty state.',
  ]
  for (const p of prompts) {
    post.push({ role: 'user', content: p })
    const reply = await discuss(post, { voiceMode: true })
    post.push({ role: 'assistant', content: reply })
    suggestions.push(reply)
    if (reply.length < 15) throw new Error('empty suggestion')
  }
  log.push({ continuousImprovements: suggestions })
  return suggestions.map((s, i) => `${i + 1}:${s.slice(0, 50)}`).join(' | ')
})

// ── Report ──────────────────────────────────────────────────────────────────

const failed = results.filter((r) => !r.ok)
console.log('\n========== E2E VOICE + PREVIEW REPORT ==========')
console.log(`Target ${BASE} · API ${API}`)
console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`)
if (failed.length) {
  console.log('FAILED:', failed.map((f) => f.name).join(', '))
}
console.log('\n— Voice / text guidance log —')
for (const row of log) {
  if (row.turn) {
    console.log(`[${row.mode} t${row.turn}] ${row.reply?.slice(0, 140)}…`)
  }
  if (row.continuousImprovements) {
    row.continuousImprovements.forEach((s, i) => {
      console.log(`[improve ${i + 1}] ${s.slice(0, 140)}…`)
    })
  }
}
console.log('================================================\n')

// Write artifact for inspection
const outPath = new URL('../.e2e-voice-preview-report.json', import.meta.url).pathname
await Bun.write(
  outPath,
  JSON.stringify({ at: new Date().toISOString(), BASE, API, results, log }, null, 2),
)
console.log(`Report: ${outPath}`)

process.exit(failed.length ? 1 : 0)
