// E2B real sandbox client — calls Bun backend routes (Railway in prod, Vite proxy locally)

export type SandboxStatus =
  | 'stub'
  | 'creating'
  | 'installing'
  | 'starting'
  | 'ready'
  | 'error'

export interface SandboxSession {
  sandboxId: string
  projectId: string
  previewUrl: string | null
  status: SandboxStatus
  logs: string[]
  isStub: boolean
  error?: string
}

function apiBase(path: string): string {
  if (typeof window !== 'undefined') return path
  const base = process.env.IDEASPEAK_API || 'http://localhost:3001'
  return `${base.replace(/\/$/, '')}${path}`
}

async function sandboxFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; data: T; status: number }> {
  const res = await fetch(apiBase(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const data = (await res.json().catch(() => ({}))) as T
  return { ok: res.ok, data, status: res.status }
}

/** Check if server has E2B configured */
export async function checkSandboxAvailable(): Promise<boolean> {
  try {
    const res = await fetch(apiBase('/api/status'))
    const data = await res.json().catch(() => ({} as { features?: { e2b?: boolean } }))
    return !!data?.features?.e2b
  } catch {
    return false
  }
}

export async function createSandbox(
  projectId: string,
  files: Record<string, string>,
): Promise<SandboxSession> {
  const { ok, data, status } = await sandboxFetch<SandboxSession>('/api/sandbox/create', {
    method: 'POST',
    body: JSON.stringify({ projectId, files }),
  })
  if (!ok) {
    throw new Error((data as { error?: string })?.error || `Sandbox create failed (${status})`)
  }
  return data
}

export async function syncSandboxFiles(
  sandboxId: string,
  files: Record<string, string>,
): Promise<SandboxSession> {
  const { ok, data, status } = await sandboxFetch<SandboxSession>('/api/sandbox/sync', {
    method: 'POST',
    body: JSON.stringify({ sandboxId, files }),
  })
  if (!ok) {
    throw new Error((data as { error?: string })?.error || `Sandbox sync failed (${status})`)
  }
  return data
}

export async function getSandboxPreview(sandboxId: string): Promise<{
  previewUrl: string | null
  status: SandboxStatus
  logs: string[]
}> {
  const { ok, data, status } = await sandboxFetch<{
    previewUrl: string | null
    status: SandboxStatus
    logs: string[]
  }>('/api/sandbox/preview', {
    method: 'POST',
    body: JSON.stringify({ sandboxId }),
  })
  if (!ok) {
    throw new Error((data as { error?: string })?.error || `Sandbox preview failed (${status})`)
  }
  return data
}

export async function runSandboxCommand(
  sandboxId: string,
  command: string,
): Promise<{ output: string; exitCode: number; error?: string }> {
  const { ok, data, status } = await sandboxFetch<{
    output: string
    exitCode: number
    error?: string
  }>('/api/sandbox/run', {
    method: 'POST',
    body: JSON.stringify({ sandboxId, command }),
  })
  if (!ok) {
    throw new Error((data as { error?: string })?.error || `Sandbox run failed (${status})`)
  }
  return data
}

export async function destroySandbox(sandboxId: string): Promise<void> {
  await sandboxFetch('/api/sandbox/destroy', {
    method: 'DELETE',
    body: JSON.stringify({ sandboxId }),
  })
}

/** Poll until sandbox is ready or errors out */
export async function waitForSandboxReady(
  sandboxId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<string | null> {
  const intervalMs = opts.intervalMs ?? 2000
  const timeoutMs = opts.timeoutMs ?? 180_000
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    const { previewUrl, status } = await getSandboxPreview(sandboxId)
    if (status === 'ready' && previewUrl) return previewUrl
    if (status === 'error' || status === 'stub') return previewUrl
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return null
}