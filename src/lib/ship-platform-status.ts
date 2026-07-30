/**
 * Platform readiness — what works in-house today vs. provisioning stub.
 * Be honest: stub ≠ live URL. ZIP export is always the reliable path.
 */

import { fabricLiveUrl } from './fabric-tenant'

export type PlatformTier = 'live' | 'provisioning' | 'offline'

export interface PlatformReadiness {
  tier: PlatformTier
  grokLive: boolean
  supabaseConnected: boolean
  shipWorkerLive: boolean
  headline: string
  detail: string
  /** Reliable user action while not fully live */
  actionHint: string
  targetUrl?: string
}

const PROVISIONING_HEADLINE = 'Auto-deploy coming soon'
const PROVISIONING_DETAIL =
  'Grok and live preview work now. One-click GitHub → Vercel deploy is still connecting — use Ship → Download production ZIP until then.'

const LIVE_HEADLINE = 'Platform ready'
const LIVE_DETAIL = 'IdeaSpeak can provision GitHub, Vercel, and your live URL automatically.'

const OFFLINE_HEADLINE = 'Connecting to Grok…'
const OFFLINE_DETAIL = 'Checking the Grok API. Preview still works in Simulator mode from Settings.'

const CACHE_MS = 60_000
let readinessCache: { at: number; slug?: string; value: PlatformReadiness } | null = null

function apiBase(path: string): string {
  if (typeof window !== 'undefined') return path
  const base = process.env.IDEASPEAK_API || 'http://localhost:3001'
  return `${base.replace(/\/$/, '')}${path}`
}

/** Quick probe — safe to call on panel open (no secrets). */
export async function fetchPlatformReadiness(
  appSlug?: string,
  opts?: { force?: boolean },
): Promise<PlatformReadiness> {
  if (
    !opts?.force &&
    readinessCache &&
    Date.now() - readinessCache.at < CACHE_MS &&
    readinessCache.slug === appSlug
  ) {
    return readinessCache.value
  }

  let grokLive = false
  let supabaseConnected = false
  let shipWorkerLive = false

  try {
    const statusRes = await fetch(apiBase('/api/status'), { signal: AbortSignal.timeout(12_000) })
    const status = (await statusRes.json().catch(() => ({}))) as { live?: boolean }
    grokLive = Boolean(status.live)
  } catch {
    /* ignore */
  }

  try {
    const usageRes = await fetch(apiBase('/api/usage'), { signal: AbortSignal.timeout(12_000) })
    const usage = (await usageRes.json().catch(() => ({}))) as { authoritative?: boolean }
    supabaseConnected = Boolean(usage.authoritative)
  } catch {
    /* ignore */
  }

  try {
    const slug = appSlug || `probe-${Date.now()}`
    const postRes = await fetch(apiBase('/api/ship'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appName: 'Probe', appSlug: slug, scaffoldFileCount: 1 }),
      signal: AbortSignal.timeout(15_000),
    })
    const posted = (await postRes.json().catch(() => ({}))) as {
      job?: { id?: string }
      stub?: boolean
    }
    const jobId = posted.job?.id
    if (jobId) {
      const pollRes = await fetch(
        apiBase(`/api/ship?jobId=${encodeURIComponent(jobId)}`),
        { signal: AbortSignal.timeout(12_000) },
      )
      const polled = (await pollRes.json().catch(() => ({}))) as {
        stub?: boolean
        job?: { stub?: boolean }
      }
      const isStub = polled.stub === true || polled.job?.stub === true
      shipWorkerLive = !isStub && supabaseConnected
    }
  } catch {
    /* ignore */
  }

  const tier: PlatformTier = !grokLive
    ? 'offline'
    : shipWorkerLive
      ? 'live'
      : 'provisioning'

  const targetUrl = appSlug ? fabricLiveUrl(appSlug) : undefined

  const actionHint =
    tier === 'live'
      ? 'Open Launch for one-click GitHub → Vercel, or Ship for ZIP export.'
      : tier === 'provisioning'
        ? 'Use Ship → Download production ZIP — that path always works today.'
        : 'Open Settings if Real Grok is not connected; Simulator still demos the full loop.'

  const value: PlatformReadiness = {
    tier,
    grokLive,
    supabaseConnected,
    shipWorkerLive,
    headline:
      tier === 'live'
        ? LIVE_HEADLINE
        : tier === 'provisioning'
          ? PROVISIONING_HEADLINE
          : OFFLINE_HEADLINE,
    detail:
      tier === 'live'
        ? LIVE_DETAIL
        : tier === 'provisioning'
          ? supabaseConnected
            ? 'Database is connected — the deploy worker is still starting. ZIP export is ready now.'
            : PROVISIONING_DETAIL
          : OFFLINE_DETAIL,
    actionHint,
    targetUrl,
  }

  readinessCache = { at: Date.now(), slug: appSlug, value }
  return value
}

export function provisioningLaunchCopy(appSlug: string): {
  toastTitle: string
  toastDetail: string
  changelog: string
  suggestedUrl: string
  /** Do not present as a live production URL yet */
  isProvisional: true
} {
  const suggestedUrl = fabricLiveUrl(appSlug)
  return {
    toastTitle: 'Queued — ZIP is the reliable path',
    toastDetail:
      'Auto-deploy is still connecting. Open Ship → Download production ZIP for a runnable Next.js app right now.',
    changelog:
      'Launch queued on IdeaSpeak. Full auto-deploy to GitHub + Vercel activates when the platform worker is live. Until then: Ship → Download production ZIP (works today).',
    suggestedUrl,
    isProvisional: true,
  }
}
