import { BUILD_SYSTEM } from './build-prompt.js'
import { buildModelRequestBody, getApiKey, MODELS, parseJsonFromContent } from './xai.js'
import { corsHeaders, isAllowedOrigin, rejectRateLimitedNode } from './security.js'

/** Node runtime — Grok 4.5 build can take 60–90s; Edge times out */
export const config = { maxDuration: 120 }

export default async function handler(req, res) {
  const cors = corsHeaders(req)
  for (const [key, value] of Object.entries(cors)) {
    res.setHeader(key, value)
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  const origin = req.headers.origin || ''
  if (origin && !isAllowedOrigin(origin)) {
    return res.status(403).json({ error: 'Forbidden origin' })
  }

  if (req.method === 'POST' && rejectRateLimitedNode(req, res)) {
    return
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = getApiKey(req)
  if (!apiKey) {
    return res.status(401).json({ error: 'Grok API not configured on server' })
  }

  const { transcript, brief, personality = 'grok' } = req.body || {}
  const user = brief
    ? `Build production v1 from this plan and brief:\n${transcript || ''}\n\nBrief: ${JSON.stringify(brief)}`
    : `Build production v1 from this discussion/plan:\n${transcript || ''}`

  const personalityNote =
    personality === 'witty' ? ' Witty code comments.' :
    personality === 'mentor' ? ' Wise mentor tone in copy.' :
    personality === 'coach' ? ' Energetic motivational UI copy.' :
    personality === 'rebel' ? ' Bold unconventional UI choices.' : ''

  try {
    const upstream = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(
        buildModelRequestBody({
          messages: [
            { role: 'system', content: BUILD_SYSTEM + personalityNote },
            { role: 'user', content: user },
          ],
          maxTokens: 8000,
          temperature: 0.55,
        }),
      ),
    })

    const data = await upstream.json()
    if (!upstream.ok) {
      const err = data?.error?.message || data?.error || 'xAI error'
      return res.status(500).json({ error: err })
    }

    const content = data.choices?.[0]?.message?.content || ''
    const parsed = parseJsonFromContent(content)
    return res.status(200).json({ content, parsed, model: MODELS.build })
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Build failed' })
  }
}