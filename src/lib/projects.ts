/** Local project suite — full workspace snapshots for resume-where-you-left-off */

import { getSupabase, getSupabaseUser, isSupabaseConfigured } from './supabase'

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

// ── Cloud sync (Sprint 4) — offline-first; sync when signed in ───────────────

export type CloudSyncFailureReason = 'not_configured' | 'not_authenticated' | 'error'

export type CloudSyncResult =
  | { ok: true; synced: number }
  | { ok: false; reason: CloudSyncFailureReason; message?: string }

export type CloudLoadResult =
  | { ok: true; workspaces: SavedWorkspace[] }
  | { ok: false; reason: CloudSyncFailureReason; message?: string }

/** Metadata stored in projects.conversation_json (files live in files_json). */
interface WorkspaceCloudMeta {
  summary: string
  status: WorkspaceStatus
  mode: 'discuss' | 'build'
  createdAt: string
  conversation: ConversationMessage[]
  transcript: string
  buildPlan: BuildScaffoldPlan | null
  currentProject: Omit<CurrentProject, 'files'> | null
  selectedPersonality: string
  proactiveSuggestions: string[]
}

interface ProjectRow {
  id: string
  user_id: string
  name: string
  files_json: ProjectFile
  conversation_json: WorkspaceCloudMeta
  updated_at: string
}

function workspaceToCloudRow(workspace: SavedWorkspace, userId: string): ProjectRow {
  const meta: WorkspaceCloudMeta = {
    summary: workspace.summary,
    status: workspace.status,
    mode: workspace.mode,
    createdAt: workspace.createdAt,
    conversation: workspace.conversation,
    transcript: workspace.transcript,
    buildPlan: workspace.buildPlan,
    currentProject: workspace.currentProject
      ? {
          id: workspace.currentProject.id,
          name: workspace.currentProject.name,
          brief: workspace.currentProject.brief,
          optimizedPrompt: workspace.currentProject.optimizedPrompt,
          transcript: workspace.currentProject.transcript,
        }
      : null,
    selectedPersonality: workspace.selectedPersonality,
    proactiveSuggestions: workspace.proactiveSuggestions,
  }

  return {
    id: workspace.id,
    user_id: userId,
    name: workspace.name,
    files_json: workspace.currentProject?.files ?? {},
    conversation_json: meta,
    updated_at: workspace.updatedAt,
  }
}

function cloudRowToWorkspace(row: ProjectRow): SavedWorkspace {
  const meta = row.conversation_json
  const currentProject: CurrentProject | null = meta.currentProject
    ? {
        ...meta.currentProject,
        files: row.files_json ?? {},
      }
    : null

  return {
    id: row.id,
    name: row.name,
    summary: meta.summary,
    status: meta.status,
    mode: meta.mode,
    createdAt: meta.createdAt,
    updatedAt: row.updated_at,
    conversation: meta.conversation ?? [],
    transcript: meta.transcript ?? '',
    buildPlan: meta.buildPlan ?? null,
    currentProject,
    selectedPersonality: meta.selectedPersonality ?? 'grok',
    proactiveSuggestions: meta.proactiveSuggestions ?? [],
  }
}

/** Push one workspace to Supabase. No-op when unconfigured or signed out. */
export async function saveWorkspaceToCloud(workspace: SavedWorkspace): Promise<CloudSyncResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, reason: 'not_configured' }
  }

  const supabase = getSupabase()
  if (!supabase) {
    return { ok: false, reason: 'not_configured' }
  }

  const user = await getSupabaseUser()
  if (!user) {
    return { ok: false, reason: 'not_authenticated' }
  }

  const row = workspaceToCloudRow(workspace, user.id)
  const { error } = await supabase.from('projects').upsert(row, { onConflict: 'id' })

  if (error) {
    return { ok: false, reason: 'error', message: error.message }
  }

  return { ok: true, synced: 1 }
}

/** Push all local workspaces to Supabase (e.g. after first login). */
export async function saveAllWorkspacesToCloud(): Promise<CloudSyncResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, reason: 'not_configured' }
  }

  const supabase = getSupabase()
  if (!supabase) {
    return { ok: false, reason: 'not_configured' }
  }

  const user = await getSupabaseUser()
  if (!user) {
    return { ok: false, reason: 'not_authenticated' }
  }

  const local = listWorkspaces()
  if (local.length === 0) {
    return { ok: true, synced: 0 }
  }

  const rows = local.map((ws) => workspaceToCloudRow(ws, user.id))
  const { error } = await supabase.from('projects').upsert(rows, { onConflict: 'id' })

  if (error) {
    return { ok: false, reason: 'error', message: error.message }
  }

  return { ok: true, synced: rows.length }
}

/** Load workspaces from Supabase for the signed-in user. */
export async function loadWorkspacesFromCloud(): Promise<CloudLoadResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, reason: 'not_configured' }
  }

  const supabase = getSupabase()
  if (!supabase) {
    return { ok: false, reason: 'not_configured' }
  }

  const user = await getSupabaseUser()
  if (!user) {
    return { ok: false, reason: 'not_authenticated' }
  }

  const { data, error } = await supabase
    .from('projects')
    .select('id, user_id, name, files_json, conversation_json, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (error) {
    return { ok: false, reason: 'error', message: error.message }
  }

  const workspaces = (data as ProjectRow[] | null)?.map(cloudRowToWorkspace) ?? []
  return { ok: true, workspaces }
}

/**
 * Merge cloud workspaces into local storage (offline-first).
 * Cloud wins when updated_at is newer; local-only rows are kept.
 */
export async function syncWorkspacesFromCloud(): Promise<CloudSyncResult> {
  const loaded = await loadWorkspacesFromCloud()
  if (!loaded.ok) return loaded

  const localById = new Map(listWorkspaces().map((ws) => [ws.id, ws]))
  let merged = 0

  for (const remote of loaded.workspaces) {
    const local = localById.get(remote.id)
    if (!local || new Date(remote.updatedAt).getTime() > new Date(local.updatedAt).getTime()) {
      upsertWorkspace(remote)
      merged += 1
    }
  }

  return { ok: true, synced: merged }
}