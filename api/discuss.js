import { buildDiscussSystem, humanizeVoiceReply, voicePrimingMessages } from './prompts.js'
import { chatCompletion, getApiKey, xaiError } from './xai.js'
import { corsHeaders, rejectBlockedOrigin, enforceRateLimit } from './security.js'

export const config = { runtime: 'edge', maxDuration: 60 }

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }

  const blocked = rejectBlockedOrigin(req)
  if (blocked) return blocked

  const { blocked: limited, headers: rateHeaders } = enforceRateLimit(req)
  if (limited) return limited

  const apiKey = getApiKey(req)
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Grok API not configured on server' }), {
      status: 401,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
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

  const { ok, data } = await chatCompletion(apiKey, {
    messages: fullMessages,
    temperature: isVoice ? 0.95 : 0.85,
    maxTokens: isVoice ? 180 : 1200,
    reasoningEffort: isVoice ? 'none' : 'low',
  })

  if (!ok) {
    return new Response(JSON.stringify({ error: xaiError(data) }), {
      status: 500,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
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
    return new Response(
      JSON.stringify({
        error: 'Empty model response — try again or check model access',
        content: '',
      }),
      {
        status: 502,
        headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
      },
    )
  }

  return new Response(JSON.stringify({ content, voiceMode: !!voiceMode }), {
    headers: { ...corsHeaders(req), ...rateHeaders, 'Content-Type': 'application/json' },
  })
}