import { chatCompletion, getApiKey, xaiError, parseJsonFromContent } from './xai.js'
import { corsHeaders, rejectBlockedOrigin, enforceRateLimit } from './security.js'
import {
  edgeErrorResponse,
  getOrCreateRequestId,
  requestIdHeaders,
} from './observability.js'

export const config = { runtime: 'edge', maxDuration: 60 }

const REFINE_SYSTEM = `You are the IdeaSpeak Voice Refiner. Elevate raw spoken transcripts into structured briefs.
Output ONLY valid JSON: { "brief": { "vision": "...", "users": "...", "keyFeatures": ["..."], "tech": "..." }, "optimizedPrompt": "..." }`

export default async function handler(req) {
  const requestId = getOrCreateRequestId(req)
  const startedAt = Date.now()
  const baseHeaders = { ...corsHeaders(req), ...requestIdHeaders(requestId) }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: baseHeaders })
  }

  const blocked = rejectBlockedOrigin(req)
  if (blocked) return blocked

  const { blocked: limited, headers: rateHeaders } = enforceRateLimit(req)
  if (limited) return limited

  const apiKey = getApiKey(req)
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Grok API not configured on server', requestId }),
      {
        status: 401,
        headers: { ...baseHeaders, 'Content-Type': 'application/json' },
      },
    )
  }

  const { transcript, history = [] } = await req.json()
  const user = `Raw transcript: ${transcript}\nHistory: ${history.slice(-2).map((h) => h.content).join(' | ')}`

  const { ok, status, data } = await chatCompletion(apiKey, {
    messages: [
      { role: 'system', content: REFINE_SYSTEM },
      { role: 'user', content: user },
    ],
    temperature: 0.5,
    maxTokens: 3000,
    reasoningEffort: 'low',
  })

  if (!ok) {
    return edgeErrorResponse(req, corsHeaders, {
      requestId,
      status: 500,
      error: xaiError(data),
      route: '/api/refine',
      kind: 'refine',
      transcript,
      xaiStatus: status,
      rateHeaders,
      durationMs: Date.now() - startedAt,
    })
  }

  const content = data.choices?.[0]?.message?.content || ''
  const parsed = parseJsonFromContent(content)

  return new Response(JSON.stringify({ content, parsed, requestId }), {
    headers: { ...baseHeaders, ...rateHeaders, 'Content-Type': 'application/json' },
  })
}