import { buildDiscussSystem, humanizeVoiceReply, voicePrimingMessages } from './prompts.js'
import { chatCompletion, getApiKey, xaiError } from './xai.js'
import { resolveDiscussReasoningEffort } from './reasoning.js'
import { corsHeaders, rejectBlockedOrigin, enforceRateLimit } from './security.js'
import {
  edgeErrorResponse,
  getOrCreateRequestId,
  lastUserMessage,
  requestIdHeaders,
} from './observability.js'

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

  const { messages, image, personality = 'grok', voiceMode } = await req.json()

  const isVoice = !!voiceMode
  const fullMessages = [
    { role: 'system', content: buildDiscussSystem(personality, isVoice) },
    ...(isVoice ? voicePrimingMessages() : []),
    ...messages,
  ]

  if (image && messages.length > 0) {
    const last = fullMessages[fullMessages.length - 1]
    if (last.role === 'user') {
      last.content = [
        { type: 'text', text: typeof last.content === 'string' ? last.content : '' },
        { type: 'image_url', image_url: { url: image } },
      ]
    }
  }

  const { ok, status, data } = await chatCompletion(apiKey, {
    messages: fullMessages,
    temperature: isVoice ? 0.95 : 0.85,
    maxTokens: isVoice ? 180 : 1200,
    reasoningEffort: resolveDiscussReasoningEffort(messages),
  })

  if (!ok) {
    return edgeErrorResponse(req, corsHeaders, {
      requestId,
      status: 500,
      error: xaiError(data),
      route: '/api/discuss',
      kind: 'discuss',
      sample: lastUserMessage(messages),
      messageCount: messages?.length ?? 0,
      xaiStatus: status,
      rateHeaders,
      durationMs: Date.now() - startedAt,
    })
  }

  let content =
    data.choices?.[0]?.message?.content ||
    data.choices?.[0]?.message?.reasoning_content ||
    ''
  if (typeof content !== 'string') content = ''
  content = content.trim()

  if (voiceMode && content) {
    content = humanizeVoiceReply(content)
  }

  if (!content) {
    return edgeErrorResponse(req, corsHeaders, {
      requestId,
      status: 502,
      error: 'Empty model response — try again or check model access',
      route: '/api/discuss',
      kind: 'discuss',
      sample: lastUserMessage(messages),
      messageCount: messages?.length ?? 0,
      rateHeaders,
      durationMs: Date.now() - startedAt,
    })
  }

  return new Response(JSON.stringify({ content, voiceMode: !!voiceMode, requestId }), {
    headers: { ...baseHeaders, ...rateHeaders, 'Content-Type': 'application/json' },
  })
}