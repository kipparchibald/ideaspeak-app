/**
 * ShipPanel — one place to remove go-live pain:
 * Package · Supabase · Host · Domain · Publish
 */

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Package,
  Database,
  Rocket,
  Globe,
  CheckCircle2,
  ExternalLink,
  Copy,
  Download,
  ChevronRight,
  Circle,
  Sparkles,
  Terminal,
  Key,
  Link2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  SHIP_STEPS,
  SHIP_LINKS,
  DEFAULT_CHECKLIST,
  loadShipPrefs,
  saveShipPrefs,
  shipReadinessScore,
  slugify,
  extractSupabaseRef,
  shipCommands,
  type ShipPreferences,
  type ShipStepId,
} from '../lib/ship'

const STEP_ICONS: Record<ShipStepId, typeof Package> = {
  package: Package,
  supabase: Database,
  host: Rocket,
  domain: Globe,
  publish: CheckCircle2,
}

interface ShipPanelProps {
  open: boolean
  onClose: () => void
  hasBuilt: boolean
  defaultAppName?: string
  onDownloadZip: (prefs: ShipPreferences) => Promise<void>
  onCopySchema: () => void
}

export function ShipPanel({
  open,
  onClose,
  hasBuilt,
  defaultAppName = 'My IdeaSpeak App',
  onDownloadZip,
  onCopySchema,
}: ShipPanelProps) {
  const [step, setStep] = useState<ShipStepId>('package')
  const [prefs, setPrefs] = useState<ShipPreferences>(() => loadShipPrefs())
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!open) return
    const loaded = loadShipPrefs()
    if (!loaded.appName || loaded.appName === 'My IdeaSpeak App') {
      loaded.appName = defaultAppName
      loaded.appSlug = slugify(defaultAppName)
    }
    setPrefs(loaded)
  }, [open, defaultAppName])

  const score = useMemo(() => shipReadinessScore(prefs), [prefs])
  const checklistStats = useMemo(() => {
    const keys = Object.keys(DEFAULT_CHECKLIST)
    const done = keys.filter((k) => prefs.checklist[k]).length
    const total = keys.length
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    return { done, total, pct }
  }, [prefs.checklist])
  const commands = useMemo(() => shipCommands(prefs), [prefs])

  const update = (patch: Partial<ShipPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      if (patch.appName && !patch.appSlug) next.appSlug = slugify(patch.appName)
      if (patch.supabase) {
        next.supabase = {
          ...prev.supabase,
          ...patch.supabase,
          projectRef:
            patch.supabase.projectRef ||
            extractSupabaseRef(patch.supabase.url || prev.supabase.url) ||
            prev.supabase.projectRef,
        }
      }
      saveShipPrefs(next)
      return next
    })
  }

  const toggleCheck = (key: string) => {
    update({
      checklist: { ...prefs.checklist, [key]: !prefs.checklist[key] },
    })
  }

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label} copied`)
    } catch {
      toast.error('Could not copy')
    }
  }

  const handleZip = async () => {
    setDownloading(true)
    try {
      await onDownloadZip(prefs)
      update({ checklist: { ...prefs.checklist, zipDownloaded: true } })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md p-0 sm:p-6"
          onClick={(e) => e.target === e.currentTarget && onClose()}
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
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-[#00ff88]/12 border border-[#00ff88]/30 flex items-center justify-center">
                      <Rocket size={18} className="text-[#00ff88]" />
                    </div>
                    <div>
                      <h2 className="text-[17px] font-semibold tracking-tight text-[#e8e8f0]">
                        Ship
                      </h2>
                      <p className="text-[12px] text-[#666]">
                        Kill the pain · package → backend → host → domain → launch
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg text-[#666] hover:text-[#ccc] hover:bg-white/5"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Readiness */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-[11px] mb-1.5 gap-2">
                  <span className="text-[#888] font-medium">Launch readiness</span>
                  <span className="text-[#aaa] font-medium tabular-nums shrink-0">
                    {checklistStats.done}/{checklistStats.total} complete — {checklistStats.pct}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[#1a1a22] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#00ff88] transition-all duration-500"
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>

              {/* Step tabs */}
              <div className="mt-4 flex gap-1 overflow-x-auto pb-0.5 -mx-1 px-1">
                {SHIP_STEPS.map((s) => {
                  const Icon = STEP_ICONS[s.id]
                  const active = step === s.id
                  return (
                    <button
                      key={s.id}
                      onClick={() => setStep(s.id)}
                      className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                        active
                          ? 'bg-[#00ff88]/12 text-[#00ff88] border border-[#00ff88]/35'
                          : 'text-[#666] border border-transparent hover:bg-white/5 hover:text-[#999]'
                      }`}
                    >
                      <Icon size={12} />
                      {s.title}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {!hasBuilt && (
                <div className="rounded-xl border border-[#fa0]/25 bg-[#fa0]/08 px-3 py-2.5 text-[12px] text-[#fa0]">
                  Build an app in preview first — then ship that version.
                </div>
              )}

              {step === 'package' && (
                <section className="space-y-4">
                  <StepIntro
                    title="Production package"
                    body="One ZIP with Next.js 15, Supabase stubs, Vercel config, AGENTS.md, schema SQL, and SHIP.md. No hand-rolling a repo."
                  />
                  <label className="block">
                    <span className="text-[11px] font-semibold text-[#666] uppercase tracking-wider">
                      App name
                    </span>
                    <input
                      value={prefs.appName}
                      onChange={(e) => update({ appName: e.target.value })}
                      className="mt-1.5 w-full bg-[#111116] border border-[#1f1f27] rounded-xl px-3 py-2.5 text-[13px] text-[#e8e8f0] outline-none focus:border-[#00ff88]/40"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-semibold text-[#666] uppercase tracking-wider">
                      Slug (repo / project)
                    </span>
                    <input
                      value={prefs.appSlug}
                      onChange={(e) => update({ appSlug: slugify(e.target.value) })}
                      className="mt-1.5 w-full bg-[#111116] border border-[#1f1f27] rounded-xl px-3 py-2.5 text-[13px] text-[#e8e8f0] font-mono outline-none focus:border-[#00ff88]/40"
                    />
                  </label>
                  <button
                    onClick={() => void handleZip()}
                    disabled={downloading || !hasBuilt}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#00ff88] text-[#0a0a0f] text-[14px] font-bold hover:opacity-90 disabled:opacity-40 transition-opacity"
                  >
                    <Download size={16} />
                    {downloading ? 'Packaging…' : 'Download production ZIP'}
                  </button>
                  <p className="text-[11px] text-[#555] text-center leading-relaxed">
                    ZIP includes <span className="text-[#888]">polish/prompts</span> for Cursor,
                    Grok, Claude &amp; GPT — open the folder in Cursor for IDE polish.
                  </p>
                  <CheckRow
                    checked={!!prefs.checklist.zipDownloaded}
                    onToggle={() => toggleCheck('zipDownloaded')}
                    label="ZIP downloaded"
                  />
                </section>
              )}

              {step === 'supabase' && (
                <section className="space-y-4">
                  <StepIntro
                    title="Supabase in 3 clicks"
                    body="Auth, Postgres, RLS, storage — pre-wired client + server helpers and a starter schema. Paste keys once; they bake into your next ZIP."
                  />
                  <a
                    href={SHIP_LINKS.supabaseNew}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 w-full rounded-xl border border-[#00ff88]/30 bg-[#00ff88]/08 px-4 py-3 hover:bg-[#00ff88]/12 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Database size={18} className="text-[#00ff88]" />
                      <div>
                        <div className="text-[13px] font-semibold text-[#00ff88]">
                          Create Supabase project
                        </div>
                        <div className="text-[11px] text-[#00ff88]/60">
                          Opens dashboard · free tier works
                        </div>
                      </div>
                    </div>
                    <ExternalLink size={14} className="text-[#00ff88]/70" />
                  </a>

                  <div className="space-y-2">
                    <label className="block">
                      <span className="text-[11px] font-semibold text-[#666] uppercase tracking-wider flex items-center gap-1">
                        <Link2 size={11} /> Project URL
                      </span>
                      <input
                        value={prefs.supabase.url}
                        onChange={(e) =>
                          update({ supabase: { ...prefs.supabase, url: e.target.value } })
                        }
                        placeholder="https://xxxx.supabase.co"
                        className="mt-1.5 w-full bg-[#111116] border border-[#1f1f27] rounded-xl px-3 py-2.5 text-[13px] text-[#e8e8f0] font-mono outline-none focus:border-[#00ff88]/40"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-[#666] uppercase tracking-wider flex items-center gap-1">
                        <Key size={11} /> Anon key
                      </span>
                      <input
                        value={prefs.supabase.anonKey}
                        onChange={(e) =>
                          update({
                            supabase: { ...prefs.supabase, anonKey: e.target.value },
                          })
                        }
                        placeholder="eyJhbGciOi…"
                        className="mt-1.5 w-full bg-[#111116] border border-[#1f1f27] rounded-xl px-3 py-2.5 text-[13px] text-[#e8e8f0] font-mono outline-none focus:border-[#00ff88]/40"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={onCopySchema}
                      className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-[#1f1f27] text-[12px] font-semibold text-[#ccc] hover:border-[#00ff88]/35 hover:text-[#00ff88]"
                    >
                      <Copy size={13} /> Copy schema SQL
                    </button>
                    <a
                      href={
                        prefs.supabase.projectRef
                          ? `https://supabase.com/dashboard/project/${prefs.supabase.projectRef}/sql/new`
                          : SHIP_LINKS.supabaseProjects
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-[#1f1f27] text-[12px] font-semibold text-[#ccc] hover:border-[#00ff88]/35 hover:text-[#00ff88]"
                    >
                      <ExternalLink size={13} /> Open SQL Editor
                    </a>
                  </div>

                  <div className="space-y-1.5">
                    <CheckRow
                      checked={!!prefs.checklist.supabaseProject}
                      onToggle={() => toggleCheck('supabaseProject')}
                      label="Project created"
                    />
                    <CheckRow
                      checked={!!prefs.checklist.supabaseEnv}
                      onToggle={() => toggleCheck('supabaseEnv')}
                      label="Keys saved (re-download ZIP to embed)"
                    />
                    <CheckRow
                      checked={!!prefs.checklist.supabaseSchema}
                      onToggle={() => toggleCheck('supabaseSchema')}
                      label="Schema SQL ran successfully"
                    />
                  </div>
                </section>
              )}

              {step === 'host' && (
                <section className="space-y-4">
                  <StepIntro
                    title="Host on Vercel"
                    body="Fastest path: download ZIP → push GitHub (optional) → Import on Vercel. Or use the CLI. Env vars: same Supabase keys as Production."
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <a
                      href={SHIP_LINKS.vercelNew}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2.5 rounded-xl border border-[#00ff88]/30 bg-[#00ff88]/08 px-4 py-3 hover:bg-[#00ff88]/12"
                    >
                      <Rocket size={18} className="text-[#00ff88] shrink-0" />
                      <div>
                        <div className="text-[13px] font-semibold text-[#00ff88]">
                          Open Vercel New
                        </div>
                        <div className="text-[11px] text-[#00ff88]/60">Import git or upload</div>
                      </div>
                    </a>
                    <a
                      href={SHIP_LINKS.githubNew}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2.5 rounded-xl border border-[#1f1f27] px-4 py-3 hover:border-[#333]"
                    >
                      <ExternalLink size={16} className="text-[#888] shrink-0" />
                      <div>
                        <div className="text-[13px] font-semibold text-[#ccc]">
                          New GitHub repo
                        </div>
                        <div className="text-[11px] text-[#555]">Optional but recommended</div>
                      </div>
                    </a>
                  </div>

                  <label className="block">
                    <span className="text-[11px] font-semibold text-[#666] uppercase tracking-wider">
                      GitHub repo URL (for deploy button)
                    </span>
                    <input
                      value={prefs.githubRepoUrl}
                      onChange={(e) => update({ githubRepoUrl: e.target.value })}
                      placeholder="https://github.com/you/your-app"
                      className="mt-1.5 w-full bg-[#111116] border border-[#1f1f27] rounded-xl px-3 py-2.5 text-[13px] text-[#e8e8f0] font-mono outline-none focus:border-[#00ff88]/40"
                    />
                  </label>

                  {prefs.githubRepoUrl && (
                    <a
                      href={SHIP_LINKS.vercelDeployButton(prefs.githubRepoUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-[#00ff88] text-[#0a0a0f] text-[13px] font-bold"
                    >
                      <Rocket size={15} /> Deploy this repo on Vercel
                    </a>
                  )}

                  <CommandList commands={commands.filter((c) => c.label.includes('Vercel') || c.label.includes('Install'))} onCopy={copy} />

                  <div className="space-y-1.5">
                    <CheckRow
                      checked={!!prefs.checklist.vercelDeployed}
                      onToggle={() => toggleCheck('vercelDeployed')}
                      label="Production URL is live"
                    />
                    <CheckRow
                      checked={!!prefs.checklist.envOnVercel}
                      onToggle={() => toggleCheck('envOnVercel')}
                      label="Supabase env vars set on Vercel"
                    />
                  </div>
                </section>
              )}

              {step === 'domain' && (
                <section className="space-y-4">
                  <StepIntro
                    title="Custom domain without tears"
                    body="Buy a domain anywhere, attach it in Vercel, set one DNS record. HTTPS is automatic."
                  />
                  <label className="block">
                    <span className="text-[11px] font-semibold text-[#666] uppercase tracking-wider">
                      Your domain
                    </span>
                    <input
                      value={prefs.customDomain}
                      onChange={(e) => update({ customDomain: e.target.value.trim() })}
                      placeholder="app.yourbrand.com"
                      className="mt-1.5 w-full bg-[#111116] border border-[#1f1f27] rounded-xl px-3 py-2.5 text-[13px] text-[#e8e8f0] outline-none focus:border-[#00ff88]/40"
                    />
                  </label>

                  <div className="rounded-xl border border-[#1f1f27] bg-[#111116] p-4 space-y-3">
                    <div className="text-[12px] font-semibold text-[#e8e8f0]">DNS cheat sheet</div>
                    <DnsRow
                      type="A"
                      name="@"
                      value="76.76.21.21"
                      onCopy={() => copy('76.76.21.21', 'A record')}
                    />
                    <DnsRow
                      type="CNAME"
                      name="www"
                      value="cname.vercel-dns.com"
                      onCopy={() => copy('cname.vercel-dns.com', 'CNAME')}
                    />
                    <p className="text-[11px] text-[#555] leading-relaxed">
                      Apex domain: A → 76.76.21.21. Subdomain: CNAME → cname.vercel-dns.com.
                      Then Vercel → Project → Settings → Domains → Add.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <a
                      href={SHIP_LINKS.vercelDashboard}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 min-w-[120px] text-center py-2.5 rounded-xl border border-[#00ff88]/30 text-[12px] font-semibold text-[#00ff88]"
                    >
                      Vercel domains
                    </a>
                    <a
                      href={SHIP_LINKS.porkbun}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 min-w-[100px] text-center py-2.5 rounded-xl border border-[#1f1f27] text-[12px] font-semibold text-[#888]"
                    >
                      Porkbun
                    </a>
                    <a
                      href={SHIP_LINKS.namecheap}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 min-w-[100px] text-center py-2.5 rounded-xl border border-[#1f1f27] text-[12px] font-semibold text-[#888]"
                    >
                      Namecheap
                    </a>
                  </div>

                  <CommandList
                    commands={commands.filter((c) => c.label.includes('domain'))}
                    onCopy={copy}
                  />

                  <CheckRow
                    checked={!!prefs.checklist.domainAttached}
                    onToggle={() => toggleCheck('domainAttached')}
                    label="Domain shows HTTPS / valid on Vercel"
                  />
                </section>
              )}

              {step === 'publish' && (
                <section className="space-y-4">
                  <StepIntro
                    title="Launch checklist"
                    body="Ship when these are green. IdeaSpeak tracked them so you don’t forget the boring half of launching."
                  />
                  <div className="flex items-center justify-between rounded-xl border border-[#1f1f27] bg-[#111116] px-3.5 py-2.5">
                    <span className="text-[12px] text-[#888] font-medium">Checklist progress</span>
                    <span className="text-[13px] text-[#00ff88] font-bold tabular-nums">
                      {checklistStats.done}/{checklistStats.total} complete — {checklistStats.pct}%
                    </span>
                  </div>
                  <div className="rounded-xl border border-[#1f1f27] bg-[#111116] p-4 space-y-2">
                    {(
                      [
                        ['zipDownloaded', 'Production ZIP ready'],
                        ['supabaseProject', 'Supabase project live'],
                        ['supabaseEnv', 'Env keys configured'],
                        ['supabaseSchema', 'Schema applied'],
                        ['vercelDeployed', 'Vercel production URL'],
                        ['envOnVercel', 'Prod env vars on Vercel'],
                        ['domainAttached', 'Custom domain (optional)'],
                        ['smokeTested', 'Clicked through core loop on prod'],
                        ['announced', 'Shared with someone real'],
                      ] as const
                    ).map(([key, label]) => (
                      <CheckRow
                        key={key}
                        checked={!!prefs.checklist[key]}
                        onToggle={() => toggleCheck(key)}
                        label={label}
                      />
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      const url = prefs.vercelProjectUrl || prefs.customDomain || 'your-live-url'
                      const text = `Just shipped ${prefs.appName} — built with voice on IdeaSpeak.\n${url}`
                      void copy(text, 'Launch blurb')
                    }}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[#00ff88]/35 text-[13px] font-semibold text-[#00ff88] hover:bg-[#00ff88]/08"
                  >
                    <Sparkles size={15} /> Copy launch blurb
                  </button>

                  {score >= 70 && (
                    <div className="rounded-xl border border-[#00ff88]/30 bg-[#00ff88]/08 px-4 py-3 text-[13px] text-[#00ff88]">
                      You’re launch-ready. Open the prod URL and enjoy it.
                    </div>
                  )}
                </section>
              )}
            </div>

            {/* Footer nav */}
            <div className="shrink-0 border-t border-[#1f1f27] px-5 py-3 flex items-center justify-between gap-2">
              <button
                onClick={() => {
                  const idx = SHIP_STEPS.findIndex((s) => s.id === step)
                  if (idx > 0) setStep(SHIP_STEPS[idx - 1].id)
                }}
                className="text-[12px] text-[#666] hover:text-[#ccc] px-2 py-1.5"
              >
                Back
              </button>
              <button
                onClick={() => {
                  const idx = SHIP_STEPS.findIndex((s) => s.id === step)
                  if (idx < SHIP_STEPS.length - 1) setStep(SHIP_STEPS[idx + 1].id)
                  else onClose()
                }}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-[#1a1a22] border border-[#2a2a35] text-[12px] font-semibold text-[#e8e8f0] hover:border-[#00ff88]/40"
              >
                {step === 'publish' ? 'Done' : 'Next'}
                <ChevronRight size={14} />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function StepIntro({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="text-[15px] font-semibold text-[#e8e8f0]">{title}</h3>
      <p className="text-[12.5px] text-[#777] mt-1 leading-relaxed">{body}</p>
    </div>
  )
}

function CheckRow({
  checked,
  onToggle,
  label,
}: {
  checked: boolean
  onToggle: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-2.5 py-1.5 text-left group"
    >
      {checked ? (
        <CheckCircle2 size={16} className="text-[#00ff88] shrink-0" />
      ) : (
        <Circle size={16} className="text-[#333] group-hover:text-[#555] shrink-0" />
      )}
      <span
        className={`text-[12.5px] ${checked ? 'text-[#aaa] line-through decoration-[#333]' : 'text-[#c8c8d4]'}`}
      >
        {label}
      </span>
    </button>
  )
}

function DnsRow({
  type,
  name,
  value,
  onCopy,
}: {
  type: string
  name: string
  value: string
  onCopy: () => void
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-mono">
      <span className="text-[#00ff88] w-12 shrink-0">{type}</span>
      <span className="text-[#666] w-10 shrink-0">{name}</span>
      <span className="text-[#ccc] flex-1 truncate">{value}</span>
      <button onClick={onCopy} className="text-[#555] hover:text-[#00ff88] shrink-0">
        <Copy size={12} />
      </button>
    </div>
  )
}

function CommandList({
  commands,
  onCopy,
}: {
  commands: { label: string; command: string }[]
  onCopy: (text: string, label: string) => void
}) {
  if (!commands.length) return null
  return (
    <div className="space-y-2">
      {commands.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border border-[#1f1f27] bg-[#0a0a0f] p-3"
        >
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[11px] font-semibold text-[#888] flex items-center gap-1">
              <Terminal size={11} /> {c.label}
            </span>
            <button
              onClick={() => onCopy(c.command, c.label)}
              className="text-[10px] text-[#00ff88] font-semibold hover:opacity-80"
            >
              Copy
            </button>
          </div>
          <pre className="text-[11px] text-[#aaa] whitespace-pre-wrap font-mono leading-relaxed">
            {c.command}
          </pre>
        </div>
      ))}
    </div>
  )
}
