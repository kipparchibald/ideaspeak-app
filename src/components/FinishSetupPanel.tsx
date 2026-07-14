/**
 * Finish Setup — checklist of APIs/keys needed to unlock all IdeaSpeak functions.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2,
  Circle,
  AlertCircle,
  Loader2,
  Copy,
  RefreshCw,
  ExternalLink,
  ClipboardList,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  fetchPlatformCapabilities,
  type CapabilityItem,
  type PlatformCapabilitiesReport,
} from '../lib/platform-capabilities'

interface FinishSetupPanelProps {
  onOpenGithubImport?: () => void
  onOpenSettings?: () => void
}

function StatusIcon({ status }: { status: CapabilityItem['status'] }) {
  if (status === 'ready') return <CheckCircle2 size={16} className="text-[#00ff88] shrink-0" />
  if (status === 'partial') return <AlertCircle size={16} className="text-[#fa0] shrink-0" />
  return <Circle size={16} className="text-[#555] shrink-0" />
}

export function FinishSetupPanel({ onOpenGithubImport, onOpenSettings }: FinishSetupPanelProps) {
  const [report, setReport] = useState<PlatformCapabilitiesReport | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setReport(await fetchPlatformCapabilities())
    } catch {
      setReport(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const copyEnv = () => {
    if (!report?.localEnvSnippet) return
    void navigator.clipboard.writeText(report.localEnvSnippet)
    toast.success('Copied .env.local snippet')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#7dd3fc]/10 border border-[#7dd3fc]/25 flex items-center justify-center shrink-0">
          <ClipboardList size={18} className="text-[#7dd3fc]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-semibold text-[#e8e8f0]">Finish setup</h3>
          <p className="text-[12px] text-[#666] mt-0.5 leading-relaxed">
            What to import so every function works — core first, optional platform extras after.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="p-2 rounded-lg text-[#666] hover:text-[#ccc] hover:bg-white/5 disabled:opacity-40"
          aria-label="Refresh setup status"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && !report ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[#666] text-[13px]">
          <Loader2 size={18} className="animate-spin" />
          Checking capabilities…
        </div>
      ) : report ? (
        <>
          <div className="rounded-xl border border-[#1f1f27] bg-[#0a0a0f] px-3 py-2.5 flex items-center justify-between gap-2">
            <span className="text-[12px] text-[#888]">
              <span className="text-[#00ff88] font-semibold tabular-nums">{report.readyCount}</span>
              {' / '}
              {report.totalCount} ready
              {report.platform ? ` · ${report.platform}` : ''}
            </span>
            {report.grokLive ? (
              <span className="text-[10px] font-bold uppercase text-[#00ff88]">Grok live</span>
            ) : (
              <span className="text-[10px] font-bold uppercase text-[#fa0]">Simulator</span>
            )}
          </div>

          <ol className="space-y-2">
            {report.items.map((item, idx) => (
              <li
                key={item.id}
                className="rounded-xl border border-[#1f1f27] bg-[#111116] px-3 py-3"
              >
                <div className="flex items-start gap-2.5">
                  <span className="text-[10px] font-bold text-[#444] mt-0.5 w-4 shrink-0">
                    {idx + 1}
                  </span>
                  <StatusIcon status={item.status} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-[#e8e8f0]">{item.label}</div>
                    <p className="text-[11px] text-[#666] mt-0.5 leading-relaxed">{item.detail}</p>
                    <p className="text-[10px] text-[#555] mt-1">Unlocks: {item.unlocks}</p>
                    {item.envVars && item.envVars.length > 0 && item.status !== 'ready' && (
                      <p className="text-[10px] text-[#7dd3fc] mt-1 font-mono">
                        {item.envVars.join(' · ')}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {item.id === 'githubImport' && item.status !== 'ready' && onOpenGithubImport && (
                        <button
                          type="button"
                          onClick={onOpenGithubImport}
                          className="text-[11px] font-semibold text-[#00ff88] hover:underline"
                        >
                          Connect to GitHub →
                        </button>
                      )}
                      {item.id === 'grok' && item.status !== 'ready' && onOpenSettings && (
                        <button
                          type="button"
                          onClick={onOpenSettings}
                          className="text-[11px] font-semibold text-[#00ff88] hover:underline"
                        >
                          Paste key in Settings →
                        </button>
                      )}
                      {item.links?.map((link) => (
                        <a
                          key={link.href}
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-[11px] text-[#7dd3fc] hover:underline"
                        >
                          {link.label}
                          <ExternalLink size={10} />
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <div className="rounded-xl border border-[#7dd3fc]/25 bg-[#7dd3fc]/06 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[#7dd3fc] uppercase tracking-wider">
                Local dev import
              </span>
              <button
                type="button"
                onClick={copyEnv}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#7dd3fc] hover:underline"
              >
                <Copy size={12} />
                Copy .env.local
              </button>
            </div>
            <pre className="text-[10px] text-[#888] font-mono whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
              {report.localEnvSnippet}
            </pre>
            <p className="text-[10px] text-[#555]">
              Save as <code className="text-[#777]">.env.local</code> in project root, then{' '}
              <code className="text-[#777]">bun run dev:full</code>
            </p>
          </div>

          <div className="rounded-xl border border-[#1f1f27] bg-[#0a0a0f] px-3 py-2.5 text-[11px] text-[#666] leading-relaxed">
            <strong className="text-[#888]">Minimum to finish core:</strong> only{' '}
            <code className="text-[#7dd3fc]">XAI_API_KEY</code> on Vercel production (or Settings
            locally). Everything else is optional polish — sandbox, sync, ship worker, Stripe.
          </div>
        </>
      ) : (
        <p className="text-[13px] text-red-400 text-center py-6">Could not load setup status.</p>
      )}
    </div>
  )
}