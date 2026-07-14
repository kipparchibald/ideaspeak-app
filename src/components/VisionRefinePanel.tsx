/**
 * VisionRefinePanel — Screenshot → Living UI
 * Drag-drop or file picker, before/after preview, Apply → onApply(refinementText, imageBase64)
 */

import { useCallback, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  ImageIcon,
  Upload,
  Sparkles,
  ArrowRight,
  Loader2,
  ScanEye,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  VISION_REFINE_CHIP,
  VISION_IMAGE_ACCEPT,
  readImageAsDataUrl,
  refineFromScreenshot,
  type VisionRefineResult,
} from '../lib/vision-refine'

export { VISION_REFINE_CHIP }

interface VisionRefinePanelProps {
  open: boolean
  onClose: () => void
  hasBuilt: boolean
  appName?: string
  idea?: string
  fileList?: string[]
  appSourcePreview?: string
  apiKey?: string
  onApply: (refinementText: string, imageBase64: string | null) => void | Promise<void>
}

export function VisionRefinePanel({
  open,
  onClose,
  hasBuilt,
  appName = 'My IdeaSpeak App',
  idea,
  fileList = [],
  appSourcePreview,
  apiKey,
  onApply,
}: VisionRefinePanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imageName, setImageName] = useState<string | null>(null)
  const [userNote, setUserNote] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<VisionRefineResult | null>(null)

  const resetImage = useCallback(() => {
    setImageBase64(null)
    setImageName(null)
    setResult(null)
  }, [])

  const handleFile = useCallback(async (file: File) => {
    try {
      const { dataUrl } = await readImageAsDataUrl(file)
      setImageBase64(dataUrl)
      setImageName(file.name)
      setResult(null)
      toast.success('Screenshot loaded')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not load image')
    }
  }, [])

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) void handleFile(file)
    },
    [handleFile],
  )

  const runAnalysis = useCallback(async (): Promise<VisionRefineResult | null> => {
    if (!imageBase64) {
      toast.error('Upload a screenshot first')
      return null
    }
    setAnalyzing(true)
    try {
      const analysis = await refineFromScreenshot(
        imageBase64,
        {
          appName,
          idea,
          userNote: userNote.trim() || undefined,
          fileList,
          appSourcePreview,
        },
        apiKey,
      )
      setResult(analysis)
      if (analysis.live) {
        toast.success('Vision analysis ready', {
          description: 'Grok studied your screenshot',
        })
      } else {
        toast.message('Simulator mode', {
          description: analysis.error || 'Add Grok key for live vision',
        })
      }
      return analysis
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Vision analysis failed')
      return null
    } finally {
      setAnalyzing(false)
    }
  }, [imageBase64, appName, idea, userNote, fileList, appSourcePreview, apiKey])

  const handleApply = useCallback(async () => {
    if (!hasBuilt) {
      toast.error('Build an app first — then match a screenshot')
      return
    }
    if (!imageBase64) {
      toast.error('Upload a screenshot first')
      return
    }

    setApplying(true)
    try {
      const analysis = result || (await runAnalysis())
      if (!analysis) return

      const text =
        analysis.refinementText.trim() ||
        `Match the uploaded screenshot for ${appName}. ${analysis.refinementBrief.designNotes || ''}`.trim()

      await onApply(text, imageBase64)
      toast.success('Applying screenshot match…', {
        description: 'Live preview will refresh',
      })
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not apply refinement')
    } finally {
      setApplying(false)
    }
  }, [hasBuilt, imageBase64, result, runAnalysis, onApply, appName, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[112] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md p-0 sm:p-6"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            className="w-full max-w-2xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-[#1f1f27] bg-[#0e0e14] shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="shrink-0 px-5 pt-5 pb-4 border-b border-[#1f1f27]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-[#00ff88]/12 border border-[#00ff88]/30 flex items-center justify-center">
                      <ScanEye size={18} className="text-[#00ff88]" />
                    </div>
                    <div>
                      <h2 className="text-[17px] font-semibold tracking-tight text-[#e8e8f0]">
                        Screenshot → Living UI
                      </h2>
                      <p className="text-[12px] text-[#666]">
                        Grok vision reads your reference · preview updates to match
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg text-[#666] hover:text-[#ccc] hover:bg-white/5"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#00ff88]/10 border border-[#00ff88]/30 text-[#00ff88]">
                  <Sparkles size={11} />
                  {VISION_REFINE_CHIP}
                </span>
                <span className="text-[11px] text-[#555] self-center">
                  Proactive after build · drop any UI mock or Dribbble shot
                </span>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {!hasBuilt && (
                <div className="rounded-xl border border-[#fa0]/25 bg-[#fa0]/08 px-3 py-2.5 text-[12px] text-[#fa0]">
                  Build an app in preview first — then upload a screenshot to reskin it.
                </div>
              )}

              {/* Upload zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`relative rounded-2xl border-2 border-dashed transition-colors ${
                  dragOver
                    ? 'border-[#00ff88]/50 bg-[#00ff88]/06'
                    : imageBase64
                      ? 'border-[#1f1f27] bg-[#111116]'
                      : 'border-[#2a2a35] bg-[#111116] hover:border-[#00ff88]/30'
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept={VISION_IMAGE_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handleFile(file)
                    e.target.value = ''
                  }}
                />

                {!imageBase64 ? (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center gap-3 py-10 px-4 text-center"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-[#00ff88]/10 border border-[#00ff88]/25 flex items-center justify-center">
                      <Upload size={22} className="text-[#00ff88]" />
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-[#e8e8f0]">
                        Drop screenshot here
                      </p>
                      <p className="text-[12px] text-[#666] mt-1">
                        or click to browse · PNG, JPEG, WebP up to 4 MB
                      </p>
                    </div>
                  </button>
                ) : (
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[11px] font-semibold text-[#888] uppercase tracking-wider flex items-center gap-1">
                        <ImageIcon size={11} /> {imageName || 'Screenshot'}
                      </span>
                      <button
                        type="button"
                        onClick={resetImage}
                        className="text-[11px] text-[#666] hover:text-[#00ff88] font-semibold"
                      >
                        Replace
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Before / After */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <PreviewCard
                  label="Before"
                  sublabel="Your reference"
                  imageSrc={imageBase64}
                  empty={
                    <div className="flex flex-col items-center justify-center gap-2 text-[#555] py-8">
                      <ImageIcon size={28} className="opacity-40" />
                      <span className="text-[12px]">Upload to preview</span>
                    </div>
                  }
                />
                <PreviewCard
                  label="After"
                  sublabel="Live preview"
                  accent
                  empty={
                    <div className="flex flex-col items-center justify-center gap-2 text-[#555] py-8 px-3 text-center">
                      <ArrowRight size={22} className="text-[#00ff88]/50" />
                      <span className="text-[12px] leading-relaxed">
                        Apply updates Sandpack preview to mirror layout, colors, and type from your
                        screenshot
                      </span>
                    </div>
                  }
                  footer={
                    result ? (
                      <p className="text-[11px] text-[#888] leading-relaxed line-clamp-3">
                        {result.refinementText}
                      </p>
                    ) : undefined
                  }
                />
              </div>

              <label className="block">
                <span className="text-[11px] font-semibold text-[#666] uppercase tracking-wider">
                  Optional note
                </span>
                <textarea
                  value={userNote}
                  onChange={(e) => setUserNote(e.target.value)}
                  placeholder="e.g. Match the hero spacing and mint accent, keep our copy"
                  rows={2}
                  className="mt-1.5 w-full resize-none bg-[#111116] border border-[#1f1f27] rounded-xl px-3 py-2.5 text-[13px] text-[#e8e8f0] placeholder:text-[#3d3d48] outline-none focus:border-[#00ff88]/40 leading-relaxed"
                />
              </label>

              {result && (
                <div className="rounded-xl border border-[#1f1f27] bg-[#111116] p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-[#888]">
                      Suggested edits · {result.suggestedFileEdits.length} file
                      {result.suggestedFileEdits.length === 1 ? '' : 's'}
                    </span>
                    {result.live ? (
                      <span className="text-[10px] font-bold text-[#00ff88]">Grok vision</span>
                    ) : (
                      <span className="text-[10px] text-[#666]">Simulator</span>
                    )}
                  </div>
                  <ul className="space-y-1.5">
                    {result.suggestedFileEdits.slice(0, 4).map((edit) => (
                      <li
                        key={edit.path}
                        className="text-[12px] text-[#aaa] flex items-start gap-2"
                      >
                        <code className="text-[#00ff88]/80 font-mono text-[10px] shrink-0">
                          {edit.path}
                        </code>
                        <span className="text-[#777]">{edit.summary}</span>
                      </li>
                    ))}
                  </ul>
                  {result.refinementBrief.keyChanges?.length ? (
                    <div className="pt-2 border-t border-[#1f1f27]">
                      <div className="text-[10px] font-semibold text-[#666] mb-1">Key changes</div>
                      <ul className="text-[11px] text-[#888] space-y-0.5">
                        {result.refinementBrief.keyChanges.slice(0, 3).map((c) => (
                          <li key={c}>· {c}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 border-t border-[#1f1f27] px-5 py-3 flex gap-2">
              <button
                type="button"
                onClick={() => void runAnalysis()}
                disabled={!imageBase64 || analyzing || applying}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#1f1f27] text-[12px] font-semibold text-[#888] hover:text-[#ccc] hover:border-[#333] disabled:opacity-40"
              >
                {analyzing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                {analyzing ? 'Analyzing…' : result ? 'Re-analyze' : 'Analyze'}
              </button>
              <button
                type="button"
                onClick={() => void handleApply()}
                disabled={!imageBase64 || !hasBuilt || analyzing || applying}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#00ff88] text-[#0a0a0f] text-[13px] font-bold hover:opacity-90 disabled:opacity-40 transition-opacity"
              >
                {applying ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Sparkles size={15} />
                )}
                {applying ? 'Applying…' : 'Apply to live preview'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function PreviewCard({
  label,
  sublabel,
  imageSrc,
  empty,
  footer,
  accent,
}: {
  label: string
  sublabel: string
  imageSrc?: string | null
  empty: ReactNode
  footer?: ReactNode
  accent?: boolean
}) {
  return (
    <div
      className={`rounded-xl border overflow-hidden flex flex-col ${
        accent ? 'border-[#00ff88]/25 bg-[#00ff88]/04' : 'border-[#1f1f27] bg-[#111116]'
      }`}
    >
      <div className="px-3 py-2 border-b border-[#1f1f27]/80 flex items-center justify-between">
        <div>
          <div
            className={`text-[12px] font-semibold ${accent ? 'text-[#00ff88]' : 'text-[#e8e8f0]'}`}
          >
            {label}
          </div>
          <div className="text-[10px] text-[#555]">{sublabel}</div>
        </div>
        {accent && (
          <span className="text-[9px] font-bold uppercase tracking-wide text-[#00ff88]/70">
            Live
          </span>
        )}
      </div>
      <div className="min-h-[140px] max-h-[200px] overflow-hidden flex items-center justify-center bg-[#0a0a0f]">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={`${label} preview`}
            className="w-full h-full object-contain object-center max-h-[200px]"
          />
        ) : (
          empty
        )}
      </div>
      {footer && (
        <div className="px-3 py-2 border-t border-[#1f1f27]/80 bg-[#0e0e14]/80">{footer}</div>
      )}
    </div>
  )
}