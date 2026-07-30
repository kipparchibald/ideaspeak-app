/**
 * Grok Build — xAI coding model via Responses API (+ chat completions fallback).
 * Model: grok-build-0.1 (agentic coding; powers Grok Build CLI)
 * Docs: https://docs.x.ai/build/overview · https://x.ai/news/grok-build-0-1
 */

export const GROK_BUILD_MODEL =
  process.env.XAI_BUILD_MODEL?.trim() || 'grok-build-0.1'

export const GROK_BUILD_FALLBACK =
  process.env.XAI_BUILD_FALLBACK?.trim() || 'grok-4.5'

/** Extract plain text from /v1/responses body (several shapes across SDK versions) */
export function extractResponsesText(data) {
  if (!data || typeof data !== 'object') return ''
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim()
  }
  const output = data.output
  if (Array.isArray(output)) {
    const chunks = []
    for (const item of output) {
      if (!item) continue
      if (typeof item === 'string') {
        chunks.push(item)
        continue
      }
      if (item.type === 'message' && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (!c) continue
          if (typeof c === 'string') chunks.push(c)
          else if (c.type === 'output_text' && c.text) chunks.push(c.text)
          else if (c.type === 'text' && c.text) chunks.push(c.text)
          else if (typeof c.text === 'string') chunks.push(c.text)
        }
      }
      if (item.type === 'output_text' && item.text) chunks.push(item.text)
      if (typeof item.text === 'string') chunks.push(item.text)
    }
    if (chunks.length) return chunks.join('\n').trim()
  }
  // Rare: choices-style wrap
  const choice = data.choices?.[0]?.message?.content
  if (typeof choice === 'string') return choice.trim()
  return ''
}

/**
 * Preferred path: Responses API with Grok Build model.
 * @returns {{ content: string, model: string, api: 'responses' | 'chat', raw: unknown }}
 */
export async function callGrokBuild(apiKey, { system, user, maxTokens = 12000, temperature = 0.4 }) {
  const models = [GROK_BUILD_MODEL, GROK_BUILD_FALLBACK].filter(
    (m, i, a) => m && a.indexOf(m) === i,
  )

  let lastErr = 'Grok Build unavailable'

  for (const model of models) {
    // 1) Responses API (canonical for grok-build-0.1)
    try {
      const res = await fetch('https://api.x.ai/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          instructions: system,
          input: [
            {
              role: 'user',
              content: user,
            },
          ],
          max_output_tokens: maxTokens,
          temperature,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        const content = extractResponsesText(data)
        if (content) {
          return { content, model, api: 'responses', raw: data }
        }
        lastErr = 'Empty response from Responses API'
      } else {
        lastErr =
          (typeof data?.error === 'string' && data.error) ||
          data?.error?.message ||
          `Responses API ${res.status}`
      }
    } catch (e) {
      lastErr = e?.message || 'Responses API network error'
    }

    // 2) Chat completions fallback (same model id when supported)
    try {
      const body = {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: maxTokens,
        temperature,
      }
      // grok-4.x may accept reasoning_effort; grok-build typically does not
      if (String(model).includes('grok-4')) {
        body.reasoning_effort = 'low'
      }
      const res = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        const content =
          data.choices?.[0]?.message?.content ||
          data.choices?.[0]?.message?.reasoning_content ||
          ''
        if (content) {
          return { content: String(content).trim(), model, api: 'chat', raw: data }
        }
        lastErr = 'Empty chat completion'
      } else {
        lastErr =
          (typeof data?.error === 'string' && data.error) ||
          data?.error?.message ||
          `Chat API ${res.status}`
      }
    } catch (e) {
      lastErr = e?.message || 'Chat API network error'
    }
  }

  throw new Error(lastErr)
}
