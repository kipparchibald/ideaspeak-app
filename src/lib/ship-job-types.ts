/**
 * Ship orchestrator job types — persisted in Supabase `deploy_jobs`.
 */

import type { LaunchEventStatus, LaunchStep } from './autopilot'

export type ShipJobStatus =
  | 'queued'
  | 'running'
  | 'success'
  | 'error'
  | 'cancelled'
  | 'failed'

export interface ShipJobEvent {
  id: string
  step: LaunchStep
  status: LaunchEventStatus
  title: string
  message: string
  timestamp: number
  url?: string
  error?: string
  meta?: Record<string, string>
}

export interface ShipJobRecord {
  id: string
  userId?: string | null
  appName: string
  appSlug: string
  status: ShipJobStatus
  liveUrl?: string | null
  repoUrl?: string | null
  events: ShipJobEvent[]
  error?: string | null
  createdAt: string
  updatedAt: string
  /** Edge stub mode — worker/Supabase not fully wired */
  stub?: boolean
  platformMessage?: string | null
}

export interface StartShipJobOpts {
  appName: string
  appSlug: string
  idea?: string
  userId?: string | null
  /** Production scaffold — required for Railway worker deploy */
  scaffoldFiles?: Record<string, string>
  scaffoldFileCount?: number
}

export interface PollShipJobOpts {
  onEvent?: (event: ShipJobEvent) => void
  intervalMs?: number
  timeoutMs?: number
  /** Stop early in stub mode after showing provisioning steps */
  stubTimeoutMs?: number
  signal?: AbortSignal
}

export const TERMINAL_SHIP_JOB_STATUSES: ReadonlySet<ShipJobStatus> = new Set([
  'success',
  'error',
  'cancelled',
  'failed',
])