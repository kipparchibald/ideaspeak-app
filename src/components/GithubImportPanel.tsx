/**
 * Connect to GitHub and import a repo into the Projects library.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  FolderGit2,
  Search,
  Loader2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  AUTOPILOT_LINKS,
  connectGithub,
  importGithubRepoFiles,
  listGithubRepos,
  loadGithubToken,
  parseGithubRepoInput,
  saveGithubToken,
  workspaceFromGithubImport,
  type GithubRepoSummary,
} from '../lib/github-import'
import type { SavedWorkspace } from '../lib/projects'

interface GithubImportPanelProps {
  open: boolean
  onClose: () => void
  onImported: (workspace: SavedWorkspace) => void
}

export function GithubImportPanel({ open, onClose, onImported }: GithubImportPanelProps) {
  const [token, setToken] = useState(() => loadGithubToken())
  const [login, setLogin] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [repos, setRepos] = useState<GithubRepoSummary[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [error, setError] = useState('')

  const resetSession = useCallback(() => {
    setLogin(null)
    setRepos([])
    setError('')
  }, [])

  const handleConnect = useCallback(async () => {
    setConnecting(true)
    setError('')
    try {
      const user = await connectGithub(token)
      setLogin(user.login)
      saveGithubToken(token.trim())
      setLoadingRepos(true)
      const list = await listGithubRepos(token.trim())
      setRepos(list)
      toast.success(`Connected as @${user.login}`)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not connect to GitHub'
      setError(msg)
      resetSession()
      toast.error('GitHub connect failed', { description: msg })
    } finally {
      setConnecting(false)
      setLoadingRepos(false)
    }
  }, [token, resetSession])

  useEffect(() => {
    if (!open) return
    setToken(loadGithubToken())
    if (loadGithubToken().trim() && !login) {
      void handleConnect()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps -- connect once when panel opens with saved token

  const filteredRepos = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return repos
    return repos.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q),
    )
  }, [repos, query])

  const runImport = async (owner: string, repo: string, summary?: GithubRepoSummary) => {
    const key = token.trim() || loadGithubToken().trim()
    if (!key) {
      toast.error('Connect to GitHub first')
      return
    }
    const importKey = `${owner}/${repo}`
    setImporting(importKey)
    setError('')
    try {
      if (!login) {
        const user = await connectGithub(key)
        setLogin(user.login)
      }
      const { files, importedCount } = await importGithubRepoFiles(key, owner, repo)
      const repoMeta: GithubRepoSummary =
        summary ||
        repos.find((r) => r.owner === owner && r.name === repo) || {
          fullName: `${owner}/${repo}`,
          name: repo,
          owner,
          description: '',
          htmlUrl: `https://github.com/${owner}/${repo}`,
          defaultBranch: 'main',
          updatedAt: new Date().toISOString(),
          isPrivate: false,
        }

      const ws = workspaceFromGithubImport({
        repo: repoMeta,
        files,
        login: login || owner,
      })
      onImported(ws)
      toast.success(`Imported ${repoMeta.fullName}`, {
        description: `${importedCount} files loaded into preview`,
      })
      onClose()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Import failed'
      setError(msg)
      toast.error('Import failed', { description: msg })
    } finally {
      setImporting(null)
    }
  }

  const handleImportUrl = () => {
    const parsed = parseGithubRepoInput(repoUrl)
    if (!parsed) {
      toast.error('Invalid repo URL', {
        description: 'Use https://github.com/owner/repo or owner/repo',
      })
      return
    }
    void runImport(parsed.owner, parsed.repo)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[115] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-md p-0 sm:p-6"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-[#1f1f27] bg-[#0e0e14] shadow-2xl overflow-hidden"
          >
            <div className="shrink-0 px-5 py-4 border-b border-[#1f1f27] flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <FolderGit2 size={18} className="text-[#e8e8f0]" />
                  <h2 className="text-[17px] font-semibold text-[#e8e8f0]">Import from GitHub</h2>
                </div>
                <p className="text-[12px] text-[#666] mt-0.5">
                  Connect with a personal access token — imports source into live preview
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg text-[#666] hover:text-[#ccc] hover:bg-white/5"
                aria-label="Close GitHub import"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {!login ? (
                <div className="space-y-3">
                  <label className="block text-[11px] font-semibold text-[#888] uppercase tracking-wider">
                    GitHub token
                  </label>
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="ghp_… or github_pat_…"
                    className="w-full px-3 py-2.5 rounded-xl border border-[#1f1f27] bg-[#111116] text-[13px] text-[#e8e8f0] placeholder:text-[#444] focus:outline-none focus:border-[#7dd3fc]/35"
                    autoComplete="off"
                  />
                  <p className="text-[11px] text-[#555] leading-relaxed">
                    Needs <code className="text-[#888]">repo</code> scope for private repos, or{' '}
                    <code className="text-[#888]">public_repo</code> for public only. Stored only in
                    this browser.
                  </p>
                  <a
                    href={AUTOPILOT_LINKS.githubTokens}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-[#7dd3fc] hover:underline"
                  >
                    Create token on GitHub <ExternalLink size={11} />
                  </a>
                  {error && (
                    <p className="flex items-start gap-2 text-[12px] text-red-400">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      {error}
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={connecting || !token.trim()}
                    onClick={() => void handleConnect()}
                    className="w-full py-2.5 rounded-xl bg-[#e8e8f0] text-[#0a0a0f] text-[13px] font-bold hover:opacity-90 disabled:opacity-40 inline-flex items-center justify-center gap-2"
                  >
                    {connecting ? <Loader2 size={16} className="animate-spin" /> : <FolderGit2 size={16} />}
                    Connect to GitHub
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#00ff88]/30 bg-[#00ff88]/08">
                    <CheckCircle2 size={16} className="text-[#00ff88] shrink-0" />
                    <span className="text-[13px] text-[#00ff88] font-semibold">Connected as @{login}</span>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[11px] font-semibold text-[#888] uppercase tracking-wider">
                      Or paste repo URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={repoUrl}
                        onChange={(e) => setRepoUrl(e.target.value)}
                        placeholder="github.com/owner/repo"
                        className="flex-1 px-3 py-2 rounded-xl border border-[#1f1f27] bg-[#111116] text-[13px] text-[#e8e8f0] placeholder:text-[#444] focus:outline-none focus:border-[#7dd3fc]/35"
                      />
                      <button
                        type="button"
                        disabled={!!importing || !repoUrl.trim()}
                        onClick={handleImportUrl}
                        className="shrink-0 px-3 py-2 rounded-xl border border-[#00ff88]/35 bg-[#00ff88]/10 text-[12px] font-semibold text-[#00ff88] hover:bg-[#00ff88]/15 disabled:opacity-40"
                      >
                        Import
                      </button>
                    </div>
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
                      placeholder="Search your repositories…"
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-[#1f1f27] bg-[#111116] text-[13px] text-[#e8e8f0] placeholder:text-[#444] focus:outline-none focus:border-[#7dd3fc]/35"
                    />
                  </div>

                  {error && (
                    <p className="flex items-start gap-2 text-[12px] text-red-400">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      {error}
                    </p>
                  )}

                  <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                    {loadingRepos ? (
                      <div className="flex items-center justify-center gap-2 py-10 text-[#666] text-[13px]">
                        <Loader2 size={18} className="animate-spin" />
                        Loading repositories…
                      </div>
                    ) : filteredRepos.length === 0 ? (
                      <p className="text-center text-[13px] text-[#666] py-8">No repositories found.</p>
                    ) : (
                      filteredRepos.map((repo) => {
                        const busy = importing === repo.fullName
                        return (
                          <button
                            key={repo.fullName}
                            type="button"
                            disabled={!!importing}
                            onClick={() => void runImport(repo.owner, repo.name, repo)}
                            className="w-full text-left rounded-xl border border-[#1f1f27] bg-[#111116] hover:border-[#2a2a35] px-3.5 py-3 transition-colors disabled:opacity-50"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[13px] font-semibold text-[#e8e8f0] truncate">
                                {repo.fullName}
                              </span>
                              {busy ? (
                                <Loader2 size={14} className="animate-spin text-[#7dd3fc] shrink-0" />
                              ) : (
                                <span className="text-[10px] font-semibold text-[#00ff88] shrink-0">
                                  Import
                                </span>
                              )}
                            </div>
                            {repo.description && (
                              <p className="text-[11px] text-[#666] mt-1 line-clamp-2">{repo.description}</p>
                            )}
                          </button>
                        )
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}