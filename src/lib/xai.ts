// xAI / Grok API client — uses same-origin /api/* on Vercel, localhost:3001 in dev

const DEV_API = 'http://localhost:3001'
const IS_DEV = import.meta.env.DEV

function apiUrl(path: string): string {
  const base = IS_DEV ? DEV_API : ''
  return `${base}${path}`
}

function apiHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
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
}

let cachedStatus: GrokStatus | null = null

export async function fetchGrokStatus(): Promise<GrokStatus> {
  try {
    const res = await fetch(apiUrl('/api/status'))
    if (!res.ok) throw new Error('status failed')
    const data = await res.json()
    const clientKey = localStorage.getItem('ideaspeak_xai_key')
    cachedStatus = {
      live: data.live || !!clientKey,
      source: data.live ? 'server' : clientKey ? 'client' : 'none',
      message: data.message,
    }
    return cachedStatus
  } catch {
    const clientKey = localStorage.getItem('ideaspeak_xai_key')
    cachedStatus = {
      live: !!clientKey,
      source: clientKey ? 'client' : 'none',
      message: IS_DEV
        ? 'Run `bun run dev:full` for local Grok proxy, or add key in Settings'
        : 'Add XAI_API_KEY to Vercel or paste key in Settings',
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
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Build error ${res.status}`)

  if (data.parsed?.files) {
    return {
      files: normalizeProjectFiles(data.parsed.files),
      name: data.parsed.name || 'IdeaSpeak App',
      plan: data.parsed.plan || 'LLM generated',
      raw: data.content,
    }
  }
  throw new Error('No structured files from LLM')
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
    if (!res.ok) throw new Error(data.error || `Discuss error ${res.status}`)
    return data.content || "The agent didn't return a response."
  } catch (e) {
    console.warn('Discuss call failed, using simulator:', e)
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
  personality: string,
  voiceMode?: boolean
): string {
  const lastUser = messages.filter((m) => m.role === 'user').pop()?.content || ''
  const prefix = `(simulator — add XAI_API_KEY on Vercel or key in Settings) `
  if (voiceMode) {
    return `${prefix}I hear you on "${lastUser.slice(0, 70)}". What's the core user problem this solves, and what's the riskiest assumption?`
  }
  return `${prefix}Let's vet "${lastUser.slice(0, 100)}". What's the core problem, who is it for, and what would make v1 genuinely impressive?`
}