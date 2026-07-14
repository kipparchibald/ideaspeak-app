/**
 * CouncilPanel — multi-model launch review (Grok, Claude, Cursor, GPT)
 * Pro feature; Free sees upgrade CTA. Heuristic report + apply-top-fix chips.
 */

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Lock, Users, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import {
  COUNCIL_REVIEWERS,
  generateCouncilReport,
  type CouncilContext,
  type CouncilReviewerId,
} from '../lib/council'
import { canUse, recordUsage, getPlan } from '../lib/billing'

interface CouncilPanelProps {
  open: boolean
  onClose: () => void
  context: CouncilContext
  onUpgrade: () => void
  /** Optional: send fix to voice refine or chat composer */
  onApplyFix?: (action: string) => void
}

function scoreColor(score: number): string {
  if (score >= 75) return '#00ff88'
  if (score >= 50) return '#facc15'
  return '#f87171'
}

function ScoreRing({ score }: { score: number }) {
  const size = 112
  const stroke = 8
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (score / 100) * c
  const color = scoreColor(score)

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#1a1a22"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[28px] font-bold tabular-nums leading-none" style={{ color }}>
          {score}
        </span>
        <span className="text-[10px] text-[#666] font-semibold uppercase tracking-wider mt-1">
          Ready
        </span>
      </div>
    </div>
  )
}

export function CouncilPanel({
  open,
  onClose,
  context,
  onUpgrade,
  onApplyFix,
}: CouncilPanelProps) {
  const [applied, setApplied] = useState<Set<string>>(new Set())
  const plan = getPlan()
  const gate = canUse('polish')
  const locked = !gate.ok

  const report = useMemo(
    () => (open ? generateCouncilReport(context) : null),
    [open, context],
  )

  const reviewerMeta = (id: CouncilReviewerId) =>
    COUNCIL_REVIEWERS.find((r) => r.id === id)!

  const applyFix = async (action: string) => {
    if (locked) {
      onUpgrade()
      toast.message('Pro feature', { description: gate.reason })
      return
    }
    recordUsage('polish')
    setApplied((prev) => new Set(prev).add(action))
    if (onApplyFix) {
      onApplyFix(action)
      toast.success('Fix sent to chat', { description: action })
    } else {
      try {
        await navigator.clipboard.writeText(action)
        toast.success('Fix copied — paste into chat or Cursor')
      } catch {
        toast.error('Could not copy fix')
      }
    }
  }

  const passCount = report?.reviewers.filter((r) => r.pass).length ?? 0

  return (
    <AnimatePresence>
      {open && report && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[112] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md p-0 sm:p-6"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-[#1f1f27] bg-[#0e0e14] shadow-2xl overflow-hidden"
          >
            <div className="shrink-0 px-5 py-4 border-b border-[#1f1f27] flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-[#38bdf8]" />
                  <h2 className="text-[17px] font-semibold text-[#e8e8f0]">Council</h2>
                  {locked && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#fa0]/15 text-[#fa0] border border-[#fa0]/30">
                      Pro
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-[#666] mt-0.5">
                  Launch review · 4 models · {plan.name} plan
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-[#666] hover:text-[#ccc] hover:bg-white/5"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="flex items-center gap-4 rounded-xl border border-[#1f1f27] bg-[#111116] p-4">
                <ScoreRing score={report.score} />
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-semibold text-[#e8e8f0]">Launch readiness</h3>
                  <p className="text-[12px] text-[#777] mt-1 leading-relaxed">
                    {passCount}/4 reviewers pass · blends code heuristics + Ship checklist for{' '}
                    <span className="text-[#aaa]">{context.appName}</span>
                  </p>
                  {report.score >= 75 ? (
                    <p className="text-[12px] text-[#00ff88] mt-2 font-medium">
                      Strong v1 — fix top actions, then Ship.
                    </p>
                  ) : report.score >= 50 ? (
                    <p className="text-[12px] text-[#facc15] mt-2 font-medium">
                      Close — address blockers before prod traffic.
                    </p>
                  ) : (
                    <p className="text-[12px] text-[#f87171] mt-2 font-medium">
                      Not launch-ready — work through Council findings first.
                    </p>
                  )}
                </div>
              </div>

              {locked && (
                <div className="rounded-xl border border-[#fa0]/30 bg-[#fa0]/08 px-4 py-3 flex items-start gap-3">
                  <Lock size={18} className="text-[#fa0] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[13px] font-semibold text-[#fa0]">Pro Council review</p>
                    <p className="text-[12px] text-[#ccc] mt-1 leading-relaxed">
                      {gate.reason || 'Multi-model launch review is included with Pro.'}
                    </p>
                    <button
                      onClick={onUpgrade}
                      className="mt-2 px-3 py-1.5 rounded-lg bg-[#00ff88] text-[#0a0a0f] text-[11px] font-bold"
                    >
                      Unlock Pro
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {report.reviewers.map((r) => {
                  const meta = reviewerMeta(r.id)
                  return (
                    <div
                      key={r.id}
                      className={`rounded-xl border p-3.5 transition-colors ${
                        r.pass
                          ? 'border-[#00ff88]/25 bg-[#00ff88]/05'
                          : 'border-[#f87171]/20 bg-[#f87171]/05'
                      } ${locked ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="text-[13px] font-bold truncate"
                            style={{ color: meta.color }}
                          >
                            {meta.name}
                          </span>
                          <span className="text-[10px] text-[#555] truncate">{meta.role}</span>
                        </div>
                        {r.pass ? (
                          <CheckCircle2 size={16} className="text-[#00ff88] shrink-0" />
                        ) : (
                          <AlertCircle size={16} className="text-[#f87171] shrink-0" />
                        )}
                      </div>
                      <ul className="space-y-1.5">
                        {r.findings.slice(0, 3).map((f, i) => (
                          <li
                            key={i}
                            className="text-[11.5px] text-[#999] leading-snug flex gap-1.5"
                          >
                            <span className="text-[#444] shrink-0">·</span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-[#00ff88]" />
                  <span className="text-[12px] font-semibold text-[#888] uppercase tracking-wider">
                    Apply top fix
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {report.topActions.map((action) => {
                    const done = applied.has(action)
                    return (
                      <button
                        key={action}
                        type="button"
                        onClick={() => void applyFix(action)}
                        disabled={locked}
                        className={`text-left px-3 py-2 rounded-xl border text-[11.5px] font-medium leading-snug transition-colors max-w-full ${
                          done
                            ? 'border-[#00ff88]/40 bg-[#00ff88]/10 text-[#00ff88]'
                            : 'border-[#1f1f27] bg-[#0a0a0f] text-[#bbb] hover:border-[#00ff88]/35 hover:text-[#00ff88] disabled:opacity-50'
                        }`}
                      >
                        {done ? '✓ ' : ''}
                        {action}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[11px] text-[#555] leading-relaxed">
                  Chips copy the fix or send it to chat when wired. Production ZIP includes{' '}
                  <code className="text-[#888] font-mono">polish/council/prompts/</code> for deep
                  model runs.
                </p>
              </div>
            </div>

            <div className="shrink-0 border-t border-[#1f1f27] px-5 py-3 flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-[#1f1f27] text-[13px] font-semibold text-[#888] hover:text-[#ccc] hover:border-[#333]"
              >
                Close
              </button>
              <button
                onClick={() => {
                  if (locked) {
                    onUpgrade()
                    return
                  }
                  const text = report.topActions[0]
                  if (text) void applyFix(text)
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#00ff88] text-[#0a0a0f] text-[13px] font-bold hover:opacity-90 flex items-center justify-center gap-2"
              >
                {locked ? <Lock size={14} /> : <Sparkles size={14} />}
                {locked ? 'Unlock Council' : 'Apply #1 fix'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}