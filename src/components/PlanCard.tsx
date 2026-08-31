import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import {
  extractPlanFacets,
  planFacetCount,
  planLooksComplete,
  PLAN_FACET_LABELS,
  type PlanFacetKey,
} from '../lib/plan-card'

type PlanCardProps = {
  messages: { role: string; content: string }[]
  planReady: boolean
  voiceActive: boolean
}

const ORDER: PlanFacetKey[] = ['who', 'loop', 'wow', 'cuts', 'stack']

export function PlanCard({ messages, planReady, voiceActive }: PlanCardProps) {
  const facets = extractPlanFacets(messages)
  const filled = planFacetCount(facets)
  const complete = planLooksComplete(facets) || planReady

  if (filled === 0 && !voiceActive) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`mx-3 sm:mx-4 mb-2 rounded-xl border px-3 py-2.5 ${
        complete
          ? 'border-[#00ff88]/35 bg-[#00ff88]/6'
          : 'border-[#1f1f27] bg-[#0e0e14]'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#888] uppercase tracking-wider">
          <Sparkles size={12} className={complete ? 'text-[#00ff88]' : 'text-[#555]'} />
          Living plan
        </div>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            complete
              ? 'bg-[#00ff88]/15 text-[#00ff88]'
              : voiceActive
                ? 'bg-[#38bdf8]/12 text-[#38bdf8]'
                : 'bg-white/5 text-[#666]'
          }`}
        >
          {complete ? 'Ready to build' : voiceActive ? 'Listening…' : `${filled}/5`}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {ORDER.map((key) => {
          const value = facets[key]
          return (
            <div
              key={key}
              className={`rounded-lg px-2.5 py-1.5 min-h-[36px] ${
                value ? 'bg-[#111116] border border-[#1f1f27]' : 'bg-transparent border border-dashed border-[#1a1a22]'
              }`}
            >
              <div className="text-[9px] font-bold uppercase tracking-wide text-[#555]">
                {PLAN_FACET_LABELS[key]}
              </div>
              <div className={`text-[11.5px] leading-snug mt-0.5 ${value ? 'text-[#c4c4d4]' : 'text-[#3a3a48] italic'}`}>
                {value || '—'}
              </div>
            </div>
          )
        })}
      </div>
      {complete && !planReady && (
        <p className="text-[10px] text-[#00ff88]/70 mt-2 text-center">
          Say &ldquo;build it&rdquo; when you want the live preview — Grok won&apos;t start until you green-light.
        </p>
      )}
    </motion.div>
  )
}
