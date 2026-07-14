/**
 * Voice Pair Build panel — live Grok narration + file patch chips during co-build.
 */

import { AnimatePresence, motion } from 'framer-motion'
import {
  X,
  Mic,
  Hammer,
  Hand,
  Pause,
  Play,
  FileCode2,
  Radio,
  Volume2,
} from 'lucide-react'
import type { VoicePairFilePatch, VoicePairStatus } from '../lib/voice-pair'
import { VOICE_PAIR_STATUS_LABELS } from '../lib/voice-pair'

export interface VoicePairPanelProps {
  active: boolean
  voiceStatus: VoicePairStatus
  narration: string
  filePatches: VoicePairFilePatch[]
  agentPaused?: boolean
  onBargeIn: () => void
  onPauseAgent: () => void
  onResumeAgent: () => void
  onClose: () => void
}

function StatusOrb({ status, paused }: { status: VoicePairStatus; paused?: boolean }) {
  const cfg = VOICE_PAIR_STATUS_LABELS[status]
  const pulse =
    status === 'listening' ||
    status === 'agent-working' ||
    status === 'user-barge-in'

  return (
    <div className="relative shrink-0">
      <div
        className="w-11 h-11 rounded-2xl flex items-center justify-center border"
        style={{
          background: `${cfg.accent}14`,
          borderColor: `${cfg.accent}40`,
          color: cfg.accent,
        }}
      >
        {status === 'agent-working' ? (
          <Hammer size={18} className={paused ? '' : 'animate-pulse'} />
        ) : status === 'user-barge-in' ? (
          <Hand size={18} />
        ) : status === 'listening' ? (
          <Mic size={18} />
        ) : (
          <Radio size={18} />
        )}
      </div>
      {pulse && !paused && (
        <span
          className="absolute inset-0 rounded-2xl animate-ping opacity-30"
          style={{ background: cfg.accent }}
        />
      )}
    </div>
  )
}

function WaveBars({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-[3px] h-5">
      {Array.from({ length: 12 }, (_, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full"
          style={{ background: color }}
          animate={{ height: ['4px', '16px', '6px', '14px', '4px'] }}
          transition={{
            duration: 1.1,
            repeat: Infinity,
            delay: (i % 6) * 0.08,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}

export function VoicePairPanel({
  active,
  voiceStatus,
  narration,
  filePatches,
  agentPaused = false,
  onBargeIn,
  onPauseAgent,
  onResumeAgent,
  onClose,
}: VoicePairPanelProps) {
  if (!active) return null

  const cfg = VOICE_PAIR_STATUS_LABELS[voiceStatus]
  const showBargeIn = voiceStatus === 'agent-working' && !agentPaused
  const showPause = voiceStatus === 'agent-working' && !agentPaused
  const showResume = agentPaused && voiceStatus !== 'idle'
  const isLive =
    voiceStatus === 'listening' ||
    voiceStatus === 'agent-working' ||
    voiceStatus === 'user-barge-in'

  return (
    <AnimatePresence>
      <motion.aside
        initial={{ opacity: 0, x: 16, scale: 0.98 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 16, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        className="w-full sm:w-[min(100%,340px)] shrink-0 flex flex-col max-h-[min(52vh,420px)] rounded-2xl border border-[#1f1f27] bg-[#0c0c12]/95 backdrop-blur-md shadow-[0_12px_40px_rgba(0,0,0,0.45)] overflow-hidden"
        aria-label="Voice pair build"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1f1f27] bg-[#111116]/80">
          <StatusOrb status={voiceStatus} paused={agentPaused} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="text-[11px] font-bold uppercase tracking-widest"
                style={{ color: cfg.accent }}
              >
                {agentPaused && voiceStatus === 'agent-working'
                  ? 'Agent paused'
                  : cfg.headline}
              </span>
              {isLive && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide bg-[#00ff88]/10 border border-[#00ff88]/30 text-[#00ff88]">
                  <span className="w-1 h-1 rounded-full bg-[#00ff88] animate-pulse" />
                  Live
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#666] mt-0.5 truncate">{cfg.sub}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-[#1f1f27] text-[#666] hover:text-[#ccc] hover:border-[#333] flex items-center justify-center transition-colors"
            aria-label="Close voice pair panel"
          >
            <X size={14} />
          </button>
        </div>

        {/* Narration */}
        <div className="px-4 py-3 border-b border-[#1f1f27]/80 min-h-[88px]">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#555] font-medium">
              <Volume2 size={10} className="text-[#00ff88]" />
              Grok narration
            </div>
            {isLive && <WaveBars color={cfg.accent} />}
          </div>
          <p
            className={`text-[13px] leading-relaxed ${
              narration ? 'text-[#c8c8d8]' : 'text-[#555] italic'
            }`}
            aria-live="polite"
          >
            {narration ||
              (voiceStatus === 'agent-working'
                ? agentPaused
                  ? 'Build narration paused — resume or barge in.'
                  : 'Watching the builder…'
                : voiceStatus === 'listening'
                  ? 'Waiting for you to speak…'
                  : 'Connect voice to start pair-build.')}
          </p>
        </div>

        {/* File patches */}
        <div className="flex-1 min-h-0 flex flex-col px-4 py-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#555] font-medium mb-2">
            <FileCode2 size={10} className="text-[#00ff88]" />
            Recent changes
            {filePatches.length > 0 && (
              <span className="text-[#444] normal-case tracking-normal">
                · {filePatches.length}
              </span>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-1.5 pr-0.5">
            {filePatches.length === 0 ? (
              <p className="text-[11px] text-[#444] italic">
                File chips appear as the agent edits your preview.
              </p>
            ) : (
              filePatches.map((patch) => (
                <motion.div
                  key={patch.path}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-2 px-2.5 py-2 rounded-xl border border-[#1f1f27] bg-[#111116]/90 hover:border-[#00ff88]/25 transition-colors"
                >
                  <code className="text-[10px] text-[#00ff88] shrink-0 max-w-[42%] truncate font-mono">
                    {patch.path}
                  </code>
                  <span className="text-[11px] text-[#888] flex-1 leading-snug">
                    {patch.summary}
                  </span>
                </motion.div>
              ))
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-t border-[#1f1f27] bg-[#0a0a0f]/60 flex flex-wrap gap-2">
          {showBargeIn && (
            <button
              type="button"
              onClick={onBargeIn}
              className="flex-1 min-w-[120px] h-9 px-3 rounded-xl border border-[#facc15]/35 bg-[#facc15]/10 text-[#facc15] text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-[#facc15]/18 transition-colors"
            >
              <Hand size={14} />
              Barge in
            </button>
          )}
          {showPause && (
            <button
              type="button"
              onClick={onPauseAgent}
              className="h-9 px-3 rounded-xl border border-[#1f1f27] text-[#888] text-[12px] font-medium inline-flex items-center justify-center gap-1.5 hover:text-[#ccc] hover:border-[#333] transition-colors"
            >
              <Pause size={14} />
              Pause agent
            </button>
          )}
          {showResume && (
            <button
              type="button"
              onClick={onResumeAgent}
              className="flex-1 min-w-[120px] h-9 px-3 rounded-xl border border-[#00ff88]/35 bg-[#00ff88]/10 text-[#00ff88] text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-[#00ff88]/18 transition-colors"
            >
              <Play size={14} />
              Resume agent
            </button>
          )}
        </div>
      </motion.aside>
    </AnimatePresence>
  )
}

export default VoicePairPanel