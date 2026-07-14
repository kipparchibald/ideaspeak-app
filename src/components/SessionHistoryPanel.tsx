/**
 * SessionHistoryPanel — resume prior voice plans and builds.
 */


import { motion, AnimatePresence } from 'framer-motion'
import { X, History, Plus, Trash2, MessageSquare, Sparkles, Rocket } from 'lucide-react'
import {
  deleteWorkspace,
  formatRelativeTime,
  listWorkspaces,
  STATUS_LABELS,
  type SavedWorkspace,
  type WorkspaceStatus,
} from '../lib/projects'

interface SessionHistoryPanelProps {
  open: boolean
  onClose: () => void
  activeId: string | null
  onSelect: (workspace: SavedWorkspace) => void
  onNewSession: () => void
}

const STATUS_STYLES: Record<WorkspaceStatus, string> = {
  discussing: 'text-[#888] border-[#333] bg-[#111116]',
  planned: 'text-[#7dd3fc] border-[#7dd3fc]/30 bg-[#7dd3fc]/08',
  built: 'text-[#00ff88] border-[#00ff88]/30 bg-[#00ff88]/08',
}

function StatusIcon({ status }: { status: WorkspaceStatus }) {
  if (status === 'built') return <Rocket size={12} />
  if (status === 'planned') return <Sparkles size={12} />
  return <MessageSquare size={12} />
}

export function SessionHistoryPanel({
  open,
  onClose,
  activeId,
  onSelect,
  onNewSession,
}: SessionHistoryPanelProps) {
  const sessions = open ? listWorkspaces() : []

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    deleteWorkspace(id)
    if (activeId === id) onNewSession()
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
            className="w-full max-w-lg max-h-[88vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-[#1f1f27] bg-[#0e0e14] shadow-2xl overflow-hidden"
          >
            <div className="shrink-0 px-5 py-4 border-b border-[#1f1f27] flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <History size={18} className="text-[#7dd3fc]" />
                  <h2 className="text-[17px] font-semibold text-[#e8e8f0]">Session history</h2>
                </div>
                <p className="text-[12px] text-[#666] mt-0.5">
                  Your voice plans and builds — saved on this device automatically
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-[#666] hover:text-[#ccc] hover:bg-white/5"
                aria-label="Close history"
              >
                <X size={18} />
              </button>
            </div>

            <div className="shrink-0 px-5 py-3 border-b border-[#1f1f27]">
              <button
                type="button"
                onClick={() => {
                  onNewSession()
                  onClose()
                }}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#7dd3fc]/35 bg-[#7dd3fc]/10 text-[13px] font-semibold text-[#7dd3fc] hover:opacity-90"
              >
                <Plus size={15} /> New session
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              {sessions.length === 0 ? (
                <p className="text-center text-[13px] text-[#666] py-10 px-4">
                  No saved sessions yet. Start talking — your plan saves automatically after your
                  first message.
                </p>
              ) : (
                sessions.map((ws) => {
                  const isActive = ws.id === activeId
                  return (
                    <button
                      key={ws.id}
                      type="button"
                      onClick={() => {
                        onSelect(ws)
                        onClose()
                      }}
                      className={`w-full text-left rounded-xl border px-3.5 py-3 transition-colors ${
                        isActive
                          ? 'border-[#7dd3fc]/45 bg-[#7dd3fc]/08'
                          : 'border-[#1f1f27] bg-[#111116] hover:border-[#2a2a35]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-semibold text-[#e8e8f0] truncate">
                              {ws.name}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-semibold uppercase ${STATUS_STYLES[ws.status]}`}
                            >
                              <StatusIcon status={ws.status} />
                              {STATUS_LABELS[ws.status]}
                            </span>
                          </div>
                          <p className="text-[11.5px] text-[#777] mt-1 line-clamp-2 leading-relaxed">
                            {ws.summary || ws.transcript.slice(0, 120)}
                          </p>
                          <p className="text-[10px] text-[#555] mt-1.5">
                            {ws.conversation.filter((m) => m.role === 'user').length} turns ·{' '}
                            {formatRelativeTime(ws.updatedAt)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(ws.id, e)}
                          className="shrink-0 p-1.5 rounded-lg text-[#555] hover:text-red-400 hover:bg-red-500/10"
                          aria-label={`Delete ${ws.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}