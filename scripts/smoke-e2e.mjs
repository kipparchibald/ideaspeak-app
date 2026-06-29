#!/usr/bin/env bun
/**
 * IdeaSpeak end-to-end smoke test
 * Usage: bun run smoke [--local] [--build]
 *   BASE_URL=https://ideaspeak-app.vercel.app bun scripts/smoke-e2e.mjs
 */

const BASE = process.env.BASE_URL || (process.argv.includes('--local') ? 'http://localhost:5173' : 'https://ideaspeak-app.vercel.app')
const API = BASE.includes('localhost:5173') ? 'http://localhost:3001' : BASE
const RUN_BUILD = process.argv.includes('--build')

const results = []

async function step(name, fn) {
  const start = Date.now()
  try {
    const detail = await fn()
    results.push({ name, ok: true, ms: Date.now() - start, detail })
    console.log(`✓ ${name} (${Date.now() - start}ms)${detail ? ` — ${detail}` : ''}`)
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - start, error: String(e.message || e) })
    console.error(`✗ ${name} — ${e.message || e}`)
  }
}

await step('GET /api/status (live ping)', async () => {
  const res = await fetch(`${API}/api/status`, { signal: AbortSignal.timeout(15000) })
  const data = await res.json()
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  if (!data.live) throw new Error(data.message || 'not live')
  return `model=${data.model || 'unknown'}`
})

await step('POST /api/discuss voiceMode', async () => {
  const res = await fetch(`${API}/api/discuss`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: 'I want a voice memo app that turns rants into tasks' }],
      voiceMode: true,
      personality: 'grok',
    }),
    signal: AbortSignal.timeout(30000),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  if (!data.content || data.content.length < 10) throw new Error('empty content')
  if (/I'd be happy to|Great question/i.test(data.content)) throw new Error('bot phrase detected')
  return data.content.slice(0, 90) + '…'
})

await step('POST /api/discuss text', async () => {
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
})

await step('POST /api/refine', async () => {
  const res = await fetch(`${API}/api/refine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript: 'um like a voice first CRM for indie consultants that feels like texting your smartest friend',
      history: [],
    }),
    signal: AbortSignal.timeout(45000),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  if (!data.parsed?.brief?.vision) throw new Error('no parsed brief')
  return data.parsed.brief.vision.slice(0, 60) + '…'
})

if (RUN_BUILD) {
  await step('POST /api/build (slow)', async () => {
    const res = await fetch(`${API}/api/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: 'Minimal todo app with premium dark UI and voice add',
        brief: { vision: 'Voice-first todo', keyFeatures: ['voice add', 'dark UI'] },
      }),
      signal: AbortSignal.timeout(55000),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    if (!data.parsed?.files?.['src/App.tsx']) throw new Error('no parsed files')
    return `${Object.keys(data.parsed.files).length} files`
  })
} else {
  console.log('⊘ POST /api/build skipped (pass --build to include)')
}

await step('UI loads (#root)', async () => {
  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForSelector('#root', { timeout: 10000 })
    const text = await page.locator('#root').innerText()
    await browser.close()
    if (text.length < 50) throw new Error('root too empty')
    if (errors.length) throw new Error(errors[0])
    return `${text.length} chars in #root`
  } catch (e) {
    if (String(e).includes('Cannot find module')) {
      const res = await fetch(BASE, { signal: AbortSignal.timeout(15000) })
      const html = await res.text()
      if (!html.includes('id="root"')) throw new Error('no root in HTML')
      return 'HTML OK (playwright skipped)'
    }
    throw e
  }
})

const failed = results.filter((r) => !r.ok)
console.log('\n---')
console.log(`${results.length - failed.length}/${results.length} passed`)
if (failed.length) {
  console.log('Failed:', failed.map((f) => f.name).join(', '))
  process.exit(1)
}
console.log('Smoke test OK')