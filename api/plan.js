import { PLAN_SYSTEM } from './plan-prompt.js'
import { chatCompletion, getApiKey, xaiError, parseJsonFromContent } from './xai.js'
import { corsHeaders, rejectBlockedOrigin } from './security.js'

export const config = { runtime: 'edge', maxDuration: 60 }

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

  const { conversation = [], personality = 'grok' } = await req.json()
  const transcript = conversation
    .filter((m) => m.role && m.content)
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n')

  if (!transcript.trim()) {
    return new Response(JSON.stringify({ error: 'Conversation required to generate plan' }), {
      status: 400,
      headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
    })
  }

  const user = `Conversation to synthesize into a multi-agent build plan:\n\n${transcript}\n\nPersonality tone for optimizedPrompt: ${personality}`

  const { ok, data } = await chatCompletion(apiKey, {
    messages: [
      { role: 'system', content: PLAN_SYSTEM },
      { role: 'user', content: user },
    ],
    temperature: 0.55,
    maxTokens: 4000,
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

  if (!parsed?.fileScaffold || !parsed?.agents?.length) {
    return new Response(
      JSON.stringify({ error: 'Plan agent returned invalid structure — try again', content }),
      { status: 502, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({
      content,
      plan: {
        ...parsed,
        id: `plan-${Date.now()}`,
        status: 'ready',
        createdAt: new Date().toISOString(),
      },
    }),
    { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } }
  )
}