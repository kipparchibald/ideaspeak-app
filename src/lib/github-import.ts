/**
 * Import GitHub repositories into IdeaSpeak projects (browser PAT → GitHub REST).
 */

import { loadGithubToken, saveGithubToken, AUTOPILOT_LINKS } from './autopilot'
import type { CurrentProject, ProjectFile, SavedWorkspace } from './projects'

export { loadGithubToken, saveGithubToken, AUTOPILOT_LINKS }

export interface GithubRepoSummary {
  fullName: string
  name: string
  owner: string
  description: string
  htmlUrl: string
  defaultBranch: string
  updatedAt: string
  isPrivate: boolean
}

const SKIP_PATH =
  /(^|\/)(node_modules|dist|build|\.next|coverage|\.git|\.vercel|\.turbo|vendor)(\/|$)/i
const SKIP_FILE = /\.(lock|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|mp4|zip|pdf|bin)$/i
const IMPORT_EXT = /\.(tsx?|jsx?|css|html|json|md)$/i
const MAX_FILES = 64
const MAX_FILE_BYTES = 120_000
const MAX_TOTAL_BYTES = 900_000

async function githubFetch<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  })

  if (!res.ok) {
    let detail = res.statusText
    try {
      const err = (await res.json()) as { message?: string }
      detail = err.message || detail
    } catch {
      /* ignore */
    }
    throw new Error(detail || `GitHub API ${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export function parseGithubRepoInput(input: string): { owner: string; repo: string } | null {
  const raw = input.trim()
  if (!raw) return null

  const ssh = raw.match(/^git@github\.com:([^/]+)\/([^/.]+?)(?:\.git)?$/i)
  if (ssh) return { owner: ssh[1], repo: ssh[2] }

  try {
    const url = raw.startsWith('http') ? new URL(raw) : new URL(`https://${raw}`)
    if (!url.hostname.replace(/^www\./, '').endsWith('github.com')) return null
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) return null
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') }
  } catch {
    const slash = raw.match(/^([^/]+)\/([^/]+)$/)
    if (slash) return { owner: slash[1], repo: slash[2] }
  }
  return null
}

export async function connectGithub(token: string): Promise<{ login: string; name?: string }> {
  const t = token.trim()
  if (!t) throw new Error('GitHub token required')
  const user = await githubFetch<{ login: string; name?: string }>(t, '/user')
  saveGithubToken(t)
  return user
}

export async function listGithubRepos(token: string): Promise<GithubRepoSummary[]> {
  const data = await githubFetch<
    Array<{
      full_name: string
      name: string
      owner: { login: string }
      description: string | null
      html_url: string
      default_branch: string
      updated_at: string
      private: boolean
    }>
  >(token, '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member')

  return data.map((r) => ({
    fullName: r.full_name,
    name: r.name,
    owner: r.owner.login,
    description: r.description || '',
    htmlUrl: r.html_url,
    defaultBranch: r.default_branch || 'main',
    updatedAt: r.updated_at,
    isPrivate: r.private,
  }))
}

function shouldImportPath(path: string): boolean {
  if (!path || SKIP_PATH.test(path)) return false
  if (SKIP_FILE.test(path)) return false
  if (path === 'package.json' || path === 'package-lock.json') return path === 'package.json'
  if (!IMPORT_EXT.test(path)) return false
  if (!path.startsWith('src/') && path !== 'index.html' && path !== 'package.json') return false
  return true
}

function decodeGithubContent(content: string, encoding: string): string {
  if (encoding === 'base64') {
    const bin = atob(content.replace(/\n/g, ''))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  }
  return content
}

async function fetchRepoFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
): Promise<string> {
  const data = await githubFetch<{ content: string; encoding: string; size: number }>(
    token,
    `/repos/${owner}/${repo}/contents/${path
      .split('/')
      .map((s) => encodeURIComponent(s))
      .join('/')}`,
  )
  if (data.size > MAX_FILE_BYTES) throw new Error(`File too large: ${path}`)
  return decodeGithubContent(data.content || '', data.encoding || 'utf-8')
}

export async function importGithubRepoFiles(
  token: string,
  owner: string,
  repo: string,
  branch?: string,
): Promise<{ files: Record<string, string>; branch: string; importedCount: number }> {
  const meta = await githubFetch<{ default_branch: string }>(token, `/repos/${owner}/${repo}`)
  const ref = branch || meta.default_branch || 'main'

  const tree = await githubFetch<{
    tree: Array<{ path: string; type: string; size?: number }>
  }>(token, `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`)

  const candidates = tree.tree
    .filter((e) => e.type === 'blob' && shouldImportPath(e.path))
    .filter((e) => (e.size ?? 0) <= MAX_FILE_BYTES)
    .slice(0, MAX_FILES)

  if (candidates.length === 0) {
    throw new Error('No preview-safe source files found (need src/*.tsx or similar)')
  }

  const files: Record<string, string> = {}
  let total = 0

  for (const entry of candidates) {
    if (total >= MAX_TOTAL_BYTES) break
    try {
      const code = await fetchRepoFile(token, owner, repo, entry.path)
      if (code.length > MAX_FILE_BYTES) continue
      files[entry.path] = code
      total += code.length
    } catch {
      /* skip unreadable paths */
    }
  }

  if (Object.keys(files).length === 0) {
    throw new Error('Could not read source files from this repository')
  }

  return { files, branch: ref, importedCount: Object.keys(files).length }
}

export function workspaceFromGithubImport(opts: {
  repo: GithubRepoSummary
  files: Record<string, string>
  login: string
}): SavedWorkspace {
  const now = new Date().toISOString()
  const projectFiles: ProjectFile = {}
  for (const [path, code] of Object.entries(opts.files)) {
    projectFiles[path] = { code }
  }

  const opener = {
    id: `gh-opener-${Date.now()}`,
    role: 'assistant' as const,
    content: `Imported **${opts.repo.fullName}** from GitHub (@${opts.login}). Live preview is on the right — refine by voice or Manual edit.`,
  }

  const currentProject: CurrentProject = {
    id: `proj-gh-${Date.now().toString(36)}`,
    name: opts.repo.name,
    brief: {
      vision: opts.repo.description || opts.repo.name,
      source: 'github',
      repoUrl: opts.repo.htmlUrl,
      githubOwner: opts.repo.owner,
    },
    optimizedPrompt: '',
    files: projectFiles,
    transcript: `GitHub import: ${opts.repo.htmlUrl}`,
  }

  return {
    id: `gh-${Date.now().toString(36)}`,
    name: opts.repo.name,
    summary: opts.repo.description || `Imported from ${opts.repo.fullName}`,
    status: 'built',
    mode: 'build',
    createdAt: now,
    updatedAt: now,
    conversation: [opener],
    transcript: `Imported from GitHub: ${opts.repo.htmlUrl}`,
    buildPlan: null,
    currentProject,
    selectedPersonality: 'grok',
    proactiveSuggestions: [],
    planReady: true,
    lastBuildPlan: `GitHub · ${opts.repo.fullName}`,
  }
}