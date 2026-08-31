/** Shared xAI client for Edge API routes */

import { jsonrepair } from 'jsonrepair'
import { chatModel, buildModel } from './model-defaults.js'
import { normalizeReasoningEffort, REASONING_BUILD } from './reasoning.js'

export const MODELS = {
  /**
   * grok-4.6 — flagship reasoning for plan/discuss/refine + live preview codegen.
   * Override with XAI_CHAT_MODEL / XAI_BUILD_MODEL (e.g. grok-build-0.1 for specialist codegen).
   */
  chat: chatModel(),
  build: buildModel(),
}

/** Chat Completions body for IdeaSpeak build (fallback path when Responses API unavailable) */
export function buildModelRequestBody({ messages, maxTokens = 12000, temperature = 0.4 }) {
  const body = {
    model: MODELS.build,
    messages,
    max_tokens: maxTokens,
    temperature,
  }
  // grok-4.x accepts reasoning_effort; grok-build-* specialist models do not
  if (String(MODELS.build).includes('grok-4') && !String(MODELS.build).includes('build')) {
    body.reasoning_effort = REASONING_BUILD
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
 * Chat completion — grok-4.6 reasoning model.
 * Never pass frequency_penalty / presence_penalty (rejected by reasoning models).
 */
export async function chatCompletion(apiKey, {
  messages,
  maxTokens = 1200,
  temperature = 0.75,
  reasoningEffort = 'high',
}) {
  const body = {
    model: MODELS.chat,
    messages,
    max_tokens: maxTokens,
    temperature,
  }
  const effort = normalizeReasoningEffort(reasoningEffort)
  if (effort && String(MODELS.chat).includes('grok-4')) {
    body.reasoning_effort = effort
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
    // Omit reasoning_effort on ping — health check only
    reasoningEffort: undefined,
  })
}