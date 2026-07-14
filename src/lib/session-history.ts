/**
 * Session history — auto-save plan + build state to local workspaces.
 */

import type { ProjectFile } from './projects'
import {
  captureWorkspace,
  getWorkspace,
  upsertWorkspace,
  type ConversationMessage,
  type SavedWorkspace,
} from './projects'

export interface SessionChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface SessionSnapshotInput {
  workspaceId: string | null
  messages: SessionChatMessage[]
  mode: 'discuss' | 'build'
  planReady: boolean
  hasBuilt: boolean
  generatedFiles: Record<string, string>
  lastBuiltName: string
  lastBuildPlan: string
  personality: string
}

const OPENER_SNIPPET = "Tap the mic for a real voice call"

export function isSubstantiveSession(messages: SessionChatMessage[]): boolean {
  return messages.some((m) => m.role === 'user' && m.content.trim().length > 0)
}

export function messagesToConversation(messages: SessionChatMessage[]): ConversationMessage[] {
  return messages.map((m, i) => ({
    id: `msg-${m.timestamp || Date.now()}-${i}`,
    role: m.role,
    content: m.content,
  }))
}

function filesToProject(files: Record<string, string>): ProjectFile {
  const out: ProjectFile = {}
  for (const [path, code] of Object.entries(files)) {
    if (typeof code === 'string' && code.length > 0) {
      out[path] = { code }
    }
  }
  return out
}

export function snapshotToWorkspace(input: SessionSnapshotInput): SavedWorkspace {
  const conversation = messagesToConversation(input.messages)
  const transcript = input.messages.map((m) => `${m.role}: ${m.content}`).join('\n').slice(0, 8000)

  const currentProject = input.hasBuilt
    ? {
        id: input.workspaceId || `proj-${Date.now()}`,
        name: input.lastBuiltName || 'IdeaSpeak App',
        brief: { vision: input.lastBuildPlan || transcript.slice(0, 400) },
        optimizedPrompt: input.lastBuildPlan || '',
        files: filesToProject(input.generatedFiles),
        transcript,
      }
    : null

  return captureWorkspace({
    activeWorkspaceId: input.workspaceId,
    conversation,
    transcript,
    buildPlan: null,
    currentProject,
    mode: input.mode,
    selectedPersonality: input.personality,
    proactiveSuggestions: [],
    planReady: input.planReady,
    lastBuildPlan: input.lastBuildPlan,
    hasBuilt: input.hasBuilt,
  })
}

export function persistSessionSnapshot(input: SessionSnapshotInput): SavedWorkspace | null {
  if (!isSubstantiveSession(input.messages)) return null
  const workspace = snapshotToWorkspace(input)
  return upsertWorkspace(workspace)
}

export function loadWorkspaceById(id: string): SavedWorkspace | null {
  return getWorkspace(id)
}

/** Skip restoring a blank default opener with no user turns */
export function shouldRestoreWorkspace(ws: SavedWorkspace): boolean {
  const userTurns = ws.conversation.filter((m) => m.role === 'user').length
  if (userTurns > 0) return true
  const opener = ws.conversation[0]?.content || ''
  return !opener.includes(OPENER_SNIPPET) && ws.conversation.length > 1
}