import { buildChiefSystem } from '../chief-prompts.js'
import { chiefIntegrationStatus, requireChiefSession } from '../chief-auth.js'
import { chatCompletion, getApiKey, xaiError } from '../xai.js'
import { resolveDiscussReasoningEffort } from '../reasoning.js'
import { corsHeaders, rejectBlockedOrigin, enforceRateLimit } from '../security.js'
import {
  edgeErrorResponse,
  getOrCreateRequestId,
  lastUserMessage,
  requestIdHeaders,
} from '../observability.js'
import { humanizeVoiceReply } from '../prompts.js'

export const config = { runtime: 'edge', maxDuration: 60 }

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

  const gate = await requireChiefSession(req)
  if (!gate.ok) {
    return new Response(JSON.stringify({ error: gate.error, requestId }), {
      status: gate.status,
      headers: { ...baseHeaders, 'Content-Type': 'application/json' },
    })
  }

  const apiKey = getApiKey(req)
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Grok API not configured on server', requestId }),
      { status: 401, headers: { ...baseHeaders, 'Content-Type': 'application/json' } },
    )
  }

  const { messages, voiceMode } = await req.json()
  const integration = chiefIntegrationStatus()
  const isVoice = !!voiceMode

  const fullMessages = [
    { role: 'system', content: buildChiefSystem(integration, isVoice) },
    ...messages,
  ]

  const { ok, status, data } = await chatCompletion(apiKey, {
    messages: fullMessages,
    temperature: isVoice ? 0.85 : 0.75,
    maxTokens: isVoice ? 200 : 900,
    reasoningEffort: resolveDiscussReasoningEffort(messages),
  })

  if (!ok) {
    return edgeErrorResponse(req, corsHeaders, {
      requestId,
      status: 500,
      error: xaiError(data),
      route: '/api/chief/discuss',
      kind: 'chief-discuss',
      sample: lastUserMessage(messages),
      messageCount: messages?.length ?? 0,
      xaiStatus: status,
      rateHeaders,
      durationMs: Date.now() - startedAt,
    })
  }

  let content =
    data?.choices?.[0]?.message?.content ||
    data?.choices?.[0]?.message?.reasoning_content ||
    ''

  if (isVoice) content = humanizeVoiceReply(content)

  return new Response(
    JSON.stringify({ content, requestId, integration }),
    {
      headers: {
        ...baseHeaders,
        ...rateHeaders,
        'Content-Type': 'application/json',
      },
    },
  )
}
