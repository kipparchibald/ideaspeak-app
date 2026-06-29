/** Shared xAI client for Edge API routes */

export const MODELS = {
  chat: 'grok-4.3',
  build: 'grok-build-0.1',
}

export function getApiKey(req) {
  const key =
    req?.headers?.get?.('x-ai-key') ||
    req?.headers?.get?.('X-AI-Key') ||
    process.env.XAI_API_KEY
  return typeof key === 'string' ? key.trim() : ''
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
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODELS.chat,
      messages,
      max_tokens: maxTokens,
      temperature,
      reasoning_effort: reasoningEffort,
    }),
  })

  const data = await res.json()
  return { ok: res.ok, status: res.status, data }
}

export async function buildCompletion(apiKey, { messages, maxTokens = 8000, temperature = 0.6 }) {
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODELS.build,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  })

  const data = await res.json()
  return { ok: res.ok, status: res.status, data }
}

/** Extract JSON object from LLM output (handles markdown fences) */
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
    return null
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