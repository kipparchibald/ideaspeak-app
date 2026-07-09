import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Brain, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react'
import type { BuildProgressSnapshot } from '../lib/build-progress'
import { formatLogTimestamp } from '../lib/build-progress'

interface BuildProgressOverlayProps {
  visible: boolean
  progress: BuildProgressSnapshot
}

export function BuildProgressOverlay({ visible, progress }: BuildProgressOverlayProps) {
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = logRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [progress.log.length, progress.headline])

  if (!visible) return null

  const isDone = progress.phase === 'done'
  const isError = progress.phase === 'error'
  const isWorking = progress.phase === 'working' || progress.phase === 'intro'

  return createPortal(
    <div className="modal-overlay z-[200] bg-black/80 backdrop-blur-md items-center">
      <div className="w-full max-w-2xl mx-auto my-auto glass border border-[#1f1f27] rounded-3xl overflow-hidden shadow-2xl">
        {/* Agent headline */}
        <div className="p-6 border-b border-[#1f1f27]">
          <div className="flex items-start gap-4">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                isDone
                  ? 'bg-[#00ff88]/20 border border-[#00ff88]/40'
                  : isError
                    ? 'bg-red-500/10 border border-red-500/30'
                    : 'bg-[#13131a] border border-[#00ff88]/30'
              }`}
            >
              {isDone ? (
                <CheckCircle2 className="text-[#00ff88]" size={24} />
              ) : isError ? (
                <AlertCircle className="text-red-400" size={24} />
              ) : isWorking ? (
                <div className="w-6 h-6 rounded-full border-2 border-[#00ff88] border-t-transparent animate-spin" />
              ) : (
                <Brain className="text-[#00ff88]" size={24} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-[#00ff88] mb-1 flex items-center gap-2">
                <Sparkles size={10} />
                {progress.kind === 'refine'
                  ? 'Grok refine'
                  : progress.kind === 'plan'
                    ? 'Grok Build'
                    : 'Grok Build'}
                {isWorking && <span className="text-[#666] normal-case tracking-normal">· working</span>}
                {isDone && <span className="text-[#00ff88] normal-case tracking-normal">· complete</span>}
              </div>
              <p className="text-base sm:text-lg font-medium leading-snug text-[#e8e8f0]">
                {progress.headline || 'Preparing your build…'}
              </p>
            </div>
          </div>
        </div>

        {/* Scrolling minutiae log */}
        <div
          ref={logRef}
          className="h-[min(42vh,320px)] overflow-y-auto overflow-x-hidden bg-[#07070c] p-4 font-mono text-[11px] sm:text-xs leading-relaxed scroll-smooth"
          aria-live="polite"
          aria-label="Build progress log"
        >
          {progress.log.length === 0 ? (
            <div className="text-[#555] italic">Initializing agent toolchain…</div>
          ) : (
            progress.log.map((line) => (
              <div key={line.id} className="log-line flex gap-2 py-0.5 text-[#9a9ab0] hover:text-[#c8c8d8]">
                <span className="text-[#444] shrink-0 tabular-nums">{formatLogTimestamp(line.ts)}</span>
                {line.agent && (
                  <span className="text-[#00ff88]/70 shrink-0 w-[88px] truncate">[{line.agent}]</span>
                )}
                <span className="flex-1 break-words">{line.text}</span>
              </div>
            ))
          )}
          {isWorking && (
            <div className="log-line flex gap-2 py-1 text-[#555] animate-pulse">
              <span className="shrink-0">···</span>
              <span>agent running</span>
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-[#1f1f27] text-[10px] text-[#555] flex justify-between">
          <span>Grok Build · IdeaSpeak</span>
          <span>{progress.log.length} events</span>
        </div>
      </div>
    </div>,
    document.body
  )
}