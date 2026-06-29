export const config = { runtime: 'edge', maxDuration: 60 }

const BUILD_SYSTEM = `You are IdeaSpeak xAI build agent. Output ONLY valid JSON:
{
  "name": "Short App Name",
  "plan": "2-3 sentence plan",
  "files": {
    "src/App.tsx": "complete React 19 TSX with Tailwind classes",
    "src/index.css": "CSS with design tokens",
    "src/main.tsx": "React entry",
    "src/components/Button.tsx": "button component",
    "README.md": "readme"
  }
}
Premium dark UI (Linear/Arc taste). At least 5 files. Each file value is complete source code string.`

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } })
  }

  const apiKey =
    req.headers.get('x-ai-key') ||
    req.headers.get('X-AI-Key') ||
    process.env.XAI_API_KEY

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing X-AI-Key' }), { status: 401 })
  }

  const { transcript, brief, personality = 'grok' } = await req.json()
  const user = brief
    ? `Build from brief: ${JSON.stringify(brief)}`
    : `Build from idea: ${transcript}`

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'grok-3',
      messages: [
        { role: 'system', content: BUILD_SYSTEM },
        { role: 'user', content: user },
      ],
      temperature: 0.6,
      max_tokens: 8000,
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