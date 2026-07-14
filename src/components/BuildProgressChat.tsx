/**
 * Inline build narration in the chat column — agent log + live code peek.
 */

import { useEffect, useRef } from 'react'
import { Sparkles, FileCode2 } from 'lucide-react'
import type { BuildProgressSnapshot } from '../lib/build-progress'
import { formatLogTimestamp } from '../lib/build-progress'

interface BuildProgressChatProps {
  progress: BuildProgressSnapshot
  /** Latest generated files — show snippet when App.tsx updates */
  codePeek?: { path: string; code: string }
}

export function BuildProgressChat({ progress, codePeek }: BuildProgressChatProps) {
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = logRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [progress.log.length, progress.headline])

  const working = progress.phase === 'working' || progress.phase === 'intro'
  const done = progress.phase === 'done'
  const failed = progress.phase === 'error'

  const snippet =
    codePeek?.code?.trim().slice(0, 480) ||
    ''

  return (
    <div className="flex gap-2.5 w-full">
      <div
        className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center border ${
          done
            ? 'bg-[#00ff88]/15 border-[#00ff88]/35'
            : failed
              ? 'bg-red-500/10 border-red-500/30'
              : 'bg-[#00ff88]/10 border-[#00ff88]/25'
        }`}
      >
        {working ? (
          <div className="w-3.5 h-3.5 rounded-full border-2 border-[#00ff88] border-t-transparent animate-spin" />
        ) : (
          <Sparkles size={12} className={done ? 'text-[#00ff88]' : 'text-red-400'} />
        )}
      </div>

      <div className="flex-1 min-w-0 rounded-2xl rounded-tl-md border border-[#1f1f27] bg-[#0a0a0f] overflow-hidden">
        <div className="px-3.5 py-2.5 border-b border-[#1f1f27] bg-[#111116]">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#00ff88]/80 mb-1">
            Builder · {progress.kind === 'plan' ? 'from your plan' : 'live'}
            {working && <span className="text-[#666] normal-case tracking-normal"> · working</span>}
          </div>
          <p className="text-[13px] font-medium text-[#e8e8f0] leading-snug">
            {progress.headline || 'Compiling your live preview…'}
          </p>
        </div>

        <div
          ref={logRef}
          className="max-h-[min(28vh,220px)] overflow-y-auto px-3 py-2 font-mono text-[10.5px] leading-relaxed scroll-smooth"
          aria-live="polite"
        >
          {progress.log.length === 0 ? (
            <div className="text-[#555] italic py-1">Starting agent toolchain…</div>
          ) : (
            progress.log.map((line) => (
              <div key={line.id} className="flex gap-2 py-0.5 text-[#8a8aa0]">
                <span className="text-[#444] shrink-0 tabular-nums">{formatLogTimestamp(line.ts)}</span>
                {line.agent && (
                  <span className="text-[#00ff88]/60 shrink-0 w-[72px] truncate">[{line.agent}]</span>
                )}
                <span className="flex-1 break-words">{line.text}</span>
              </div>
            ))
          )}
          {working && (
            <div className="flex gap-2 py-1 text-[#555] animate-pulse">
              <span>···</span>
              <span>agent running</span>
            </div>
          )}
        </div>

        {snippet && (
          <div className="border-t border-[#1f1f27] bg-[#07070c]">
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-[#666] border-b border-[#14141c]">
              <FileCode2 size={11} className="text-[#7dd3fc]" />
              <span className="font-mono text-[#7dd3fc]">{codePeek?.path || 'src/App.tsx'}</span>
            </div>
            <pre className="px-3 py-2 text-[10px] text-[#9a9ab8] font-mono overflow-x-auto max-h-[140px] overflow-y-auto whitespace-pre-wrap break-all">
              {snippet}
              {codePeek && codePeek.code.length > 480 ? '\n…' : ''}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}