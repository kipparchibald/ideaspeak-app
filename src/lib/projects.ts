/** Local project suite — full workspace snapshots for resume-where-you-left-off */

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export interface ProjectFile {
  [path: string]: { code: string; hidden?: boolean }
}

export interface CurrentProject {
  id: string
  name: string
  brief: Record<string, unknown>
  optimizedPrompt: string
  files: ProjectFile
  transcript: string
}

export interface PlanAgent {
  id: string
  name: string
  emoji: string
  contribution: string
}

export interface BuildScaffoldPlan {
  id: string
  status: 'draft' | 'ready' | 'building' | 'built'
  name: string
  oneLiner: string
  vision: string
  targetUser: string
  coreLoop: string
  wowMoment: string
  v1Features: string[]
  v2Deferred: string[]
  techStack: string[]
  risks: string[]
  buildOrder: string[]
  agents: PlanAgent[]
  fileScaffold: { path: string; purpose: string }[]
  brief: Record<string, unknown>
  optimizedPrompt: string
  createdAt: string
}

export type WorkspaceStatus = 'discussing' | 'planned' | 'built'

export interface SavedWorkspace {
  id: string
  name: string
  summary: string
  status: WorkspaceStatus
  mode: 'discuss' | 'build'
  createdAt: string
  updatedAt: string
  conversation: ConversationMessage[]
  transcript: string
  buildPlan: BuildScaffoldPlan | null
  currentProject: CurrentProject | null
  selectedPersonality: string
  proactiveSuggestions: string[]
}

const WORKSPACES_KEY = 'ideaspeak_workspaces'
const ACTIVE_KEY = 'ideaspeak_active_workspace_id'
const LEGACY_KEY = 'ideaspeak_projects'
const MAX_WORKSPACES = 50

export function deriveWorkspaceName(state: {
  buildPlan?: BuildScaffoldPlan | null
  currentProject?: CurrentProject | null
  conversation?: ConversationMessage[]
}): string {
  if (state.buildPlan?.name) return state.buildPlan.name
  if (state.currentProject?.name) return state.currentProject.name
  const firstUser = state.conversation?.find((m) => m.role === 'user' && !String(m.id).startsWith('voice-opener'))
  if (firstUser?.content) return firstUser.content.slice(0, 48).trim() + (firstUser.content.length > 48 ? '…' : '')
  return 'Untitled Idea'
}

export function deriveWorkspaceSummary(state: {
  buildPlan?: BuildScaffoldPlan | null
  currentProject?: CurrentProject | null
  conversation?: ConversationMessage[]
}): string {
  if (state.buildPlan?.oneLiner) return state.buildPlan.oneLiner
  if (state.currentProject?.brief?.vision && typeof state.currentProject.brief.vision === 'string') {
    return state.currentProject.brief.vision.slice(0, 120)
  }
  const last = [...(state.conversation || [])].reverse().find((m) => m.role === 'assistant')
  return last?.content.slice(0, 120) || 'No activity yet'
}

export function deriveWorkspaceStatus(state: {
  buildPlan?: BuildScaffoldPlan | null
  currentProject?: CurrentProject | null
}): WorkspaceStatus {
  if (state.currentProject?.files && Object.keys(state.currentProject.files).length > 0) return 'built'
  if (state.buildPlan) return 'planned'
  return 'discussing'
}

export function captureWorkspace(state: {
  activeWorkspaceId?: string | null
  conversation: ConversationMessage[]
  transcript: string
  buildPlan: BuildScaffoldPlan | null
  currentProject: CurrentProject | null
  mode: 'discuss' | 'build'
  selectedPersonality: string
  proactiveSuggestions: string[]
}): SavedWorkspace {
  const now = new Date().toISOString()
  const id = state.activeWorkspaceId || `ws-${Date.now().toString(36)}`
  const existing = getWorkspace(id)
  return {
    id,
    name: deriveWorkspaceName(state),
    summary: deriveWorkspaceSummary(state),
    status: deriveWorkspaceStatus(state),
    mode: state.mode,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    conversation: state.conversation,
    transcript: state.transcript,
    buildPlan: state.buildPlan,
    currentProject: state.currentProject,
    selectedPersonality: state.selectedPersonality,
    proactiveSuggestions: state.proactiveSuggestions,
  }
}

function readAll(): SavedWorkspace[] {
  try {
    const raw = localStorage.getItem(WORKSPACES_KEY)
    if (!raw) return migrateLegacyIfNeeded()
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(workspaces: SavedWorkspace[]) {
  localStorage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces.slice(0, MAX_WORKSPACES)))
}

function migrateLegacyIfNeeded(): SavedWorkspace[] {
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]')
    if (!Array.isArray(legacy) || legacy.length === 0) return []
    const migrated: SavedWorkspace[] = legacy.map((p: CurrentProject & { savedAt?: string }) => ({
      id: p.id || `legacy-${Date.now()}`,
      name: p.name || 'Imported Project',
      summary: (p.brief?.vision as string) || p.transcript?.slice(0, 120) || '',
      status: 'built' as const,
      mode: 'build' as const,
      createdAt: p.savedAt || new Date().toISOString(),
      updatedAt: p.savedAt || new Date().toISOString(),
      conversation: [],
      transcript: p.transcript || '',
      buildPlan: null,
      currentProject: p,
      selectedPersonality: 'grok',
      proactiveSuggestions: [],
    }))
    writeAll(migrated)
    localStorage.removeItem(LEGACY_KEY)
    return migrated
  } catch {
    return []
  }
}

export function listWorkspaces(): SavedWorkspace[] {
  return readAll().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export function getWorkspace(id: string): SavedWorkspace | null {
  return readAll().find((w) => w.id === id) || null
}

export function getActiveWorkspaceId(): string | null {
  return localStorage.getItem(ACTIVE_KEY)
}

export function setActiveWorkspaceId(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_KEY, id)
  else localStorage.removeItem(ACTIVE_KEY)
}

export function upsertWorkspace(workspace: SavedWorkspace): SavedWorkspace {
  const all = readAll()
  const idx = all.findIndex((w) => w.id === workspace.id)
  const next = { ...workspace, updatedAt: new Date().toISOString() }
  if (idx >= 0) all[idx] = next
  else all.unshift(next)
  writeAll(all)
  setActiveWorkspaceId(next.id)
  return next
}

export function deleteWorkspace(id: string): void {
  const all = readAll().filter((w) => w.id !== id)
  writeAll(all)
  if (getActiveWorkspaceId() === id) {
    setActiveWorkspaceId(all[0]?.id || null)
  }
}

export function duplicateWorkspace(id: string): SavedWorkspace | null {
  const src = getWorkspace(id)
  if (!src) return null
  const copy: SavedWorkspace = {
    ...JSON.parse(JSON.stringify(src)),
    id: `ws-${Date.now().toString(36)}`,
    name: `${src.name} (copy)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  return upsertWorkspace(copy)
}

export function renameWorkspace(id: string, name: string): SavedWorkspace | null {
  const ws = getWorkspace(id)
  if (!ws) return null
  return upsertWorkspace({ ...ws, name: name.trim() || ws.name })
}

export function getLastSession(): SavedWorkspace | null {
  const activeId = getActiveWorkspaceId()
  if (activeId) {
    const ws = getWorkspace(activeId)
    if (ws) return ws
  }
  const all = listWorkspaces()
  return all[0] || null
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export const STATUS_LABELS: Record<WorkspaceStatus, string> = {
  discussing: 'Discussing',
  planned: 'Plan ready',
  built: 'Built',
}