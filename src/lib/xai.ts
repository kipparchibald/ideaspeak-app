// xAI / Grok API client — uses same-origin /api/* on Vercel, localhost:3001 in dev

const IS_DEV = import.meta.env.DEV

function apiUrl(path: string): string {
  // Same-origin in prod and dev (Vite proxies /api → localhost:3001)
  return path
}

function apiHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  // Production uses server-hosted key only — never send client keys from the browser
  if (import.meta.env.PROD) return headers
  const key = apiKey || localStorage.getItem('ideaspeak_xai_key')
  if (key) headers['X-AI-Key'] = key
  return headers
}

export interface XaiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type GrokStatus = {
  live: boolean
  source: 'server' | 'client' | 'none'
  message?: string
  model?: string
}

let cachedStatus: GrokStatus | null = null

export async function fetchGrokStatus(): Promise<GrokStatus> {
  try {
    const res = await fetch(apiUrl('/api/status'), { headers: apiHeaders() })
    if (!res.ok) throw new Error('status failed')
    const data = await res.json()
    const clientKey = IS_DEV ? localStorage.getItem('ideaspeak_xai_key') : null
    const live = data.live || (!import.meta.env.PROD && !!clientKey)
    cachedStatus = {
      live,
      source: data.live ? 'server' : clientKey ? 'client' : 'none',
      message: data.live
        ? data.message
        : IS_DEV && clientKey
          ? 'Grok API ready via local dev key'
          : data.message,
      model: data.model,
    }
    return cachedStatus
  } catch {
    const clientKey = IS_DEV ? localStorage.getItem('ideaspeak_xai_key') : null
    cachedStatus = {
      live: !!clientKey,
      source: clientKey ? 'client' : 'none',
      message: IS_DEV
        ? 'Run `bun run dev:full` and `bun run setup:grok` for local Grok'
        : 'Grok API is configured on the server — check Vercel env on ideaspeak-app',
    }
    return cachedStatus
  }
}

export function getCachedGrokStatus(): GrokStatus | null {
  return cachedStatus
}

export function normalizeProjectFiles(
  files: Record<string, string | { code: string }>
): Record<string, { code: string }> {
  const out: Record<string, { code: string }> = {}
  for (const [path, val] of Object.entries(files || {})) {
    out[path] = typeof val === 'string' ? { code: val } : { code: val?.code || '' }
  }
  if (!out['src/main.tsx']) {
    out['src/main.tsx'] = {
      code: `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App'\nimport './index.css'\n\nReactDOM.createRoot(document.getElementById('root')!).render(<App />)`,
    }
  }
  if (!out['src/index.css'] && !out['/src/index.css']) {
    out['src/index.css'] = {
      code: `@import "tailwindcss";\nbody { background: #0a0a0f; color: #e8e8f0; margin: 0; font-family: Inter, system-ui, sans-serif; }`,
    }
  }
  return out
}

export async function runIdeaSpeakAgent(
  transcript: string,
  history: unknown[],
  apiKey?: string
): Promise<{ brief: Record<string, unknown>; optimizedPrompt: string; plan?: string; rawResponse?: string; structured?: unknown }> {
  try {
    const res = await fetch(apiUrl('/api/refine'), {
      method: 'POST',
      headers: apiHeaders(apiKey),
      body: JSON.stringify({ transcript, history }),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `Refine error ${res.status}`)

    if (data.parsed) {
      return {
        brief: data.parsed.brief || {},
        optimizedPrompt: data.parsed.optimizedPrompt || transcript,
        plan: data.parsed.plan,
        rawResponse: data.content,
        structured: data.parsed,
      }
    }
    throw new Error('No structured refine response')
  } catch (e) {
    console.warn('Backend refine failed:', e)
    throw e
  }
}

export async function generateWithLLM(
  transcript: string,
  brief: Record<string, unknown> | null,
  apiKey?: string,
  personality: string = 'grok'
): Promise<{ files: Record<string, { code: string }>; name: string; plan: string; raw: string }> {
  const res = await fetch(apiUrl('/api/build'), {
    method: 'POST',
    headers: apiHeaders(apiKey),
    body: JSON.stringify({ transcript, brief, personality }),
    signal: AbortSignal.timeout(115000),
  })

  if (res.status === 504) {
    throw new Error('Build timed out — try again or export and refine in Cursor/Grok')
  }

  let data: { error?: string; content?: string; parsed?: { files?: Record<string, string>; name?: string; plan?: string } }
  try {
    data = await res.json()
  } catch {
    throw new Error(`Build error ${res.status} — invalid response`)
  }

  if (!res.ok) throw new Error(data.error || `Build error ${res.status}`)

  if (data.parsed?.files) {
    return {
      files: normalizeProjectFiles(data.parsed.files),
      name: data.parsed.name || 'IdeaSpeak App',
      plan: data.parsed.plan || 'LLM generated',
      raw: data.content || '',
    }
  }
  throw new Error('Build returned no parseable files — try again')
}

export async function discussWithGrok(
  messages: XaiMessage[],
  apiKey?: string,
  image?: string | null,
  personality: string = 'grok',
  voiceMode?: boolean
): Promise<string> {
  try {
    const res = await fetch(apiUrl('/api/discuss'), {
      method: 'POST',
      headers: apiHeaders(apiKey),
      body: JSON.stringify({ messages, image, personality, voiceMode }),
    })

    const data = await res.json()
    if (!res.ok) {
      // Missing/invalid key — always fall back so voice chat still responds
      if (res.status === 401 || res.status === 403) {
        console.warn('Discuss auth failed, using conversational fallback')
        return simulateDiscuss(messages, personality, voiceMode)
      }
      throw new Error(data.error || `Discuss error ${res.status}`)
    }
    return data.content || "The agent didn't return a response."
  } catch (e) {
    const live = getCachedGrokStatus()?.live
    if (live) {
      console.warn('Discuss call failed while Grok live:', e)
      throw e
    }
    console.warn('Discuss offline, using fallback:', e)
    return simulateDiscuss(messages, personality, voiceMode)
  }
}

export async function generateImage(
  prompt: string,
  apiKey?: string
): Promise<{ url: string; revised_prompt?: string }> {
  const res = await fetch(apiUrl('/api/image'), {
    method: 'POST',
    headers: apiHeaders(apiKey),
    body: JSON.stringify({ prompt }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Image gen failed')
  if (data.data?.[0]) {
    return { url: data.data[0].url, revised_prompt: data.data[0].revised_prompt }
  }
  throw new Error('No image returned')
}

function simulateDiscuss(
  messages: XaiMessage[],
  _personality: string,
  voiceMode?: boolean
): string {
  const lastUser = messages.filter((m) => m.role === 'user').pop()?.content || ''
  const snippet = lastUser.slice(0, 60).trim()
  if (voiceMode) {
    return snippet
      ? `Okay — "${snippet}" — we can ship a tight v1 that looks legit. What's the one daily action users take?`
      : `Walk me through it — we'll scope something buildable today that'll surprise you. What's the one-liner?`
  }
  return `(offline) On "${snippet || 'your idea'}" — who's the user, what's the #1 job, and what would make v1 feel impressive?`
}