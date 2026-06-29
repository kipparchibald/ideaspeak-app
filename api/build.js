import { buildCompletion, getApiKey, xaiError } from './xai.js'

export const config = { runtime: 'edge', maxDuration: 60 }

const BUILD_SYSTEM = `You are IdeaSpeak xAI build agent — production-obsessed, Linear/Stripe/Arc taste.
Output ONLY valid JSON (no markdown fences):
{
  "name": "Short App Name",
  "plan": "2-3 sentence plan with wow moment and v1 scope",
  "files": {
    "src/App.tsx": "complete React 19 TSX with Tailwind classes",
    "src/index.css": "CSS with semantic design tokens, dark premium theme",
    "src/main.tsx": "React entry",
    "src/components/Button.tsx": "reusable button component",
    "README.md": "readme with run instructions"
  }
}
At least 5 files. Each file value is complete source code string. Beautiful, accessible, production-ready.`

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  const apiKey = getApiKey(req)
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing X-AI-Key' }), { status: 401 })
  }

  const { transcript, brief, personality = 'grok' } = await req.json()
  const user = brief
    ? `Build from brief: ${JSON.stringify(brief)}`
    : `Build from idea: ${transcript}`

  const { ok, data } = await buildCompletion(apiKey, {
    messages: [
      { role: 'system', content: BUILD_SYSTEM + (personality !== 'grok' ? ` Personality: ${personality}.` : '') },
      { role: 'user', content: user },
    ],
    temperature: 0.6,
    maxTokens: 8000,
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