/**
 * LaunchAutopilotPanel — vertical timeline: GitHub → Vercel → env → domain → live.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  FolderGit2,
  Rocket,
  Key,
  Globe,
  CheckCircle2,
  ExternalLink,
  Copy,
  ChevronDown,
  Sparkles,
  Circle,
  Loader2,
  AlertCircle,
  Play,
  Eye,
  EyeOff,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  LaunchStep,
  LAUNCH_STEPS,
  AUTOPILOT_LINKS,
  GITHUB_TOKEN_KEY,
  loadGithubToken,
  saveGithubToken,
  loadAutopilotState,
  saveAutopilotState,
  runLaunchAutopilot,
  vercelEnvVars,
  type LaunchTimelineEvent,
  type LaunchEventStatus,
} from '../lib/autopilot'
import { loadShipPrefs, saveShipPrefs, slugify, type ShipPreferences } from '../lib/ship'
import { getSupabaseUser } from '../lib/supabase'
import {
  startShipJob,
  pollShipJob,
  ShipJobApiError,
  formatShipChangelog,
  getLastDeployChange,
  type ShipJobEvent,
} from '../lib/ship-jobs'
import { speak } from '../lib/tts'
import { IN_HOUSE_PLATFORM, PLATFORM_COPY } from '../lib/platform'
import { fabricLiveUrl } from '../lib/fabric-tenant'
import {
  fetchPlatformReadiness,
  provisioningLaunchCopy,
  type PlatformReadiness,
} from '../lib/ship-platform-status'

const STEP_ICONS: Record<LaunchStep, typeof FolderGit2> = {
  [LaunchStep.github]: FolderGit2,
  [LaunchStep.vercel]: Rocket,
  [LaunchStep.env]: Key,
  [LaunchStep.domain]: Globe,
  [LaunchStep.done]: CheckCircle2,
}

function statusColor(status: LaunchEventStatus): string {
  switch (status) {
    case 'success':
      return 'text-[#00ff88]'
    case 'running':
      return 'text-[#7dd3fc]'
    case 'error':
      return 'text-red-400'
    case 'manual':
    case 'waiting':
      return 'text-[#fa0]'
    case 'skipped':
      return 'text-[#555]'
    default:
      return 'text-[#666]'
  }
}

function StatusIcon({ status }: { status: LaunchEventStatus }) {
  if (status === 'success') return <CheckCircle2 size={16} className="text-[#00ff88]" />
  if (status === 'running') return <Loader2 size={16} className="text-[#7dd3fc] animate-spin" />
  if (status === 'error') return <AlertCircle size={16} className="text-red-400" />
  if (status === 'skipped') return <Circle size={16} className="text-[#444]" />
  return <Circle size={16} className="text-[#333]" />
}

interface LaunchAutopilotPanelProps {
  open: boolean
  onClose: () => void
  hasBuilt: boolean
  defaultAppName?: string
  /** Returns production scaffold (same as Ship ZIP) */
  getScaffoldFiles: (prefs: ShipPreferences) => Promise<Record<string, string>>
}

export function LaunchAutopilotPanel({
  open,
  onClose,
  hasBuilt,
  defaultAppName = 'My IdeaSpeak App',
  getScaffoldFiles,
}: LaunchAutopilotPanelProps) {
  const [prefs, setPrefs] = useState<ShipPreferences>(() => loadShipPrefs())
  const [expanded, setExpanded] = useState<LaunchStep | null>(LaunchStep.github)
  const [githubToken, setGithubToken] = useState(() => loadGithubToken())
  const [showToken, setShowToken] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [useServerAutopilot] = useState(() => IN_HOUSE_PLATFORM || !loadGithubToken().trim())
  const [events, setEvents] = useState<LaunchTimelineEvent[]>([])
  const [deployChangelog, setDeployChangelog] = useState<string | null>(null)
  const [liveUrl, setLiveUrl] = useState(() => loadAutopilotState()?.liveUrl || '')
  const [platformReadiness, setPlatformReadiness] = useState<PlatformReadiness | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) return
    const loaded = loadShipPrefs()
    if (!loaded.appName || loaded.appName === 'My IdeaSpeak App') {
      loaded.appName = defaultAppName
      loaded.appSlug = slugify(defaultAppName)
    }
    const saved = loadAutopilotState()
    const targetUrl = fabricLiveUrl(loaded.appSlug)
    if (IN_HOUSE_PLATFORM && !saved?.liveUrl) {
      loaded.vercelProjectUrl = targetUrl
      saveShipPrefs(loaded)
    }
    setPrefs(loaded)
    setGithubToken(loadGithubToken())
    if (IN_HOUSE_PLATFORM) {
      setLiveUrl(saved?.liveUrl || targetUrl)
    } else if (saved?.liveUrl) {
      setLiveUrl(saved.liveUrl)
    }
    if (saved?.repoUrl && !loaded.githubRepoUrl) {
      loaded.githubRepoUrl = saved.repoUrl
      setPrefs(loaded)
    }

    if (IN_HOUSE_PLATFORM) {
      setPlatformReadiness(null)
      void fetchPlatformReadiness(loaded.appSlug)
        .then(setPlatformReadiness)
        .catch(() => null)
    }
  }, [open, defaultAppName])

  const stepStatus = useMemo(() => {
    const map = new Map<LaunchStep, LaunchTimelineEvent>()
    for (const ev of events) {
      const prev = map.get(ev.step)
      if (!prev || ev.timestamp >= prev.timestamp) map.set(ev.step, ev)
    }
    return map
  }, [events])

  const launchProgress = useMemo(() => {
    const order = LAUNCH_STEPS.map((s) => s.id)
    const done = order.filter((id) => {
      const st = stepStatus.get(id)?.status
      return st === 'success' || st === 'manual' || st === 'skipped' || st === 'waiting'
    }).length
    return Math.round((done / order.length) * 100)
  }, [stepStatus])

  const envVars = useMemo(
    () => vercelEnvVars(prefs.supabase.url, prefs.supabase.anonKey),
    [prefs.supabase.url, prefs.supabase.anonKey],
  )

  const update = (patch: Partial<ShipPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      if (patch.appName && !patch.appSlug) next.appSlug = slugify(patch.appName)
      saveShipPrefs(next)
      return next
    })
  }

  const saveToken = (value: string) => {
    setGithubToken(value)
    saveGithubToken(value)
  }

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copied`)
    } catch {
      toast.error('Could not copy')
    }
  }

  const handleLiveUrl = (url: string) => {
    const trimmed = url.trim()
    setLiveUrl(trimmed)
    if (trimmed) {
      update({ vercelProjectUrl: trimmed })
      saveAutopilotState({ liveUrl: trimmed })
    }
  }

  const pushTimelineEvent = useCallback((ev: LaunchTimelineEvent | ShipJobEvent) => {
    setEvents((prev) => {
      const idx = prev.findIndex((e) => e.id === ev.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = ev
        return next
      }
      return [...prev, ev]
    })
    if (ev.step !== LaunchStep.done) setExpanded(ev.step)
  }, [])

  const runClientAutopilot = useCallback(
    async (scaffold: Record<string, string>, signal: AbortSignal) => {
      const result = await runLaunchAutopilot({
        scaffoldFiles: scaffold,
        appName: prefs.appName,
        slug: prefs.appSlug,
        githubToken: githubToken.trim() || undefined,
        supabaseUrl: prefs.supabase.url,
        supabaseAnonKey: prefs.supabase.anonKey,
        customDomain: prefs.customDomain,
        existingRepoUrl: prefs.githubRepoUrl || undefined,
        signal,
        onProgress: pushTimelineEvent,
        onOpenUrl: (url) => {
          window.open(url, '_blank', 'noopener,noreferrer')
        },
      })

      if (result.repoUrl) {
        update({ githubRepoUrl: result.repoUrl })
        saveAutopilotState({ repoUrl: result.repoUrl, vercelDeployUrl: result.vercelDeployUrl || '' })
      }
      if (result.suggestedLiveUrl && !liveUrl) {
        setLiveUrl(result.suggestedLiveUrl)
      }

      setExpanded(LaunchStep.done)
      toast.success('Launch Autopilot started', {
        description: 'Finish Vercel import in the other tab, then paste your live URL',
      })
    },
    [prefs, githubToken, liveUrl, pushTimelineEvent],
  )

  const handleLaunch = useCallback(async () => {
    if (!hasBuilt) {
      toast.error('Build an app in preview first')
      return
    }

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setLaunching(true)
    setEvents([])
    setDeployChangelog(null)
    setExpanded(LaunchStep.github)

    try {
      const scaffold = await getScaffoldFiles(prefs)

      if (useServerAutopilot) {
        try {
          const user = await getSupabaseUser()
          const { job } = await startShipJob({
            appName: prefs.appName,
            appSlug: prefs.appSlug,
            idea: defaultAppName,
            userId: user?.id,
            scaffoldFiles: scaffold,
            scaffoldFileCount: Object.keys(scaffold).length,
          })

          for (const ev of job.events) pushTimelineEvent(ev)

          const isStubJob = job.stub === true
          const final = await pollShipJob(job.id, {
            signal: ac.signal,
            onEvent: pushTimelineEvent,
            stubTimeoutMs: isStubJob ? 18_000 : undefined,
          })

          const stubMode = final.stub === true || isStubJob

          if (final.repoUrl) {
            update({ githubRepoUrl: final.repoUrl })
            saveAutopilotState({ repoUrl: final.repoUrl })
          }

          const targetUrl = fabricLiveUrl(prefs.appSlug)
          if (final.liveUrl) {
            handleLiveUrl(final.liveUrl)
          } else if (stubMode && IN_HOUSE_PLATFORM) {
            handleLiveUrl(targetUrl)
          }

          setExpanded(LaunchStep.done)

          if (stubMode) {
            const copy = provisioningLaunchCopy(prefs.appSlug)
            setDeployChangelog(copy.changelog)
            toast.message(copy.toastTitle, { description: copy.toastDetail })
            void speak(copy.changelog, { provider: 'auto' }).catch(() => null)
          } else {
            const changelog = formatShipChangelog(final.events)
            setDeployChangelog(getLastDeployChange(final.events) || changelog)

            if (final.status === 'success') {
              toast.success('Server Autopilot finished', {
                description: changelog || final.liveUrl || 'Your app is deploying on the server',
              })
              void speak(changelog, { provider: 'auto' }).catch(() => null)
            } else if (final.error) {
              toast.error(final.error)
            }
          }
          return
        } catch (serverErr) {
          if (IN_HOUSE_PLATFORM) throw serverErr
          const unavailable =
            serverErr instanceof ShipJobApiError &&
            (serverErr.status === 404 || serverErr.status === 501 || serverErr.status === 503)
          if (!unavailable) throw serverErr
          toast.message('Server Autopilot unavailable — using browser mode')
        }
      }

      if (!IN_HOUSE_PLATFORM) {
        await runClientAutopilot(scaffold, ac.signal)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast.message('Launch cancelled')
      } else {
        const msg = err instanceof Error ? err.message : 'Launch failed'
        toast.error(msg)
      }
    } finally {
      setLaunching(false)
    }
  }, [
    hasBuilt,
    getScaffoldFiles,
    prefs,
    useServerAutopilot,
    defaultAppName,
    pushTimelineEvent,
    runClientAutopilot,
  ])

  const cancelLaunch = () => {
    abortRef.current?.abort()
    setLaunching(false)
  }

  const repoUrl = prefs.githubRepoUrl || stepStatus.get(LaunchStep.github)?.url || ''
  const vercelUrl =
    repoUrl ? AUTOPILOT_LINKS.vercelDeploy(repoUrl) : AUTOPILOT_LINKS.vercelNew

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[115] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md p-0 sm:p-6"
          onClick={(e) => e.target === e.currentTarget && !launching && onClose()}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-[#1f1f27] bg-[#0e0e14] shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="shrink-0 px-5 pt-5 pb-4 border-b border-[#1f1f27]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-[#7dd3fc]/12 border border-[#7dd3fc]/30 flex items-center justify-center">
                    <Sparkles size={18} className="text-[#7dd3fc]" />
                  </div>
                  <div>
                    <h2 className="text-[17px] font-semibold tracking-tight text-[#e8e8f0]">
                      {IN_HOUSE_PLATFORM ? PLATFORM_COPY.shipHeadline : 'Launch Autopilot'}
                    </h2>
                    <p className="text-[12px] text-[#666]">
                      {IN_HOUSE_PLATFORM
                        ? PLATFORM_COPY.shipSub
                        : 'GitHub → Vercel → env → domain → live URL'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  disabled={launching}
                  className="p-2 rounded-lg text-[#666] hover:text-[#ccc] hover:bg-white/5 disabled:opacity-40"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <label className="block col-span-2 sm:col-span-1">
                  <span className="text-[10px] font-semibold text-[#666] uppercase tracking-wider">
                    App name
                  </span>
                  <input
                    value={prefs.appName}
                    onChange={(e) => update({ appName: e.target.value })}
                    disabled={launching}
                    className="mt-1 w-full bg-[#111116] border border-[#1f1f27] rounded-xl px-3 py-2 text-[12px] text-[#e8e8f0] outline-none focus:border-[#7dd3fc]/40 disabled:opacity-50"
                  />
                </label>
                <label className="block col-span-2 sm:col-span-1">
                  <span className="text-[10px] font-semibold text-[#666] uppercase tracking-wider">
                    Slug
                  </span>
                  <input
                    value={prefs.appSlug}
                    onChange={(e) => update({ appSlug: slugify(e.target.value) })}
                    disabled={launching}
                    className="mt-1 w-full bg-[#111116] border border-[#1f1f27] rounded-xl px-3 py-2 text-[12px] text-[#e8e8f0] font-mono outline-none focus:border-[#7dd3fc]/40 disabled:opacity-50"
                  />
                </label>
              </div>

              {IN_HOUSE_PLATFORM && platformReadiness && platformReadiness.tier !== 'live' && (
                <div
                  className={`mt-3 rounded-xl border px-3 py-2.5 ${
                    platformReadiness.tier === 'offline'
                      ? 'border-[#fa0]/25 bg-[#fa0]/08'
                      : 'border-[#7dd3fc]/25 bg-[#7dd3fc]/08'
                  }`}
                >
                  <p className="text-[12px] font-semibold text-[#e8e8f0]">
                    {platformReadiness.headline}
                  </p>
                  <p className="text-[11px] text-[#888] mt-0.5 leading-relaxed">
                    {platformReadiness.detail}
                  </p>
                </div>
              )}

              {IN_HOUSE_PLATFORM ? (
                <p className="mt-3 text-[11px] text-[#7dd3fc]/90">
                  Target URL:{' '}
                  <span className="font-mono text-[#aaa]">{fabricLiveUrl(prefs.appSlug)}</span>
                </p>
              ) : (
                <label className="mt-3 flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useServerAutopilot}
                    readOnly
                    disabled
                    className="rounded border-[#2a2a35] bg-[#111116] text-[#7dd3fc]"
                  />
                  <span className="text-[11px] text-[#888]">
                    <span className="font-semibold text-[#aaa]">Server Autopilot</span>
                    {' — run deploy on IdeaSpeak infrastructure'}
                  </span>
                </label>
              )}

              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] mb-1.5">
                  <span className="text-[#888] font-medium">Launch progress</span>
                  <span className="text-[#aaa] tabular-nums">{launchProgress}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#1a1a22] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#7dd3fc] transition-all duration-500"
                    style={{ width: `${launchProgress}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Timeline body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {!hasBuilt && (
                <div className="mb-4 rounded-xl border border-[#fa0]/25 bg-[#fa0]/08 px-3 py-2.5 text-[12px] text-[#fa0]">
                  Build an app in preview first — Autopilot ships that version.
                </div>
              )}

              <div className="space-y-0">
                {LAUNCH_STEPS.map((stepMeta, index) => {
                  const Icon = STEP_ICONS[stepMeta.id]
                  const latest = stepStatus.get(stepMeta.id)
                  const status: LaunchEventStatus = latest?.status ?? 'pending'
                  const isExpanded = expanded === stepMeta.id
                  const isLast = index === LAUNCH_STEPS.length - 1

                  return (
                    <div key={stepMeta.id} className="relative flex gap-3">
                      {/* Rail */}
                      <div className="flex flex-col items-center shrink-0 w-8">
                        <div
                          className={`w-8 h-8 rounded-full border flex items-center justify-center ${
                            status === 'success'
                              ? 'border-[#00ff88]/50 bg-[#00ff88]/10'
                              : status === 'running'
                                ? 'border-[#7dd3fc]/50 bg-[#7dd3fc]/10'
                                : status === 'error'
                                  ? 'border-red-500/40 bg-red-500/10'
                                  : 'border-[#2a2a35] bg-[#111116]'
                          }`}
                        >
                          {latest ? (
                            <StatusIcon status={status} />
                          ) : (
                            <Icon size={14} className="text-[#555]" />
                          )}
                        </div>
                        {!isLast && (
                          <div
                            className={`w-px flex-1 min-h-[12px] my-1 ${
                              status === 'success' ? 'bg-[#00ff88]/30' : 'bg-[#1f1f27]'
                            }`}
                          />
                        )}
                      </div>

                      {/* Step card */}
                      <div className={`flex-1 min-w-0 ${isLast ? '' : 'pb-3'}`}>
                        <button
                          type="button"
                          onClick={() => setExpanded(isExpanded ? null : stepMeta.id)}
                          className="w-full text-left rounded-xl border border-[#1f1f27] bg-[#111116] px-3.5 py-3 hover:border-[#2a2a35] transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-semibold text-[#e8e8f0]">
                                  {stepMeta.title}
                                </span>
                                {latest && (
                                  <span className={`text-[10px] font-semibold uppercase ${statusColor(status)}`}>
                                    {status}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-[#666] mt-0.5 truncate">
                                {latest?.message || stepMeta.subtitle}
                              </p>
                            </div>
                            <ChevronDown
                              size={16}
                              className={`text-[#555] shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            />
                          </div>
                        </button>

                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-2 rounded-xl border border-[#1f1f27] bg-[#0a0a0f] px-3.5 py-3 space-y-3">
                                <ul className="space-y-1.5">
                                  {stepMeta.instructions.map((line) => (
                                    <li
                                      key={line}
                                      className="text-[11.5px] text-[#777] leading-relaxed flex gap-2"
                                    >
                                      <span className="text-[#444] shrink-0">·</span>
                                      <span>{line}</span>
                                    </li>
                                  ))}
                                </ul>

                                {stepMeta.id === LaunchStep.github && IN_HOUSE_PLATFORM && (
                                  <p className="text-[11.5px] text-[#777] leading-relaxed">
                                    IdeaSpeak creates a private repo under our GitHub org and pushes
                                    your production scaffold — no token needed.
                                  </p>
                                )}

                                {stepMeta.id === LaunchStep.github && !IN_HOUSE_PLATFORM && (
                                  <div className="space-y-2">
                                    <label className="block">
                                      <span className="text-[10px] font-semibold text-[#666] uppercase tracking-wider">
                                        GitHub token ({GITHUB_TOKEN_KEY})
                                      </span>
                                      <div className="mt-1 flex gap-2">
                                        <input
                                          type={showToken ? 'text' : 'password'}
                                          value={githubToken}
                                          onChange={(e) => saveToken(e.target.value)}
                                          placeholder="ghp_… or github_pat_…"
                                          disabled={launching}
                                          className="flex-1 bg-[#111116] border border-[#1f1f27] rounded-xl px-3 py-2 text-[12px] text-[#e8e8f0] font-mono outline-none focus:border-[#7dd3fc]/40"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => setShowToken((v) => !v)}
                                          className="px-2.5 rounded-xl border border-[#1f1f27] text-[#888] hover:text-[#ccc]"
                                        >
                                          {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                      </div>
                                    </label>
                                    <a
                                      href={AUTOPILOT_LINKS.githubTokens}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-[11px] text-[#7dd3fc] font-semibold hover:opacity-80"
                                    >
                                      Create token (repo scope) <ExternalLink size={11} />
                                    </a>
                                    <label className="block">
                                      <span className="text-[10px] font-semibold text-[#666] uppercase tracking-wider">
                                        Or existing repo URL
                                      </span>
                                      <input
                                        value={prefs.githubRepoUrl}
                                        onChange={(e) => update({ githubRepoUrl: e.target.value.trim() })}
                                        placeholder="https://github.com/you/your-app"
                                        disabled={launching}
                                        className="mt-1 w-full bg-[#111116] border border-[#1f1f27] rounded-xl px-3 py-2 text-[12px] text-[#e8e8f0] font-mono outline-none focus:border-[#7dd3fc]/40"
                                      />
                                    </label>
                                    {repoUrl && (
                                      <a
                                        href={repoUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center gap-1.5 text-[12px] text-[#00ff88] font-semibold"
                                      >
                                        <ExternalLink size={13} /> Open repo
                                      </a>
                                    )}
                                  </div>
                                )}

                                {stepMeta.id === LaunchStep.vercel && (
                                  <div className="flex flex-wrap gap-2">
                                    <a
                                      href={vercelUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#7dd3fc]/15 border border-[#7dd3fc]/35 text-[12px] font-semibold text-[#7dd3fc]"
                                    >
                                      <Rocket size={13} /> Deploy on Vercel
                                    </a>
                                    <a
                                      href={AUTOPILOT_LINKS.vercelNew}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex-1 min-w-[120px] text-center py-2.5 rounded-xl border border-[#1f1f27] text-[12px] font-semibold text-[#888]"
                                    >
                                      Vercel dashboard
                                    </a>
                                  </div>
                                )}

                                {stepMeta.id === LaunchStep.env && (
                                  <div className="space-y-2">
                                    {envVars.map((v) => (
                                      <div
                                        key={v.key}
                                        className="rounded-lg border border-[#1f1f27] bg-[#111116] p-2.5"
                                      >
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                          <span className="text-[10px] font-mono text-[#888]">{v.key}</span>
                                          <button
                                            type="button"
                                            onClick={() => void copy(v.value, v.key)}
                                            className="text-[10px] text-[#7dd3fc] font-semibold flex items-center gap-1"
                                          >
                                            <Copy size={10} /> Copy
                                          </button>
                                        </div>
                                        <p className="text-[11px] text-[#aaa] font-mono break-all">{v.value}</p>
                                      </div>
                                    ))}
                                    <a
                                      href={AUTOPILOT_LINKS.vercelEnv()}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-[11px] text-[#7dd3fc] font-semibold"
                                    >
                                      Open Vercel env settings <ExternalLink size={11} />
                                    </a>
                                  </div>
                                )}

                                {stepMeta.id === LaunchStep.domain && (
                                  <div className="space-y-2">
                                    <input
                                      value={prefs.customDomain}
                                      onChange={(e) => update({ customDomain: e.target.value.trim() })}
                                      placeholder="app.yourbrand.com"
                                      disabled={launching}
                                      className="w-full bg-[#111116] border border-[#1f1f27] rounded-xl px-3 py-2 text-[12px] text-[#e8e8f0] outline-none focus:border-[#7dd3fc]/40"
                                    />
                                    <div className="text-[11px] font-mono text-[#777] space-y-1">
                                      <div>A @ → 76.76.21.21</div>
                                      <div>CNAME www → cname.vercel-dns.com</div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <a
                                        href={AUTOPILOT_LINKS.vercelDomains}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[11px] text-[#7dd3fc] font-semibold"
                                      >
                                        Vercel domains
                                      </a>
                                      <a
                                        href={AUTOPILOT_LINKS.porkbun}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[11px] text-[#888]"
                                      >
                                        Porkbun
                                      </a>
                                    </div>
                                  </div>
                                )}

                                {stepMeta.id === LaunchStep.done && (
                                  <div className="space-y-2">
                                    <label className="block">
                                      <span className="text-[10px] font-semibold text-[#666] uppercase tracking-wider">
                                        Production URL
                                      </span>
                                      <input
                                        value={liveUrl}
                                        onChange={(e) => handleLiveUrl(e.target.value)}
                                        placeholder="https://your-app.vercel.app"
                                        className="mt-1 w-full bg-[#111116] border border-[#1f1f27] rounded-xl px-3 py-2.5 text-[13px] text-[#e8e8f0] font-mono outline-none focus:border-[#00ff88]/40"
                                      />
                                    </label>
                                    {liveUrl && (
                                      <a
                                        href={liveUrl.startsWith('http') ? liveUrl : `https://${liveUrl}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#00ff88] text-[#0a0a0f] text-[13px] font-bold"
                                      >
                                        <ExternalLink size={15} /> Open live app
                                      </a>
                                    )}
                                  </div>
                                )}

                                {latest?.error && (
                                  <div className="rounded-lg border border-red-500/30 bg-red-500/08 px-3 py-2 text-[11px] text-red-300">
                                    {latest.error}
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  )
                })}
              </div>

              {deployChangelog && (
                <p className="mt-4 px-1 text-[11px] text-[#666] leading-relaxed border-t border-[#1f1f27] pt-3">
                  <span className="text-[#888] font-semibold uppercase tracking-wider text-[10px]">
                    Deploy summary
                  </span>
                  <span className="block mt-1 text-[#777]">{deployChangelog}</span>
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-[#1f1f27] px-5 py-3 flex items-center justify-between gap-2">
              {launching ? (
                <button
                  type="button"
                  onClick={cancelLaunch}
                  className="text-[12px] text-[#888] hover:text-[#ccc] px-2 py-1.5"
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="text-[12px] text-[#666] hover:text-[#ccc] px-2 py-1.5"
                >
                  Close
                </button>
              )}

              <button
                type="button"
                onClick={() => void handleLaunch()}
                disabled={launching || !hasBuilt}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#7dd3fc] text-[#0a0a0f] text-[13px] font-bold hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {launching ? (
                  <>
                    <Loader2 size={15} className="animate-spin" /> Launching…
                  </>
                ) : (
                  <>
                    <Play size={15} fill="currentColor" /> Launch
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}