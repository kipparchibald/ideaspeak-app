export const config = { runtime: 'edge', maxDuration: 60 }

const REFINE_SYSTEM = `You are the IdeaSpeak Voice Refiner. Elevate raw spoken transcripts into structured briefs.
Output ONLY valid JSON: { "brief": { "vision": "...", "users": "...", "keyFeatures": ["..."], "tech": "..." }, "optimizedPrompt": "..." }`

export default async function handler(req) {
  const apiKey =
    req.headers.get('x-ai-key') ||
    req.headers.get('X-AI-Key') ||
    process.env.XAI_API_KEY

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing X-AI-Key' }), { status: 401 })
  }

  const { transcript, history = [] } = await req.json()
  const user = `Raw transcript: ${transcript}\nHistory: ${history.slice(-2).map((h) => h.content).join(' | ')}`

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'grok-3',
      messages: [
        { role: 'system', content: REFINE_SYSTEM },
        { role: 'user', content: user },
      ],
      temperature: 0.5,
      max_tokens: 3000,
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    return new Response(JSON.stringify({ error: data.error?.message || 'xAI error' }), { status: 500 })
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