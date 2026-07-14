/**
 * Compact platform status near Ship / Launch — in-house mode only.
 */

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  fetchPlatformReadiness,
  type PlatformReadiness,
  type PlatformTier,
} from '../lib/ship-platform-status'
import { isActiveShipJob, loadPersistedShipJob } from '../lib/ship-job-persist'

interface PlatformReadinessChipProps {
  appSlug?: string
  hasBuilt?: boolean
  onOpenLaunch?: () => void
}

const TIER_STYLES: Record<
  PlatformTier | 'deploying',
  { dot: string; label: string; border: string; bg: string; text: string }
> = {
  live: {
    dot: 'bg-[#00ff88]',
    label: 'Platform live',
    border: 'border-[#00ff88]/35',
    bg: 'bg-[#00ff88]/10',
    text: 'text-[#00ff88]',
  },
  provisioning: {
    dot: 'bg-[#fa0]',
    label: 'Provisioning',
    border: 'border-[#fa0]/35',
    bg: 'bg-[#fa0]/10',
    text: 'text-[#fa0]',
  },
  offline: {
    dot: 'bg-[#666]',
    label: 'Connecting',
    border: 'border-[#444]/50',
    bg: 'bg-[#111116]',
    text: 'text-[#888]',
  },
  deploying: {
    dot: 'bg-[#7dd3fc]',
    label: 'Deploying',
    border: 'border-[#7dd3fc]/40',
    bg: 'bg-[#7dd3fc]/12',
    text: 'text-[#7dd3fc]',
  },
}

export function PlatformReadinessChip({
  appSlug,
  hasBuilt = false,
  onOpenLaunch,
}: PlatformReadinessChipProps) {
  const [readiness, setReadiness] = useState<PlatformReadiness | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeDeploy, setActiveDeploy] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const persisted = loadPersistedShipJob()
      const slugMatch = !appSlug || persisted?.appSlug === appSlug
      setActiveDeploy(Boolean(persisted && slugMatch && isActiveShipJob(persisted)))
      const result = await fetchPlatformReadiness(appSlug)
      setReadiness(result)
    } catch {
      setReadiness(null)
    } finally {
      setLoading(false)
    }
  }, [appSlug])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 90_000)
    return () => clearInterval(timer)
  }, [refresh])

  if (loading && !readiness) {
    return (
      <span className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-[#1f1f27] text-[11px] text-[#666]">
        <Loader2 size={11} className="animate-spin" />
        <span className="hidden sm:inline">Platform</span>
      </span>
    )
  }

  const tier: PlatformTier | 'deploying' = activeDeploy
    ? 'deploying'
    : readiness?.tier ?? 'offline'
  const style = TIER_STYLES[tier]
  const title = activeDeploy
    ? 'Deploy in progress — open Launch to see timeline'
    : readiness
      ? `${readiness.headline}. ${readiness.detail}`
      : 'Checking IdeaSpeak platform status'

  const clickable = hasBuilt && onOpenLaunch

  return (
    <button
      type="button"
      onClick={clickable ? onOpenLaunch : undefined}
      disabled={!clickable}
      title={title}
      className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-[11px] font-semibold transition-opacity ${style.border} ${style.bg} ${style.text} ${
        clickable ? 'hover:opacity-90 cursor-pointer' : 'cursor-default opacity-90'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot} ${
          tier === 'deploying' || tier === 'provisioning' ? 'animate-pulse' : ''
        }`}
      />
      <span className="hidden sm:inline">{style.label}</span>
    </button>
  )
}