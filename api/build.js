import { buildCompletion, getApiKey, xaiError, parseJsonFromContent } from './xai.js'

export const config = { runtime: 'edge', maxDuration: 60 }

const BUILD_SYSTEM = `You are IdeaSpeak xAI build agent — production-obsessed, Linear/Stripe/Arc taste.
Output ONLY raw JSON. No markdown fences, no commentary before or after.

{
  "name": "Short App Name",
  "plan": "2 sentences: v1 scope + wow moment",
  "files": {
    "src/App.tsx": "complete React 19 TSX, Tailwind, premium dark UI, core loop only",
    "src/index.css": "semantic design tokens, dark theme",
    "src/main.tsx": "React entry",
    "README.md": "run instructions"
  }
}

Exactly 4 files. Focused vertical slice — complete but compact code. Ship in one pass under token budget.`

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
    ? `Build a tight v1 vertical slice from brief: ${JSON.stringify(brief)}`
    : `Build a tight v1 vertical slice from idea: ${transcript}`

  const { ok, data } = await buildCompletion(apiKey, {
    messages: [
      { role: 'system', content: BUILD_SYSTEM + (personality !== 'grok' ? ` Personality: ${personality}.` : '') },
      { role: 'user', content: user },
    ],
    temperature: 0.55,
    maxTokens: 4500,
  })

  if (!ok) {
    return new Response(JSON.stringify({ error: xaiError(data) }), { status: 500 })
  }

  const content = data.choices?.[0]?.message?.content || ''
  const parsed = parseJsonFromContent(content)

  return new Response(JSON.stringify({ content, parsed }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}