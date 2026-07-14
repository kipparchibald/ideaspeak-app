/**
 * ProjectsLibraryPanel — save, browse, and resume voice plans + builds.
 */

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  FolderOpen,
  Plus,
  Trash2,
  MessageSquare,
  Sparkles,
  Rocket,
  Search,
  Save,
  Copy,
  Pencil,
  Check,
  Cloud,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  deleteWorkspace,
  duplicateWorkspace,
  formatRelativeTime,
  listWorkspaces,
  renameWorkspace,
  STATUS_LABELS,
  type SavedWorkspace,
  type WorkspaceStatus,
} from '../lib/projects'
import { isSupabaseConfigured } from '../lib/supabase'

type FilterTab = 'all' | WorkspaceStatus

interface ProjectsLibraryPanelProps {
  open: boolean
  onClose: () => void
  activeId: string | null
  /** Bump when saves happen so the list refreshes */
  revision: number
  currentName?: string
  onSelect: (workspace: SavedWorkspace) => void
  onNewProject: () => void
  onSaveCurrent: () => SavedWorkspace | null
  onLibraryChange?: () => void
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

function fileCount(ws: SavedWorkspace): number {
  const files = ws.currentProject?.files
  return files ? Object.keys(files).length : 0
}

export function ProjectsLibraryPanel({
  open,
  onClose,
  activeId,
  revision,
  currentName,
  onSelect,
  onNewProject,
  onSaveCurrent,
  onLibraryChange,
}: ProjectsLibraryPanelProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterTab>('all')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  // revision forces re-read from localStorage when panel opens or saves land
  const projects = useMemo(() => (open ? listWorkspaces() : []), [open, revision])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return projects.filter((ws) => {
      if (filter !== 'all' && ws.status !== filter) return false
      if (!q) return true
      return (
        ws.name.toLowerCase().includes(q) ||
        ws.summary.toLowerCase().includes(q) ||
        ws.transcript.toLowerCase().includes(q)
      )
    })
  }, [projects, query, filter])

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    deleteWorkspace(id)
    if (activeId === id) onNewProject()
    onLibraryChange?.()
    toast.message('Project deleted')
  }

  const handleDuplicate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const copy = duplicateWorkspace(id)
    if (copy) {
      onLibraryChange?.()
      toast.success(`Duplicated “${copy.name}”`)
    } else toast.error('Could not duplicate project')
  }

  const startRename = (ws: SavedWorkspace, e: React.MouseEvent) => {
    e.stopPropagation()
    setRenamingId(ws.id)
    setRenameDraft(ws.name)
  }

  const commitRename = (id: string) => {
    const next = renameWorkspace(id, renameDraft)
    setRenamingId(null)
    if (next) {
      onLibraryChange?.()
      toast.success(`Renamed to “${next.name}”`)
    }
  }

  const handleSaveCurrent = () => {
    const saved = onSaveCurrent()
    if (!saved) {
      toast.message('Nothing to save yet', {
        description: 'Send a message or start planning first.',
      })
      return
    }
    toast.success(`Saved “${saved.name}”`, {
      description: 'Your project is in the library — resume anytime.',
    })
  }

  const filterTabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'discussing', label: 'Planning' },
    { id: 'planned', label: 'Ready' },
    { id: 'built', label: 'Built' },
  ]

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
            className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-[#1f1f27] bg-[#0e0e14] shadow-2xl overflow-hidden"
          >
            <div className="shrink-0 px-5 py-4 border-b border-[#1f1f27] flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <FolderOpen size={18} className="text-[#7dd3fc]" />
                  <h2 className="text-[17px] font-semibold text-[#e8e8f0]">Projects library</h2>
                  {projects.length > 0 && (
                    <span className="text-[11px] font-semibold text-[#555] tabular-nums">
                      {projects.length}
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-[#666] mt-0.5">
                  Auto-saved on this device — open any project to pick up where you left off
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-[#666] hover:text-[#ccc] hover:bg-white/5"
                aria-label="Close projects library"
              >
                <X size={18} />
              </button>
            </div>

            <div className="shrink-0 px-5 py-3 border-b border-[#1f1f27] space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onNewProject()
                    onClose()
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#7dd3fc]/35 bg-[#7dd3fc]/10 text-[13px] font-semibold text-[#7dd3fc] hover:opacity-90"
                >
                  <Plus size={15} /> New project
                </button>
                <button
                  type="button"
                  onClick={handleSaveCurrent}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[#00ff88]/35 bg-[#00ff88]/10 text-[13px] font-semibold text-[#00ff88] hover:opacity-90"
                  title={currentName ? `Save “${currentName}”` : 'Save current project'}
                >
                  <Save size={15} /> Save now
                </button>
              </div>

              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555] pointer-events-none"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search projects…"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#1f1f27] bg-[#111116] text-[13px] text-[#e8e8f0] placeholder:text-[#444] focus:outline-none focus:border-[#7dd3fc]/35"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {filterTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilter(tab.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                      filter === tab.id
                        ? 'border-[#7dd3fc]/40 bg-[#7dd3fc]/12 text-[#7dd3fc]'
                        : 'border-[#1f1f27] text-[#666] hover:text-[#999]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-[200px]">
              {filtered.length === 0 ? (
                <p className="text-center text-[13px] text-[#666] py-12 px-4 leading-relaxed">
                  {projects.length === 0
                    ? 'No saved projects yet. Start a voice session — your plan saves automatically after your first message.'
                    : 'No projects match your search.'}
                </p>
              ) : (
                filtered.map((ws) => {
                  const isActive = ws.id === activeId
                  const files = fileCount(ws)
                  const isRenaming = renamingId === ws.id

                  return (
                    <div
                      key={ws.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (isRenaming) return
                        onSelect(ws)
                        onClose()
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isRenaming) {
                          onSelect(ws)
                          onClose()
                        }
                      }}
                      className={`w-full text-left rounded-xl border px-3.5 py-3 transition-colors cursor-pointer ${
                        isActive
                          ? 'border-[#7dd3fc]/45 bg-[#7dd3fc]/08'
                          : 'border-[#1f1f27] bg-[#111116] hover:border-[#2a2a35]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {isRenaming ? (
                              <div
                                className="flex items-center gap-1.5 flex-1 min-w-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  value={renameDraft}
                                  onChange={(e) => setRenameDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitRename(ws.id)
                                    if (e.key === 'Escape') setRenamingId(null)
                                  }}
                                  className="flex-1 min-w-0 px-2 py-1 rounded-lg border border-[#7dd3fc]/40 bg-[#0c0c10] text-[13px] text-[#e8e8f0] focus:outline-none"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={() => commitRename(ws.id)}
                                  className="p-1.5 rounded-lg text-[#00ff88] hover:bg-[#00ff88]/10"
                                  aria-label="Confirm rename"
                                >
                                  <Check size={14} />
                                </button>
                              </div>
                            ) : (
                              <span className="text-[13px] font-semibold text-[#e8e8f0] truncate">
                                {ws.name}
                              </span>
                            )}
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
                            {ws.conversation.filter((m) => m.role === 'user').length} turns
                            {files > 0 ? ` · ${files} files` : ''} ·{' '}
                            {formatRelativeTime(ws.updatedAt)}
                            {isActive ? ' · current' : ''}
                          </p>
                        </div>
                        <div
                          className="flex shrink-0 items-center gap-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={(e) => startRename(ws, e)}
                            className="p-1.5 rounded-lg text-[#555] hover:text-[#7dd3fc] hover:bg-[#7dd3fc]/10"
                            aria-label={`Rename ${ws.name}`}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDuplicate(ws.id, e)}
                            className="p-1.5 rounded-lg text-[#555] hover:text-[#ccc] hover:bg-white/5"
                            aria-label={`Duplicate ${ws.name}`}
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(ws.id, e)}
                            className="p-1.5 rounded-lg text-[#555] hover:text-red-400 hover:bg-red-500/10"
                            aria-label={`Delete ${ws.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="shrink-0 px-5 py-3 border-t border-[#1f1f27] flex items-center justify-between gap-2 text-[10.5px] text-[#555]">
              <span>
                {projects.length} project{projects.length === 1 ? '' : 's'} saved on this device
              </span>
              {isSupabaseConfigured && (
                <span className="inline-flex items-center gap-1 text-[#666]">
                  <Cloud size={11} />
                  Sign in to sync across devices
                </span>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}