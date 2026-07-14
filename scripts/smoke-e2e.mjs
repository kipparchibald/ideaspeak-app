#!/usr/bin/env bun
/**
 * IdeaSpeak end-to-end smoke test (hardened)
 *
 * Usage:
 *   bun run smoke:local              # local UI + API (Grok live optional)
 *   bun run smoke                    # production default
 *   bun run smoke:full               # include /api/build
 *   BASE_URL=... bun scripts/smoke-e2e.mjs --local
 *
 * Flags:
 *   --local         force localhost:5173 + API :3001
 *   --build         include slow Grok build
 *   --require-live  fail if Grok is not live (CI production)
 *   --no-security   skip security probes
 *   --retries N     UI retry attempts (default 2)
 *
 * On failure, screenshots + DOM dump → .smoke-artifacts/
 * See docs/SMOKE_AND_RISKS.md for failure modes & vulnerabilities.
 */

import {
  attachPageDiagnostics,
  probeBlockedOrigin,
  probeRateLimitHeaders,
  probeStatusNoSecretLeak,
  retry,
  saveFailureArtifacts,
  sendPlanMessage,
  sleep,
  triggerBuildPreview,
  waitForAppReady,
  waitForAssistantSignal,
  waitForSandpackOrBuildUI,
  withBrowser,
} from './smoke-helpers.mjs'

const isLocalArg = process.argv.includes('--local') || process.env.BASE_URL?.includes('localhost')
const BASE =
  process.env.BASE_URL ||
  (isLocalArg || process.argv.includes('--local')
    ? 'http://localhost:5173'
    : 'https://ideaspeak-app.vercel.app')
const API = BASE.includes('localhost:5173') ? 'http://localhost:3001' : BASE
const RUN_BUILD = process.argv.includes('--build')
const REQUIRE_LIVE = process.argv.includes('--require-live') || process.env.REQUIRE_LIVE === '1'
const RUN_SECURITY = !process.argv.includes('--no-security')
const UI_RETRIES = Number(process.env.SMOKE_RETRIES || process.argv.find((a) => a.startsWith('--retries='))?.split('=')[1] || 2)

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
  const res = await fetch(`${API}/api/status`, { signal: AbortSignal.timeout(20_000) })
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

if (RUN_SECURITY) {
  await step('Security: blocked origin → 403', async () => probeBlockedOrigin(API))

  await step('Security: status does not leak secrets', async () => probeStatusNoSecretLeak(API))

  await step('Security: rate-limit enforceRateLimit unit', async () => {
    const { enforceRateLimit } = await import('../api/security.js')
    const fakeReq = {
      headers: {
        get: (h) => {
          const k = String(h).toLowerCase()
          if (k === 'x-forwarded-for') return '203.0.113.50'
          return null
        },
      },
    }
    const { headers } = enforceRateLimit(fakeReq)
    if (!headers['X-RateLimit-Limit']) throw new Error('enforceRateLimit missing X-RateLimit-Limit')
    return `limit=${headers['X-RateLimit-Limit']}`
  })

  await step(
    'Security: rate-limit headers on live discuss',
    async () => probeRateLimitHeaders(API),
    { optional: true },
  )

  await step('Security: usage API returns JSON', async () => {
    const res = await fetch(`${API}/api/usage`, {
      headers: {
        Origin: API.includes('localhost') ? 'http://localhost:5173' : 'https://ideaspeak-app.vercel.app',
      },
      signal: AbortSignal.timeout(10_000),
    })
    const data = await res.json()
    if (!data.limits || !data.usage) throw new Error('usage shape invalid')
    return `authoritative=${!!data.authoritative} plan=${data.plan}`
  })
}

await step(
  'POST /api/discuss voiceMode (live Grok)',
  async () => {
    if (!grokLive) throw new Error('Grok not live')
    const res = await fetch(`${API}/api/discuss`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: API.includes('localhost') ? 'http://localhost:5173' : 'https://ideaspeak-app.vercel.app',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'I want a voice memo app that turns rants into tasks' }],
        voiceMode: true,
        personality: 'grok',
      }),
      signal: AbortSignal.timeout(60_000),
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
      headers: {
        'Content-Type': 'application/json',
        Origin: API.includes('localhost') ? 'http://localhost:5173' : 'https://ideaspeak-app.vercel.app',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Scope a v1 for a founder habit tracker' }],
        voiceMode: false,
      }),
      signal: AbortSignal.timeout(60_000),
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
      headers: {
        'Content-Type': 'application/json',
        Origin: API.includes('localhost') ? 'http://localhost:5173' : 'https://ideaspeak-app.vercel.app',
      },
      body: JSON.stringify({
        transcript:
          'um like a voice first CRM for indie consultants that feels like texting your smartest friend',
        history: [],
      }),
      signal: AbortSignal.timeout(60_000),
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
        headers: {
          'Content-Type': 'application/json',
          Origin: API.includes('localhost') ? 'http://localhost:5173' : 'https://ideaspeak-app.vercel.app',
        },
        body: JSON.stringify({
          transcript: 'Minimal todo app with premium dark UI and voice add',
          brief: { vision: 'Voice-first todo', keyFeatures: ['voice add', 'dark UI'] },
        }),
        signal: AbortSignal.timeout(120_000),
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

// ── Unit (no network to production for simulator test) ──────────────────────

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

await step('Unit: discuss simulator fallback (mocked network)', async () => {
  const { discussWithGrok } = await import('../src/lib/xai.ts')
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    json: async () => ({ error: 'smoke-mock-unavailable' }),
  })
  try {
    const r = await discussWithGrok(
      [{ role: 'user', content: 'I want a habit tracker for founders' }],
      undefined,
      null,
      'grok',
      true,
    )
    if (!r.content || r.content.length < 20) throw new Error('empty simulator reply')
    if (/so you want|you said|I'd be happy/i.test(r.content)) throw new Error('parrot/bot phrase')
    if (r.live) throw new Error('expected live=false when API down')
    return r.content.slice(0, 80) + '…'
  } finally {
    globalThis.fetch = originalFetch
  }
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

// ── UI (single browser, shared session, retries) ───────────────────────────

await step(
  'UI: plan-first shell + plan chip + build preview + chrome',
  async () => {
    return retry(
      'UI flow',
      async () => {
        return withBrowser(async (browser) => {
          const page = await browser.newPage()
          const errors = attachPageDiagnostics(page)

          try {
            await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 45_000 })
            await waitForAppReady(page, { timeout: 45_000 })

            const shellText = await page.locator('#root').innerText()
            if (shellText.length < 80) throw new Error('root too empty')
            if (!/IdeaSpeak/i.test(shellText)) throw new Error('missing IdeaSpeak brand')
            if (!/Plan/i.test(shellText)) throw new Error('missing Plan mode')

            // Plan turn — chip or textarea fallback
            const via = await sendPlanMessage(page)
            await waitForAssistantSignal(page, { timeout: grokLive ? 60_000 : 25_000 })

            const afterPlan = await page.locator('#root').innerText()
            if (/Live preview is up for/i.test(afterPlan)) {
              throw new Error('built too early on single plan turn')
            }

            // Second nudge + build
            await sendPlanMessage(page, 'Scope v1: daily check-in, streaks, one dashboard')
            await sleep(grokLive ? 2000 : 1200)
            const buildVia = await triggerBuildPreview(page)
            const preview = await waitForSandpackOrBuildUI(page, {
              timeout: grokLive ? 90_000 : 60_000,
            })

            const chrome = await page.locator('#root').innerText()
            if (!/Ship|Polish|Plan|Preview/i.test(chrome)) {
              throw new Error('missing Ship/Polish/Plan chrome after build')
            }

            if (errors.length) throw new Error(errors[0])

            return `plan=${via} build=${buildVia} preview=${preview.kind} (${preview.sample}…)`
          } catch (e) {
            await saveFailureArtifacts(page, 'ui-flow')
            throw e
          }
        })
      },
      { attempts: UI_RETRIES, delayMs: 2000 },
    )
  },
)

// ── Summary ─────────────────────────────────────────────────────────────────

const hardFailed = results.filter((r) => !r.ok)
const passed = results.filter((r) => r.ok && !r.skipped).length
const skipped = results.filter((r) => r.skipped).length

console.log('\n---')
console.log(`${passed} passed · ${skipped} optional-skipped · ${hardFailed.length} failed`)
console.log(`Target: ${BASE} · API: ${API} · grokLive=${grokLive} · uiRetries=${UI_RETRIES}`)
if (hardFailed.length) {
  console.log('Failed:', hardFailed.map((f) => f.name).join(', '))
  console.log('Artifacts (if any): .smoke-artifacts/')
  process.exit(1)
}
console.log('Smoke test OK')