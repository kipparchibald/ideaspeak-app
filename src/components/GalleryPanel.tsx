/**
 * GalleryPanel — remix featured voice-built apps into your workspace
 */

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Sparkles, Eye, Shuffle, LayoutGrid, Star, Globe } from 'lucide-react'
import { listFeaturedGallery, listPublicGallery, type GalleryEntry } from '../lib/gallery'
import { formatRelativeTime } from '../lib/projects'

type GalleryFilter = 'featured' | 'public'

interface GalleryPanelProps {
  open: boolean
  onClose: () => void
  onRemix: (entry: GalleryEntry) => void
}

export function GalleryPanel({ open, onClose, onRemix }: GalleryPanelProps) {
  const [filter, setFilter] = useState<GalleryFilter>('featured')
  const [previewEntry, setPreviewEntry] = useState<GalleryEntry | null>(null)

  const entries = useMemo(() => {
    return filter === 'featured' ? listFeaturedGallery() : listPublicGallery()
  }, [open, filter])

  const handleRemix = (entry: GalleryEntry) => {
    onRemix(entry)
    setPreviewEntry(null)
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md p-0 sm:p-6"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            className="w-full max-w-3xl max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-[#1f1f27] bg-[#0e0e14] shadow-2xl overflow-hidden"
          >
            <div className="shrink-0 px-5 py-4 border-b border-[#1f1f27] flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <LayoutGrid size={18} className="text-[#00ff88]" />
                  <h2 className="text-[17px] font-semibold text-[#e8e8f0]">Remix Gallery</h2>
                </div>
                <p className="text-[12px] text-[#666] mt-0.5">
                  Voice-built apps from the community — preview, then remix into your workspace
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-[#666] hover:text-[#ccc] hover:bg-white/5"
                aria-label="Close gallery"
              >
                <X size={18} />
              </button>
            </div>

            <div className="shrink-0 px-5 py-3 border-b border-[#1f1f27] flex items-center gap-2">
              {(
                [
                  { id: 'featured' as GalleryFilter, label: 'Featured', icon: Star },
                  { id: 'public' as GalleryFilter, label: 'Public', icon: Globe },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
                    filter === id
                      ? 'border-[#00ff88]/40 bg-[#00ff88]/10 text-[#00ff88]'
                      : 'border-[#1f1f27] text-[#666] hover:text-[#aaa] hover:border-[#333]'
                  }`}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
              <span className="ml-auto text-[11px] text-[#555] tabular-nums">
                {entries.length} {entries.length === 1 ? 'build' : 'builds'}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {entries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#2a2a35] bg-[#111116] px-6 py-12 text-center">
                  <Sparkles size={24} className="mx-auto text-[#444] mb-3" />
                  <p className="text-[14px] font-medium text-[#888]">No gallery builds yet</p>
                  <p className="text-[12px] text-[#555] mt-1">
                    Featured voice-built apps will appear here for remixing.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {entries.map((entry) => (
                    <article
                      key={entry.id}
                      className="group rounded-xl border border-[#1f1f27] bg-[#111116] overflow-hidden hover:border-[#00ff88]/30 transition-colors flex flex-col"
                    >
                      <div
                        className="h-20 shrink-0 relative"
                        style={{
                          background: entry.previewThumb || 'linear-gradient(135deg, #1a1a22, #0a0a0f)',
                        }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-t from-[#111116] to-transparent" />
                        <div className="absolute bottom-2 left-3 right-3">
                          <h3 className="text-[13px] font-semibold text-[#e8e8f0] truncate">
                            {entry.name}
                          </h3>
                          <p className="text-[10px] text-[#666] mt-0.5">
                            {formatRelativeTime(entry.createdAt)}
                          </p>
                        </div>
                      </div>

                      <div className="p-3 flex-1 flex flex-col gap-2.5">
                        <p className="text-[11px] text-[#777] leading-relaxed line-clamp-2">
                          {entry.transcriptExcerpt}
                        </p>

                        <div className="mt-auto flex gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewEntry(entry)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-[#1f1f27] text-[11px] font-semibold text-[#888] hover:text-[#ccc] hover:border-[#333] transition-colors"
                          >
                            <Eye size={12} />
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemix(entry)}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border border-[#00ff88]/35 bg-[#00ff88]/10 text-[11px] font-bold text-[#00ff88] hover:bg-[#00ff88]/15 transition-colors"
                          >
                            <Shuffle size={12} />
                            Remix
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </motion.div>

          {/* Summary preview overlay */}
          <AnimatePresence>
            {previewEntry && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[111] flex items-center justify-center p-4 sm:p-6 bg-black/60"
                onClick={() => setPreviewEntry(null)}
              >
                <motion.div
                  initial={{ scale: 0.96, y: 8 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.98, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-md rounded-2xl border border-[#1f1f27] bg-[#111116] p-5 shadow-2xl space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[16px] font-semibold text-[#e8e8f0]">{previewEntry.name}</h3>
                      <p className="text-[11px] text-[#555] mt-0.5">
                        {formatRelativeTime(previewEntry.createdAt)} · public gallery
                      </p>
                    </div>
                    <button
                      onClick={() => setPreviewEntry(null)}
                      className="p-1.5 rounded-lg text-[#666] hover:text-[#ccc] hover:bg-white/5"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#555] mb-1">
                        Summary
                      </div>
                      <p className="text-[13px] text-[#c4c4d4] leading-relaxed">{previewEntry.summary}</p>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#555] mb-1">
                        Voice transcript
                      </div>
                      <p className="text-[12px] text-[#888] leading-relaxed italic border-l-2 border-[#00ff88]/30 pl-3">
                        "{previewEntry.transcriptExcerpt}"
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemix(previewEntry)}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#00ff88] text-[13px] font-bold text-[#0a0a0f] hover:opacity-90 transition-opacity"
                  >
                    <Shuffle size={14} />
                    Remix into my workspace
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}