import { FileText, ListChecks, Search, ArrowRightLeft, Mail } from 'lucide-react'
import type { WorkProduct } from '../lib/voice-work'

interface WorkProductPaneProps {
  products: WorkProduct[]
  kind: string
  isDrafting?: boolean
}

const TYPE_ICONS = {
  draft: Mail,
  checklist: ListChecks,
  brief: FileText,
  handoff: ArrowRightLeft,
  research: Search,
} as const

export function WorkProductPane({ products, kind, isDrafting = false }: WorkProductPaneProps) {
  if (products.length === 0 && !isDrafting) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[280px] p-8 text-center">
        <FileText size={32} className="text-[#333] mb-3" />
        <p className="text-[14px] font-semibold text-[#666]">
          {kind === 'BUILD' ? 'Preview will appear after build' : 'Work product will appear here'}
        </p>
        <p className="text-[12px] text-[#444] mt-1 max-w-xs">
          Complete the brief and say Do this — drafts and checklists show here instead of an empty
          preview.
        </p>
      </div>
    )
  }

  if (isDrafting && products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[280px] p-8 text-center">
        <div className="w-10 h-10 rounded-full border-2 border-[#00ff88] border-t-transparent animate-spin mb-3" />
        <p className="text-[14px] font-semibold text-[#00ff88]">Drafting work product…</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {products.map((product, i) => {
        const Icon = TYPE_ICONS[product.type] || FileText
        return (
          <div
            key={`${product.title}-${i}`}
            className="rounded-xl border border-[#1f1f27] bg-[#111116] overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#1f1f27]">
              <Icon size={14} className="text-[#00ff88]" />
              <span className="text-[12px] font-semibold text-[#c4c4d4]">{product.title}</span>
              <span className="ml-auto text-[10px] uppercase tracking-wide text-[#555]">
                {product.type === 'draft' || product.draft?.unsent
                  ? 'draft · unsent'
                  : `${product.type} · preview only`}
              </span>
            </div>
            <pre className="px-4 py-3 text-[12.5px] leading-relaxed text-[#a8a8b8] whitespace-pre-wrap font-sans">
              {product.content}
            </pre>
          </div>
        )
      })}
    </div>
  )
}
