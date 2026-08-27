import { Receipt, ShieldOff } from 'lucide-react'
import type { ActReceipt } from '../lib/voice-work'

interface ReceiptStripProps {
  receipt: ActReceipt | null
  acting?: boolean
}

export function ReceiptStrip({ receipt, acting = false }: ReceiptStripProps) {
  if (!receipt) return null

  return (
    <div className="rounded-lg border border-[#00ff88]/20 bg-[#00ff88]/5 px-3 py-2 space-y-1.5">
      <div className="flex items-start gap-2">
        <Receipt size={13} className="text-[#00ff88] shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-[#c4c4d4] leading-snug">{receipt.spoken}</p>
          <p className="text-[10.5px] text-[#666] mt-1">
            {acting ? 'Working…' : receipt.will} · ~{receipt.seconds}s
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 pl-5">
        {receipt.willNot.slice(0, 5).map((item) => (
          <span
            key={item}
            className="text-[9.5px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#111116] border border-[#1f1f27] text-[#555]"
          >
            no {item}
          </span>
        ))}
      </div>
      {receipt.sendBlocked && (
        <div className="flex items-center gap-1.5 pl-5 text-[10px] text-amber-400/90">
          <ShieldOff size={11} />
          Outbound off — preview only
        </div>
      )}
    </div>
  )
}
