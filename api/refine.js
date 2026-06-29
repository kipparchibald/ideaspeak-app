import { chatCompletion, getApiKey, xaiError } from './xai.js'

export const config = { runtime: 'edge', maxDuration: 60 }

const REFINE_SYSTEM = `You are the IdeaSpeak Voice Refiner. Elevate raw spoken transcripts into structured briefs.
Output ONLY valid JSON: { "brief": { "vision": "...", "users": "...", "keyFeatures": ["..."], "tech": "..." }, "optimizedPrompt": "..." }`

export default async function handler(req) {
  const apiKey = getApiKey(req)
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing X-AI-Key' }), { status: 401 })
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
    return new Response(JSON.stringify({ error: xaiError(data) }), { status: 500 })
  }

  const content = data.choices?.[0]?.message?.content || ''
  let parsed = null
  try {
    const m = content.match(/\{[\s\S]*\}/)
    parsed = m ? JSON.parse(m[0]) : null
  } catch {}

  return new Response(JSON.stringify({ content, parsed }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}