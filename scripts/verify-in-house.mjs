#!/usr/bin/env bun
/**
 * Verify in-house platform wiring after setup.
 */

const PROD = process.env.BASE_URL || 'https://ideaspeak-app.vercel.app'
const RAILWAY = process.env.RAILWAY_PUBLIC_URL || process.env.SHIP_WORKER_URL

let passed = 0
let failed = 0

function ok(msg) {
  passed++
  console.log(`✓ ${msg}`)
}
function fail(msg) {
  failed++
  console.log(`✗ ${msg}`)
}

async function get(path, base = PROD) {
  const res = await fetch(`${base}${path}`)
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

console.log(`Verifying in-house setup → ${PROD}\n`)

const status = await get('/api/status')
if (status.ok && status.data.live) ok(`Grok live (${status.data.source})`)
else fail(`Grok not live — set XAI_API_KEY on Vercel`)

const usage = await get('/api/usage')
if (usage.ok && usage.data.authoritative) ok('Supabase usage gate (authoritative)')
else fail('Supabase not wired — set SUPABASE_URL + SUPABASE_SERVICE_KEY on Vercel')

const shipPost = await fetch(`${PROD}/api/ship`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    appName: 'Verify',
    appSlug: 'verify-in-house',
    scaffoldFileCount: 35,
  }),
})
const shipBody = await shipPost.json().catch(() => ({}))
const jobId = shipBody?.job?.id
if (shipPost.ok && jobId) ok(`Ship queue jobId=${jobId}`)
else fail('POST /api/ship failed')

if (jobId) {
  await new Promise((r) => setTimeout(r, 1500))
  const poll = await get(`/api/ship?jobId=${encodeURIComponent(jobId)}`)
  if (poll.ok && poll.data?.job?.id === jobId) {
    if (poll.data.stub) fail('Ship still in stub mode — set SHIP_WORKER_URL + Supabase')
    else ok(`Ship poll status=${poll.data.job?.status || poll.data.status}`)
  } else fail('GET /api/ship poll failed')
}

if (RAILWAY) {
  const health = await get('/health', RAILWAY.replace(/\/$/, ''))
  if (health.ok) ok(`Railway health ${RAILWAY}`)
  else fail(`Railway /health failed at ${RAILWAY}`)
} else {
  fail('RAILWAY_PUBLIC_URL not set — pass env or set SHIP_WORKER_URL')
}

console.log(`\n${passed} passed · ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)