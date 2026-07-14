/**
 * Phase A ship orchestrator — queue deploy jobs, poll status.
 * Heavy work runs on SHIP_WORKER_URL (Railway) when configured.
 */

import { corsHeaders, rejectBlockedOrigin, enforceRateLimit } from './security.js'

export const config = { runtime: 'edge' }

const LIMITS = {
  free: { builds: 25, ships: 5, polish: 0 },
  pro: { builds: 999, ships: 999, polish: 999 },
  team: { builds: 999, ships: 999, polish: 999 },
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10)
}

function jsonResponse(req, body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', ...extraHeaders },
  })
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_KEY?.trim()
  if (!url || !key) return null
  return { url, key }
}

function supabaseHeaders(key, prefer = 'return=representation') {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: prefer,
  }
}

async function supabaseUsage(userId) {
  const cfg = supabaseConfig()
  if (!cfg || !userId) return null

  const { url, key } = cfg
  const date = todayUtc()

  const profileRes = await fetch(`${url}/rest/v1/profiles?id=eq.${userId}&select=plan`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(8000),
  })
  const profiles = await profileRes.json().catch(() => [])
  const plan = profiles?.[0]?.plan || 'free'

  const usageRes = await fetch(
    `${url}/rest/v1/usage_daily?user_id=eq.${userId}&date=eq.${date}&select=builds,ships,polish`,
    {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8000),
    },
  )
  const rows = await usageRes.json().catch(() => [])
  const usage = rows?.[0] || { builds: 0, ships: 0, polish: 0 }
  const limits = LIMITS[plan] || LIMITS.free

  return { plan, usage, limits, authoritative: true }
}

async function checkShipEntitlement(userId) {
  const remote = await supabaseUsage(userId)
  if (!remote?.authoritative) {
    return { ok: true, recorded: false, reason: 'client_metering_only' }
  }

  const { usage, limits, plan } = remote
  if (limits.ships < 999 && usage.ships >= limits.ships) {
    return {
      ok: false,
      reason: `ship limit reached for ${plan} plan`,
      usage,
      limits,
    }
  }

  return { ok: true, recorded: true, remote }
}

async function recordShipUsage(userId) {
  const cfg = supabaseConfig()
  if (!cfg || !userId) return

  const date = todayUtc()
  await fetch(`${cfg.url}/rest/v1/rpc/increment_usage`, {
    method: 'POST',
    headers: supabaseHeaders(cfg.key, 'return=minimal'),
    body: JSON.stringify({ p_user_id: userId, p_kind: 'ship', p_date: date }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null)
}

function newJobId() {
  return `job-${Date.now()}`
}

function parseJobTimestamp(jobId) {
  const m = String(jobId || '').match(/^job-(\d+)/)
  if (!m) return null
  const ts = Number(m[1])
  return Number.isFinite(ts) ? ts : null
}

function normalizeEvents(raw) {
  if (Array.isArray(raw)) return raw
  return []
}

/** Map Supabase deploy_jobs row → client job envelope (camelCase). */
function rowToJob(row) {
  return {
    id: row.id,
    userId: row.user_id ?? null,
    appName: row.app_name || '',
    appSlug: row.app_slug || '',
    status: row.status || 'queued',
    liveUrl: row.live_url ?? null,
    repoUrl: row.repo_url ?? null,
    events: normalizeEvents(row.events_json ?? row.events),
    error: row.error ?? null,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  }
}

function jobEnvelope(job) {
  return { job }
}

async function insertDeployJob(row) {
  const cfg = supabaseConfig()
  if (!cfg) return null

  const res = await fetch(`${cfg.url}/rest/v1/deploy_jobs`, {
    method: 'POST',
    headers: supabaseHeaders(cfg.key),
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(8000),
  })

  if (!res.ok) return null
  const rows = await res.json().catch(() => [])
  return rows?.[0] || row
}

async function fetchDeployJob(jobId) {
  const cfg = supabaseConfig()
  if (!cfg || !jobId) return null

  const res = await fetch(
    `${cfg.url}/rest/v1/deploy_jobs?id=eq.${encodeURIComponent(jobId)}&select=*`,
    {
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
      signal: AbortSignal.timeout(8000),
    },
  )

  if (!res.ok) return null
  const rows = await res.json().catch(() => [])
  return rows?.[0] || null
}

function stubJobProgress(jobId) {
  const ts = parseJobTimestamp(jobId)
  if (!ts) {
    return {
      id: jobId,
      appName: '',
      appSlug: '',
      status: 'error',
      liveUrl: null,
      repoUrl: null,
      events: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stub: true,
      message: 'Invalid jobId — expected format job-<timestamp>',
    }
  }

  const elapsed = Date.now() - ts
  const events = [
    {
      id: 'stub-queue',
      step: 'queue',
      status: 'success',
      title: 'Queued',
      message: 'Local stub — connect Supabase + SHIP_WORKER_URL for real deploys.',
      timestamp: new Date(ts).toISOString(),
    },
  ]

  if (elapsed >= 2500) {
    events.push({
      id: 'stub-prepare',
      step: 'prepare',
      status: elapsed >= 12000 ? 'success' : 'running',
      title: 'Preparing scaffold',
      message: 'Packaging export files (simulated — no worker attached).',
      timestamp: new Date(ts + 2500).toISOString(),
    })
  }

  if (elapsed >= 12000) {
    events.push({
      id: 'stub-worker',
      step: 'worker',
      status: 'running',
      title: 'Waiting for worker',
      message: 'Set SHIP_WORKER_URL on Vercel to run GitHub + Vercel deploy steps.',
      timestamp: new Date(ts + 12000).toISOString(),
    })
  }

  let status = 'queued'
  if (elapsed >= 2000) status = 'running'

  return {
    id: jobId,
    appName: '',
    appSlug: '',
    status,
    liveUrl: null,
    repoUrl: null,
    events,
    createdAt: new Date(ts).toISOString(),
    updatedAt: new Date().toISOString(),
    stub: true,
    message: 'Stub orchestrator — job is not deploying until worker is configured.',
  }
}

function forwardToWorker(payload) {
  const workerUrl = process.env.SHIP_WORKER_URL?.trim()
  if (!workerUrl) return

  const headers = { 'Content-Type': 'application/json' }
  const secret = process.env.SHIP_WORKER_SECRET?.trim()
  if (secret) headers['x-ship-worker-secret'] = secret

  fetch(`${workerUrl.replace(/\/$/, '')}/api/ship`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  }).catch(() => null)
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }

  const blocked = rejectBlockedOrigin(req)
  if (blocked) return blocked

  if (req.method === 'GET') {
    const url = new URL(req.url)
    const jobId = url.searchParams.get('jobId')?.trim() || ''

    if (!jobId) {
      return jsonResponse(req, { error: 'jobId query param required' }, 400)
    }

    const row = await fetchDeployJob(jobId)
    if (row) {
      return jsonResponse(req, jobEnvelope(rowToJob(row)))
    }

    return jsonResponse(req, jobEnvelope(stubJobProgress(jobId)))
  }

  if (req.method === 'POST') {
    const { blocked: limited, headers: rateHeaders } = enforceRateLimit(req)
    if (limited) return limited

    const body = await req.json().catch(() => ({}))
    const appName = String(body.appName || '').trim()
    const appSlug = String(body.appSlug || '').trim()
    const idea = body.idea != null ? String(body.idea) : undefined
    const userId = body.userId != null ? String(body.userId).trim() : undefined
    const scaffoldFileCount =
      body.scaffoldFileCount != null ? Number(body.scaffoldFileCount) : undefined
    const scaffoldFiles =
      body.scaffoldFiles && typeof body.scaffoldFiles === 'object' ? body.scaffoldFiles : undefined

    if (!appName || !appSlug) {
      return jsonResponse(req, { error: 'appName and appSlug are required' }, 400)
    }

    if (userId) {
      const gate = await checkShipEntitlement(userId)
      if (!gate.ok) {
        return jsonResponse(
          req,
          {
            ok: false,
            reason: gate.reason,
            usage: gate.usage,
            limits: gate.limits,
          },
          429,
        )
      }
    }

    const jobId = newJobId()
    const now = new Date().toISOString()
    const cfg = supabaseConfig()

    if (cfg) {
      const row = {
        id: jobId,
        user_id: userId || null,
        app_name: appName,
        app_slug: appSlug,
        status: 'queued',
        live_url: null,
        repo_url: null,
        events_json: [],
        created_at: now,
        updated_at: now,
      }

      const inserted = await insertDeployJob(row)
      if (!inserted) {
        return jsonResponse(req, { error: 'Failed to queue deploy job' }, 500)
      }

      if (userId) await recordShipUsage(userId)

      const payload = {
        jobId,
        appName,
        appSlug,
        idea,
        userId,
        scaffoldFileCount,
        scaffoldFiles,
      }
      forwardToWorker(payload)

      return jsonResponse(
        req,
        jobEnvelope(
          rowToJob(
            inserted?.id
              ? inserted
              : {
                  id: jobId,
                  user_id: userId || null,
                  app_name: appName,
                  app_slug: appSlug,
                  status: 'queued',
                  live_url: null,
                  repo_url: null,
                  events_json: [],
                  created_at: now,
                  updated_at: now,
                },
          ),
        ),
        200,
        rateHeaders,
      )
    }

    const payload = {
      jobId,
      appName,
      appSlug,
      idea,
      userId,
      scaffoldFileCount,
      scaffoldFiles,
    }
    forwardToWorker(payload)

    return jsonResponse(
      req,
      jobEnvelope({
        id: jobId,
        userId: userId ?? null,
        appName,
        appSlug,
        status: 'queued',
        liveUrl: null,
        repoUrl: null,
        events: [],
        createdAt: now,
        updatedAt: now,
      }),
      200,
      rateHeaders,
    )
  }

  return jsonResponse(req, { error: 'Method not allowed' }, 405)
}