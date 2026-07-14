/** Localhost Vite preview — iframe to real dev server (:5174, proxied as /preview). */

export interface LocalPreviewSession {
  previewUrl: string
  proxyPath: string
  ready: boolean
  port: number
  error?: string | null
}

function apiBase(path: string): string {
  if (typeof window !== 'undefined') return path
  const base = process.env.IDEASPEAK_API || 'http://localhost:3001'
  return `${base.replace(/\/$/, '')}${path}`
}

/** True when IdeaSpeak shell is running on localhost (local preview available). */
export function isLocalPreviewHost(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1'
}

/** iframe src — same-origin /preview proxy in dev, direct URL as fallback */
export function localPreviewIframeSrc(session?: LocalPreviewSession | null): string {
  if (typeof window === 'undefined') return session?.previewUrl || 'http://localhost:5174'
  if (isLocalPreviewHost()) {
    return `${window.location.origin}${session?.proxyPath || '/preview/'}`
  }
  return session?.previewUrl || 'http://localhost:5174'
}

export async function syncLocalPreview(
  files: Record<string, string>,
): Promise<LocalPreviewSession> {
  const res = await fetch(apiBase('/api/local-preview/sync'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
    signal: AbortSignal.timeout(45_000),
  })
  const data = await res.json().catch(() => ({} as LocalPreviewSession & { error?: string }))
  if (!res.ok) {
    throw new Error(data.error || `Local preview sync failed (${res.status})`)
  }
  return data as LocalPreviewSession
}

export async function waitForLocalPreviewReady(timeoutMs = 25_000): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(apiBase('/api/local-preview/status'), {
        signal: AbortSignal.timeout(5000),
      })
      const data = (await res.json()) as { ready?: boolean; previewUrl?: string }
      if (data.ready && data.previewUrl) return data.previewUrl
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 450))
  }
  return null
}