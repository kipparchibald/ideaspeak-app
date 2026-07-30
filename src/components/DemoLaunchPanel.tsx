/**
 * Demo / launch video panel — 30s Speak → Preview → Ship walkthrough.
 * Embed real video when VITE_DEMO_VIDEO_URL is set; otherwise guided script + links.
 */

import { motion, AnimatePresence } from 'framer-motion'
import { X, Play, Mic, Eye, Rocket, ExternalLink, Clapperboard } from 'lucide-react'

const DEMO_VIDEO =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: { VITE_DEMO_VIDEO_URL?: string } }).env?.VITE_DEMO_VIDEO_URL) ||
  ''

interface DemoLaunchPanelProps {
  open: boolean
  onClose: () => void
  onStartVoice?: () => void
}

const STEPS = [
  {
    icon: Mic,
    title: 'Speak',
    body: 'Tap the mic and describe the product — Grok plans with you in plain English.',
  },
  {
    icon: Eye,
    title: 'Live preview',
    body: 'Say “build it” — Sandpack (or E2B) renders a working app on the right.',
  },
  {
    icon: Rocket,
    title: 'Ship',
    body: 'Download production ZIP, one-click Vercel, or Launch Autopilot for GitHub → live.',
  },
]

export function DemoLaunchPanel({ open, onClose, onStartVoice }: DemoLaunchPanelProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-6"
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
                  <Clapperboard size={18} className="text-[#00ff88]" />
                  <h2 className="text-[17px] font-semibold text-[#e8e8f0]">
                    30-second demo
                  </h2>
                </div>
                <p className="text-[12px] text-[#666] mt-0.5">
                  Speak → Live Preview → Ship — the whole loop
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-[#666] hover:text-[#ccc] hover:bg-white/5"
                aria-label="Close demo"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {DEMO_VIDEO ? (
                <div className="aspect-video rounded-xl overflow-hidden border border-[#1f1f27] bg-black">
                  <iframe
                    title="IdeaSpeak demo"
                    src={DEMO_VIDEO}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="aspect-video rounded-xl border border-dashed border-[#2a2a35] bg-[#111116] flex flex-col items-center justify-center gap-3 px-6 text-center">
                  <div className="w-14 h-14 rounded-full bg-[#00ff88]/12 border border-[#00ff88]/30 flex items-center justify-center">
                    <Play size={22} className="text-[#00ff88] ml-0.5" />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-[#e8e8f0]">
                      Live walkthrough (in-app)
                    </p>
                    <p className="text-[12px] text-[#666] mt-1 max-w-sm leading-relaxed">
                      Host a Loom / YouTube embed by setting{' '}
                      <code className="text-[#888]">VITE_DEMO_VIDEO_URL</code> — until then, run
                      the script below in the product.
                    </p>
                  </div>
                </div>
              )}

              <ol className="space-y-3">
                {STEPS.map(({ icon: Icon, title, body }, i) => (
                  <li
                    key={title}
                    className="flex gap-3 rounded-xl border border-[#1f1f27] bg-[#111116] px-3.5 py-3"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[#00ff88]/10 border border-[#00ff88]/25 flex items-center justify-center shrink-0">
                      <Icon size={16} className="text-[#00ff88]" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-[#e8e8f0]">
                        {i + 1}. {title}
                      </div>
                      <p className="text-[12px] text-[#777] mt-0.5 leading-relaxed">{body}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="rounded-xl border border-[#1f1f27] bg-[#111116] px-3.5 py-3 text-[12px] text-[#888] leading-relaxed">
                <strong className="text-[#ccc]">Demo script:</strong> “Build a weekly habit
                tracker with streaks and a dark glass UI.” → wait for plan → “build it” → open{' '}
                <strong className="text-[#ccc]">Test</strong> → <strong className="text-[#ccc]">Ship</strong>.
              </div>
            </div>

            <div className="shrink-0 px-5 py-3 border-t border-[#1f1f27] flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onStartVoice?.()
                }}
                className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#00ff88] text-[13px] font-bold text-[#0a0a0f]"
              >
                <Mic size={15} /> Try it now
              </button>
              <a
                href="https://ideaspeak-app.vercel.app"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#1f1f27] text-[12px] font-semibold text-[#888] hover:text-[#ccc]"
              >
                <ExternalLink size={13} /> Live site
              </a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
