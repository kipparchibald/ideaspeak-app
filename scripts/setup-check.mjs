#!/usr/bin/env bun
/**
 * Quick local setup check — what's configured vs missing.
 * Usage: bun scripts/setup-check.mjs
 *        API=http://localhost:3001 bun scripts/setup-check.mjs
 */

const API = (process.env.API || 'http://localhost:3001').replace(/\/$/, '')

const CHECKS = [
  { key: 'grok', label: 'Grok API (XAI_API_KEY)', paths: ['/api/status', '/health'] },
  { key: 'capabilities', label: 'Capabilities probe', paths: ['/api/capabilities'] },
]

async function get(path) {
  const res = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(8000) })
  return res.json().catch(() => ({}))
}

console.log(`\nIdeaSpeak setup check — ${API}\n`)

try {
  const status = await get('/api/status')
  const caps = await get('/api/capabilities')
  const health = await get('/health')

  const grokLive = status.live === true
  console.log(grokLive ? '✓' : '✗', 'Grok API', grokLive ? `live (${status.model})` : status.message || 'missing')

  if (caps.capabilities) {
    const c = caps.capabilities
    const rows = [
      ['Voice / build / discuss', c.grok],
      ['E2B sandbox', c.e2b],
      ['Supabase server', c.supabaseServer],
      ['Ship worker', c.shipWorker],
      ['Stripe', c.stripe],
      ['GitHub server token', c.githubServer],
    ]
    for (const [name, ok] of rows) {
      console.log(ok ? '✓' : '○', name, ok ? 'configured' : 'not set (optional)')
    }
    if (caps.models) {
      console.log('  models:', `chat=${caps.models.chat}`, `build=${caps.models.build}`)
    }
  }

  if (health.features) {
    console.log('\nServer feature flags:', health.features)
  }

  if (!grokLive) {
    console.log('\n→ Add XAI_API_KEY to .env.local (see .env.example)')
    console.log('→ Then: bun run dev:full')
  } else {
    console.log('\nCore stack ready for local dev.')
  }
} catch (e) {
  console.error('✗ API not reachable — run: bun run dev:full')
  console.error(' ', e?.message || e)
  process.exit(1)
}