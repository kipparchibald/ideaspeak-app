/**
 * Ship orchestrator client — POST/GET /api/ship + polling.
 */

import {
  TERMINAL_SHIP_JOB_STATUSES,
  type PollShipJobOpts,
  type ShipJobEvent,
  type ShipJobRecord,
  type ShipJobStatus,
  type StartShipJobOpts,
} from './ship-job-types'

export type {
  PollShipJobOpts,
  ShipJobEvent,
  ShipJobRecord,
  ShipJobStatus,
  StartShipJobOpts,
} from './ship-job-types'

export { TERMINAL_SHIP_JOB_STATUSES } from './ship-job-types'

function apiBase(path: string): string {
  if (typeof window !== 'undefined') return path
  const base = process.env.IDEASPEAK_API || 'http://localhost:3001'
  return `${base.replace(/\/$/, '')}${path}`
}

export class ShipJobApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ShipJobApiError'
    this.status = status
  }
}

function normalizeEvent(raw: unknown, index: number): ShipJobEvent | null {
  if (!raw || typeof raw !== 'object') return null
  const ev = raw as Record<string, unknown>
  const step = ev.step
  const status = ev.status
  if (typeof step !== 'string' || typeof status !== 'string') return null
  return {
    id: typeof ev.id === 'string' ? ev.id : `ship-ev-${index}`,
    step: step as ShipJobEvent['step'],
    status: status as ShipJobEvent['status'],
    title: typeof ev.title === 'string' ? ev.title : 'Ship',
    message: typeof ev.message === 'string' ? ev.message : '',
    timestamp: typeof ev.timestamp === 'number' ? ev.timestamp : Date.now(),
    url: typeof ev.url === 'string' ? ev.url : undefined,
    error: typeof ev.error === 'string' ? ev.error : undefined,
    meta:
      ev.meta && typeof ev.meta === 'object' && !Array.isArray(ev.meta)
        ? (ev.meta as Record<string, string>)
        : undefined,
  }
}

function normalizeEvents(raw: unknown): ShipJobEvent[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item, i) => normalizeEvent(item, i))
    .filter((ev): ev is ShipJobEvent => ev !== null)
}

export function normalizeShipJobRecord(raw: unknown): ShipJobRecord {
  if (!raw || typeof raw !== 'object') {
    throw new ShipJobApiError('Invalid ship job response', 500)
  }
  const row = raw as Record<string, unknown>
  const id = typeof row.id === 'string' ? row.id : ''
  if (!id) throw new ShipJobApiError('Ship job missing id', 500)

  const status =
    typeof row.status === 'string' ? (row.status as ShipJobStatus) : 'queued'

  return {
    id,
    userId:
      typeof row.userId === 'string'
        ? row.userId
        : typeof row.user_id === 'string'
          ? row.user_id
          : row.userId === null || row.user_id === null
            ? null
            : undefined,
    appName:
      typeof row.appName === 'string'
        ? row.appName
        : typeof row.app_name === 'string'
          ? row.app_name
          : '',
    appSlug:
      typeof row.appSlug === 'string'
        ? row.appSlug
        : typeof row.app_slug === 'string'
          ? row.app_slug
          : '',
    status,
    liveUrl:
      typeof row.liveUrl === 'string'
        ? row.liveUrl
        : typeof row.live_url === 'string'
          ? row.live_url
          : row.liveUrl === null || row.live_url === null
            ? null
            : undefined,
    repoUrl:
      typeof row.repoUrl === 'string'
        ? row.repoUrl
        : typeof row.repo_url === 'string'
          ? row.repo_url
          : row.repoUrl === null || row.repo_url === null
            ? null
            : undefined,
    events: normalizeEvents(row.events ?? row.events_json ?? row.eventsJson),
    error:
      typeof row.error === 'string'
        ? row.error
        : row.error === null
          ? null
          : undefined,
    createdAt:
      typeof row.createdAt === 'string'
        ? row.createdAt
        : typeof row.created_at === 'string'
          ? row.created_at
          : new Date().toISOString(),
    updatedAt:
      typeof row.updatedAt === 'string'
        ? row.updatedAt
        : typeof row.updated_at === 'string'
          ? row.updated_at
          : new Date().toISOString(),
  }
}

function extractJobPayload(data: unknown): ShipJobRecord {
  if (!data || typeof data !== 'object') {
    throw new ShipJobApiError('Invalid ship job response', 500)
  }
  const envelope = data as Record<string, unknown>
  if (envelope.job && typeof envelope.job === 'object') {
    return normalizeShipJobRecord(envelope.job)
  }
  return normalizeShipJobRecord(envelope)
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; message?: string }
    return data.error || data.message || res.statusText || 'Ship job request failed'
  } catch {
    return res.statusText || 'Ship job request failed'
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Launch cancelled', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Launch cancelled', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** POST /api/ship — enqueue a server-side deploy job. */
export async function startShipJob(opts: StartShipJobOpts): Promise<{ job: ShipJobRecord }> {
  const res = await fetch(apiBase('/api/ship'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appName: opts.appName,
      appSlug: opts.appSlug,
      idea: opts.idea,
      userId: opts.userId ?? undefined,
      scaffoldFiles: opts.scaffoldFiles,
      scaffoldFileCount:
        opts.scaffoldFileCount ??
        (opts.scaffoldFiles ? Object.keys(opts.scaffoldFiles).length : undefined),
    }),
  })

  if (!res.ok) {
    throw new ShipJobApiError(await parseError(res), res.status)
  }

  const data = await res.json().catch(() => ({}))
  return { job: extractJobPayload(data) }
}

/** GET /api/ship?jobId= — fetch current job snapshot. */
export async function fetchShipJob(jobId: string): Promise<ShipJobRecord> {
  const params = new URLSearchParams({ jobId })
  const res = await fetch(apiBase(`/api/ship?${params.toString()}`))

  if (!res.ok) {
    throw new ShipJobApiError(await parseError(res), res.status)
  }

  const data = await res.json().catch(() => ({}))
  return extractJobPayload(data)
}

function emitNewEvents(
  events: ShipJobEvent[],
  seen: Map<string, string>,
  onEvent?: (event: ShipJobEvent) => void,
) {
  for (const ev of events) {
    const snapshot = JSON.stringify(ev)
    const prev = seen.get(ev.id)
    if (prev !== snapshot) {
      seen.set(ev.id, snapshot)
      onEvent?.(ev)
    }
  }
}

/** Poll until the job reaches a terminal status. */
export async function pollShipJob(
  jobId: string,
  opts?: PollShipJobOpts,
): Promise<ShipJobRecord> {
  const intervalMs = opts?.intervalMs ?? 2000
  const timeoutMs = opts?.timeoutMs ?? 10 * 60 * 1000
  const seen = new Map<string, string>()
  const started = Date.now()

  while (true) {
    if (opts?.signal?.aborted) {
      throw new DOMException('Launch cancelled', 'AbortError')
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error('Ship job timed out')
    }

    const job = await fetchShipJob(jobId)
    emitNewEvents(job.events, seen, opts?.onEvent)

    if (TERMINAL_SHIP_JOB_STATUSES.has(job.status)) {
      return job
    }

    await sleep(intervalMs, opts?.signal)
  }
}

/** True when /api/ship responds (any non-network failure still means route exists). */
export async function isShipJobApiAvailable(): Promise<boolean> {
  try {
    const res = await fetch(apiBase('/api/ship'), { method: 'OPTIONS' })
    return res.status !== 404
  } catch {
    return false
  }
}