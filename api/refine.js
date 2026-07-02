import { chatCompletion, getApiKey, xaiError, parseJsonFromContent } from './xai.js'
import { corsHeaders, rejectBlockedOrigin } from './security.js'

export const config = { runtime: 'edge', maxDuration: 60 }

const REFINE_SYSTEM = `You are the IdeaSpeak Voice Refiner. Elevate raw spoken transcripts into structured briefs.
Output ONLY valid JSON: { "brief": { "vision": "...", "users": "...", "keyFeatures": ["..."], "tech": "..." }, "optimizedPrompt": "..." }`

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }

  const blocked = rejectBlockedOrigin(req)
  if (blocked) return blocked

  const apiKey = getApiKey(req)
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Grok API not configured on server' }), {
      status: 401,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  const { transcript, history = [] } = await req.json()
  const user = `Raw transcript: ${transcript}\nHistory: ${history.slice(-2).map((h) => h.content).join(' | ')}`

  const { ok, data } = await chatCompletion(apiKey, {
    messages: [
      { role: 'system', content: REFINE_SYSTEM },
      { role: 'user', content: user },
    ],
    temperature: 0.5,
    maxTokens: 3000,
    reasoningEffort: 'low',
  })

  if (!ok) {
    return new Response(JSON.stringify({ error: xaiError(data) }), {
      status: 500,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  const content = data.choices?.[0]?.message?.content || ''
  const parsed = parseJsonFromContent(content)

  return new Response(JSON.stringify({ content, parsed }), {
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  })
}