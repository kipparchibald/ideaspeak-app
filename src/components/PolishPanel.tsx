/**
 * PolishPanel — multi-model second pass (Cursor, Grok, Claude, GPT)
 * Pro feature; Free sees upgrade CTA.
 */

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Copy, Sparkles, Lock, ExternalLink, Wand2, Terminal } from 'lucide-react'
import { toast } from 'sonner'
import {
  POLISH_MODELS,
  buildPolishPrompt,
  type PolishModelId,
  type PolishContext,
  cursorOpenHint,
} from '../lib/polish'
import { canUse, recordUsage, getPlan } from '../lib/billing'

/** Path baked into every production ZIP — Cursor loads rules automatically */
const CURSOR_RULES_PATH = '.cursor/rules/ideaspeak.md'

interface PolishPanelProps {
  open: boolean
  onClose: () => void
  ctx: PolishContext
  onUpgrade: () => void
}

export function PolishPanel({ open, onClose, ctx, onUpgrade }: PolishPanelProps) {
  const [active, setActive] = useState<PolishModelId>('cursor')
  const plan = getPlan()
  const gate = canUse('polish')
  const locked = !gate.ok

  const prompt = useMemo(
    () => buildPolishPrompt(active, ctx),
    [active, ctx],
  )

  const model = POLISH_MODELS.find((m) => m.id === active)!

  const copyPrompt = async () => {
    if (locked) {
      onUpgrade()
      toast.message('Pro feature', { description: gate.reason })
      return
    }
    try {
      await navigator.clipboard.writeText(prompt)
      recordUsage('polish')
      toast.success(`${model.name} polish prompt copied`)
    } catch {
      toast.error('Could not copy')
    }
  }

  const copyCursorRulesPath = async () => {
    try {
      await navigator.clipboard.writeText(CURSOR_RULES_PATH)
      toast.success('Cursor rules path copied', {
        description: `Open your ZIP in Cursor — rules live at ${CURSOR_RULES_PATH}`,
      })
    } catch {
      toast.error('Could not copy')
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[115] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md p-0 sm:p-6"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-[#1f1f27] bg-[#0e0e14] shadow-2xl overflow-hidden"
          >
            <div className="shrink-0 px-5 py-4 border-b border-[#1f1f27] flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Wand2 size={18} className="text-[#00ff88]" />
                  <h2 className="text-[17px] font-semibold text-[#e8e8f0]">Polish</h2>
                  {locked && (
                    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#fa0]/15 text-[#fa0] border border-[#fa0]/30">
                      Pro
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-[#666] mt-0.5">
                  IdeaSpeak builds v1 · specialists refine · {plan.name} plan
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-[#666] hover:text-[#ccc] hover:bg-white/5"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="rounded-xl border border-[#00ff88]/35 bg-gradient-to-br from-[#00ff88]/12 to-[#00ff88]/04 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#00ff88]/15 border border-[#00ff88]/30 flex items-center justify-center shrink-0">
                    <Terminal size={17} className="text-[#00ff88]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-bold text-[#e8e8f0] tracking-tight">
                      Polish in Cursor
                    </h3>
                    <p className="text-[12px] text-[#888] mt-1 leading-relaxed">
                      After your build, unzip the production package and open it in Cursor. Rules load
                      from{' '}
                      <code className="text-[#00ff88]/90 font-mono text-[11px]">
                        {CURSOR_RULES_PATH}
                      </code>{' '}
                      — then paste the Cursor prompt below into Agent chat.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void copyCursorRulesPath()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#00ff88] text-[#0a0a0f] text-[13px] font-bold hover:opacity-90 transition-opacity"
                >
                  <Copy size={14} />
                  Copy Cursor rules path
                </button>
              </div>

              <p className="text-[12.5px] text-[#888] leading-relaxed">
                No single model wins every pass. Use <strong className="text-[#ccc]">Cursor</strong> in
                the IDE, <strong className="text-[#ccc]">Grok</strong> for taste + verify,{' '}
                <strong className="text-[#ccc]">Claude</strong> for auth/RLS,{' '}
                <strong className="text-[#ccc]">GPT</strong> for fast UI copy.
              </p>

              <div className="grid grid-cols-2 gap-2">
                {POLISH_MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setActive(m.id)}
                    className={`text-left rounded-xl border p-3 transition-colors ${
                      active === m.id
                        ? 'border-[#00ff88]/40 bg-[#00ff88]/08'
                        : 'border-[#1f1f27] hover:border-[#333]'
                    }`}
                  >
                    <div
                      className="text-[13px] font-semibold"
                      style={{ color: active === m.id ? m.color : '#e8e8f0' }}
                    >
                      {m.name}
                    </div>
                    <div className="text-[10px] text-[#666] mt-0.5">{m.role}</div>
                    <div className="text-[11px] text-[#777] mt-1.5 leading-snug">{m.strength}</div>
                  </button>
                ))}
              </div>

              <div className="rounded-xl border border-[#1f1f27] bg-[#111116] p-3">
                <div className="text-[11px] font-semibold text-[#888] mb-1">{model.name} · why</div>
                <p className="text-[12px] text-[#aaa] leading-relaxed">{model.why}</p>
              </div>

              <div className="relative rounded-xl border border-[#1f1f27] bg-[#0a0a0f] p-3 max-h-48 overflow-y-auto">
                {locked && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#0a0a0f]/85 backdrop-blur-sm rounded-xl">
                    <Lock size={20} className="text-[#fa0]" />
                    <p className="text-[12px] text-[#ccc] font-medium">Pro multi-model polish</p>
                    <button
                      onClick={onUpgrade}
                      className="px-3 py-1.5 rounded-lg bg-[#00ff88] text-[#0a0a0f] text-[11px] font-bold"
                    >
                      Unlock Pro
                    </button>
                  </div>
                )}
                <pre className="text-[10.5px] text-[#888] whitespace-pre-wrap font-mono leading-relaxed">
                  {prompt}
                </pre>
              </div>

              {active === 'cursor' && (
                <div className="rounded-xl border border-[#1f1f27] px-3 py-2.5 text-[11px] text-[#777] font-mono">
                  {cursorOpenHint(ctx.appName || 'app')}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-[#1f1f27] px-5 py-3 flex gap-2">
              <button
                onClick={() => void copyPrompt()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#00ff88] text-[#0a0a0f] text-[13px] font-bold hover:opacity-90"
              >
                {locked ? <Lock size={14} /> : <Copy size={14} />}
                {locked ? 'Unlock to copy' : `Copy ${model.name} prompt`}
              </button>
              {active === 'cursor' && (
                <a
                  href="https://cursor.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#1f1f27] text-[12px] font-semibold text-[#888] hover:text-[#ccc]"
                >
                  <ExternalLink size={13} /> Cursor
                </a>
              )}
              {active === 'grok' && (
                <a
                  href="https://grok.x.ai"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-[#1f1f27] text-[12px] font-semibold text-[#888] hover:text-[#ccc]"
                >
                  <Sparkles size={13} /> Grok
                </a>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
