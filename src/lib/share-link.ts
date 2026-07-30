/**
 * Shareable build / plan links — local-first, no server required.
 * Encodes a slim workspace into ?share=… (base64url JSON).
 * Oversized builds drop file bodies and keep plan + conversation.
 */

import type { ProjectFile, SavedWorkspace, WorkspaceStatus } from './projects'
import { upsertWorkspace } from './projects'

const SHARE_VERSION = 1 as const
/** Stay under common URL length limits (~8–16k); leave headroom for origin */
const MAX_ENCODED_CHARS = 12_000
const MAX_MESSAGES = 16
const MAX_FILE_CHARS = 48_000

export interface SharePayloadV1 {
  v: typeof SHARE_VERSION
  name: string
  summary: string
  status: WorkspaceStatus
  mode: 'discuss' | 'build'
  conversation: { role: 'user' | 'assistant'; content: string }[]
  planReady?: boolean
  lastBuildPlan?: string
  personality?: string
  /** Relative path → source (optional when payload too large) */
  files?: Record<string, string>
  hasFiles?: boolean
}

function toBase64Url(raw: string): string {
  const bytes = new TextEncoder().encode(raw)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(encoded: string): string {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  const bin = atob(b64 + pad)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

function projectFilesToMap(files: ProjectFile | null | undefined): Record<string, string> {
  if (!files) return {}
  const out: Record<string, string> = {}
  let total = 0
  for (const [path, entry] of Object.entries(files)) {
    const code = entry?.code
    if (typeof code !== 'string' || !code.trim()) continue
    if (total + code.length > MAX_FILE_CHARS) break
    out[path] = code
    total += code.length
  }
  return out
}

function slimConversation(ws: SavedWorkspace): SharePayloadV1['conversation'] {
  const msgs = ws.conversation
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content.slice(0, 2000),
    }))
  return msgs.slice(-MAX_MESSAGES)
}

export function workspaceToSharePayload(ws: SavedWorkspace): SharePayloadV1 {
  const files = projectFilesToMap(ws.currentProject?.files)
  return {
    v: SHARE_VERSION,
    name: ws.name.slice(0, 80),
    summary: (ws.summary || '').slice(0, 240),
    status: ws.status,
    mode: ws.mode,
    conversation: slimConversation(ws),
    planReady: ws.planReady,
    lastBuildPlan: (ws.lastBuildPlan || ws.buildPlan?.oneLiner || '').slice(0, 800),
    personality: ws.selectedPersonality,
    files: Object.keys(files).length > 0 ? files : undefined,
    hasFiles: Object.keys(files).length > 0 || !!ws.currentProject?.files,
  }
}

export function encodeSharePayload(payload: SharePayloadV1): string {
  let body = payload
  let encoded = toBase64Url(JSON.stringify(body))
  if (encoded.length > MAX_ENCODED_CHARS && body.files) {
    body = { ...body, files: undefined }
    encoded = toBase64Url(JSON.stringify(body))
  }
  if (encoded.length > MAX_ENCODED_CHARS) {
    body = {
      ...body,
      conversation: body.conversation.slice(-6).map((m) => ({
        ...m,
        content: m.content.slice(0, 400),
      })),
      lastBuildPlan: (body.lastBuildPlan || '').slice(0, 200),
    }
    encoded = toBase64Url(JSON.stringify(body))
  }
  return encoded
}

export function decodeSharePayload(encoded: string): SharePayloadV1 | null {
  try {
    const raw = fromBase64Url(encoded.trim())
    const data = JSON.parse(raw) as SharePayloadV1
    if (data?.v !== SHARE_VERSION || !data.name || !Array.isArray(data.conversation)) {
      return null
    }
    return data
  } catch {
    return null
  }
}

/** Build absolute share URL for the current origin */
export function buildShareUrl(ws: SavedWorkspace, origin = typeof window !== 'undefined' ? window.location.origin : ''): string {
  const encoded = encodeSharePayload(workspaceToSharePayload(ws))
  const base = origin || 'https://ideaspeak-app.vercel.app'
  return `${base.replace(/\/$/, '')}/?share=${encoded}`
}

export async function copyShareLink(ws: SavedWorkspace): Promise<{ url: string; truncated: boolean }> {
  const payload = workspaceToSharePayload(ws)
  const withFiles = Boolean(payload.files && Object.keys(payload.files).length > 0)
  const encoded = encodeSharePayload(payload)
  const decoded = decodeSharePayload(encoded)
  const truncated = withFiles && !decoded?.files
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://ideaspeak-app.vercel.app'
  const url = `${origin.replace(/\/$/, '')}/?share=${encoded}`
  await navigator.clipboard.writeText(url)
  return { url, truncated }
}

/** Convert share payload into a SavedWorkspace and persist locally */
export function importSharePayload(payload: SharePayloadV1): SavedWorkspace {
  const now = new Date().toISOString()
  const files: ProjectFile = {}
  if (payload.files) {
    for (const [path, code] of Object.entries(payload.files)) {
      files[path] = { code }
    }
  }

  const conversation = payload.conversation.map((m, i) => ({
    id: `share-${Date.now().toString(36)}-${i}`,
    role: m.role,
    content: m.content,
  }))

  const hasBuilt =
    payload.status === 'built' ||
    Object.keys(files).length > 0 ||
    Boolean(payload.hasFiles && Object.keys(files).length > 0)

  const ws: SavedWorkspace = {
    id: `ws-share-${Date.now().toString(36)}`,
    name: payload.name || 'Shared idea',
    summary: payload.summary || 'Opened from a share link',
    status: hasBuilt ? 'built' : payload.status === 'planned' ? 'planned' : payload.status,
    mode: payload.mode || (hasBuilt ? 'build' : 'discuss'),
    createdAt: now,
    updatedAt: now,
    conversation,
    transcript: conversation.map((m) => `${m.role}: ${m.content}`).join('\n').slice(0, 8000),
    buildPlan: null,
    currentProject:
      Object.keys(files).length > 0
        ? {
            id: `proj-share-${Date.now().toString(36)}`,
            name: payload.name,
            brief: { vision: payload.summary },
            optimizedPrompt: payload.lastBuildPlan || '',
            files,
            transcript: payload.summary,
          }
        : null,
    selectedPersonality: payload.personality || 'grok',
    proactiveSuggestions: [],
    planReady: payload.planReady ?? payload.status !== 'discussing',
    lastBuildPlan: payload.lastBuildPlan,
  }

  return upsertWorkspace(ws)
}

/** Read ?share= from the current location (search or hash) */
export function readShareParamFromLocation(
  search = typeof window !== 'undefined' ? window.location.search : '',
  hash = typeof window !== 'undefined' ? window.location.hash : '',
): string | null {
  try {
    const qs = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    const fromQuery = qs.get('share')
    if (fromQuery?.trim()) return fromQuery.trim()

    if (hash.includes('share=')) {
      const h = hash.startsWith('#') ? hash.slice(1) : hash
      const hs = new URLSearchParams(h.includes('=') ? h : h.replace(/^share/, 'share'))
      const fromHash = hs.get('share')
      if (fromHash?.trim()) return fromHash.trim()
    }
  } catch {
    /* ignore */
  }
  return null
}

export function clearShareParamFromUrl() {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('share') && !url.hash.includes('share=')) return
    url.searchParams.delete('share')
    if (url.hash.includes('share=')) url.hash = ''
    window.history.replaceState({}, '', url.pathname + url.search + url.hash)
  } catch {
    /* ignore */
  }
}
