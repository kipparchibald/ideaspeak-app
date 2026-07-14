/**
 * Persist active server ship jobs — resume timeline after panel close.
 */

import {
  TERMINAL_SHIP_JOB_STATUSES,
  type ShipJobEvent,
  type ShipJobRecord,
  type ShipJobStatus,
} from './ship-job-types'

const STORAGE_KEY = 'ideaspeak_active_ship_job'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface PersistedShipJob {
  jobId: string
  appSlug: string
  appName: string
  status: ShipJobStatus
  stub?: boolean
  events: ShipJobEvent[]
  deployChangelog?: string
  liveUrl?: string
  repoUrl?: string
  startedAt: number
  updatedAt: number
}

export function isActiveShipJob(job: Pick<PersistedShipJob, 'status'>): boolean {
  return job.status === 'queued' || job.status === 'running'
}

export function loadPersistedShipJob(): PersistedShipJob | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedShipJob
    if (!parsed?.jobId || !parsed.appSlug) return null
    if (Date.now() - (parsed.updatedAt || parsed.startedAt) > MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function savePersistedShipJob(patch: Partial<PersistedShipJob> & { jobId: string; appSlug: string }) {
  const prev = loadPersistedShipJob()
  const now = Date.now()
  const next: PersistedShipJob = {
    jobId: patch.jobId,
    appSlug: patch.appSlug,
    appName: patch.appName ?? prev?.appName ?? '',
    status: patch.status ?? prev?.status ?? 'queued',
    stub: patch.stub ?? prev?.stub,
    events: patch.events ?? prev?.events ?? [],
    deployChangelog: patch.deployChangelog ?? prev?.deployChangelog,
    liveUrl: patch.liveUrl ?? prev?.liveUrl,
    repoUrl: patch.repoUrl ?? prev?.repoUrl,
    startedAt: prev?.startedAt ?? now,
    updatedAt: now,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function syncPersistedShipJob(job: ShipJobRecord, extras?: Partial<PersistedShipJob>) {
  savePersistedShipJob({
    jobId: job.id,
    appSlug: job.appSlug,
    appName: job.appName,
    status: job.status,
    stub: job.stub,
    events: job.events,
    liveUrl: job.liveUrl ?? undefined,
    repoUrl: job.repoUrl ?? undefined,
    ...extras,
  })
  if (TERMINAL_SHIP_JOB_STATUSES.has(job.status)) {
    clearPersistedShipJob()
  }
}

export function clearPersistedShipJob() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}