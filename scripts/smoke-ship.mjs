#!/usr/bin/env bun
/**
 * Smoke test for edge /api/ship — POST stub queue + GET poll.
 *
 * Usage:
 *   bun run smoke:ship
 *   BASE_URL=https://ideaspeak-app.vercel.app bun scripts/smoke-ship.mjs
 *
 * Expects Vercel edge api/ship.js (job envelope + stub when no Supabase row).
 */

const BASE =
  process.env.BASE_URL ||
  (process.argv.includes('--local') ? 'http://localhost:5173' : 'https://ideaspeak-app.vercel.app')

const API = BASE.includes('localhost:5173') ? 'http://localhost:3001' : BASE

function extractJob(data) {
  if (!data || typeof data !== 'object') return null
  if (data.job && typeof data.job === 'object') return data.job
  if (typeof data.id === 'string' || typeof data.jobId === 'string') return data
  return null
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function postShipJob() {
  const slug = `smoke-${Date.now()}`
  const res = await fetch(`${API}/api/ship`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appName: 'Smoke Ship Test',
      appSlug: slug,
      scaffoldFileCount: 1,
    }),
    signal: AbortSignal.timeout(30_000),
  })

  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`POST /api/ship returned non-JSON (${res.status}): ${text.slice(0, 200)}`)
  }

  assert(res.ok, `POST /api/ship failed (${res.status}): ${data.error || text}`)
  const job = extractJob(data)
  assert(job, 'POST response missing job envelope')
  const jobId = job.id || job.jobId
  assert(typeof jobId === 'string' && jobId.length > 0, 'job missing id')
  assert(typeof job.status === 'string' && job.status.length > 0, 'job missing status')

  return { jobId, status: job.status, job }
}

async function pollShipJob(jobId) {
  const params = new URLSearchParams({ jobId })
  const res = await fetch(`${API}/api/ship?${params.toString()}`, {
    signal: AbortSignal.timeout(30_000),
  })

  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`GET /api/ship returned non-JSON (${res.status}): ${text.slice(0, 200)}`)
  }

  assert(res.ok, `GET /api/ship failed (${res.status}): ${data.error || text}`)
  const job = extractJob(data)
  assert(job, 'GET response missing job envelope')
  const id = job.id || job.jobId
  assert(id === jobId, `poll id mismatch: expected ${jobId}, got ${id}`)
  assert(typeof job.status === 'string' && job.status.length > 0, 'polled job missing status')

  return job
}

console.log(`Ship smoke → ${API}/api/ship`)

const posted = await postShipJob()
console.log(`✓ POST queued job ${posted.jobId} (${posted.status})`)

const polled = await pollShipJob(posted.jobId)
console.log(`✓ GET polled job ${polled.id || polled.jobId} (${polled.status})`)

console.log('✓ smoke:ship passed')