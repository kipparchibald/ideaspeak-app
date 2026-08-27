import { ClipboardList, AlertCircle, CheckCircle2 } from 'lucide-react'
import type { VoiceWorkRefine } from '../lib/voice-work'
import { statusLabelForKind } from '../lib/voice-work'
import type { ActReceipt } from '../lib/voice-work'
import { ReceiptStrip } from './ReceiptStrip'

interface LivingBriefCardProps {
  refine: VoiceWorkRefine
  isBuilding?: boolean
  receipt?: ActReceipt | null
  acting?: boolean
}

export function LivingBriefCard({ refine, isBuilding = false, receipt = null, acting = false }: LivingBriefCardProps) {
  const { brief, kind, ready, missing } = refine
  const hasContent =
    brief.who || brief.job || brief.v1.length > 0 || missing.length < 10

  if (!hasContent) return null

  return (
    <div className="rounded-xl border border-[#1f1f27] bg-[#111116] overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#1f1f27]">
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardList size={13} className="text-[#00ff88] shrink-0" />
          <span className="text-[11px] font-semibold text-[#888] uppercase tracking-wider truncate">
            Living brief · {kind}
          </span>
        </div>
        <span
          className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
            ready
              ? 'bg-[#00ff88]/12 text-[#00ff88] border border-[#00ff88]/30'
              : 'bg-amber-500/10 text-amber-400 border border-amber-500/25'
          }`}
        >
          {statusLabelForKind(kind, ready, isBuilding)}
        </span>
      </div>

      <div className="px-3 py-2.5 space-y-2 text-[12px]">
        {brief.who && (
          <div>
            <span className="text-[#555] font-medium">Who · </span>
            <span className="text-[#c4c4d4]">{brief.who}</span>
          </div>
        )}
        {brief.job && (
          <div>
            <span className="text-[#555] font-medium">Job · </span>
            <span className="text-[#c4c4d4]">{brief.job}</span>
          </div>
        )}
        {brief.v1.length > 0 && (
          <div>
            <span className="text-[#555] font-medium">v1 · </span>
            <span className="text-[#c4c4d4]">{brief.v1.join(' · ')}</span>
          </div>
        )}
        {brief.done && (
          <div>
            <span className="text-[#555] font-medium">Done · </span>
            <span className="text-[#c4c4d4]">{brief.done}</span>
          </div>
        )}

        {!ready && missing.length > 0 && (
          <div className="flex items-start gap-1.5 pt-1">
            <AlertCircle size={12} className="text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-[11px] text-amber-400/90 font-medium">Still need · </span>
              <span className="text-[11px] text-[#888]">{missing.join(', ')}</span>
            </div>
          </div>
        )}

        {ready && (
          <div className="flex items-center gap-1.5 pt-1 text-[#00ff88]/80">
            <CheckCircle2 size={12} />
            <span className="text-[11px] font-medium">Brief complete — say Do this to proceed</span>
          </div>
        )}

        {refine.handoff && (
          <div className="pt-1 text-[11px] text-[#888]">
            Handoff → <span className="text-[#c4c4d4]">{refine.handoff.target}</span>
            {refine.handoff.reason ? ` · ${refine.handoff.reason}` : ''}
          </div>
        )}

        {receipt && (
          <div className="pt-2">
            <ReceiptStrip receipt={receipt} acting={acting} />
          </div>
        )}
      </div>
    </div>
  )
}
