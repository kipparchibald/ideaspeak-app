/**
 * Ship job persistence — Supabase `deploy_jobs` with in-memory fallback.
 */

import type { ShipJobEvent, ShipJobRecord, ShipJobStatus } from './ship-orchestrator.js'

// ── DB row shape ─────────────────────────────────────────────────────────────

interface DeployJobRow {
  id: string
  user_id: string | null
  app_name: string
  app_slug: string
  status: string
  live_url: string | null
  repo_url: string | null
  events_json: ShipJobEvent[]
  error: string | null
  tenant_slug: string | null
  vercel_project_id: string | null
  created_at: string
  updated_at: string
}

type DeployJobPatch = Partial<
  Pick<
    DeployJobRow,
    | 'status'
    | 'live_url'
    | 'repo_url'
    | 'events_json'
    | 'error'
    | 'tenant_slug'
    | 'vercel_project_id'
    | 'updated_at'
  >
>

// ── In-memory fallback ───────────────────────────────────────────────────────

const memoryJobs = new Map<string, ShipJobRecord>()

// ── Supabase helpers ─────────────────────────────────────────────────────────

function supabaseConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_KEY?.trim()
  if (!url || !key) return null
  return { url, key }
}

export function isShipStorePersistent(): boolean {
  return supabaseConfig() !== null
}

function supabaseHeaders(key: string, prefer = 'return=representation'): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: prefer,
  }
}

function slugifyTenant(slug: string): string {
  return (
    slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'ideaspeak-app'
  )
}

/** Map orchestrator status ↔ DB status (edge queue uses `queued`). */
function statusToDb(status: ShipJobStatus): string {
  if (status === 'pending') return 'queued'
  return status
}

function statusFromDb(status: string): ShipJobStatus {
  if (status === 'queued') return 'pending'
  if (status === 'running' || status === 'success' || status === 'error') return status
  return 'pending'
}

function parseTimestamp(value: string | number | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const ms = Date.parse(value)
    if (Number.isFinite(ms)) return ms
  }
  return Date.now()
}

function rowToRecord(row: DeployJobRow): ShipJobRecord {
  const events = Array.isArray(row.events_json) ? row.events_json : []
  return {
    id: row.id,
    status: statusFromDb(row.status),
    appName: row.app_name,
    appSlug: row.app_slug,
    userId: row.user_id ?? undefined,
    createdAt: parseTimestamp(row.created_at),
    updatedAt: parseTimestamp(row.updated_at),
    events,
    repoUrl: row.repo_url ?? undefined,
    vercelProjectId: row.vercel_project_id ?? undefined,
    liveUrl: row.live_url ?? undefined,
    error: row.error ?? undefined,
  }
}

function recordToRow(record: ShipJobRecord): DeployJobRow {
  const nowIso = new Date(record.updatedAt).toISOString()
  return {
    id: record.id,
    user_id: record.userId ?? null,
    app_name: record.appName,
    app_slug: record.appSlug,
    status: statusToDb(record.status),
    live_url: record.liveUrl ?? null,
    repo_url: record.repoUrl ?? null,
    events_json: record.events,
    error: record.error ?? null,
    tenant_slug: slugifyTenant(record.appSlug),
    vercel_project_id: record.vercelProjectId ?? null,
    created_at: new Date(record.createdAt).toISOString(),
    updated_at: nowIso,
  }
}

function cacheRecord(record: ShipJobRecord): void {
  memoryJobs.set(record.id, record)
}

async function fetchDeployJobRow(id: string): Promise<DeployJobRow | null> {
  const cfg = supabaseConfig()
  if (!cfg) return null

  const res = await fetch(
    `${cfg.url}/rest/v1/deploy_jobs?id=eq.${encodeURIComponent(id)}&select=*`,
    {
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
      signal: AbortSignal.timeout(8000),
    },
  )

  if (!res.ok) return null
  const rows = (await res.json().catch(() => [])) as DeployJobRow[]
  return rows?.[0] ?? null
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function loadDeployJob(id: string): Promise<ShipJobRecord | null> {
  const cached = memoryJobs.get(id)
  if (cached) return cached

  const row = await fetchDeployJobRow(id)
  if (row) {
    const record = rowToRecord(row)
    cacheRecord(record)
    return record
  }

  return memoryJobs.get(id) ?? null
}

export async function saveDeployJob(record: ShipJobRecord): Promise<void> {
  cacheRecord(record)

  const cfg = supabaseConfig()
  if (!cfg) return

  const row = recordToRow(record)
  const res = await fetch(`${cfg.url}/rest/v1/deploy_jobs`, {
    method: 'POST',
    headers: supabaseHeaders(cfg.key, 'return=representation,resolution=merge-duplicates'),
    body: JSON.stringify(row),
    signal: AbortSignal.timeout(8000),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText)
    console.warn(`[ship-store] saveDeployJob ${record.id} failed: ${detail}`)
  }
}

export async function patchDeployJob(
  id: string,
  patch: Partial<
    Pick<
      ShipJobRecord,
      'status' | 'liveUrl' | 'repoUrl' | 'error' | 'vercelProjectId' | 'updatedAt' | 'events'
    >
  >,
): Promise<void> {
  const cached = memoryJobs.get(id)
  if (cached) {
    if (patch.status !== undefined) cached.status = patch.status
    if (patch.liveUrl !== undefined) cached.liveUrl = patch.liveUrl
    if (patch.repoUrl !== undefined) cached.repoUrl = patch.repoUrl
    if (patch.error !== undefined) cached.error = patch.error
    if (patch.vercelProjectId !== undefined) cached.vercelProjectId = patch.vercelProjectId
    if (patch.updatedAt !== undefined) cached.updatedAt = patch.updatedAt
    if (patch.events !== undefined) cached.events = patch.events
  }

  const cfg = supabaseConfig()
  if (!cfg) return

  const dbPatch: DeployJobPatch = {
    updated_at: new Date(patch.updatedAt ?? cached?.updatedAt ?? Date.now()).toISOString(),
  }

  if (patch.status !== undefined) dbPatch.status = statusToDb(patch.status)
  if (patch.liveUrl !== undefined) dbPatch.live_url = patch.liveUrl ?? null
  if (patch.repoUrl !== undefined) dbPatch.repo_url = patch.repoUrl ?? null
  if (patch.error !== undefined) dbPatch.error = patch.error ?? null
  if (patch.vercelProjectId !== undefined) {
    dbPatch.vercel_project_id = patch.vercelProjectId ?? null
  }
  if (patch.events !== undefined) dbPatch.events_json = patch.events
  if (cached?.appSlug) dbPatch.tenant_slug = slugifyTenant(cached.appSlug)

  const res = await fetch(
    `${cfg.url}/rest/v1/deploy_jobs?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders(cfg.key, 'return=minimal'),
      body: JSON.stringify(dbPatch),
      signal: AbortSignal.timeout(8000),
    },
  )

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText)
    console.warn(`[ship-store] patchDeployJob ${id} failed: ${detail}`)
  }
}

export async function appendDeployJobEvent(id: string, event: ShipJobEvent): Promise<void> {
  const cached = memoryJobs.get(id)
  if (cached) {
    cached.events.push(event)
    cached.updatedAt = Date.now()
  }

  const cfg = supabaseConfig()
  if (!cfg) return

  let events: ShipJobEvent[]
  if (cached) {
    events = cached.events
  } else {
    const row = await fetchDeployJobRow(id)
    events = Array.isArray(row?.events_json) ? [...row.events_json, event] : [event]
  }

  const res = await fetch(
    `${cfg.url}/rest/v1/deploy_jobs?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: supabaseHeaders(cfg.key, 'return=minimal'),
      body: JSON.stringify({
        events_json: events,
        updated_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(8000),
    },
  )

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText)
    console.warn(`[ship-store] appendDeployJobEvent ${id} failed: ${detail}`)
  }
}

/** Sync full record fields to store (status, urls, error). */
export async function syncDeployJobRecord(record: ShipJobRecord): Promise<void> {
  cacheRecord(record)
  if (!isShipStorePersistent()) return
  await patchDeployJob(record.id, {
    status: record.status,
    liveUrl: record.liveUrl,
    repoUrl: record.repoUrl,
    error: record.error,
    vercelProjectId: record.vercelProjectId,
    updatedAt: record.updatedAt,
  })
}