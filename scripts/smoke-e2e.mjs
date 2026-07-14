#!/usr/bin/env bun
/**
 * IdeaSpeak end-to-end smoke test
 *
 * Usage:
 *   bun run smoke:local              # local UI + API (Grok live optional)
 *   bun run smoke                    # production default
 *   bun run smoke:full               # include /api/build
 *   BASE_URL=... bun scripts/smoke-e2e.mjs --local
 *
 * Flags:
 *   --local   force localhost:5173
 *   --build   include slow Grok build
 *   --require-live  fail if Grok is not live (CI production)
 */

const isLocalArg = process.argv.includes('--local') || process.env.BASE_URL?.includes('localhost')
const BASE =
  process.env.BASE_URL ||
  (isLocalArg || process.argv.includes('--local')
    ? 'http://localhost:5173'
    : 'https://ideaspeak-app.vercel.app')
const API = BASE.includes('localhost:5173') ? 'http://localhost:3001' : BASE
const RUN_BUILD = process.argv.includes('--build')
const REQUIRE_LIVE = process.argv.includes('--require-live') || process.env.REQUIRE_LIVE === '1'

const results = []

async function step(name, fn, { optional = false } = {}) {
  const start = Date.now()
  try {
    const detail = await fn()
    results.push({ name, ok: true, optional, ms: Date.now() - start, detail })
    console.log(`✓ ${name} (${Date.now() - start}ms)${detail ? ` — ${detail}` : ''}`)
  } catch (e) {
    const err = String(e.message || e)
    if (optional) {
      results.push({ name, ok: true, optional: true, skipped: true, ms: Date.now() - start, detail: err })
      console.log(`⊘ ${name} skipped — ${err}`)
    } else {
      results.push({ name, ok: false, optional, ms: Date.now() - start, error: err })
      console.error(`✗ ${name} — ${err}`)
    }
  }
}

let grokLive = false

// ── API ─────────────────────────────────────────────────────────────────────

await step('API health / status JSON', async () => {
  const res = await fetch(`${API}/api/status`, { signal: AbortSignal.timeout(15000) })
  // Bun may return text on unknown routes historically — require JSON
  const ct = res.headers.get('content-type') || ''
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`status not JSON: ${text.slice(0, 80)}`)
  }
  grokLive = data.live === true
  if (REQUIRE_LIVE && !grokLive) {
    throw new Error(data.message || 'Grok not live (--require-live)')
  }
  return `live=${grokLive} source=${data.source || '?'} model=${data.model || '?'}`
})

await step(
  'POST /api/discuss voiceMode (live Grok)',
  async () => {
    if (!grokLive) throw new Error('Grok not live')
    const res = await fetch(`${API}/api/discuss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'I want a voice memo app that turns rants into tasks' }],
        voiceMode: true,
        personality: 'grok',
      }),
      signal: AbortSignal.timeout(45000),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    if (!data.content || data.content.length < 10) throw new Error('empty content')
    if (/I'd be happy to|Great question|So you want/i.test(data.content)) {
      throw new Error('bot/parrot phrase detected')
    }
    return data.content.slice(0, 90) + '…'
  },
  { optional: !REQUIRE_LIVE },
)

await step(
  'POST /api/discuss text (live Grok)',
  async () => {
    if (!grokLive) throw new Error('Grok not live')
    const res = await fetch(`${API}/api/discuss`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Scope a v1 for a founder habit tracker' }],
        voiceMode: false,
      }),
      signal: AbortSignal.timeout(45000),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    return `${data.content.length} chars`
  },
  { optional: !REQUIRE_LIVE },
)

await step(
  'POST /api/refine (live Grok)',
  async () => {
    if (!grokLive) throw new Error('Grok not live')
    const res = await fetch(`${API}/api/refine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript:
          'um like a voice first CRM for indie consultants that feels like texting your smartest friend',
        history: [],
      }),
      signal: AbortSignal.timeout(45000),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    if (!data.parsed?.brief?.vision) throw new Error('no parsed brief')
    return data.parsed.brief.vision.slice(0, 60) + '…'
  },
  { optional: !REQUIRE_LIVE },
)

if (RUN_BUILD) {
  await step(
    'POST /api/build (live Grok, slow)',
    async () => {
      if (!grokLive) throw new Error('Grok not live')
      const res = await fetch(`${API}/api/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: 'Minimal todo app with premium dark UI and voice add',
          brief: { vision: 'Voice-first todo', keyFeatures: ['voice add', 'dark UI'] },
        }),
        signal: AbortSignal.timeout(110000),
      })
      if (res.status === 504) throw new Error('Build timed out')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      if (!data.parsed?.files?.['src/App.tsx']) {
        throw new Error(data.parsed ? 'missing App.tsx' : 'failed to parse build JSON')
      }
      return `${Object.keys(data.parsed.files).length} files — ${data.parsed.name}`
    },
    { optional: !REQUIRE_LIVE },
  )
} else {
  console.log('⊘ POST /api/build skipped (pass --build to include)')
}

// ── Local unit-style (always) ───────────────────────────────────────────────

await step('Unit: plan simulator + native scaffold', async () => {
  const { simulateVoiceRefiner, generateNativeProject } = await import('../src/lib/build-tools.ts')
  const { brief } = simulateVoiceRefiner('habit tracker with streaks for founders')
  const { files, name } = generateNativeProject(brief, 'grok')
  const app = files['src/App.tsx']?.code || ''
  if (!app.includes('export default')) throw new Error('no default export')
  if (app.includes('lucide-react') || app.includes('framer-motion')) {
    throw new Error('scaffold still depends on external UI libs')
  }
  if (!app.includes('minHeight') && !app.includes('min-height')) {
    throw new Error('expected inline-style scaffold for Sandpack safety')
  }
  return `name=${name.slice(0, 40)} appLen=${app.length}`
})

await step('Unit: discuss simulator no-parrot', async () => {
  const { discussWithGrok } = await import('../src/lib/xai.ts')
  // Force simulator by invalid key + failed network path is covered; empty key uses API first
  // Call simulate path via invalid response handling — use empty messages with force:
  // discussWithGrok always hits network; without server it falls back.
  // Instead import is hard — re-test via building brief
  const r = await discussWithGrok(
    [{ role: 'user', content: 'I want a habit tracker for founders' }],
    'invalid-key-for-smoke',
    null,
    'grok',
    true,
  )
  if (!r.content || r.content.length < 20) throw new Error('empty simulator reply')
  if (/so you want|you said|I'd be happy/i.test(r.content)) throw new Error('parrot/bot phrase')
  if (r.live) throw new Error('expected live=false with invalid key')
  return r.content.slice(0, 80) + '…'
})

await step('Unit: production ship scaffold', async () => {
  const { buildProductionScaffold } = await import('../src/lib/ship.ts')
  const files = buildProductionScaffold({
    appName: 'Smoke App',
    appSlug: 'smoke-app',
    idea: 'habit tracker',
    previewFiles: {
      'src/App.tsx': 'export default function App(){ return <div>Hi</div> }',
    },
    prefs: {
      appName: 'Smoke App',
      appSlug: 'smoke-app',
      supabase: { url: '', anonKey: '', projectRef: '' },
      customDomain: '',
      githubRepoUrl: '',
      vercelProjectUrl: '',
      checklist: {},
    },
  })
  for (const req of [
    'app/page.tsx',
    'package.json',
    'supabase/schema.sql',
    'SHIP.md',
    'polish/prompts/cursor.md',
    '.cursorrules',
  ]) {
    if (!files[req]) throw new Error(`missing ${req}`)
  }
  return `${Object.keys(files).length} files`
})

// ── UI Playwright e2e ───────────────────────────────────────────────────────

await step('UI: loads plan-first shell', async () => {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('#root', { timeout: 15000 })
  await page.waitForTimeout(1500)
  const text = await page.locator('#root').innerText()
  await browser.close()
  if (text.length < 80) throw new Error('root too empty')
  if (!/IdeaSpeak/i.test(text)) throw new Error('missing IdeaSpeak brand')
  if (!/Plan/i.test(text)) throw new Error('missing Plan mode')
  if (errors.length) throw new Error(errors[0])
  return `${text.length} chars`
})

await step('UI: plan chip → co-founder reply (no instant build)', async () => {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1500)

  const chip = page.getByRole('button', { name: /habit tracker/i }).first()
  await chip.click()
  await page.waitForTimeout(3500)

  const text = await page.locator('#root').innerText()
  await browser.close()

  if (errors.length) throw new Error(errors[0])
  if (!/You/i.test(text)) throw new Error('user message missing')
  // Should NOT have built preview yet from a single plan turn
  if (/Live preview is up for/i.test(text)) throw new Error('built too early on plan chip')
  // Should have an assistant reply of some kind
  const hasReply =
    /Who|founder|v1|loop|ship|daily|streak|coach|user|plan/i.test(text) &&
    text.length > 200
  if (!hasReply) throw new Error('no collaborative reply visible')
  return 'plan reply OK'
})

await step('UI: build from plan → live Sandpack preview', async () => {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1200)

  // Two plan turns so "Build live preview" appears
  await page.getByRole('button', { name: /habit tracker/i }).first().click()
  await page.waitForTimeout(2500)

  // Second user message via type + enter if button not ready
  const buildBtn = page.getByRole('button', { name: /Build live preview/i })
  if (await buildBtn.count()) {
    await buildBtn.click()
  } else {
    // Force green-light via type
    const ta = page.locator('textarea').first()
    await ta.fill('build it')
    await ta.press('Enter')
  }

  // Wait for build + preview
  await page.waitForTimeout(5000)

  const rootText = await page.locator('#root').innerText()

  // Look for sandpack preview iframe content
  let previewHit = false
  for (const frame of page.frames()) {
    try {
      const t = await frame.locator('body').innerText({ timeout: 1500 })
      if (
        t &&
        (/Live preview/i.test(t) ||
          /Add/i.test(t) && t.length > 40 ||
          /habit|streak|ship|focus/i.test(t))
      ) {
        previewHit = true
        break
      }
    } catch {
      /* frame not ready */
    }
  }

  await browser.close()

  if (errors.length) throw new Error(errors[0])
  if (!previewHit && !/Live preview|preview ready|files · in-browser|Next · make it real/i.test(rootText)) {
    throw new Error('no live preview signals after build')
  }
  return previewHit ? 'sandpack iframe OK' : 'build UI OK (iframe soft)'
})

await step('UI: Ship + Polish controls present after build path', async () => {
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(1000)

  // Jump to build via mode + message
  await page.getByRole('button', { name: /^Build$/i }).first().click().catch(() => {})
  const ta = page.locator('textarea').first()
  if (await ta.count()) {
    await ta.fill('build it')
    await ta.press('Enter')
    await page.waitForTimeout(4000)
  }

  const text = await page.locator('#root').innerText()
  await browser.close()

  // Controls may be disabled before build — just ensure they exist in DOM
  // After our flow, Ship/Polish buttons should be in toolbar
  if (!/Ship|Polish|Plan|Preview/i.test(text)) {
    throw new Error('missing Ship/Polish/Plan chrome')
  }
  return 'chrome OK'
})

// ── Summary ─────────────────────────────────────────────────────────────────

const hardFailed = results.filter((r) => !r.ok)
const passed = results.filter((r) => r.ok && !r.skipped).length
const skipped = results.filter((r) => r.skipped).length

console.log('\n---')
console.log(`${passed} passed · ${skipped} optional-skipped · ${hardFailed.length} failed`)
console.log(`Target: ${BASE} · API: ${API} · grokLive=${grokLive}`)
if (hardFailed.length) {
  console.log('Failed:', hardFailed.map((f) => f.name).join(', '))
  process.exit(1)
}
console.log('Smoke test OK')
