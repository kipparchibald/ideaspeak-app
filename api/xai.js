/** Shared xAI client for Edge API routes */

import { jsonrepair } from 'jsonrepair'

export const MODELS = {
  // Prefer fast chat models that accept max_tokens cleanly
  chat: process.env.XAI_CHAT_MODEL || 'grok-3',
  build: process.env.XAI_BUILD_MODEL || 'grok-4.5',
}

/** Chat Completions body for IdeaSpeak build — grok-4.x uses low reasoning for speed */
export function buildModelRequestBody({ messages, maxTokens = 8000, temperature = 0.55 }) {
  const body = {
    model: MODELS.build,
    messages,
    max_tokens: maxTokens,
    temperature,
  }
  if (String(MODELS.build).includes('grok-4')) {
    body.reasoning_effort = 'low'
  }
  return body
}

function readHeaderKey(req) {
  const key =
    req?.headers?.get?.('x-ai-key') ||
    req?.headers?.get?.('X-AI-Key') ||
    req?.headers?.['x-ai-key'] ||
    req?.headers?.['X-AI-Key']
  return typeof key === 'string' ? key.trim() : ''
}

/**
 * Resolve API key:
 * - Production: server XAI_API_KEY only (never trust browser keys)
 * - Local/dev: prefer Settings key (X-AI-Key header), then .env.local
 */
export function getApiKey(req) {
  const serverKey = process.env.XAI_API_KEY?.trim() || ''
  const clientKey = readHeaderKey(req)

  if (process.env.VERCEL_ENV === 'production') {
    return serverKey
  }

  // Local: client Settings key first so a bad .env.local can't block a good key
  return clientKey || serverKey
}

export function hasServerApiKey() {
  return !!process.env.XAI_API_KEY?.trim()
}

export function xaiError(data, fallback = 'xAI error') {
  if (typeof data?.error === 'string') return data.error
  return data?.error?.message || fallback
}

/**
 * Chat completion — grok-4.3 reasoning model.
 * Never pass frequency_penalty / presence_penalty (rejected by reasoning models).
 */
export async function chatCompletion(apiKey, {
  messages,
  maxTokens = 1200,
  temperature = 0.75,
  reasoningEffort = 'low',
}) {
  const body = {
    model: MODELS.chat,
    messages,
    max_tokens: maxTokens,
    temperature,
  }
  // Only attach reasoning_effort for models that support it
  if (reasoningEffort && String(MODELS.chat).includes('grok-4')) {
    body.reasoning_effort = reasoningEffort
  }

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  return { ok: res.ok, status: res.status, data }
}

export async function buildCompletion(apiKey, { messages, maxTokens = 8000, temperature = 0.55 }) {
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildModelRequestBody({ messages, maxTokens, temperature })),
  })

  const data = await res.json()
  return { ok: res.ok, status: res.status, data }
}

/** Extract JSON object from LLM output (fences + jsonrepair for truncated/malformed JSON) */
export function parseJsonFromContent(content) {
  if (!content) return null
  let text = content.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0])
  } catch {
    try {
      return JSON.parse(jsonrepair(m[0]))
    } catch {
      return null
    }
  }
}

/** Lightweight ping to verify key + model access */
export async function pingXai(apiKey) {
  return chatCompletion(apiKey, {
    messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
    maxTokens: 8,
    temperature: 0,
    reasoningEffort: 'none',
  })
}