import { jsonrepair } from 'jsonrepair'
import { BUILD_SYSTEM } from './build-prompt.js'

/** Node runtime — grok-build needs >60s; Edge times out */
export const config = { maxDuration: 120 }

const MODEL = 'grok-build-0.1'

function getApiKey(req) {
  const key = req.headers['x-ai-key'] || req.headers['X-AI-Key'] || process.env.XAI_API_KEY
  return typeof key === 'string' ? key.trim() : ''
}

function parseJson(content) {
  if (!content) return null
  let t = content.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  const m = t.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    return JSON.parse(m[0])
  } catch {
    try {
      return JSON.parse(jsonrepair(m[0]))
    } catch {
      return null
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-AI-Key')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = getApiKey(req)
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing X-AI-Key' })
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
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: BUILD_SYSTEM + personalityNote },
          { role: 'user', content: user },
        ],
        temperature: 0.55,
        max_tokens: 5000,
      }),
    })

    const data = await upstream.json()
    if (!upstream.ok) {
      const err = data?.error?.message || data?.error || 'xAI error'
      return res.status(500).json({ error: err })
    }

    const content = data.choices?.[0]?.message?.content || ''
    const parsed = parseJson(content)
    return res.status(200).json({ content, parsed })
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Build failed' })
  }
}