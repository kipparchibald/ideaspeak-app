export const config = { runtime: 'edge', maxDuration: 60 }

const MODEL = 'grok-build-0.1'

const BUILD_SYSTEM = `You are IdeaSpeak build agent. Output ONLY raw JSON, no markdown.
{"name":"App Name","plan":"one sentence","files":{"src/App.tsx":"complete React 19 TSX Tailwind dark UI","src/index.css":"design tokens","src/main.tsx":"entry","README.md":"readme"}}
Exactly 4 files. Compact, production-quality vertical slice.`

function getApiKey(req) {
  const key = req.headers.get('x-ai-key') || req.headers.get('X-AI-Key') || process.env.XAI_API_KEY
  return typeof key === 'string' ? key.trim() : ''
}

function parseJson(content) {
  if (!content) return null
  let t = content.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  const m = t.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  const apiKey = getApiKey(req)
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing X-AI-Key' }), { status: 401 })
  }

  const { transcript, brief } = await req.json()
  const user = brief
    ? `Build tight v1: ${JSON.stringify(brief)}`
    : `Build tight v1: ${transcript}`

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: BUILD_SYSTEM },
        { role: 'user', content: user },
      ],
      temperature: 0.5,
      max_tokens: 3200,
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    const err = data?.error?.message || data?.error || 'xAI error'
    return new Response(JSON.stringify({ error: err }), { status: 500 })
  }

  const content = data.choices?.[0]?.message?.content || ''
  const parsed = parseJson(content)

  return new Response(JSON.stringify({ content, parsed }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}