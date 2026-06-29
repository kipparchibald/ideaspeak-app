import { buildDiscussSystem, humanizeVoiceReply, voicePrimingMessages } from './prompts.js'
import { chatCompletion, getApiKey, xaiError } from './xai.js'

export const config = { runtime: 'edge', maxDuration: 60 }

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-AI-Key',
      },
    })
  }

  const apiKey = getApiKey(req)
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing X-AI-Key' }), { status: 401 })
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
    temperature: isVoice ? 0.92 : 0.78,
    maxTokens: isVoice ? 165 : 1200,
    reasoningEffort: isVoice ? 'none' : 'low',
  })

  if (!ok) {
    return new Response(JSON.stringify({ error: xaiError(data) }), { status: 500 })
  }

  let content = data.choices?.[0]?.message?.content || ''
  if (voiceMode) {
    content = humanizeVoiceReply(content)
  }

  return new Response(JSON.stringify({ content, voiceMode: !!voiceMode }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}