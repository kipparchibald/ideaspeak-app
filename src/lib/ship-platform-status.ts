/**
 * Platform readiness — what works in-house today vs. provisioning stub.
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
  targetUrl?: string
}

const PROVISIONING_HEADLINE = 'Platform provisioning'
const PROVISIONING_DETAIL =
  'Your app is queued on IdeaSpeak. Full auto-deploy to GitHub and Vercel activates once our backend finishes connecting — no action needed from you.'

const LIVE_HEADLINE = 'Platform ready'
const LIVE_DETAIL = 'IdeaSpeak will provision GitHub, Vercel, and your live URL automatically.'

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

  const value: PlatformReadiness = {
    tier,
    grokLive,
    supabaseConnected,
    shipWorkerLive,
    headline: tier === 'live' ? LIVE_HEADLINE : tier === 'provisioning' ? PROVISIONING_HEADLINE : 'Connecting…',
    detail:
      tier === 'live'
        ? LIVE_DETAIL
        : tier === 'provisioning'
          ? supabaseConnected
            ? 'Database connected — deploy worker is still starting. Your launch is queued.'
            : PROVISIONING_DETAIL
          : 'Checking Grok connection…',
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
} {
  const suggestedUrl = fabricLiveUrl(appSlug)
  return {
    toastTitle: 'Queued on IdeaSpeak',
    toastDetail: `We're finishing platform setup. Target URL: ${suggestedUrl}`,
    changelog:
      'Your production package is queued. IdeaSpeak will push to GitHub and deploy to Vercel automatically when the platform worker is live.',
    suggestedUrl,
  }
}